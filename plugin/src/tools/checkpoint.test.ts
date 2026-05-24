/**
 * Checkpoint Tool — Signal-Driven Completion Tests
 *
 * Verifies that adv_task_checkpoint fires taskCompletedSignal
 * after git ops for complete mode.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { checkpointTools, detectRepoState } from "./checkpoint";
import type { Store } from "../storage/store-types";

const mocks = vi.hoisted(() => {
  const signalMock = vi.fn();
  const queryMock = vi.fn();
  const handleMock = { signal: signalMock, query: queryMock };
  const getHandleMock = vi.fn(() => handleMock);
  const temporalBundle = {
    client: { workflow: { getHandle: getHandleMock } },
  };

  return {
    signalMock,
    queryMock,
    handleMock,
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
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {} as Store["changes"],
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

function mockRecordedTask(
  overrides: Partial<{
    status: string;
    verification: string;
    checkpointSha: string;
    filesTouched: string[];
  }> = {},
) {
  mocks.queryMock.mockResolvedValueOnce({
    status: "done",
    verification: "Tests passed",
    checkpointSha: "abc123def456",
    filesTouched: ["src/file.ts"],
    ...overrides,
  });
}

describe("checkpoint tools — signal-driven", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectRepoState", () => {
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
  });

  describe("adv_task_checkpoint", () => {
    test("fires taskCompletedSignal after commit in complete mode", async () => {
      const store = createMockStore();
      mockGitResponses({});
      mockRecordedTask();

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
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        taskId: "tk-abc",
        verification: "Tests passed",
        checkpointSha: expect.any(String),
      });
    });

    test("extracts structured_output from <adv-output> in verification on complete", async () => {
      const store = createMockStore();
      mockGitResponses({});

      const verification = `Tests passed.\n\n<adv-output>\n{\n  "filesChanged": [{"path": "src/baz.ts", "linesAdded": 3}],\n  "testsAdded": 1\n}\n</adv-output>`;
      mockRecordedTask({ verification });

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
      mockRecordedTask({ verification });

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

    test("fires taskCompletedSignal on clean tree in complete mode", async () => {
      const store = createMockStore();
      mockGitResponses({
        "status --porcelain": { stdout: "" },
      });
      mockRecordedTask({
        verification: "Clean tree checkpoint",
        filesTouched: [],
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
        filesTouched: [],
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
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
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
        mockRecordedTask(overrides);

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

    test("returns checkpointRecorded false on clean tree when completion signal fails", async () => {
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("signal failed"),
      );
      const store = createMockStore();
      mockGitResponses({
        "status --porcelain": { stdout: "" },
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
      expect(parsed.checkpointRecorded).toBe(false);
      expect(parsed.recordingError).toContain("signal failed");
      expect(parsed.remediation).toContain("adv_task_checkpoint");
    });
  });
});
