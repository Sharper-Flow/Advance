/**
 * Script facade over the single Temporal client-operation owner.
 *
 * This module contains NO raw `@temporalio/client` imports or direct SDK
 * methods. It delegates every Temporal client RPC to
 * `TemporalOperationsOwner` in `../src/temporal/operations.ts` and adds only
 * script-appropriate ergonomics (argument shaping, outcome unwrapping, and
 * visibility query filtering).
 *
 * Worker construction (`NativeConnection`, `Worker`) is a separate build/runtime
 * concern and is allowed here because it is not a client/Connection/Handle
 * surface.
 */

import {
  TemporalOperationsOwner,
  makeTemporalOperationContext,
  type TemporalOperationContext,
  type TemporalOperations,
  type TemporalWorkflowHandle,
} from "../src/temporal/operations";
import { buildChangeWorkflowId } from "../src/temporal/client";
import type {
  QueryDefinition,
  SignalDefinition,
} from "@temporalio/workflow";
import type { TemporalWorkflowDiagnostic } from "../src/temporal/diagnostics";

const SCRIPT_BUDGET_MS = 10_000;

export type TemporalScriptMutationKind =
  | "confirmed_failure"
  | "timeout_unavailable"
  | "outcome_unknown";

export type TemporalScriptReadKind =
  | "degraded"
  | "timeout"
  | "unavailable"
  | "not_found";

export type TemporalScriptOutcomeKind =
  | TemporalScriptMutationKind
  | TemporalScriptReadKind;

/**
 * Distinct error thrown when a script-level Temporal operation returns a
 * non-success outcome. The `kind` and `diagnostic` fields preserve the original
 * effect uncertainty so callers can branch instead of parsing message text.
 */
export class TemporalScriptOutcomeError extends Error {
  readonly name = "TemporalScriptOutcomeError";
  constructor(
    readonly kind: TemporalScriptOutcomeKind,
    readonly causeError: unknown,
    readonly diagnostic: TemporalWorkflowDiagnostic | undefined,
    message: string,
  ) {
    super(message);
  }
}

export interface TemporalScriptFacade {
  readonly address: string;
  readonly namespace: string;
  readonly projectId: string;
  close(): Promise<void>;
  startWorkflow(options: {
    workflowType: string;
    workflowId: string;
    taskQueue: string;
    args: unknown[];
  }): Promise<{ workflowId: string }>;
  signalWorkflow(
    workflowId: string,
    signalDef: SignalDefinition,
    ...args: unknown[]
  ): Promise<void>;
  queryWorkflow<T>(
    workflowId: string,
    queryDef: QueryDefinition<T>,
    ...args: unknown[]
  ): Promise<T>;
  terminateWorkflow(workflowId: string, reason?: string): Promise<void>;
  listChangeWorkflowIds(): Promise<string[]>;
}

export interface CreateTemporalScriptFacadeOptions {
  /** Canonical ADV project id. The facade will only operate in this context. */
  projectId: string;
  address?: string;
  namespace?: string;
  /**
   * Internal test seam: inject a pre-created owner. When supplied, the
   * facade uses the owner identity and skips creating a new connection.
   */
  owner?: TemporalOperationsOwner;
}

