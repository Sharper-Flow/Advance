import { describe, expect, test } from "bun:test";

import { buildJscpdCommand, normalizeJscpdJson } from "./jscpd";

describe("jscpd slop adapter", () => {
  test("builds a pnpm-exec command retaining absolute target and output dir", () => {
    const command = buildJscpdCommand("/repo/plugin/src", "/tmp/adv-out");

    expect(command.slice(0, 3)).toEqual(["pnpm", "exec", "jscpd"]);
    expect(command).toContain("--reporters");
    expect(command).toContain("json");
    expect(command).toContain("--output");
    expect(command).toContain("/tmp/adv-out");
    expect(command[command.length - 1]).toBe("/repo/plugin/src");
  });

  test("normalizes a duplicate report into STRUCT-002 findings", () => {
    const findings = normalizeJscpdJson(
      JSON.stringify({
        duplicates: [
          {
            format: "typescript",
            lines: 14,
            tokens: 90,
            firstFile: { name: "/repo/src/a.ts", start: 10 },
            secondFile: { name: "/repo/src/b.ts", start: 20 },
          },
        ],
        statistics: {},
      }),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "STRUCT-002",
      name: "duplicate_code_block",
      severity: "MEDIUM",
      category: "Duplication",
      file: "/repo/src/a.ts",
      line: 10,
      detectionMethod: "tool",
      grouping: "actionable",
      actionability: "actionable",
      complexity: 14,
    });
  });

  test("returns no findings for an empty duplicate set", () => {
    expect(
      normalizeJscpdJson(JSON.stringify({ duplicates: [], statistics: {} })),
    ).toEqual([]);
  });
});
