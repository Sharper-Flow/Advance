/** Unit tests for the arch-scan debt-marker helper. */

import { describe, expect, test } from "bun:test";

import { scanDebtMarkers } from "./debt-marker";

describe("scanDebtMarkers", () => {
  test("returns an empty result when no markers are present in the window", () => {
    const source = ["const x = 1;", "const y = 2;", "const z = 3;"].join("\n");
    const result = scanDebtMarkers(source, 2);
    expect(result).toEqual({
      present: false,
      expired: false,
      deadline: null,
      markers: [],
    });
  });

  test("captures a TODO marker at the exact aroundLine", () => {
    const source = [
      "const x = 1;",
      "// TODO refactor this",
      "const z = 3;",
    ].join("\n");
    const result = scanDebtMarkers(source, 2);
    expect(result.present).toBe(true);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0].match).toBe("TODO");
    expect(result.markers[0].line).toBe(2);
    // Comment captures the rest of the line after the marker.
    expect(result.markers[0].comment).toContain("refactor this");
  });

  test("parses an @YYYY-MM-DD deadline from a TODO comment", () => {
    const source = "// TODO @2026-08-15 ship this";
    const now = new Date("2026-08-01T00:00:00Z");
    const result = scanDebtMarkers(source, 1, { now });
    expect(result.deadline).toBe("2026-08-15");
    expect(result.expired).toBe(false);
  });

  test("classifies a past 'by YYYY-MM-DD' deadline as expired", () => {
    const source = "// TODO by 2020-01-01 this is overdue";
    const now = new Date("2026-07-20T00:00:00Z");
    const result = scanDebtMarkers(source, 1, { now });
    expect(result.deadline).toBe("2020-01-01");
    expect(result.expired).toBe(true);
  });

  test("finds a FIXME marker within the default 20-line window", () => {
    // Marker at line 50, aroundLine=60 -> window [40, 80] -> line 50 included.
    const lines: string[] = [];
    for (let i = 1; i <= 100; i++) {
      lines.push(i === 50 ? "// FIXME broken" : `const v${i} = ${i};`);
    }
    const source = lines.join("\n");
    const result = scanDebtMarkers(source, 60);
    expect(result.present).toBe(true);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0].match).toBe("FIXME");
    expect(result.markers[0].line).toBe(50);
  });

  test("does not find a FIXME marker outside the default 20-line window", () => {
    // Marker at line 10, aroundLine=60 -> window [40, 80] -> line 10 excluded.
    const lines: string[] = [];
    for (let i = 1; i <= 100; i++) {
      lines.push(i === 10 ? "// FIXME broken" : `const v${i} = ${i};`);
    }
    const source = lines.join("\n");
    const result = scanDebtMarkers(source, 60);
    expect(result.present).toBe(false);
    expect(result.markers).toHaveLength(0);
  });

  test("ignores a bare date without a deadline keyword", () => {
    const source = "// HACK 2026-08-15";
    const result = scanDebtMarkers(source, 1);
    expect(result.present).toBe(true);
    expect(result.deadline).toBe(null);
  });

  test("accepts a bare date when a deadline keyword is present", () => {
    const source = "// XXX due 2026-08-15";
    const result = scanDebtMarkers(source, 1);
    expect(result.present).toBe(true);
    expect(result.deadline).toBe("2026-08-15");
  });

  test("captures multiple markers within the window", () => {
    const source = [
      "// TODO first",
      "// FIXME second",
      "// HACK third",
    ].join("\n");
    const result = scanDebtMarkers(source, 2);
    expect(result.markers).toHaveLength(3);
    expect(result.markers.map((m) => m.match)).toEqual([
      "TODO",
      "FIXME",
      "HACK",
    ]);
    expect(result.markers.map((m) => m.line)).toEqual([1, 2, 3]);
  });

  // --- Acceptance-criteria edge cases ---

  test("returns an empty result for empty source", () => {
    const result = scanDebtMarkers("", 1);
    expect(result.present).toBe(false);
    expect(result.expired).toBe(false);
    expect(result.deadline).toBe(null);
    expect(result.markers).toHaveLength(0);
  });

  test("returns an empty result when aroundLine is out of range", () => {
    const source = "const x = 1;\n// TODO marker\n";
    const result = scanDebtMarkers(source, 1000);
    expect(result.present).toBe(false);
    expect(result.markers).toHaveLength(0);
  });

  test("does not throw on malformed dates and yields a null deadline", () => {
    const source = "// TODO @2026-13-45 invalid month/day";
    expect(() => scanDebtMarkers(source, 1)).not.toThrow();
    const result = scanDebtMarkers(source, 1);
    expect(result.deadline).toBe(null);
  });

  test("honors a custom windowLines option", () => {
    // Marker at line 10, aroundLine=60, windowLines=60 -> window [0, 120].
    const lines: string[] = [];
    for (let i = 1; i <= 100; i++) {
      lines.push(i === 10 ? "// FIXME broken" : `const v${i} = ${i};`);
    }
    const source = lines.join("\n");
    const result = scanDebtMarkers(source, 60, { windowLines: 60 });
    expect(result.present).toBe(true);
    expect(result.markers[0].line).toBe(10);
  });

  test("picks the chronologically earliest deadline across multiple markers", () => {
    const source = [
      "// TODO @2026-12-01 later",
      "// FIXME @2020-01-01 earlier",
    ].join("\n");
    const result = scanDebtMarkers(source, 1);
    expect(result.deadline).toBe("2020-01-01");
  });

  test("classifies a future deadline as not expired using the injected now", () => {
    const source = "// TODO @2030-01-01 far future";
    const now = new Date("2026-07-20T00:00:00Z");
    const result = scanDebtMarkers(source, 1, { now });
    expect(result.deadline).toBe("2030-01-01");
    expect(result.expired).toBe(false);
  });

  test("parses a 'deadline: YYYY-MM-DD' pattern", () => {
    const source = "// TODO deadline: 2026-09-01 review";
    const result = scanDebtMarkers(source, 1);
    expect(result.deadline).toBe("2026-09-01");
  });
});
