/**
 * Status Tool Tests
 *
 * TDD tests for project status tool
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { statusTools } from "./status";
import { createStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
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
      const parsed = JSON.parse(result);

      expect(parsed.specs.count).toBe(1);
      expect(parsed.specs.capabilities).toContain("test-capability");
    });

    test("returns change counts by status", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.changes.active).toBe(1);
      expect(parsed.changes.byStatus.active).toBe(1);
      expect(parsed.changes.byStatus.draft).toBe(0);
    });

    test("updates counts when change status changes", async () => {
      // Create a draft change
      await store.changes.create("Draft feature");

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.changes.active).toBe(2);
      expect(parsed.changes.byStatus.draft).toBe(1);
    });

    test("generates archive recommendation when all tasks done", async () => {
      // Complete all tasks
      await store.tasks.update("tk-task0001", "done");
      await store.tasks.update("tk-task0002", "done");
      await store.tasks.update("tk-task0003", "done");

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = JSON.parse(result);

      expect(parsed.recommendations.length).toBeGreaterThan(0);
      expect(parsed.recommendations[0]).toContain("Ready to archive");
      expect(parsed.recommendations[0]).toContain("add-feature-abc123");
    });

    test("no archive recommendation when tasks incomplete", async () => {
      const result = await statusTools.adv_status.execute({}, store);
      const parsed = JSON.parse(result);

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
      const parsed = JSON.parse(result);

      expect(parsed.specs.count).toBe(2);
      expect(parsed.specs.capabilities).toContain("test-capability");
      expect(parsed.specs.capabilities).toContain("second-cap");
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
      const parsed = JSON.parse(result);

      expect(parsed.specs.count).toBe(0);
      expect(parsed.changes.active).toBe(0);
      expect(parsed.recommendations).toHaveLength(0);

      emptyStore.close();
      await cleanupTempDir(emptyDir);
    });
  });
});
