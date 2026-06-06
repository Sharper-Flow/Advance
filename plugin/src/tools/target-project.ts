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
  type QueueServiceability,
} from "../temporal/queue-serviceability";
import { getService } from "../temporal/service";
import {
  ensureProjectTemporalQueue,
  getRegisteredTemporalWorkerQueues,
  getTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics,
  getTemporalWorkerRole,
} from "../plugin-init";
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

function targetMutationLocalOwnership(): "owned" | "peer" | "unknown" {
  const role = getTemporalWorkerRole();
  if (role === "host") return "owned";
  if (role === "client") return "peer";
  return "unknown";
}

function localQueueServiceability(input: {
  projectId: string;
  expectedQueue: string;
}): QueueServiceability {
  return classifyQueueServiceability({
    projectId: input.projectId,
    expectedQueue: input.expectedQueue,
    localRegistered: true,
    localWorkerAlive: true,
    localOwnership: "owned",
    workerDiagnostics: getTemporalWorkerDiagnostics(),
    serverPollerProbe: { status: "unavailable", lastAccessMs: null },
    staleRunningWorkflowCount: 0,
    staleQueueProbe: "unavailable",
  });
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
    `poller=${serviceability.evidence.serverPollerProbe}`,
    `blockers=${blockers}`,
    "action=open or restart the target project ADV worker, then retry the target_path mutation",
  ].join("; ");
}

export async function ensureTargetMutationQueueReady(input: {
  projectId: string;
  temporalBundle: NonNullable<ReturnType<typeof getService>>;
  freshPollerMs?: number;
}): Promise<QueueServiceability> {
  const expectedQueue = buildProjectTaskQueue(input.projectId);
  if (getRegisteredTemporalWorkerQueues().includes(expectedQueue)) {
    return localQueueServiceability({
      projectId: input.projectId,
      expectedQueue,
    });
  }

  try {
    await ensureProjectTemporalQueue(input.projectId);
    return localQueueServiceability({
      projectId: input.projectId,
      expectedQueue,
    });
  } catch {
    // Local registration is not the only valid readiness signal. A client-only
    // process may safely submit target mutations when another worker is freshly
    // polling the target queue.
  }

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
    localRegistered:
      getRegisteredTemporalWorkerQueues().includes(expectedQueue),
    localWorkerAlive: getTemporalWorkerAliveness(),
    localOwnership: targetMutationLocalOwnership(),
    workerDiagnostics: getTemporalWorkerDiagnostics(),
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
  return {
    root: context.root,
    projectId: context.projectId,
    trusted: context.trusted,
    trustSource: context.trustSource,
    stateMode: context.stateMode,
    ...(context.trusted
      ? {}
      : {
          warning:
            "Read-only untrusted target_path snapshot. Mutations require explicit target confirmation.",
        }),
  };
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
