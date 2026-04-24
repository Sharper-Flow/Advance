/**
 * Re-Entry Integration Tests
 *
 * Cross-cutting tests for the scope expansion re-entry workflow.
 * Verifies cascade reset, task preservation, planning-lock unblock,
 * and sequential gate enforcement after re-entry.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createLegacyStore, type Store } from "./store";
import { changeTools } from "../tools/change";
import { taskTools } from "../tools/task";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";

describe("Re-Entry Integration", () => {
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

  /**
   * Helper: complete gates through planning (proposal → discovery → design → planning)
   */
  async function completeGatesThrough(
    lastGate: "proposal" | "discovery" | "design" | "planning" | "execution",
  ): Promise<void> {
    const gateOrder = [
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
    ] as const;
    for (const gate of gateOrder) {
      await store.gates.complete("addFeature", gate);
      if (gate === lastGate) break;
    }
  }

  describe("cascade reset from discovery resets 6 downstream gates", () => {
    test("resets discovery through release while preserving proposal", async () => {
      await completeGatesThrough("execution");
      // Also complete acceptance
      await store.gates.complete("addFeature", "acceptance");

      await store.gates.reopenFrom(
        "addFeature",
        "discovery",
        "New requirement discovered",
      );

      const gates = await store.gates.get("addFeature");
      expect(gates!.proposal.status).toBe("done");
      expect(gates!.discovery.status).toBe("pending");
      expect(gates!.design.status).toBe("pending");
      expect(gates!.planning.status).toBe("pending");
      expect(gates!.execution.status).toBe("pending");
      expect(gates!.acceptance.status).toBe("pending");
      expect(gates!.release.status).toBe("pending");
    });
  });

  describe("cascade reset from design resets only design and downstream", () => {
    test("preserves proposal and discovery, resets design through release", async () => {
      await completeGatesThrough("planning");

      await store.gates.reopenFrom(
        "addFeature",
        "design",
        "Architecture invalidated",
      );

      const gates = await store.gates.get("addFeature");
      expect(gates!.proposal.status).toBe("done");
      expect(gates!.discovery.status).toBe("done");
      expect(gates!.design.status).toBe("pending");
      expect(gates!.planning.status).toBe("pending");
      expect(gates!.execution.status).toBe("pending");
      expect(gates!.acceptance.status).toBe("pending");
      expect(gates!.release.status).toBe("pending");
    });
  });

  describe("tasks are preserved after cascade reset", () => {
    test("all existing tasks retain original status and data", async () => {
      // Mark task 1 as done before re-entry
      await store.tasks.update("tk-task0001", "done");

      // Complete gates through planning
      await completeGatesThrough("planning");

      // Re-enter from discovery
      await store.gates.reopenFrom(
        "addFeature",
        "discovery",
        "Scope expansion",
      );

      // Verify tasks are untouched
      const tasks = await store.tasks.list("addFeature");
      expect(tasks).toHaveLength(3);

      const task1 = tasks.find((t) => t.id === "tk-task0001");
      const task2 = tasks.find((t) => t.id === "tk-task0002");
      const task3 = tasks.find((t) => t.id === "tk-task0003");

      expect(task1!.status).toBe("done");
      expect(task2!.status).toBe("pending");
      expect(task3!.status).toBe("pending");

      // Titles preserved
      expect(task1!.title).toBe("Implement core logic");
      expect(task2!.title).toBe("Write tests");
      expect(task3!.title).toBe("Update documentation");
    });
  });

  describe("after re-entry, adv_task_add succeeds", () => {
    test("planning lock is lifted when planning gate is reset to pending", async () => {
      // Complete all pre-impl gates (planning gate locks task addition)
      await completeGatesThrough("planning");

      // Verify task add is blocked
      const blockedResult = await taskTools.adv_task_add.execute(
        { changeId: "addFeature", content: "Should be rejected" },
        store,
      );
      const blockedParsed = parseToolOutput(blockedResult);
      expect(blockedParsed.error).toBeDefined();
      expect(blockedParsed.error).toContain("planning gate");

      // Re-enter from discovery (resets planning to pending)
      await store.gates.reopenFrom(
        "addFeature",
        "discovery",
        "Scope expansion requires new tasks",
      );

      // Now task add should succeed
      const result = await taskTools.adv_task_add.execute(
        { changeId: "addFeature", content: "New task after re-entry" },
        store,
      );
      const parsed = parseToolOutput(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.task).toBeDefined();
      expect(parsed.task.title).toBe("New task after re-entry");

      // Verify task is in the change
      const tasks = await store.tasks.list("addFeature");
      expect(tasks).toHaveLength(4);
    });
  });

  describe("after re-entry, sequential gate order is enforced", () => {
    test("cannot complete design before discovery after re-entry", async () => {
      await completeGatesThrough("planning");

      // Re-enter from discovery
      await store.gates.reopenFrom(
        "addFeature",
        "discovery",
        "New requirement",
      );

      // Trying to complete design should fail — discovery is pending
      await expect(
        store.gates.complete("addFeature", "design"),
      ).rejects.toThrow();
    });

    test("can walk gates in order after re-entry", async () => {
      await completeGatesThrough("planning");

      await store.gates.reopenFrom(
        "addFeature",
        "discovery",
        "Scope expansion",
      );

      // Walk gates sequentially from discovery
      await store.gates.complete("addFeature", "discovery");
      await store.gates.complete("addFeature", "design");
      await store.gates.complete("addFeature", "planning");

      const gates = await store.gates.get("addFeature");
      expect(gates!.proposal.status).toBe("done");
      expect(gates!.discovery.status).toBe("done");
      expect(gates!.design.status).toBe("done");
      expect(gates!.planning.status).toBe("done");
    });
  });

  describe("reentry_history accumulates across multiple re-entries", () => {
    test("each re-entry appends to history without overwriting", async () => {
      await completeGatesThrough("planning");

      // First re-entry from design
      await store.gates.reopenFrom(
        "addFeature",
        "design",
        "First scope expansion",
        "Added OAuth",
      );

      // Re-complete gates for second re-entry
      await store.gates.complete("addFeature", "design");
      await store.gates.complete("addFeature", "planning");

      // Second re-entry from planning
      await store.gates.reopenFrom(
        "addFeature",
        "planning",
        "Second scope expansion",
        "Added rate limiting",
      );

      const changeResult = await store.changes.get("addFeature");
      expect(changeResult.success).toBe(true);
      const history = changeResult.data!.reentry_history!;

      expect(history).toHaveLength(2);
      expect(history[0].from_gate).toBe("design");
      expect(history[0].scope_delta).toBe("Added OAuth");
      expect(history[1].from_gate).toBe("planning");
      expect(history[1].scope_delta).toBe("Added rate limiting");

      // Timestamps should be ordered
      expect(new Date(history[0].reopened_at).getTime()).toBeLessThanOrEqual(
        new Date(history[1].reopened_at).getTime(),
      );
    });
  });

  describe("adv_change_reenter rejects reopening a pending gate", () => {
    test("returns error when fromGate has not been completed", async () => {
      // Only complete proposal — discovery is still pending
      await completeGatesThrough("proposal");

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "addFeature",
          fromGate: "discovery",
          reason: "Trying to reopen pending gate",
          approvedByUser: true,
          approvalEvidence: "User approved via question tool",
        },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("not completed");
    });
  });

  describe("planning-lock error text references adv_change_reenter", () => {
    test("error message tells user about re-entry path", async () => {
      await completeGatesThrough("planning");

      const result = await taskTools.adv_task_add.execute(
        { changeId: "addFeature", content: "Should be rejected" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.error).toContain("planning gate");
      expect(parsed.error).toContain("adv_change_reenter");
    });
  });
});
