/**
 * ADV Cleanup Command + Skill Contract Assets Tests
 *
 * Verifies that `/adv-cleanup` command and `adv-cleanup` skill document
 * worktree drift-report behavior per rq-worktreeBoundedCleanup01:
 *   - Uses/reports `adv_worktree_triage`
 *   - Four worktree drift groups
 *   - Report-only for `--execute` (actual deletion owned by adv_worktree_delete /
 *     adv_worktree_cleanup)
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("adv-cleanup worktree drift-report contract", () => {
  const command = readRepoFile(".opencode/command/adv-cleanup.md");
  const skill = readRepoFile("skills/adv-cleanup/SKILL.md");

  test("command references adv_worktree_triage", () => {
    expect(command).toContain("adv_worktree_triage");
  });

  test("skill references adv_worktree_triage", () => {
    expect(skill).toContain("adv_worktree_triage");
  });

  test("command documents four worktree drift groups", () => {
    const lower = command.toLowerCase();
    expect(lower).toContain("safe");
    expect(lower).toContain("blocked");
    expect(lower).toContain("dirty");
    expect(lower).toContain("needs-investigation");
  });

  test("skill documents four worktree drift groups", () => {
    const lower = skill.toLowerCase();
    expect(lower).toContain("safe");
    expect(lower).toContain("blocked");
    expect(lower).toContain("dirty");
    expect(lower).toContain("needs-investigation");
  });

  test("command keeps worktree deletion report-only under --execute", () => {
    // Cleanup command must NOT perform actual worktree deletion even with --execute.
    // Deletion remains owned by adv_worktree_delete / adv_worktree_cleanup.
    expect(command).toMatch(/report-only|drift report|does not delete worktrees/i);
  });

  test("skill keeps worktree deletion report-only under --execute", () => {
    expect(skill).toMatch(/report-only|drift report|does not delete worktrees/i);
  });
});
