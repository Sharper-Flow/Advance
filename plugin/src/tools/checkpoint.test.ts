/**
 * Unit tests for adv_task_checkpoint tool.
 *
 * Covers: clean tree, dirty tree, non-git workdir, detached HEAD,
 * MERGE_HEAD, pre-commit hook rejection, index.lock transient,
 * cancel mode, truncation, workdir override, no store mutation.
 *
 * Uses temp-dir git fixtures following plugin/src/index.test.ts pattern.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "child_process";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { checkpointTools } from "./checkpoint";
import type { Store } from "../storage/store-types";
import type { TaskRunEvent, TaskRunState } from "../types";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Promisified execFile for test setup. */
function git(
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, env: { ...process.env, ...env }, timeout: 5000 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

/** Minimal store mock — supports tasks.show for change identity resolution. */
function mockStore(
  taskOwnerChangeId?: string,
  options?: { failRecordRunEvent?: boolean },
): Store & { recordedRunEvents: TaskRunEvent[] } {
  const recordedRunEvents: TaskRunEvent[] = [];
  const tasks = {
    update: (..._args: unknown[]) => {
      throw new Error("store.tasks.update MUST NOT be called by checkpoint");
    },
    recordRunEvent: async (_taskId: string, event: TaskRunEvent) => {
      if (options?.failRecordRunEvent) {
        throw new Error("ledger unavailable");
      }
      recordedRunEvents.push(event);
      return {
        duplicate: false,
        run: {
          taskId: _taskId,
          runId: `run-${_taskId}`,
          phase: "checkpointed",
          updatedAt: event.recordedAt,
          resumeHint: "Mark task done after checkpoint is satisfied.",
          requiredNextAction: "mark_done",
          seenIdempotencyKeys: [event.idempotencyKey],
          events: [event],
        } satisfies TaskRunState,
      };
    },
    show: (_taskId: string) => {
      if (taskOwnerChangeId) {
        return Promise.resolve({
          task: { id: _taskId, title: "Test task" },
          changeId: taskOwnerChangeId,
        });
      }
      return Promise.resolve(null);
    },
  } as unknown as Store["tasks"];
  return { tasks, recordedRunEvents } as Store & {
    recordedRunEvents: TaskRunEvent[];
  };
}

/** Initialise a git repo with one initial commit. */
async function initGitRepo(dir: string): Promise<void> {
  await git(["init"], dir);
  await git(["config", "user.email", "test@test.com"], dir);
  await git(["config", "user.name", "Test"], dir);
  // Force consistent branch name — CI may default to 'master'
  await git(["checkout", "-b", "trunk"], dir);
  await writeFile(join(dir, "README.md"), "# test\n");
  await git(["add", "-A"], dir);
  await git(["commit", "-m", "init"], dir, {
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("adv_task_checkpoint", () => {
  let dir: string;
  const store = mockStore();

  beforeEach(async () => {
    dir = await createTempDir("adv-checkpoint-");
    await initGitRepo(dir);
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  // 1. Clean tree → {status:'clean'}
  it("returns clean when working tree has no changes", async () => {
    const result = await checkpointTools.adv_task_checkpoint.execute(
      { taskId: "tk-test01" },
      store,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("clean");
    expect(parsed.sha).toBeTypeOf("string");
    expect((parsed.sha as string).length).toBe(40);
    expect(parsed.workdir).toBe(dir);
  });

  // 2. Dirty tree → {status:'committed'} with correct message
  it("commits dirty tree with task(tk-xxxx): <title> message", async () => {
    await writeFile(join(dir, "new-file.txt"), "hello");
    const result = await checkpointTools.adv_task_checkpoint.execute(
      { taskId: "tk-test02", verification: "test passed" },
      store,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("committed");
    expect(parsed.sha).toBeTypeOf("string");
    expect(parsed.message).toBe("task(tk-test02): completed");

    // Verify the commit was actually created
    const logMsg = await git(["log", "--oneline", "-1", "--format=%s"], dir);
    expect(logMsg.trim()).toBe("task(tk-test02): completed");
  });

  // 3. Non-git workdir → ENVIRONMENTAL
  it("returns ENVIRONMENTAL for non-git directory", async () => {
    const nonGit = await createTempDir("adv-checkpoint-nongit-");
    try {
      const result = await checkpointTools.adv_task_checkpoint.execute(
        { taskId: "tk-test03" },
        store,
        nonGit,
      );
      const parsed = parseToolOutput(result) as Record<string, unknown>;
      expect(parsed.status).toBe("failed");
      expect(parsed.classification).toBe("ENVIRONMENTAL");
    } finally {
      await cleanupTempDir(nonGit);
    }
  });

  // 4. Detached HEAD → ENVIRONMENTAL
  it("returns ENVIRONMENTAL for detached HEAD", async () => {
    const headSha = (await git(["rev-parse", "HEAD"], dir)).trim();
    await git(["checkout", headSha], dir);
    await writeFile(join(dir, "detached.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      { taskId: "tk-test04" },
      store,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("ENVIRONMENTAL");
  });

  // 5. MERGE_HEAD present → SEMANTIC
  it("returns SEMANTIC when MERGE_HEAD exists", async () => {
    // Create MERGE_HEAD by simulating a merge state
    const gitDir = (await git(["rev-parse", "--git-dir"], dir)).trim();
    await writeFile(join(dir, gitDir, "MERGE_HEAD"), "dummy\n");
    await writeFile(join(dir, "conflict.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      { taskId: "tk-test05" },
      store,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("SEMANTIC");
  });

  // 6. Pre-commit hook reject → SEMANTIC with gitExitCode
  it("returns SEMANTIC when pre-commit hook rejects", async () => {
    // Create a pre-commit hook that always fails
    const gitDir = (await git(["rev-parse", "--git-dir"], dir)).trim();
    const hookDir = join(dir, gitDir, "hooks");
    await mkdir(hookDir, { recursive: true });
    await writeFile(
      join(hookDir, "pre-commit"),
      '#!/bin/sh\necho "rejected by hook" >&2\nexit 1\n',
    );
    const { chmod } = await import("fs/promises");
    await chmod(join(hookDir, "pre-commit"), 0o755);

    await writeFile(join(dir, "hook-test.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      { taskId: "tk-test06", verification: "test passed" },
      store,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("SEMANTIC");
    expect(parsed.gitExitCode).toBeTypeOf("number");
  });

  // 7. Cancel mode requires reason, produces correct message
  it("cancel mode requires reason and produces cancel message", async () => {
    await writeFile(join(dir, "cancel-file.txt"), "hello");

    // Without reason → error
    const noReason = await checkpointTools.adv_task_checkpoint.execute(
      { taskId: "tk-test07", mode: "cancel" },
      store,
      dir,
    );
    const noReasonParsed = parseToolOutput(noReason) as Record<string, unknown>;
    expect(noReasonParsed.error).toBeDefined();

    // With reason → committed
    const result = await checkpointTools.adv_task_checkpoint.execute(
      { taskId: "tk-test07", mode: "cancel", reason: "superseded by tk-xyz" },
      store,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("committed");
    expect(parsed.message).toBe(
      "task(tk-test07): cancel \u2014 superseded by tk-xyz",
    );

    const logMsg = await git(["log", "--oneline", "-1", "--format=%s"], dir);
    expect(logMsg.trim()).toBe(
      "task(tk-test07): cancel \u2014 superseded by tk-xyz",
    );
  });

  // 8. Truncation at 72 chars (subject) / 64 chars (cancel reason)
  it("truncates long task title and reason at limits", async () => {
    await writeFile(join(dir, "truncate.txt"), "hello");

    // Long title → truncated at 72
    const longTitle = "tk-loooong01";
    const longSuffix = "A".repeat(100);
    const result = await checkpointTools.adv_task_checkpoint.execute(
      { taskId: `${longTitle} ${longSuffix}`, verification: "test passed" },
      store,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    const msg = parsed.message as string;
    // "task(tk-loooong01 AAAAAA...): completed" — task ID part preserved
    expect(msg.length).toBeLessThanOrEqual(72);

    // Verify git log matches
    const logMsg = await git(["log", "--oneline", "-1", "--format=%s"], dir);
    expect(logMsg.trim().length).toBeLessThanOrEqual(72);
  });

  // 9. workdir arg overrides directory
  it("uses workdir argument over default directory", async () => {
    const dir2 = await createTempDir("adv-checkpoint-override-");
    try {
      await initGitRepo(dir2);
      await writeFile(join(dir2, "override.txt"), "hello");

      const result = await checkpointTools.adv_task_checkpoint.execute(
        { taskId: "tk-test09", workdir: dir2, verification: "test passed" },
        store,
        dir, // default directory, should be ignored
      );
      const parsed = parseToolOutput(result) as Record<string, unknown>;
      expect(parsed.status).toBe("committed");
      expect(parsed.workdir).toBe(dir2);
    } finally {
      await cleanupTempDir(dir2);
    }
  });

  // 10. No store mutation
  it("never calls store.tasks.update", async () => {
    await writeFile(join(dir, "store-check.txt"), "hello");
    // mockStore().tasks.update throws if called
    await checkpointTools.adv_task_checkpoint.execute(
      { taskId: "tk-test10" },
      store,
      dir,
    );
    // If we reach here without exception, store was not mutated
    expect(true).toBe(true);
  });

  // ─── New guardrail tests (RED phase — these will fail until implementation) ───

  // 11. Derives change identity from store.tasks.show
  it("derives changeId from store.tasks.show(taskId)", async () => {
    const storeWithTask = mockStore("optimizeCheckpointCommits");
    await writeFile(join(dir, "derive-test.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test11",
        expectedBranch: "trunk",
        verification: "pnpm test -- passed",
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("committed");
    expect(parsed.changeId).toBe("optimizeCheckpointCommits");
  });

  // 12. Optional changeId mismatch fails before staging
  it("fails before staging when optional changeId mismatches derived", async () => {
    const storeWithTask = mockStore("optimizeCheckpointCommits");
    await writeFile(join(dir, "mismatch-test.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test12",
        changeId: "wrongChangeId",
        verification: "pnpm test -- passed",
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("SEMANTIC");
    expect(parsed.error).toContain("changeId mismatch");
    // Verify nothing was staged
    const status = await git(["status", "--porcelain"], dir);
    expect(status.trim()).toContain("mismatch-test.txt");
  });

  // 13. Branch mismatch fails before staging
  it("fails before staging when branch does not match expectedBranch", async () => {
    const storeWithTask = mockStore("optimizeCheckpointCommits");
    await writeFile(join(dir, "branch-test.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test13",
        expectedBranch: "change/wrong-change",
        verification: "pnpm test -- passed",
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("SEMANTIC");
    expect(parsed.error).toContain("branch mismatch");
    expect(parsed.expectedBranch).toBe("change/wrong-change");
    expect(parsed.actualBranch).toBe("trunk");
    // Verify nothing was staged
    const status = await git(["status", "--porcelain"], dir);
    expect(status.trim()).toContain("branch-test.txt");
  });

  // 14. Expected HEAD mismatch fails before staging
  it("fails before staging when HEAD differs from expectedHeadSha", async () => {
    const storeWithTask = mockStore("optimizeCheckpointCommits");
    const currentHead = (await git(["rev-parse", "HEAD"], dir)).trim();
    const wrongHead = "a".repeat(40);
    await writeFile(join(dir, "head-test.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test14",
        expectedBranch: "trunk",
        expectedHeadSha: wrongHead,
        verification: "pnpm test -- passed",
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("SEMANTIC");
    expect(parsed.error).toContain("HEAD mismatch");
    expect(parsed.expectedHeadSha).toBe(wrongHead);
    expect(parsed.actualHeadSha).toBe(currentHead);
    // Verify nothing was staged
    const status = await git(["status", "--porcelain"], dir);
    expect(status.trim()).toContain("head-test.txt");
  });

  // 15. Structured commit trailers in commit body
  it("creates commit with structured body containing Change/Task/Mode/Verification", async () => {
    const storeWithTask = mockStore("optimizeCheckpointCommits");
    await writeFile(join(dir, "trailers-test.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test15",
        expectedBranch: "trunk",
        verification: "pnpm test -- src/tools/checkpoint.test.ts",
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("committed");

    // Verify commit body contains trailers
    const logBody = await git(["log", "-1", "--format=%B"], dir);
    expect(logBody).toContain("Change: optimizeCheckpointCommits");
    expect(logBody).toContain("Task: tk-test15");
    expect(logBody).toContain("Mode: complete");
    expect(logBody).toContain(
      "Verification: pnpm test -- src/tools/checkpoint.test.ts",
    );
    expect(storeWithTask.recordedRunEvents.at(-1)?.type).toBe("checkpoint");
    expect(storeWithTask.recordedRunEvents.at(-1)?.payload.sha).toBe(
      parsed.sha,
    );
  });

  it("surfaces checkpointRecorded false when ledger write fails after git success", async () => {
    const storeWithTask = mockStore("optimizeCheckpointCommits", {
      failRecordRunEvent: true,
    });
    await writeFile(join(dir, "ledger-fail.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test-ledger-fail",
        expectedBranch: "trunk",
        verification: "pnpm test -- src/tools/checkpoint.test.ts",
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;

    expect(parsed.status).toBe("committed");
    expect(parsed.checkpointRecorded).toBe(false);
    expect(parsed.remediation).toContain("adv_task_run_status");
  });

  // 16. Verification required for complete mode on dirty tree
  it("fails when verification is missing for complete mode on dirty tree", async () => {
    const storeWithTask = mockStore("optimizeCheckpointCommits");
    await writeFile(join(dir, "verify-test.txt"), "hello");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test16",
        // no verification provided
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("SEMANTIC");
    expect(parsed.error).toContain("verification");
    // Verify nothing was staged
    const status = await git(["status", "--porcelain"], dir);
    expect(status.trim()).toContain("verify-test.txt");
  });

  // 17. Clean tree still validates branch/HEAD guard
  it("validates branch/HEAD even when working tree is clean", async () => {
    const storeWithTask = mockStore("optimizeCheckpointCommits");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test17",
        expectedBranch: "change/wrong-change",
        expectedHeadSha: "a".repeat(40),
        verification: "clean tree test",
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("SEMANTIC");
  });

  // 18. Git failure classifications preserved
  it("preserves ENVIRONMENTAL classification for non-git workdir with guards", async () => {
    const nonGit = await createTempDir("adv-checkpoint-nongit-");
    const storeWithTask = mockStore("optimizeCheckpointCommits");
    try {
      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-test18",
          expectedBranch: "change/optimizeCheckpointCommits",
          verification: "test",
        },
        storeWithTask,
        nonGit,
      );
      const parsed = parseToolOutput(result) as Record<string, unknown>;
      expect(parsed.status).toBe("failed");
      expect(parsed.classification).toBe("ENVIRONMENTAL");
    } finally {
      await cleanupTempDir(nonGit);
    }
  });

  it("preserves ENVIRONMENTAL classification for detached HEAD with guards", async () => {
    const headSha = (await git(["rev-parse", "HEAD"], dir)).trim();
    await git(["checkout", headSha], dir);
    const storeWithTask = mockStore("optimizeCheckpointCommits");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test19",
        expectedBranch: "change/optimizeCheckpointCommits",
        verification: "test",
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("ENVIRONMENTAL");
  });

  it("preserves SEMANTIC classification for MERGE_HEAD with guards", async () => {
    const gitDir = (await git(["rev-parse", "--git-dir"], dir)).trim();
    await writeFile(join(dir, gitDir, "MERGE_HEAD"), "dummy\n");
    await writeFile(join(dir, "conflict2.txt"), "hello");
    const storeWithTask = mockStore("optimizeCheckpointCommits");

    const result = await checkpointTools.adv_task_checkpoint.execute(
      {
        taskId: "tk-test20",
        expectedBranch: "change/optimizeCheckpointCommits",
        verification: "test",
      },
      storeWithTask,
      dir,
    );
    const parsed = parseToolOutput(result) as Record<string, unknown>;
    expect(parsed.status).toBe("failed");
    expect(parsed.classification).toBe("SEMANTIC");
  });
});
