import { vi } from "vitest";
import { changeWorkflow, epicWorkflow } from "../workflows";
import { classifyTemporalWorkflowFailure } from "../diagnostics";
import type {
  TemporalOperations,
  TemporalOperationContext,
  TemporalReadOutcome,
  TemporalWorkflowHandle,
  TemporalMutationServerOutcome,
  WorkflowRunDescription,
  WorkflowQueueMode,
  TemporalListOutcome,
  TemporalLifecycleContext,
} from "../operations";
import type { ChangeWorkflowInput, EpicWorkflowInput } from "../contracts";
import {
  ChangeCreationHashConflictError,
  resolveCreationIdempotency,
} from "../../storage/store-temporal/creation-hash";
import { changeStateQuery } from "../messages";
import { buildProjectTaskQueue, buildSessionTaskQueue } from "../client";
import { hasActiveSessionPinnedWorkflows } from "../list-orphan-session-queues";
import { IncompatibleActiveSessionQueuesError } from "../operations";
import { buildTemporalSearchAttributes } from "../observability";

/**
 * Wrap a raw low-level RPC function into a TemporalOperations read outcome.
 *
 * Tests that simulate the service layer pass functions that return raw values
 * (or throw NotFound-style errors). The owner API expects a
 * `TemporalReadOutcome`, so we wrap them here.
 */
function wrapToReadOutcome<T>(
  fn: (arg?: string) => Promise<T>,
  extractArg?: (
    ctx: TemporalOperationContext | TemporalLifecycleContext,
  ) => string | undefined,
): (
  ctx: TemporalOperationContext | TemporalLifecycleContext,
) => Promise<TemporalReadOutcome<T>> {
  return async (ctx) => {
    try {
      const result = extractArg ? await fn(extractArg(ctx)) : await fn();
      if (
        result !== null &&
        typeof result === "object" &&
        "kind" in result &&
        ["complete", "not_found", "degraded"].includes(
          (result as { kind: string }).kind,
        )
      ) {
        return result as unknown as TemporalReadOutcome<T>;
      }
      return { kind: "complete", value: result } as TemporalReadOutcome<T>;
    } catch (error) {
      const diagnostic = classifyTemporalWorkflowFailure(error);
      if (diagnostic.class === "not_found") {
        return {
          kind: "not_found",
          error,
          diagnostic,
        } as TemporalReadOutcome<T>;
      }
      return { kind: "degraded", error, diagnostic } as TemporalReadOutcome<T>;
    }
  };
}

/**
 * Build a partial mock TemporalOperations owner for unit tests.
 *
 * Every method is a no-op `vi.fn()` that throws "not implemented" by default.
 * Pass overrides for the methods the test cares about.
 */
export function createMockOwner(
  overrides: Partial<TemporalOperations> = {},
): TemporalOperations {
  const notImplemented = (name: string) =>
    vi.fn(() => {
      throw new Error(`mock owner method ${name} not implemented`);
    });

  const describeNamespaceOverride = overrides.describeNamespace;
  const describeWorkflowExecutionOverride = overrides.describeWorkflowExecution;

  // Remove the raw overrides so we can replace them with wrapped versions.
  const {
    describeNamespace: _,
    describeWorkflowExecution: __,
    ...restOverrides
  } = overrides;

  return {
    start: notImplemented("start"),
    startChangeWorkflow: notImplemented("startChangeWorkflow"),
    startEpicWorkflow: notImplemented("startEpicWorkflow"),
    getHandle: notImplemented("getHandle"),
    query: notImplemented("query"),
    describe: notImplemented("describe"),
    signal: notImplemented("signal"),
    terminate: notImplemented("terminate"),
    cancel: notImplemented("cancel"),
    list: notImplemented("list"),
    describeTaskQueue: notImplemented("describeTaskQueue"),
    checkSearchAttributes: notImplemented("checkSearchAttributes"),
    registerSearchAttributes: notImplemented("registerSearchAttributes"),
    verifySearchAttributes: notImplemented("verifySearchAttributes"),
    describeNamespace:
      typeof describeNamespaceOverride === "function"
        ? (vi.fn(
            wrapToReadOutcome(
              describeNamespaceOverride as unknown as (
                arg?: string,
              ) => Promise<unknown>,
            ),
          ) as TemporalOperations["describeNamespace"])
        : "describeNamespace" in overrides
          ? (undefined as unknown as TemporalOperations["describeNamespace"])
          : notImplemented("describeNamespace"),
    describeWorkflowExecution:
      typeof describeWorkflowExecutionOverride === "function"
        ? (vi.fn(
            wrapToReadOutcome(
              describeWorkflowExecutionOverride as unknown as (
                arg?: string,
              ) => Promise<unknown>,
              (ctx) => ("workflowId" in ctx ? ctx.workflowId : undefined),
            ),
          ) as TemporalOperations["describeWorkflowExecution"])
        : "describeWorkflowExecution" in overrides
          ? (undefined as unknown as TemporalOperations["describeWorkflowExecution"])
          : notImplemented("describeWorkflowExecution"),
    ...restOverrides,
  };
}

