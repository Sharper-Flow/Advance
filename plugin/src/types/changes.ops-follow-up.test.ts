/**
 * Ops follow-up schema tests — parsing, legacy compatibility, and field shape.
 */
import { describe, expect, it } from "vitest";
import {
  ChangeSchema,
  OpsEvidenceEntrySchema,
  OpsFollowupLinkSchema,
  OpsFollowupProfileSchema,
  OpsFollowupSourceSchema,
} from "./changes";

const timestamp = "2026-06-20T04:00:00.000Z";

describe("ops follow-up schemas", () => {
  it("parses a minimal ops follow-up profile", () => {
    const result = OpsFollowupProfileSchema.parse({
      kind: "migration",
      source: {
        source_change_id: "parent-1",
        source_kind: "required_follow_up",
      },
      relationship: "blocks",
      status: "not_started",
      created_at: timestamp,
    });

    expect(result).toMatchObject({
      kind: "migration",
      relationship: "blocks",
      status: "not_started",
      evidence: [],
    });
  });

  it("parses a profile with evidence entries", () => {
    const result = OpsFollowupProfileSchema.parse({
      kind: "backfill",
      source: {
        source_change_id: "parent-2",
        source_project_id: "a".repeat(40),
        source_path: "/home/user/project",
        source_contract_id: "AC3",
        source_kind: "report_follow_up",
      },
      relationship: "follows_release",
      status: "running",
      created_at: timestamp,
      updated_at: timestamp,
      completion_signal: "backfill-complete",
      evidence: [
        {
          id: "ev-1",
          recorded_at: timestamp,
          env: "prod",
          action: "run-backfill",
          batch: "batch-001",
          status: "started",
          summary: "Backfill started for batch-001",
          next_step: "validate row counts",
        },
      ],
    });

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence?.[0]).toMatchObject({
      id: "ev-1",
      status: "started",
      batch: "batch-001",
    });
  });

  it("parses an outbound ops follow-up link", () => {
    const result = OpsFollowupLinkSchema.parse({
      id: "ofl-1",
      target_project_id: "b".repeat(40),
      target_path: "/home/user/other",
      changeId: "child-1",
      relationship: "monitors",
      status: "partial",
      required_handoff: true,
      linked_at: timestamp,
      source_contract_id: "AC5",
    });

    expect(result).toMatchObject({
      id: "ofl-1",
      changeId: "child-1",
      relationship: "monitors",
      required_handoff: true,
    });
  });

  it("rejects an invalid source project id", () => {
    expect(() =>
      OpsFollowupSourceSchema.parse({
        source_change_id: "parent-1",
        source_project_id: "not-a-sha",
        source_kind: "manual",
      }),
    ).toThrow();
  });

  it("rejects an unknown relationship", () => {
    expect(() =>
      OpsFollowupLinkSchema.parse({
        id: "ofl-bad",
        changeId: "child-1",
        relationship: "watches",
        status: "not_started",
        linked_at: timestamp,
      }),
    ).toThrow();
  });

  it("ChangeSchema parses legacy changes without ops fields", () => {
    const result = ChangeSchema.parse({
      id: "legacy-change",
      title: "Legacy change",
      status: "draft",
      created_at: timestamp,
    });

    expect(result.id).toBe("legacy-change");
    expect(result).not.toHaveProperty("ops_followup");
    expect(result.ops_followup_links).toBeUndefined();
  });

  it("ChangeSchema round-trips ops fields", () => {
    const change = {
      id: "ops-change",
      title: "Ops change",
      status: "active",
      created_at: timestamp,
      ops_followup: {
        kind: "cleanup",
        source: {
          source_change_id: "parent-3",
          source_kind: "agenda",
          source_agenda_id: "ag-1",
        },
        relationship: "cleanup_after",
        status: "cleanup_needed",
        created_at: timestamp,
        evidence: [
          {
            id: "ev-2",
            recorded_at: timestamp,
            env: "staging",
            action: "drop-temp-table",
            status: "complete",
            summary: "Cleanup complete",
          },
        ],
      },
      ops_followup_links: [
        {
          id: "ofl-2",
          changeId: "child-2",
          relationship: "follows_release",
          status: "not_started",
          linked_at: timestamp,
        },
      ],
    };

    const result = ChangeSchema.parse(change);
    expect(result.ops_followup?.kind).toBe("cleanup");
    expect(result.ops_followup?.evidence).toHaveLength(1);
    expect(result.ops_followup_links).toHaveLength(1);
    expect(result.ops_followup_links?.[0]?.id).toBe("ofl-2");
  });

  it("OpsEvidenceEntry rejects an invalid status", () => {
    expect(() =>
      OpsEvidenceEntrySchema.parse({
        id: "ev-bad",
        recorded_at: timestamp,
        env: "prod",
        action: "x",
        status: "in_progress",
        summary: "bad status",
      }),
    ).toThrow();
  });
});
