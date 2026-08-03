import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Store } from "../store-types";
import {
  AdvProjectContextMismatchError,
  classifyTemporalReadFailure,
  getGuardedChangeHandle,
  mapTemporalChangeStateToChange,
  QUERY_TIMEOUT_MS,
  resolveQueryTimeoutMs,
  runTemporalQuery,
  type TemporalStoreBackendInput,
  type WorkflowHandleLike,
} from "./shared";
import {
  createTemporalReadDeadline,
  TemporalQueryTimeoutError,
} from "../../temporal/retry-wrapper";
import { createMockOwner } from "../../temporal/__tests__/mock-owner";
import { reinitStsl } from "../../temporal/service";
import { createChangeWorkflowState } from "../../temporal/change-state";

const PROJECT_ID_A = "0000ec0a00000000000000000000000000000000";
const PROJECT_ID_B = "0000ec0b00000000000000000000000000000000";

vi.mock("../../temporal/service", () => ({
  reinitStsl: vi.fn(async () => undefined),
}));

describe("QUERY_TIMEOUT_MS / resolveQueryTimeoutMs", () => {
  const envKey = "ADV_TEMPORAL_QUERY_TIMEOUT_MS";
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[envKey];
    delete process.env[envKey];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[envKey];
    else process.env[envKey] = saved;
  });

  test("default is 15s (tolerates dev-server / long-history replay beyond the old 5s cap)", () => {
    expect(resolveQueryTimeoutMs()).toBe(15_000);
  });

  test("module-level constant resolved from the raised default", () => {
    expect(QUERY_TIMEOUT_MS).toBe(15_000);
  });

  test("env override honored when finite-positive", () => {
    process.env[envKey] = "30000";
    expect(resolveQueryTimeoutMs()).toBe(30_000);
    process.env[envKey] = "12000";
    expect(resolveQueryTimeoutMs()).toBe(12_000);
  });

  test.each([
    ["unset (deleted)", undefined],
    ["empty", ""],
    ["non-numeric", "abc"],
    ["negative", "-5"],
    ["zero", "0"],
    ["Infinity string", "Infinity"],
    ["NaN string", "NaN"],
  ])("invalid value %s falls back to 15s", (_label, value) => {
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = String(value);
    expect(resolveQueryTimeoutMs()).toBe(15_000);
  });
});

function createInput(args: {
  projectId?: string;
  changesGet: ReturnType<typeof vi.fn>;
  getHandle?: ReturnType<typeof vi.fn>;
}): { input: TemporalStoreBackendInput; getHandle: ReturnType<typeof vi.fn> } {
  const handle: WorkflowHandleLike = {
    query: vi.fn(),
    executeUpdate: vi.fn(),
    signal: vi.fn(),
  };
  const getHandle = args.getHandle ?? vi.fn(() => handle);

  return {
    getHandle,
    input: {
      projectId: args.projectId ?? PROJECT_ID_A,
      legacy: {
        changes: {
          get: args.changesGet,
        },
      } as unknown as Store,
      temporal: createMockOwner({ getHandle }),
    },
  };
}