interface LegacyWorkflowClientMock {
  list?: (opts: { query: string }) => AsyncIterable<unknown>;
  start?: (
    workflowType: string,
    opts: {
      workflowId: string;
      taskQueue: string;
      args: unknown[];
      searchAttributes?: Record<string, unknown[]>;
    },
  ) => Promise<unknown>;
  getHandle?: (workflowId: string, runId?: string) => unknown;
}

interface LegacyConnectionMock {
  workflowService?: {
    describeTaskQueue?: (req: {
      namespace: string;
      taskQueue: { name: string };
      taskQueueType: number;
    }) => Promise<unknown>;
    describeNamespace?: (req: { namespace: string }) => Promise<unknown>;
    describeWorkflowExecution?: (req: {
      namespace: string;
      execution: { workflowId: string };
    }) => Promise<unknown>;
  };
}

interface LegacyClientBundle {
  client?: { workflow?: LegacyWorkflowClientMock };
  workflow?: LegacyWorkflowClientMock;
  connection?: LegacyConnectionMock;
}

interface RawWorkflowHandleShape {
  query: <T>(d: unknown, ...a: unknown[]) => Promise<T>;
  signal: (n: unknown, ...a: unknown[]) => Promise<void>;
  describe: () => Promise<unknown>;
  terminate: (r: string) => Promise<void>;
  cancel: () => Promise<void>;
}

/**
 * Wrap a legacy Temporal Client mock (the object exposed by `getService()`
 * before the owner refactor) into a minimal TemporalOperations mock.
 *
 * This is a temporary bridge for tests that still have a `client` mock with
 * `workflow.start`, `workflow.getHandle`, `workflow.list` etc. It maps the
 * owner methods to the client/connection methods used by the old helpers.
 */
