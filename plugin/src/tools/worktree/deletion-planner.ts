import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  encodeWorktreeDeletionToken,
  WorktreeDeletionPlanSchema,
  type WorktreeDeletionFacts,
  WorktreeDeletionArchiveRecoverySchema,
  type WorktreeDeletionArchiveRecovery,
  type WorktreeDeletionIntegrationProof,
  type WorktreeDeletionPlan,
  type WorktreeDeletionTerminalProof,
} from "./deletion-contracts";
import {
  scanGitWorkspaceFacts,
  type GitWorkspaceFacts,
  type GitWorktreeFact,
} from "./census";
import { isWorktreeInUse } from "./in-use";
import {
  createWorktreeOperationContext,
  type WorktreeOperationContext,
  type WorktreeStageTiming,
} from "../../utils/worktree-operation";
import { getDefaultBranch } from "../../utils/git";
import { isValidGitBranchRef } from "../../utils/git-ref";
import {
  proveLocalBranchIntegration,
  type LocalBranchIntegrationProof,
} from "../../utils/branch-integration";
import { getExternalRootForProject } from "../../utils/project-id";
import { stableStringify } from "../../utils/digest";

/** A plan is intentionally short-lived and self-contained. */
export const WORKTREE_DELETION_PLAN_TTL_MS = 5 * 60_000;

const SHA_RE = /^[0-9a-f]{4,64}$/i;

export type WorktreeDeletionRefusalReason =
  | "target_not_found"
  | "worktree_not_found"
  | "branch_not_found"
  | "main_worktree"
  | "detached_head"
  | "dirty_worktree"
  | "cwd_in_worktree"
  | "worktree_in_use"
  | "git_locked"
  | "git_prunable"
  | "git_corrupt"
  | "bare_worktree"
  | "branch_not_merged"
  | "pr_evidence_invalid"
  | "pr_not_found"
  | "pr_not_merged"
  | "local_commits_after_pr_head"
  | "pr_merge_commit_unreachable"
  | "integration_proof_unavailable"
  | "invalid_ref"
  | "terminal_proof_required"
  | "archive_recovery_invalid";

export type WorktreeDeletionRepairReason =
  | "target_resolution_failed"
  | "census_unavailable"
  | "malformed_census"
  | "terminal_state_corrupt"
  | "integration_proof_unavailable";

export type WorktreeDeletionIntegrationFailure =
  | {
      ok: false;
      classification: "refusal";
      reason: Extract<
        WorktreeDeletionRefusalReason,
        | "pr_evidence_invalid"
        | "pr_not_found"
        | "pr_not_merged"
        | "local_commits_after_pr_head"
        | "pr_merge_commit_unreachable"
        | "integration_proof_unavailable"
      >;
      message: string;
    }
  | {
      ok: false;
      classification: "repair";
      reason: "integration_proof_unavailable";
      message: string;
    };

export type WorktreeDeletionUnsupportedReason =
  | "process_use_detection_unsupported"
  | "unsupported_target";

export interface WorktreeDeletionRegistryEntry {
  branch: string;
  path?: string;
  changeId?: string;
}

export interface WorktreeDeletionPlannerInput {
  repository: string;
  projectId?: string;
  branch?: string;
  changeId?: string;
  cwd?: string;
  defaultBranch?: string;
  registry?: readonly WorktreeDeletionRegistryEntry[];
  /** Explicit approval to include a dirty worktree in the deletion plan. */
  force?: boolean;
  /** Archive-owned proof supplied only by the archive completion owner. */
  archiveRecovery?: WorktreeDeletionArchiveRecovery;
  /** Test/operator override for the five-minute token clock. */
  now?: number;
  budgetMs?: number;
  /** Shared operation supplied by a public delete owner. */
  operation?: WorktreeOperationContext;
}

export interface WorktreeDeletionTarget {
  repository: string;
  cwd: string;
  /** Set by a caller that already knows the target is the main checkout. */
  mainWorktree?: boolean;
  /** Derived only; no store is opened and the path is not read by resolution. */
  statePath?: string;
}

