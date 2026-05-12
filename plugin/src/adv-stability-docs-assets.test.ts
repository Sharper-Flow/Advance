import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("ADV stability hardening docs", () => {
  test("ADV_INSTRUCTIONS documents machine-enforced worktree guard behavior", () => {
    const instructions = readRepoFile("ADV_INSTRUCTIONS.md");

    for (const marker of [
      "worktree_guard_enforce=true",
      "WorktreeIsolationViolation",
      "mainCheckoutPath",
      "adv_worktree_resume",
      "Proposal gate remains exempt",
    ]) {
      expect(instructions).toContain(marker);
    }
  });

  test("ADV_INSTRUCTIONS documents stability feature flag defaults and worker role", () => {
    const instructions = readRepoFile("ADV_INSTRUCTIONS.md");

    for (const marker of [
      "worker_singleton_enforce default true",
      "worktree_guard_enforce default false",
      "ADV_FORCE_IN_PROCESS_WORKER=1",
      "worker_role",
      "host",
      "client",
      "degraded",
    ]) {
      expect(instructions).toContain(marker);
    }
  });

  test("ADV_INSTRUCTIONS documents probe freshness safety semantics", () => {
    const instructions = readRepoFile("ADV_INSTRUCTIONS.md");

    for (const marker of [
      "_freshness",
      "cached_at",
      "stale",
      "diagnostic-only",
      "never use stale probe data",
    ]) {
      expect(instructions).toContain(marker);
    }
  });

  test("related operator docs mirror worktree and Temporal recovery semantics", () => {
    const worktreeGuide = readRepoFile("docs/worktree-guide.md");
    const temporalRecovery = readRepoFile("docs/temporal-recovery.md");

    expect(worktreeGuide).toContain("worktree_guard_enforce default false");
    expect(worktreeGuide).toContain("WorktreeIsolationViolation");
    expect(worktreeGuide).toContain("adv_worktree_resume");

    expect(temporalRecovery).toContain("worker_singleton_enforce default true");
    expect(temporalRecovery).toContain("ADV_FORCE_IN_PROCESS_WORKER=1");
    expect(temporalRecovery).toContain(
      "Stale `_freshness` values are diagnostic-only",
    );
  });
});
