/**
 * Gate Tools — Lifecycle Contract Tests (Signal-Driven)
 *
 * Tests for adv_gate_complete using signal/query surface instead of
 * workflow updates. Verifies tool-layer enforcement for planning gate
 * userApproved and signal firing.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { COMMAND_MANIFEST } from "../manifest";
import { gateTools, validateGateBoundary } from "./gate";
import type { Store } from "../storage/store";

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
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handleMock),
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
          compatibilityReason: "legacy replay lacks contract proof",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._recoveryMutation).toBe(true);
      expect(parsed.reconciliationWarning).toContain("not healed");
      expect(store.changes.save).toHaveBeenCalledWith(
        expect.objectContaining({
          gates: expect.objectContaining({
            acceptance: expect.objectContaining({ status: "done" }),
          }),
        }),
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
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
          acceptance: { status: "done" },
          release: { status: "pending" },
        } as import("../types").Gates,
      });
      mocks.querySignal.mockResolvedValueOnce({
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "done" },
        release: { status: "pending" },
      } as import("../types").Gates);
      mocks.querySignal.mockResolvedValueOnce({ status: "done" });

      const result = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "release",
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
