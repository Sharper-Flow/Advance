import { describe, expect, test } from "bun:test";

import { buildAstGrepCommand, normalizeAstGrepJson } from "./ast-grep";

describe("ast-grep slop adapter", () => {
  test("builds a pnpm-exec command that retains the absolute target", () => {
    const command = buildAstGrepCommand("/repo/plugin/src/a.ts");

    expect(command.slice(0, 3)).toEqual(["pnpm", "exec", "ast-grep"]);
    expect(command).toContain("scan");
    expect(command).toContain("--json=compact");
    expect(command[command.length - 1]).toBe("/repo/plugin/src/a.ts");
  });

  test("normalizes compact matches into structural findings with repo-relative files", () => {
    const findings = normalizeAstGrepJson(
      JSON.stringify([
        {
          ruleId: "no-debugger-statement",
          severity: "warning",
          message: "Leftover debugger statement.",
          file: "/repo/plugin/src/a.ts",
          range: { start: { line: 7, column: 2 } },
        },
      ]),
      "/repo",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "STRUCT-005",
      name: "structural_pattern_match",
      severity: "MEDIUM",
      category: "Structure",
      file: "plugin/src/a.ts",
      line: 7,
      confidence: "medium",
      detectionMethod: "ast",
      grouping: "user-review",
      actionability: "review_required",
    });
  });

  test("preserves canonical slop rule ids and maps error severity to HIGH", () => {
    const [finding] = normalizeAstGrepJson(
      JSON.stringify([
        {
          ruleId: "STRUCT-005",
          severity: "error",
          message: "structural match",
          file: "/repo/src/x.ts",
          range: { start: { line: 1 } },
        },
      ]),
      "/repo",
    );

    expect(finding.id).toBe("STRUCT-005");
    expect(finding.severity).toBe("HIGH");
  });
});
