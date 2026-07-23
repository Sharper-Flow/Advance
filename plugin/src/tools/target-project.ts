import { resolve } from "path";
import { z } from "zod";

import { createLegacyStore, createStore } from "../storage/store";
import type { Store } from "../storage/store-types";
import { loadProjectConfig } from "../storage/json";
import { validateCrossRepoTarget } from "../temporal/activities";
import { buildProjectTaskQueue } from "../temporal/client";
import {
  classifyQueueServiceability,
  probeTaskQueuePollers,
  type LocalOwnership,
  type QueueServiceability,
} from "../temporal/queue-serviceability";
import { getService } from "../temporal/service";
import {
  ensureProjectTemporalQueue,
  getTemporalWorkerDiagnostics,
  getTemporalWorkerRole,
  type TemporalWorkerDiagnostics,
} from "../plugin-init";
import {
  statusDiagnosticsIncludeQueue,
  statusDiagnosticsShowAliveQueue,
} from "./status-health";
import {
  getExternalRoot,
  getExternalRootForProject,
  getProjectId,
} from "../utils/project-id";

export type TargetStateRequirement =
  | "snapshot-ok"
  | "temporal-required"
  | "scaffold";

export type TargetProjectStateMode =
  | "current"
  | "disk-snapshot"
  | "temporal"
  | "scaffold";

export interface TargetProjectContext {
  root: string;
  projectId: string;
  externalRoot: string;
  trusted: boolean;
  trustSource: "current_project" | "related_repos" | "explicit";
  stateMode: TargetProjectStateMode;
}

export class TargetProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetProjectError";
  }
}

export const TARGET_MUTATION_FRESH_POLLER_MS = 60_000;

export interface ResolveTargetProjectInput {
  currentProjectPath: string;
  target_path?: string;
  mutation?: boolean;
  target_confirmed?: boolean;
  confirmationEvidence?: string;
}

export interface WithTargetPathStoreInput extends ResolveTargetProjectInput {
  target_path: string;
  stateRequirement: TargetStateRequirement;
}

export const targetPathSchema = z.object({
  target_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute path to another ADV project. When provided, routes the operation through that project's target store.",
    ),
  target_confirmed: z
    .literal(true)
    .optional()
    .describe(
      "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
    ),
  confirmationEvidence: z
    .string()
    .optional()
    .describe(
      "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
    ),
});

export interface TargetStoreScope {
  context: TargetProjectContext;
  store: Store;
}

export interface TargetProjectOutputContext {
  root: string;
  projectId: string;
  trusted: boolean;
  trustSource: TargetProjectContext["trustSource"];
  stateMode: TargetProjectContext["stateMode"];
  // rq-targetReadAuthority01.1: disk-snapshot context carries an explicit authority marker
  authority?: "disk_snapshot_non_authoritative";
  warning?: string;
}

function hasConfirmation(input: ResolveTargetProjectInput): boolean {
  return Boolean(
    input.target_confirmed && input.confirmationEvidence?.trim().length,
  );
}

async function isRelatedRepo(input: {
  currentProjectPath: string;
  targetPath: string;
}): Promise<boolean> {
  const config = await loadProjectConfig(input.currentProjectPath);
  const related = config?.related_repos ?? [];
  const target = resolve(input.targetPath);
  return related.some((repo) => resolve(repo.path) === target);
}

