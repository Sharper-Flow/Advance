import { describe, expect, it, beforeEach } from "vitest";
import {
  ChangeSummaryMemo,
  type ChangeSummary,
} from "./store-temporal-memo";

describe("ChangeSummaryMemo", () => {
  let memo: ChangeSummaryMemo;

  beforeEach(() => {
    memo = new ChangeSummaryMemo();
  });

  const sampleSummary: ChangeSummary = {
    id: "chg-001",
    title: "Test change",
    status: "draft",
    gateProgress: {
      proposal: "done",
      discovery: "pending",
      design: "pending",
      planning: "pending",
      execution: "pending",
      acceptance: "pending",
      release: "pending",
    },
    taskCounts: { total: 5, done: 2, pending: 3 },
    lastActivityAt: "2026-04-23T12:00:00.000Z",
    sourceVersion: 1,
  };

  it("returns undefined for unknown change", () => {
    expect(memo.get("chg-999")).toBeUndefined();
  });

  it("stores and retrieves a summary", () => {
    memo.set("chg-001", sampleSummary);
    expect(memo.get("chg-001")).toEqual(sampleSummary);
  });

  it("overwrites existing summary on set", () => {
    memo.set("chg-001", sampleSummary);
    const updated = { ...sampleSummary, status: "active" as const, sourceVersion: 2 };
    memo.set("chg-001", updated);
    expect(memo.get("chg-001")).toEqual(updated);
  });

  it("invalidates a specific change", () => {
    memo.set("chg-001", sampleSummary);
    memo.invalidate("chg-001");
    expect(memo.get("chg-001")).toBeUndefined();
  });

  it("invalidate on non-existent key is a no-op", () => {
    expect(() => memo.invalidate("chg-999")).not.toThrow();
  });

  it("invalidateAll clears all entries", () => {
    memo.set("chg-001", sampleSummary);
    memo.set("chg-002", { ...sampleSummary, id: "chg-002" });
    memo.invalidateAll();
    expect(memo.get("chg-001")).toBeUndefined();
    expect(memo.get("chg-002")).toBeUndefined();
  });

  it("getAll returns all stored summaries", () => {
    memo.set("chg-001", sampleSummary);
    memo.set("chg-002", { ...sampleSummary, id: "chg-002" });

    const all = memo.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.id).sort()).toEqual(["chg-001", "chg-002"]);
  });

  it("getAll returns empty array when empty", () => {
    expect(memo.getAll()).toEqual([]);
  });

  it("size returns current entry count", () => {
    expect(memo.size()).toBe(0);
    memo.set("chg-001", sampleSummary);
    expect(memo.size()).toBe(1);
    memo.set("chg-002", { ...sampleSummary, id: "chg-002" });
    expect(memo.size()).toBe(2);
    memo.invalidate("chg-001");
    expect(memo.size()).toBe(1);
  });

  it("bulkSet replaces all entries", () => {
    memo.set("old", sampleSummary);
    const entries: Array<[string, ChangeSummary]> = [
      ["chg-a", { ...sampleSummary, id: "chg-a" }],
      ["chg-b", { ...sampleSummary, id: "chg-b" }],
    ];
    memo.bulkSet(entries);
    expect(memo.size()).toBe(2);
    expect(memo.get("old")).toBeUndefined();
    expect(memo.get("chg-a")).toBeDefined();
    expect(memo.get("chg-b")).toBeDefined();
  });

  it("tracks hit/miss stats", () => {
    memo.set("chg-001", sampleSummary);

    // Hit
    memo.get("chg-001");
    // Miss
    memo.get("chg-999");

    const stats = memo.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it("resetStats clears counters", () => {
    memo.set("chg-001", sampleSummary);
    memo.get("chg-001");
    memo.resetStats();
    expect(memo.getStats()).toEqual({ hits: 0, misses: 0 });
  });
});
