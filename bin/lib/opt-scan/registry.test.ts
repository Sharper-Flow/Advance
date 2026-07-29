import { describe, expect, test } from "bun:test";

import {
  OPTIMIZATION_DETECTORS,
  detectorsByPhase,
  findOptimizationDetector,
  type OptimizationDetector,
} from "./registry";

describe("opt-scan detector registry", () => {
  test("registers exactly four detector families", () => {
    expect(OPTIMIZATION_DETECTORS).toHaveLength(4);
  });

  test("all entry ids are unique and match the documented catalog", () => {
    const ids = OPTIMIZATION_DETECTORS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "repeated_boundary_work",
      "avoidable_collection_work",
      "worker_startup_pressure",
      "cache_opportunity",
    ]);
  });

  test("every entry satisfies OptimizationDetector at compile time", () => {
    const _check: readonly OptimizationDetector[] = OPTIMIZATION_DETECTORS;
    expect(_check).toBe(OPTIMIZATION_DETECTORS);
  });

  test("detection_phase is always 1 or 3", () => {
    for (const entry of OPTIMIZATION_DETECTORS) {
      expect([1, 3]).toContain(entry.detection_phase);
    }
  });

  test("signal_class is static or measured", () => {
    for (const entry of OPTIMIZATION_DETECTORS) {
      expect(["static", "measured"]).toContain(entry.signal_class);
    }
  });

  test("severity and confidence stay within allowed literal unions", () => {
    const validSeverities = ["blocker", "major", "minor", "nit"];
    const validConfidences = ["high", "medium", "low"];
    for (const entry of OPTIMIZATION_DETECTORS) {
      expect(validSeverities).toContain(entry.severity_hint);
      expect(validConfidences).toContain(entry.confidence);
    }
  });

  test("every trigger pattern is a RegExp instance", () => {
    for (const entry of OPTIMIZATION_DETECTORS) {
      expect(entry.trigger.pattern).toBeInstanceOf(RegExp);
    }
  });

  test("trigger file_globs are non-empty strings", () => {
    for (const entry of OPTIMIZATION_DETECTORS) {
      expect(entry.trigger.file_globs.length).toBeGreaterThan(0);
      expect(
        entry.trigger.file_globs.every(
          (g) => typeof g === "string" && g.length > 0,
        ),
      ).toBe(true);
    }
  });

  test("regex patterns avoid catastrophic backtracking shapes", () => {
    const suspicious = /\((?:[^()+]*[+\*])\)[+\*]|(?:[+\*]\s*){2,}/;
    for (const entry of OPTIMIZATION_DETECTORS) {
      expect(suspicious.test(entry.trigger.pattern.source)).toBe(false);
    }
  });

  test("findOptimizationDetector returns a detector or undefined", () => {
    expect(findOptimizationDetector("repeated_boundary_work")?.id).toBe(
      "repeated_boundary_work",
    );
    expect(findOptimizationDetector("missing")).toBeUndefined();
  });

  test("detectorsByPhase filters by phase", () => {
    expect(detectorsByPhase(1).length).toBeGreaterThan(0);
    expect(detectorsByPhase(3).length).toBe(0);
  });
});
