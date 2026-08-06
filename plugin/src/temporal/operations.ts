/**
 * Temporal Client Operation Owner
 *
 * Single production module authorized to construct, hold, and invoke the
 * Temporal SDK Client/Connection/WorkflowHandle RPC surface. All other
 * ADV code routes Temporal client operations through this API.
 *
 * Design constraints:
 *   - One owner: only this file imports `{Client, Connection, WorkflowHandle}`
 *     from `@temporalio/client` for production use.
 *   - Closed operation kinds: describe, query, signal, start, list, terminate,
 *     cancel. No open-ended `(...args) => Promise<unknown>` passthrough.
 *   - Every operation receives a non-optional typed context/budget.
 *   - Mutations return typed outcomes distinguishing success, confirmed failure,
 *     timeout/unavailable, and outcome-unknown (signal-ack with readback fail).
 *   - Reads return a bounded/degradable result so routine projection reads stay
 *     projection-only and never silently block on a wedged workflow.
 *   - Project identity is carried in the operation context; cross-project calls
 *     are rejected before RPC.
 */

import { Client, Connection, type WorkflowHandle } from "@temporalio/client";
import type { QueryDefinition, SignalDefinition } from "@temporalio/workflow";
import {
  buildChangeWorkflowId,
  buildEpicWorkflowId,
  buildProjectTaskQueue,
  buildSessionTaskQueue,
} from "./client";
import { changeWorkflow, epicWorkflow } from "./workflows";
import { changeStateQuery } from "./messages";
import { readDiskArtifactsForHydration } from "../storage/store-temporal/hydrate-documents";
import { hasActiveSessionPinnedWorkflows } from "./list-orphan-session-queues";
import {
  resolveCreationIdempotency,
  ChangeCreationHashConflictError,
} from "../storage/store-temporal/creation-hash";
import type {
  ChangeWorkflowInput,
  EpicWorkflowInput,
  ChangeWorkflowState,
} from "./contracts";
import {
  buildTemporalSearchAttributes,
  checkAdvSearchAttributes,
  registerMissingAdvSearchAttributes,
  type AdvSearchAttributeCheckResult,
  type AdvSearchAttributeRegistrationResult,
} from "./observability";
import {
  classifyTemporalWorkflowFailure,
  type TemporalWorkflowDiagnostic,
} from "./diagnostics";
import {
  composeTypedMutationResult,
  type TypedMutationResult,
} from "./mutation-safety";
import {
  abortTemporalRead,
  createTemporalReadContext,
  runTemporalRead,
  type TemporalReadResult,
} from "../storage/store-temporal/read-context";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("temporal-operations");

/** Branded ADV project identifier validated at the operation boundary. */
declare const __projectIdBrand: unique symbol;
export type ProjectId = string & { readonly [__projectIdBrand]: true };

const PROJECT_ID_RE = /^[0-9a-f]{40}$/;

/** Validate a raw project id string into a branded ProjectId. */
export function validateProjectId(id: string): ProjectId {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("ProjectId must be a non-empty string");
  }
  const canonical = id.toLowerCase();
  if (!PROJECT_ID_RE.test(canonical)) {
    throw new Error(
      `ProjectId must be a 40-character lowercase hex string (got ${id.length} chars)`,
    );
  }
  return canonical as ProjectId;
}

/** Closed set of client-side Temporal operations routed through the owner. */
export type TemporalOperationKind =
  | "describe"
  | "query"
  | "signal"
  | "start"
  | "list"
  | "terminate"
  | "cancel";

/** Non-optional operation context. Every RPC carries project + budget + kind. */
export interface TemporalOperationContext {
  /** ADV project identity that owns the targeted workflow. */
  projectId: ProjectId;
  /** Target workflow ID. */
  workflowId: string;
  /** Closed operation kind label. */
  opKind: TemporalOperationKind;
  /** Operation-type label for telemetry/diagnostics (e.g. "changeStateQuery"). */
  opType: string;
  /** Wall-clock budget in milliseconds for the whole operation. */
  budgetMs: number;
  /** Optional abort signal for cancellation propagation. */
  abortSignal?: AbortSignal;
}

/** Build a typed operation context. */
export function makeTemporalOperationContext(
  projectId: string,
  workflowId: string,
  opKind: TemporalOperationKind,
  opType: string,
  budgetMs: number,
  abortSignal?: AbortSignal,
): TemporalOperationContext {
  const canonicalProjectId = validateProjectId(projectId);
  if (
    typeof budgetMs !== "number" ||
    !Number.isFinite(budgetMs) ||
    budgetMs <= 0
  ) {
    throw new Error(
      "TemporalOperationContext.budgetMs must be a positive finite number",
    );
  }
  if (budgetMs > HOST_OPERATION_BUDGET_CEILING_MS) {
    logger.debug(
      `Clamping TemporalOperationContext.budgetMs from ${budgetMs}ms to the host ceiling of ${HOST_OPERATION_BUDGET_CEILING_MS}ms`,
    );
    budgetMs = HOST_OPERATION_BUDGET_CEILING_MS;
  }
  if (!opType || typeof opType !== "string") {
    throw new Error("TemporalOperationContext.opType is required");
  }
  if (!workflowId || typeof workflowId !== "string") {
    throw new Error("TemporalOperationContext.workflowId is required");
  }
  return {
    projectId: canonicalProjectId,
    workflowId,
    opKind,
    opType,
    budgetMs,
    abortSignal,
  };
}

