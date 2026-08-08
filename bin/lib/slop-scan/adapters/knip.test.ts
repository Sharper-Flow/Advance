import { describe, expect, test } from "bun:test";

import { buildKnipCommand, normalizeKnipJson } from "./knip";

describe("Knip slop adapter", () => {
  test("builds a pnpm-exec knip command", () => {
    expect(buildKnipCommand()).toEqual([
      "pnpm",
      "exec",
      "knip",
      "--reporter",
      "json",
    ]);
  });

  test("normalizes knip 6 issues into review-required deletion candidates", () => {
    const findings = normalizeKnipJson(
      JSON.stringify({
        issues: [
          {
            file: "src/dead.ts",
            files: [{ name: "src/dead.ts" }],
            exports: [],
            dependencies: [],
          },
          {
            file: "src/util.ts",
            files: [],
            exports: [{ name: "unusedUtil", line: 6 }],
            dependencies: [{ name: "left-pad" }],
          },
        ],
      }),
      "/repo",
    );

    expect(findings.map((finding) => finding.name)).toEqual([
      "unused_file",
      "unused_export",
      "unused_dependency",
    ]);
    expect(findings.slice(0, 2).every((finding) => finding.id === "MAINT-003")).toBe(
      true,
    );
    expect(findings[2].id).toBe("DEP-001");
    expect(
      findings.every((finding) => finding.actionability === "review_required"),
    ).toBe(true);
    expect(findings.every((finding) => finding.grouping === "user-review")).toBe(
      true,
    );
    expect(findings[1]).toMatchObject({ file: "src/util.ts", line: 6 });
    expect(findings[2]).toMatchObject({ file: "src/util.ts" });
  });

  test("normalizes unused type issues", () => {
    const findings = normalizeKnipJson(
      JSON.stringify({
        issues: [
          {
            file: "src/types.ts",
            types: [{ name: "UnusedOptions", line: 12 }],
          },
        ],
      }),
      "/repo",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "MAINT-003",
      name: "unused_type",
      file: "src/types.ts",
      line: 12,
      severity: "LOW",
    });
  });

  test("normalizes unused devDependency issues", () => {
    const findings = normalizeKnipJson(
      JSON.stringify({
        issues: [
          {
            file: "package.json",
            devDependencies: [{ name: "unused-dev-tool" }],
          },
        ],
      }),
      "/repo",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "DEP-001",
      name: "unused_dependency",
      file: "package.json",
      severity: "LOW",
    });
  });
});