export async function resolveTargetProject(
  input: ResolveTargetProjectInput,
): Promise<TargetProjectContext> {
  const currentRoot = resolve(input.currentProjectPath);
  const targetRoot = input.target_path
    ? resolve(input.target_path)
    : currentRoot;
  const isCurrentProject = targetRoot === currentRoot;

  const validation = await validateCrossRepoTarget(targetRoot);
  if (!validation.ok) {
    throw new TargetProjectError(validation.error);
  }

  const projectId = await getProjectId(targetRoot);
  if (!projectId) {
    throw new TargetProjectError(
      `projectId could not be resolved for target_path: ${targetRoot}`,
    );
  }

  if (isCurrentProject) {
    return {
      root: targetRoot,
      projectId,
      externalRoot: getExternalRoot(projectId),
      trusted: true,
      trustSource: "current_project",
      stateMode: "current",
    };
  }

  const trusted = await isRelatedRepo({
    currentProjectPath: currentRoot,
    targetPath: targetRoot,
  });

  if (input.mutation && !trusted && !hasConfirmation(input)) {
    throw new TargetProjectError(
      `Untrusted target_path mutation requires target_confirmed: true and confirmationEvidence before changing target state: ${targetRoot}`,
    );
  }

  return {
    root: targetRoot,
    projectId,
    externalRoot: getExternalRootForProject(projectId),
    trusted,
    trustSource: trusted ? "related_repos" : "explicit",
    stateMode: "disk-snapshot",
  };
}

function closeStore(store: Store): void {
  store.close?.();
}

function targetMutationLocalOwnership(): LocalOwnership {
  const role = getTemporalWorkerRole();
  if (role === "host") return "owned";
  if (role === "client") return "peer";
  return "unknown";
}

interface LocalQueueEvidence {
  registered: boolean;
  alive: boolean;
  ownership: LocalOwnership;
  diagnostics: TemporalWorkerDiagnostics[];
}

/**
 * Per-queue local evidence for mutation readiness. Raw registration lists do
 * not filter failed queues, and aggregate worker aliveness can be satisfied
 * by an unrelated queue, so only per-queue diagnostics are conservative
 * enough to admit a target-path mutation. This mirrors the evidence model
 * status/diagnostics use for queue serviceability.
 */
function deriveLocalQueueEvidence(expectedQueue: string): LocalQueueEvidence {
  const diagnostics = getTemporalWorkerDiagnostics();
  return {
    registered: statusDiagnosticsIncludeQueue(diagnostics, expectedQueue),
    alive: statusDiagnosticsShowAliveQueue(diagnostics, expectedQueue),
    ownership: targetMutationLocalOwnership(),
    diagnostics,
  };
}

function formatTargetMutationReadinessError(
  serviceability: QueueServiceability,
): string {
  const blockers = serviceability.blockers.length
    ? serviceability.blockers.join(", ")
    : "unknown";
  return [
    `Target project Temporal queue is not serviceable for target_path mutation: ${serviceability.expectedQueue}`,
    `status=${serviceability.status}`,
    `confidence=${serviceability.confidence}`,
    `blockers=${blockers}`,
    "remediation=open or restart the target project ADV worker, then retry the target_path mutation",
  ].join("; ");
}

// rq-targetWorkerLifecycle01: ensure target project Temporal task queue is serviceable before mutation.
export async function ensureTargetMutationQueueReady(input: {
  projectId: string;
  temporalBundle: NonNullable<ReturnType<typeof getService>>;
  freshPollerMs?: number;
}): Promise<QueueServiceability> {
  const expectedQueue = buildProjectTaskQueue(input.projectId);

  // Local worker registration is the primary readiness signal: try to
  // register the target queue on this process's worker before consulting
  // server-side evidence.
  let local = deriveLocalQueueEvidence(expectedQueue);
  if (!local.registered) {
    try {
      await ensureProjectTemporalQueue(input.projectId);
      local = deriveLocalQueueEvidence(expectedQueue);
    } catch {
      // Local registration is not the only valid readiness signal. A
      // client-only process may safely submit target mutations when another
      // worker is freshly polling the target queue.
    }
  }

  const localServiceability = classifyQueueServiceability({
    projectId: input.projectId,
    expectedQueue,
    localRegistered: local.registered,
    localWorkerAlive: local.alive,
    localOwnership: local.ownership,
    workerDiagnostics: local.diagnostics,
    serverPollerProbe: { status: "unavailable", lastAccessMs: null },
    staleRunningWorkflowCount: 0,
    staleQueueProbe: "unavailable",
  });
  if (localServiceability.status === "serviceable") return localServiceability;

  // Bounded fresh server poller evidence is conservative admission evidence
  // only: it admits the mutation without proving local worker liveness.
  const serverPollerProbe = await probeTaskQueuePollers({
    connection: input.temporalBundle.connection as Parameters<
      typeof probeTaskQueuePollers
    >[0]["connection"],
    namespace: input.temporalBundle.namespace,
    taskQueue: expectedQueue,
    freshPollerMs: input.freshPollerMs ?? TARGET_MUTATION_FRESH_POLLER_MS,
  });
  const serviceability = classifyQueueServiceability({
    projectId: input.projectId,
    expectedQueue,
    localRegistered: local.registered,
    localWorkerAlive: local.alive,
    localOwnership: local.ownership,
    workerDiagnostics: local.diagnostics,
    serverPollerProbe,
    staleRunningWorkflowCount: 0,
    staleQueueProbe: "ok",
  });

  if (serviceability.status === "serviceable") return serviceability;
  throw new TargetProjectError(
    formatTargetMutationReadinessError(serviceability),
  );
}

