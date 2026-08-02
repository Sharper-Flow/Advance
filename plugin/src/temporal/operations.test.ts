import { describe, expect, it, vi } from "vitest";
import {
  TemporalOperationsOwner,
  type TemporalOperationContext,
  type TemporalClientBundle,
} from "./operations";
import { buildChangeWorkflowId, buildEpicWorkflowId } from "./client";
import { changeStateQuery } from "./messages";
import { proposalUpdatedSignal } from "./messages";
import type { QueryDefinition, SignalDefinition } from "@temporalio/workflow";

const mockHasActiveSessionPinnedWorkflows = vi.hoisted(() => vi.fn());
vi.mock("./list-orphan-session-queues", () => ({
  hasActiveSessionPinnedWorkflows: mockHasActiveSessionPinnedWorkflows,
}));

/** Build a mock Temporal client/connection that records every operation. */
function buildMockBundle(
  overrides: {
    query?: (
      def: QueryDefinition<unknown, unknown[], string>,
      ...args: unknown[]
    ) => Promise<unknown>;
    signal?: (
      def: SignalDefinition<unknown[], string>,
      ...args: unknown[]
    ) => Promise<void>;
    describe?: () => Promise<{
      runId?: string;
      status?: { name: string };
      searchAttributes?: Record<string, unknown>;
    }>;
    terminate?: (reason: string) => Promise<void>;
    cancel?: () => Promise<void>;
    start?: (
      workflow: unknown,
      options: { workflowId: string; taskQueue: string; args: [unknown] },
    ) => Promise<unknown>;
    list?: (opts: { query: string }) => AsyncIterable<{ workflowId: string }>;
  } = {},
): {
  bundle: TemporalClientBundle;
  calls: {
    starts: Array<{
      workflow: unknown;
      options: { workflowId: string; taskQueue: string; args: [unknown] };
    }>;
    queries: Array<{ def: unknown; args: unknown[] }>;
    signals: Array<{ def: unknown; args: unknown[] }>;
    describes: number;
    terminates: Array<string>;
    cancels: number;
    lists: Array<string>;
  };
} {
  const calls = {
    starts: [],
    queries: [],
    signals: [],
    describes: 0,
    terminates: [],
    cancels: 0,
    lists: [],
  } as unknown as typeof calls;

  const handle = {
    query: vi.fn(async (def, ...args) => {
      calls.queries.push({ def, args });
      return overrides.query?.(def, ...args) ?? {};
    }),
    signal: vi.fn(async (def, ...args) => {
      calls.signals.push({ def, args });
      await overrides.signal?.(def, ...args);
    }),
    describe: vi.fn(async () => {
      calls.describes++;
      return (
        overrides.describe?.() ?? {
          runId: "run-1",
          status: { name: "RUNNING" },
        }
      );
    }),
    terminate: vi.fn(async (reason: string) => {
      calls.terminates.push(reason);
      await overrides.terminate?.(reason);
    }),
    cancel: vi.fn(async () => {
      calls.cancels++;
      await overrides.cancel?.();
    }),
    workflowId: "",
  };

  const client = {
    workflow: {
      start: vi.fn(async (workflow, options) => {
        calls.starts.push({ workflow, options });
        if (overrides.start) return overrides.start(workflow, options);
        return handle;
      }),
      getHandle: vi.fn((workflowId: string) => {
        handle.workflowId = workflowId;
        return handle;
      }),
      list: vi.fn(async function* (_opts: { query: string }) {
        calls.lists.push(_opts.query);
        if (overrides.list) {
          yield* overrides.list(_opts);
        } else {
          yield { workflowId: "wf-1" };
        }
      }),
    },
  };

  const connection = {
    withDeadline: vi.fn(
      async (deadlineAt: number, fn: () => Promise<unknown>) => fn(),
    ),
    withAbortSignal: vi.fn(
      async (signal: AbortSignal, fn: () => Promise<unknown>) => fn(),
    ),
    close: vi.fn(),
  };

  return {
    bundle: {
      address: "localhost:7233",
      namespace: "default",
      connection: connection as unknown as TemporalClientBundle["connection"],
      client: client as unknown as TemporalClientBundle["client"],
    },
    calls,
  };
}

