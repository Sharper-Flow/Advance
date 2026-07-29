import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Store } from "../storage/store";
import { gateTools } from "./gate";

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
  fireSignalAndRefresh: vi.fn(async () => {}),
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
  waitForGateCompletion: vi.fn(async () => ({ status: "done" })),
  fireSignal: vi.fn(async () => {}),
}));

vi.mock("./target-project", () => ({
  formatTargetProjectContext: vi.fn((ctx) => ctx),
  resolveTargetAwareMutationCwd: vi.fn(({ store }) => store.paths.root),
  withOptionalTargetPathStore: vi.fn(async (_input, fn) =>
    fn(_input.store, undefined),
  ),
  withTargetPathStore: vi.fn(),
}));

vi.mock("./worktree-auto-manage", () => ({
  ensureWorktreeForMutation: vi.fn(async () => ({ decision: "ALLOW" })),
  buildWorktreeAutoManageDeps: vi.fn(async () => ({
    resumeRuntime: {
      projectRoot: "/tmp/test",
      database: {},
      log: {},
      store: {},
    },
  })),
}));

vi.mock("../utils/workflow-directive", async () => {
  const actual = await vi.importActual<
    typeof import("../utils/workflow-directive")
  >("../utils/workflow-directive");
  return {
    ...actual,
    deriveDirectiveSafe: vi.fn(() => undefined),
  };
});

const HEALTHY_GATES = {
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "done" },
  execution: { status: "done" },
  acceptance: { status: "done" },
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
    } as unknown as Store["gates"],
    artifacts: {} as Store["artifacts"],
  } as Store;
}

describe("adv_gate_status acceptance criteria projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ADV_PLAN_ROUTING_FAIL_CLOSED;
  });

  test("AC2 — acceptanceCriteriaProjection is unavailable in worker-free read", async () => {
    const store = createMockStore();
    const result = await gateTools.adv_gate_status.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.acceptanceCriteriaProjection).toBeUndefined();
    expect(parsed._unavailable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "acceptanceCriteriaProjection",
          status: "unavailable",
          reason: expect.stringContaining("workflow-only"),
        }),
      ]),
    );
    expect(mocks.querySignal).not.toHaveBeenCalled();
  });

  test("AC2 — gateCriteria is unavailable in worker-free read", async () => {
    const store = createMockStore();
    const result = await gateTools.adv_gate_status.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.gateCriteria).toBeUndefined();
    expect(parsed._unavailable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "gateCriteria",
          status: "unavailable",
          reason: expect.stringContaining("workflow-only"),
        }),
      ]),
    );
    expect(mocks.querySignal).not.toHaveBeenCalled();
  });

  test("AC2 — ignores mocked workflow criteria/projection and still reports unavailable", async () => {
    mocks.querySignal.mockResolvedValue({
      current: [
        {
          id: "REVIEW_MATRIX_COMPLETE",
          label: "Review matrix complete",
          status: "fail",
          evaluatedAt: "2026-05-20T00:00:00.000Z",
        },
      ],
      snapshot: [],
      freshness: "stale",
      basisRevision: 2,
    });

    const store = createMockStore();
    const result = await gateTools.adv_gate_status.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.gateCriteria).toBeUndefined();
    expect(parsed.acceptanceCriteriaProjection).toBeUndefined();
    expect(mocks.querySignal).not.toHaveBeenCalled();
  });
});