/** Non-optional context for lifecycle operations that do not target a workflow. */
export interface TemporalLifecycleContext {
  /** ADV project identity that owns the targeted namespace. */
  projectId: ProjectId;
  /** Operation-type label for telemetry/diagnostics. */
  opType: string;
  /** Wall-clock budget in milliseconds for the whole operation. */
  budgetMs: number;
  /** Optional abort signal for cancellation propagation. */
  abortSignal?: AbortSignal;
}

/** Build a typed lifecycle context. */
export function makeTemporalLifecycleContext(
  projectId: string,
  opType: string,
  budgetMs: number,
  abortSignal?: AbortSignal,
): TemporalLifecycleContext {
  const canonicalProjectId = validateProjectId(projectId);
  if (
    typeof budgetMs !== "number" ||
    !Number.isFinite(budgetMs) ||
    budgetMs <= 0
  ) {
    throw new Error(
      "TemporalLifecycleContext.budgetMs must be a positive finite number",
    );
  }
  if (budgetMs > HOST_OPERATION_BUDGET_CEILING_MS) {
    logger.debug(
      `Clamping TemporalLifecycleContext.budgetMs from ${budgetMs}ms to the host ceiling of ${HOST_OPERATION_BUDGET_CEILING_MS}ms`,
    );
    budgetMs = HOST_OPERATION_BUDGET_CEILING_MS;
  }
  if (!opType || typeof opType !== "string") {
    throw new Error("TemporalLifecycleContext.opType is required");
  }
  return {
    projectId: canonicalProjectId,
    opType,
    budgetMs,
    abortSignal,
  };
}

/** Wall-clock budget ceiling enforced for every public Temporal operation. */
const HOST_OPERATION_BUDGET_CEILING_MS = 10_000;

/** Queue-mode routing for change workflows. */
export type WorkflowQueueMode = "session" | "project";

/**
 * Thrown when explicit singleton routing would strand existing session-pinned
 * workflows by moving new workflows to the project queue while a session
 * queue still has running workflows and no poller.
 */
export class IncompatibleActiveSessionQueuesError extends Error {
  readonly name = "IncompatibleActiveSessionQueuesError";
  readonly code = "INCOMPATIBLE_ACTIVE_SESSION_QUEUES";
  constructor(
    message = "Cannot activate project-queue singleton mode while session-pinned workflows are still running.",
  ) {
    super(message);
  }
}

/** Outcome discriminator for server-ack/mutation operations. */
export type TemporalMutationServerOutcome<T> =
  | { kind: "confirmed"; value: T }
  | {
      kind: "confirmed_failure";
      error: unknown;
      diagnostic: TemporalWorkflowDiagnostic;
    }
  | {
      kind: "timeout_unavailable";
      error: unknown;
      diagnostic: TemporalWorkflowDiagnostic;
    }
  | {
      kind: "outcome_unknown";
      error: unknown;
      diagnostic: TemporalWorkflowDiagnostic;
    };

/** Outcome discriminator for bounded reads. */
export type TemporalReadOutcome<T> =
  | { kind: "complete"; value: T }
  | { kind: "degraded"; error: unknown; diagnostic: TemporalWorkflowDiagnostic }
  | {
      kind: "not_found";
      error: unknown;
      diagnostic: TemporalWorkflowDiagnostic;
    };

/** Outcome discriminator for bounded visibility lists. */
export type TemporalListOutcome<T> =
  | { kind: "complete"; value: T; truncated: boolean; nextPageToken?: string }
  | { kind: "degraded"; error: unknown; diagnostic: TemporalWorkflowDiagnostic }
  | { kind: "timeout"; error: unknown; diagnostic: TemporalWorkflowDiagnostic }
  | {
      kind: "unavailable";
      error: unknown;
      diagnostic: TemporalWorkflowDiagnostic;
    };

export interface TemporalOperations {
  /** Start a change workflow. Idempotent on already-started. */
  startChangeWorkflow(
    ctx: TemporalOperationContext,
    input: ChangeWorkflowInput,
    options?: {
      workflowQueueMode?: "session" | "project";
      sessionId?: string | null;
    },
  ): Promise<TemporalMutationServerOutcome<TemporalWorkflowHandle>>;

  /** Start an epic workflow. Idempotent on already-started. */
  startEpicWorkflow(
    ctx: TemporalOperationContext,
    input: EpicWorkflowInput,
  ): Promise<TemporalMutationServerOutcome<TemporalWorkflowHandle>>;

  /** Generic start for a named workflow type. */
  start(
    ctx: TemporalOperationContext,
    workflowType: string,
    options: {
      workflowId: string;
      taskQueue: string;
      args: unknown[];
      searchAttributes?: unknown;
    },
  ): Promise<TemporalMutationServerOutcome<TemporalWorkflowHandle>>;

  /** Get a handle for an existing workflow by ID. No RPC. */
  getHandle(
    ctx: TemporalOperationContext,
    runId?: string,
  ): TemporalWorkflowHandle;

  /** Bounded workflow query. */
  query<T = unknown>(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
    def: QueryDefinition<T, unknown[]>,
    ...args: unknown[]
  ): Promise<TemporalReadOutcome<T>>;

  /** Bounded workflow describe. */
  describe(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
  ): Promise<TemporalReadOutcome<WorkflowRunDescription>>;

  /** Signal with optional post-signal readback for outcome confirmation. */
  signal<T = unknown>(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
    def: SignalDefinition<unknown[], string>,
    args: unknown[],
    options?: { readback?: () => Promise<T> },
  ): Promise<TemporalMutationServerOutcome<T>>;

  /** Terminate a workflow. */
  terminate(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
    reason: string,
  ): Promise<TemporalMutationServerOutcome<void>>;

  /** Cancel a workflow. */
  cancel(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
  ): Promise<TemporalMutationServerOutcome<void>>;

