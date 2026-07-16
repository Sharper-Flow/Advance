/**
 * Gate Tools — Lifecycle Contract Tests (Signal-Driven)
 *
 * Tests for adv_gate_complete using signal/query surface instead of
 * workflow updates. Verifies tool-layer enforcement for planning gate
 * userApproved and signal firing.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { COMMAND_MANIFEST } from "../manifest";
import { gateTools, validateGateBoundary } from "./gate";
import type { Store } from "../storage/store";
import {
  PARITY_ROWS,
  toolChangeFor,
} from "../__tests__/phase-plan-parity-matrix";
import { changeToDirectiveState } from "../temporal/change-state";
import { deriveWorkflowDirective } from "../utils/workflow-directive";

const mocks = vi.hoisted(() => {
  const signalMock = vi.fn();
  const queryMock = vi.fn();
  const handleMock = { signal: signalMock, query: queryMock };
  const getHandleMock = vi.fn(() => handleMock);
  const targetStoreRef = { current: undefined as unknown };
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
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handleMock),
    targetStoreRef,
    withTargetPathStore: vi.fn(async (input, fn) =>
      fn({
        context: {
          root: input.target_path,
          projectId: "target-project-id",
          externalRoot: "/tmp/target-external",
          trusted: false,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStoreRef.current,
      }),
    ),
    ensureWorktreeForMutation: vi.fn(async () => ({ decision: "ALLOW" })),
    buildWorktreeAutoManageDeps: vi.fn(async (targetStore) => ({
      resumeRuntime: {
        projectRoot: targetStore.paths.root,
        database: {},
        log: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        store: targetStore,
      },
    })),
  };
});

vi.mock("./target-project", async () => {
  const actual =
    await vi.importActual<typeof import("./target-project")>(
      "./target-project",
    );
  return {
    ...actual,
    withTargetPathStore: mocks.withTargetPathStore,
  };
});

vi.mock("./worktree-auto-manage", () => ({
  ensureWorktreeForMutation: mocks.ensureWorktreeForMutation,
  buildWorktreeAutoManageDeps: mocks.buildWorktreeAutoManageDeps,
}));

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
  // Faithful poll loop over the mocked querySignal so gate-completion tests
  // exercise the same query sequence the real shared helper would (STRUCT-003).
  waitForGateCompletion: async (
    handle: unknown,
    gateId: unknown,
  ): Promise<unknown> => {
    let latest: { status?: string } | undefined;
    for (let i = 0; i < 60; i++) {
      latest = await mocks.querySignal(handle, undefined, gateId);
      if (latest?.status === "done" || latest?.status === "stuck") {
        return latest;
      }
    }
    return latest;
  },
}));

function createMockStore(
  overrides: {
    change?: Partial<import("../types").Change>;
    gates?: import("../types").Gates;
  } = {},
): Store {
  const defaultGates = {
    proposal: { status: "done" },
    discovery: { status: "done" },
    design: { status: "done" },
    planning: { status: "pending" },
    execution: { status: "pending" },
    acceptance: { status: "pending" },
    release: { status: "pending" },
  } as import("../types").Gates;

  const change: import("../types").Change = {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: overrides.gates ?? defaultGates,
    ...overrides.change,
  };

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
    changes: {
      list: vi.fn(),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
    } as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => change.gates),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
  } as unknown as Store;
}

describe("gate tools — signal-driven lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.querySignal.mockReset();
    mocks.targetStoreRef.current = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("adv_gate_complete", () => {
    test("fires gateCompletedSignal after sequence validation passes", async () => {
      const store = createMockStore();
      mocks.querySignal.mockResolvedValueOnce({
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates);
      mocks.querySignal.mockResolvedValueOnce({ status: "done" });

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "planning",
          userApproved: true,
          completedBy: "agent",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle.client,
        "test-project-id",
        "test-change",
      );
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[3]).toBeDefined(); // signal definition
      expect(signalCall[4]).toMatchObject({
        gateId: "planning",
        completedBy: "agent",
      });
    });

    test("passes compatibilityReason for acceptance gate completion", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({ gates });
      mocks.querySignal.mockResolvedValueOnce(gates).mockResolvedValueOnce({
        status: "done",
      });

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "acceptance",
          completedBy: "agent",
          notes: "Recovered gate after poisoned workflow",
          compatibilityReason: "legacy replay lacks contract proof",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh.mock.calls[0][4]).toMatchObject({
        compatibilityReason: "legacy replay lacks contract proof",
      });
    });

    test("rejects compatibilityReason for non-acceptance gates", async () => {
      const store = createMockStore();

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "design",
          completedBy: "agent",
          compatibilityReason: "not allowed here",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("acceptance");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("poisoned-history acceptance recovery writes disk projection", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({
        gates,
        change: {
          gates,
          _source: "disk",
          _recovery: {
            mode: "temporal_query_fallback",
            reason: "poisoned_history",
          },
        } as Partial<import("../types").Change>,
      });
      mocks.querySignal.mockRejectedValueOnce(
        new Error("TMPRL1100: Nondeterminism error"),
      );

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "acceptance",
          completedBy: "agent",
          notes: "Recovered gate after poisoned workflow",
          compatibilityReason: "legacy replay lacks contract proof",
          recoveryReason: "acceptance gate recovery after poisoned workflow",
          recoveryEvidence:
            "TemporalReportedProblems: WorkflowTaskFailedCauseNonDeterministicError",
          priorApprovalEvidence: "Prior user acceptance approval: approve",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._recoveryMutation).toBe(true);
      expect(parsed.recovered).toBe(true);
      expect(parsed.reconciliationWarning).toContain("not healed");
      expect(store.changes.save).toHaveBeenCalledWith(
        expect.objectContaining({
          gates: expect.objectContaining({
            acceptance: expect.objectContaining({
              status: "done",
              approval_evidence:
                "Recovered gate after poisoned workflow; Prior user acceptance approval: approve",
            }),
          }),
        }),
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("completed-workflow recovery uses one disk snapshot for gates and tasks", async () => {
      const tmp = await mkdtemp(join(tmpdir(), "adv-gate-disk-snapshot-"));
      const changesDir = join(tmp, "changes");
      const changeDir = join(changesDir, "test-change");
      const staleGates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const recoveredGates = {
        ...staleGates,
        execution: { status: "done" },
      } as import("../types").Gates;
      const store = createMockStore({ gates: staleGates });
      store.paths.changes = changesDir;
      try {
        await mkdir(changeDir, { recursive: true });
        await writeFile(
          join(changeDir, "change.json"),
          JSON.stringify({
            id: "test-change",
            title: "Test Change",
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
            created_by: "test",
            tasks: [],
            deltas: {},
            wisdom: [],
            gates: recoveredGates,
          }),
        );
        mocks.querySignal.mockRejectedValueOnce(
          new Error(
            "WorkflowNotFoundError: workflow execution already completed",
          ),
        );

        const result = await gateTools.adv_gate_complete.execute(
          {
            changeId: "test-change",
            gateId: "acceptance",
            completedBy: "agent",
            compatibilityReason: "pinned wedged run was terminated",
            recoveryReason:
              "acceptance recovery after pinned workflow termination",
            recoveryEvidence:
              "WorkflowNotFoundError: pinned run terminated after operator approval",
            priorApprovalEvidence: "Prior user acceptance approval: approve",
          },
          store,
        );

        expect(JSON.parse(result)).toMatchObject({
          success: true,
          recovered: true,
        });
        const persisted = JSON.parse(
          await readFile(join(changeDir, "change.json"), "utf8"),
        );
        expect(persisted.gates).toMatchObject({
          execution: { status: "done" },
          acceptance: expect.objectContaining({ status: "done" }),
        });
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    test("poisoned-history acceptance recovery rejects missing audit fields", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({
        gates,
        change: { gates } as Partial<import("../types").Change>,
      });
      mocks.querySignal.mockRejectedValueOnce(
        new Error("TMPRL1100: Nondeterminism error"),
      );

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "acceptance",
          completedBy: "agent",
          compatibilityReason: "legacy replay lacks contract proof",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain(
        "recoveryEvidence, recoveryReason, priorApprovalEvidence",
      );
      expect(parsed.missingAuditFields).toEqual([
        "recoveryEvidence",
        "recoveryReason",
        "priorApprovalEvidence",
      ]);
      expect(store.changes.save).not.toHaveBeenCalled();
    });

    test("poisoned-history acceptance recovery rejects imprecise recovery evidence", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({
        gates,
        change: { gates } as Partial<import("../types").Change>,
      });
      mocks.querySignal.mockRejectedValueOnce(
        new Error("TMPRL1100: Nondeterminism error"),
      );

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "acceptance",
          completedBy: "agent",
          compatibilityReason: "legacy replay lacks contract proof",
          recoveryReason: "acceptance gate recovery after poisoned workflow",
          recoveryEvidence: "generic operator note",
          priorApprovalEvidence: "Prior user acceptance approval: approve",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("must cite precise");
      expect(store.changes.save).not.toHaveBeenCalled();
    });

    test("queries workflow gate state before firing completion signal", async () => {
      const store = createMockStore({
        gates: {
          proposal: { status: "pending" },
          discovery: { status: "pending" },
          design: { status: "pending" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        } as import("../types").Gates,
      });
      mocks.querySignal.mockResolvedValueOnce({
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates);
      mocks.querySignal.mockResolvedValueOnce({ status: "done" });

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "design",
          completedBy: "agent",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.querySignal).toHaveBeenCalled();
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    });

    test("blocks planning gate without userApproved: true", async () => {
      const store = createMockStore();

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "planning",
          userApproved: false,
          completedBy: "agent",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("userApproved: true");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("blocks planning gate when userApproved is omitted", async () => {
      const store = createMockStore();

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "planning",
          completedBy: "agent",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("userApproved: true");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("returns error when Temporal service is unavailable", async () => {
      mocks.getService.mockReturnValueOnce(null);
      const store = createMockStore();

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "proposal",
          completedBy: "agent",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Temporal service not available");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("returns error when project ID cannot be resolved", async () => {
      mocks.getProjectId.mockResolvedValueOnce(null);
      const store = createMockStore();

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "proposal",
          completedBy: "agent",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Could not resolve project ID");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("enforces gate sequence — cannot skip incomplete prior gates", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({ gates });
      mocks.querySignal.mockResolvedValue(gates);

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "design",
          completedBy: "agent",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("prior gate(s) incomplete");
      expect(parsed.blockedBy).toContain("discovery");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("uses fireSignalAndRefresh so cache is invalidated after gate completes (R1 follow-on, T10 consolidation)", async () => {
      // R1 cache-stale regression: when adv_gate_complete fires
      // gateCompletedSignal directly via fireSignal(), the in-memory
      // changeCache held by store-temporal/index.ts is not invalidated.
      // Subsequent store.changes.get() calls return stale cached data
      // showing the gate as still pending, blocking adv_change_archive
      // even though Temporal workflow state has the gate done.
      //
      // Original 4a3e81f fix added inline `store.changes.refresh(changeId)`
      // in completeGateAndBuildResponse. T10 consolidation replaced that
      // inline call with fireSignalAndRefresh at the signal-firing site —
      // the contract is preserved (cache refresh after signal fires) but
      // now lives inside the centralized helper. This test pins the
      // contract by asserting the tool calls fireSignalAndRefresh with
      // the correct (handle, store, changeId, signal, payload) args.
      const store = createMockStore({
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        } as import("../types").Gates,
      });
      mocks.querySignal.mockResolvedValueOnce({
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates);
      mocks.querySignal.mockResolvedValueOnce({ status: "done" });

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "acceptance",
          completedBy: "user",
          notes: "Manual finalization",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);

      // T10 contract: helper called with (handle, store, changeId, signal, payload).
      // The helper internally calls store.changes.refresh(changeId) — that
      // behavior is pinned by tests in _adapters.test.ts. This test pins
      // the call-site uses the helper (rq-cacheRefresh01).
      const call = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(call[1]).toBe(store); // store argument
      expect(call[2]).toBe("test-change"); // changeId argument
    });

    test("surfaces workflow readiness blockers after completion signal", async () => {
      const gates = {
        proposal: { status: "pending" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({ gates });
      mocks.querySignal.mockResolvedValueOnce(gates).mockResolvedValueOnce({
        status: "stuck",
        stuck_reason: "ARTIFACT_MISSING: proposal artifact is missing",
        readiness_blockers: [
          {
            code: "ARTIFACT_MISSING",
            gateId: "proposal",
            artifactKind: "proposal",
            message: "proposal artifact is missing",
            remediation: "Create proposal.md before retrying.",
          },
        ],
      });

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "proposal",
          completedBy: "agent",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("workflow readiness blocked");
      expect(parsed.workflowGateStatus).toBe("stuck");
      expect(parsed.readinessBlockers).toEqual([
        expect.objectContaining({ code: "ARTIFACT_MISSING" }),
      ]);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    });

    test("target_path worktree-mutation gate completion uses target store root for worktree isolation deps", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const targetStore = createMockStore({
        gates,
        change: {
          id: "target-change",
          worktree_auto_managed: true,
        },
      });
      targetStore.paths.root = "/repo/worktree/change/target-change";
      targetStore.paths.changes =
        "/repo/worktree/change/target-change/.adv/changes";
      mocks.targetStoreRef.current = targetStore;
      vi.spyOn(process, "cwd").mockReturnValue("/repo/main");
      mocks.querySignal.mockResolvedValueOnce(gates).mockResolvedValueOnce({
        status: "done",
      });

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "target-change",
          gateId: "planning",
          completedBy: "adv-prep",
          userApproved: true,
          target_path: "/repo/worktree/change/target-change",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        createMockStore(),
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.buildWorktreeAutoManageDeps).toHaveBeenCalledWith(
        targetStore,
      );
      expect(mocks.ensureWorktreeForMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: "/repo/worktree/change/target-change",
          change: expect.objectContaining({
            id: "target-change",
            worktree_auto_managed: true,
          }),
          deps: expect.objectContaining({
            resumeRuntime: expect.objectContaining({
              projectRoot: "/repo/worktree/change/target-change",
              store: targetStore,
            }),
          }),
        }),
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
        expect.anything(),
        targetStore,
        "target-change",
        expect.anything(),
        expect.objectContaining({ gateId: "planning" }),
      );
    });

    test("target_path metadata gate completion skips worktree isolation deps", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const targetStore = createMockStore({
        gates,
        change: {
          id: "target-change",
          worktree_auto_managed: true,
        },
      });
      targetStore.paths.root = "/repo/worktree/change/target-change";
      targetStore.paths.changes =
        "/repo/worktree/change/target-change/.adv/changes";
      mocks.targetStoreRef.current = targetStore;
      vi.spyOn(process, "cwd").mockReturnValue("/repo/main");
      mocks.querySignal.mockResolvedValueOnce(gates).mockResolvedValueOnce({
        status: "done",
      });

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "target-change",
          gateId: "discovery",
          completedBy: "adv-discover",
          target_path: "/repo/worktree/change/target-change",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        createMockStore(),
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.buildWorktreeAutoManageDeps).not.toHaveBeenCalled();
      expect(mocks.ensureWorktreeForMutation).not.toHaveBeenCalled();
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
        expect.anything(),
        targetStore,
        "target-change",
        expect.anything(),
        expect.objectContaining({ gateId: "discovery" }),
      );
    });

    test("execution gate checks for incomplete tasks", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({
        gates,
        change: {
          tasks: [],
        },
      });
      mocks.querySignal.mockResolvedValueOnce(gates).mockResolvedValueOnce([
        {
          id: "tk-1",
          title: "Incomplete task",
          status: "in_progress",
          priority: 0,
          deps: [],
          created_at: "2026-01-01T00:00:00Z",
        },
      ]);

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "execution",
          completedBy: "agent",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("task(s) not done or cancelled");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    // rq-extend-poisoned-recovery AC4: release-gate recovery accepts
    // compatibilityReason (no longer rejected as acceptance-only).
    test("compatibilityReason is now permitted for release gate", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "done" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({ gates });

      // The pre-signal release-gate path will fail on git resolution in
      // the unit-test environment; the important guarantee here is that
      // the *acceptance-only* gate guard no longer rejects
      // compatibilityReason for release.
      let parsed: Record<string, unknown>;
      try {
        const result = await gateTools.adv_gate_complete.execute(
          {
            changeId: "test-change",
            gateId: "release",
            completedBy: "user:jon",
            compatibilityReason: "legacy poisoned workflow",
          },
          store,
        );
        parsed = JSON.parse(result);
      } catch (err) {
        parsed = { error: (err as Error).message };
      }
      expect(parsed.error ?? "").not.toContain(
        "compatibilityReason is only supported for acceptance",
      );
    });

    test("poisoned-history acceptance recovery covers WorkflowTaskFailedCauseNonDeterministicError describe", async () => {
      // rq-fix-gate-tools-recovery AC2: probe-based recovery for generic
      // signal errors when workflow describe carries poisoned evidence.
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({
        gates,
        change: {
          gates,
          _source: "disk",
          _recovery: {
            mode: "temporal_query_fallback",
            reason: "poisoned_history",
          },
        } as Partial<import("../types").Change>,
      });

      // Healthy gates query succeeds (no isPoisonedHistoryError(error)
      // signal — workflow signal will fail with a generic error instead).
      mocks.querySignal.mockResolvedValueOnce(gates);
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("Failed to send signal"),
      );

      // Inject describe() that reports nondeterminism via TemporalReportedProblems.
      const describeMock = vi.fn(async () => ({
        searchAttributes: {
          TemporalReportedProblems: [
            "category=WorkflowTaskFailed",
            "cause=WorkflowTaskFailedCauseNonDeterministicError",
          ],
        },
      }));
      mocks.handleMock.describe = describeMock;

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "acceptance",
          completedBy: "agent",
          notes: "Prior user acceptance approval: approve",
          compatibilityReason: "legacy replay lacks contract proof",
          recoveryReason: "acceptance gate recovery after poisoned workflow",
          recoveryEvidence:
            "TemporalReportedProblems: WorkflowTaskFailedCauseNonDeterministicError",
          priorApprovalEvidence: "Prior user acceptance approval: approve",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._recoveryMutation).toBe(true);
      expect(parsed.recovered).toBe(true);
      expect(parsed.reconciliationWarning).toContain("not healed");
      expect(describeMock).toHaveBeenCalled();
      expect(store.changes.save).toHaveBeenCalledWith(
        expect.objectContaining({
          gates: expect.objectContaining({
            acceptance: expect.objectContaining({ status: "done" }),
          }),
        }),
      );

      delete (mocks.handleMock as { describe?: unknown }).describe;
    });
  });

  describe("adv_gate_status", () => {
    test("falls back to disk gates with _recovery annotation on poisoned workflow", async () => {
      // rq-fix-gate-tools-recovery AC1.
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({
        gates,
        change: {
          gates,
          _source: "disk",
          _recovery: {
            mode: "temporal_query_fallback",
            reason: "poisoned_history",
          },
        } as Partial<import("../types").Change>,
      });

      mocks.querySignal.mockRejectedValueOnce(
        new Error("Failed to query Workflow"),
      );
      const describeMock = vi.fn(async () => ({
        searchAttributes: {
          TemporalReportedProblems: [
            "cause=WorkflowTaskFailedCauseNonDeterministicError",
          ],
        },
      }));
      mocks.handleMock.describe = describeMock;

      const result = await gateTools.adv_gate_status.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.gates.planning.status).toBe("pending");
      expect(parsed.gates.discovery.status).toBe("done");
      expect(parsed._recovery).toEqual({ reason: "poisoned_history" });
      expect(describeMock).toHaveBeenCalled();

      delete (mocks.handleMock as { describe?: unknown }).describe;
    });

    test("propagates query errors when describe does not show poisoned evidence", async () => {
      // rq-fix-gate-tools-recovery AC6: no recovery without evidence.
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({ gates });

      mocks.querySignal.mockRejectedValueOnce(
        new Error("Failed to query Workflow"),
      );
      const describeMock = vi.fn(async () => ({
        searchAttributes: { AdvChangeStatus: ["draft"] },
        status: "RUNNING",
      }));
      mocks.handleMock.describe = describeMock;

      await expect(
        gateTools.adv_gate_status.execute({ changeId: "test-change" }, store),
      ).rejects.toThrow(/Failed to query Workflow/);

      delete (mocks.handleMock as { describe?: unknown }).describe;
    });

    test("uses workflow gates when query succeeds", async () => {
      const diskGates = {
        proposal: { status: "done" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const workflowGates = {
        ...diskGates,
        discovery: { status: "done" },
      } as import("../types").Gates;
      const store = createMockStore({ gates: diskGates });

      mocks.querySignal.mockResolvedValueOnce(workflowGates);

      const result = await gateTools.adv_gate_status.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.gates.discovery.status).toBe("done");
      expect(parsed._recovery).toBeUndefined();
    });

    test("includes _directive and derives nextGate/canArchive from it", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "in_progress" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as import("../types").Gates;
      const store = createMockStore({ gates });

      mocks.querySignal.mockResolvedValueOnce(gates);

      const result = await gateTools.adv_gate_status.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed._directive).toBeDefined();
      expect(parsed._directive.changeId).toBe("test-change");
      expect(parsed._directive.canArchive).toBe(false);
      expect(parsed._directive.action.gateId).toBe("planning");
      expect(parsed._directive.action.command).toBe("adv-prep");
      // next-action fields are sourced from the single directive projection.
      expect(parsed.nextGate).toBe("planning");
      expect(parsed.canArchive).toBe(false);
    });

    test("directive routes to adv-archive when all gates are done", async () => {
      const gates = {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "done" },
        release: { status: "done" },
      } as import("../types").Gates;
      const store = createMockStore({ gates });

      mocks.querySignal.mockResolvedValueOnce(gates);

      const result = await gateTools.adv_gate_status.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.canArchive).toBe(true);
      expect(parsed.nextGate).toBeNull();
      expect(parsed._directive.canArchive).toBe(true);
      expect(parsed._directive.action.command).toBe("adv-archive");
    });

    test("prefers audited disk recovery gates over stale workflow gates", async () => {
      const tmp = await mkdtemp(join(tmpdir(), "adv-gate-recovery-audit-"));
      const changesDir = join(tmp, "changes");
      const changeDir = join(changesDir, "test-change");

      try {
        const workflowGates = {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "pending" },
        } as import("../types").Gates;
        const recoveredDiskGates = {
          ...workflowGates,
          release: {
            status: "done",
            completed_at: "2026-01-01T00:00:00Z",
            completed_by: "adv-archive",
            recovery_audit: {
              reason: "completed_workflow_release_gate_recovery",
              evidence:
                "workflow execution already completed | WorkflowNotFoundError",
              recovered_at: "2026-01-01T00:00:01Z",
            },
          },
        } as import("../types").Gates;
        const store = createMockStore({ gates: recoveredDiskGates });
        store.paths.changes = changesDir;
        await mkdir(changeDir, { recursive: true });
        await writeFile(
          join(changeDir, "change.json"),
          JSON.stringify(
            {
              id: "test-change",
              title: "Test Change",
              status: "archived",
              created_at: "2026-01-01T00:00:00Z",
              created_by: "test",
              tasks: [],
              deltas: {},
              wisdom: [],
              gates: recoveredDiskGates,
            },
            null,
            2,
          ),
        );

        mocks.querySignal.mockResolvedValueOnce(workflowGates);

        const result = await gateTools.adv_gate_status.execute(
          { changeId: "test-change" },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.gates.release.status).toBe("done");
        expect(parsed.canArchive).toBe(true);
        expect(parsed._recovery).toEqual({ reason: "poisoned_history" });
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    test("prefers audited disk release recovery when workflow release lacks recovery evidence at equal done-count", async () => {
      const tmp = await mkdtemp(join(tmpdir(), "adv-gate-release-evidence-"));
      const changesDir = join(tmp, "changes");
      const changeDir = join(changesDir, "test-change");

      try {
        const workflowGates = {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: {
            status: "done",
            completed_at: "2026-01-01T00:00:00Z",
            completed_by: "adv-archive",
            approval_evidence:
              "legacy release completion without Phase 9 proof",
          },
        } as import("../types").Gates;
        const recoveredDiskGates = {
          ...workflowGates,
          release: {
            status: "done",
            completed_at: "2026-01-01T00:00:00Z",
            completed_by: "adv-archive",
            recovery_audit: {
              reason: "completed_workflow_release_gate_recovery",
              evidence:
                "workflow execution already completed | WorkflowNotFoundError; Phase 9 finalization shipped; defaultBranch=trunk; mainCheckout=/tmp/main; pushStatus=pushed; mergeCommitSha=abc123",
              recovered_at: "2026-01-01T00:00:01Z",
            },
          },
        } as import("../types").Gates;
        const store = createMockStore({ gates: recoveredDiskGates });
        store.paths.changes = changesDir;
        await mkdir(changeDir, { recursive: true });
        await writeFile(
          join(changeDir, "change.json"),
          JSON.stringify(
            {
              id: "test-change",
              title: "Test Change",
              status: "archived",
              created_at: "2026-01-01T00:00:00Z",
              created_by: "test",
              tasks: [],
              deltas: {},
              wisdom: [],
              gates: recoveredDiskGates,
            },
            null,
            2,
          ),
        );

        mocks.querySignal.mockResolvedValueOnce(workflowGates);

        const result = await gateTools.adv_gate_status.execute(
          { changeId: "test-change" },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.gates.release).toMatchObject({
          status: "done",
          recovery_audit: expect.objectContaining({
            reason: "completed_workflow_release_gate_recovery",
          }),
        });
        expect(parsed.canArchive).toBe(true);
        expect(parsed._recovery).toEqual({ reason: "poisoned_history" });
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    test("does not treat non-shipped Phase 9 prose as canonical release proof", async () => {
      const tmp = await mkdtemp(join(tmpdir(), "adv-gate-release-nonshipped-"));
      const changesDir = join(tmp, "changes");
      const changeDir = join(changesDir, "test-change");

      try {
        const workflowGates = {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: {
            status: "done",
            completed_at: "2026-01-01T00:00:00Z",
            completed_by: "adv-archive",
            approval_evidence:
              "Phase 9 finalization pending_merge; defaultBranch=trunk; pushStatus=pushed",
          },
        } as import("../types").Gates;
        const recoveredDiskGates = {
          ...workflowGates,
          release: {
            status: "done",
            completed_at: "2026-01-01T00:00:00Z",
            completed_by: "adv-archive",
            recovery_audit: {
              reason: "completed_workflow_release_gate_recovery",
              evidence:
                "workflow execution already completed | WorkflowNotFoundError; Phase 9 finalization shipped; defaultBranch=trunk; mainCheckout=/tmp/main; pushStatus=pushed; mergeCommitSha=abc123",
              recovered_at: "2026-01-01T00:00:01Z",
            },
          },
        } as import("../types").Gates;
        const store = createMockStore({ gates: recoveredDiskGates });
        store.paths.changes = changesDir;
        await mkdir(changeDir, { recursive: true });
        await writeFile(
          join(changeDir, "change.json"),
          JSON.stringify(
            {
              id: "test-change",
              title: "Test Change",
              status: "archived",
              created_at: "2026-01-01T00:00:00Z",
              created_by: "test",
              tasks: [],
              deltas: {},
              wisdom: [],
              gates: recoveredDiskGates,
            },
            null,
            2,
          ),
        );

        mocks.querySignal.mockResolvedValueOnce(workflowGates);

        const result = await gateTools.adv_gate_status.execute(
          { changeId: "test-change" },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.gates.release).toMatchObject({
          status: "done",
          recovery_audit: expect.objectContaining({
            reason: "completed_workflow_release_gate_recovery",
          }),
        });
        expect(parsed.gates.release.approval_evidence).toBeUndefined();
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    test("strips phantom artifact evidence paths while preserving readable materialized paths", async () => {
      const tmp = await mkdtemp(join(tmpdir(), "adv-gate-status-paths-"));
      const materializedPath = join(tmp, "design.md");
      const phantomPath = join(tmp, "missing.md");
      await writeFile(materializedPath, "# Design\n\nmaterialized artifact\n");

      try {
        const gates = {
          proposal: { status: "done" },
          discovery: {
            status: "done",
            artifact_evidence: {
              kind: "agreement",
              path: phantomPath,
              checked_at: "2026-01-01T00:00:00Z",
            },
          },
          design: {
            status: "done",
            artifact_evidence: {
              kind: "design",
              path: materializedPath,
              checked_at: "2026-01-01T00:00:00Z",
            },
          },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        } as import("../types").Gates;
        const store = createMockStore({ gates });

        mocks.querySignal.mockResolvedValueOnce(gates);

        const result = await gateTools.adv_gate_status.execute(
          { changeId: "test-change" },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.gates.discovery.artifact_evidence).toEqual({
          kind: "agreement",
          checked_at: "2026-01-01T00:00:00Z",
        });
        expect(parsed.gates.design.artifact_evidence.path).toBe(
          materializedPath,
        );
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("adv_gate_status — parity matrix (AC6)", () => {
    // Every matrix row with a well-formed durable projection: all seven gate
    // positions plus approval, readiness-blocked, precise recovery,
    // precedence collisions, archived, and closed. The malformed row is
    // excluded here — gate status throws on a gate record with missing
    // entries before the directive fallback engages (its degraded-read path
    // is covered by the adv_change_show parity table).
    const rows = PARITY_ROWS.filter(
      (row) => row.expect.gateStatus !== undefined,
    );

    test.each(rows)("$name", async (row) => {
      const store = createMockStore({
        gates: row.state.gates,
        change: toolChangeFor(row),
      });
      mocks.querySignal.mockResolvedValueOnce(row.state.gates);

      const result = await gateTools.adv_gate_status.execute(
        { changeId: "test-change" },
        store,
      );
      const parsed = JSON.parse(result);

      const expected = row.expect.gateStatus!;
      expect(parsed.nextGate).toBe(expected.nextGate);
      expect(parsed.canArchive).toBe(expected.canArchive);
      expect(parsed._directive.action.kind).toBe(
        row.expect.directiveActionKind,
      );
      if (row.expect.planKind === "actionable") {
        expect(parsed._directive.action.command).toBe(row.expect.planCommand);
        expect(parsed._directive.action.gateId).toBe(row.expect.planGateId);
      } else {
        // Non-authorizing actions carry no command route.
        expect(parsed._directive.action).not.toHaveProperty("command");
      }

      // AC6: the returned guidance is exactly the canonical directive derived
      // from the same durable projection — no second derivation path.
      const change = (await store.changes.get("test-change")).data!;
      expect(parsed._directive).toEqual(
        deriveWorkflowDirective(
          changeToDirectiveState({
            projectId: "test-project-id",
            change,
            gates: row.state.gates,
          }),
          Date.now(),
        ),
      );
    });
  });
});

describe("validateGateBoundary", () => {
  test("adv-task manifest declares all gates it completes", () => {
    expect(COMMAND_MANIFEST["adv-task"].scope?.gates).toEqual([
      "proposal",
      "discovery",
      "design",
      "planning",
    ]);
  });

  test("skips boundary warning for explicit user actor", () => {
    expect(validateGateBoundary("proposal", "user")).toBeUndefined();
  });

  test("skips boundary warning for user-prefixed actor", () => {
    expect(validateGateBoundary("proposal", "user:cli")).toBeUndefined();
  });

  test("allows authorized command actor", () => {
    expect(validateGateBoundary("proposal", "adv-proposal")).toBeUndefined();
  });

  test("warns for unauthorized command actor", () => {
    const warning = validateGateBoundary("proposal", "adv-prep");

    expect(warning).toContain("adv-proposal");
    expect(warning).toContain("adv-prep");
  });

  test("allows adv-task to complete proposal gate", () => {
    expect(validateGateBoundary("proposal", "adv-task")).toBeUndefined();
  });
});
