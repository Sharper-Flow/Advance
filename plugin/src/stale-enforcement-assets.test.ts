import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("stale enforcement and guards documentation", () => {
  test("live ADV orchestration docs do not claim enforceTaskPolicy runtime enforcement", () => {
    for (const path of ["ADV_INSTRUCTIONS.md", ".opencode/agents/adv.md"]) {
      expect(readRepoFile(path), path).not.toMatch(/enforceTaskPolicy/);
    }
  });

  test("repository maps do not reference retired plugin/src/guards", () => {
    for (const path of ["README.md", "project.md"]) {
      expect(readRepoFile(path), path).not.toMatch(/src\/guards|guards\//);
    }
  });
});
