/**
 * Investment Report Tool Tests (addCostTimeInvestment)
 *
 * TDD tests for adv_investment_report — read-only, stateless tool
 * that returns a structured investment report for a change.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { rm as _rm } from "fs/promises";
import { join as _join } from "path";
import { investmentTools } from "./investment";
import { createStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  parseToolOutput,
} from "../__tests__/setup";

// Default conservative thresholds (mirrors agreement user decision #1)
const DEFAULT_THRESHOLDS = {
  auto: { tasks: 3, retries: 0, elapsed_minutes: 15 },
  escalate: { tasks: 8, retries: 2, elapsed_minutes: 60 },
  hardstop: { tasks: 15, retries: 5, elapsed_minutes: 180 },
};

describe("Investment Tools", () => {
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

  describe("adv_investment_report", () => {
    test("happy path: returns counts + metrics for a change with mixed task statuses", async () => {
      // SAMPLE_CHANGE fixture has 3 pending tasks on 'addFeature'
      const result = await investmentTools.adv_investment_report.execute(
        { changeId: "addFeature", thresholds: DEFAULT_THRESHOLDS },
        store,
      );
      const parsed = parseToolOutput<{
        task_counts: {
          total: number;
          done: number;
          cancelled: number;
          pending: number;
          in_progress: number;
        };
        elapsed_ms: number;
        retry_total: number;
        retry_density: number;
        doom_loop_active: boolean;
        per_gate_ms: Record<string, number>;
        threshold_tier: "auto" | "escalate" | "hardstop";
      }>(result);

      expect(parsed.task_counts.total).toBe(3);
      expect(parsed.task_counts.pending).toBe(3);
      expect(parsed.task_counts.done).toBe(0);
      expect(parsed.task_counts.cancelled).toBe(0);
      expect(parsed.task_counts.in_progress).toBe(0);
      expect(parsed.retry_total).toBe(0);
      expect(parsed.doom_loop_active).toBe(false);
      // 3 tasks is at the auto/escalate border (auto ≤3) and 0 retries — tier depends on elapsed
      expect(["auto", "escalate", "hardstop"]).toContain(parsed.threshold_tier);
    });

    test("zero tasks: empty-change case handles without throwing", async () => {
      // Create a fresh change with no tasks (store.changes.create returns {changeId, path})
      const newChange = await store.changes.create("Empty Change");
      expect(newChange.changeId).toBeTruthy();

      const result = await investmentTools.adv_investment_report.execute(
        { changeId: newChange.changeId, thresholds: DEFAULT_THRESHOLDS },
        store,
      );
      const parsed = parseToolOutput<{
        task_counts: { total: number };
        retry_total: number;
        retry_density: number;
        doom_loop_active: boolean;
      }>(result);

      expect(parsed.task_counts.total).toBe(0);
      expect(parsed.retry_total).toBe(0);
      expect(parsed.retry_density).toBe(0); // division-by-zero guard
      expect(parsed.doom_loop_active).toBe(false);
    });

    test("all cancelled: retry_density handles division correctly", async () => {
      // Cancel all tasks in the sample change via direct status update
      const change = await store.changes.get("addFeature");
      if (!change.success || !change.data) return;

      // store.tasks.update signature: (taskId, status, notes?, ...)
      // All tasks become cancelled - retry_density = retry_total / max(1, done+cancelled)
      for (const task of change.data.tasks) {
        await store.tasks.update(task.id, "cancelled");
      }

      const result = await investmentTools.adv_investment_report.execute(
        { changeId: "addFeature", thresholds: DEFAULT_THRESHOLDS },
        store,
      );
      const parsed = parseToolOutput<{
        task_counts: { cancelled: number };
        retry_density: number;
      }>(result);

      expect(parsed.task_counts.cancelled).toBe(3);
      expect(parsed.retry_density).toBe(0); // 0 retries / 3 cancelled = 0
      expect(Number.isFinite(parsed.retry_density)).toBe(true);
    });

    test("missing timestamps: does not throw on null started_at/completed_at", async () => {
      // SAMPLE_CHANGE tasks have no started_at/completed_at — test should pass cleanly
      await expect(
        investmentTools.adv_investment_report.execute(
          { changeId: "addFeature", thresholds: DEFAULT_THRESHOLDS },
          store,
        ),
      ).resolves.toBeDefined();
    });

    test("change not found: returns error payload (not throw)", async () => {
      const result = await investmentTools.adv_investment_report.execute(
        { changeId: "nonexistent-change", thresholds: DEFAULT_THRESHOLDS },
        store,
      );
      const parsed = parseToolOutput<{ error?: string }>(result);
      expect(parsed.error).toBeDefined();
    });

    test("tier classification: auto tier when far below thresholds", async () => {
      const newChange = await store.changes.create("Tiny Change");

      // Use thresholds that are clearly above the current state
      const result = await investmentTools.adv_investment_report.execute(
        {
          changeId: newChange.changeId,
          thresholds: {
            auto: { tasks: 100, retries: 100, elapsed_minutes: 10000 },
            escalate: { tasks: 200, retries: 200, elapsed_minutes: 20000 },
            hardstop: { tasks: 500, retries: 500, elapsed_minutes: 50000 },
          },
        },
        store,
      );
      const parsed = parseToolOutput<{ threshold_tier: string }>(result);
      expect(parsed.threshold_tier).toBe("auto");
    });

    test("tier classification: escalate tier when tasks exceed escalate threshold", async () => {
      // SAMPLE_CHANGE has 3 tasks
      // With aggressive thresholds (escalate >=2), 3 tasks should tip to escalate
      const result = await investmentTools.adv_investment_report.execute(
        {
          changeId: "addFeature",
          thresholds: {
            auto: { tasks: 1, retries: 0, elapsed_minutes: 1 },
            escalate: { tasks: 2, retries: 1, elapsed_minutes: 5 },
            // Keep hardstop bands well above the historical SAMPLE_CHANGE age so
            // only the task-count signal decides this assertion.
            hardstop: { tasks: 50, retries: 50, elapsed_minutes: 1_000_000 },
          },
        },
        store,
      );
      const parsed = parseToolOutput<{ threshold_tier: string }>(result);
      expect(parsed.threshold_tier).toBe("escalate");
    });

    test("tier classification: hardstop tier when tasks exceed hardstop threshold", async () => {
      const result = await investmentTools.adv_investment_report.execute(
        {
          changeId: "addFeature",
          thresholds: {
            auto: { tasks: 1, retries: 0, elapsed_minutes: 1 },
            escalate: { tasks: 2, retries: 1, elapsed_minutes: 5 },
            hardstop: { tasks: 3, retries: 2, elapsed_minutes: 10 },
          },
        },
        store,
      );
      const parsed = parseToolOutput<{ threshold_tier: string }>(result);
      // SAMPLE_CHANGE has 3 tasks which matches hardstop tasks=3 lower bound
      expect(parsed.threshold_tier).toBe("hardstop");
    });

    test("per_gate_ms returns a record (may be empty for no-gate changes)", async () => {
      const result = await investmentTools.adv_investment_report.execute(
        { changeId: "addFeature", thresholds: DEFAULT_THRESHOLDS },
        store,
      );
      const parsed = parseToolOutput<{ per_gate_ms: Record<string, number> }>(
        result,
      );
      expect(parsed.per_gate_ms).toBeDefined();
      expect(typeof parsed.per_gate_ms).toBe("object");
    });

    test("default thresholds: works when no thresholds arg provided", async () => {
      const result = await investmentTools.adv_investment_report.execute(
        { changeId: "addFeature" },
        store,
      );
      const parsed = parseToolOutput<{ threshold_tier: string }>(result);
      expect(["auto", "escalate", "hardstop"]).toContain(parsed.threshold_tier);
    });

    test("elapsed_ms is non-negative and finite", async () => {
      const result = await investmentTools.adv_investment_report.execute(
        { changeId: "addFeature", thresholds: DEFAULT_THRESHOLDS },
        store,
      );
      const parsed = parseToolOutput<{ elapsed_ms: number }>(result);
      expect(parsed.elapsed_ms).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(parsed.elapsed_ms)).toBe(true);
    });

    test("doom-loop fallback: persisted error_recovery attempts activate doom_loop_active after restart", async () => {
      const change = await store.changes.get("addFeature");
      if (!change.success || !change.data) return;

      const target = change.data.tasks[0];
      await store.tasks.update(target.id, "in_progress", undefined, undefined, {
        last_error: "still failing",
        retry_count: 3,
        max_retries: 3,
        error_class: "SEMANTIC",
        next_strategy: "ask user",
        attempts: [
          {
            attempt_number: 1,
            error: "e1",
            diagnosis: "d1",
            fix_tried: "f1",
            strategy_label: "s1",
            outcome: "failed",
            attempted_at: "2026-04-18T10:00:00.000Z",
          },
          {
            attempt_number: 2,
            error: "e2",
            diagnosis: "d2",
            fix_tried: "f2",
            strategy_label: "s2",
            outcome: "failed",
            attempted_at: "2026-04-18T10:01:00.000Z",
          },
          {
            attempt_number: 3,
            error: "e3",
            diagnosis: "d3",
            fix_tried: "f3",
            strategy_label: "s3",
            outcome: "failed",
            attempted_at: "2026-04-18T10:02:00.000Z",
          },
        ],
      });

      const result = await investmentTools.adv_investment_report.execute(
        { changeId: "addFeature", thresholds: DEFAULT_THRESHOLDS },
        store,
      );
      const parsed = parseToolOutput<{
        doom_loop_active: boolean;
        retry_total: number;
      }>(result);
      expect(parsed.retry_total).toBeGreaterThanOrEqual(3);
      expect(parsed.doom_loop_active).toBe(true);
    });
  });
});
