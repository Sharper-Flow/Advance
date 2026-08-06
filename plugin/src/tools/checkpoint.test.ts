/**
 * Checkpoint Tool — Disk-Projection Completion Tests
 *
 * Verifies checkpoint behavior after git ops for complete mode, including
 * post-completion validation against the disk projection.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  buildCommitMessage,
  checkpointTools,
  detectRepoState,
} from "./checkpoint";
import { taskUpdatedSignal } from "../temporal/messages";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import type { Store } from "../storage/store-types";

let fixtureRoot = "";

const mocks = vi.hoisted(() => {
  const signalMock = vi.fn();
  const queryMock = vi.fn();
  const handleMock = { signal: signalMock, query: queryMock };
  const getHandleMock = vi.fn(() => handleMock);
  const temporalBundle = {
    client: { workflow: { getHandle: getHandleMock } },
  };
  const targetStore = {
    paths: { root: "/tmp/target", changes: "/tmp/target/.adv/changes" },
    changes: {
      get: vi.fn(async () => ({
        success: true,
        data: {
          id: "target-change",
          title: "Target Change",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          deltas: {},
        },
      })),
    },
    tasks: {
      show: vi.fn(async (taskId: string) => ({
        task: {
          id: taskId,
          title: "Target Task",
          status: "in_progress",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
        } as import("../types").Task,
        changeId: "target-change",
      })),
      get: vi.fn(),
      list: vi.fn(),
      ready: vi.fn(),
      update: vi.fn(),
      add: vi.fn(),
      cancel: vi.fn(),
      reclassifyTdd: vi.fn(),
    },
    close: vi.fn(),
  };

  return {
    signalMock,
    queryMock,
    handleMock,
    targetStore,
    getHandleMock,
    temporalBundle,
    getService: vi.fn(() => temporalBundle),
    getProjectId: vi.fn(async () => "test-project-id"),
    fireSignal: vi.fn(async () => {}),
    fireSignalAndRefresh: vi.fn(async () => {}),
    querySignal: vi.fn(
      async (_handle: unknown, query: unknown, ...args: unknown[]) =>
        queryMock(query, ...args),
    ),
    getChangeHandle: vi.fn(() => handleMock),
    withTargetPathStore: vi.fn(async (_input: unknown, fn: unknown) => {
      const callback = fn as (scope: {
        context: unknown;
        store: unknown;
      }) => Promise<unknown>;
      return callback({
        context: {
          root: "/tmp/target",
          projectId: "target-project-id",
          externalRoot: "/tmp/target-external",
          trusted: false,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStore,
      });
    }),
    formatTargetProjectContext: vi.fn(
      (context: {
        root: string;
        projectId: string;
        trusted: boolean;
        trustSource: string;
        stateMode: string;
      }) => ({
        root: context.root,
        projectId: context.projectId,
        trusted: context.trusted,
        trustSource: context.trustSource,
        stateMode: context.stateMode,
      }),
    ),
    execFile: vi.fn(
      (_cmd: string, _args: string[], _opts: unknown, cb: unknown) => {
        const callback = cb as (
          err: Error | null,
          stdout: string,
          stderr: string,
        ) => void;
        callback(null, "", "");
      },
    ),
  };
});

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("./target-project", async () => {
  const { z } = await import("zod");
  return {
    targetPathSchema: z.object({
      target_path: z.string().optional(),
      target_confirmed: z.literal(true).optional(),
      confirmationEvidence: z.string().optional(),
    }),
    withTargetPathStore: mocks.withTargetPathStore,
    formatTargetProjectContext: mocks.formatTargetProjectContext,
    appendTargetProjectContextOutput: vi.fn(
      (
        output: string,
        context: {
          root: string;
          projectId: string;
          trusted: boolean;
          trustSource: string;
          stateMode: string;
        },
      ) => {
        const parsed = JSON.parse(output);
        parsed._projectContext = {
          root: context.root,
          projectId: context.projectId,
          trusted: context.trusted,
          trustSource: context.trustSource,
          stateMode: context.stateMode,
        };
        return JSON.stringify(parsed);
      },
    ),
  };
});

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

vi.mock("./_adapters", () => ({
  fireSignal: mocks.fireSignal,
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
}));

vi.mock("child_process", () => ({
  execFile: mocks.execFile,
}));

function createMockStore(): Store {
  return {
    paths: {
      root: fixtureRoot,
      changes: join(fixtureRoot, "changes"),
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      get: vi.fn(async () => ({
        success: true,
        data: {
          id: "test-change",
          title: "Test Change",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          deltas: {},
        },
      })),
    } as unknown as Store["changes"],
    tasks: {
      show: vi.fn(async (taskId: string) => ({
        task: {
          id: taskId,
          title: "Test Task",
          status: "in_progress",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
        } as import("../types").Task,
        changeId: "test-change",
      })),
      get: vi.fn(),
      list: vi.fn(),
      ready: vi.fn(),
      update: vi.fn(),
      add: vi.fn(),
      cancel: vi.fn(),
      reclassifyTdd: vi.fn(),
    } as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
  } as unknown as Store;
}

function mockGitResponses(
  responses: Record<
    string,
    { stdout?: string; stderr?: string; error?: Error }
  >,
) {
  mocks.execFile.mockImplementation(
    (_cmd: string, args: string[], _opts: unknown, cb: unknown) => {
      const callback = cb as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      const key = args.join(" ");
      const response = responses[key];
      if (response) {
        if (response.error) {
          callback(
            response.error,
            response.stdout ?? "",
            response.stderr ?? "",
          );
        } else {
          callback(null, response.stdout ?? "", response.stderr ?? "");
        }
      } else {
        // Default responses for common git commands
        if (args[0] === "rev-parse" && args[1] === "--git-dir") {
          callback(null, ".git", "");
        } else if (args[0] === "symbolic-ref" && args[1] === "-q") {
          callback(null, "refs/heads/change/test-change", "");
        } else if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(new Error("MERGE_HEAD not found"), "", "");
        } else if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
          callback(null, "change/test-change", "");
        } else if (args[0] === "rev-parse" && args[1] === "HEAD") {
          callback(null, "abc123def456", "");
        } else if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
          callback(null, "/tmp/test", "");
        } else if (args[0] === "status" && args[1] === "--porcelain") {
          callback(null, " M src/file.ts", "");
        } else if (args[0] === "add") {
          callback(null, "", "");
        } else if (args[0] === "commit") {
          callback(null, "", "");
        } else if (args[0] === "diff") {
          callback(null, "src/file.ts\n", "");
        } else {
          callback(null, "", "");
        }
      }
    },
  );
}

async function mockRecordedTask(
  overrides: Partial<{
    status: string;
    verification: string;
    checkpointSha: string;
    filesTouched: string[];
  }> = {},
  changeId = "test-change",
) {
  const task = {
    id: "tk-abc",
    title: "Test Task",
    status: "done",
    verification: "Tests passed",
    checkpointSha: "abc123def456",
    filesTouched: ["src/file.ts"],
    priority: 0,
    deps: [],
    metadata: {},
    contract_refs: {},
    evidence_plan: {},
    evidence_policy: "test",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
  const changesDir = join(fixtureRoot, "changes");
  await mkdir(changesDir, { recursive: true });
  await writeFile(
    join(changesDir, `${changeId}.json`),
    JSON.stringify({
      schemaVersion: 2,
      projectId: "test-project-id",
      changeId,
      projectedAt: "2026-01-01T00:00:00Z",
      state: {
        id: changeId,
        changeId,
        title: "Test Change",
        status: "active",
        tasks: [task],
        gates: {},
      },
    }),
    "utf8",
  );
}

describe("checkpoint tools — signal-driven", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    fixtureRoot = await createTempDir("adv-checkpoint-projection-");
    mocks.targetStore.paths.changes = join(fixtureRoot, "changes");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDir(fixtureRoot);
    fixtureRoot = "";
  });

  describe("detectRepoState", () => {
    test("detects clean repo on a branch as ok", async () => {
      mockGitResponses({});

      await expect(detectRepoState("/tmp/test")).resolves.toBe("ok");
    });

    test("detects plain detached HEAD as detached", async () => {
      mockGitResponses({
        "symbolic-ref -q HEAD": {
          error: new Error("ref HEAD is not a symbolic ref"),
        },
      });

      await expect(detectRepoState("/tmp/test")).resolves.toBe("detached");
    });

    test("detects merge state", async () => {
      mockGitResponses({
        "rev-parse --verify MERGE_HEAD": { stdout: "abc123\n" },
      });

      await expect(detectRepoState("/tmp/test")).resolves.toBe("merging");
    });

    test("detects rebase state", async () => {
      mockGitResponses({
        "rev-parse --verify REBASE_HEAD": { stdout: "abc123\n" },
      });

      await expect(detectRepoState("/tmp/test")).resolves.toBe("rebasing");
    });

    test("detects cherry-pick state", async () => {
      mockGitResponses({
        "rev-parse --verify CHERRY_PICK_HEAD": { stdout: "abc123\n" },
      });

      await expect(detectRepoState("/tmp/test")).resolves.toBe(
        "cherry-picking",
      );
    });

    test("detects revert state", async () => {
      mockGitResponses({
        "rev-parse --verify REVERT_HEAD": { stdout: "abc123\n" },
      });

      await expect(detectRepoState("/tmp/test")).resolves.toBe("reverting");
    });

    // rq-twf01.3: recovery markers take precedence over detached-HEAD
    // classification. Rebase and sequencer operations run with a detached
    // HEAD by design, so checking detached first would mask the recovery
    // state and silently drop the trunk-firewall recovery allowance.
    test("merge markers take precedence over detached HEAD", async () => {
      mockGitResponses({
        "symbolic-ref -q HEAD": {
          error: new Error("ref HEAD is not a symbolic ref"),
        },
        "rev-parse --verify MERGE_HEAD": { stdout: "abc123\n" },
      });

      await expect(detectRepoState("/tmp/test")).resolves.toBe("merging");
    });

    test("rebase markers take precedence over detached HEAD", async () => {
      mockGitResponses({
        "symbolic-ref -q HEAD": {
          error: new Error("ref HEAD is not a symbolic ref"),
        },
        "rev-parse --verify REBASE_HEAD": { stdout: "abc123\n" },
      });

      await expect(detectRepoState("/tmp/test")).resolves.toBe("rebasing");
    });

    test("detached rebase-merge directory classifies as rebasing", async () => {
      const tempDir = await createTempDir("adv-rebase-state-");
      try {
        const rebaseMergeDir = join(tempDir, "rebase-merge");
        await mkdir(rebaseMergeDir, { recursive: true });
        mockGitResponses({
          "symbolic-ref -q HEAD": {
            error: new Error("ref HEAD is not a symbolic ref"),
          },
          "rev-parse --git-path rebase-merge": {
            stdout: `${rebaseMergeDir}\n`,
          },
        });

        await expect(detectRepoState("/tmp/test")).resolves.toBe("rebasing");
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    test("cherry-pick markers take precedence over detached HEAD", async () => {
      mockGitResponses({
        "symbolic-ref -q HEAD": {
          error: new Error("ref HEAD is not a symbolic ref"),
        },
        "rev-parse --verify CHERRY_PICK_HEAD": { stdout: "abc123\n" },
      });

      await expect(detectRepoState("/tmp/test")).resolves.toBe(
        "cherry-picking",
      );
    });

    test("revert markers take precedence over detached HEAD", async () => {
      mockGitResponses({
        "symbolic-ref -q HEAD": {
          error: new Error("ref HEAD is not a symbolic ref"),
        },
        "rev-parse --verify REVERT_HEAD": { stdout: "abc123\n" },
      });

      await expect(detectRepoState("/tmp/test")).resolves.toBe("reverting");
    });
  });

  describe("buildCommitMessage", () => {
    test("builds Conventional Commit subject and audit body for complete mode", () => {
      const { subject, body } = buildCommitMessage(
        "tk-AbC123",
        "complete",
        undefined,
        "test-change",
        "Tests passed",
      );

      expect(subject).toBe("chore(adv): checkpoint tk-AbC123");
      expect(subject).toMatch(/^chore\(adv\): checkpoint tk-[A-Za-z0-9]+$/);
      expect(subject.length).toBeLessThanOrEqual(72);
      expect(body).toContain("Change: test-change");
      expect(body).toContain("Task: tk-AbC123");
      expect(body).toContain("Mode: complete");
      expect(body).toContain("Verification: Tests passed");
      expect(body).not.toContain("Reason:");
    });

    test("builds Conventional Commit subject and cancel reason body field", () => {
      const { subject, body } = buildCommitMessage(
        "tk-AbC123",
        "cancel",
        "No longer needed",
        "test-change",
      );

      expect(subject).toBe("chore(adv): cancel checkpoint tk-AbC123");
      expect(subject).toMatch(
        /^chore\(adv\): cancel checkpoint tk-[A-Za-z0-9]+$/,
      );
      expect(subject.length).toBeLessThanOrEqual(72);
      expect(subject).not.toContain("No longer needed");
      expect(body).toContain("Change: test-change");
      expect(body).toContain("Task: tk-AbC123");
      expect(body).toContain("Mode: cancel");
      expect(body).toContain("Reason: No longer needed");
    });

    test("rejects task IDs that would produce overlength checkpoint subjects", () => {
      expect(() =>
        buildCommitMessage(`tk-${"x".repeat(80)}`, "complete"),
      ).toThrow("Checkpoint commit subject exceeds 72 characters");
    });
  });

  describe("adv_task_checkpoint", () => {
    test("fires taskCompletedSignal after commit in complete mode", async () => {
      const store = createMockStore();
      mockGitResponses({});
      await mockRecordedTask();

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      const commitCall = mocks.execFile.mock.calls.find(
        ([, args]) => Array.isArray(args) && args[0] === "commit",
      );
      expect(commitCall?.[1]).toEqual([
        "commit",
        "-m",
        "chore(adv): checkpoint tk-abc",
        "-m",
        expect.stringContaining("Task: tk-abc"),
      ]);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        verification: "Tests passed",
        checkpointSha: expect.any(String),
      });
    });

    // -------------------------------------------------------------------------
    // rq-wisdomAutoSurfacing01 — WisdomDraft auto-dismiss at checkpoint (AC5)
    // -------------------------------------------------------------------------

    test("auto-dismisses suggested drafts at checkpoint and reports counts (AC5)", async () => {
      const store = createMockStore();
      mockGitResponses({});
      await mockRecordedTask({
        // @ts-expect-error — extending readback shape with wisdom_drafts
        wisdom_drafts: [
          {
            id: "dr-a",
            suggested_type: "failure",
            suggested_content: "diag-a → fix-a",
            source_attempts: [1],
            status: "suggested",
            created_at: "2026-07-21T17:00:00.000Z",
          },
          {
            id: "dr-b",
            suggested_type: "failure",
            suggested_content: "diag-b → fix-b",
            source_attempts: [1],
            status: "suggested",
            created_at: "2026-07-21T17:00:00.000Z",
          },
          {
            id: "dr-c",
            suggested_type: "failure",
            suggested_content: "already-promoted",
            source_attempts: [1],
            status: "promoted",
            created_at: "2026-07-21T16:00:00.000Z",
            promoted_wisdom_id: "ws-old",
          },
        ],
      });

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      expect(parsed.drafts_pending_review).toBe(2);
      expect(parsed.drafts_auto_dismissed).toBe(2);

      // Two signals: taskCompletedSignal + taskUpdatedSignal (draft auto-dismiss)
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
      const draftDismissCall = mocks.fireSignalAndRefresh.mock.calls[1];
      expect(draftDismissCall[3]).toBe(taskUpdatedSignal);
      expect(draftDismissCall[4]).toMatchObject({
        taskId: "tk-abc",
        partial: {
          wisdom_drafts: expect.arrayContaining([
            expect.objectContaining({
              id: "dr-a",
              status: "dismissed",
              dismiss_reason: "auto_checkpoint",
            }),
            expect.objectContaining({
              id: "dr-b",
              status: "dismissed",
              dismiss_reason: "auto_checkpoint",
            }),
            expect.objectContaining({
              id: "dr-c",
              status: "promoted", // untouched — already terminal
            }),
          ]),
        },
      });
    });

    test("does NOT fire draft-dismiss signal when no suggested drafts exist", async () => {
      const store = createMockStore();
      mockGitResponses({});
      await mockRecordedTask({
        // @ts-expect-error — extending readback shape with wisdom_drafts
        wisdom_drafts: [
          {
            id: "dr-promoted",
            suggested_type: "failure",
            suggested_content: "done",
            status: "promoted",
            created_at: "2026-07-21T16:00:00.000Z",
            promoted_wisdom_id: "ws-x",
          },
        ],
      });

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.drafts_pending_review).toBe(0);
      expect(parsed.drafts_auto_dismissed).toBe(0);
      // Only the taskCompletedSignal fires
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    });

    test("no wisdom_drafts on task → zero counts, single signal", async () => {
      const store = createMockStore();
      mockGitResponses({});
      await mockRecordedTask();

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
        },
        store,
        "/tmp/test",
      );
      const parsed = JSON.parse(result);
      expect(parsed.drafts_pending_review).toBe(0);
      expect(parsed.drafts_auto_dismissed).toBe(0);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    });

    test("draft-dismiss signal failure is best-effort: status stays committed, counts stay 0 (rq-wisdomAutoSurfacing01.8)", async () => {
      const store = createMockStore();
      mockGitResponses({});
      await mockRecordedTask({
        // @ts-expect-error — extending readback shape with wisdom_drafts
        wisdom_drafts: [
          {
            id: "dr-a",
            suggested_type: "failure",
            suggested_content: "diag-a → fix-a",
            source_attempts: [1],
            status: "suggested",
            created_at: "2026-07-21T17:00:00.000Z",
          },
          {
            id: "dr-b",
            suggested_type: "failure",
            suggested_content: "diag-b → fix-b",
            source_attempts: [1],
            status: "suggested",
            created_at: "2026-07-21T17:00:00.000Z",
          },
        ],
      });

      // First call (taskCompletedSignal) succeeds; second call
      // (taskUpdatedSignal for draft dismiss) rejects. Verifies the
      // try/catch at checkpoint.ts:497-509 keeps checkpoint completion
      // intact and surfaces zero auto-dismissed counts on signal failure.
      mocks.fireSignalAndRefresh
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("temporal unavailable"));

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      // Checkpoint itself stays committed despite dismiss-signal failure
      expect(parsed.status).toBe("committed");
      // Counts reflect that dismiss did NOT complete: 2 pending, 0 dismissed
      expect(parsed.drafts_pending_review).toBe(2);
      expect(parsed.drafts_auto_dismissed).toBe(0);
      // Both signals attempted (completion + failed dismiss)
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
    });

    test("extracts structured_output from <adv-output> in verification on complete", async () => {
      const store = createMockStore();
      mockGitResponses({});

      const verification = `Tests passed.\n\n<adv-output>\n{\n  "filesChanged": [{"path": "src/baz.ts", "linesAdded": 3}],\n  "testsAdded": 1\n}\n</adv-output>`;
      await mockRecordedTask({ verification });

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification,
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        structured_output: {
          filesChanged: [{ path: "src/baz.ts", linesAdded: 3 }],
          testsAdded: 1,
        },
      });
    });

    test("does not extract legacy structured_output when task has persisted sub-agent report", async () => {
      const store = createMockStore();
      vi.mocked(store.tasks.show).mockResolvedValue({
        task: {
          id: "tk-abc",
          title: "Test Task",
          status: "in_progress",
          priority: 0,
          created_at: "2026-01-01T00:00:00Z",
          subagent_reports: [
            {
              schema_version: "1.0",
              change_id: "test-change",
              task_id: "tk-abc",
              attempt: 1,
              agent: "adv-engineer",
              status: "complete",
              scope: "Implement",
              workdir_used: "/tmp/test",
              files_touched: ["src/file.ts"],
              verification: [
                {
                  command: "pnpm test",
                  exit_code: 0,
                  summary: "passed",
                },
              ],
              decisions: [],
              blockers: [],
              follow_ups: [],
              related_scan: "No related issues",
              context_update_for_adv: {
                what_ads_needs_to_know: "Typed report exists",
                suggested_next_action: "Skip legacy extraction",
              },
            },
          ],
        } as import("../types").Task,
        changeId: "test-change",
      });
      mockGitResponses({});

      const verification = `Tests passed.\n\n<adv-output>\n{\n  "filesChanged": [{"path": "src/baz.ts", "linesAdded": 3}],\n  "testsAdded": 1\n}\n</adv-output>`;
      await mockRecordedTask({ verification });

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification,
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        verification,
      });
      expect(signalCall[4]).not.toHaveProperty("structured_output");
    });

    test("does not extract legacy structured_output when sidecar has task report", async () => {
      const store = createMockStore();
      vi.mocked(store.changes.get).mockResolvedValue({
        success: true,
        data: {
          id: "test-change",
          title: "Test Change",
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          deltas: {},
          subagent_reports: [
            {
              schema_version: "1.0",
              change_id: "test-change",
              task_id: "tk-abc",
              attempt: 1,
              agent: "adv-engineer",
              status: "complete",
              scope: { kind: "task", task_id: "tk-abc" },
              workdir_used: "/tmp/test",
              files_touched: ["src/file.ts"],
              verification: [
                { command: "pnpm test", exit_code: 0, summary: "passed" },
              ],
              decisions: [],
              blockers: [],
              follow_ups: [],
              related_scan: "No related issues",
              context_update_for_adv: {
                what_ads_needs_to_know: "Typed sidecar report exists",
                suggested_next_action: "Skip legacy extraction",
              },
            },
          ],
        } as import("../types").Change,
      });
      mockGitResponses({});

      const verification = `Tests passed.\n\n<adv-output>\n{\n  "filesChanged": [{"path": "src/baz.ts", "linesAdded": 3}],\n  "testsAdded": 1\n}\n</adv-output>`;
      await mockRecordedTask({ verification });

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification,
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({ taskId: "tk-abc", verification });
      expect(signalCall[4]).not.toHaveProperty("structured_output");
    });

    test("fires taskCompletedSignal on clean tree in complete mode", async () => {
      const store = createMockStore();
      mockGitResponses({
        "status --porcelain": { stdout: "" },
      });
      await mockRecordedTask({
        verification: "Clean tree checkpoint",
        filesTouched: ["src/file.ts"],
      });

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("clean");
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        verification: "Clean tree checkpoint",
        filesTouched: ["src/file.ts"],
      });
    });

    test("does not fire taskCompletedSignal in cancel mode", async () => {
      const store = createMockStore();
      mockGitResponses({
        "status --porcelain": { stdout: " M src/file.ts" },
      });

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "cancel",
          reason: "Abandoned",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      const commitCall = mocks.execFile.mock.calls.find(
        ([, args]) => Array.isArray(args) && args[0] === "commit",
      );
      expect(commitCall?.[1]).toEqual([
        "commit",
        "-m",
        "chore(adv): cancel checkpoint tk-abc",
        "-m",
        expect.stringContaining("Reason: Abandoned"),
      ]);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("uses explicit changeId in commit body when task lookup cannot derive one", async () => {
      const store = createMockStore();
      vi.mocked(store.tasks.show).mockRejectedValueOnce(
        new Error("task lookup unavailable"),
      );
      mockGitResponses({
        "rev-parse --abbrev-ref HEAD": { stdout: "change/explicit-change" },
        "status --porcelain": { stdout: " M src/file.ts" },
      });

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "cancel",
          reason: "Abandoned",
          changeId: "explicit-change",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      const commitCall = mocks.execFile.mock.calls.find(
        ([, args]) => Array.isArray(args) && args[0] === "commit",
      );
      expect(commitCall?.[1]).toEqual([
        "commit",
        "-m",
        "chore(adv): cancel checkpoint tk-abc",
        "-m",
        expect.stringContaining("Change: explicit-change"),
      ]);
    });

    test("returns checkpointRecorded false when Temporal service unavailable", async () => {
      mocks.getService.mockReturnValueOnce(null);
      const store = createMockStore();
      mockGitResponses({});

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      expect(parsed.checkpointRecorded).toBe(false);
      expect(parsed.recordingError).toContain("Temporal service not available");
      expect(parsed.remediation).toContain("adv_task_checkpoint");
    });

    test("returns checkpointRecorded false after commit when completion signal fails", async () => {
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("signal failed"),
      );
      const store = createMockStore();
      mockGitResponses({});

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      expect(parsed.checkpointRecorded).toBe(false);
      expect(parsed.recordingError).toContain("signal failed");
      expect(parsed.remediation).toContain("adv_task_checkpoint");
    });

    test.each([
      {
        name: "status mismatch",
        overrides: { status: "in_progress" },
        error: "status is in_progress",
      },
      {
        name: "verification mismatch",
        overrides: { verification: "Different verification" },
        error: "verification did not match",
      },
      {
        name: "checkpointSha mismatch",
        overrides: { checkpointSha: "different-sha" },
        error: "checkpointSha did not match abc123def456",
      },
      {
        name: "filesTouched mismatch",
        overrides: { filesTouched: ["src/other.ts"] },
        error: "filesTouched did not match checkpoint files",
      },
    ])(
      "returns checkpointRecorded false when post-signal verification has $name",
      async ({ overrides, error }) => {
        const store = createMockStore();
        mockGitResponses({});
        await mockRecordedTask(overrides);

        const result = await checkpointTools.adv_task_checkpoint.execute(
          {
            taskId: "tk-abc",
            mode: "complete",
            verification: "Tests passed",
          },
          store,
          "/tmp/test",
        );

        const parsed = JSON.parse(result);
        expect(parsed.status).toBe("committed");
        expect(parsed.checkpointRecorded).toBe(false);
        expect(parsed.recordingError).toContain(error);
        expect(parsed.remediation).toContain("adv_task_checkpoint");
      },
    );

    test("records checkpoint when filesTouched order differs from git order (set comparison)", async () => {
      const store = createMockStore();
      mockGitResponses({
        "status --porcelain": { stdout: " M src/alpha.ts\n M src/beta.ts\n" },
        "diff --name-only HEAD~1": {
          stdout: "src/alpha.ts\nsrc/beta.ts\n",
        },
      });
      // Recorded task has files in reversed order vs git output
      await mockRecordedTask({
        filesTouched: ["src/beta.ts", "src/alpha.ts"],
      });

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.checkpointRecorded).toBe(true);
    });

    test("routes target_path checkpoint through the target store", async () => {
      const store = createMockStore();
      mockGitResponses({
        "rev-parse --abbrev-ref HEAD": { stdout: "change/target-change\n" },
        "rev-parse --show-toplevel": { stdout: "/tmp/target\n" },
      });
      await mockRecordedTask({}, "target-change");

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("committed");
      expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProjectPath: fixtureRoot,
          target_path: "/tmp/target",
          stateRequirement: "temporal-required",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        }),
        expect.any(Function),
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
        expect.anything(),
        mocks.targetStore,
        "target-change",
        expect.anything(),
        expect.objectContaining({ taskId: "tk-abc" }),
      );
      expect(parsed._projectContext).toEqual({
        root: "/tmp/target",
        projectId: "target-project-id",
        trusted: false,
        trustSource: "explicit",
        stateMode: "temporal",
      });
    });

    test("uses target store root as cwd when target_path is provided without workdir", async () => {
      const store = createMockStore();
      mockGitResponses({
        "rev-parse --show-toplevel": { stdout: "/tmp/target\n" },
      });
      await mockRecordedTask();

      await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          mode: "complete",
          verification: "Tests passed",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        store,
        "/tmp/test",
      );

      const revParseCall = mocks.execFile.mock.calls.find(
        ([, args]) =>
          Array.isArray(args) &&
          args[0] === "rev-parse" &&
          args[1] === "--show-toplevel",
      );
      expect(revParseCall?.[2]).toMatchObject({ cwd: "/tmp/target" });
    });

    test("explicit workdir wins when it is a linked worktree of the target repository", async () => {
      const store = createMockStore();
      mockGitResponses({
        "rev-parse --path-format=absolute --git-common-dir": {
          stdout: "/tmp/target/.git\n",
        },
        "rev-parse --show-toplevel": { stdout: "/tmp/source-worktree\n" },
      });
      await mockRecordedTask();

      await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          workdir: "/tmp/source-worktree",
          mode: "complete",
          verification: "Tests passed",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        store,
        "/tmp/test",
      );

      const revParseCall = mocks.execFile.mock.calls.find(
        ([, args]) =>
          Array.isArray(args) &&
          args[0] === "rev-parse" &&
          args[1] === "--show-toplevel",
      );
      expect(revParseCall?.[2]).toMatchObject({ cwd: "/tmp/source-worktree" });
    });

    test.each([{ blank: "" }, { blank: "   " }])(
      "rejects explicitly blank workdir ($blank)",
      async ({ blank }) => {
        const store = createMockStore();
        mockGitResponses({});

        const result = await checkpointTools.adv_task_checkpoint.execute(
          {
            taskId: "tk-abc",
            workdir: blank,
            mode: "complete",
            verification: "Tests passed",
          },
          store,
          "/tmp/test",
        );

        const parsed = JSON.parse(result);
        expect(parsed.status).toBe("failed");
        expect(parsed.classification).toBe("SEMANTIC");
        expect(parsed.error).toMatch(/blank/i);
        expect(mocks.execFile).not.toHaveBeenCalled();
        expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      },
    );

    test("rejects unrelated repository when target_path and explicit workdir coexist", async () => {
      const store = createMockStore();
      mocks.execFile.mockImplementation(
        (_cmd: string, args: string[], opts: unknown, cb: unknown) => {
          const callback = cb as (
            err: Error | null,
            stdout: string,
            stderr: string,
          ) => void;
          const cwd = (opts as { cwd?: string })?.cwd;
          if (
            args.join(" ") ===
            "rev-parse --path-format=absolute --git-common-dir"
          ) {
            if (cwd === "/tmp/target") {
              callback(null, "/tmp/target-repo/.git\n", "");
            } else {
              callback(null, "/tmp/other-repo/.git\n", "");
            }
          } else {
            callback(null, "", "");
          }
        },
      );

      const result = await checkpointTools.adv_task_checkpoint.execute(
        {
          taskId: "tk-abc",
          workdir: "/tmp/other-worktree",
          mode: "complete",
          verification: "Tests passed",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        store,
        "/tmp/test",
      );

      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("failed");
      expect(parsed.classification).toBe("SEMANTIC");
      expect(parsed.error).toContain("not part of the target repository");

      // No commit, no staging, no target task-state resolution, no signaling
      const gitCommands = mocks.execFile.mock.calls.map(
        ([, args]) => (args as string[])[0],
      );
      expect(gitCommands).not.toContain("add");
      expect(gitCommands).not.toContain("commit");
      expect(mocks.targetStore.tasks.show).not.toHaveBeenCalled();
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });
  });
});
