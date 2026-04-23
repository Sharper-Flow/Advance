/**
 * End-to-end integration test for the full Temporal optimization stack:
 * STSL + ChangeSummaryMemo + Projection-Returning Updates + PSW Signals.
 *
 * Verifies that all components work together correctly without a real
 * Temporal server by mocking the Temporal handle layer.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createTemporalStoreBackend } from "./store-temporal";
import type { Store } from "./store-types";
import type {
  ChangeWorkflowState,
  ProjectWorkflowState,
} from "../temporal/contracts";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeChangeState(
  overrides: Partial<ChangeWorkflowState> = {},
): ChangeWorkflowState {
  return {
    projectId: "proj1",
    changeId: overrides.changeId ?? "chg1",
    title: overrides.title ?? "Test Change",
    initializedAt: "2026-04-23T00:00:00.000Z",
    status: overrides.status ?? "draft",
    createdAt: overrides.createdAt ?? "2026-04-23T00:00:00.000Z",
    tasks: overrides.tasks ?? [],
    wisdom: overrides.wisdom ?? [],
    gates: overrides.gates ?? {
      proposal: { status: "pending" },
      discovery: { status: "pending" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    reentry_history: [],
    artifacts: {},
    ...overrides,
  };
}

function makeProjectState(): ProjectWorkflowState {
  return {
    projectId: "proj1",
    initializedAt: "2026-04-23T00:00:00.000Z",
    agenda: [],
    project_wisdom: [],
    migration_ledger: [],
    change_summaries: {},
    source_versions: {},
  };
}

/**
 * Creates a mock handle that simulates Temporal workflow behavior:
 * - queries return pre-configured state
 * - updates return projection (simulating projection-returning updates)
 * - signals are tracked
 */
function createMockHandle(state: ChangeWorkflowState) {
  const signals: unknown[] = [];

  const handle = {
    query: vi.fn(async (queryDef: any, ..._args: any[]) => {
      const name = queryDef?.name ?? queryDef;
      if (name === "adv.change.state") return state;
      if (name === "adv.change.tasks") return state.tasks;
      if (name === "adv.change.ready") return [];
      return null;
    }),
    executeUpdate: vi.fn(async (updateDef: any, opts: { args?: unknown[] }) => {
      // Projection-returning updates return the mutated state
      const name = updateDef?.name ?? updateDef;
      if (name === "adv.change.addTask") {
        const task = {
          id: `tk-${Date.now()}`,
          title: (opts.args?.[0] as any)?.title ?? "New Task",
          status: "pending",
          priority: 0,
          created_at: new Date().toISOString(),
          tdd_phase: "none",
        };
        state.tasks.push(task);
        return task;
      }
      if (name === "adv.change.updateTask") {
        const [taskId, update] = opts.args ?? [];
        const task = state.tasks.find((t: any) => t.id === taskId);
        if (task && update) Object.assign(task, update);
        return task;
      }
      if (name === "adv.change.closeChange") {
        state.status = "closed";
        state.closure = opts.args?.[0] as any;
        return state; // Projection return
      }
      if (name === "adv.change.completeGate") {
        const [gateId] = opts.args ?? [];
        if (state.gates[gateId as keyof typeof state.gates]) {
          (state.gates[gateId as keyof typeof state.gates] as any).status =
            "done";
        }
        return state; // Projection return
      }
      if (name === "adv.change.addWisdom") {
        state.wisdom.push({
          id: `ws-${Date.now()}`,
          type: (opts.args as any[])?.[0],
          content: (opts.args as any[])?.[1],
          recorded_at: new Date().toISOString(),
        });
        return state; // Projection return
      }
      return null;
    }),
    signal: vi.fn(async (signalDef: any, payload: any) => {
      signals.push({ signalDef: signalDef?.name ?? signalDef, payload });
    }),
    _getSignals: () => signals,
    _getState: () => state,
  };
  return handle;
}

