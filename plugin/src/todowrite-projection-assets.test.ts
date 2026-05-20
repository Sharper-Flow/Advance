import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = join(__dirname, "../..");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("TodoWrite projection guidance assets", () => {
  test("ADV instructions describe TodoWrite as projection-bound", () => {
    const content = readRepoFile("ADV_INSTRUCTIONS.md");

    expect(content).toContain("TodoWrite during ADV execution is a projection");
    expect(content).toContain("_todoProjection");
    expect(content).toContain("tk-abc123 — title");
    expect(content).toContain("scratchpad-only/warning-first");
  });

  test("adv-apply command documents block and allowance cases", () => {
    const content = readRepoFile(".opencode/command/adv-apply.md");

    expect(content).toContain("TodoWrite is a projection over ADV tasks");
    expect(content).toContain("Unknown `tk-*` IDs");
    expect(content).toContain("other-change IDs");
    expect(content).toContain("subagent scratchpads remain allowed");
  });
});