export interface WorktreeDeletionPlannerDeps {
  targetResolver?: (
    input: WorktreeDeletionPlannerInput,
    operation: WorktreeOperationContext,
  ) => Promise<WorktreeDeletionTarget> | WorktreeDeletionTarget;
  census?: (
    repository: string,
    defaultBranch: string,
    timeoutMs: number,
  ) => Promise<GitWorkspaceFacts>;
  terminalProof?: (
    changeId: string,
    target: WorktreeDeletionTarget,
    operation: WorktreeOperationContext,
  ) => Promise<WorktreeDeletionTerminalProof | undefined>;
  integrationProof?: (
    branch: string,
    head: string,
    defaultBranch: string,
    repository: string,
    operation: WorktreeOperationContext,
  ) => Promise<
    | WorktreeDeletionIntegrationProof
    | WorktreeDeletionIntegrationFailure
    | undefined
  >;
  statePathResolver?: (
    repository: string,
    changeId: string,
  ) => Promise<string | undefined>;
  isWorktreeInUse?: (worktreePath: string) => boolean;
  platform?: NodeJS.Platform;
  /** Deliberately unused seam: proves planning never initializes a full store. */
  initializeStore?: () => Promise<unknown>;
  operationNow?: () => number;
}

export interface WorktreeDeletionPlanSuccess {
  kind: "planned";
  plan: WorktreeDeletionPlan;
  target: WorktreeDeletionTarget;
  warnings: string[];
  stageTimings: readonly WorktreeStageTiming[];
}

export interface WorktreeDeletionPlanRefusal {
  kind: "refused";
  reason: WorktreeDeletionRefusalReason;
  message: string;
  facts?: WorktreeDeletionFacts;
  target?: WorktreeDeletionTarget;
  warnings?: string[];
  stageTimings: readonly WorktreeStageTiming[];
}

export interface WorktreeDeletionPlanDeadline {
  kind: "deadline";
  stage: string;
  message: string;
  target?: WorktreeDeletionTarget;
  stageTimings: readonly WorktreeStageTiming[];
}

export interface WorktreeDeletionPlanRepair {
  kind: "repair";
  reason: WorktreeDeletionRepairReason;
  message: string;
  target?: WorktreeDeletionTarget;
  stageTimings: readonly WorktreeStageTiming[];
}

export interface WorktreeDeletionPlanUnsupported {
  kind: "unsupported";
  reason: WorktreeDeletionUnsupportedReason;
  message: string;
  target?: WorktreeDeletionTarget;
  stageTimings: readonly WorktreeStageTiming[];
}

export type WorktreeDeletionPlanResult =
  | WorktreeDeletionPlanSuccess
  | WorktreeDeletionPlanRefusal
  | WorktreeDeletionPlanDeadline
  | WorktreeDeletionPlanRepair
  | WorktreeDeletionPlanUnsupported;

function inferChangeId(
  input: WorktreeDeletionPlannerInput,
  branch: string,
): string | undefined {
  if (input.changeId) return input.changeId;
  return branch.startsWith("change/")
    ? branch.slice("change/".length)
    : undefined;
}

function inside(parent: string, child: string): boolean {
  const parentPath = resolve(parent).replace(/\/$/, "");
  const childPath = resolve(child);
  return childPath === parentPath || childPath.startsWith(`${parentPath}/`);
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|deadline|abort/i.test(message);
}

function validCensus(census: GitWorkspaceFacts): boolean {
  if (
    !census ||
    !Array.isArray(census.branches) ||
    !Array.isArray(census.worktrees)
  )
    return false;
  return census.worktrees.every((worktree) => {
    return (
      typeof worktree.path === "string" &&
      worktree.path.length > 0 &&
      (worktree.branch === undefined || typeof worktree.branch === "string") &&
      typeof worktree.headSha === "string" &&
      SHA_RE.test(worktree.headSha) &&
      typeof worktree.dirty === "boolean" &&
      typeof worktree.detached === "boolean" &&
      typeof worktree.bare === "boolean" &&
      typeof worktree.locked === "boolean" &&
      typeof worktree.prunable === "boolean"
    );
  });
}