describe("getGuardedChangeHandle owner guard cache", () => {
  test("caches successful owner-bearing validation while returning fresh handles", async () => {
    const changesGet = vi.fn(async () => ({
      success: true,
      data: { adv_project_id: PROJECT_ID_A },
    }));
    const { input, getHandle } = createInput({ changesGet });

    await getGuardedChangeHandle(input, "change-a");
    await getGuardedChangeHandle(input, "change-a");

    expect(changesGet).toHaveBeenCalledTimes(1);
    expect(getHandle).toHaveBeenCalledTimes(2);
  });

  test("does not cache ownerless legacy changes", async () => {
    const changesGet = vi.fn(async () => ({ success: true, data: {} }));
    const { input, getHandle } = createInput({ changesGet });

    await getGuardedChangeHandle(input, "legacy-change");
    await getGuardedChangeHandle(input, "legacy-change");

    expect(changesGet).toHaveBeenCalledTimes(2);
    expect(getHandle).toHaveBeenCalledTimes(2);
  });

  test("does not cache owner mismatches", async () => {
    const changesGet = vi.fn(async () => ({
      success: true,
      data: { adv_project_id: PROJECT_ID_B },
    }));
    const { input, getHandle } = createInput({ changesGet });

    await expect(
      getGuardedChangeHandle(input, "foreign-change"),
    ).rejects.toBeInstanceOf(AdvProjectContextMismatchError);
    await expect(
      getGuardedChangeHandle(input, "foreign-change"),
    ).rejects.toBeInstanceOf(AdvProjectContextMismatchError);

    expect(changesGet).toHaveBeenCalledTimes(2);
    expect(getHandle).not.toHaveBeenCalled();
  });

  test("isolates cache entries per Temporal store input", async () => {
    const changesGetA = vi.fn(async () => ({
      success: true,
      data: { adv_project_id: PROJECT_ID_A },
    }));
    const changesGetB = vi.fn(async () => ({
      success: true,
      data: { adv_project_id: PROJECT_ID_A },
    }));
    const { input: inputA } = createInput({
      projectId: PROJECT_ID_A,
      changesGet: changesGetA,
    });
    const { input: inputB } = createInput({
      projectId: PROJECT_ID_B,
      changesGet: changesGetB,
    });

    await getGuardedChangeHandle(inputA, "shared-change-id");
    await getGuardedChangeHandle(inputA, "shared-change-id");
    await expect(
      getGuardedChangeHandle(inputB, "shared-change-id"),
    ).rejects.toBeInstanceOf(AdvProjectContextMismatchError);

    expect(changesGetA).toHaveBeenCalledTimes(1);
    expect(changesGetB).toHaveBeenCalledTimes(1);
  });

  test("does not cache legacy read failures", async () => {
    const changesGet = vi.fn(async () => {
      throw new Error("disk unavailable");
    });
    const { input, getHandle } = createInput({ changesGet });

    await getGuardedChangeHandle(input, "change-a");
    await getGuardedChangeHandle(input, "change-a");

    expect(changesGet).toHaveBeenCalledTimes(2);
    expect(getHandle).toHaveBeenCalledTimes(2);
  });
});