export async function withTargetPathStore<T>(
  input: WithTargetPathStoreInput,
  fn: (scope: TargetStoreScope) => Promise<T>,
): Promise<T> {
  const context = await resolveTargetProject({
    ...input,
    // Store selection is controlled by stateRequirement; this override only
    // controls the target trust gate. Dry-run callers may need a Temporal-backed
    // read while remaining non-mutating.
    mutation: input.mutation ?? input.stateRequirement !== "snapshot-ok",
  });

  if (input.stateRequirement === "snapshot-ok") {
    // rq-targetReadAuthority01.2: snapshot-ok reads must not mutate target worker lifecycle or state.
    const store = await createLegacyStore(context.root, {
      externalRoot: context.externalRoot,
    });
    try {
      return await fn({
        context: { ...context, stateMode: "disk-snapshot" },
        store,
      });
    } finally {
      closeStore(store);
    }
  }

  if (input.stateRequirement === "scaffold") {
    const store = await createLegacyStore(context.root, {
      externalRoot: context.externalRoot,
    });
    try {
      await store.init();
      return await fn({
        context: { ...context, stateMode: "scaffold" },
        store,
      });
    } finally {
      closeStore(store);
    }
  }

  // rq-targetReadAuthority01.3: authoritative target mutation requires the temporal-required path.
  const temporalBundle = getService();
  if (!temporalBundle) {
    throw new TargetProjectError(
      `Temporal service layer not initialized; target_path mutations require a Temporal-backed target store: ${context.root}`,
    );
  }

  await ensureTargetMutationQueueReady({
    projectId: context.projectId,
    temporalBundle,
    freshPollerMs: TARGET_MUTATION_FRESH_POLLER_MS,
  });

  const store = await createStore(context.root, {
    externalRoot: context.externalRoot,
    projectIdOverride: context.projectId,
    temporalBundle,
  });
  try {
    await store.init();
    return await fn({ context: { ...context, stateMode: "temporal" }, store });
  } finally {
    closeStore(store);
  }
}

export function formatTargetProjectContext(
  context: TargetProjectContext,
): TargetProjectOutputContext {
  // rq-targetReadAuthority01: snapshot-ok target reads mark context as non-authoritative.
  const base: TargetProjectOutputContext = {
    root: context.root,
    projectId: context.projectId,
    trusted: context.trusted,
    trustSource: context.trustSource,
    stateMode: context.stateMode,
  };

  if (context.stateMode === "disk-snapshot") {
    const nonAuthoritativeWarning =
      "Non-authoritative disk snapshot: Temporal-backed target state was not consulted.";
    const untrustedWarning = context.trusted
      ? undefined
      : "Read-only untrusted target_path snapshot. Mutations require explicit target confirmation.";
    return {
      ...base,
      authority: "disk_snapshot_non_authoritative",
      warning: untrustedWarning
        ? `${nonAuthoritativeWarning} ${untrustedWarning}`
        : nonAuthoritativeWarning,
    };
  }

  if (!context.trusted) {
    return {
      ...base,
      warning:
        "Read-only untrusted target_path snapshot. Mutations require explicit target confirmation.",
    };
  }

  return base;
}

