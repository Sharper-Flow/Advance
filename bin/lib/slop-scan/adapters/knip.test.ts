import { describe, expect, test } from "bun:test";

import { normalizeKnipJson } from "./knip";

describe("Knip slop adapter", () => {
  test("normalizes unused files, exports, and dependencies as review-required deletion candidates", () => {
    const findings = normalizeKnipJson(
      JSON.stringify({
        files: ["src/dead.ts"],
        exports: [
          { file: "src/util.ts", line: 6, name: "unusedUtil" },
        ],
        dependencies: ["left-pad"],
      }),
      "/repo",
    );

    expect(findings.map((finding) => finding.name)).toEqual([
      "unused_file",
      "unused_export",
      "unused_dependency",
    ]);
    expect(findings.every((finding) => finding.id === "MAINT-003")).toBe(true);
    expect(findings.every((finding) => finding.actionability === "review_required")).toBe(true);
    expect(findings.every((finding) => finding.grouping === "user-review")).toBe(true);
  });
});
