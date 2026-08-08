import { resolve } from "path";
import { z } from "zod";

import { createStore } from "../storage/store";
import type { Store } from "../storage/store-types";
import { loadProjectConfig } from "../storage/json";
import { stat } from "fs/promises";
import {
  getExternalRoot,
  getExternalRootForProject,
  getProjectId,
} from "../utils/project-id";
import type { WorktreeOperationContext } from "../utils/worktree-operation";

export type TargetStateRequirement =
  | "snapshot-ok"
  | "authoritative"
  | "scaffold";

export type TargetProjectStateMode =
  | "current"
  | "disk-snapshot"
  | "authoritative"
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

export interface ResolveTargetProjectInput {
  currentProjectPath: string;
  target_path?: string;
  mutation?: boolean;
  target_confirmed?: boolean;
  confirmationEvidence?: string;
  operation?: WorktreeOperationContext;
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

/** Validate a target before opening its disk-backed store. */
export async function validateCrossRepoTarget(
  target_path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let stats;
  try {
    stats = await stat(target_path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      ok: false,
      error:
        code === "ENOENT"
          ? `target_path does not exist: ${target_path}`
          : `target_path stat failed (${code ?? "unknown"}): ${(err as Error).message}`,
    };
  }
  if (!stats.isDirectory()) {
    return {
      ok: false,
      error: `target_path is not a directory: ${target_path}`,
    };
  }
  try {
    await stat(resolve(target_path, ".git"));
  } catch {
    return {
      ok: false,
      error: `target_path is not a git repo (no .git entry): ${target_path}`,
    };
  }
  return { ok: true };
}

export async function resolveTargetProject(
  input: ResolveTargetProjectInput,
): Promise<TargetProjectContext> {
  input.operation?.throwIfAborted("target_resolution_aborted");
  const currentRoot = resolve(input.currentProjectPath);
  const targetRoot = input.target_path
    ? resolve(input.target_path)
    : currentRoot;
  const isCurrentProject = targetRoot === currentRoot;

  const validation = await validateCrossRepoTarget(targetRoot);
  input.operation?.throwIfAborted("target_resolution_aborted");
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

export async function withTargetPathStore<T>(
  input: WithTargetPathStoreInput,
  fn: (scope: TargetStoreScope) => Promise<T>,
): Promise<T> {
  const context = await resolveTargetProject({
    ...input,
    // Store selection is controlled by stateRequirement; this override only
    // controls the target trust gate.
    mutation: input.mutation ?? input.stateRequirement !== "snapshot-ok",
  });

  // All state requirements use the same disk store. Only snapshot reads skip
  // initialization; the state mode remains visible to the caller.
  const store = await createStore(context.root, {
    externalRoot: context.externalRoot,
  });
  try {
    input.operation?.throwIfAborted("target_store_aborted");
    if (input.stateRequirement !== "snapshot-ok") await store.init();
    const stateMode =
      input.stateRequirement === "snapshot-ok"
        ? "disk-snapshot"
        : input.stateRequirement;
    return await fn({ context: { ...context, stateMode }, store });
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
      "Non-authoritative disk snapshot: target state was read from disk.";
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