export function appendTargetProjectContextOutput(
  output: string,
  context: TargetProjectContext,
): string {
  const parsed = JSON.parse(output) as Record<string, unknown>;
  parsed._projectContext = formatTargetProjectContext(context);
  return JSON.stringify(parsed);
}

export function resolveTargetAwareMutationCwd(input: {
  store: Pick<Store, "paths">;
  target_path?: string;
}): string {
  return input.target_path ? input.store.paths.root : process.cwd();
}

export const epicOwnerTargetPathSchema = {
  epic_owner_target_path: targetPathSchema.shape.target_path.describe(
    "Optional absolute path to the Epic owner ADV project. When provided, resolves the Epic in that project instead of the current one.",
  ),
  epic_owner_target_confirmed: targetPathSchema.shape.target_confirmed.describe(
    "Required for untrusted epic_owner_target_path mutation. Confirms the Epic owner project was explicitly approved.",
  ),
  epic_owner_confirmationEvidence:
    targetPathSchema.shape.confirmationEvidence.describe(
      "Required with epic_owner_target_confirmed for untrusted epic_owner_target_path mutation. Cite user approval evidence.",
    ),
};

export const EPIC_OWNER_ROUTING_ERROR_CODES = {
  OWNER_ROUTING_REQUIRED: "OWNER_ROUTING_REQUIRED",
  CHILD_ROUTING_REQUIRED: "CHILD_ROUTING_REQUIRED",
  OWNER_ROUTING_AMBIGUOUS: "OWNER_ROUTING_AMBIGUOUS",
  OWNER_CHILD_ROUTING_UNSUPPORTED: "OWNER_CHILD_ROUTING_UNSUPPORTED",
  CHILD_PROJECTION_FAILED: "CHILD_PROJECTION_FAILED",
  MEMBERSHIP_PARTIAL_FAILURE: "MEMBERSHIP_PARTIAL_FAILURE",
} as const;

export class EpicOwnerRoutingError extends TargetProjectError {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EpicOwnerRoutingError";
    this.code = code;
  }
}

export function appendEpicRoutingContexts(
  output: string,
  contexts: {
    ownerContext?: TargetProjectContext | null;
    childContext?: TargetProjectContext | null;
  },
): string {
  const parsed = JSON.parse(output) as Record<string, unknown>;
  if (contexts.ownerContext) {
    parsed._epicOwnerProjectContext = formatTargetProjectContext(
      contexts.ownerContext,
    );
  }
  if (contexts.childContext) {
    parsed._childProjectContext = formatTargetProjectContext(
      contexts.childContext,
    );
  }
  return JSON.stringify(parsed);
}

export function formatEpicOwnerRoutingError(input: {
  code: string;
  error: string;
  ownerContext?: TargetProjectContext | null;
  childContext?: TargetProjectContext | null;
}): string {
  const parsed: Record<string, unknown> = {
    error: input.error,
    code: input.code,
  };
  if (input.ownerContext) {
    parsed._epicOwnerProjectContext = formatTargetProjectContext(
      input.ownerContext,
    );
  }
  if (input.childContext) {
    parsed._childProjectContext = formatTargetProjectContext(
      input.childContext,
    );
  }
  return JSON.stringify(parsed);
}

export async function withOptionalTargetPathStore<T>(
  input: { store: Store; target_path?: string },
  fn: (store: Store, projectContext?: TargetProjectOutputContext) => Promise<T>,
): Promise<T> {
  if (!input.target_path) {
    return fn(input.store);
  }

  return withTargetPathStore(
    {
      currentProjectPath: input.store.paths.root,
      target_path: input.target_path,
      stateRequirement: "snapshot-ok",
    },
    async ({ context, store }) =>
      fn(store, formatTargetProjectContext(context)),
  );
}
