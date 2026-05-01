import { resolve } from "path";

import { createLegacyStore, createStore } from "../storage/store";
import type { Store } from "../storage/store-types";
import { loadProjectConfig } from "../storage/json";
import { validateCrossRepoTarget } from "../temporal/activities";
import { getService } from "../temporal/service";
import { ensureProjectTemporalQueue } from "../plugin-init";
import { getExternalRoot, getProjectId } from "../utils/project-id";

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

export interface TargetStoreScope {
  context: TargetProjectContext;
  store: Store;
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
    externalRoot: getExternalRoot(projectId),
    trusted,
    trustSource: trusted ? "related_repos" : "explicit",
    stateMode: "disk-snapshot",
  };
}

async function closeStore(store: Store): Promise<void> {
  await store.close?.();
}

export async function withTargetPathStore<T>(
  input: WithTargetPathStoreInput,
  fn: (scope: TargetStoreScope) => Promise<T>,
): Promise<T> {
  const context = await resolveTargetProject({
    ...input,
    mutation: input.stateRequirement !== "snapshot-ok",
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
      await closeStore(store);
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
      await closeStore(store);
    }
  }

  await ensureProjectTemporalQueue(context.projectId);
  const temporalBundle = getService();
  if (!temporalBundle) {
    throw new TargetProjectError(
      `Temporal service layer not initialized; target_path mutations require a Temporal-backed target store: ${context.root}`,
    );
  }

  const store = await createStore(context.root, {
    externalRoot: context.externalRoot,
    projectIdOverride: context.projectId,
    temporalBundle,
  });
  try {
    await store.init();
    return await fn({ context: { ...context, stateMode: "temporal" }, store });
  } finally {
    await closeStore(store);
  }
}
