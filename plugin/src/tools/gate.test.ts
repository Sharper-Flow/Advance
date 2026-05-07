/**
 * Gate Tools — Lifecycle Contract Tests (Signal-Driven)
 *
 * Tests for adv_gate_complete using signal/query surface instead of
 * workflow updates. Verifies tool-layer enforcement for planning gate
 * userApproved and signal firing.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { gateTools } from "./gate";
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
      mocks.querySignal.mockResolvedValue({
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      });

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
      expect(mocks.fireSignal).toHaveBeenCalledTimes(1);
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle.client,
        "test-project-id",
        "test-change",
      );
      const signalCall = mocks.fireSignal.mock.calls[0];
      expect(signalCall[1]).toBeDefined(); // signal definition
      expect(signalCall[2]).toMatchObject({
        gateId: "planning",
        completedBy: "agent",
      });
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
      mocks.querySignal.mockResolvedValue({
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      });

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
      expect(mocks.fireSignal).toHaveBeenCalledTimes(1);
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
      expect(mocks.fireSignal).not.toHaveBeenCalled();
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
      expect(mocks.fireSignal).not.toHaveBeenCalled();
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
      expect(mocks.fireSignal).not.toHaveBeenCalled();
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
      expect(mocks.fireSignal).not.toHaveBeenCalled();
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
      expect(mocks.fireSignal).not.toHaveBeenCalled();
    });

    test("invalidates change cache after firing gateCompletedSignal (R1 follow-on regression)", async () => {
      // R1 cache-stale regression: when adv_gate_complete fires
      // gateCompletedSignal directly via fireSignal(), the in-memory
      // changeCache held by store-temporal/index.ts is not invalidated.
      // Subsequent store.changes.get() calls return stale cached data
      // showing the gate as still pending, blocking adv_change_archive
      // even though Temporal workflow state has the gate done.
      //
      // Fix contract: after fireSignal(gateCompletedSignal) succeeds,
      // the tool MUST call store.changes.refresh(changeId) so the next
      // read sees the freshly-completed gate. Without this, archive,
      // adv_change_show, and adv_change_list return stale gate state.
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
      mocks.querySignal.mockResolvedValue({
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "done" },
        acceptance: { status: "done" },
        release: { status: "pending" },
      });

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
      expect(mocks.fireSignal).toHaveBeenCalledTimes(1);

      // Cache invalidation must happen after the signal fires so the
      // archive preflight can read fresh gate state.
      expect(store.changes.refresh).toHaveBeenCalledWith("test-change");
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
      expect(mocks.fireSignal).not.toHaveBeenCalled();
    });
  });
});
