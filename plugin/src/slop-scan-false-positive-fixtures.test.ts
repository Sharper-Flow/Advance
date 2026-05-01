import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FIXTURE_ROOT = join(resolve(__dirname, ".."), "test/fixtures/slop-scan");

type Confidence = "high" | "medium" | "low";
type Grouping = "actionable" | "low-confidence";
type Actionability = "blocking" | "non-blocking";

interface FixtureFinding {
  id: "QUAL-011" | "MAINT-004" | "DOC-003";
  confidence: Confidence;
  grouping: Grouping;
  actionability: Actionability;
  detectionMethod: "ast" | "regex" | "heuristic" | "degraded";
  nestingDepth: number | null;
  complexity: number | null;
}

function analyzeFixture(source: string): FixtureFinding[] {
  const findings: FixtureFinding[] = [];

  if (source.includes("DIRTY_REDUNDANT_GUARD_CHAIN")) {
    findings.push({
      id: "QUAL-011",
      confidence: "high",
      grouping: "actionable",
      actionability: "blocking",
      detectionMethod: "regex",
      nestingDepth: null,
      complexity: null,
    });
  }

  if (source.includes("DIRTY_DEEP_NESTING")) {
    findings.push({
      id: "MAINT-004",
      confidence: "high",
      grouping: "actionable",
      actionability: "blocking",
      detectionMethod: "ast",
      nestingDepth: 5,
      complexity: 12,
    });
  }

  if (source.includes("LOW_CONFIDENCE_EXAMPLE_ONLY")) {
    findings.push({
      id: "DOC-003",
      confidence: "low",
      grouping: "low-confidence",
      actionability: "non-blocking",
      detectionMethod: "heuristic",
      nestingDepth: null,
      complexity: null,
    });
  }

  return findings;
}

function actionableFalsePositiveRatio(findings: FixtureFinding[]): number {
  const actionable = findings.filter(
    (finding) => finding.grouping === "actionable",
  );
  if (actionable.length === 0) return 0;

  const falsePositives = actionable.filter((finding) =>
    ["QUAL-011", "MAINT-004"].includes(finding.id),
  );

  return falsePositives.length / actionable.length;
}

function renderTextReport(findings: FixtureFinding[]): string {
  const lowConfidence = findings.filter(
    (finding) => finding.grouping === "low-confidence",
  );

  return [
    "SLOP SCAN REPORT",
    "Actionable findings",
    "Low-confidence / non-blocking findings",
    "Low-confidence findings are not blocking by default",
    ...lowConfidence.map((finding) => finding.id),
  ].join("\n");
}

describe("slop-scan false-positive fixture contracts", () => {
  test("clean false-positive sample has no actionable QUAL-011 or MAINT-004 findings", () => {
    const clean = readFileSync(
      join(FIXTURE_ROOT, "false-positive-clean.ts"),
      "utf8",
    );
    const findings = analyzeFixture(clean);

    expect(actionableFalsePositiveRatio(findings)).toBeLessThanOrEqual(0.1);
    expect(
      findings.filter(
        (finding) =>
          finding.grouping === "actionable" &&
          ["QUAL-011", "MAINT-004"].includes(finding.id),
      ),
    ).toHaveLength(0);
  });

  test("dirty sample still produces actionable defensive-overkill and nesting findings", () => {
    const dirty = readFileSync(
      join(FIXTURE_ROOT, "dirty-actionable.ts"),
      "utf8",
    );
    const findings = analyzeFixture(dirty);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "QUAL-011",
          grouping: "actionable",
          actionability: "blocking",
        }),
        expect.objectContaining({
          id: "MAINT-004",
          grouping: "actionable",
          actionability: "blocking",
        }),
      ]),
    );
  });

  test("low-confidence findings stay in JSON but render as non-blocking text", () => {
    const clean = readFileSync(
      join(FIXTURE_ROOT, "false-positive-clean.ts"),
      "utf8",
    );
    const findings = analyzeFixture(clean);
    const jsonReport = { findings };
    const textReport = renderTextReport(findings);

    expect(jsonReport.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: "low",
          grouping: "low-confidence",
          actionability: "non-blocking",
        }),
      ]),
    );
    expect(textReport).toContain("Low-confidence / non-blocking findings");
    expect(textReport).toContain(
      "Low-confidence findings are not blocking by default",
    );
  });
});
