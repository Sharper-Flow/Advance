import { describe, expect, test } from "bun:test";

import { normalizeEslintJson } from "./eslint";
import { buildEslintCommand } from "./eslint";

describe("ESLint slop adapter", () => {
  test("normalizes complexity and max-depth messages into MAINT-004 findings", () => {
    const findings = normalizeEslintJson(
      JSON.stringify([
        {
          filePath: "/repo/src/hot.ts",
          messages: [
            {
              ruleId: "complexity",
              message: "Function has a complexity of 12.",
              line: 4,
            },
            {
              ruleId: "max-depth",
              message: "Blocks are nested too deeply (5).",
              line: 8,
            },
          ],
        },
      ]),
      "/repo",
    );

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      id: "MAINT-004",
      severity: "MEDIUM",
      category: "Code Quality",
      file: "src/hot.ts",
      line: 4,
      confidence: "high",
      detectionMethod: "ast",
      complexity: 12,
    });
    expect(findings[1].nestingDepth).toBe(5);
  });

  test("builds commands with configured thresholds", () => {
    const command = buildEslintCommand("src", { complexity: 13, maxDepth: 6 });

    expect(command).toContain("complexity: [warn, 13]");
    expect(command).toContain("max-depth: [warn, 6]");
  });
});
