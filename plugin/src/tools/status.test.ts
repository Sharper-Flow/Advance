/**
 * Status Tool Tests
 *
 * TDD tests for project status tool
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Database } from "bun:sqlite";
import { rm } from "fs/promises";
import { join } from "path";
import { statusTools } from "./status";
import { createStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
  SAMPLE_SPEC,
} from "../__tests__/setup";

describe("Status Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("adv_status", () => {
    test("returns spec count and capabilities", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.specs.count).toBe(1);
      expect(parsed.specs.capabilities).toContain("test-capability");
    });

    test("returns change counts by status", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes.active).toBe(1);
      expect(parsed.changes.byStatus.active).toBe(1);
      expect(parsed.changes.byStatus.draft).toBe(0);
    });

    test("updates counts when change status changes", async () => {
      // Create a draft change
      await store.changes.create("Draft feature");

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes.active).toBe(2);
      expect(parsed.changes.byStatus.draft).toBe(1);
    });

    test("generates archive recommendation when all tasks done", async () => {
      // Complete all tasks
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.recommendations.length).toBeGreaterThan(0);
      const archiveRec = parsed.recommendations.find((r: string) =>
        r.includes("Ready to archive"),
      );
      expect(archiveRec).toBeDefined();
      expect(archiveRec).toContain("addFeature");
    });

    test("no archive recommendation when tasks incomplete", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const archiveRecs = parsed.recommendations.filter((r: string) =>
        r.includes("Ready to archive"),
      );
      expect(archiveRecs).toHaveLength(0);
    });

    test("handles multiple specs", async () => {
      // Add another spec
      const newSpec = {
        ...SAMPLE_SPEC,
        name: "second-cap",
        title: "Second Capability",
        requirements: SAMPLE_SPEC.requirements.map((r, i) => ({
          ...r,
          id: `rq-second${i}`,
          scenarios:
            r.scenarios?.map((s, j) => ({ ...s, id: `rq-second${i}.${j}` })) ??
            [],
        })),
      };
      await store.specs.save(newSpec);

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.specs.count).toBe(2);
      expect(parsed.specs.capabilities).toContain("test-capability");
      expect(parsed.specs.capabilities).toContain("second-cap");
    });

    test("recommends next gate command for active changes", async () => {
      // The test fixture change "addFeature" starts with no gates completed
      // The manifest should recommend the proposal gate command first
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      // Should have a gate-based recommendation for the active change
      const gateRecs = parsed.recommendations.filter(
        (r: string) => r.includes("/adv-proposal") || r.includes("next gate"),
      );
      expect(gateRecs.length).toBeGreaterThan(0);
    });

    test("recommends acceptance after execution gate is complete", async () => {
      await store.gates.complete("addFeature", "proposal");
      await store.gates.complete("addFeature", "discovery");
      await store.gates.complete("addFeature", "design");
      await store.gates.complete("addFeature", "planning");
      await store.gates.complete("addFeature", "execution");

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      // Acceptance is the next incomplete gate, so status should point to adv-accept
      const acceptanceRecs = parsed.recommendations.filter((r: string) =>
        r.includes("/adv-accept"),
      );
      expect(acceptanceRecs.length).toBeGreaterThan(0);
    });

    test("handles empty project", async () => {
      // Create empty project
      const emptyDir = await createTempDir();
      await createTestProject(emptyDir, {
        withSpecs: false,
        withChanges: false,
      });
      const emptyStore = await createStore(emptyDir);

      const result = await statusTools.adv_status.execute({}, emptyStore);
      const parsed = parseToolOutput(result);

      expect(parsed.specs.count).toBe(0);
      expect(parsed.changes.active).toBe(0);
      // Legacy mode warning is expected when no git repo is present
      expect(
        parsed.recommendations.some((r: string) =>
          r.includes("Running without external state"),
        ),
      ).toBe(true);
      // No other recommendations beyond the legacy warning
      expect(parsed.recommendations).toHaveLength(1);

      emptyStore.close();
      await cleanupTempDir(emptyDir);
    });

    test("surfaces config schema error in recommendations when project.json is invalid", async () => {
      // Write an invalid project.json (name is a number, not a string)
      const { writeFile } = await import("fs/promises");
      const { join } = await import("path");
      await writeFile(
        join(tempDir, "project.json"),
        JSON.stringify({ name: 42, version: "0.1.0" }),
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      // Config error should appear in recommendations
      const configErrors = parsed.recommendations.filter(
        (r: string) => r.includes("project.json") || r.includes("config"),
      );
      expect(configErrors.length).toBeGreaterThan(0);
      expect(configErrors[0]).toContain("project.json");
    });

    test("includes feature_flags section in status output when config is valid", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      // feature_flags should be present with schema-defined defaults
      expect(parsed.feature_flags).toBeDefined();
      expect(parsed.feature_flags.tdd_enforcement).toBe("strict");
      expect(parsed.feature_flags.worktree_auto_create).toBe(true);
      expect(parsed.feature_flags.gate_enforcement).toBe("strict");
      expect(parsed.feature_flags.wisdom_accumulation).toBe(true);
    });

    test("surfaces config not-found warning when project.json is missing", async () => {
      // Create a project dir with no project.json
      const noConfigDir = await createTempDir();
      await createTestProject(noConfigDir, {
        withSpecs: false,
        withChanges: false,
        withConfig: false,
      });
      const noConfigStore = await createStore(noConfigDir);

      const result = await statusTools.adv_status.execute({}, noConfigStore);
      const parsed = parseToolOutput(result);

      // Should warn about missing config
      const configWarnings = parsed.recommendations.filter(
        (r: string) => r.includes("project.json") || r.includes("config"),
      );
      expect(configWarnings.length).toBeGreaterThan(0);

      noConfigStore.close();
      await cleanupTempDir(noConfigDir);
    });

    test("self-heals stale SQLite change row from missing JSON source", async () => {
      // First call populates SQLite cache
      await statusTools.adv_status.execute({}, store);

      // Remove change.json to create SQLite-vs-JSON inconsistency
      await rm(join(tempDir, ".adv/changes/addFeature/change.json"));

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const doctorWarnings = parsed.recommendations.filter(
        (r: string) =>
          r.includes("[doctor]") && r.includes("JSON/SQLite inconsistency"),
      );
      expect(doctorWarnings).toHaveLength(0);
      expect(parsed.changes.active).toBe(0);
    });

    test("self-heals dangling task refs in SQLite cache", async () => {
      // First call populates SQLite cache
      await statusTools.adv_status.execute({}, store);

      const dbPath = join(tempDir, ".adv/db/spec.db");
      const db = new Database(dbPath);
      try {
        db.exec("PRAGMA foreign_keys = OFF");
        db.query(
          `INSERT INTO tasks (id, change_id, title, section, status, priority, created_at, started_at, completed_at, completed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          "tk-dangling01",
          "missingChange",
          "Dangling Task",
          null,
          "pending",
          0,
          "2026-01-01T00:00:00Z",
          null,
          null,
          null,
        );
      } finally {
        db.close();
      }

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const brokenRefWarnings = parsed.recommendations.filter(
        (r: string) =>
          r.includes("[doctor]") && r.includes("Broken task->change refs"),
      );
      expect(brokenRefWarnings).toHaveLength(0);
      expect(parsed.changes.active).toBe(1);
    });

    test("includes changes.recent in output", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes.recent).toBeDefined();
      expect(Array.isArray(parsed.changes.recent)).toBe(true);
      expect(parsed.changes.recent.length).toBe(1);
      expect(parsed.changes.recent[0].id).toBe("addFeature");
    });

    test("recent entries have recency classification", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const rc = parsed.changes.recent[0];
      expect(rc.lastActivityAt).toBeDefined();
      expect(typeof rc.minutesSinceActivity).toBe("number");
      expect(["hot", "warm", "stale"]).toContain(rc.recency);
    });

    test("includes context snapshot for recent changes", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const rc = parsed.changes.recent[0];
      expect(rc._contextSnapshot).toBeDefined();
      expect(rc._contextSnapshot).toContain("addFeature");
      expect(rc._contextSnapshot).toMatch(/Gates:/);
      expect(rc._contextSnapshot).toMatch(/Success:/);
    });

    test("includes clarify recommendation for change with ambiguity findings", async () => {
      // The sample change has a delta with add + no scenarios, and the sample
      // proposal has no Success Criteria or Scope section — should trigger findings
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const clarifyRecs = parsed.recommendations.filter((r: string) =>
        r.includes("ambiguity finding"),
      );
      expect(clarifyRecs.length).toBeGreaterThan(0);
      expect(clarifyRecs[0]).toContain("addFeature");
      expect(clarifyRecs[0]).toContain("/adv-clarify");
    });

    test("places clarify recommendations immediately after gate recommendations", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const gateIndex = parsed.recommendations.findIndex((r: string) =>
        r.includes("next gate is"),
      );
      const clarifyIndex = parsed.recommendations.findIndex((r: string) =>
        r.includes("ambiguity finding"),
      );
      const recencyIndex = parsed.recommendations.findIndex(
        (r: string) => r.includes("Stale change") || r.includes("is hot"),
      );

      expect(gateIndex).toBeGreaterThanOrEqual(0);
      expect(clarifyIndex).toBe(gateIndex + 1);
      expect(recencyIndex).toBeGreaterThan(clarifyIndex);
    });

    test("omits clarify recommendation when clarify_enforcement is off", async () => {
      const config = store.config!;
      (config.features as Record<string, unknown>).clarify_enforcement = "off";

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const clarifyRecs = parsed.recommendations.filter((r: string) =>
        r.includes("ambiguity finding"),
      );
      expect(clarifyRecs).toHaveLength(0);
    });

    test("stale changes get resume recommendation", async () => {
      // The test fixture has created_at from 2026-01-21 — well in the past,
      // so it should be classified as stale and get a recommendation
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      const staleRecs = parsed.recommendations.filter((r: string) =>
        r.includes("Stale change"),
      );
      expect(staleRecs.length).toBeGreaterThan(0);
      expect(staleRecs[0]).toContain("addFeature");
    });

    test("closed changes are excluded from active status and recommendations", async () => {
      await store.changes.close("addFeature", {
        reason: "cancelled",
        approved_by_user: true,
        approval_evidence: "User cancelled proposal",
        approved_at: "2026-03-24T00:00:00Z",
      });

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.changes.active).toBe(0);
      expect(parsed.changes.byStatus.closed).toBe(1);
      expect(parsed.changes.recent).toHaveLength(0);
      expect(
        parsed.recommendations.some(
          (r: string) =>
            r.includes("/adv-apply addFeature") ||
            r.includes("Stale change `addFeature`"),
        ),
      ).toBe(false);
    });
  });
});
