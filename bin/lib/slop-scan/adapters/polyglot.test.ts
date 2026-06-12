import { describe, expect, test } from "bun:test";

import { buildAstGrepCommand, normalizeAstGrepJson } from "./ast-grep";
import { buildJscpdCommand, normalizeJscpdReport } from "./jscpd";
import { normalizeSemgrepExternalCoverage } from "./external-ci";

describe("polyglot slop adapters", () => {
  test("normalizes ast-grep JSON structural matches", () => {
    const findings = normalizeAstGrepJson(
      JSON.stringify([
        {
          ruleId: "STRUCT-004",
          message: "Single-implementation abstraction",
          file: "/repo/src/service.ts",
          range: { start: { line: 8, column: 1 }, end: { line: 12, column: 1 } },
          severity: "warning",
        },
      ]),
      "/repo",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "STRUCT-004",
      name: "structural_pattern_match",
      file: "src/service.ts",
      line: 8,
      detectionMethod: "ast",
      actionability: "review_required",
    });
  });

  test("normalizes jscpd duplicate report", () => {
    const findings = normalizeJscpdReport({
      duplicates: [
        {
          format: "typescript",
          lines: 18,
          tokens: 130,
          firstFile: { name: "src/a.ts", start: 10, end: 28 },
          secondFile: { name: "src/b.ts", start: 40, end: 58 },
        },
      ],
      statistics: { total: { percentage: 6.2, clones: 1, duplicatedLines: 18 } },
    });

    expect(findings[0]).toMatchObject({
      id: "STRUCT-002",
      name: "duplicate_code_block",
      file: "src/a.ts",
      line: 10,
      detectionMethod: "tool",
      complexity: 18,
    });
  });

  test("marks Semgrep PR security gate as externally covered", () => {
    const coverage = normalizeSemgrepExternalCoverage(`
jobs:
  security-gates:
    uses: Sharper-Flow/sharperflow-security-gates/.github/workflows/javascript-security-gate.yml@v0
    with:
      semgrep-configs: "p/javascript p/typescript"
`);

    expect(coverage).toMatchObject({
      id: "external-ci-semgrep",
      state: "externally_covered",
      important: false,
    });
    expect(coverage.reason).toContain("p/javascript p/typescript");
  });

  test("builds polyglot commands without network installers", () => {
    const commands = [buildAstGrepCommand("."), buildJscpdCommand(".", "temp/slop-scan")];
    for (const command of commands) {
      expect(command.join(" ")).not.toContain(" dlx ");
      expect(command.join(" ")).not.toContain(" npx ");
      expect(command.join(" ")).not.toContain(" go install ");
      expect(command.join(" ")).not.toContain(" pip install ");
    }
  });
});
