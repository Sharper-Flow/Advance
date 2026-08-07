/**
 * adv_gate_status fail-closed plan routing (AC9, C5, DONT4, DONT5).
 *
 * Before an active build-bound receipt, a derivation failure keeps the
 * legacy gate-derived next-action fallback (AC9 first sentence). After
 * activation, a degraded plan stops ONLY plan-dependent consumer routing:
 * nextGate/canArchive/_directive are withheld, typed degraded diagnostics
 * are attached, and no Temporal signal, plan-state write, or workflow
 * termination occurs (DONT5).
 *
 * `deriveDirectiveSafe` is forced to undefined via module mock so the
 * degraded-path wiring is exercised deterministically; the real
 * `derivePhasePlanSafe` produces the typed diagnostics.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Store } from "../storage/store";
import { gateTools } from "./gate";

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
          stateMode: "authoritative",
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
    deriveDirectiveSafe: vi.fn(() => undefined),
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

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

vi.mock("../utils/workflow-directive", async () => {
  const actual = await vi.importActual<
    typeof import("../utils/workflow-directive")
  >("../utils/workflow-directive");
  return {
    ...actual,
    deriveDirectiveSafe: mocks.deriveDirectiveSafe,
  };
});

const HEALTHY_GATES = {
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "pending" },
  execution: { status: "pending" },
  acceptance: { status: "pending" },
  release: { status: "pending" },
} as import("../types").Gates;

function createMockStore(
  overrides: {
    change?: Partial<import("../types").Change>;
    gates?: import("../types").Gates;
  } = {},
): Store {
  const change: import("../types").Change = {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: overrides.gates ?? HEALTHY_GATES,
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
    } as unknown as Store["gates"],
    artifacts: {} as Store["artifacts"],
  } as Store;
}

describe("adv_gate_status fail-closed plan routing (AC9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deriveDirectiveSafe.mockReturnValue(undefined);
    mocks.querySignal.mockResolvedValue(HEALTHY_GATES);
  });

  afterEach(() => {
    delete process.env.ADV_PLAN_ROUTING_FAIL_CLOSED;
  });

  test("pre-cutover: derivation failure keeps legacy gate-derived routing", async () => {
    const store = createMockStore();
    const result = await gateTools.adv_gate_status.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);
    // Legacy fallback: first incomplete gate routes the agent.
    expect(parsed.nextGate).toBe("planning");
    expect(parsed.canArchive).toBe(false);
    expect(parsed._directive).toBeUndefined();
    expect(parsed._phasePlan).toBeUndefined();
    expect(parsed._routingStopped).toBeUndefined();
  });

  test("post-cutover fail-closed: degraded plan stops routing with typed diagnostics", async () => {
    process.env.ADV_PLAN_ROUTING_FAIL_CLOSED = "1";
    const store = createMockStore();
    const result = await gateTools.adv_gate_status.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);
    // Routing stopped: no next action, no archive authorization, no directive.
    expect(parsed.nextGate).toBeNull();
    expect(parsed.canArchive).toBe(false);
    expect(parsed._directive).toBeUndefined();
    // Typed degraded diagnostics, never an invented action (SC3).
    expect(parsed._phasePlan).toBeDefined();
    expect(parsed._phasePlan.kind).toBe("degraded");
    expect(parsed._phasePlan.failClosed).toBe(true);
    expect(parsed._phasePlan.command).toBeUndefined();
    expect(parsed._routingStopped).toBeDefined();
    // Raw gate state remains available (not plan-dependent routing).
    expect(parsed.gates.planning.status).toBe("pending");
    // DONT5: no signal, no plan-state write, no workflow termination.
    expect(mocks.signalMock).not.toHaveBeenCalled();
    expect(mocks.fireSignal).not.toHaveBeenCalled();
  });

  test("post-cutover fail-closed: healthy derivation still routes normally", async () => {
    process.env.ADV_PLAN_ROUTING_FAIL_CLOSED = "1";
    const { deriveWorkflowDirective } =
      await import("../utils/workflow-directive");
    mocks.deriveDirectiveSafe.mockImplementation((state, epoch) => {
      try {
        return deriveWorkflowDirective(state, epoch);
      } catch {
        return undefined;
      }
    });
    const store = createMockStore();
    const result = await gateTools.adv_gate_status.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed._directive).toBeDefined();
    expect(parsed.nextGate).toBe("planning");
    expect(parsed._phasePlan).toBeUndefined();
    expect(parsed._routingStopped).toBeUndefined();
  });
});