  /** Bounded visibility list of workflow executions. */
  list<T extends { workflowId: string }>(
    ctx: TemporalOperationContext,
    query: string,
    options?: { limit?: number; nextPageToken?: string },
  ): Promise<TemporalListOutcome<T[]>>;

  /** Describe a task queue to discover poller freshness. */
  describeTaskQueue(
    ctx: TemporalOperationContext,
    taskQueue: string,
  ): Promise<TemporalReadOutcome<unknown>>;

  /** Check whether the required ADV search attributes are registered. */
  checkSearchAttributes(
    ctx: TemporalLifecycleContext,
  ): Promise<AdvSearchAttributeCheckResult>;

  /** Register missing ADV search attributes and log the outcome. */
  registerSearchAttributes(ctx: TemporalLifecycleContext): Promise<void>;

  /** Verify required ADV search attributes propagated; retry with backoff. */
  verifySearchAttributes(
    ctx: TemporalLifecycleContext,
    maxAttempts?: number,
    delayMs?: number,
  ): Promise<AdvSearchAttributeCheckResult>;

  /** Describe the namespace (health probe). */
  describeNamespace(
    ctx: TemporalLifecycleContext,
  ): Promise<TemporalReadOutcome<unknown>>;

  /** Describe a workflow execution by workflow ID (health probe). */
  describeWorkflowExecution(
    ctx: TemporalOperationContext,
  ): Promise<TemporalReadOutcome<unknown>>;
}

/** Opaque reference to a workflow handle. Production value is the SDK handle. */
export interface TemporalWorkflowHandle {
  readonly workflowId: string;
}

const handleRegistry = new WeakMap<TemporalWorkflowHandle, WorkflowHandle>();
const HANDLE_BRAND = Symbol("TemporalWorkflowHandle.brand");

export interface WorkflowRunDescription {
  runId?: string;
  status?: { name: string };
  searchAttributes?: Record<string, unknown>;
}

function wrapHandle(
  workflowId: string,
  handle: WorkflowHandle,
): TemporalWorkflowHandle {
  const wrapped: TemporalWorkflowHandle = {
    workflowId,
    [HANDLE_BRAND]: true,
  } as TemporalWorkflowHandle;
  handleRegistry.set(wrapped, handle);
  return wrapped;
}

function unwrapHandle(handle: TemporalWorkflowHandle): WorkflowHandle {
  const raw = handleRegistry.get(handle);
  if (raw === undefined) {
    throw new Error(
      "Invalid TemporalWorkflowHandle: not produced by the operation owner",
    );
  }
  return raw;
}

function validateContext(
  ctx: TemporalOperationContext | TemporalLifecycleContext,
  ownerProjectId?: ProjectId,
): void {
  if (!ctx.projectId || typeof ctx.projectId !== "string") {
    throw new Error("TemporalOperationContext.projectId is required");
  }
  if (
    ownerProjectId !== undefined &&
    ctx.projectId.toLowerCase() !== ownerProjectId.toLowerCase()
  ) {
    throw new Error(
      `TemporalOperationContext.projectId mismatch: context '${ctx.projectId}' does not belong to owner '${ownerProjectId}'`,
    );
  }
  if (!ctx.opType || typeof ctx.opType !== "string") {
    throw new Error("TemporalOperationContext.opType is required");
  }
  if (
    typeof ctx.budgetMs !== "number" ||
    !Number.isFinite(ctx.budgetMs) ||
    ctx.budgetMs <= 0
  ) {
    throw new Error(
      "TemporalOperationContext.budgetMs must be a positive finite number",
    );
  }
  if (ctx.budgetMs > HOST_OPERATION_BUDGET_CEILING_MS) {
    logger.debug(
      `Clamping TemporalOperationContext.budgetMs from ${ctx.budgetMs}ms to the host ceiling of ${HOST_OPERATION_BUDGET_CEILING_MS}ms`,
    );
    ctx.budgetMs = HOST_OPERATION_BUDGET_CEILING_MS;
  }
  if ("opKind" in ctx) {
    if (!ctx.workflowId || typeof ctx.workflowId !== "string") {
      throw new Error("TemporalOperationContext.workflowId is required");
    }
  }
}

function guardProjectId(
  ctx: TemporalOperationContext,
  actualWorkflowId: string,
): void {
  const expectedPrefix = buildChangeWorkflowId(ctx.projectId, "");
  const epicPrefix = buildEpicWorkflowId(ctx.projectId, "");
  if (
    !actualWorkflowId.startsWith(expectedPrefix) &&
    !actualWorkflowId.startsWith(epicPrefix)
  ) {
    throw new Error(
      `Project context mismatch: workflow '${actualWorkflowId}' does not belong to project '${ctx.projectId}'`,
    );
  }
}

function diagnosticOf(error: unknown): TemporalWorkflowDiagnostic {
  return classifyTemporalWorkflowFailure(error);
}

function readOutcome<T>(result: TemporalReadResult<T>): TemporalReadOutcome<T> {
  if (result.complete && result.data !== undefined) {
    return { kind: "complete", value: result.data };
  }
  const error =
    result.error ?? new Error("Temporal read incomplete with no error");
  const diagnostic = diagnosticOf(error);
  if (diagnostic.class === "not_found") {
    return { kind: "not_found", error, diagnostic };
  }
  return { kind: "degraded", error, diagnostic };
}

function isTimeoutDiagnostic(diagnostic: TemporalWorkflowDiagnostic): boolean {
  return (
    diagnostic.class === "deadline" ||
    diagnostic.class === "resource_exhaustion"
  );
}

