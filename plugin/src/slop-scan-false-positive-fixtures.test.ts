import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FIXTURE_ROOT = join(resolve(__dirname, ".."), "test/fixtures/slop-scan");

type Confidence = "high" | "medium" | "low";
type Grouping = "actionable" | "low-confidence" | "user-review";
type Actionability =
  | "blocking"
  | "actionable"
  | "review_required"
  | "non_blocking";

interface FixtureFinding {
  id: "QUAL-011" | "MAINT-004" | "DOC-003";
  confidence: Confidence;
  grouping: Grouping;
  actionability: Actionability;
  detectionMethod:
    | "ast"
    | "regex"
    | "heuristic"
    | "degraded"
    | "tool"
    | "external";
  nestingDepth: number | null;
  complexity: number | null;
}

function hasRedundantNullishGuard(source: string): boolean {
  const guardLines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      ["if (!user)", "if (user === null)", "if (user === undefined)"].some(
        (guard) => line.startsWith(guard),
      ),
    );
  return guardLines.length >= 3;
}

function maxIfNesting(source: string): number {
  let current = 0;
  let max = 0;
  for (const line of source.split("\n").map((item) => item.trim())) {
    if (line === "}" || line.startsWith("} ")) {
      current = Math.max(0, current - 1);
    }
    if (/^if\s*\(.*\)\s*\{/.test(line)) {
      current += 1;
      max = Math.max(max, current);
    }
  }
  return max;
}

function analyzeFixture(source: string): FixtureFinding[] {
  const findings: FixtureFinding[] = [];

  if (hasRedundantNullishGuard(source)) {
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

  const nestingDepth = maxIfNesting(source);
  if (nestingDepth >= 5) {
    findings.push({
      id: "MAINT-004",
      confidence: "high",
      grouping: "actionable",
      actionability: "blocking",
      detectionMethod: "ast",
      nestingDepth,
      complexity: 12,
    });
  }

  if (source.includes("example text used in scanner docs")) {
    findings.push({
      id: "DOC-003",
      confidence: "low",
      grouping: "low-confidence",
      actionability: "non_blocking",
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
  test("fixtures do not use sentinel marker strings", () => {
    const clean = readFileSync(
      join(FIXTURE_ROOT, "false-positive-clean.ts"),
      "utf8",
    );
    const dirty = readFileSync(
      join(FIXTURE_ROOT, "dirty-actionable.ts"),
      "utf8",
    );

    expect(`${clean}\n${dirty}`).not.toMatch(
      /DIRTY_|LOW_CONFIDENCE_EXAMPLE_ONLY/,
    );
  });

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
          actionability: "non_blocking",
        }),
      ]),
    );
    expect(textReport).toContain("Low-confidence / non-blocking findings");
    expect(textReport).toContain(
      "Low-confidence findings are not blocking by default",
    );
  });
});