function makeLegacyStore(): Store {
  return {
    paths: { changes: "/tmp/changes" },
    specs: { list: vi.fn(async () => []), get: vi.fn(async () => null) },
    changes: {
      list: vi.fn(async () => ({ changes: [] })),
      get: vi.fn(async () => ({ success: false, error: "Not found" })),
      create: vi.fn(async () => ({ success: true, data: { id: "chg1" } })),
      close: vi.fn(async () => ({ success: true, data: {} })),
    },
    tasks: {
      list: vi.fn(async () => []),
      add: vi.fn(async () => null),
      get: vi.fn(async () => null),
      show: vi.fn(async () => null),
      update: vi.fn(async () => null),
      cancel: vi.fn(async () => null),
      ready: vi.fn(async () => []),
      recordEvidence: vi.fn(async () => null),
      setPhase: vi.fn(async () => null),
      reclassifyTdd: vi.fn(async () => null),
    },
    wisdom: {
      add: vi.fn(async () => ({})),
      list: vi.fn(async () => []),
    },
    gates: {
      get: vi.fn(async () => ({})),
      complete: vi.fn(async () => {}),
      reopenFrom: vi.fn(async () => {}),
    },
    status: vi.fn(async () => ({
      changes: {
        active: 0,
        draft: 0,
        pending: 0,
        archived: 0,
        closed: 0,
        recent: [],
      },
      recommendations: [],
    })),
    flush: vi.fn(async () => {}),
    close: vi.fn(() => {}),
  } as unknown as Store;
}

