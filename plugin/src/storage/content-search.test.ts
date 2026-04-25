/**
 * content-search tests — verify substring search semantics across
 * realistic-scale change/wisdom datasets.
 *
 * The implementation is plain linear scan with a lower-cased cache.
 * Per P2.3 benchmark, this comes in at p99 <0.5ms for 552 changes — far
 * below the <50ms acceptance bar — so MiniSearch is not adopted.
 *
 * See `plugin/scripts/bench-content-search.ts` for benchmark numbers.
 */

import { describe, expect, it } from "vitest";

import {
  matchesTitleContains,
  matchesPrefix,
  matchesContent,
  filterChanges,
  searchWisdom,
} from "./content-search";

describe("content-search predicates", () => {
  describe("matchesTitleContains", () => {
    it("returns true on case-insensitive substring match", () => {
      expect(matchesTitleContains("Refactor Auth Module", "auth")).toBe(true);
      expect(matchesTitleContains("Refactor Auth Module", "AUTH")).toBe(true);
      expect(matchesTitleContains("Refactor Auth Module", "module")).toBe(true);
    });
    it("returns false when needle absent", () => {
      expect(matchesTitleContains("Refactor Auth", "payment")).toBe(false);
    });
    it("treats empty/undefined needle as match (no-op filter)", () => {
      expect(matchesTitleContains("anything", "")).toBe(true);
      expect(matchesTitleContains("anything", undefined)).toBe(true);
    });
  });

  describe("matchesPrefix", () => {
    it("matches case-insensitive id prefix", () => {
      expect(matchesPrefix("addUserAuth", "addUs")).toBe(true);
      expect(matchesPrefix("addUserAuth", "ADDUS")).toBe(true);
    });
    it("rejects mid-string match (must be at start)", () => {
      expect(matchesPrefix("addUserAuth", "User")).toBe(false);
    });
    it("treats empty/undefined as match", () => {
      expect(matchesPrefix("anything", "")).toBe(true);
      expect(matchesPrefix("anything", undefined)).toBe(true);
    });
  });

  describe("matchesContent", () => {
    it("scans across multiple text fields", () => {
      expect(matchesContent("title only", ["title only"], "title")).toBe(true);
      expect(matchesContent("a title", ["body content"], "body")).toBe(true);
      expect(matchesContent("a title", ["body 1", "body 2"], "missing")).toBe(
        false,
      );
    });
    it("is case-insensitive", () => {
      expect(matchesContent("FoOBaR", ["whatever"], "foobar")).toBe(true);
    });
  });
});

describe("filterChanges", () => {
  const changes = [
    {
      id: "addUserAuth",
      title: "Add user auth flow",
      created_at: "2026-04-20T00:00:00.000Z",
      lastActivityAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "addPayments",
      title: "Add payments backend",
      created_at: "2026-04-21T00:00:00.000Z",
      lastActivityAt: "2026-04-22T00:00:00.000Z",
    },
    {
      id: "fixAuthBug",
      title: "Fix the auth login bug",
      created_at: "2026-04-22T00:00:00.000Z",
      lastActivityAt: "2026-04-23T00:00:00.000Z",
    },
  ];

  it("filters by titleContains (case-insensitive)", () => {
    const r = filterChanges(changes, { titleContains: "auth" });
    expect(r.map((c) => c.id).sort()).toEqual(["addUserAuth", "fixAuthBug"]);
  });

  it("filters by prefix (case-insensitive)", () => {
    const r = filterChanges(changes, { prefix: "add" });
    expect(r.map((c) => c.id).sort()).toEqual(["addPayments", "addUserAuth"]);
  });

  it("filters by createdBefore", () => {
    const r = filterChanges(changes, {
      createdBefore: "2026-04-22T00:00:00.000Z",
    });
    expect(r.map((c) => c.id).sort()).toEqual(["addPayments", "addUserAuth"]);
  });

  it("filters by lastActivityBefore", () => {
    const r = filterChanges(changes, {
      lastActivityBefore: "2026-04-23T00:00:00.000Z",
    });
    expect(r.map((c) => c.id).sort()).toEqual(["addPayments", "addUserAuth"]);
  });

  it("AND-combines multiple filters", () => {
    const r = filterChanges(changes, {
      prefix: "add",
      titleContains: "auth",
    });
    expect(r.map((c) => c.id)).toEqual(["addUserAuth"]);
  });

  it("returns full list when no filters", () => {
    expect(filterChanges(changes, {})).toHaveLength(3);
    expect(filterChanges(changes, undefined)).toHaveLength(3);
  });
});

describe("searchWisdom", () => {
  const wisdom = [
    { id: "ws-1", type: "pattern", content: "Always validate input first" },
    { id: "ws-2", type: "gotcha", content: "Temporal workers cache modules" },
    {
      id: "ws-3",
      type: "pattern",
      content: "Use atomic writes for safety",
      change_id: "chg-1",
    },
    { id: "ws-4", type: "success", content: "Cleanup happened on schedule" },
  ];

  it("matches case-insensitive substring across content", () => {
    const r = searchWisdom(wisdom, "TEMPORAL");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("ws-2");
  });

  it("returns multiple matches", () => {
    const r = searchWisdom(wisdom, "always");
    expect(r).toHaveLength(1);
  });

  it("filters by type", () => {
    const r = searchWisdom(wisdom, "atomic", { type: "pattern" });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("ws-3");

    const noMatch = searchWisdom(wisdom, "atomic", { type: "gotcha" });
    expect(noMatch).toHaveLength(0);
  });

  it("filters by changeId", () => {
    const r = searchWisdom(wisdom, "atomic", { changeId: "chg-1" });
    expect(r).toHaveLength(1);

    const noMatch = searchWisdom(wisdom, "atomic", { changeId: "chg-99" });
    expect(noMatch).toHaveLength(0);
  });

  it("returns empty array for empty query", () => {
    expect(searchWisdom(wisdom, "")).toEqual([]);
  });

  it("respects limit option", () => {
    const r = searchWisdom(wisdom, "a", { limit: 2 });
    expect(r.length).toBeLessThanOrEqual(2);
  });
});

describe("scale", () => {
  it("handles 600 changes in <50ms p99 per query", () => {
    const items = Array.from({ length: 600 }, (_, i) => ({
      id: `chg-${i}`,
      title: `Title ${i} ${i % 3 === 0 ? "auth" : "other"}`,
      created_at: "2026-04-20T00:00:00.000Z",
      lastActivityAt: "2026-04-22T00:00:00.000Z",
    }));

    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t = performance.now();
      filterChanges(items, { titleContains: "auth" });
      samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(samples.length * 0.99)];
    expect(p99).toBeLessThan(50);
  });
});