function validArchiveRecovery(
  recovery: WorktreeDeletionArchiveRecovery,
  facts: WorktreeDeletionFacts,
  branch: string,
  changeId: string | undefined,
  integration: WorktreeDeletionIntegrationProof,
  terminal: WorktreeDeletionTerminalProof | undefined,
): boolean {
  if (!WorktreeDeletionArchiveRecoverySchema.safeParse(recovery).success)
    return false;
  if (
    recovery.repository !== facts.repository ||
    recovery.worktree !== facts.worktree ||
    recovery.branch !== branch ||
    recovery.localHead !== facts.head ||
    recovery.changeId !== changeId ||
    branch !== `change/${recovery.changeId}` ||
    recovery.prNumber !== integration.prNumber ||
    recovery.prHeadOid !== integration.prHeadOid ||
    recovery.mergeCommitOid !== integration.mergeCommitOid ||
    recovery.prRepository !== integration.headRepository ||
    recovery.prRepository !== integration.baseRepository ||
    recovery.defaultBranch !== integration.defaultBranch ||
    stableStringify(recovery.terminal) !== stableStringify(terminal) ||
    recovery.clean !== !facts.dirty ||
    recovery.locked !== facts.locked ||
    recovery.cwd !== facts.cwd ||
    recovery.cwdInsideWorktree !== facts.cwdInsideWorktree ||
    recovery.inUse !== facts.inUse
  )
    return false;
  if (
    recovery.allowedRoot !== `.adv/archive/${recovery.bundleId}` ||
    recovery.canonicalBundlePath.split(/[\\/]/).pop() !== recovery.bundleId
  )
    return false;
  const canonicalPaths = new Set(
    recovery.canonicalFiles.map((file) => file.path),
  );
  if (canonicalPaths.size !== recovery.canonicalFiles.length) return false;
  const changedPaths = new Set<string>();
  for (const entry of recovery.changedPaths) {
    if (changedPaths.has(entry.path) || !canonicalPaths.has(entry.path))
      return false;
    changedPaths.add(entry.path);
  }
  return recovery.canonicalFiles.every((file) => {
    const absolute = resolve(recovery.worktree, file.path);
    const root = resolve(recovery.worktree, recovery.allowedRoot);
    return absolute === root || absolute.startsWith(`${root}/`);
  });
}

function refusal(
  reason: WorktreeDeletionRefusalReason,
  message: string,
  operation: WorktreeOperationContext,
  extra: Omit<
    WorktreeDeletionPlanRefusal,
    "kind" | "reason" | "message" | "stageTimings"
  > = {},
): WorktreeDeletionPlanRefusal {
  return {
    kind: "refused",
    reason,
    message,
    ...extra,
    stageTimings: operation.stageTimings,
  };
}

