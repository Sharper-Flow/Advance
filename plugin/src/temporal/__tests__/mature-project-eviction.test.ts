/**
 * Mature-project eviction verification (AC8 / rq-changeSummariesCap01)
 *
 * End-to-end verification that the bounded change_summaries registry
 * keeps a project with ≥250 archived change_summaries usable. Exercises
 * the eviction code path at scale and verifies access latency stays
 * well under the 10s safety-net timeout.
 *
 * Latency thresholds:
 *   - p99 < 100ms for query-handler-equivalent operations on the
 *     synthetic fixture. Rationale: the eviction sort is O(N log N) on
 *     archived entries, capped at the cap value (default 50). 100ms is
 *     two orders of magnitude under the 10s safety net, with headroom
 *     for slow CI hardware.
 *
 *   - Time-to-first-eviction < 500ms when seeding 250 archived entries
 *     past a cap of 50. Same rationale.
 *
 * These are synthetic-fixture thresholds, not field measurements. The
 * field complaint was 4.6s warm latency at ~298 archived entries; with
 * cap=50 the iteration cost drops by ~6x (50 vs 298).
 */

import { describe, it, expect } from "vitest";
import {
  applyChangeSummaryToProjectState,
  createProjectWorkflowState,
} from "../project-state";
import { DEFAULT_CHANGE_SUMMARIES_CAP } from "../contracts";
import { buildMatureProjectFixture } from "./fixtures/mature-project";