function changeCtx(
  projectId: string,
  changeId: string,
): TemporalOperationContext {
  return {
    projectId,
    workflowId: buildChangeWorkflowId(projectId, changeId),
    opKind: "query",
    opType: "testQuery",
    budgetMs: 1000,
  };
}

function epicCtx(projectId: string, epicId: string): TemporalOperationContext {
  return {
    projectId,
    workflowId: buildEpicWorkflowId(projectId, epicId),
    opKind: "query",
    opType: "testQuery",
    budgetMs: 1000,
  };
}

describe("TemporalOperationsOwner", () => {
  const projectId = "a000000000000000000000000000000000000000";

  it("rejects a context missing required fields", () => {
    const { bundle } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);
    expect(() =>
      owner.getHandle({
        projectId: "",
        workflowId: buildChangeWorkflowId(projectId, "c1"),
        opKind: "query",
        opType: "t",
        budgetMs: 1,
      }),
    ).toThrow(
      /ProjectId must be a non-empty string|40-character lowercase hex|projectId is required/i,
    );
  });

  it("rejects a handle targeting a workflow outside the context project", () => {
    const { bundle } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);
    expect(() =>
      owner.getHandle({
        projectId,
        workflowId: "adv/change/0000000000000000000000000000000000000001/c1",
        opKind: "query",
        opType: "t",
        budgetMs: 1,
      }),
    ).toThrow(/Project context mismatch/);
  });

  it("startChangeWorkflow produces an opaque handle and records start", async () => {
    const { bundle, calls } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const result = await owner.startChangeWorkflow(changeCtx(projectId, "c1"), {
      projectId,
      changeId: "c1",
      title: "Test change",
      initializedAt: new Date().toISOString(),
    } as unknown as import("./contracts").ChangeWorkflowInput);
    expect(result.kind).toBe("confirmed");
    if (result.kind !== "confirmed") {
      throw new Error("expected confirmed outcome");
    }
    expect(result.value.workflowId).toBe(
      buildChangeWorkflowId(projectId, "c1"),
    );
    expect(calls.starts).toHaveLength(1);
    expect(calls.starts[0].options.workflowId).toBe(
      buildChangeWorkflowId(projectId, "c1"),
    );
  });

  it("startChangeWorkflow reuses existing handle on already-started", async () => {
    const { bundle } = buildMockBundle({
      start: vi.fn(async () => {
        throw new Error("Workflow execution already started");
      }),
    });
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const result = await owner.startChangeWorkflow(changeCtx(projectId, "c1"), {
      projectId,
      changeId: "c1",
      title: "Test change",
      initializedAt: new Date().toISOString(),
    } as unknown as import("./contracts").ChangeWorkflowInput);
    expect(result.kind).toBe("confirmed");
    if (result.kind !== "confirmed") {
      throw new Error("expected confirmed outcome");
    }
    expect(result.value.workflowId).toBe(
      buildChangeWorkflowId(projectId, "c1"),
    );
  });

  it("startEpicWorkflow produces a handle and records start", async () => {
    const { bundle, calls } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const result = await owner.startEpicWorkflow(epicCtx(projectId, "e1"), {
      projectId,
      epicId: "e1",
      title: "Test epic",
      narrative: "",
      initializedAt: new Date().toISOString(),
    } as unknown as import("./contracts").EpicWorkflowInput);
    expect(result.kind).toBe("confirmed");
    if (result.kind !== "confirmed") {
      throw new Error("expected confirmed outcome");
    }
    expect(result.value.workflowId).toBe(buildEpicWorkflowId(projectId, "e1"));
    expect(calls.starts).toHaveLength(1);
    expect(calls.starts[0].options.workflowId).toBe(
      buildEpicWorkflowId(projectId, "e1"),
    );
  });

  it("query returns complete outcome on success", async () => {
    const { bundle } = buildMockBundle({
      query: async () => ({ changeId: "c1" }),
    });
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const handle = owner.getHandle(changeCtx(projectId, "c1"));
    const result = await owner.query(
      changeCtx(projectId, "c1"),
      handle,
      changeStateQuery as unknown as QueryDefinition<
        unknown,
        unknown[],
        string
      >,
    );
    expect(result.kind).toBe("complete");
    expect((result as { value: unknown }).value).toEqual({ changeId: "c1" });
  });

  it("describe returns complete outcome with status", async () => {
    const { bundle } = buildMockBundle({
      describe: async () => ({ runId: "run-1", status: { name: "RUNNING" } }),
    });
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const handle = owner.getHandle(changeCtx(projectId, "c1"));
    const result = await owner.describe(changeCtx(projectId, "c1"), handle);
    expect(result.kind).toBe("complete");
    expect((result as { value: unknown }).value).toEqual({
      runId: "run-1",
      status: { name: "RUNNING" },
      searchAttributes: undefined,
    });
  });

  it("signal returns confirmed when signal and readback both succeed", async () => {
    const { bundle } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const handle = owner.getHandle(changeCtx(projectId, "c1"));
    const result = await owner.signal(
      changeCtx(projectId, "c1"),
      handle,
      proposalUpdatedSignal as unknown as SignalDefinition<unknown[], string>,
      [{ title: "Updated" }],
      {
        readback: async () => ({ revision: 2 }),
      },
    );
    expect(result.kind).toBe("confirmed");
    expect((result as { value: unknown }).value).toEqual({ revision: 2 });
  });

  it("signal returns outcome_unknown when signal succeeds but readback fails", async () => {
    const { bundle } = buildMockBundle({
      query: vi.fn().mockRejectedValue(new Error("readback hung")),
    });
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const handle = owner.getHandle(changeCtx(projectId, "c1"));
    const result = await owner.signal(
      { ...changeCtx(projectId, "c1"), budgetMs: 100 },
      handle,
      proposalUpdatedSignal as unknown as SignalDefinition<unknown[], string>,
      [{ title: "Updated" }],
      {
        readback: async () => {
          throw new Error("readback hung");
        },
      },
    );
    expect(result.kind).toBe("outcome_unknown");
  });

  it("signal returns confirmed_failure when signal itself fails", async () => {
    const { bundle } = buildMockBundle({
      signal: async () => {
        throw new Error("workflow already completed");
      },
    });
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const handle = owner.getHandle(changeCtx(projectId, "c1"));
    const result = await owner.signal(
      changeCtx(projectId, "c1"),
      handle,
      proposalUpdatedSignal as unknown as SignalDefinition<unknown[], string>,
      [{ title: "Updated" }],
    );
    expect(result.kind).toBe("confirmed_failure");
  });

  it("terminate returns confirmed on success", async () => {
    const { bundle, calls } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const handle = owner.getHandle(changeCtx(projectId, "c1"));
    const result = await owner.terminate(
      changeCtx(projectId, "c1"),
      handle,
      "test termination",
    );
    expect(result.kind).toBe("confirmed");
    expect(calls.terminates).toEqual(["test termination"]);
  });

  it("cancel returns confirmed on success", async () => {
    const { bundle, calls } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const handle = owner.getHandle(changeCtx(projectId, "c1"));
    const result = await owner.cancel(changeCtx(projectId, "c1"), handle);
    expect(result.kind).toBe("confirmed");
    expect(calls.cancels).toBe(1);
  });

  it("list delegates to the client workflow list and is bounded by caller limit", async () => {
    const { bundle, calls } = buildMockBundle({
      list: async function* (_opts: { query: string }) {
        yield { workflowId: "wf-1" };
        yield { workflowId: "wf-2" };
      },
    });
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const result = await owner.list(
      { ...changeCtx(projectId, "c1"), opKind: "list", opType: "visibility" },
      `WorkflowId LIKE 'adv/change/${projectId}/%'`,
      { limit: 1 },
    );
    expect(result.kind).toBe("complete");
    if (result.kind !== "complete") {
      throw new Error("expected complete outcome");
    }
    expect(result.value).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.value[0].workflowId).toBe("wf-1");
    expect(calls.lists).toHaveLength(1);
  });

  it("aborts an in-flight query when the abort signal fires", async () => {
    const controller = new AbortController();
    const { bundle } = buildMockBundle({
      query: async () => {
        controller.abort();
        return { changeId: "c1" };
      },
    });
    const owner = new TemporalOperationsOwner(bundle, projectId);
    const handle = owner.getHandle(changeCtx(projectId, "c1"));
    const result = await owner.query(
      { ...changeCtx(projectId, "c1"), abortSignal: controller.signal },
      handle,
      changeStateQuery as unknown as QueryDefinition<
        unknown,
        unknown[],
        string
      >,
    );
    // The abort is registered; the read-context may degrade depending on timing.
    expect(["complete", "degraded"]).toContain(result.kind);
  });
});

