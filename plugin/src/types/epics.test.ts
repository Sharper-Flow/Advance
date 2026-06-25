/**
 * Epic schema contract tests.
 *
 * Verifies shape, validation, and backward compatibility for Advance Epics
 * schema foundation (Slice A).
 */

import { describe, expect, test } from "vitest";
import {
  ChangeSchema,
  EpicEntrySchema,
  EpicEntryKindSchema,
  EpicMembershipSchema,
  EpicProgressSummarySchema,
  EpicSchema,
  EpicStatusSchema,
  ShellPromotionProvenanceSchema,
} from "../types";

describe("Epic schema foundation", () => {
  describe("EpicStatusSchema", () => {
    test("accepts known Epic statuses", () => {
      for (const status of ["active", "completed", "archived"]) {
        expect(EpicStatusSchema.parse(status)).toBe(status);
      }
    });

    test("rejects unknown Epic status", () => {
      expect(() => EpicStatusSchema.parse("draft")).toThrow();
    });
  });

  describe("EpicEntryKindSchema", () => {
    test("accepts change and shell kinds", () => {
      expect(EpicEntryKindSchema.parse("change")).toBe("change");
      expect(EpicEntryKindSchema.parse("shell")).toBe("shell");
    });

    test("rejects unknown entry kind", () => {
      expect(() => EpicEntryKindSchema.parse("task")).toThrow();
    });
  });

  describe("ShellPromotionProvenanceSchema", () => {
    test("parses valid promotion provenance", () => {
      const provenance = {
        shell_entry_id: "sh-abc123",
        shell_title: "Add auth shell",
        shell_success_hint: "Users can log in with OAuth",
        promoted_at: "2026-06-24T00:00:00.000Z",
        promoted_by: "agent",
        change_id: "addAuthChange",
      };
      expect(ShellPromotionProvenanceSchema.parse(provenance)).toEqual(
        provenance,
      );
    });

    test("rejects missing required provenance field", () => {
      expect(() =>
        ShellPromotionProvenanceSchema.parse({
          shell_entry_id: "sh-abc123",
          promoted_at: "2026-06-24T00:00:00.000Z",
          promoted_by: "agent",
          change_id: "addAuthChange",
        }),
      ).toThrow();
    });
  });

  describe("EpicEntrySchema", () => {
    test("parses change entry with promotion provenance", () => {
      const entry = {
        kind: "change",
        entry_id: "en-abc123",
        order: 0,
        change_id: "addAuthChange",
        promotion: {
          shell_entry_id: "sh-old123",
          shell_title: "Auth shell",
          shell_success_hint: "OAuth works",
          promoted_at: "2026-06-24T00:00:00.000Z",
          promoted_by: "agent",
          change_id: "addAuthChange",
        },
      };
      expect(EpicEntrySchema.parse(entry)).toEqual(entry);
    });

    test("parses shell entry with title and success hint", () => {
      const entry = {
        kind: "shell",
        entry_id: "sh-abc123",
        order: 1,
        title: "RBAC authorization",
        success_hint: "Roles restrict access by resource",
      };
      expect(EpicEntrySchema.parse(entry)).toEqual(entry);
    });

    test("rejects shell entry missing success_hint", () => {
      expect(() =>
        EpicEntrySchema.parse({
          kind: "shell",
          entry_id: "sh-abc123",
          order: 1,
          title: "RBAC authorization",
        }),
      ).toThrow();
    });

    test("rejects change entry without change_id", () => {
      expect(() =>
        EpicEntrySchema.parse({
          kind: "change",
          entry_id: "en-abc123",
          order: 0,
        }),
      ).toThrow();
    });

    test("rejects unknown entry kind", () => {
      expect(() =>
        EpicEntrySchema.parse({
          kind: "task",
          entry_id: "en-abc123",
          order: 0,
        }),
      ).toThrow();
    });
  });

  describe("EpicProgressSummarySchema", () => {
    test("parses valid progress summary", () => {
      const summary = {
        status: "active",
        total_entries: 5,
        completed_entries: 2,
        active_entries: 2,
        next_entry_id: "en-next123",
        updated_at: "2026-06-24T00:00:00.000Z",
      };
      expect(EpicProgressSummarySchema.parse(summary)).toEqual(summary);
    });

    test("allows null next_entry_id", () => {
      const summary = {
        status: "completed",
        total_entries: 3,
        completed_entries: 3,
        active_entries: 0,
        next_entry_id: null,
        updated_at: "2026-06-24T00:00:00.000Z",
      };
      expect(EpicProgressSummarySchema.parse(summary)).toEqual(summary);
    });

    test("rejects negative counts", () => {
      expect(() =>
        EpicProgressSummarySchema.parse({
          status: "active",
          total_entries: -1,
          completed_entries: 0,
          active_entries: 0,
          next_entry_id: null,
          updated_at: "2026-06-24T00:00:00.000Z",
        }),
      ).toThrow();
    });
  });

  describe("EpicSchema", () => {
    test("parses minimal valid Epic", () => {
      const epic = {
        id: "addAuthEpic",
        title: "Add authentication Epic",
        narrative: "Enable user login and access control.",
        entries: [
          {
            kind: "change",
            entry_id: "en-001",
            order: 0,
            change_id: "addOAuthChange",
          },
          {
            kind: "shell",
            entry_id: "sh-002",
            order: 1,
            title: "RBAC authorization",
            success_hint: "Roles restrict access by resource",
          },
        ],
        progress: {
          status: "active",
          total_entries: 2,
          completed_entries: 0,
          active_entries: 1,
          next_entry_id: "en-001",
          updated_at: "2026-06-24T00:00:00.000Z",
        },
        created_at: "2026-06-24T00:00:00.000Z",
        updated_at: "2026-06-24T00:00:00.000Z",
        version: 1,
      };
      expect(EpicSchema.parse(epic)).toEqual(epic);
    });

    test("allows empty entries", () => {
      const epic = {
        id: "emptyEpic",
        title: "Empty Epic",
        narrative: "Future work.",
        entries: [],
        progress: {
          status: "active",
          total_entries: 0,
          completed_entries: 0,
          active_entries: 0,
          next_entry_id: null,
          updated_at: "2026-06-24T00:00:00.000Z",
        },
        created_at: "2026-06-24T00:00:00.000Z",
        updated_at: "2026-06-24T00:00:00.000Z",
        version: 0,
      };
      expect(EpicSchema.parse(epic)).toEqual(epic);
    });

    test("rejects Epic without title", () => {
      expect(() =>
        EpicSchema.parse({
          id: "badEpic",
          narrative: "No title.",
          entries: [],
          progress: {
            status: "active",
            total_entries: 0,
            completed_entries: 0,
            active_entries: 0,
            next_entry_id: null,
            updated_at: "2026-06-24T00:00:00.000Z",
          },
          created_at: "2026-06-24T00:00:00.000Z",
          updated_at: "2026-06-24T00:00:00.000Z",
          version: 0,
        }),
      ).toThrow();
    });
  });

  describe("EpicMembershipSchema", () => {
    test("parses valid change Epic membership", () => {
      const membership = {
        epic_id: "addAuthEpic",
        entry_id: "en-001",
        order: 0,
        title: "Add OAuth",
        linked_at: "2026-06-24T00:00:00.000Z",
      };
      expect(EpicMembershipSchema.parse(membership)).toEqual(membership);
    });

    test("rejects membership without epic_id", () => {
      expect(() =>
        EpicMembershipSchema.parse({
          entry_id: "en-001",
          order: 0,
          title: "Add OAuth",
          linked_at: "2026-06-24T00:00:00.000Z",
        }),
      ).toThrow();
    });
  });

  describe("ChangeSchema backward compatibility", () => {
    test("Change without epic_membership remains valid", () => {
      const change = {
        id: "legacyChange",
        title: "Legacy change",
        status: "draft",
        gates: {},
        tasks: [],
        created_at: "2026-06-24T00:00:00.000Z",
        updated_at: "2026-06-24T00:00:00.000Z",
      };
      expect(ChangeSchema.parse(change).epic_membership).toBeUndefined();
    });

    test("Change with epic_membership is valid", () => {
      const change = {
        id: "epicChildChange",
        title: "Epic child change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-24T00:00:00.000Z",
        updated_at: "2026-06-24T00:00:00.000Z",
        epic_membership: {
          epic_id: "addAuthEpic",
          entry_id: "en-001",
          order: 0,
          title: "Add OAuth",
          linked_at: "2026-06-24T00:00:00.000Z",
        },
      };
      const parsed = ChangeSchema.parse(change);
      expect(parsed.epic_membership).toEqual(change.epic_membership);
    });

    test("Change rejects malformed epic_membership", () => {
      const change = {
        id: "badEpicChildChange",
        title: "Bad epic child change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-24T00:00:00.000Z",
        updated_at: "2026-06-24T00:00:00.000Z",
        epic_membership: {
          entry_id: "en-001",
          order: 0,
          title: "Add OAuth",
          linked_at: "2026-06-24T00:00:00.000Z",
        },
      };
      expect(() => ChangeSchema.parse(change)).toThrow();
    });
  });

  describe("one-Epic-per-change v1", () => {
    test("epic_membership is a single optional object, not an array", () => {
      const change = {
        id: "singleEpicChange",
        title: "Single Epic change",
        status: "active",
        gates: {},
        tasks: [],
        created_at: "2026-06-24T00:00:00.000Z",
        updated_at: "2026-06-24T00:00:00.000Z",
        epic_membership: {
          epic_id: "addAuthEpic",
          entry_id: "en-001",
          order: 0,
          title: "Add OAuth",
          linked_at: "2026-06-24T00:00:00.000Z",
        },
      };
      const parsed = ChangeSchema.parse(change);
      expect(parsed.epic_membership).toBeDefined();
      expect(parsed.epic_membership?.epic_id).toBe("addAuthEpic");
    });
  });
});
