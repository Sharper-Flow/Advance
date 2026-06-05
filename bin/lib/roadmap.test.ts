/**
 * Bun tests for bin/lib/roadmap.ts
 *
 * Run with: bun test bin/lib/roadmap.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  readSnapshotFile,
  assessFileFreshness,
  sortFeaturesByWsjf,
  groupBugsByPriority,
  applyFilters,
  renderRoadmap,
  roadmapJson,
} from "./roadmap";
import type {
  RoadmapSnapshot,
  RoadmapBug,
  RoadmapFeature,
  RoadmapDeferred,
} from "./roadmap";

import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";

// =============================================================================
// Fixture
// =============================================================================

function makeSnapshot(
  overrides: Partial<RoadmapSnapshot> = {},
): RoadmapSnapshot {
  return {
    version: 1,
    generated_at: "2024-06-01T12:00:00Z",
    project: { owner: "sharper-flow", number: 7, title: "Advance" },
    counts: { total: 5, bugs: 2, features: 2, deferred: 1 },
    bugs: [
      {
        number: 1,
        title: "Crash on startup",
        priority: "critical",
        labels: [],
      },
      { number: 2, title: "Typo in docs", priority: "low", labels: [] },
    ],
    features: [
      {
        number: 10,
        title: "Add dark mode",
        value: 8,
        time_criticality: 7,
        rroe: 6,
        effort: 2,
        wsjf: 21,
        labels: [],
      },
      {
        number: 11,
        title: "Add light mode",
        value: 5,
        time_criticality: 4,
        rroe: 3,
        effort: 1,
        wsjf: null,
        labels: [],
      },
    ],
    deferred: [{ number: 20, title: "Future idea", reason: "missing Value" }],
    ...overrides,
  };
}

// =============================================================================
// readSnapshotFile
// =============================================================================

describe("readSnapshotFile", () => {
  test("returns actionable error on ENOENT", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-roadmap-"));
    const result = await readSnapshotFile(tmp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not found");
      expect(result.hint).toContain("/adv-triage");
    }
  });

  test("reads valid snapshot", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-roadmap-"));
    await mkdir(join(tmp, ".adv"), { recursive: true });
    await writeFile(
      join(tmp, ".adv/roadmap-snapshot.json"),
      JSON.stringify(makeSnapshot()),
    );
    const result = await readSnapshotFile(tmp);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.project.number).toBe(7);
    }
  });

  test("rejects malformed snapshot", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-roadmap-"));
    await mkdir(join(tmp, ".adv"), { recursive: true });
    await writeFile(
      join(tmp, ".adv/roadmap-snapshot.json"),
      JSON.stringify({
        version: 2,
        generated_at: "x",
        bugs: [],
        features: [],
        deferred: [],
      }),
    );
    const result = await readSnapshotFile(tmp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unexpected shape");
    }
  });

  test("rejects missing generated_at", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "adv-roadmap-"));
    await mkdir(join(tmp, ".adv"), { recursive: true });
    await writeFile(
      join(tmp, ".adv/roadmap-snapshot.json"),
      JSON.stringify({ version: 1, bugs: [], features: [], deferred: [] }),
    );
    const result = await readSnapshotFile(tmp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unexpected shape");
    }
  });
});

// =============================================================================
// assessFileFreshness
// =============================================================================

describe("assessFileFreshness", () => {
  test("fresh when within 2h", () => {
    const now = new Date("2024-06-01T13:00:00Z");
    const f = assessFileFreshness("2024-06-01T12:00:00Z", now);
    expect(f.status).toBe("fresh");
    expect(f.stale_after_hours).toBe(2);
    expect(f.needs_refresh).toBe(false);
    expect(f.age_hours).toBe(1);
  });

  test("stale when over 2h", () => {
    const now = new Date("2024-06-01T15:00:01Z");
    const f = assessFileFreshness("2024-06-01T12:00:00Z", now);
    expect(f.status).toBe("stale");
    expect(f.needs_refresh).toBe(true);
    expect(f.age_hours).toBeGreaterThan(2);
  });

  test("unknown for unparseable date", () => {
    const f = assessFileFreshness("not-a-date");
    expect(f.status).toBe("unknown");
    expect(f.age_hours).toBeNull();
    expect(f.needs_refresh).toBe(true);
  });
});

// =============================================================================
// sortFeaturesByWsjf
// =============================================================================

describe("sortFeaturesByWsjf", () => {
  test("sorts descending by wsjf", () => {
    const features: RoadmapFeature[] = [
      {
        number: 1,
        title: "A",
        value: 1,
        time_criticality: 1,
        rroe: 1,
        effort: 1,
        wsjf: 5,
        labels: [],
      },
      {
        number: 2,
        title: "B",
        value: 1,
        time_criticality: 1,
        rroe: 1,
        effort: 1,
        wsjf: 10,
        labels: [],
      },
    ];
    const sorted = sortFeaturesByWsjf(features);
    expect(sorted.map((f) => f.number)).toEqual([2, 1]);
  });

  test("null wsjf sorts last", () => {
    const features: RoadmapFeature[] = [
      {
        number: 1,
        title: "A",
        value: 1,
        time_criticality: 1,
        rroe: 1,
        effort: 1,
        wsjf: null,
        labels: [],
      },
      {
        number: 2,
        title: "B",
        value: 1,
        time_criticality: 1,
        rroe: 1,
        effort: 1,
        wsjf: 1,
        labels: [],
      },
    ];
    const sorted = sortFeaturesByWsjf(features);
    expect(sorted.map((f) => f.number)).toEqual([2, 1]);
  });

  test("tiebreak by value desc then number asc", () => {
    const features: RoadmapFeature[] = [
      {
        number: 3,
        title: "C",
        value: 2,
        time_criticality: 1,
        rroe: 1,
        effort: 1,
        wsjf: 5,
        labels: [],
      },
      {
        number: 2,
        title: "B",
        value: 3,
        time_criticality: 1,
        rroe: 1,
        effort: 1,
        wsjf: 5,
        labels: [],
      },
      {
        number: 1,
        title: "A",
        value: 3,
        time_criticality: 1,
        rroe: 1,
        effort: 1,
        wsjf: 5,
        labels: [],
      },
    ];
    const sorted = sortFeaturesByWsjf(features);
    // wsjf equal → value desc → number asc
    expect(sorted.map((f) => f.number)).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// groupBugsByPriority
// =============================================================================

describe("groupBugsByPriority", () => {
  test("groups into priority tiers", () => {
    const bugs: RoadmapBug[] = [
      { number: 1, title: "A", priority: "critical", labels: [] },
      { number: 2, title: "B", priority: "high", labels: [] },
      { number: 3, title: "C", priority: "medium", labels: [] },
      { number: 4, title: "D", priority: "low", labels: [] },
      { number: 5, title: "E", priority: null, labels: [] },
    ];
    const groups = groupBugsByPriority(bugs);
    expect(groups.critical.map((b) => b.number)).toEqual([1]);
    expect(groups.high.map((b) => b.number)).toEqual([2]);
    expect(groups.medium.map((b) => b.number)).toEqual([3]);
    expect(groups.low.map((b) => b.number)).toEqual([4]);
    expect(groups.unprioritized.map((b) => b.number)).toEqual([5]);
  });
});

// =============================================================================
// applyFilters
// =============================================================================

describe("applyFilters", () => {
  const snapshot = makeSnapshot();

  test("kind=bug drops features", () => {
    const f = applyFilters(snapshot, { kind: "bug" });
    expect(f.features).toHaveLength(0);
    expect(f.bugs.critical).toHaveLength(1);
  });

  test("kind=feature drops bugs", () => {
    const f = applyFilters(snapshot, { kind: "feature" });
    expect(f.bugs.critical).toHaveLength(0);
    expect(f.features).toHaveLength(2);
  });

  test("priority filters to single tier", () => {
    const f = applyFilters(snapshot, { priority: "critical" });
    expect(f.bugs.critical).toHaveLength(1);
    expect(f.bugs.high).toHaveLength(0);
    expect(f.bugs.low).toHaveLength(0);
    expect(f.bugs.unprioritized).toHaveLength(0);
  });

  test("top caps features after sort", () => {
    const f = applyFilters(snapshot, { top: 1 });
    expect(f.features).toHaveLength(1);
    expect(f.features[0].number).toBe(10); // higher wsjf
  });
});

// =============================================================================
// renderRoadmap
// =============================================================================

describe("renderRoadmap", () => {
  test("contains annotation-unavailable line", () => {
    const out = renderRoadmap(
      makeSnapshot(),
      {},
      false,
      new Date("2024-06-01T12:30:00Z"),
    );
    expect(out).toContain(
      "active-change annotation: unavailable in CLI file mode",
    );
  });

  test("never contains active change column", () => {
    const out = renderRoadmap(makeSnapshot(), {}, false);
    expect(out).not.toContain("Active change");
    expect(out).not.toContain("active_change");
  });

  test("shows bugs and features by default", () => {
    const out = renderRoadmap(makeSnapshot(), {}, false);
    expect(out).toContain("Bugs — critical");
    expect(out).toContain("Features");
    expect(out).toContain("#10");
    expect(out).toContain("#11");
  });

  test("skips empty sections with priority filter", () => {
    const out = renderRoadmap(makeSnapshot(), { priority: "high" }, false);
    expect(out).not.toContain("Bugs — critical");
    expect(out).toContain("(no bugs match priority=high)");
  });

  test("freshness line is present", () => {
    const out = renderRoadmap(
      makeSnapshot(),
      {},
      false,
      new Date("2024-06-01T12:30:00Z"),
    );
    expect(out).toContain("Freshness: fresh");
  });
});

// =============================================================================
// roadmapJson
// =============================================================================

describe("roadmapJson", () => {
  test("includes annotation-unavailable marker", () => {
    const json = roadmapJson(
      makeSnapshot(),
      {},
      new Date("2024-06-01T12:30:00Z"),
    );
    const parsed = JSON.parse(json);
    expect(parsed.active_change_annotation).toBe("unavailable_cli_file_mode");
  });

  test("includes filtered lists", () => {
    const json = roadmapJson(makeSnapshot(), {
      kind: "bug",
      priority: "critical",
    });
    const parsed = JSON.parse(json);
    expect(parsed.bugs.critical).toHaveLength(1);
    expect(parsed.features).toHaveLength(0);
    expect(parsed.source).toBe("file");
  });
});