describe("E2E: STSL + Memo + Projections + PSW Signals", () => {
  let changeHandle: ReturnType<typeof createMockHandle>;
  let projectHandle: ReturnType<typeof createMockHandle>;
  let pswState: ProjectWorkflowState;
  let legacy: Store;

  beforeEach(() => {
    const changeState = makeChangeState();
    changeHandle = createMockHandle(changeState);
    pswState = makeProjectState();
    projectHandle = {
      query: vi.fn(async (def: any) => {
        const name = def?.name ?? def;
        if (name === "adv.project.state") return pswState;
        return null;
      }),
      executeUpdate: vi.fn(async () => null),
      signal: vi.fn(async (def: any, payload: any) => {
        // Apply signal to PSW state (simulates PSW signal handler)
        // The actual signal name is "adv.change.applyChangeSummary"
        const name = def?.name ?? def;
        if (
          name === "adv.change.applyChangeSummary" ||
          name === "adv.project.applyChangeSummary"
        ) {
          const { changeId, summary, sourceVersion } = payload ?? {};
          if (changeId && summary) {
            const existing = pswState.source_versions[changeId] ?? 0;
            if (sourceVersion > existing) {
              pswState.change_summaries[changeId] = summary;
              pswState.source_versions[changeId] = sourceVersion;
            }
          }
        }
      }),
    } as any;
    legacy = makeLegacyStore();
  });

  it("populates Memo on change.get, uses Memo on list, signals PSW on mutation", async () => {
    const bundle = {
      client: {
        workflow: {
          getHandle: vi.fn((workflowId: string) => {
            if (workflowId.startsWith("adv/project/")) return projectHandle;
            return changeHandle;
          }),
        },
      },
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: {} as any,
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    // Wait for PSW hydration (fire-and-forget)
    await new Promise((r) => setTimeout(r, 50));

    // 1. Get change — populates Memo via setCachedChange
    const result = await store.changes.get("chg1");
    expect(result.success).toBe(true);

    // 2. List changes — should use Memo (no additional queries)
    const queryCountBefore = changeHandle.query.mock.calls.length;
    const listResult = await store.changes.list();
    expect(listResult.changes.length).toBeGreaterThanOrEqual(1);
    // Memo hit: no additional changeStateQuery calls
    expect(changeHandle.query.mock.calls.length).toBe(queryCountBefore);

    // 3. Close change — projection return, signal emitted to PSW
    //    changes.close returns a Change object directly (not { success, data })
    const closeResult = await store.changes.close("chg1", {
      reason: "done",
      status: "closed",
    } as any);
    expect(closeResult.id).toBe("chg1");
    expect(closeResult.status).toBe("closed");

    // Verify signal was sent to project workflow
    expect(projectHandle.signal).toHaveBeenCalled();
    const signalCalls = (projectHandle.signal as any).mock.calls;
    const lastSignal = signalCalls[signalCalls.length - 1];
    expect(lastSignal?.[1]?.summary?.status).toBe("closed");
    expect(lastSignal?.[1]?.sourceVersion).toBeGreaterThan(0);

    // Verify PSW state was updated via signal simulation
    expect(pswState.change_summaries["chg1"]).toBeTruthy();
    expect(pswState.change_summaries["chg1"].status).toBe("closed");
  });

  it("completes gates with projection return and Memo update", async () => {
    const bundle = {
      client: {
        workflow: {
          getHandle: vi.fn((workflowId: string) => {
            if (workflowId.startsWith("adv/project/")) return projectHandle;
            return changeHandle;
          }),
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    // Populate cache
    await store.changes.get("chg1");

    // Complete a gate
    await store.gates.complete("chg1", "proposal");

    // Verify Memo was updated with the gate completion
    const gates = await store.gates.get("chg1");
    expect(gates.proposal.status).toBe("done");
  });

  it("adds wisdom with projection return and Memo update", async () => {
    const bundle = {
      client: {
        workflow: {
          getHandle: vi.fn((workflowId: string) => {
            if (workflowId.startsWith("adv/project/")) return projectHandle;
            return changeHandle;
          }),
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    await store.changes.get("chg1");

    const wisdom = await store.wisdom.add("chg1", "pattern", "Test wisdom");
    expect(wisdom).toBeTruthy();

    // Verify wisdom is in the state
    const list = await store.wisdom.list("chg1");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[list.length - 1].content).toBe("Test wisdom");
  });

  it("handles multiple concurrent changes with independent Memo entries", async () => {
    const states: Record<string, ChangeWorkflowState> = {
      chg1: makeChangeState({ changeId: "chg1", title: "Change 1" }),
      chg2: makeChangeState({ changeId: "chg2", title: "Change 2" }),
    };
    const handles: Record<string, ReturnType<typeof createMockHandle>> = {};

    for (const [id, st] of Object.entries(states)) {
      handles[id] = createMockHandle(st);
    }

    const bundle = {
      client: {
        workflow: {
          getHandle: vi.fn((workflowId: string) => {
            if (workflowId.startsWith("adv/project/")) return projectHandle;
            // Extract changeId from workflow ID
            for (const id of Object.keys(handles)) {
              if (workflowId.includes(id)) return handles[id];
            }
            return handles["chg1"];
          }),
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    // Populate both
    await store.changes.get("chg1");
    await store.changes.get("chg2");

    // List should include both via Memo
    const list = await store.changes.list();
    expect(list.changes.length).toBe(2);
    const ids = list.changes.map((c: any) => c.id).sort();
    expect(ids).toEqual(["chg1", "chg2"]);

    // Close one — should not affect the other
    await store.changes.close("chg1", {
      reason: "done",
      status: "closed",
    } as any);

    // List again with includeClosed (list filters out closed by default)
    const list2 = await store.changes.list({ includeClosed: true });
    const chg1 = list2.changes.find((c: any) => c.id === "chg1");
    expect(chg1?.status).toBe("closed");
    const chg2 = list2.changes.find((c: any) => c.id === "chg2");
    expect(chg2?.status).toBe("draft");
  });

  it("Memo warm-starts from PSW state on initialization", async () => {
    // Pre-populate PSW with summaries
    pswState.change_summaries = {
      chg1: {
        id: "chg1",
        title: "Pre-existing Change",
        status: "active",
        gateProgress: {
          proposal: "done",
          discovery: "done",
          design: "pending",
          planning: "pending",
          execution: "pending",
          acceptance: "pending",
          release: "pending",
        },
        taskCounts: { total: 3, done: 1 },
        lastActivityAt: "2026-04-23T00:00:00.000Z",
        sourceVersion: 5,
      },
    };
    pswState.source_versions = { chg1: 5 };

    const bundle = {
      client: {
        workflow: {
          getHandle: vi.fn((workflowId: string) => {
            if (workflowId.startsWith("adv/project/")) return projectHandle;
            return changeHandle;
          }),
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    // Wait for hydration
    await new Promise((r) => setTimeout(r, 50));

    // List should use Memo (hydrated from PSW) without querying change workflows
    const list = await store.changes.list();
    expect(list.changes.length).toBeGreaterThanOrEqual(1);
    const chg1 = list.changes.find((c: any) => c.id === "chg1");
    expect(chg1).toBeTruthy();
    expect(chg1?.title).toBe("Pre-existing Change");
    expect(chg1?.status).toBe("active");
  });
});