async function readLightweightTerminalProof(
  changeId: string,
  target: WorktreeDeletionTarget,
): Promise<WorktreeDeletionTerminalProof | undefined> {
  if (!target.statePath) return undefined;
  try {
    const parsed = JSON.parse(await readFile(target.statePath, "utf8")) as {
      status?: unknown;
    };
    if (parsed.status !== "archived" && parsed.status !== "closed")
      return undefined;
    return {
      changeId,
      status: parsed.status,
      evidence: `lightweight terminal read: ${target.statePath}`,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

/**
 * Git-authoritative, side-effect-free deletion planner.
 *
 * The planner never opens ADV's Store, writes registry/plan state, invokes
 * migration, or mutates Git. Destructive adapters consume its self-contained
 * token in a later task and revalidate every bound fact under their lease.
 */
export class WorktreeDeletionPlanner {
  private readonly deps: WorktreeDeletionPlannerDeps;

  constructor(deps: WorktreeDeletionPlannerDeps = {}) {
    this.deps = deps;
  }

  async plan(
    input: WorktreeDeletionPlannerInput,
  ): Promise<WorktreeDeletionPlanResult> {
    const now = input.now ?? this.deps.operationNow?.() ?? Date.now();
    const ownsOperation = input.operation === undefined;
    const operation =
      input.operation ??
      createWorktreeOperationContext({
        now,
        budgetMs: input.budgetMs,
      });
    const runWithDeadline = async <T>(work: () => Promise<T>): Promise<T> => {
      const remaining = operation.remainingMs();
      if (remaining <= 0) throw new Error("planning deadline exceeded");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Planning is read-only. This race bounds an uncooperative internal
        // reader while the shared operation still guards every later mutation.
        return await Promise.race([
          work(),
          new Promise<T>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error("planning deadline exceeded")),
              remaining,
            );
            timer.unref?.();
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    const platform = this.deps.platform ?? process.platform;

    try {
      if (platform !== "linux") {
        return {
          kind: "unsupported",
          reason: "process_use_detection_unsupported",
          message: `Local process-use detection is unsupported on ${platform}.`,
          stageTimings: operation.stageTimings,
        };
      }

      operation.startStage("target_resolution");
      let target: WorktreeDeletionTarget;
      try {
        target = await runWithDeadline(() =>
          Promise.resolve(
            this.deps.targetResolver?.(input, operation) ??
              this.defaultTarget(input),
          ),
        );
      } catch (error) {
        if (isTimeoutError(error) || operation.remainingMs() <= 0) {
          return this.deadline(operation, "target_resolution", error);
        }
        return {
          kind: "repair",
          reason: "target_resolution_failed",
          message: error instanceof Error ? error.message : String(error),
          stageTimings: operation.stageTimings,
        };
      } finally {
        operation.finishStage("target_resolution");
      }
      if (operation.remainingMs() <= 0)
        return this.deadline(operation, "target_resolution");

      const branch =
        input.branch ??
        (input.changeId ? `change/${input.changeId}` : undefined);
      if (!branch) {
        return refusal(
          "target_not_found",
          "A branch or changeId is required.",
          operation,
          { target },
        );
      }
      if (!isValidGitBranchRef(branch)) {
        return refusal(
          "invalid_ref",
          "The requested branch is not a valid local Git branch name.",
          operation,
          { target },
        );
      }
      const defaultBranch =
        input.defaultBranch ?? (await getDefaultBranch(target.repository));
      if (!isValidGitBranchRef(defaultBranch)) {
        return refusal(
          "invalid_ref",
          "The default branch is not a valid local Git branch name.",
          operation,
          { target },
        );
      }

      operation.startStage("git_census");
      let census: GitWorkspaceFacts;
      try {
        census = await (this.deps.census?.(
          target.repository,
          defaultBranch,
          Math.max(1, operation.remainingMs()),
        ) ??
          scanGitWorkspaceFacts(
            target.repository,
            defaultBranch,
            Math.max(1, operation.remainingMs()),
          ));
      } catch (error) {
        if (isTimeoutError(error) || operation.remainingMs() <= 0) {
          return this.deadline(operation, "git_census", error, target);
        }
        return {
          kind: "repair",
          reason: "census_unavailable",
          message: error instanceof Error ? error.message : String(error),
          target,
          stageTimings: operation.stageTimings,
        };
      } finally {
        operation.finishStage("git_census");
      }
      if (!validCensus(census)) {
        return {
          kind: "repair",
          reason: "malformed_census",
          message: "Git census returned malformed worktree facts.",
          target,
          stageTimings: operation.stageTimings,
        };
      }
      if (operation.remainingMs() <= 0)
        return this.deadline(operation, "git_census", undefined, target);

      const candidate = census.worktrees.find(
        (worktree) => worktree.branch === branch,
      );
      if (!candidate) {
        return refusal(
          "worktree_not_found",
          `Git census contains no worktree for ${branch}.`,
          operation,
          { target },
        );
      }
      const branchFact = census.branches.find((item) => item.branch === branch);
      if (!branchFact) {
        return refusal(
          "branch_not_found",
          `Git census contains no local branch for ${branch}.`,
          operation,
          { target },
        );
      }
      const candidateWithExtra = candidate as GitWorktreeFact & {
        corrupt?: boolean;
        mainWorktree?: boolean;
      };
      const mainWorktree =
        target.mainWorktree === true ||
        candidateWithExtra.mainWorktree === true ||
        census.worktrees[0]?.path === candidate.path ||
        resolve(candidate.path) === resolve(target.repository);
      const cwdInsideWorktree = inside(candidate.path, target.cwd);
      const inUse =
        this.deps.isWorktreeInUse?.(candidate.path) ??
        isWorktreeInUse(candidate.path);
      const facts: WorktreeDeletionFacts = {
        repository: target.repository,
        worktree: candidate.path,
        branch: candidate.branch ?? null,
        head: candidate.headSha,
        detached: candidate.detached,
        bare: candidate.bare,
        locked: candidate.locked,
        prunable: candidate.prunable,
        dirty: candidate.dirty,
        mainWorktree,
        cwd: target.cwd,
        cwdInsideWorktree,
        inUse,
        gitCorrupt: candidateWithExtra.corrupt === true,
      };

      if (mainWorktree)
        return refusal(
          "main_worktree",
          "The Git main worktree is never deletable.",
          operation,
          { facts, target },
        );
      if (candidate.detached)
        return refusal(
          "detached_head",
          "Detached worktrees have no branch identity.",
          operation,
          { facts, target },
        );
      if (candidate.bare)
        return refusal(
          "bare_worktree",
          "Bare Git repositories are not worktrees.",
          operation,
          { facts, target },
        );
      if (candidate.dirty && input.force !== true)
        return refusal(
          "dirty_worktree",
          "The worktree contains uncommitted changes; replan with force:true only with explicit approval.",
          operation,
          { facts, target },
        );
      if (cwdInsideWorktree)
        return refusal(
          "cwd_in_worktree",
          "The current process CWD is inside the target worktree.",
          operation,
          { facts, target },
        );
      if (inUse)
        return refusal(
          "worktree_in_use",
          "A local process uses the target worktree.",
          operation,
          { facts, target },
        );
      if (candidate.locked)
        return refusal(
          "git_locked",
          "Git marks the worktree locked.",
          operation,
          { facts, target },
        );
      if (candidate.prunable)
        return refusal(
          "git_prunable",
          "Git marks the worktree administrative data prunable.",
          operation,
          { facts, target },
        );
      if (candidateWithExtra.corrupt === true)
        return refusal(
          "git_corrupt",
          "Git reported corrupt worktree data.",
          operation,
          { facts, target },
        );
      operation.startStage("integration_proof");
      let integration: WorktreeDeletionIntegrationProof | undefined;
      try {
        const integrationResult = await (this.deps.integrationProof
          ? runWithDeadline(() =>
              this.deps.integrationProof!(
                branch,
                candidate.headSha,
                defaultBranch,
                target.repository,
                operation,
              ),
            )
          : branchFact.merged
            ? {
                kind: "merged_to_default" as const,
                branch,
                defaultBranch,
                head: candidate.headSha,
                evidence: `git branch --merged ${defaultBranch}`,
              }
            : ((await proveLocalBranchIntegration(
                branch,
                candidate.headSha,
                defaultBranch,
                target.repository,
                operation,
              )) as LocalBranchIntegrationProof | undefined));
        if (integrationResult && "classification" in integrationResult) {
          if (integrationResult.classification === "repair") {
            return {
              kind: "repair",
              reason: integrationResult.reason,
              message: integrationResult.message,
              target,
              stageTimings: operation.stageTimings,
            };
          }
          return refusal(
            integrationResult.reason,
            integrationResult.message,
            operation,
            { facts, target },
          );
        }
        integration = integrationResult as
          | WorktreeDeletionIntegrationProof
          | undefined;
      } catch (error) {
        if (isTimeoutError(error) || operation.remainingMs() <= 0)
          return this.deadline(operation, "integration_proof", error, target);
        return {
          kind: "repair",
          reason: "census_unavailable",
          message: error instanceof Error ? error.message : String(error),
          target,
          stageTimings: operation.stageTimings,
        };
      } finally {
        operation.finishStage("integration_proof");
      }
      if (!integration)
        return refusal(
          "branch_not_merged",
          "Integration proof was not provided.",
          operation,
          { facts, target },
        );

      const registryEntry = input.registry?.find(
        (entry) => entry.branch === branch,
      );
      const warnings = registryEntry ? [] : ["registry_absent"];
      const changeId = inferChangeId(input, branch) ?? registryEntry?.changeId;
      let terminal: WorktreeDeletionTerminalProof | undefined;
      if (changeId) {
        operation.startStage("terminal_ownership_proof");
        try {
          terminal = await (this.deps.terminalProof
            ? runWithDeadline(() =>
                this.deps.terminalProof!(changeId, target, operation),
              )
            : runWithDeadline(() =>
                readLightweightTerminalProof(changeId, target),
              ));
        } catch (error) {
          if (isTimeoutError(error) || operation.remainingMs() <= 0)
            return this.deadline(
              operation,
              "terminal_ownership_proof",
              error,
              target,
            );
          return {
            kind: "repair",
            reason: "terminal_state_corrupt",
            message: error instanceof Error ? error.message : String(error),
            target,
            stageTimings: operation.stageTimings,
          };
        } finally {
          operation.finishStage("terminal_ownership_proof");
        }
        if (!terminal)
          return refusal(
            "terminal_proof_required",
            `Terminal proof is required for ${branch}.`,
            operation,
            { facts, target, warnings },
          );

        if (input.archiveRecovery) {
          if (
            input.force === true ||
            facts.dirty ||
            integration.kind !== "pr_merged" ||
            !validArchiveRecovery(
              input.archiveRecovery,
              facts,
              branch,
              changeId,
              integration,
              terminal,
            )
          )
            return refusal(
              "archive_recovery_invalid",
              "Archive-owned recovery proof does not match the exact worktree, PR, or terminal facts.",
              operation,
              { facts, target, warnings },
            );
        }
      }

      if (operation.remainingMs() <= 0)
        return this.deadline(
          operation,
          operation.currentStage ?? "plan",
          undefined,
          target,
        );
      const expiresAt = now + WORKTREE_DELETION_PLAN_TTL_MS;
      const token = encodeWorktreeDeletionToken({
        facts,
        expiresAt,
        force: input.force === true,
        integration,
        ...(terminal ? { terminal } : {}),
        removalMode: input.archiveRecovery
          ? "archive_owned_projection"
          : "normal",
        ...(input.archiveRecovery
          ? { archiveRecovery: input.archiveRecovery }
          : {}),
      });
      const plan = WorktreeDeletionPlanSchema.parse({
        version: "wdp1",
        repository: target.repository,
        facts,
        force: input.force === true,
        expiresAt,
        token,
        integration,
        ...(terminal ? { terminal } : {}),
        removalMode: input.archiveRecovery
          ? "archive_owned_projection"
          : "normal",
        ...(input.archiveRecovery
          ? { archiveRecovery: input.archiveRecovery }
          : {}),
      });
      return {
        kind: "planned",
        plan,
        target,
        warnings,
        stageTimings: operation.stageTimings,
      };
    } finally {
      if (ownsOperation) {
        await operation.abort("planning_complete");
        operation.dispose();
      }
    }
  }

  private async defaultTarget(
    input: WorktreeDeletionPlannerInput,
  ): Promise<WorktreeDeletionTarget> {
    const repository = resolve(input.repository);
    const statePath = input.changeId
      ? await this.deriveStatePath(repository, input.changeId, input.projectId)
      : undefined;
    return {
      repository,
      cwd: resolve(input.cwd ?? process.cwd()),
      statePath,
    };
  }

  /**
   * Derive the canonical state path without constructing a Store. Reading the
   * path is deferred to the terminal-proof stage, and no migration is run.
   */
  private async deriveStatePath(
    repository: string,
    changeId: string,
    projectId?: string,
  ): Promise<string | undefined> {
    if (this.deps.statePathResolver) {
      return this.deps.statePathResolver(repository, changeId);
    }
    if (!projectId) {
      return join(repository, ".adv", "changes", changeId, "change.json");
    }
    return join(
      getExternalRootForProject(projectId),
      "changes",
      changeId,
      "change.json",
    );
  }

  private deadline(
    operation: WorktreeOperationContext,
    stage: string,
    error?: unknown,
    target?: WorktreeDeletionTarget,
  ): WorktreeDeletionPlanDeadline {
    return {
      kind: "deadline",
      stage,
      message:
        error instanceof Error
          ? error.message
          : `Deletion planning deadline exceeded during ${stage}.`,
      target,
      stageTimings: operation.stageTimings,
    };
  }
}

export function createWorktreeDeletionPlanner(
  deps: WorktreeDeletionPlannerDeps = {},
): WorktreeDeletionPlanner {
  return new WorktreeDeletionPlanner(deps);
}