describe("Mature-project eviction (AC8 / rq-changeSummariesCap01)", () => {
  it("at default cap (50) a 250-archive seed evicts down to 50", () => {
    // Without the cap, a 250-entry seed would leave 250 entries — exactly
    // the field-reported scaling cliff. With cap=50 (default), eviction
    // runs continuously during seed, leaving exactly 50.
    const state = buildMatureProjectFixture({
      archivedCount: 250,
      changeSummariesCap: DEFAULT_CHANGE_SUMMARIES_CAP,
    });
    expect(Object.keys(state.change_summaries)).toHaveLength(
      DEFAULT_CHANGE_SUMMARIES_CAP,
    );
    // The newest 50 (highest index → newest lastActivityAt) survive.
    const survivorIds = Object.keys(state.change_summaries).sort();
    expect(survivorIds[0]).toBe("chg-archived-000200");
    expect(survivorIds[survivorIds.length - 1]).toBe("chg-archived-000249");
  });

  it("active entries are preserved when inserts past cap evict archived first", () => {
    // 50 archived (at cap) + 10 active inserts. Each active insert pushes
    // total > cap; eviction picks the oldest ARCHIVED to remove. Active
    // entries themselves are never evicted, but they DO trigger eviction
    // of older archived to make room. Result: total = cap, with all 10
    // active entries surviving and the 10 oldest archived gone.
    const state = buildMatureProjectFixture({
      archivedCount: 50,
      activeCount: 10,
      changeSummariesCap: DEFAULT_CHANGE_SUMMARIES_CAP,
    });
    const total = Object.keys(state.change_summaries).length;
    expect(total).toBe(DEFAULT_CHANGE_SUMMARIES_CAP);
    // All 10 active entries survived.
    const activeCount = Object.values(state.change_summaries).filter(
      (s) => s.status === "active",
    ).length;
    expect(activeCount).toBe(10);
    // 40 archived survived (50 original − 10 evicted to make room for active).
    const archivedCount = Object.values(state.change_summaries).filter(
      (s) => s.status === "archived",
    ).length;
    expect(archivedCount).toBe(40);
    // Critical: the 10 oldest archived (indices 0..9) were evicted.
    for (let i = 0; i < 10; i++) {
      const id = `chg-archived-${String(i).padStart(6, "0")}`;
      expect(state.change_summaries[id]).toBeUndefined();
    }
  });

  it("when ONLY active entries are present and total exceeds cap, registry exceeds cap (no archived to evict)", () => {
    // Edge case: all 60 entries are active. Eviction loop finds zero
    // archived candidates and bails — registry grows past cap because
    // active is never evictable.
    const state = buildMatureProjectFixture({
      archivedCount: 0,
      activeCount: 60,
      changeSummariesCap: DEFAULT_CHANGE_SUMMARIES_CAP,
    });
    expect(Object.keys(state.change_summaries)).toHaveLength(60);
  });

  it("seeding 250 archived past cap=50 completes well under 500ms", () => {
    // Time-to-first-eviction performance verification. Each insert past
    // cap triggers an eviction sort O(N log N) where N <= cap. Total
    // cost: O(M * cap log cap) for M = (archivedCount - cap).
    const start = performance.now();
    const state = buildMatureProjectFixture({
      archivedCount: 250,
      changeSummariesCap: DEFAULT_CHANGE_SUMMARIES_CAP,
    });
    const elapsed = performance.now() - start;
    expect(state).toBeDefined();
    // Generous threshold — actual is typically a few ms even on slow CI.
    expect(elapsed).toBeLessThan(500);
  });

  it("inserting one more archived past the seeded cap evicts oldest", () => {
    // Seed to cap exactly, then insert one more — assert oldest evicts.
    const state = buildMatureProjectFixture({
      archivedCount: DEFAULT_CHANGE_SUMMARIES_CAP,
      changeSummariesCap: DEFAULT_CHANGE_SUMMARIES_CAP,
    });
    const oldestBefore = "chg-archived-000000";
    expect(state.change_summaries[oldestBefore]).toBeDefined();

    applyChangeSummaryToProjectState(state, {
      changeId: "chg-archived-newest",
      title: "newest",
      status: "archived",
      gateProgress: {
        proposal: "done",
        discovery: "done",
        design: "done",
        planning: "done",
        execution: "done",
        acceptance: "done",
        release: "done",
      },
      taskCounts: { total: 0, done: 0, pending: 0 },
      lastActivityAt: "2030-01-01T00:00:00.000Z",
      sourceVersion: 1,
    });

    expect(Object.keys(state.change_summaries)).toHaveLength(
      DEFAULT_CHANGE_SUMMARIES_CAP,
    );
    expect(state.change_summaries[oldestBefore]).toBeUndefined();
    expect(state.change_summaries["chg-archived-newest"]).toBeDefined();
    // source_versions also pruned for evicted entry.
    expect(state.source_versions[oldestBefore]).toBeUndefined();
  });

  it("env-var override applied to fixture via changeSummariesCap respects custom cap", () => {
    const state = buildMatureProjectFixture({
      archivedCount: 250,
      changeSummariesCap: 100,
    });
    expect(Object.keys(state.change_summaries)).toHaveLength(100);
  });

  it("p99 of 1000 successive inserts past cap stays well under 100ms each", () => {
    // Simulates a high-archive-rate workload (worst case for eviction).
    // Each insert triggers a sort over the cap-bounded set.
    const state = createProjectWorkflowState({
      projectId: "p",
      initializedAt: "2026-01-01T00:00:00.000Z",
      changeSummariesCap: DEFAULT_CHANGE_SUMMARIES_CAP,
    });
    // Pre-fill to cap.
    for (let i = 0; i < DEFAULT_CHANGE_SUMMARIES_CAP; i++) {
      applyChangeSummaryToProjectState(state, {
        changeId: `pre-${String(i).padStart(6, "0")}`,
        title: "pre",
        status: "archived",
        gateProgress: {
          proposal: "done",
          discovery: "done",
          design: "done",
          planning: "done",
          execution: "done",
          acceptance: "done",
          release: "done",
        },
        taskCounts: { total: 0, done: 0, pending: 0 },
        lastActivityAt: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
        sourceVersion: 1,
      });
    }

    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const t0 = performance.now();
      applyChangeSummaryToProjectState(state, {
        changeId: `post-${String(i).padStart(6, "0")}`,
        title: "post",
        status: "archived",
        gateProgress: {
          proposal: "done",
          discovery: "done",
          design: "done",
          planning: "done",
          execution: "done",
          acceptance: "done",
          release: "done",
        },
        taskCounts: { total: 0, done: 0, pending: 0 },
        lastActivityAt: `2027-01-01T00:00:00.${String(i).padStart(3, "0")}Z`,
        sourceVersion: 1,
      });
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(samples.length * 0.99)];
    // Generous threshold; typical p99 is sub-millisecond.
    expect(p99).toBeLessThan(100);
  });
});
