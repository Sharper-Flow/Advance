/**
 * Tests for archive-gate helpers that sit between the archive tool and the
 * git-finalize reachability engine. These tests exercise the helpers with
 * injected runGit/runGh so they fail against the current implementation for
 * issue #202 (Phase-9 PR metadata loss / branch auto-delete).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildPendingMergePhase9Status,
  completeReleaseGateAfterFinalization,
  verifyReleaseEvidenceFromMain,
  preservePhase9Evidence,
  runReacquiringChangeQuery,
  waitForArchiveReleaseGateCompletion,
} from "./archive-gate";
import * as gitFinalize from "../archive-helpers/git-finalize";
import { getService, reinitStsl } from "../../temporal/service";
import { getGateStatusQuery } from "../../temporal/messages";
import { getProjectId } from "../../utils/project-id";
import type { Change, Store } from "../../types";
import type {
  GitFinalizeDeps,
  GitFinalizeOutcome,
} from "../archive-helpers/git-finalize";

vi.mock("../../temporal/service", () => ({
  getService: vi.fn(),
  reinitStsl: vi.fn(async () => undefined),
}));

vi.mock("../../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../../utils/project-id")>(
    "../../utils/project-id",
  );
  return { ...actual, getProjectId: vi.fn() };
});

const recoveryWriterMocks = vi.hoisted(() => ({
  saveRecoveredGateCompletion: vi.fn(),
}));

vi.mock("../_recovery-writers", () => ({
  saveRecoveredGateCompletion: recoveryWriterMocks.saveRecoveredGateCompletion,
}));

function createStore(mainCheckout: string): Store {
  return {
    paths: {
      root: mainCheckout,
      changes: "/tmp/.adv/changes",
      archive: "/tmp/.adv/archive",
    },
    config: { name: "test", features: {} },
  } as unknown as Store;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

function createChange(options: {
  phase9_status?: Change["phase9_status"];
}): Change {
  return {
    id: "fixPhase9PrDetection",
    title: "Fix Phase 9 PR detection",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    phase9_status: options.phase9_status,
  } as Change;
}

describe("verifyReleaseEvidenceFromMain", () => {
  // rq-fixPhase9PrDetection AC2: PR archive mode + deleted branch + no
  // prNumber must discover the merged PR and return shipped.
  it("returns shipped when PR mode has no prNumber but a merged PR is discoverable", () => {
    const mainCheckout = "/repo";
    const change = createChange({
      phase9_status: {
        status: "pending",
        startedAt: "2026-01-01T00:00:00Z",
      },
    });
    const runGit: GitFinalizeDeps["runGit"] = (_cwd, args) => {
      if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "remote" && args[1] === "get-url" && args[2] === "origin")
        return {
          status: 0,
          stdout: "https://github.com/Sharper-Flow/Advance.git\n",
          stderr: "",
        };
      if (args[0] === "symbolic-ref" && args[1] === "--short")
        return { status: 0, stdout: "origin/trunk\n", stderr: "" };
      if (args[0] === "config")
        return { status: 1, stdout: "", stderr: "not set" };
      if (args[0] === "rev-parse" && args[1] === "refs/heads/main")
        return { status: 1, stdout: "", stderr: "unknown" };
      if (args[0] === "rev-parse" && args[1] === "refs/heads/trunk")
        return { status: 0, stdout: "local-trunk-sha\n", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "origin/trunk")
        return { status: 0, stdout: "origin-trunk-sha\n", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "HEAD")
        return { status: 0, stdout: "origin-trunk-sha\n", stderr: "" };
      if (args[0] === "ls-remote")
        return {
          status: 0,
          stdout: "origin-trunk-sha\trefs/heads/trunk\n",
          stderr: "",
        };
      if (
        args[0] === "log" &&
        args[2] === "origin/trunk..change/fixPhase9PrDetection"
      )
        return { status: 128, stdout: "", stderr: "unknown revision" };
      if (args[0] === "rev-parse" && args[1] === "change/fixPhase9PrDetection")
        return { status: 128, stdout: "", stderr: "unknown revision" };
      return {
        status: 1,
        stdout: "",
        stderr: `unexpected git ${args.join(" ")}`,
      };
    };
    const runGh: GitFinalizeDeps["runGh"] = (_cwd, args) => {
      if (args[0] === "api" && args[1]?.startsWith("repos/")) {
        return { status: 0, stdout: "[]", stderr: "" };
      }
      if (args[0] === "pr" && args[1] === "list") {
        return {
          status: 0,
          stdout: JSON.stringify([
            { number: 202, state: "MERGED", mergeCommit: { oid: "merge-202" } },
          ]),
          stderr: "",
        };
      }
      if (args[0] === "pr" && args[1] === "view") {
        return {
          status: 0,
          stdout: JSON.stringify({
            state: "MERGED",
            mergedAt: "2026-06-07T00:00:00Z",
            mergeCommit: { oid: "merge-202" },
            autoMergeRequest: null,
          }),
          stderr: "",
        };
      }
      return {
        status: 1,
        stdout: "",
        stderr: `unexpected gh ${args.join(" ")}`,
      };
    };

    const result = verifyReleaseEvidenceFromMain({
      store: createStore(mainCheckout),
      changeId: "fixPhase9PrDetection",
      archiveMode: "pr",
      change,
      deps: { runGit, runGh },
    });

    expect(result.status).toBe("shipped");
    expect(result.route).toBe("pr_auto_merge");
    expect(result.mergeCommitSha).toBe("merge-202");
    expect(result.prNumber).toBe(202);
  });

  // rq-fixPhase9PrDetection release-readiness: missing PR merge proof must
  // surface a distinct blocked reason, not PR_NOT_MERGED or generic reachability.
  it("returns PR_MERGE_PROOF_MISSING when reachability proof is pr_missing_merge_proof", () => {
    vi.spyOn(gitFinalize, "detectDefaultBranch").mockReturnValue({
      branch: "trunk",
      source: "test",
    });
    vi.spyOn(gitFinalize, "classifyFinalizationRoute").mockReturnValue({
      route: "pr_auto_merge",
      repo: "Sharper-Flow/Advance",
    });
    vi.spyOn(gitFinalize, "resolveReleaseReachability").mockReturnValue({
      reachable: false,
      proof: "pr_missing_merge_proof",
      details: ["prNumber is missing and no merged PR was discoverable"],
    });

    const result = verifyReleaseEvidenceFromMain({
      store: createStore("/repo"),
      changeId: "fixPhase9PrDetection",
      archiveMode: "pr",
    });

    expect(result.status).toBe("blocked");
    expect(result.route).toBe("pr_auto_merge");
    expect(result.blocked?.reason).toBe("PR_MERGE_PROOF_MISSING");
    expect(result.blocked?.details).toContain(
      "prNumber is missing and no merged PR was discoverable",
    );
  });

  // rq-fixPhase9PrDetection release-readiness: PR-mode route coercion must
  // preserve no_remote and pr_manual semantics instead of forcing pr_auto_merge.
  it("preserves no_remote route semantics through coercePrWorkflowRoute in PR mode", () => {
    vi.spyOn(gitFinalize, "detectDefaultBranch").mockReturnValue({
      branch: "trunk",
      source: "test",
    });
    vi.spyOn(gitFinalize, "classifyFinalizationRoute").mockReturnValue({
      route: "no_remote",
      reason: "origin remote not configured",
    });
    vi.spyOn(gitFinalize, "resolveReleaseReachability").mockReturnValue({
      reachable: true,
      proof: "local_merge",
    });

    const result = verifyReleaseEvidenceFromMain({
      store: createStore("/repo"),
      changeId: "fixPhase9PrDetection",
      archiveMode: "pr",
    });

    expect(result.status).toBe("shipped");
    expect(result.route).toBe("no_remote");
  });

  it("preserves pr_manual route semantics through coercePrWorkflowRoute in PR mode", () => {
    vi.spyOn(gitFinalize, "detectDefaultBranch").mockReturnValue({
      branch: "trunk",
      source: "test",
    });
    vi.spyOn(gitFinalize, "classifyFinalizationRoute").mockReturnValue({
      route: "pr_manual",
      remoteUrl: "https://example.com/repo.git",
      reason: "GITHUB_REPO_UNRESOLVABLE",
    });
    vi.spyOn(gitFinalize, "resolveReleaseReachability").mockReturnValue({
      reachable: false,
      proof: "pr_missing_merge_proof",
    });

    const result = verifyReleaseEvidenceFromMain({
      store: createStore("/repo"),
      changeId: "fixPhase9PrDetection",
      archiveMode: "pr",
    });

    expect(result.status).toBe("blocked");
    expect(result.route).toBe("pr_manual");
  });
});

describe("buildPendingMergePhase9Status", () => {
  // rq-fixPhase9PrDetection AC4: durable fields must survive the transition
  // from pending to pending_merge.
  it("preserves previous changeTipSha", () => {
    const result = buildPendingMergePhase9Status({
      finalization: {
        status: "pending_merge",
        mainCheckout: "/repo",
        defaultBranch: "trunk",
        pushStatus: "pushed",
        route: "pr_auto_merge",
        prNumber: 202,
        prUrl: "https://github.com/Sharper-Flow/Advance/pull/202",
        autoMergeArmed: true,
      },
      startedAt: "2026-01-01T00:00:00Z",
      previous: {
        status: "pending",
        startedAt: "2026-01-01T00:00:00Z",
        changeTipSha: "tip-202-abc",
      },
    });

    expect(result.changeTipSha).toBe("tip-202-abc");
  });
});

describe("preservePhase9Evidence", () => {
  // rq-fixPhase9PrDetection AC4: all durable Phase-9 evidence fields must be
  // carried forward when missing on the next state; next values always win.
  it("preserves repo, prNumber, prUrl, route, changeTipSha, autoMergeArmed and next values win", () => {
    const previous = {
      status: "pending" as const,
      startedAt: "2026-01-01T00:00:00Z",
      repo: "Sharper-Flow/Advance",
      prNumber: 202,
      prUrl: "https://github.com/Sharper-Flow/Advance/pull/202",
      route: "pr_auto_merge" as const,
      changeTipSha: "tip-202-abc",
      autoMergeArmed: true,
    };

    const next = preservePhase9Evidence(previous, {
      status: "done",
      startedAt: previous.startedAt,
      completedAt: "2026-06-07T00:00:00Z",
      prNumber: 303,
      prUrl: "https://github.com/Sharper-Flow/Advance/pull/303",
      route: "pr_manual",
    });

    expect(next.repo).toBe("Sharper-Flow/Advance");
    expect(next.prNumber).toBe(303);
    expect(next.prUrl).toBe("https://github.com/Sharper-Flow/Advance/pull/303");
    expect(next.route).toBe("pr_manual");
    expect(next.changeTipSha).toBe("tip-202-abc");
    expect(next.autoMergeArmed).toBe(true);
    expect(next.status).toBe("done");
  });
});

function fakeClientWithHandle(handle: { query: ReturnType<typeof vi.fn> }) {
  return { workflow: { getHandle: vi.fn(() => handle) } };
}

describe("runReacquiringChangeQuery", () => {
  // rq-reapOrphanAdvWorkers T2: a handle captured before a mid-op reconnect
  // keeps the closed client. The reacquiring query must rebuild the handle
  // from getService() inside every retry attempt.
  it("reacquires the client via getService() on retry after a reconnectable transport failure", async () => {
    const doneGate = { status: "done" };
    const secondHandle = { query: vi.fn(async () => doneGate) };
    const secondClient = fakeClientWithHandle(secondHandle);
    const bundle: { client: unknown } = { client: undefined };
    const firstHandle = {
      query: vi.fn(async () => {
        // Simulate reinitStsl mutating the cached bundle in place.
        bundle.client = secondClient;
        throw new Error("Channel has been shut down");
      }),
    };
    const firstClient = fakeClientWithHandle(firstHandle);
    bundle.client = firstClient;
    vi.mocked(getService).mockImplementation(
      () => bundle as unknown as ReturnType<typeof getService>,
    );

    const result = await runReacquiringChangeQuery(
      "project-a",
      "change-a",
      getGateStatusQuery,
      "release",
    );

    expect(result).toEqual(doneGate);
    expect(firstHandle.query).toHaveBeenCalledTimes(1);
    expect(secondHandle.query).toHaveBeenCalledTimes(1);
    // The retried attempt rebuilt its handle from the swapped-in client,
    // not the closed one.
    expect(secondClient.workflow.getHandle).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getService).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // rq-reapOrphanAdvWorkers T2: saturation is retryable but NOT
  // reconnectable — the shared connection must not be replaced.
  it("retries bare read saturation (DEADLINE_EXCEEDED) without reconnecting", async () => {
    const doneGate = { status: "done" };
    const saturationError = Object.assign(
      new Error("Query failed: deadline exceeded"),
      {
        cause: { code: 4, details: "context deadline exceeded", metadata: {} },
      },
    );
    const handle = {
      query: vi
        .fn()
        .mockRejectedValueOnce(saturationError)
        .mockResolvedValueOnce(doneGate),
    };
    const client = fakeClientWithHandle(handle);
    vi.mocked(getService).mockReturnValue({ client } as never);
    vi.mocked(reinitStsl).mockClear();

    const result = await runReacquiringChangeQuery(
      "project-a",
      "change-a",
      getGateStatusQuery,
      "release",
    );

    expect(result).toEqual(doneGate);
    expect(handle.query).toHaveBeenCalledTimes(2);
    expect(vi.mocked(reinitStsl)).not.toHaveBeenCalled();
  });
});

describe("waitForArchiveReleaseGateCompletion", () => {
  // rq-reapOrphanAdvWorkers T2: the confirmation poll must reacquire the
  // service bundle + handle on every poll attempt, not reuse a captured one.
  it("polls via a reacquiring query that rebuilds the handle from getService() each attempt", async () => {
    const pendingGate = { status: "pending" };
    const doneGate = { status: "done" };
    const handle = {
      query: vi
        .fn()
        .mockResolvedValueOnce(pendingGate)
        .mockResolvedValueOnce(doneGate),
    };
    const client = fakeClientWithHandle(handle);
    vi.mocked(getService).mockReturnValue({ client } as never);

    const result = await waitForArchiveReleaseGateCompletion(
      "project-a",
      "change-a",
      { delayMs: 1 },
    );

    expect(result).toEqual(doneGate);
    expect(handle.query).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getService).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(client.workflow.getHandle).toHaveBeenCalledTimes(2);
  });
});

describe("completeReleaseGateAfterFinalization — T3 ambiguous signal reconcile", () => {
  // rq-reapOrphanAdvWorkers T3 (SC3/AC3): a transient-saturation
  // gateCompletedSignal failure is AMBIGUOUS — the signal may have landed
  // server-side. The path must run exactly ONE bounded reconcile read via the
  // T2 reacquiring query and ZERO automatic re-signals.
  const pendingGate = { status: "pending" };
  const doneGate = {
    status: "done",
    completed_at: "2026-01-01T00:00:00Z",
    completed_by: "adv-archive",
  };
  const shippedFinalization: GitFinalizeOutcome = {
    status: "shipped",
    mainCheckout: "/repo",
    defaultBranch: "trunk",
    pushStatus: "pushed",
    mergeCommitSha: "merge-sha-1",
  };

  function saturationError(): Error {
    // gRPC DEADLINE_EXCEEDED (code 4) — retryable saturation, not a
    // transport-channel failure (not reconnectable) and not completed-workflow.
    return Object.assign(new Error("signal failed: deadline exceeded"), {
      cause: { code: 4, details: "context deadline exceeded", metadata: {} },
    });
  }

  beforeEach(() => {
    vi.mocked(getProjectId).mockResolvedValue("project-test");
    recoveryWriterMocks.saveRecoveredGateCompletion.mockReset();
    recoveryWriterMocks.saveRecoveredGateCompletion.mockImplementation(
      async (input: {
        change: Change;
        gateId: string;
        completion: unknown;
      }) => ({
        ...input.change,
        gates: {
          ...(input.change.gates ?? {}),
          [input.gateId]: input.completion,
        },
      }),
    );
  });

  it("runs exactly ONE reconcile read and ZERO re-signals when a transient signal failure actually landed", async () => {
    const handle = {
      query: vi
        .fn()
        .mockResolvedValueOnce(pendingGate) // pre-signal terminal pre-check
        .mockResolvedValueOnce(doneGate), // the single bounded reconcile read
      signal: vi.fn().mockRejectedValue(saturationError()),
    };
    const client = fakeClientWithHandle(handle);
    vi.mocked(getService).mockReturnValue({ client } as never);

    const result = await completeReleaseGateAfterFinalization({
      store: createStore("/repo"),
      change: createChange({}),
      changeId: "fixPhase9PrDetection",
      finalization: shippedFinalization,
    });

    // Terminal reconcile → success/already-done result.
    expect(result).toMatchObject({ ok: true, alreadyDone: true });
    // Pre-signal read + exactly ONE reconcile read — no confirmation poll.
    expect(handle.query).toHaveBeenCalledTimes(2);
    // ZERO automatic re-signals: one fire attempt, never a blind retry.
    expect(handle.signal).toHaveBeenCalledTimes(1);
  });

  it("surfaces the classified error without re-signaling when the reconcile read is non-terminal", async () => {
    const handle = {
      query: vi.fn().mockResolvedValue(pendingGate),
      signal: vi.fn().mockRejectedValue(saturationError()),
    };
    const client = fakeClientWithHandle(handle);
    vi.mocked(getService).mockReturnValue({ client } as never);

    const result = await completeReleaseGateAfterFinalization({
      store: createStore("/repo"),
      change: createChange({}),
      changeId: "fixPhase9PrDetection",
      finalization: shippedFinalization,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("deadline");
      expect(result.workflowGateStatus).toBe("pending");
    }
    // Pre-signal read + exactly ONE reconcile read; reconcile never loops.
    expect(handle.query).toHaveBeenCalledTimes(2);
    expect(handle.signal).toHaveBeenCalledTimes(1);
  });

  it("keeps routing completed-workflow signal errors through disk-projection recovery (no reconcile read)", async () => {
    const handle = {
      query: vi.fn().mockResolvedValue(pendingGate),
      signal: vi
        .fn()
        .mockRejectedValue(new Error("Cannot signal a completed workflow")),
    };
    const client = fakeClientWithHandle(handle);
    vi.mocked(getService).mockReturnValue({ client } as never);

    const result = await completeReleaseGateAfterFinalization({
      store: createStore("/repo"),
      change: createChange({}),
      changeId: "fixPhase9PrDetection",
      finalization: shippedFinalization,
    });

    expect(result).toMatchObject({ ok: true, recoveryMutation: true });
    expect(
      recoveryWriterMocks.saveRecoveredGateCompletion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: "release",
        authorization: expect.objectContaining({
          reason: "completed_workflow_release_gate_recovery",
        }),
      }),
    );
    // The completed-workflow fallback is a distinct branch: no T3 reconcile
    // read (only the pre-signal query) and no re-signal.
    expect(handle.query).toHaveBeenCalledTimes(1);
    expect(handle.signal).toHaveBeenCalledTimes(1);
  });
});

describe("completeReleaseGateAfterFinalization — refresh-after-poll race fix (fixPhase9StatusSignal)", () => {
  // Signal-processing race: the workflow's changeStateQuery may return
  // pre-signal state on a read issued immediately after the signal fire,
  // because the signal call returns after server acceptance — without
  // waiting for the workflow handler to run. If store.changes.refresh is
  // called BEFORE waitForArchiveReleaseGateCompletion polls, its single
  // readback query may capture pre-signal state, classify it as
  // "confirmed", and cache + disk-write the stale state. The subsequent
  // verifyReleaseGateDurableForArchive then reads the stale cache and
  // fails with "did not observe release done".
  //
  // The fix moves store.changes.refresh to AFTER waitForArchiveReleaseGateCompletion
  // observes done, so the refresh's readback query returns post-signal state.
  const pendingGate = { status: "pending" };
  const doneGate = {
    status: "done",
    completed_at: "2026-01-01T00:00:00Z",
    completed_by: "adv-archive",
  };
  const shippedFinalization: GitFinalizeOutcome = {
    status: "shipped",
    mainCheckout: "/repo",
    defaultBranch: "trunk",
    pushStatus: "pushed",
    mergeCommitSha: "merge-sha-1",
  };

  beforeEach(() => {
    vi.mocked(getProjectId).mockResolvedValue("project-test");
  });

  it("calls store.changes.refresh AFTER waitForArchiveReleaseGateCompletion observes done, not before", async () => {
    // Order-tracking mock: each handle.query and store.changes.refresh call
    // appends to invocationLog with the observed gate state. The test asserts
    // that the first refresh invocation occurs AFTER at least one query
    // returned doneGate — proving refresh was sequenced after the poll
    // observed done, not before.
    type LogEntry =
      | { kind: "query"; result: unknown }
      | { kind: "refresh" };
    const invocationLog: LogEntry[] = [];

    // Sequence models the race window:
    //   - pre-signal query: pending
    //   - poll attempt 1: pending
    //   - poll attempt 2: done (workflow has now processed the signal)
    //   - refresh's readback after the fixed poll ordering: done
    const queryReturnSequence = [
      pendingGate, // pre-signal query
      pendingGate, // poll attempt 1
      doneGate, // poll attempt 2 — workflow caught up
      doneGate, // refresh's post-poll readback
    ];
    let queryCallIndex = 0;

    const handle = {
      query: vi.fn(async () => {
        const result =
          queryReturnSequence[queryCallIndex] ??
          queryReturnSequence[queryReturnSequence.length - 1] ??
          doneGate;
        queryCallIndex += 1;
        invocationLog.push({ kind: "query", result });
        return result;
      }),
      signal: vi.fn(async () => {
        // Signal accepted by the server; workflow will process asynchronously.
      }),
    };
    const client = fakeClientWithHandle(handle);
    vi.mocked(getService).mockReturnValue({ client } as never);

    const refreshMock = vi.fn(async () => {
      invocationLog.push({ kind: "refresh" });
      // Model refresh's state readback. With the pre-fix ordering this would
      // consume the second, still-pending query result before the poll; under
      // the fixed ordering it consumes the post-done result above.
      await handle.query();
    });
    const store = {
      ...createStore("/repo"),
      changes: { refresh: refreshMock },
    } as unknown as Store;

    const result = await completeReleaseGateAfterFinalization({
      store,
      change: createChange({}),
      changeId: "fixPhase9Race",
      finalization: shippedFinalization,
    });

    expect(result).toMatchObject({ ok: true });

    // The invariant: the first refresh call must occur AFTER at least one
    // query returned doneGate. Under the buggy sequencing (refresh before
    // poll), the first refresh would occur after only pendingGate queries.
    const firstRefreshIndex = invocationLog.findIndex(
      (entry) => entry.kind === "refresh",
    );
    expect(firstRefreshIndex).toBeGreaterThanOrEqual(0);

    const queriesBeforeRefresh = invocationLog.slice(0, firstRefreshIndex);
    const observedDoneBeforeRefresh = queriesBeforeRefresh.some(
      (entry) =>
        entry.kind === "query" &&
        (entry.result as { status?: string } | null)?.status === "done",
    );
    expect(observedDoneBeforeRefresh).toBe(true);
  });
});