export function createMockOwnerFromClient(client: unknown): TemporalOperations {
  // Accept both the direct `{ workflow: {...} }` shape and the legacy
  // STSL bundle shape `{ client: { workflow: {...} }, connection: {...} }`.
  const bundle = client as LegacyClientBundle;
  const c = bundle.client?.workflow ?? bundle.workflow ?? {};
  const connection =
    bundle.connection ?? (bundle as LegacyClientBundle).connection;

  const wrapLocalHandle = (
    workflowId: string,
    raw: unknown,
  ): TemporalWorkflowHandle =>
    Object.assign({}, raw as Record<string, unknown>, {
      workflowId,
    }) as unknown as TemporalWorkflowHandle;

  const asRawHandle = (
    handle: TemporalWorkflowHandle,
  ): RawWorkflowHandleShape => handle as unknown as RawWorkflowHandleShape;

  const overrides: Partial<TemporalOperations> = {
    getHandle: vi.fn((ctx: TemporalOperationContext, runId?: string) => {
      if (!c.getHandle) {
        throw new Error("WorkflowHandle.getHandle unavailable");
      }
      const raw = c.getHandle(ctx.workflowId, runId);
      return wrapLocalHandle(ctx.workflowId, raw);
    }),
    start: vi.fn(
      async (
        ctx: TemporalOperationContext,
        workflowType: string,
        options: {
          workflowId: string;
          taskQueue: string;
          args: unknown[];
          searchAttributes?: unknown;
        },
      ): Promise<TemporalMutationServerOutcome<TemporalWorkflowHandle>> => {
        if (!c.start) {
          return {
            kind: "confirmed_failure",
            error: new Error("WorkflowClient.start unavailable"),
            diagnostic: { reachable: true, class: "reachable" },
          };
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handle = await c.start(workflowType as any, {
            workflowId: options.workflowId,
            taskQueue: options.taskQueue,
            args: options.args,
            ...(options.searchAttributes
              ? { searchAttributes: options.searchAttributes as any }
              : {}),
          });
          return {
            kind: "confirmed",
            value: wrapLocalHandle(options.workflowId, handle),
          };
        } catch (error) {
          return {
            kind: "confirmed_failure",
            error,
            diagnostic: classifyTemporalWorkflowFailure(error),
          };
        }
      },
    ),
    startChangeWorkflow: vi.fn(
      async (
        ctx: TemporalOperationContext,
        input: ChangeWorkflowInput,
        options?: {
          workflowQueueMode?: WorkflowQueueMode;
          sessionId?: string | null;
        },
      ): Promise<TemporalMutationServerOutcome<TemporalWorkflowHandle>> => {
        if (!c.start) {
          return {
            kind: "confirmed_failure",
            error: new Error("WorkflowClient.start unavailable"),
            diagnostic: { reachable: true, class: "reachable" },
          };
        }
        const sessionId = options?.sessionId ?? input.sessionId;
        const taskQueue =
          options?.workflowQueueMode === "project" || !sessionId
            ? buildProjectTaskQueue(ctx.projectId)
            : buildSessionTaskQueue(ctx.projectId, sessionId);
        if (options?.workflowQueueMode === "project") {
          const owner = createMockOwner(overrides);
          const hasSessionPinned = await hasActiveSessionPinnedWorkflows(
            owner,
            ctx.projectId,
          );
          if (hasSessionPinned.kind === "complete" && hasSessionPinned.value) {
            return {
              kind: "confirmed_failure",
              error: new IncompatibleActiveSessionQueuesError(
                `Project-queue singleton mode is incompatible with active session-pinned workflows for project ${ctx.projectId}.`,
              ),
              diagnostic: { reachable: true, class: "reachable" },
            };
          }
        }
        try {
          const seed = (input.seedState ?? {}) as {
            origin?: { issue_number?: number };
            epic_membership?: { epic_id?: string };
          };
          const searchAttributes =
            input.searchAttributesEnabled !== false
              ? buildTemporalSearchAttributes({
                  projectId: input.projectId,
                  changeId: input.changeId,
                  changeStatus: "draft",
                  activeGate: "proposal",
                  backlogIssueNumber: seed.origin?.issue_number,
                  epicId: seed.epic_membership?.epic_id,
                })
              : undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handle = await c.start(changeWorkflow as any, {
            workflowId: ctx.workflowId,
            taskQueue,
            args: [input],
            ...(searchAttributes ? { searchAttributes } : {}),
          });
          return {
            kind: "confirmed",
            value: wrapLocalHandle(ctx.workflowId, handle),
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error ?? "");
          const alreadyStarted =
            /already started|already exists|Workflow execution already started/i.test(
              message,
            );
          if (!alreadyStarted) {
            return {
              kind: "confirmed_failure",
              error,
              diagnostic: classifyTemporalWorkflowFailure(error),
            };
          }
          if (!c.getHandle) {
            return {
              kind: "confirmed_failure",
              error: new Error("WorkflowHandle.getHandle unavailable", {
                cause: error,
              }),
              diagnostic: classifyTemporalWorkflowFailure(error),
            };
          }
          const rawHandle = c.getHandle(ctx.workflowId);
          const handle = wrapLocalHandle(ctx.workflowId, rawHandle);
          if (input.creationRequestHash) {
            const state = await asRawHandle(handle).query(changeStateQuery);
            const existingHash =
              (state as { creation_request_hash?: string } | null)
                ?.creation_request_hash ?? "";
            const decision = resolveCreationIdempotency({
              existingHash,
              computedHash: input.creationRequestHash,
            });
            if (decision.kind === "hash_conflict") {
              return {
                kind: "confirmed_failure",
                error: new ChangeCreationHashConflictError({
                  changeId: input.changeId,
                  existingHash: decision.existing_hash,
                  computedHash: decision.computed_hash,
                }),
                diagnostic: { reachable: true, class: "reachable" },
              };
            }
          }
          return { kind: "confirmed", value: handle };
        }
      },
    ),
    startEpicWorkflow: vi.fn(
      async (
        ctx: TemporalOperationContext,
        input: EpicWorkflowInput,
      ): Promise<TemporalMutationServerOutcome<TemporalWorkflowHandle>> => {
        if (!c.start) {
          return {
            kind: "confirmed_failure",
            error: new Error("WorkflowClient.start unavailable"),
            diagnostic: { reachable: true, class: "reachable" },
          };
        }
        const taskQueue = buildProjectTaskQueue(ctx.projectId);
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handle = await c.start(epicWorkflow as any, {
            workflowId: ctx.workflowId,
            taskQueue,
            args: [input],
          });
          return {
            kind: "confirmed",
            value: wrapLocalHandle(ctx.workflowId, handle),
          };
        } catch (error) {
          return {
            kind: "confirmed_failure",
            error,
            diagnostic: classifyTemporalWorkflowFailure(error),
          };
        }
      },
    ),
    query: vi.fn(
      async (
        _ctx: TemporalOperationContext,
        handle: TemporalWorkflowHandle,
        def: unknown,
        ...args: unknown[]
      ): Promise<TemporalReadOutcome<unknown>> => {
        return {
          kind: "complete",
          value: await asRawHandle(handle).query(def, ...args),
        };
      },
    ) as unknown as TemporalOperations["query"],
    signal: vi.fn(
      async (
        _ctx: TemporalOperationContext,
        handle: TemporalWorkflowHandle,
        def: unknown,
        args: unknown[],
      ): Promise<TemporalMutationServerOutcome<unknown>> => {
        try {
          await asRawHandle(handle).signal(def, ...args);
          return { kind: "confirmed", value: undefined };
        } catch (error) {
          const diagnostic = classifyTemporalWorkflowFailure(error);
          if (
            diagnostic.class === "deadline" ||
            diagnostic.class === "resource_exhaustion"
          ) {
            return { kind: "timeout_unavailable", error, diagnostic };
          }
          return { kind: "confirmed_failure", error, diagnostic };
        }
      },
    ) as unknown as TemporalOperations["signal"],
    describe: vi.fn(
      async (
        _ctx: TemporalOperationContext,
        handle: TemporalWorkflowHandle,
      ): Promise<TemporalReadOutcome<WorkflowRunDescription>> => {
        return {
          kind: "complete",
          value: (await asRawHandle(
            handle,
          ).describe()) as WorkflowRunDescription,
        };
      },
    ),
    terminate: vi.fn(
      async (
        _ctx: TemporalOperationContext,
        handle: TemporalWorkflowHandle,
        reason: string,
      ): Promise<TemporalMutationServerOutcome<void>> => {
        try {
          await asRawHandle(handle).terminate(reason);
          return { kind: "confirmed", value: undefined };
        } catch (error) {
          const diagnostic = classifyTemporalWorkflowFailure(error);
          if (
            diagnostic.class === "deadline" ||
            diagnostic.class === "resource_exhaustion"
          ) {
            return { kind: "timeout_unavailable", error, diagnostic };
          }
          return { kind: "confirmed_failure", error, diagnostic };
        }
      },
    ),
    cancel: vi.fn(
      async (
        _ctx: TemporalOperationContext,
        handle: TemporalWorkflowHandle,
      ): Promise<TemporalMutationServerOutcome<void>> => {
        try {
          await asRawHandle(handle).cancel();
          return { kind: "confirmed", value: undefined };
        } catch (error) {
          const diagnostic = classifyTemporalWorkflowFailure(error);
          if (
            diagnostic.class === "deadline" ||
            diagnostic.class === "resource_exhaustion"
          ) {
            return { kind: "timeout_unavailable", error, diagnostic };
          }
          return { kind: "confirmed_failure", error, diagnostic };
        }
      },
    ),
    list: vi.fn(
      async <T extends { workflowId: string }>(
        _ctx: TemporalOperationContext,
        query: string,
        options?: { limit?: number; nextPageToken?: string },
      ): Promise<TemporalListOutcome<T[]>> => {
        const list = c.list;
        if (!list) {
          return { kind: "complete", value: [], truncated: false };
        }
        const limit = options?.limit ?? 1000;
        const items: T[] = [];
        for await (const item of list({ query })) {
          items.push(item as T);
          if (items.length >= limit) {
            return { kind: "complete", value: items, truncated: true };
          }
        }
        return { kind: "complete", value: items, truncated: false };
      },
    ) as unknown as TemporalOperations["list"],
    describeTaskQueue: vi.fn(
      async (
        _ctx: TemporalOperationContext,
        taskQueue: string,
      ): Promise<TemporalReadOutcome<unknown>> => {
        const describeTaskQueue =
          connection?.workflowService?.describeTaskQueue;
        if (!describeTaskQueue) {
          throw new Error("WorkflowService.describeTaskQueue unavailable");
        }
        const value = await describeTaskQueue({
          namespace: "default",
          taskQueue: { name: taskQueue },
          taskQueueType: 1,
        });
        return { kind: "complete", value } as TemporalReadOutcome<unknown>;
      },
    ),
    describeNamespace: vi.fn(
      async (
        _ctx: TemporalLifecycleContext,
      ): Promise<TemporalReadOutcome<unknown>> => {
        const describeNamespace =
          connection?.workflowService?.describeNamespace;
        if (!describeNamespace) {
          throw new Error("WorkflowService.describeNamespace unavailable");
        }
        const value = await describeNamespace({ namespace: "default" });
        return { kind: "complete", value } as TemporalReadOutcome<unknown>;
      },
    ),
    describeWorkflowExecution: vi.fn(
      async (
        ctx: TemporalOperationContext,
      ): Promise<TemporalReadOutcome<unknown>> => {
        const describeWorkflowExecution =
          connection?.workflowService?.describeWorkflowExecution;
        if (!describeWorkflowExecution) {
          throw new Error(
            "WorkflowService.describeWorkflowExecution unavailable",
          );
        }
        const value = await describeWorkflowExecution({
          namespace: "default",
          execution: { workflowId: ctx.workflowId },
        });
        return { kind: "complete", value } as TemporalReadOutcome<unknown>;
      },
    ),
  };

  const owner = createMockOwner(overrides);
  return owner;
}
