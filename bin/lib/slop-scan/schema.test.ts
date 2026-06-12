import { describe, expect, test } from "bun:test";

import {
  COVERAGE_STATES,
  SLOP_SEVERITIES,
  buildEmptySlopScanReport,
  summarizeFindings,
  validateSlopScanReport,
  type SlopScanFinding,
} from "./schema";

describe("slop-scan schema", () => {
  test("exports canonical severities and coverage states", () => {
    expect(SLOP_SEVERITIES).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
    expect(COVERAGE_STATES).toEqual([
      "run",
      "skipped",
      "degraded",
      "failed",
      "timed_out",
      "unavailable",
      "externally_covered",
    ]);
  });

  test("builds an empty report with detector coverage", () => {
    const report = buildEmptySlopScanReport({
      repoRoot: "/repo",
      requestedPath: "src",
      languages: ["typescript"],
    });

    expect(report.scope.repoRoot).toBe("/repo");
    expect(report.summary.total).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.coverage.detectors).toEqual([]);
  });

  test("summarizes findings by severity and category", () => {
    const findings: SlopScanFinding[] = [
      {
        id: "MAINT-004",
        name: "complexity_hotspot",
        severity: "MEDIUM",
        category: "Code Quality",
        file: "src/a.ts",
        line: 12,
        description: "Complex function",
        fix: "Split function",
        confidence: "high",
        detectionMethod: "ast",
        grouping: "actionable",
        actionability: "blocking",
        phase: 1,
        nestingDepth: 5,
        complexity: 12,
      },
      {
        id: "MAINT-003",
        name: "unused_export",
        severity: "LOW",
        category: "Dead Code",
        file: "src/b.ts",
        line: 7,
        description: "Unused export",
        fix: "Verify before removal",
        confidence: "medium",
        detectionMethod: "tool",
        grouping: "user-review",
        actionability: "review_required",
        phase: 1,
        nestingDepth: null,
        complexity: null,
      },
    ];

    expect(summarizeFindings(findings)).toEqual({
      total: 2,
      bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 1 },
      byCategory: { "Code Quality": 1, "Dead Code": 1 },
    });
  });

  test("validates full report shape and rejects unknown coverage state", () => {
    const report = buildEmptySlopScanReport({
      repoRoot: "/repo",
      requestedPath: ".",
      languages: ["typescript"],
    });
    report.coverage.detectors.push({
      id: "eslint",
      label: "ESLint",
      state: "externally_covered",
      reason: "covered by PR gate",
      important: false,
    });

    expect(validateSlopScanReport(report).ok).toBe(true);

    const invalid = structuredClone(report) as any;
    invalid.coverage.detectors[0].state = "maybe";
    const result = validateSlopScanReport(invalid);
    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("coverage.detectors[0].state");
  });
});
