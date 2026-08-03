/**
 * Tests for archive-gate helpers that sit between the archive tool and the
 * git-finalize reachability engine. These tests exercise the helpers with
 * injected runGit/runGh so they fail against the current implementation for
 * issue #202 (Phase-9 PR metadata loss / branch auto-delete).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildPendingMergePhase9Status,
  buildReleaseCompletionEvidence,
  completeReleaseGateAfterFinalization,
  getArchiveGatePreflightError,
  recoverReleaseGateViaDiskProjection,
  verifyReleaseEvidenceFromMain,
  preservePhase9Evidence,
  runReacquiringChangeQuery,
  verifyReleaseGateDurableForArchive,
  waitForArchiveReleaseGateCompletion,
  type ArchiveGateState,
} from "./archive-gate";
import * as gitFinalize from "../archive-helpers/git-finalize";
import { getService, reinitStsl } from "../../temporal/service";
import { createMockOwnerFromClient } from "../../temporal/__tests__/mock-owner";
import { TemporalQueryTimeoutError } from "../../temporal/retry-wrapper";
import { getGateStatusQuery } from "../../temporal/messages";
import { getProjectId } from "../../utils/project-id";
import type { Change, Store } from "../../types";
import type {
  GitFinalizeDeps,
  GitFinalizeOutcome,
  ReleaseFinalizationRouteName,
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

const diskLoadMocks = vi.hoisted(() => ({
  loadChange: vi.fn(),
}));

vi.mock("../../storage/json", async () => {
  const actual =
    await vi.importActual<typeof import("../../storage/json")>(
      "../../storage/json",
    );
  return { ...actual, loadChange: diskLoadMocks.loadChange };
});

function createStore(repoRoot: string): Store {
  return {
    paths: {
      root: repoRoot,
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
  worker_bundle_impact?: Change["worker_bundle_impact"];
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
    worker_bundle_impact: Object.prototype.hasOwnProperty.call(
      options,
      "worker_bundle_impact",
    )
      ? options.worker_bundle_impact
      : { kind: "not_applicable", rationale: "test harness" },
    phase9_status: options.phase9_status,
  } as Change;
}

describe("verifyReleaseEvidenceFromMain", () => {
  // rq-fixPhase9PrDetection AC2: PR archive mode + deleted branch + no
  // prNumber must discover the merged PR and return shipped.
  it("returns shipped when PR mode has no prNumber but a merged PR is discoverable", () => {
    const repoRoot = "/repo";
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
      store: createStore(repoRoot),
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

  it("returns CHANGE_BRANCH_REF_UNRESOLVED when the origin change ref is unresolved", () => {
    vi.spyOn(gitFinalize, "detectDefaultBranch").mockReturnValue({
      branch: "trunk",
      source: "test",
    });
    vi.spyOn(gitFinalize, "classifyFinalizationRoute").mockReturnValue({
      route: "direct",
      repo: "Sharper-Flow/Advance",
    });
    vi.spyOn(gitFinalize, "resolveReleaseReachability").mockReturnValue({
      reachable: false,
      proof: "change_ref_unresolved",
      details: ["change ref unavailable"],
    });

    const result = verifyReleaseEvidenceFromMain({
      store: createStore("/repo"),
      changeId: "unresolvedRef",
      archiveMode: "direct",
    });

    expect(result.status).toBe("blocked");
    expect(result.blocked?.reason).toBe("CHANGE_BRANCH_REF_UNRESOLVED");
    expect(result.blocked?.remediation).toContain("adv_doctor");
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
      releasedCommitSha: "local-trunk-sha",
    });

    const result = verifyReleaseEvidenceFromMain({
      store: createStore("/repo"),
      changeId: "fixPhase9PrDetection",
      archiveMode: "pr",
    });

    expect(result.status).toBe("shipped");
    expect(result.route).toBe("no_remote");
    expect(result.releasedCommitSha).toBe("local-trunk-sha");
    expect(result.mergeCommitSha).toBeUndefined();
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

  // rq-archiveRetryIdempotence01 AC1 regression: direct default-branch
  // reachability must expose a route-neutral releasedCommitSha so archived
  // delta-projection proof can proceed without a PR merge commit.
  it("regression: direct origin_default shipped evidence carries releasedCommitSha", () => {
    vi.spyOn(gitFinalize, "detectDefaultBranch").mockReturnValue({
      branch: "trunk",
      source: "test",
    });
    vi.spyOn(gitFinalize, "classifyFinalizationRoute").mockReturnValue({
      route: "direct",
      repo: "Sharper-Flow/Advance",
    });
    vi.spyOn(gitFinalize, "resolveReleaseReachability").mockReturnValue({
      reachable: true,
      proof: "origin_default",
      releasedCommitSha: "origin-trunk-sha",
    });

    const runGit: GitFinalizeDeps["runGit"] = (_cwd, args) => {
      if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "HEAD")
        return { status: 0, stdout: "origin-trunk-sha\n", stderr: "" };
      if (args[0] === "ls-remote")
        return {
          status: 0,
          stdout: "origin-trunk-sha\trefs/heads/trunk\n",
          stderr: "",
        };
      return {
        status: 1,
        stdout: "",
        stderr: `unexpected git ${args.join(" ")}`,
      };
    };

    const result = verifyReleaseEvidenceFromMain({
      store: createStore("/repo"),
      changeId: "fixDirectArchiveRetry",
      archiveMode: "direct",
      deps: { runGit },
    });

    expect(result.status).toBe("shipped");
    expect(result.route).toBe("direct");
    expect(result.releasedCommitSha).toBe("origin-trunk-sha");
    expect(result.mergeCommitSha).toBeUndefined();
  });
});

describe("buildPendingMergePhase9Status", () => {
  // rq-fixPhase9PrDetection AC4: durable fields must survive the transition
  // from pending to pending_merge.
  it("preserves previous changeTipSha", () => {
    const result = buildPendingMergePhase9Status({
      finalization: {
        status: "pending_merge",
        repoRoot: "/repo",
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

function fakeOwnerWithHandle(handle: {
  query: ReturnType<typeof vi.fn>;
  describe?: ReturnType<typeof vi.fn>;
  signal?: ReturnType<typeof vi.fn>;
}) {
  const fullHandle = {
    describe:
      handle.describe ?? vi.fn(async () => ({ status: { name: "RUNNING" } })),
    query: handle.query,
    signal: handle.signal ?? vi.fn(),
  };
  return createMockOwnerFromClient({
    workflow: { getHandle: vi.fn(() => fullHandle) },
  });
}

describe("runReacquiringChangeQuery", () => {
  // rq-reapOrphanAdvWorkers T2: a handle captured before a mid-op reconnect
  // keeps the closed client. The reacquiring query must rebuild the handle
  // from getService() inside every retry attempt.
  it("reacquires the owner via getService() on retry after a reconnectable transport failure", async () => {
    const doneGate = { status: "done" };
    const secondHandle = { query: vi.fn(async () => doneGate) };
    const secondOwner = fakeOwnerWithHandle(secondHandle);
    let owner = secondOwner;
    const firstHandle = {
      query: vi.fn(async () => {
        // Simulate reinitStsl replacing the cached owner.
        owner = secondOwner;
        throw new Error("Channel has been shut down");
      }),
    };
    const firstOwner = fakeOwnerWithHandle(firstHandle);
    owner = firstOwner;
    vi.mocked(getService).mockImplementation(
      () => owner as unknown as ReturnType<typeof getService>,
    );

    const result = await runReacquiringChangeQuery(
      "0000000000000000000000000000000000000000",
      "change-a",
      getGateStatusQuery,
      "release",
    );

    expect(result).toEqual(doneGate);
    expect(firstHandle.query).toHaveBeenCalledTimes(1);
    expect(secondHandle.query).toHaveBeenCalledTimes(1);
    // The retried attempt rebuilt its handle from the swapped-in owner,
    // not the closed one.
    expect(secondOwner.getHandle).toHaveBeenCalledTimes(1);
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
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);
    vi.mocked(reinitStsl).mockClear();

    const result = await runReacquiringChangeQuery(
      "0000000000000000000000000000000000000000",
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
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);

    const result = await waitForArchiveReleaseGateCompletion(
      "0000000000000000000000000000000000000000",
      "change-a",
      { delayMs: 1 },
    );

    expect(result).toEqual(doneGate);
    expect(handle.query).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getService).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(client.getHandle).toHaveBeenCalledTimes(2);
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
    repoRoot: "/repo",
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
    vi.mocked(getProjectId).mockResolvedValue(
      "0000000000000000000000000000000000000000",
    );
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
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);

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
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);

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
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);

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

describe("completeReleaseGateAfterFinalization — bounded release-gate query (AC1/AC2)", () => {
  const shippedFinalization: GitFinalizeOutcome = {
    status: "shipped",
    repoRoot: "/repo",
    defaultBranch: "trunk",
    pushStatus: "pushed",
    mergeCommitSha: "merge-sha-1",
  };

  beforeEach(() => {
    vi.mocked(getProjectId).mockResolvedValue(
      "0000000000000000000000000000000000000000",
    );
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

  it("AC2: describe() pre-check detects TERMINATED and skips the hanging query", async () => {
    const handle = {
      query: vi.fn(() => new Promise(() => {})), // never resolves
      describe: vi.fn(async () => ({ status: { name: "TERMINATED" } })),
      signal: vi.fn(),
    };
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);

    const result = await completeReleaseGateAfterFinalization({
      store: createStore("/repo"),
      change: createChange({}),
      changeId: "fixArchiveConvergenceAc2",
      finalization: shippedFinalization,
    });

    expect(result).toMatchObject({ ok: true, recoveryMutation: true });
    expect(handle.describe).toHaveBeenCalledTimes(1);
    expect(handle.query).not.toHaveBeenCalled();
  });

  it("AC1: bounded query failure routes to recovery on an orphaned/unresponsive workflow", async () => {
    // Simulates the 3s budget expiry: the query throws a
    // TemporalQueryTimeoutError (as runTemporalRead would after the budget).
    // The catch must route to recoverReleaseGateIfWorkflowCompleted with
    // recoverOnUnresponsive → disk-projection recovery → { ok: true }.
    const handle = {
      query: vi.fn(async () => {
        throw new TemporalQueryTimeoutError(3_000);
      }),
      describe: vi.fn(async () => ({ status: { name: "RUNNING" } })),
      signal: vi.fn(),
    };
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);

    const result = await completeReleaseGateAfterFinalization({
      store: createStore("/repo"),
      change: createChange({}),
      changeId: "fixArchiveConvergenceAc1",
      finalization: shippedFinalization,
    });

    expect(result).toMatchObject({ ok: true, recoveryMutation: true });
    expect(handle.query).toHaveBeenCalledTimes(1);
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
    repoRoot: "/repo",
    defaultBranch: "trunk",
    pushStatus: "pushed",
    mergeCommitSha: "merge-sha-1",
  };

  beforeEach(() => {
    vi.mocked(getProjectId).mockResolvedValue(
      "0000000000000000000000000000000000000000",
    );
  });

  it("calls store.changes.invalidate AFTER waitForArchiveReleaseGateCompletion observes done, not refresh", async () => {
    // Order-tracking mock: each handle.query and store.changes.invalidate call
    // appends to invocationLog. The test asserts that the invalidate invocation
    // occurs AFTER at least one query returned doneGate — proving invalidate was
    // sequenced after the poll observed done, not before.
    type LogEntry = { kind: "query"; result: unknown } | { kind: "invalidate" };
    const invocationLog: LogEntry[] = [];

    // Sequence models the race window:
    //   - pre-signal query: pending
    //   - poll attempt 1: pending
    //   - poll attempt 2: done (workflow has now processed the signal)
    const queryReturnSequence = [
      pendingGate, // pre-signal query
      pendingGate, // poll attempt 1
      doneGate, // poll attempt 2 — workflow caught up
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
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);

    const refreshMock = vi.fn(async () => {
      // Refresh should NOT be called on the confirmed-done branch after #305.
      invocationLog.push({ kind: "refresh" as const });
      await handle.query();
    });
    const invalidateMock = vi.fn(async () => {
      invocationLog.push({ kind: "invalidate" });
    });
    const store = {
      ...createStore("/repo"),
      changes: { refresh: refreshMock, invalidate: invalidateMock },
    } as unknown as Store;

    const result = await completeReleaseGateAfterFinalization({
      store,
      change: createChange({}),
      changeId: "fixPhase9Race",
      finalization: shippedFinalization,
    });

    expect(result).toMatchObject({ ok: true });
    expect(refreshMock).not.toHaveBeenCalled();

    // The invariant: invalidate must occur AFTER at least one query returned
    // doneGate. Under the pre-fix sequencing (refresh before poll), a cache-
    // mutating call would occur before any done observation.
    const firstInvalidateIndex = invocationLog.findIndex(
      (entry) => entry.kind === "invalidate",
    );
    expect(firstInvalidateIndex).toBeGreaterThanOrEqual(0);

    const queriesBeforeInvalidate = invocationLog.slice(
      0,
      firstInvalidateIndex,
    );
    const observedDoneBeforeInvalidate = queriesBeforeInvalidate.some(
      (entry) =>
        entry.kind === "query" &&
        (entry.result as { status?: string } | null)?.status === "done",
    );
    expect(observedDoneBeforeInvalidate).toBe(true);
  });

  it("calls store.changes.invalidate when the pre-signal query already returns done (alreadyDone branch)", async () => {
    // When the release gate is ALREADY done on the first query (a prior signal
    // landed, or a retry finds done immediately), the alreadyDone short-circuit
    // must still drop the poisoned cache so the immediately-following second
    // verifyReleaseGateDurableForArchive store.gates.get queries fresh instead
    // of reading a stale pending entry left by a racing refresh.
    const invalidateMock = vi.fn(async () => {});
    const handle = {
      // First (and only) query returns done → alreadyDone short-circuit, no signal.
      query: vi.fn(async () => doneGate),
      signal: vi.fn(async () => {}),
    };
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);

    const store = {
      ...createStore("/repo"),
      changes: { refresh: vi.fn(), invalidate: invalidateMock },
    } as unknown as Store;

    const result = await completeReleaseGateAfterFinalization({
      store,
      change: createChange({}),
      changeId: "fixAlreadyDoneInvalidate",
      finalization: shippedFinalization,
    });

    expect(result).toMatchObject({ ok: true, alreadyDone: true });
    expect(invalidateMock).toHaveBeenCalledWith("fixAlreadyDoneInvalidate");
    // No signal should fire when the gate is already done.
    expect(handle.signal).not.toHaveBeenCalled();
  });
});

describe("completeReleaseGateAfterFinalization — #305 residual cache-poisoning race", () => {
  // Even with the fixPhase9StatusSignal ordering, store.changes.refresh's
  // readback query can return a stale pre-signal "pending" snapshot after
  // waitForArchiveReleaseGateCompletion has observed "done". refresh then
  // calls dualWriteAfterMutation, which classifies the stale read as
  // "confirmed" and re-poison changeCache. The subsequent
  // verifyReleaseGateDurableForArchive reads the poisoned cache and fails
  // with "did not observe release done".
  //
  // The fix replaces refresh with invalidate on the confirmed-done branch:
  // invalidate drops the cache entry only, so the next store.gates.get misses
  // the cache and queries the workflow fresh, observing release=done.
  const pendingGate = { status: "pending" };
  const doneGate = {
    status: "done",
    completed_at: "2026-01-01T00:00:00Z",
    completed_by: "adv-archive",
  };
  const shippedFinalization: GitFinalizeOutcome = {
    status: "shipped",
    repoRoot: "/repo",
    defaultBranch: "trunk",
    pushStatus: "pushed",
    releasedCommitSha: "merge-sha-1",
    mergeCommitSha: "merge-sha-1",
  };

  beforeEach(() => {
    vi.mocked(getProjectId).mockResolvedValue(
      "0000000000000000000000000000000000000000",
    );
  });

  it("invalidate (not refresh) lets verifyReleaseGateDurableForArchive observe release done from the store", async () => {
    // Shared mutable cache variable models changeCache. store.gates.get
    // returns the cached gate when present; an undefined cache models a
    // cache miss and returns the fresh workflow state (doneGate).
    let cachedReleaseGate: { status: string } | undefined;

    // Sequence models the residual race:
    //   - pre-signal query: pending
    //   - poll attempt 1: pending
    //   - poll attempt 2: done (workflow caught up)
    //   - refresh's readback after the poll: stale pending (residual race)
    const queryReturnSequence = [
      pendingGate, // pre-signal query
      pendingGate, // poll attempt 1
      doneGate, // poll attempt 2
      pendingGate, // refresh's readback returns stale pre-signal state
    ];
    let queryCallIndex = 0;

    const handle = {
      query: vi.fn(async () => {
        const result =
          queryReturnSequence[queryCallIndex] ??
          queryReturnSequence[queryReturnSequence.length - 1] ??
          doneGate;
        queryCallIndex += 1;
        return result;
      }),
      signal: vi.fn(async () => {
        // Signal accepted by the server; workflow will process asynchronously.
      }),
    };
    const client = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(client);

    const refreshMock = vi.fn(async () => {
      // Model refresh's state readback re-caching stale pre-signal state.
      cachedReleaseGate = await handle.query();
    });
    const invalidateMock = vi.fn(async () => {
      // Model invalidate: drop the cache entry only. The next store.gates.get
      // misses cache and reads fresh workflow state.
      cachedReleaseGate = undefined;
    });
    const store = {
      ...createStore("/repo"),
      changes: { refresh: refreshMock, invalidate: invalidateMock },
      gates: {
        get: vi.fn(async () => ({
          release: cachedReleaseGate ?? doneGate,
        })),
      },
    } as unknown as Store;

    const completion = await completeReleaseGateAfterFinalization({
      store,
      change: createChange({}),
      changeId: "issue305CachePoison",
      finalization: shippedFinalization,
    });

    expect(completion).toMatchObject({ ok: true });

    const durableProof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "issue305CachePoison",
      evidence: buildReleaseCompletionEvidence(shippedFinalization),
      finalization: shippedFinalization,
    });

    expect(durableProof).toMatchObject({
      ok: true,
      source: "store",
      gate: doneGate,
    });
    expect(durableProof).not.toMatchObject({ source: "disk" });
    // Under the fixed code the cache is cleared, so the proof reads fresh
    // workflow state directly. Under the buggy code refresh poisons the cache
    // with pending and the proof fails before this assertion.
    expect(cachedReleaseGate).toBeUndefined();
  });
});

describe("verifyReleaseGateDurableForArchive — forge-guard regression (AC4)", () => {
  const shippedFinalization: GitFinalizeOutcome = {
    status: "shipped",
    repoRoot: "/repo",
    defaultBranch: "trunk",
    route: "direct",
    pushStatus: "pushed",
    releasedCommitSha: "merge-sha-shipped",
    mergeCommitSha: "merge-sha-shipped",
  };
  it("rejects a non-shipped change whose release gate carries a forged recovery_audit reason", async () => {
    const forgedGate = {
      status: "done",
      completed_at: "2026-01-01T00:00:00Z",
      completed_by: "adv-archive",
      approval_evidence: "old-approval",
      recovery_audit: {
        reason: "forged_unrecognized_reason",
        evidence: "forged-evidence",
        audited_at: "2026-01-01T00:00:00Z",
      },
    };
    const store = {
      ...createStore("/repo"),
      gates: {
        get: vi.fn(async () => ({ release: forgedGate })),
      },
    } as unknown as Store;

    const durableProof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "forgeGuard",
      evidence: "legitimate-finalization-evidence",
      finalization: {
        status: "pending_merge",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        pushStatus: "not_attempted",
      },
    });

    expect(durableProof).toMatchObject({
      ok: false,
      error: expect.stringContaining(
        "Store-backed durable release gate proof lacks matching Phase 9 evidence",
      ),
    });
  });

  it("accepts a shipped change whose release gate is done via shipped bypass (store path, no audit required)", async () => {
    // Forge guard: the LIVE STORE path accepts a done release gate when
    // finalization is shipped (git-confirmed reachability is authoritative)
    // WITHOUT requiring a recovery audit — even when the approval evidence does
    // NOT substring-match the structured completion evidence.
    const doneNoAudit = {
      status: "done",
      completed_at: "2026-01-01T00:00:00Z",
      completed_by: "adv-archive",
      approval_evidence: "free-text-manual-approval-notes",
    };
    const store = {
      ...createStore("/repo"),
      gates: {
        get: vi.fn(async () => ({ release: doneNoAudit })),
      },
    } as unknown as Store;

    const durableProof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "shippedBypass",
      evidence: "structured-phase9-evidence",
      finalization: shippedFinalization,
    });

    expect(durableProof).toMatchObject({ ok: true, source: "store" });
  });

  it("accepts a shipped change whose store gate lags pending but disk gate is done (rq-releaseProjectionDurability01)", async () => {
    // Repro (fixArchiveMissingWorkflow): a healthy manual
    // adv_gate_complete(release) persisted release=done to disk, but the
    // store-backed projection (store.gates.get) returns a stale pre-completion
    // pending snapshot — changeCache was poisoned by the old
    // fireSignalAndRefresh re-readback (getTemporalChange reads changeCache
    // first). finalization is git-verified shipped (merge commit already on the
    // default branch). The disk fallback must reconcile: shipped + done disk
    // gate = released. The free-text approval_evidence does NOT substring-match
    // the structured Phase 9 evidence, and there is no recovery_audit — so the
    // pre-fix code rejected this at loadAuditedDiskReleaseGate
    // (shippedReconcile false, evidence false → returns null).
    const stalePendingStoreGate = { status: "pending" };
    const doneDiskGate = {
      status: "done",
      completed_at: "2026-01-01T00:00:00Z",
      completed_by: "agent",
      approval_evidence: "free-text-manual-approval-notes",
    };
    const store = {
      ...createStore("/repo"),
      gates: {
        get: vi.fn(async () => ({ release: stalePendingStoreGate })),
      },
    } as unknown as Store;

    diskLoadMocks.loadChange.mockResolvedValue({
      success: true,
      data: { gates: { release: doneDiskGate } },
    });

    const durableProof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "staleStoreShippedDiskDone",
      evidence: "structured-phase9-evidence",
      finalization: shippedFinalization,
    });

    expect(durableProof).toMatchObject({
      ok: true,
      source: "disk",
    });
  });
});

describe("verifyReleaseGateDurableForArchive — shipped authoritative proof (fixReleaseProofShippedFalse)", () => {
  const shippedFinalization: GitFinalizeOutcome = {
    status: "shipped",
    repoRoot: "/repo",
    defaultBranch: "trunk",
    route: "direct",
    pushStatus: "pushed",
    releasedCommitSha: "merge-sha-123",
    mergeCommitSha: "merge-sha-123",
  };

  function makeBothPendingStore(): Store {
    return {
      ...createStore("/repo"),
      gates: {
        get: vi.fn(async () => ({
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "pending" },
        })),
      },
    } as unknown as Store;
  }

  it("AC1: shipped + store pending + disk pending → accepts and reconciles a done gate", async () => {
    diskLoadMocks.loadChange.mockResolvedValue({
      success: true,
      data: {
        gates: { release: { status: "pending" } },
        worker_bundle_impact: {
          kind: "not_applicable",
          rationale: "test harness",
        },
      },
    });
    const store = makeBothPendingStore();

    const proof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "shippedNoDoneGate",
      evidence: buildReleaseCompletionEvidence(shippedFinalization),
      finalization: shippedFinalization,
    });

    expect(proof).toMatchObject({
      ok: true,
      accepted: true,
      source: "shipped-finalization",
      releasedCommitSha: shippedFinalization.releasedCommitSha,
      mergeCommitSha: shippedFinalization.mergeCommitSha,
      pushStatus: shippedFinalization.pushStatus,
      route: shippedFinalization.route,
      finalizationStatus: "shipped",
    });
    expect(proof.gate).toBeDefined();
    expect(proof.gate?.status).toBe("done");
    expect(proof.gate?.approval_evidence).toContain("merge-sha-123");
    expect(proof.gate?.approval_evidence).toContain("direct");
  });

  it("AC2: non-shipped (pending_merge) + store pending + disk pending → rejects, guard preserved", async () => {
    diskLoadMocks.loadChange.mockResolvedValue({
      success: true,
      data: {
        gates: { release: { status: "pending" } },
        worker_bundle_impact: {
          kind: "not_applicable",
          rationale: "test harness",
        },
      },
    });
    const store = makeBothPendingStore();

    const proof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "notShippedNoDoneGate",
      evidence: "irrelevant",
      finalization: {
        status: "pending_merge",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        pushStatus: "pushed",
        mergeCommitSha: "merge-sha-123",
      },
    });

    expect(proof).toMatchObject({
      ok: false,
      accepted: false,
      error: expect.stringContaining(
        "Store-backed durable release gate proof did not observe release done",
      ),
    });
  });

  it("AC3: shipped proof missing releasedCommitSha → does not short-circuit", async () => {
    diskLoadMocks.loadChange.mockResolvedValue({
      success: true,
      data: {
        gates: { release: { status: "pending" } },
        worker_bundle_impact: {
          kind: "not_applicable",
          rationale: "test harness",
        },
      },
    });
    const store = makeBothPendingStore();

    const proof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "shippedMissingMergeSha",
      evidence: "irrelevant",
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "direct",
        pushStatus: "pushed",
      },
    });

    expect(proof).toMatchObject({
      ok: false,
      accepted: false,
      error: expect.stringContaining(
        "Store-backed durable release gate proof did not observe release done",
      ),
    });
  });

  it("AC3: shipped no_remote route with skipped push is no longer accepted", async () => {
    diskLoadMocks.loadChange.mockResolvedValue({
      success: true,
      data: {
        gates: { release: { status: "pending" } },
        worker_bundle_impact: {
          kind: "not_applicable",
          rationale: "test harness",
        },
      },
    });
    const store = makeBothPendingStore();

    const proof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "shippedNoRemote",
      evidence: "irrelevant",
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "no_remote",
        pushStatus: "skipped",
        releasedCommitSha: "local-merge-sha",
        mergeCommitSha: "local-merge-sha",
      },
    });

    expect(proof).toMatchObject({
      ok: false,
      accepted: false,
    });
  });
});

describe("verifyReleaseGateDurableForArchive — cross-cutting shipped proof matrix (fixReleaseProofShippedFalse)", () => {
  function makeStoreWithReleaseGate(releaseGate: unknown): Store {
    return {
      ...createStore("/repo"),
      gates: {
        get: vi.fn(async () => ({
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: releaseGate,
        })),
      },
    } as unknown as Store;
  }

  function makeBothPendingStore(): Store {
    return {
      ...createStore("/repo"),
      gates: {
        get: vi.fn(async () => ({
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "pending" },
        })),
      },
    } as unknown as Store;
  }

  const shippedBase: GitFinalizeOutcome = {
    status: "shipped",
    repoRoot: "/repo",
    defaultBranch: "trunk",
    pushStatus: "pushed",
    releasedCommitSha: "merge-sha-matrix",
    mergeCommitSha: "merge-sha-matrix",
    route: "direct",
  };

  it("AC4 regression: shipped + store release done accepts with source 'store' (rescue short-circuits)", async () => {
    const store = makeStoreWithReleaseGate({
      status: "done",
      completed_at: "2026-01-01T00:00:00Z",
      completed_by: "agent",
      approval_evidence: "free-text-manual-notes",
    });

    const proof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "shippedStoreDone",
      evidence: "does-not-match",
      finalization: shippedBase,
    });

    expect(proof).toMatchObject({
      ok: true,
      accepted: true,
      source: "store",
      finalizationStatus: "shipped",
    });
    expect(proof).not.toMatchObject({ source: "shipped-finalization" });
  });

  it("AC4 regression: shipped + store pending + disk release done accepts with source 'shipped-finalization'", async () => {
    diskLoadMocks.loadChange.mockResolvedValue({
      success: true,
      data: {
        gates: {
          release: {
            status: "done",
            completed_at: "2026-01-01T00:00:00Z",
            completed_by: "agent",
            approval_evidence: "free-text-manual-notes",
          },
        },
      },
    });

    const proof = await verifyReleaseGateDurableForArchive({
      store: makeBothPendingStore(),
      changeId: "shippedDiskDone",
      evidence: "does-not-match",
      finalization: shippedBase,
    });

    expect(proof).toMatchObject({
      ok: true,
      accepted: true,
      source: "disk",
      finalizationStatus: "shipped",
    });
  });

  it("AC4 regression: un-shipped + store release done with matching evidence accepts", async () => {
    const finalization: GitFinalizeOutcome = {
      status: "blocked",
      repoRoot: "/repo",
      defaultBranch: "trunk",
      pushStatus: "not_attempted",
    };
    const evidence = buildReleaseCompletionEvidence(finalization);
    const store = makeStoreWithReleaseGate({
      status: "done",
      completed_at: "2026-01-01T00:00:00Z",
      completed_by: "agent",
      approval_evidence: `release done; ${evidence}`,
    });

    const proof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "unshippedEvidenceMatch",
      evidence,
      finalization,
    });

    expect(proof).toMatchObject({
      ok: true,
      accepted: true,
      source: "store",
      finalizationStatus: "blocked",
    });
  });

  it("AC4 regression: un-shipped + store release done with mismatched evidence rejects", async () => {
    const store = makeStoreWithReleaseGate({
      status: "done",
      completed_at: "2026-01-01T00:00:00Z",
      completed_by: "agent",
      approval_evidence: "old-evidence",
    });

    const proof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "unshippedMismatch",
      evidence: "new-evidence",
      finalization: {
        status: "pending_merge",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        pushStatus: "pushed",
        mergeCommitSha: "abc",
      },
    });

    expect(proof.ok).toBe(false);
    expect(proof.error).toContain(
      "Store-backed durable release gate proof lacks matching Phase 9 evidence",
    );
  });

  it("KD5 guard: shipped + valid route/push but missing releasedCommitSha + store-pending + disk-pending rejects", async () => {
    diskLoadMocks.loadChange.mockResolvedValue({
      success: true,
      data: {
        gates: { release: { status: "pending" } },
        worker_bundle_impact: {
          kind: "not_applicable",
          rationale: "test harness",
        },
      },
    });

    const proof = await verifyReleaseGateDurableForArchive({
      store: makeBothPendingStore(),
      changeId: "shippedMissingMergeShaKD5",
      evidence: "irrelevant",
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "direct",
        pushStatus: "pushed",
      },
    });

    expect(proof.ok).toBe(false);
    expect(proof.error).toContain(
      "Store-backed durable release gate proof did not observe release done",
    );
  });

  const shippedRouteCases: Array<{
    route: ReleaseFinalizationRouteName;
    pushStatus: "pushed" | "skipped";
    label: string;
  }> = [
    { route: "direct", pushStatus: "pushed", label: "direct + pushed" },
    {
      route: "pr_auto_merge",
      pushStatus: "pushed",
      label: "pr_auto_merge + pushed",
    },
    { route: "pr_manual", pushStatus: "pushed", label: "pr_manual + pushed" },
    {
      route: "merge_queue",
      pushStatus: "pushed",
      label: "merge_queue + pushed",
    },
  ];

  it.each(shippedRouteCases)(
    "route matrix: %s shipped + releasedCommitSha + pending/pending accepts via shipped-finalization",
    async ({ route, pushStatus }) => {
      diskLoadMocks.loadChange.mockResolvedValue({
        success: true,
        data: {
          gates: { release: { status: "pending" } },
          worker_bundle_impact: {
            kind: "not_applicable",
            rationale: "test harness",
          },
        },
      });
      const finalization: GitFinalizeOutcome = {
        ...shippedBase,
        route,
        pushStatus,
        releasedCommitSha: `${route}-merge-sha`,
        mergeCommitSha: `${route}-merge-sha`,
      };

      const proof = await verifyReleaseGateDurableForArchive({
        store: makeBothPendingStore(),
        changeId: `shippedRoute-${route}`,
        evidence: buildReleaseCompletionEvidence(finalization),
        finalization,
      });

      expect(proof).toMatchObject({
        ok: true,
        accepted: true,
        source: "shipped-finalization",
        finalizationStatus: "shipped",
        route,
        pushStatus,
        releasedCommitSha: `${route}-merge-sha`,
        mergeCommitSha: `${route}-merge-sha`,
      });
      expect(proof.gate).toBeDefined();
      expect(proof.gate?.status).toBe("done");
    },
  );

  it("route matrix: no_remote shipped + skipped is rejected", async () => {
    diskLoadMocks.loadChange.mockResolvedValue({
      success: true,
      data: {
        gates: { release: { status: "pending" } },
        worker_bundle_impact: {
          kind: "not_applicable",
          rationale: "test harness",
        },
      },
    });
    const finalization: GitFinalizeOutcome = {
      ...shippedBase,
      route: "no_remote",
      pushStatus: "skipped",
      releasedCommitSha: "no_remote-merge-sha",
      mergeCommitSha: "no_remote-merge-sha",
    };

    const proof = await verifyReleaseGateDurableForArchive({
      store: makeBothPendingStore(),
      changeId: "shippedRoute-no_remote",
      evidence: buildReleaseCompletionEvidence(finalization),
      finalization,
    });

    expect(proof).toMatchObject({
      ok: false,
      accepted: false,
    });
  });

  it.each(["blocked", "pending_merge"] as const)(
    "guard preservation: %s finalizationStatus never satisfies shipped",
    async (status) => {
      diskLoadMocks.loadChange.mockResolvedValue({
        success: true,
        data: {
          gates: { release: { status: "pending" } },
          worker_bundle_impact: {
            kind: "not_applicable",
            rationale: "test harness",
          },
        },
      });

      const proof = await verifyReleaseGateDurableForArchive({
        store: makeBothPendingStore(),
        changeId: `notShipped-${status}`,
        evidence: "irrelevant",
        finalization: {
          status,
          repoRoot: "/repo",
          defaultBranch: "trunk",
          route: "direct",
          pushStatus: "pushed",
          mergeCommitSha: "abc",
        },
      });

      expect(proof.ok).toBe(false);
      expect(proof.error).toContain(
        "Store-backed durable release gate proof did not observe release done",
      );
    },
  );
});

describe("worker-bundle provenance chokepoint (fixArchivedProvenanceRecovery)", () => {
  const allDoneGates: Gates = {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "done" },
    execution: { status: "done" },
    acceptance: { status: "done" },
    release: { status: "done" },
  } as Gates;

  function makeReleasePendingGateState(): ArchiveGateState {
    return {
      effectiveGates: {
        ...allDoneGates,
        release: { status: "pending" },
      } as Gates,
      storeGates: allDoneGates,
      source: "store",
    };
  }

  it("getArchiveGatePreflightError blocks release-pending archive entry when worker_bundle_impact is undeclared", () => {
    const error = getArchiveGatePreflightError(
      "fixPhase9PrDetection",
      makeReleasePendingGateState(),
      true,
      null,
      createChange({ worker_bundle_impact: undefined }),
    );
    expect(error).toContain(
      "worker-bundle release provenance is undeclared or invalid",
    );
    expect(error).toContain("WORKER_BUNDLE_PROVENANCE_DECLARATION_REQUIRED");
  });

  it("getArchiveGatePreflightError blocks release-pending archive entry when required impact lacks provenance", () => {
    const error = getArchiveGatePreflightError(
      "fixPhase9PrDetection",
      makeReleasePendingGateState(),
      true,
      null,
      createChange({
        worker_bundle_impact: {
          kind: "required",
          rationale: "touches worker bundle",
        },
      }),
    );
    expect(error).toContain(
      "worker-bundle release provenance is undeclared or invalid",
    );
    expect(error).toContain("WORKER_BUNDLE_PROVENANCE_MISSING");
  });

  it("getArchiveGatePreflightError blocks release-pending archive entry when not_applicable lacks rationale", () => {
    const error = getArchiveGatePreflightError(
      "fixPhase9PrDetection",
      makeReleasePendingGateState(),
      true,
      null,
      createChange({
        worker_bundle_impact: { kind: "not_applicable" },
      } as unknown as Parameters<typeof createChange>[0]),
    );
    expect(error).toContain(
      "worker-bundle release provenance is undeclared or invalid",
    );
    expect(error).toContain(
      "WORKER_BUNDLE_PROVENANCE_NOT_APPLICABLE_RATIONALE_REQUIRED",
    );
  });

  it("getArchiveGatePreflightError allows release-pending archive entry with not_applicable rationale", () => {
    const error = getArchiveGatePreflightError(
      "fixPhase9PrDetection",
      makeReleasePendingGateState(),
      true,
      null,
      createChange({}),
    );
    expect(error).toBeNull();
  });

  it("completeReleaseGateAfterFinalization blocks shipped release without provenance", async () => {
    vi.mocked(getProjectId).mockResolvedValue("project-test");
    const handle = {
      describe: vi.fn(async () => ({ status: { name: "RUNNING" } })),
      query: vi.fn(async () => ({ status: "pending" })),
      signal: vi.fn(async () => {}),
    };
    const owner = fakeOwnerWithHandle(handle);
    vi.mocked(getService).mockReturnValue(owner as never);

    const result = await completeReleaseGateAfterFinalization({
      store: createStore("/repo"),
      changeId: "fixPhase9PrDetection",
      change: createChange({ worker_bundle_impact: undefined }),
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "direct",
        pushStatus: "pushed",
        releasedCommitSha: "abc123",
        mergeCommitSha: "abc123",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(
      "worker-bundle provenance is undeclared or invalid",
    );
    expect(
      result.readinessBlockers?.some((b) =>
        b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
      ),
    ).toBe(true);
  });

  it("recoverReleaseGateViaDiskProjection blocks completed-workflow recovery without provenance", async () => {
    recoveryWriterMocks.saveRecoveredGateCompletion.mockResolvedValue({
      gates: { release: { status: "done" } },
    });

    const result = await recoverReleaseGateViaDiskProjection({
      store: createStore("/repo"),
      change: createChange({ worker_bundle_impact: undefined }),
      evidence: "Phase 9 finalization shipped",
      recoveryEvidence: "workflow execution already completed",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(
      "worker-bundle provenance is undeclared or invalid",
    );
    expect(
      result.readinessBlockers?.some((b) =>
        b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
      ),
    ).toBe(true);
  });

  it("verifyReleaseGateDurableForArchive shipped rescue blocks missing provenance", async () => {
    diskLoadMocks.loadChange.mockResolvedValue({
      success: true,
      data: { gates: { release: { status: "pending" } } },
    });
    const store = {
      ...createStore("/repo"),
      gates: {
        get: vi.fn(async () => ({
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "pending" },
        })),
      },
    } as unknown as Store;

    const proof = await verifyReleaseGateDurableForArchive({
      store,
      changeId: "shippedNoProvenance",
      evidence: "irrelevant",
      finalization: {
        status: "shipped",
        repoRoot: "/repo",
        defaultBranch: "trunk",
        route: "direct",
        pushStatus: "pushed",
        releasedCommitSha: "abc123",
        mergeCommitSha: "abc123",
      },
    });

    expect(proof.ok).toBe(false);
    if (proof.ok) return;
    expect(proof.error).toContain(
      "worker-bundle provenance is undeclared or invalid",
    );
    expect(
      proof.readinessBlockers?.some((b) =>
        b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
      ),
    ).toBe(true);
  });
});
