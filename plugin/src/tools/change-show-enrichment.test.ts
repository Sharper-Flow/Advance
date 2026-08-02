/**
 * adv_change_show enrichment output-shape and best-effort integration.
 *
 * Verifies that degraded/best-effort clarify and external-dependency enrichment
 * preserves the core disk-authoritative change output shape and never issues
 * Temporal workflow queries, signals, or disk writes on the read path.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { Store } from "../storage/store";
import type { Change } from "../types";

let readContextBudgetMs = 2_000;
function setReadContextBudgetMs(ms: number) {
  readContextBudgetMs = ms;
}

const mocks = vi.hoisted(() => {
  return {
    getService: vi.fn(() => ({})),
    querySignal: vi.fn(),
    fireSignal: vi.fn(),
    fireSignalAndRefresh: vi.fn(),
    getChangeHandle: vi.fn(() => ({ query: vi.fn() })),
    waitForGateCompletion: vi.fn(),
    getProjectId: vi.fn(async () => "test-project-id"),
    validateCrossRepoTarget: vi.fn(async () => ({ ok: true }) as const),
    runClarifyReadinessChecks: vi.fn(() => ({ findings: [] })),
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
  waitForGateCompletion: mocks.waitForGateCompletion,
}));

vi.mock("../storage/store-temporal/read-context", async () => {
  const actual = await vi.importActual<
    typeof import("../storage/store-temporal/read-context")
  >("../storage/store-temporal/read-context");
  return {
    ...actual,
    // Use a short aggregate budget in tests so deadline degradation is
    // deterministic without waiting the full 8 seconds.
    createTemporalReadContext: (budgetMs?: number) =>
      actual.createTemporalReadContext(budgetMs ?? readContextBudgetMs),
  };
});

vi.mock("../validator/clarify-readiness", () => ({
  runClarifyReadinessChecks: mocks.runClarifyReadinessChecks,
}));

vi.mock("../storage/store-disk", () => ({
  createDiskStore: vi.fn(async () => {
    const store = {
      close: vi.fn(),
      changes: {
        get: vi.fn(async () => ({
          success: true,
          data: {
            id: "target-change",
            title: "Target Change",
            status: "active",
            gates: {
              proposal: { status: "done" },
              discovery: { status: "done" },
              design: { status: "done" },
              planning: { status: "done" },
              execution: { status: "done" },
              acceptance: { status: "done" },
              release: { status: "done" },
            },
            tasks: [],
          },
        })),
      },
    };
    return store;
  }),
}));

vi.mock("../temporal/activities", () => ({
  validateCrossRepoTarget: mocks.validateCrossRepoTarget,
}));

import { changeTools } from "./change";

function createMockStore(changeOverride: Partial<Change> = {}): Store {
  const change: Change = {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "done" },
      release: { status: "pending" },
    },
    artifacts: {},
    external_dependencies: [],
    ...changeOverride,
  } as Change;

  return {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
      archive: "/tmp/test/.adv/archive",
    } as Store["paths"],
    config: {
      features: { clarify_enforcement: "advisory" },
    },
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {
      list: vi.fn(async () => ({ specs: [] })),
      get: vi.fn(async () => ({ success: false, error: "not found" })),
    } as unknown as Store["specs"],
    changes: {
      list: vi.fn(async () => ({ changes: [] })),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
      invalidate: vi.fn(),
    } as Store["changes"],
    tasks: {
      ready: vi.fn(async () => ({ ready: [], blocked: [] })),
    } as unknown as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => change.gates),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
    epics: {
      create: vi.fn(),
      get: vi.fn(async () => ({ success: true, data: null })),
      list: vi.fn(async () => []),
      update: vi.fn(),
      addShell: vi.fn(),
      promoteShell: vi.fn(),
      linkChange: vi.fn(),
      unlinkChange: vi.fn(),
      reorder: vi.fn(),
    },
  } as unknown as Store;
}

function assertNoWorkflowCalls(store: Store) {
  expect(mocks.getChangeHandle).not.toHaveBeenCalled();
  expect(mocks.querySignal).not.toHaveBeenCalled();
  expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  expect(mocks.fireSignal).not.toHaveBeenCalled();
  expect(store.changes.save).not.toHaveBeenCalled();
  expect(store.changes.updateArtifacts).not.toHaveBeenCalled();
}

describe("adv_change_show enrichment best-effort integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runClarifyReadinessChecks.mockReturnValue({ findings: [] });
  });

  test("preserves core change shape and includes degraded external-dependency status", async () => {
    const store = createMockStore({
      external_dependencies: [
        {
          target_path: "/repo/other",
          changeId: "other-change",
          relationship: "follow_up",
          advisory: true,
          taskId: "missing-task",
        },
      ],
    });

    const result = await changeTools.adv_change_show.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.id).toBe("test-change");
    expect(parsed.title).toBe("Test Change");
    expect(parsed.status).toBe("active");
    expect(parsed._externalDependencyStatus).toMatchObject({
      summary: {
        total: 1,
        satisfied: 0,
        warning: 1,
        blocking: 0,
        advisoryOnly: true,
      },
    });
    expect(parsed._externalDependencyStatus.dependencies[0].status).toBe(
      "warning",
    );
    assertNoWorkflowCalls(store);
  });

  test("surfaces clarify findings on the read path without persisting", async () => {
    mocks.runClarifyReadinessChecks.mockReturnValue({
      findings: [
        {
          code: "missing-acceptance",
          severity: "warning",
          message: "Acceptance criteria are missing.",
          details: { questionCategory: "scope" },
        },
      ],
    });

    const store = createMockStore();
    const result = await changeTools.adv_change_show.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.clarifyFindings).toMatchObject({
      count: 1,
      findings: [
        {
          code: "missing-acceptance",
          severity: "warning",
          message: "Acceptance criteria are missing.",
          questionCategory: "scope",
        },
      ],
    });
    expect(store.changes.save).not.toHaveBeenCalled();
    assertNoWorkflowCalls(store);
  });
});

describe("adv_change_show shared aggregate deadline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setReadContextBudgetMs(2_000);
    mocks.runClarifyReadinessChecks.mockReturnValue({ findings: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    setReadContextBudgetMs(2_000);
  });

  test("skips optional subreads once the aggregate deadline expires and surfaces degraded hydrationStats", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));

    const store = createMockStore();
    store.gates.get = vi.fn(async () => new Promise(() => {}));
    store.tasks.ready = vi.fn(async () => new Promise(() => {}));

    const executePromise = changeTools.adv_change_show.execute(
      {
        changeId: "test-change",
        include: {
          snapshot: true,
          phasePlan: true,
          readyTasks: true,
        },
      },
      store,
    );

    await vi.advanceTimersByTimeAsync(2_500);
    const result = await executePromise;
    const parsed = JSON.parse(result);

    expect(parsed.id).toBe("test-change");
    expect(parsed.title).toBe("Test Change");
    expect(parsed.hydrationStats?.deadlineExceeded).toBe(true);
    expect(parsed.hydrationStats?.omitted).toBeGreaterThanOrEqual(1);
    expect(parsed.hydrationStats?.omittedIds?.length).toBeGreaterThanOrEqual(1);
    assertNoWorkflowCalls(store);
  });

  test("stays complete when all subreads resolve within the aggregate deadline", async () => {
    const store = createMockStore();
    const result = await changeTools.adv_change_show.execute(
      { changeId: "test-change" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.id).toBe("test-change");
    expect(parsed.title).toBe("Test Change");
    expect(parsed.hydrationStats).toBeUndefined();
    assertNoWorkflowCalls(store);
  });

  test("completes within production 8s budget when subreads wedge", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    setReadContextBudgetMs(8_000);

    const store = createMockStore();
    store.gates.get = vi.fn(async () => new Promise(() => {}));
    store.tasks.ready = vi.fn(async () => new Promise(() => {}));

    const start = Date.now();
    const executePromise = changeTools.adv_change_show.execute(
      {
        changeId: "test-change",
        include: {
          snapshot: true,
          phasePlan: true,
          readyTasks: true,
        },
      },
      store,
    );

    await vi.advanceTimersByTimeAsync(8_500);
    const result = await executePromise;
    const elapsed = Date.now() - start;
    const parsed = JSON.parse(result);

    expect(elapsed).toBeLessThan(10_000);
    expect(parsed.id).toBe("test-change");
    expect(parsed.title).toBe("Test Change");
    expect(parsed.hydrationStats?.deadlineExceeded).toBe(true);
    expect(parsed.hydrationStats?.omitted).toBeGreaterThanOrEqual(1);
    expect(parsed.hydrationStats?.omittedIds?.length).toBeGreaterThanOrEqual(1);
    assertNoWorkflowCalls(store);
  });
});