describe("mapTemporalChangeStateToChange", () => {
  test("projects lifecycleState into Change read model", () => {
    const state = createChangeWorkflowState({
      changeId: "legacy-open-projection",
      title: "Legacy open projection",
      createdAt: "2026-06-25T00:00:00.000Z",
    });
    state.status = "pending";
    state.lifecycleState = "open";

    const change = mapTemporalChangeStateToChange(state);

    expect(change.status).toBe("pending");
    expect(change.lifecycleState).toBe("open");
  });

  test("preserves and normalizes sidecar sub-agent reports", () => {
    const state = createChangeWorkflowState({
      changeId: "legacy-sidecar",
      title: "Legacy sidecar",
      createdAt: "2026-05-26T00:00:00.000Z",
    });
    state.subagent_reports = [
      {
        schema_version: "1.0",
        change_id: "legacy-sidecar",
        task_id: "tk-legacy",
        scope: { kind: "task", task_id: "tk-legacy" },
        attempt: 1,
        agent: "adv-engineer",
        status: "complete",
        files_touched: [],
        verification: [{ command: "test", exit_code: 0, summary: "pass" }],
        decisions: [],
        blockers: [],
        follow_ups: [],
        related_scan: "none",
        workdir_used: "/tmp/worktree",
        context_update_for_adv: {
          what_ads_needs_to_know: "legacy",
          suggested_next_action: "continue",
        },
      } as never,
    ];

    const change = mapTemporalChangeStateToChange(state);

    expect(change.subagent_reports).toHaveLength(1);
    expect(change.subagent_reports?.[0]).toMatchObject({
      scope_drift: null,
      required_main_agent_actions: [],
    });
  });

  test("projects worker-bundle impact and provenance into Change read model", () => {
    // Direct mapper coverage. The projection tests exercise
    // projectTemporalStateOntoLatest, which would still catch a dropped field
    // via mapped[field] being undefined — but the mapper is the boundary
    // inlined by context-snapshot-fetch and store-temporal/index, so a
    // regression here would be invisible to anyone reading only this file.
    const state = createChangeWorkflowState({
      changeId: "worker-bundle-projection",
      title: "Worker bundle projection",
      createdAt: "2026-08-03T00:00:00.000Z",
    });
    state.worker_bundle_impact = {
      kind: "required",
      rationale: "Touches workflow-bundle reachable code.",
      confirmed_at: "2026-08-03T00:01:00.000Z",
    };
    state.workerBundleProvenance = {
      source_sha: "b170f70b254c26e89126f3ce6c604e7bc9547836",
      build_run_id: "tr_build_001",
      replay_run_id: "tr_replay_002",
      recorded_at: "2026-08-03T00:02:00.000Z",
    };

    const change = mapTemporalChangeStateToChange(state);

    expect(change.worker_bundle_impact).toEqual(state.worker_bundle_impact);
    expect(change.workerBundleProvenance).toEqual(state.workerBundleProvenance);
  });

  test("projects ops_followup and ops_followup_links into Change read model", () => {
    const state = createChangeWorkflowState({
      changeId: "ops-projection",
      title: "Ops projection",
      createdAt: "2026-06-20T04:00:00.000Z",
    });
    state.ops_followup = {
      kind: "cleanup",
      source: {
        source_change_id: "parent-1",
        source_kind: "manual",
      },
      relationship: "cleanup_after",
      status: "cleanup_needed",
      created_at: "2026-06-20T04:00:00.000Z",
      evidence: [
        {
          id: "ev-1",
          recorded_at: "2026-06-20T04:01:00.000Z",
          env: "prod",
          action: "drop temp table",
          status: "complete",
          summary: "Cleanup done",
        },
      ],
    };
    state.ops_followup_links = [
      {
        id: "ofl-1",
        changeId: "child-1",
        relationship: "follows_release",
        status: "not_started",
        linked_at: "2026-06-20T04:00:00.000Z",
      },
    ];

    const change = mapTemporalChangeStateToChange(state);

    expect(change.ops_followup?.kind).toBe("cleanup");
    expect(change.ops_followup?.evidence).toHaveLength(1);
    expect(change.ops_followup_links).toHaveLength(1);
    expect(change.ops_followup_links?.[0]?.changeId).toBe("child-1");
  });

  test("projects epic_membership into Change read model", () => {
    const state = createChangeWorkflowState({
      changeId: "epic-projection",
      title: "Epic projection",
      createdAt: "2026-06-20T04:00:00.000Z",
    });
    state.epic_membership = {
      epic_id: "addAuthEpic",
      entry_id: "ent-1",
      order: 0,
      title: "Add auth",
      linked_at: "2026-06-20T04:00:00.000Z",
    };

    const change = mapTemporalChangeStateToChange(state);

    expect(change.epic_membership).toEqual(state.epic_membership);
  });

  test("leaves epic_membership undefined when workflow state lacks it", () => {
    const state = createChangeWorkflowState({
      changeId: "no-epic",
      title: "No epic",
      createdAt: "2026-06-20T04:00:00.000Z",
    });

    const change = mapTemporalChangeStateToChange(state);

    expect(change.epic_membership).toBeUndefined();
  });
});

describe("runTemporalQuery aggregate deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    vi.mocked(reinitStsl).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("caps the per-attempt query timeout at the remaining aggregate budget", async () => {
    const deadline = createTemporalReadDeadline(500);
    const op = vi.fn(() => new Promise<never>(() => {}));

    const promise = runTemporalQuery(op, { deadline });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      TemporalQueryTimeoutError,
    );

    // The default query ceiling is 5s, but the aggregate deadline caps the
    // attempt at 500ms and no retry/backoff begins after expiry.
    await vi.advanceTimersByTimeAsync(500);
    await assertion;

    expect(op).toHaveBeenCalledTimes(1);
    expect(reinitStsl).not.toHaveBeenCalled();
  });

  test("fails fast on the per-attempt query ceiling WITHOUT reconnecting (bounded-read cap is terminal, not reconnectable)", async () => {
    const op = vi.fn(() => new Promise<never>(() => {}));

    // Explicit per-attempt ceiling (decoupled from the env-configurable
    // QUERY_TIMEOUT_MS default so this test pins the cap semantics, not the
    // default value).
    const promise = runTemporalQuery(op, { timeoutMs: 5_000 });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      TemporalQueryTimeoutError,
    );

    // The attempt hangs until the 5s per-attempt ceiling.
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;

    // rq-boundedAuthoritativeRead03 (per-member circuit-breaker, 1879fb64):
    // our own per-attempt cap is terminal — a retry would burn the same cap
    // again and defeat the bounded-read deadline, so the op runs exactly once
    // (classifyTemporalError → "fatal"). #217 reconnect axis: a timeout is
    // never a broken transport channel, so it must NOT close the shared
    // connection (no reinit) — retryable-vs-reconnectable stays decoupled.
    expect(op).toHaveBeenCalledTimes(1);
    expect(reinitStsl).not.toHaveBeenCalled();
  });
});

