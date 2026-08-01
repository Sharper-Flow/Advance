import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { attachOptScanFailure, runOptScan } from "./scan";
import { OPTIMIZATION_DETECTORS } from "./registry";

describe("runOptScan", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "opt-scan-scan-"));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  test("returns a stable v1 report envelope", async () => {
    const result = await runOptScan({ repoRoot });

    expect(result.schema_version).toBe("opt_scan_report.v1");
    expect(typeof result.generated_at).toBe("string");
    expect(result.scope.repoRoot).toBe(repoRoot);
    expect(result.scope.phase).toBe("all");
    expect(result.candidates).toEqual([]);
  });

  test("runs all four Phase 1 detectors against an empty repo", async () => {
    const result = await runOptScan({ repoRoot });

    expect(result.coverage).toHaveLength(OPTIMIZATION_DETECTORS.length);
    const ids = new Set(result.coverage.map((c) => c.id));
    for (const detector of OPTIMIZATION_DETECTORS) {
      expect(ids.has(detector.id)).toBe(true);
    }
    expect(result.coverage.every((c) => c.state === "run")).toBe(true);
  });

  test("phase filter excludes detectors not in the selected phase", async () => {
    const result = await runOptScan({ repoRoot, phase: 3 });

    expect(result.coverage).toHaveLength(0);
  });

  test("detectorId filter narrows coverage to a single detector", async () => {
    const result = await runOptScan({
      repoRoot,
      detectorId: "repeated_boundary_work",
    });

    expect(result.coverage).toHaveLength(1);
    expect(result.coverage[0].id).toBe("repeated_boundary_work");
  });

  test("unknown detectorId yields a skipped coverage entry", async () => {
    const result = await runOptScan({
      repoRoot,
      detectorId: "does-not-exist",
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.coverage).toEqual([
      {
        id: "does-not-exist",
        label: "does-not-exist",
        state: "skipped",
        reason: "detector id not found in registry",
        important: true,
      },
    ]);
  });

  test("does not emit a failure when detectors are merely skipped", async () => {
    const result = await runOptScan({ repoRoot });

    expect(result.failure).toBeUndefined();
  });

  test("attaches failure only for important degraded coverage and clears stale failure state", () => {
    const base = {
      schema_version: "opt_scan_report.v1" as const,
      generated_at: "2026-08-01T00:00:00.000Z",
      scope: { repoRoot, phase: "all" as const },
      candidates: [],
    };
    const degraded = attachOptScanFailure({
      ...base,
      coverage: [
        { id: "optional", label: "Optional", state: "failed", reason: "ignored", important: false },
        { id: "required", label: "Required", state: "degraded", reason: "broken", important: true },
      ],
    });

    expect(degraded.failure?.code).toBe("OPT_SCAN_DEGRADED");
    expect(degraded.failure?.failedDetectors.map((entry) => entry.id)).toEqual(["required"]);

    const recovered = attachOptScanFailure({
      ...base,
      coverage: [
        { id: "required", label: "Required", state: "run", reason: "complete", important: true },
      ],
      failure: degraded.failure,
    });
    expect(recovered.failure).toBeUndefined();
  });
});