export async function createTemporalScriptFacade(
  options: CreateTemporalScriptFacadeOptions,
): Promise<TemporalScriptFacade> {
  if (!options.projectId) {
    throw new Error("projectId is required to create a TemporalScriptFacade");
  }
  const env = {
    ADV_TEMPORAL_ADDRESS: options.address,
    ADV_TEMPORAL_NAMESPACE: options.namespace,
  } as NodeJS.ProcessEnv;
  const owner =
    options.owner ??
    (await TemporalOperationsOwner.fromEnv(options.projectId, env));
  const projectId = owner.projectId;
  const address = owner.getAddress();
  const namespace = owner.getNamespace();

  function opCtx(
    workflowId: string,
    opKind: TemporalOperationContext["opKind"],
    opType: string,
  ): TemporalOperationContext {
    return makeTemporalOperationContext(
      projectId,
      workflowId,
      opKind,
      opType,
      SCRIPT_BUDGET_MS,
    );
  }

  function getHandle(workflowId: string): TemporalWorkflowHandle {
    return owner.getHandle(opCtx(workflowId, "query", "script.getHandle"));
  }

  return {
    address,
    namespace,
    projectId,
    close: () => owner.close(),
    async startWorkflow(opts) {
      const outcome = await owner.start(
        opCtx(opts.workflowId, "start", "script.startWorkflow"),
        opts.workflowType,
        {
          workflowId: opts.workflowId,
          taskQueue: opts.taskQueue,
          args: opts.args as [unknown],
        },
      );
      if (outcome.kind !== "confirmed") {
        throw new TemporalScriptOutcomeError(
          outcome.kind,
          outcome.error,
          outcome.diagnostic,
          `startWorkflow ${outcome.kind}`,
        );
      }
      return { workflowId: outcome.value.workflowId };
    },
    async signalWorkflow(workflowId, signalDef, ...args) {
      const outcome = await owner.signal(
        opCtx(workflowId, "signal", "script.signalWorkflow"),
        getHandle(workflowId),
        signalDef as SignalDefinition<unknown[], string>,
        args,
      );
      if (outcome.kind !== "confirmed") {
        throw new TemporalScriptOutcomeError(
          outcome.kind,
          outcome.error,
          outcome.diagnostic,
          `signalWorkflow ${outcome.kind}`,
        );
      }
    },
    async queryWorkflow<T>(workflowId, queryDef, ...args) {
      const outcome = await owner.query(
        opCtx(workflowId, "query", "script.queryWorkflow"),
        getHandle(workflowId),
        queryDef as QueryDefinition<T, unknown[], string>,
        ...args,
      );
      if (outcome.kind !== "complete") {
        throw new TemporalScriptOutcomeError(
          outcome.kind,
          outcome.error,
          outcome.diagnostic,
          `queryWorkflow ${outcome.kind}`,
        );
      }
      return outcome.value as T;
    },
    async terminateWorkflow(workflowId, reason) {
      const outcome = await owner.terminate(
        opCtx(workflowId, "terminate", "script.terminateWorkflow"),
        getHandle(workflowId),
        reason ?? "script termination",
      );
      if (outcome.kind !== "confirmed") {
        throw new TemporalScriptOutcomeError(
          outcome.kind,
          outcome.error,
          outcome.diagnostic,
          `terminateWorkflow ${outcome.kind}`,
        );
      }
    },
    async listChangeWorkflowIds() {
      const probeWorkflowId = buildChangeWorkflowId(projectId, "probe");
      const query = `AdvAffectedProjects = "${escapeVisibilityValue(projectId)}"`;
      const outcome = await owner.list(
        opCtx(probeWorkflowId, "list", "script.listChangeWorkflowIds"),
        query,
        { limit: 1000 },
      );
      if (outcome.kind !== "complete") {
        throw new TemporalScriptOutcomeError(
          outcome.kind,
          outcome.error,
          outcome.diagnostic,
          `listChangeWorkflowIds ${outcome.kind}`,
        );
      }
      const prefix = `adv/change/${projectId}/`;
      const ids: string[] = [];
      for (const execution of outcome.value) {
        const workflowId = execution.workflowId;
        if (workflowId?.startsWith(prefix)) {
          const changeId = workflowId.slice(prefix.length);
          if (changeId) ids.push(changeId);
        }
      }
      return ids;
    },
  };
}

export interface TemporalScriptFacadeFactoryOptions {
  address?: string;
  namespace?: string;
  /**
   * Optional seam for injecting a custom facade creation strategy (tests or
   * callers that need to share a connection between projects).
   */
  createFacade?: (projectId: string) => Promise<TemporalScriptFacade>;
}

export interface TemporalScriptFacadeFactory {
  get(projectId: string): Promise<TemporalScriptFacade>;
  closeAll(): Promise<void>;
}

/**
 * Create a project-keyed factory of script facades. Each canonical project id
 * gets its own facade (and therefore its own owner/context), and facades are
 * cached until `closeAll()` is called. This lets scripts that operate across
 * many projects (e.g. cutover-receipt inventory) keep a single owner per
 * project identity without accepting arbitrary per-call project ids.
 */
export function createTemporalScriptFacadeFactory(
  options: TemporalScriptFacadeFactoryOptions,
): TemporalScriptFacadeFactory {
  const cache = new Map<string, TemporalScriptFacade>();
  const createFacade =
    options.createFacade ??
    ((projectId) =>
      createTemporalScriptFacade({
        projectId,
        address: options.address,
        namespace: options.namespace,
      }));
  return {
    async get(projectId) {
      if (!cache.has(projectId)) {
        cache.set(projectId, await createFacade(projectId));
      }
      return cache.get(projectId)!;
    },
    async closeAll() {
      for (const facade of cache.values()) {
        await facade.close();
      }
      cache.clear();
    },
  };
}

function escapeVisibilityValue(value: string): string {
  return value.replace(/(["\\])/g, "\\$1");
}