describe("classifyTemporalReadFailure", () => {
  function createClassifyInput(args: {
    describe?: () => Promise<unknown>;
  }): TemporalStoreBackendInput {
    const handle: WorkflowHandleLike = {
      query: vi.fn(),
      executeUpdate: vi.fn(),
      signal: vi.fn(),
      ...(args.describe ? { describe: args.describe } : {}),
    };
    return {
      projectId: PROJECT_ID_A,
      legacy: {
        changes: { get: vi.fn() },
      } as unknown as Store,
      temporal: createMockOwner({
        getHandle: vi.fn(() => handle),
        describe: vi.fn(async (_ctx, _handle) => {
          return {
            kind: "complete" as const,
            value: args.describe ? await args.describe() : undefined,
          };
        }),
      }),
    };
  }

  test("not-found query failure → fallback + missing_workflow", async () => {
    const input = createClassifyInput({});
    const failure = await classifyTemporalReadFailure(
      input,
      "change-a",
      new Error("Workflow execution not found for workflowId: change-p-a"),
    );
    expect(failure).toMatchObject({
      errorClass: "fallback",
      recoveryReason: "missing_workflow",
      // SC6 wiring: a readback failure with no preceding signal is
      // classified as outcome_unknown_readback_unavailable so callers
      // can surface the typed outcome rather than mask ambiguity.
      outcome: "outcome_unknown_readback_unavailable",
    });
  });

  test("poisoned query failure → fallback + poisoned_history", async () => {
    const input = createClassifyInput({});
    const failure = await classifyTemporalReadFailure(
      input,
      "change-a",
      new Error(
        "[TMPRL1100] Nondeterminism error: No command scheduled for event X",
      ),
    );
    expect(failure).toMatchObject({
      errorClass: "fallback",
      recoveryReason: "poisoned_history",
      outcome: "outcome_unknown_readback_unavailable",
    });
  });

  test("fatal generic query failure + poisoned describe → fallback + poisoned_history", async () => {
    const input = createClassifyInput({
      describe: async () => ({
        searchAttributes: {
          TemporalReportedProblems: [
            "category=WorkflowTaskFailed cause=WorkflowTaskFailedCauseNonDeterministicError",
          ],
        },
      }),
    });
    const failure = await classifyTemporalReadFailure(
      input,
      "change-a",
      new Error("Failed to query Workflow"),
    );
    expect(failure).toMatchObject({
      errorClass: "fallback",
      recoveryReason: "poisoned_history",
      outcome: "outcome_unknown_readback_unavailable",
    });
  });

  test("fatal generic query failure without poisoned evidence → fatal + query_failed", async () => {
    const input = createClassifyInput({
      describe: async () => ({ searchAttributes: {} }),
    });
    const failure = await classifyTemporalReadFailure(
      input,
      "change-a",
      new Error("Failed to query Workflow"),
    );
    expect(failure.errorClass).toBe("fatal");
    expect(failure.recoveryReason).toBe("query_failed");
  });

  test("fatal non-generic query failure → fatal + query_failed", async () => {
    const input = createClassifyInput({});
    const failure = await classifyTemporalReadFailure(
      input,
      "change-a",
      new Error("permission denied"),
    );
    expect(failure.errorClass).toBe("fatal");
    expect(failure.recoveryReason).toBe("query_failed");
  });

  test("fallback-class but neither poisoned nor missing → query_failed (never mutation-authorizing)", async () => {
    // "not registered" matches the retry-wrapper fallback family, but the
    // workflow exists and cannot answer the query — a start/signal mutation must
    // NOT be authorized for it.
    const input = createClassifyInput({});
    const failure = await classifyTemporalReadFailure(
      input,
      "change-a",
      new Error("Query type 'changeStateQuery' not registered"),
    );
    expect(failure.recoveryReason).toBe("query_failed");
  });
});
