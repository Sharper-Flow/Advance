import { describe, expect, test } from "bun:test";

import { buildEmptySlopScanReport } from "./schema";
import { renderSlopScanReport } from "./render";

describe("slop-scan renderer", () => {
  test("renders prominent warnings for important unavailable detectors", () => {
    const report = buildEmptySlopScanReport({
      repoRoot: "/repo",
      requestedPath: ".",
      languages: ["python"],
    });
    report.coverage.detectors.push({
      id: "vulture",
      label: "Vulture",
      state: "unavailable",
      reason: "vulture not found",
      important: true,
    });

    const output = renderSlopScanReport(report, false);
    expect(output).toContain("SLOP SCAN REPORT");
    expect(output).toContain("PROMINENT COVERAGE WARNINGS");
    expect(output).toContain("Vulture: unavailable — vulture not found");
    expect(output).not.toContain("[OK] No slop detected.");
  });
});