function listOutcomeOf<T>(
  result: TemporalReadResult<{ items: T[]; truncated: boolean }>,
): TemporalListOutcome<T[]> {
  if (result.complete && result.data) {
    return {
      kind: "complete",
      value: result.data.items,
      truncated: result.data.truncated,
    };
  }
  const error =
    result.error ?? new Error("Temporal list incomplete with no error");
  const diagnostic = diagnosticOf(error);
  if (isTimeoutDiagnostic(diagnostic)) {
    return { kind: "timeout", error, diagnostic };
  }
  const code = diagnostic.cause?.code;
  if (code === 14 || code === 13) {
    return { kind: "unavailable", error, diagnostic };
  }
  return { kind: "degraded", error, diagnostic };
}

function mutationOutcome<T>(
  result: TypedMutationResult<T>,
): TemporalMutationServerOutcome<T> {
  if (result.outcome === "confirmed") {
    return { kind: "confirmed", value: result.readback.value as T };
  }

  if (result.signal.error) {
    const error = result.signal.error;
    const diagnostic = diagnosticOf(error);
    if (isTimeoutDiagnostic(diagnostic)) {
      return { kind: "timeout_unavailable", error, diagnostic };
    }
    return {
      kind: "confirmed_failure",
      error,
      diagnostic,
    };
  }

  if (result.readback.error) {
    const error = result.readback.error;
    const diagnostic = diagnosticOf(error);
    if (isTimeoutDiagnostic(diagnostic)) {
      return { kind: "timeout_unavailable", error, diagnostic };
    }
    return {
      kind: "outcome_unknown",
      error,
      diagnostic,
    };
  }

  // Fallback for malformed result (no error but not confirmed).
  const fallback = new Error("mutation outcome incomplete with no error");
  return {
    kind: "outcome_unknown",
    error: fallback,
    diagnostic: diagnosticOf(fallback),
  };
}

interface TemporalClientBundle {
  address: string;
  namespace: string;
  connection: Connection;
  client: Client;
}

async function createTemporalClientBundle(
  env: NodeJS.ProcessEnv = process.env,
  connectTimeoutMs?: number,
): Promise<TemporalClientBundle> {
  void env;
  void connectTimeoutMs;
  throw new Error(
    "Temporal disabled — disk projection is sole source of truth",
  );
}

export class TemporalOperationsOwner implements TemporalOperations {
  /** Raw connection surface — private to enforce the single-owner boundary. */
  private connection: Connection;
  /** Raw client surface — private to enforce the single-owner boundary. */
  private client: Client;
  public readonly address: string;
  public readonly namespace: string;
  /** Project identity that owns this connection; used for lifecycle audit context. */
  public readonly projectId: ProjectId;

  constructor(bundle: TemporalClientBundle, projectId: ProjectId | string) {
    this.connection = bundle.connection;
    this.client = bundle.client;
    this.address = bundle.address;
    this.namespace = bundle.namespace;
    this.projectId = validateProjectId(projectId);
  }

  getProjectId(): ProjectId {
    return this.projectId;
  }

  getAddress(): string {
    return this.address;
  }

  getNamespace(): string {
    return this.namespace;
  }

  private runWithDeadline<T>(
    deadlineAt: number,
    abortSignal: AbortSignal,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.connection.withDeadline(deadlineAt, () =>
      this.connection.withAbortSignal(abortSignal, fn),
    );
  }

  private runWithOperationDeadline<T>(
    ctx: TemporalOperationContext | TemporalLifecycleContext,
    fn: () => Promise<T>,
  ): Promise<T> {
    const deadlineAt = Date.now() + ctx.budgetMs;
    const signal = ctx.abortSignal ?? new AbortController().signal;
    return this.runWithDeadline(deadlineAt, signal, fn);
  }

  /** Create an operation owner from a fresh client bundle for a specific project. */
  static async fromEnv(
    projectId: string | ProjectId,
    env?: NodeJS.ProcessEnv,
    options?: { connectTimeoutMs?: number },
  ): Promise<TemporalOperationsOwner> {
    return new TemporalOperationsOwner(
      await createTemporalClientBundle(env, options?.connectTimeoutMs),
      validateProjectId(projectId),
    );
  }