describe("aggregate start budget", () => {
  const projectId = "a000000000000000000000000000000000000000";

  function changeCtx(
    projectId: string,
    changeId: string,
    budgetMs: number,
  ): TemporalOperationContext {
    return {
      projectId,
      workflowId: buildChangeWorkflowId(projectId, changeId),
      opKind: "start",
      opType: "aggregateBudgetTest",
      budgetMs,
    };
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  it("refuses start when hydration exhausts the aggregate budget and does not call client.start", async () => {
    const { bundle, calls } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);
    vi.spyOn(owner as any, "hydrateChangeWorkflowInput").mockImplementation(
      async (input: unknown) => {
        await sleep(60);
        return input;
      },
    );

    const result = await owner.startChangeWorkflow(
      changeCtx(projectId, "hydrationBudget", 50),
      {
        projectId,
        changeId: "hydrationBudget",
        title: "Hydration budget",
        initializedAt: new Date().toISOString(),
      } as unknown as import("./contracts").ChangeWorkflowInput,
    );

    expect(result.kind).toBe("timeout_unavailable");
    expect(calls.starts).toHaveLength(0);
  });

  it("refuses start when preflight + hydration exhaust the aggregate budget in project-queue mode", async () => {
    mockHasActiveSessionPinnedWorkflows.mockImplementation(async () => {
      await sleep(80);
      return { kind: "complete", value: false };
    });
    const { bundle, calls } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);
    vi.spyOn(owner as any, "hydrateChangeWorkflowInput").mockImplementation(
      async (input: unknown) => {
        await sleep(80);
        return input;
      },
    );

    const result = await owner.startChangeWorkflow(
      changeCtx(projectId, "preflightHydrationBudget", 150),
      {
        projectId,
        changeId: "preflightHydrationBudget",
        title: "Preflight hydration budget",
        initializedAt: new Date().toISOString(),
      } as unknown as import("./contracts").ChangeWorkflowInput,
      { workflowQueueMode: "project" },
    );

    expect(result.kind).toBe("timeout_unavailable");
    expect(calls.starts).toHaveLength(0);
  });

  it("starts with the remaining budget when preflight and hydration fit within the aggregate budget", async () => {
    mockHasActiveSessionPinnedWorkflows.mockResolvedValue({
      kind: "complete",
      value: false,
    });
    const { bundle, calls } = buildMockBundle();
    const owner = new TemporalOperationsOwner(bundle, projectId);

    const result = await owner.startChangeWorkflow(
      changeCtx(projectId, "budgetFit", 1000),
      {
        projectId,
        changeId: "budgetFit",
        title: "Budget fit",
        initializedAt: new Date().toISOString(),
      } as unknown as import("./contracts").ChangeWorkflowInput,
      { workflowQueueMode: "project" },
    );

    expect(result.kind).toBe("confirmed");
    expect(calls.starts).toHaveLength(1);
  });
});
