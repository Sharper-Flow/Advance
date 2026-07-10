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
    expect(findings.every((finding) => finding.id === "MAINT-003")).toBe(true);
    expect(
      findings.every((finding) => finding.actionability === "review_required"),
    ).toBe(true);
    expect(findings.every((finding) => finding.grouping === "user-review")).toBe(
      true,
    );
    expect(findings[1]).toMatchObject({ file: "src/util.ts", line: 6 });
    expect(findings[2]).toMatchObject({ file: "src/util.ts" });
  });
});