  /** Close the underlying connection. Idempotent. */
  async close(): Promise<void> {
    try {
      await this.connection.close();
    } catch (e) {
      logger.debug(
        `TemporalOperationsOwner.close error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Replace the underlying connection+client in place. */
  async reconnect(): Promise<void> {
    try {
      await this.close();
    } catch (e) {
      logger.debug(
        `TemporalOperationsOwner.reconnect close error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const bundle = await createTemporalClientBundle({
      ADV_TEMPORAL_ADDRESS: this.address,
      ADV_TEMPORAL_NAMESPACE: this.namespace,
    });
    this.connection = bundle.connection;
    this.client = bundle.client;
  }

  private async doRegisterMissingSearchAttributes(
    ctx: TemporalLifecycleContext,
  ): Promise<AdvSearchAttributeRegistrationResult> {
    return this.runWithOperationDeadline(ctx, () =>
      registerMissingAdvSearchAttributes(
        this.connection,
        this.namespace,
        ctx.projectId,
      ),
    );
  }

  private async doCheckSearchAttributes(
    ctx: TemporalLifecycleContext,
  ): Promise<AdvSearchAttributeCheckResult> {
    return this.runWithOperationDeadline(ctx, () =>
      checkAdvSearchAttributes(this.connection, this.namespace, ctx.projectId),
    );
  }

  async registerMissingSearchAttributes(
    ctx: TemporalLifecycleContext,
  ): Promise<AdvSearchAttributeRegistrationResult> {
    validateContext(ctx, this.projectId);
    return this.doRegisterMissingSearchAttributes(ctx);
  }

  async checkSearchAttributes(
    ctx: TemporalLifecycleContext,
  ): Promise<AdvSearchAttributeCheckResult> {
    validateContext(ctx, this.projectId);
    return this.doCheckSearchAttributes(ctx);
  }

  async registerSearchAttributes(ctx: TemporalLifecycleContext): Promise<void> {
    validateContext(ctx, this.projectId);
    const result = await this.doRegisterMissingSearchAttributes(ctx);
    if (result.created.length > 0) {
      logger.debug(
        `Registered ADV search attributes for ${result.projectId}: ${result.created.map((a) => a.name).join(", ")}`,
      );
    }
    if (result.skipped.length > 0) {
      logger.debug(
        `ADV search attributes already registered for ${result.projectId}: ${result.skipped.map((a) => a.name).join(", ")}`,
      );
    }
    if (result.refused.length > 0) {
      logger.warn(
        `ADV search attributes refused for ${result.projectId} (wrong type): ${result.refused
          .map((a) => `${a.name} (expected ${a.expected}, got ${a.actualCode})`)
          .join(", ")}`,
      );
    }
    if (result.error) {
      const isAlreadyExists = /already\s*exists|ALREADY_EXISTS/i.test(
        result.error,
      );
      if (isAlreadyExists) {
        logger.debug(
          `ADV search attributes already registered for ${result.projectId} (idempotent no-op): ${result.error}`,
        );
      } else if (result.method === "unavailable") {
        logger.debug(
          `OperatorService.addSearchAttributes unavailable for ${result.projectId} — skipping search-attribute registration: ${result.error}`,
        );
      } else {
        logger.error(
          `Failed to register ADV search attributes for ${result.projectId} (Visibility queries may fail): ${result.error}`,
        );
      }
    }
  }

  async verifySearchAttributes(
    ctx: TemporalLifecycleContext,
    maxAttempts = 20,
    delayMs = 500,
  ): Promise<AdvSearchAttributeCheckResult> {
    validateContext(ctx, this.projectId);
    const deadlineAt = Date.now() + ctx.budgetMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
    let lastResult: AdvSearchAttributeCheckResult | undefined;
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (controller.signal.aborted) break;
        const remaining = Math.max(0, deadlineAt - Date.now());
        if (remaining <= 0) break;
        const subCtx: TemporalLifecycleContext = {
          ...ctx,
          budgetMs: remaining,
          abortSignal: controller.signal,
        };
        lastResult = await this.doCheckSearchAttributes(subCtx);
        if (lastResult.ok) {
          logger.debug(
            `verifySearchAttributes(${ctx.projectId}): ok after ${attempt + 1}/${maxAttempts} attempts`,
          );
          return lastResult;
        }
        if (attempt < maxAttempts - 1) {
          const wait = Math.min(
            delayMs,
            Math.max(0, deadlineAt - Date.now() - 1),
          );
          if (wait <= 0) break;
          logger.debug(
            `verifySearchAttributes(${ctx.projectId}): attempt ${attempt + 1}/${maxAttempts} — ${lastResult.missing.length} missing, retrying in ${wait}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
      }
    } finally {
      clearTimeout(timer);
    }
    if (!lastResult) {
      lastResult = await this.doCheckSearchAttributes({
        ...ctx,
        budgetMs: 1,
        abortSignal: controller.signal,
      });
    }
    if (!lastResult.ok) {
      logger.warn(
        `verifySearchAttributes(${ctx.projectId}): still not ok after bounded attempts — ${lastResult.missing.length} missing, ${lastResult.wrongType.length} wrong type`,
      );
    }
    return lastResult;
  }

  /** Probe whether the server is reachable within the supplied budget. */
  async isReachable(ctx: TemporalLifecycleContext): Promise<boolean> {
    validateContext(ctx, this.projectId);
    const deadline = Date.now() + ctx.budgetMs;
    try {
      await this.connection.withDeadline(deadline, async () => {
        // Lightweight health check: list namespaces or similar.
        // Calling workflow.list with a query that matches nothing is safe.
        for await (const _ of this.client.workflow.list({ query: "1=0" })) {
          // no-op
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  async describeNamespace(
    ctx: TemporalLifecycleContext,
  ): Promise<TemporalReadOutcome<unknown>> {
    validateContext(ctx, this.projectId);
    const readCtx = createTemporalReadContext(ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () =>
        abortTemporalRead(readCtx),
      );
    }
    const result = await runTemporalRead(
      this.runWithDeadline.bind(this),
      async () => {
        const svc = this.connection.workflowService;
        if (!svc?.describeNamespace) {
          throw new Error("WorkflowService.describeNamespace unavailable");
        }
        return svc.describeNamespace({ namespace: this.namespace });
      },
      readCtx,
      { opType: ctx.opType, timeoutMs: ctx.budgetMs },
    );
    return readOutcome<unknown>(result);
  }

  async describeWorkflowExecution(
    ctx: TemporalOperationContext,
  ): Promise<TemporalReadOutcome<unknown>> {
    validateContext(ctx, this.projectId);
    const readCtx = createTemporalReadContext(ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () =>
        abortTemporalRead(readCtx),
      );
    }
    const result = await runTemporalRead(
      this.runWithDeadline.bind(this),
      async () => {
        const svc = this.connection.workflowService;
        if (!svc?.describeWorkflowExecution) {
          throw new Error(
            "WorkflowService.describeWorkflowExecution unavailable",
          );
        }
        return svc.describeWorkflowExecution({
          namespace: this.namespace,
          execution: { workflowId: ctx.workflowId },
        });
      },
      readCtx,
      { opType: ctx.opType, timeoutMs: ctx.budgetMs },
    );
    return readOutcome<unknown>(result);
  }

  getHandle(
    ctx: TemporalOperationContext,
    runId?: string,
  ): TemporalWorkflowHandle {
    validateContext(ctx, this.projectId);
    guardProjectId(ctx, ctx.workflowId);
    const handle = runId
      ? this.client.workflow.getHandle(ctx.workflowId, runId)
      : this.client.workflow.getHandle(ctx.workflowId);
    return wrapHandle(ctx.workflowId, handle);
  }

  private classifyStartFailure(error: unknown): {
    kind: Exclude<TemporalMutationServerOutcome<never>["kind"], "confirmed">;
    diagnostic: TemporalWorkflowDiagnostic;
  } {
    if (error instanceof ChangeCreationHashConflictError) {
      return {
        kind: "confirmed_failure",
        diagnostic: {
          reachable: true,
          class: "reachable",
          evidence: error.message,
        },
      };
    }
    const diagnostic = classifyTemporalWorkflowFailure(error);
    if (
      diagnostic.class === "deadline" ||
      diagnostic.class === "resource_exhaustion"
    ) {
      return { kind: "timeout_unavailable", diagnostic };
    }
    if (diagnostic.class === "unknown") {
      return { kind: "outcome_unknown", diagnostic };
    }
    return { kind: "confirmed_failure", diagnostic };
  }

  async start(
    ctx: TemporalOperationContext,
    workflowType: string,
    options: {
      workflowId: string;
      taskQueue: string;
      args: unknown[];
      searchAttributes?: unknown;
    },
  ): Promise<TemporalMutationServerOutcome<TemporalWorkflowHandle>> {
    validateContext(ctx, this.projectId);
    if (ctx.workflowId !== options.workflowId) {
      return {
        kind: "confirmed_failure",
        error: new Error(
          `start context workflowId '${ctx.workflowId}' does not match '${options.workflowId}'`,
        ),
        diagnostic: { reachable: true, class: "reachable" },
      };
    }
    const startOpts = {
      workflowId: options.workflowId,
      taskQueue: options.taskQueue,
      args: options.args as [unknown],
      ...(options.searchAttributes
        ? { searchAttributes: options.searchAttributes }
        : {}),
    };
    try {
      const handle = await this.runWithOperationDeadline(ctx, () =>
        this.client.workflow.start(
          workflowType as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          startOpts as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        ),
      );
      return {
        kind: "confirmed",
        value: wrapHandle(options.workflowId, handle as WorkflowHandle),
      };
    } catch (error) {
      if (isAlreadyStartedError(error)) {
        const handle = this.client.workflow.getHandle(options.workflowId);
        return {
          kind: "confirmed",
          value: wrapHandle(options.workflowId, handle),
        };
      }
      const { kind, diagnostic } = this.classifyStartFailure(error);
      return { kind, error, diagnostic };
    }
  }

  private async listWorkflowExecutions<T extends { workflowId: string }>(
    query: string,
  ): Promise<T[]> {
    const results: T[] = [];
    for await (const item of this.client.workflow.list({ query })) {
      results.push(item as unknown as T);
    }
    return results;
  }

  private async hydrateChangeWorkflowInput(
    input: ChangeWorkflowInput,
  ): Promise<ChangeWorkflowInput> {
    if (
      input.seedState?.documents ||
      !input.projectionChangesDir ||
      !input.changeId
    ) {
      return input;
    }
    const hydrated = await readDiskArtifactsForHydration(
      input.projectionChangesDir,
      input.changeId,
    );
    if (hydrated.warnings.length > 0) {
      logger.warn(
        `Hydration warnings for ${input.changeId}: ${hydrated.warnings.map((w) => `${w.kind} ${w.path}${w.actual ? ` (${w.actual} bytes)` : ""}`).join(", ")}`,
      );
    }
    if (!hydrated.documents) return input;
    return {
      ...input,
      seedState: {
        ...(input.seedState ?? {}),
        documents: hydrated.documents,
      },
    };
  }

  async startChangeWorkflow(
    ctx: TemporalOperationContext,
    input: ChangeWorkflowInput,
    options?: {
      workflowQueueMode?: WorkflowQueueMode;
      sessionId?: string | null;
    },
  ): Promise<TemporalMutationServerOutcome<TemporalWorkflowHandle>> {
    validateContext(ctx, this.projectId);
    const workflowId = buildChangeWorkflowId(ctx.projectId, input.changeId);
    if (ctx.workflowId !== workflowId) {
      return {
        kind: "confirmed_failure",
        error: new Error(
          `startChangeWorkflow context workflowId '${ctx.workflowId}' does not match derived '${workflowId}'`,
        ),
        diagnostic: { reachable: true, class: "reachable" },
      };
    }

    const sessionId = options?.sessionId ?? input.sessionId;

    const taskQueue =
      options?.workflowQueueMode === "project" || !sessionId
        ? buildProjectTaskQueue(ctx.projectId)
        : buildSessionTaskQueue(ctx.projectId, sessionId);

    const startDeadline = Date.now() + ctx.budgetMs;

    if (options?.workflowQueueMode === "project") {
      const preflightBudgetMs = Math.min(5_000, Math.max(1, ctx.budgetMs - 1));
      const preflightCtx = makeTemporalLifecycleContext(
        ctx.projectId,
        "startChangeWorkflow.sessionPreflight",
        preflightBudgetMs,
        ctx.abortSignal,
      );
      const hasSessionPinned = await hasActiveSessionPinnedWorkflows(
        this,
        ctx.projectId,
        preflightCtx,
      );
      const preflightRemaining = Math.max(0, startDeadline - Date.now());
      if (preflightRemaining <= 0) {
        return {
          kind: "timeout_unavailable",
          error: new Error(
            "Start budget exhausted after session-pinned preflight",
          ),
          diagnostic: { class: "deadline", reachable: true },
        };
      }
      if (hasSessionPinned.kind !== "complete" || hasSessionPinned.value) {
        return {
          kind: "confirmed_failure",
          error: new IncompatibleActiveSessionQueuesError(
            `Project-queue singleton mode is incompatible with active session-pinned workflows or degraded visibility for project ${ctx.projectId}.`,
          ),
          diagnostic:
            hasSessionPinned.kind !== "complete"
              ? hasSessionPinned.diagnostic
              : { reachable: true, class: "reachable" },
        };
      }
    }

    const inputWithHydration = await this.hydrateChangeWorkflowInput(input);

    const remainingAfterHydration = Math.max(0, startDeadline - Date.now());
    if (remainingAfterHydration <= 0) {
      return {
        kind: "timeout_unavailable",
        error: new Error("Start budget exhausted after document hydration"),
        diagnostic: { class: "deadline", reachable: true },
      };
    }
    const startCtx = makeTemporalOperationContext(
      ctx.projectId,
      workflowId,
      "start",
      ctx.opType,
      remainingAfterHydration,
      ctx.abortSignal,
    );

    const searchAttributes =
      inputWithHydration.searchAttributesEnabled !== false
        ? (buildTemporalSearchAttributes({
            projectId: inputWithHydration.projectId,
            changeId: inputWithHydration.changeId,
            changeStatus: "draft",
            activeGate: "proposal",
            backlogIssueNumber:
              inputWithHydration.seedState?.origin?.issue_number,
            epicId: inputWithHydration.seedState?.epic_membership?.epic_id,
          }) as unknown as import("@temporalio/workflow").SearchAttributes)
        : undefined;

    const startOutcome = await this.start(startCtx, changeWorkflow as any, {
      workflowId,
      taskQueue,
      args: [inputWithHydration] as [unknown],
      searchAttributes,
    });
    if (startOutcome.kind !== "confirmed") {
      return startOutcome;
    }

    if (inputWithHydration.creationRequestHash) {
      const remainingForHash = Math.max(0, startDeadline - Date.now());
      if (remainingForHash <= 0) {
        return {
          kind: "outcome_unknown",
          error: new Error(
            "Start budget exhausted before creation-request hash reconciliation",
          ),
          diagnostic: { class: "deadline", reachable: true },
        };
      }
      const queryCtx = makeTemporalOperationContext(
        ctx.projectId,
        workflowId,
        "query",
        "startChangeWorkflow.hashReconcile",
        Math.min(remainingForHash, 5_000),
        ctx.abortSignal,
      );
      const outcome = await this.query(
        queryCtx,
        startOutcome.value,
        changeStateQuery as QueryDefinition<
          ChangeWorkflowState,
          unknown[],
          string
        >,
      );
      if (outcome.kind === "complete") {
        const decision = resolveCreationIdempotency({
          existingHash: outcome.value.creation_request_hash,
          computedHash: inputWithHydration.creationRequestHash,
        });
        if (decision.kind === "hash_conflict") {
          return {
            kind: "confirmed_failure",
            error: new ChangeCreationHashConflictError({
              changeId: inputWithHydration.changeId,
              existingHash: decision.existing_hash,
              computedHash: decision.computed_hash,
            }),
            diagnostic: { reachable: true, class: "reachable" },
          };
        }
      } else {
        return {
          kind: "outcome_unknown",
          error: outcome.error,
          diagnostic: outcome.diagnostic,
        };
      }
    }
    return startOutcome;
  }

  async startEpicWorkflow(
    ctx: TemporalOperationContext,
    input: EpicWorkflowInput,
  ): Promise<TemporalMutationServerOutcome<TemporalWorkflowHandle>> {
    validateContext(ctx, this.projectId);
    const workflowId = buildEpicWorkflowId(ctx.projectId, input.epicId);
    if (ctx.workflowId !== workflowId) {
      return {
        kind: "confirmed_failure",
        error: new Error(
          `startEpicWorkflow context workflowId '${ctx.workflowId}' does not match derived '${workflowId}'`,
        ),
        diagnostic: { reachable: true, class: "reachable" },
      };
    }
    return this.start(
      ctx,
      epicWorkflow as any,
      {
        workflowId,
        taskQueue: buildProjectTaskQueue(ctx.projectId),
        args: [input] as [unknown],
      } as any,
    );
  }

  async query<T = unknown>(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
    def: QueryDefinition<T, unknown[], string>,
    ...args: unknown[]
  ): Promise<TemporalReadOutcome<T>> {
    validateContext(ctx, this.projectId);
    const internal = unwrapHandle(handle);
    const readCtx = createTemporalReadContext(ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () =>
        abortTemporalRead(readCtx),
      );
    }
    const result = await runTemporalRead(
      this.runWithDeadline.bind(this),
      async () => internal.query(def, ...args) as Promise<T>,
      readCtx,
      { opType: ctx.opType, timeoutMs: ctx.budgetMs },
    );
    return readOutcome<T>(result);
  }

  async describe(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
  ): Promise<TemporalReadOutcome<WorkflowRunDescription>> {
    validateContext(ctx, this.projectId);
    const internal = unwrapHandle(handle);
    const readCtx = createTemporalReadContext(ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () =>
        abortTemporalRead(readCtx),
      );
    }
    const result = await runTemporalRead(
      this.runWithDeadline.bind(this),
      async () => {
        const desc = await internal.describe();
        return {
          runId: desc.runId,
          status: desc.status,
          searchAttributes: desc.searchAttributes,
        } as WorkflowRunDescription;
      },
      readCtx,
      { opType: ctx.opType, timeoutMs: ctx.budgetMs },
    );
    return readOutcome<WorkflowRunDescription>(result);
  }

  async signal<T = unknown>(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
    def: SignalDefinition<unknown[], string>,
    args: unknown[],
    options?: { readback?: () => Promise<T> },
  ): Promise<TemporalMutationServerOutcome<T>> {
    validateContext(ctx, this.projectId);
    const internal = unwrapHandle(handle);
    const readCtx = createTemporalReadContext(ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () =>
        abortTemporalRead(readCtx),
      );
    }

    let signalError: unknown | undefined;
    let readbackError: unknown | undefined;
    let readbackValue: T | undefined;

    try {
      await this.runWithOperationDeadline(ctx, () =>
        internal.signal(def, ...args),
      );
    } catch (error) {
      signalError = error;
    }

    if (signalError === undefined && options?.readback) {
      try {
        const rbResult = await runTemporalRead(
          this.runWithDeadline.bind(this),
          options.readback,
          readCtx,
          { opType: `${ctx.opType}:readback`, timeoutMs: ctx.budgetMs },
        );
        if (!rbResult.complete) {
          readbackError = rbResult.error ?? new Error("readback incomplete");
        } else {
          readbackValue = rbResult.data as T;
        }
      } catch (error) {
        readbackError = error;
      }
    }

    const result = composeTypedMutationResult<T>({
      signalError,
      readbackError,
      readbackValue,
    });
    return mutationOutcome<T>(result);
  }

  async terminate(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
    reason: string,
  ): Promise<TemporalMutationServerOutcome<void>> {
    validateContext(ctx, this.projectId);
    const internal = unwrapHandle(handle);
    const readCtx = createTemporalReadContext(ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () =>
        abortTemporalRead(readCtx),
      );
    }
    const result = await runTemporalRead(
      this.runWithDeadline.bind(this),
      () => internal.terminate(reason),
      readCtx,
      { opType: ctx.opType, timeoutMs: ctx.budgetMs },
    );
    if (result.complete) {
      return { kind: "confirmed", value: undefined };
    }
    const error =
      result.error ?? new Error("Temporal terminate incomplete with no error");
    const diagnostic = diagnosticOf(error);
    if (result.degraded || isTimeoutDiagnostic(diagnostic)) {
      return { kind: "timeout_unavailable", error, diagnostic };
    }
    return { kind: "confirmed_failure", error, diagnostic };
  }

  async cancel(
    ctx: TemporalOperationContext,
    handle: TemporalWorkflowHandle,
  ): Promise<TemporalMutationServerOutcome<void>> {
    validateContext(ctx, this.projectId);
    const internal = unwrapHandle(handle);
    const readCtx = createTemporalReadContext(ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () =>
        abortTemporalRead(readCtx),
      );
    }
    const result = await runTemporalRead(
      this.runWithDeadline.bind(this),
      () => internal.cancel(),
      readCtx,
      {
        opType: ctx.opType,
        timeoutMs: ctx.budgetMs,
      },
    );
    if (result.complete) {
      return { kind: "confirmed", value: undefined };
    }
    const error =
      result.error ?? new Error("Temporal cancel incomplete with no error");
    const diagnostic = diagnosticOf(error);
    if (result.degraded || isTimeoutDiagnostic(diagnostic)) {
      return { kind: "timeout_unavailable", error, diagnostic };
    }
    return { kind: "confirmed_failure", error, diagnostic };
  }

  async list<T extends { workflowId: string }>(
    ctx: TemporalOperationContext,
    query: string,
    options?: { limit?: number; nextPageToken?: string },
  ): Promise<TemporalListOutcome<T[]>> {
    validateContext(ctx, this.projectId);
    const limit = options?.limit ?? 1000;
    if (limit <= 0) {
      return { kind: "complete", value: [], truncated: false };
    }
    const readCtx = createTemporalReadContext(ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () =>
        abortTemporalRead(readCtx),
      );
    }
    const result = await runTemporalRead(
      this.runWithDeadline.bind(this),
      async () => {
        const items: T[] = [];
        for await (const item of this.client.workflow.list({ query })) {
          items.push(item as unknown as T);
          if (items.length >= limit) {
            return { items, truncated: true };
          }
        }
        return { items, truncated: false };
      },
      readCtx,
      { opType: ctx.opType, timeoutMs: ctx.budgetMs },
    );
    return listOutcomeOf(result);
  }

  async describeTaskQueue(
    ctx: TemporalOperationContext,
    taskQueue: string,
  ): Promise<TemporalReadOutcome<unknown>> {
    validateContext(ctx, this.projectId);
    const readCtx = createTemporalReadContext(ctx.budgetMs);
    if (ctx.abortSignal) {
      ctx.abortSignal.addEventListener("abort", () =>
        abortTemporalRead(readCtx),
      );
    }
    const result = await runTemporalRead(
      this.runWithDeadline.bind(this),
      async () => {
        const svc = this.connection.workflowService;
        if (!svc?.describeTaskQueue) {
          throw new Error("WorkflowService.describeTaskQueue unavailable");
        }
        return svc.describeTaskQueue({
          namespace: this.namespace,
          taskQueue: { name: taskQueue },
          taskQueueType: 1,
        });
      },
      readCtx,
      { opType: ctx.opType, timeoutMs: ctx.budgetMs },
    );
    return readOutcome<unknown>(result);
  }
}

function isAlreadyStartedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already started|already exists|Workflow execution already started/i.test(
    message,
  );
}
