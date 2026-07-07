/**
 * Bun tests for roadmap render without scoring columns
 *
 * Run with: bun test bin/lib/roadmap-render-no-scoring-cols.test.ts
 */

import { describe, expect, test } from "bun:test";
import { renderRoadmap } from "./roadmap";
import type { RoadmapSnapshot } from "./roadmap";

function makeSnapshot(): RoadmapSnapshot {
  return {
    version: 1,
    generated_at: "2024-06-01T12:00:00Z",
    project: { owner: "sharper-flow", number: 7, title: "Advance" },
    counts: { total: 3, bugs: 1, features: 1, deferred: 1 },
    bugs: [
      {
        number: 1,
        title: "Crash on startup",
        priority: "critical",
        labels: ["bug", "priority:critical"],
      },
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
        labels: ["feature"],
      },
    ],
    deferred: [{ number: 20, title: "Future idea", reason: "user-deferred" }],
  };
}

describe("renderRoadmap drops scoring columns", () => {
  test("feature table header contains only #, Title, Labels", () => {
    const out = renderRoadmap(makeSnapshot(), {}, false);

    expect(out).toContain("| # | Title | Labels |");
    expect(out).not.toContain("| V |");
    expect(out).not.toContain("| TC |");
    expect(out).not.toContain("| RROE |");
    expect(out).not.toContain("| E |");
    expect(out).not.toContain("| WSJF |");
  });

  test("feature table rows omit scoring values", () => {
    const out = renderRoadmap(makeSnapshot(), {}, false);

    const featureLine = out.split("\n").find((line) =>
      line.includes("Add dark mode"),
    );
    expect(featureLine).toBeDefined();
    expect(featureLine).toMatch(/^\| #10 \| Add dark mode \|  \|$/);
    expect(featureLine).not.toContain("21");
    expect(featureLine).not.toContain("8");
  });

  test("feature section header does not mention WSJF", () => {
    const out = renderRoadmap(makeSnapshot(), {}, false);

    expect(out).toContain("Features");
    expect(out).not.toMatch(/Features.*WSJF/i);
  });

  test("top option suffix does not mention WSJF", () => {
    const out = renderRoadmap(makeSnapshot(), { top: 1 }, false);

    expect(out).toContain("Features (top 1)");
    expect(out).not.toContain("by WSJF");
  });
});
