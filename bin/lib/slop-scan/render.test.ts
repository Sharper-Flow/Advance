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

  test("renders category summary, diagnostic fields, and separated non-blocking groups", () => {
    const report = buildEmptySlopScanReport({
      repoRoot: "/repo",
      requestedPath: ".",
      languages: ["typescript"],
    });
    report.findings.push(
      {
        id: "MAINT-004",
        name: "deep_nesting",
        severity: "MEDIUM",
        category: "Code Quality",
        file: "src/hot.ts",
        line: 8,
        description: "Blocks are nested too deeply.",
        fix: "Flatten control flow.",
        confidence: "high",
        detectionMethod: "ast",
        grouping: "actionable",
        actionability: "actionable",
        phase: 1,
        nestingDepth: 5,
        complexity: null,
      },
      {
        id: "DOC-003",
        name: "example_text",
        severity: "LOW",
        category: "Documentation",
        file: "docs/example.md",
        line: 1,
        description: "Example-only signal.",
        fix: "Review if in product scope.",
        confidence: "low",
        detectionMethod: "heuristic",
        grouping: "low-confidence",
        actionability: "non_blocking",
        phase: 2,
        nestingDepth: null,
        complexity: null,
      },
    );
    report.summary = {
      total: 2,
      bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 1 },
      byCategory: { "Code Quality": 1, Documentation: 1 },
    };

    const output = renderSlopScanReport(report, false);
    expect(output).toContain("Categories: Code Quality 1, Documentation 1");
    expect(output).toContain("Actionable findings");
    expect(output).toContain("Evidence: ast, confidence high, nestingDepth 5");
    expect(output).toContain("Low-confidence / non-blocking findings");
    expect(output).toContain(
      "Low-confidence findings are not blocking by default.",
    );
  });
});
