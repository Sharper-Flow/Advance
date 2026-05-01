/**
 * Status Tool Tests
 *
 * Test adv_status lineage and recommendation behavior.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { statusTools } from "./status";
import {
  createTestProject,
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { createLegacyStore } from "../storage/store";
import type { Store } from "../storage/store";
import { GATE_ORDER, createDefaultGates } from "../types";

// Mock getStslStats and isStslInitialized for search_attributes testing
vi.mock("../temporal/service", () => ({
  getStslStats: vi.fn().mockReturnValue({
    getServiceCalls: 0,
    newConnections: 0,
    reuseRate: 0,
    reconnectCount: 0,
    reconnectFailureCount: 0,
    opTelemetry: [],
    saVerification: null,
  }),
  isStslInitialized: vi.fn().mockReturnValue(false),
}));

describe("Status Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("adv_status", () => {
    test("shows ↳ prefix for fast-follow changes in formatted output", async () => {
      // Create parent and child changes
      const { changeTools } = await import("./change");
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.formatted.activeSection).toContain("↳ childFollowUp");
    });

    test("recommendation includes parent reference for fast-follow", async () => {
      const { changeTools } = await import("./change");
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const followRec = parsed.recommendations.find((r: string) =>
        r.includes("fast-follow"),
      );
      expect(followRec).toBeDefined();
      expect(followRec).toContain("childFollowUp");
      expect(followRec).toContain(parentParsed.changeId);
    });

    test("suppresses clarify recommendation when all gates complete", async () => {
      // Vague proposal that triggers ≥2 clarify-readiness findings:
      // missing Success Criteria + missing Scope sections.
      const vagueProposal = `# Completed Vague Change

## Summary

Did some work.

## Notes

No success criteria, no scope section.
`;

      const allGatesDone = Object.fromEntries(
        GATE_ORDER.map((g) => [
          g,
          {
            status: "done" as const,
            completed_at: "2026-01-21T00:00:00Z",
            completed_by: "test-user",
          },
        ]),
      );

      const completedChange = {
        $schema: "https://advance.dev/schemas/change.v1.json",
        id: "completedVagueChange",
        title: "Completed Vague Change",
        status: "active",
        created_at: "2026-01-20T00:00:00Z",
        tasks: [],
        deltas: {},
        gates: allGatesDone,
      };

      await mkdir(join(tempDir, ".adv/changes/completedVagueChange"), {
        recursive: true,
      });
      await writeFile(
        join(tempDir, ".adv/changes/completedVagueChange/change.json"),
        JSON.stringify(completedChange, null, 2),
      );
      await writeFile(
        join(tempDir, ".adv/changes/completedVagueChange/proposal.md"),
        vagueProposal,
      );
      await store.sync();

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput<{ recommendations: string[] }>(result);

      const ambiguityRec = parsed.recommendations.find((r) =>
        r.includes("ambiguity finding"),
      );
      const completedAmbiguityRec = parsed.recommendations.find(
        (r) =>
          r.includes("ambiguity finding") && r.includes("completedVagueChange"),
      );

      // No clarify recommendation should fire for the fully-gated change.
      expect(completedAmbiguityRec).toBeUndefined();
      // Sanity: if any ambiguity rec exists at all, it must not be ours.
      if (ambiguityRec) {
        expect(ambiguityRec).not.toContain("completedVagueChange");
      }
    });

    test("emits clarify recommendation when at least one gate incomplete", async () => {
      // Same vague proposal, but gates pending — recommendation should fire.
      const vagueProposal = `# In-Flight Vague Change

## Summary

Vague in-flight work.
`;

      const inFlightChange = {
        $schema: "https://advance.dev/schemas/change.v1.json",
        id: "inFlightVagueChange",
        title: "In-Flight Vague Change",
        status: "active",
        created_at: "2026-01-20T00:00:00Z",
        tasks: [],
        deltas: {},
        gates: createDefaultGates(),
      };

      await mkdir(join(tempDir, ".adv/changes/inFlightVagueChange"), {
        recursive: true,
      });
      await writeFile(
        join(tempDir, ".adv/changes/inFlightVagueChange/change.json"),
        JSON.stringify(inFlightChange, null, 2),
      );
      await writeFile(
        join(tempDir, ".adv/changes/inFlightVagueChange/proposal.md"),
        vagueProposal,
      );
      await store.sync();

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput<{ recommendations: string[] }>(result);

      const ambiguityRec = parsed.recommendations.find(
        (r) =>
          r.includes("ambiguity finding") && r.includes("inFlightVagueChange"),
      );
      expect(ambiguityRec).toBeDefined();
      expect(ambiguityRec).toContain("/adv-clarify inFlightVagueChange");
    });

    test("recommendation annotates terminal parent", async () => {
      const { changeTools } = await import("./change");
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      // Move parent to a terminal state (closed)
      await store.changes.close(parentParsed.changeId, {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "User cancelled",
        approved_at: new Date().toISOString(),
      });

      await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const followRec = parsed.recommendations.find((r: string) =>
        r.includes("fast-follow"),
      );
      expect(followRec).toBeDefined();
      // Terminal parent (archived or closed) should be annotated with its state
      expect(followRec).toMatch(/\((archived|closed)\)/);
    });

    describe("search_attributes", () => {
      test("includes search_attributes section with saVerification from getStslStats", async () => {
        const { getStslStats, isStslInitialized } = await import(
          "../temporal/service"
        );
        const mockGetStslStats = vi.mocked(getStslStats);
        const mockIsStslInitialized = vi.mocked(isStslInitialized);
        mockIsStslInitialized.mockReturnValue(true);
        mockGetStslStats.mockReturnValue({
          getServiceCalls: 1,
          newConnections: 1,
          reuseRate: 1,
          reconnectCount: 0,
          reconnectFailureCount: 0,
          opTelemetry: [],
          saVerification: { ok: true, checkedAt: Date.now() },
        });

        const result = await statusTools.adv_status.execute({}, store);
        const parsed = parseToolOutput(result);

        expect(parsed.search_attributes).toBeDefined();
        expect(parsed.search_attributes.ok).toBe(true);
      });

      test("includes recommendation when search_attributes not ok", async () => {
        const { getStslStats, isStslInitialized } = await import(
          "../temporal/service"
        );
        const mockGetStslStats = vi.mocked(getStslStats);
        const mockIsStslInitialized = vi.mocked(isStslInitialized);
        mockIsStslInitialized.mockReturnValue(true);
        mockGetStslStats.mockReturnValue({
          getServiceCalls: 1,
          newConnections: 1,
          reuseRate: 1,
          reconnectCount: 0,
          reconnectFailureCount: 0,
          opTelemetry: [],
          saVerification: { ok: false, checkedAt: Date.now() },
        });

        const result = await statusTools.adv_status.execute({}, store);
        const parsed = parseToolOutput(result);

        expect(parsed.search_attributes).toBeDefined();
        expect(parsed.search_attributes.ok).toBe(false);
        const saRec = parsed.recommendations.find(
          (r: string) =>
            r.includes("search attributes") ||
            r.includes("adv_temporal_register_search_attributes"),
        );
        expect(saRec).toBeDefined();
      });

      test("shows search_attributes as unknown when STSL not initialized", async () => {
        const { getStslStats, isStslInitialized } = await import(
          "../temporal/service"
        );
        const mockGetStslStats = vi.mocked(getStslStats);
        const mockIsStslInitialized = vi.mocked(isStslInitialized);
        mockIsStslInitialized.mockReturnValue(false);
        mockGetStslStats.mockReturnValue({
          getServiceCalls: 0,
          newConnections: 0,
          reuseRate: 0,
          reconnectCount: 0,
          reconnectFailureCount: 0,
          opTelemetry: [],
          saVerification: null,
        });

        const result = await statusTools.adv_status.execute({}, store);
        const parsed = parseToolOutput(result);

        expect(parsed.search_attributes).toBeDefined();
        expect(parsed.search_attributes.ok).toBe(false);
      });
    });
  });
});
