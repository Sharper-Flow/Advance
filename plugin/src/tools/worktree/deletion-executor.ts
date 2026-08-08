import { access } from "node:fs/promises";
import { resolve } from "node:path";

import {
  decodeWorktreeDeletionToken,
  WorktreeDeletionPlanSchema,
  type WorktreeDeletionFacts,
  type WorktreeDeletionIntegrationProof,
  type WorktreeDeletionPlan,
  type WorktreeDeletionResult,
  type WorktreeDeletionTerminalProof,
} from "./deletion-contracts";
import {
  scanGitWorkspaceFacts,
  type GitWorkspaceFacts,
  type GitWorktreeFact,
} from "./census";
import { runAbortableProcess } from "../../utils/process-runner";
import type {
  AbortableProcessInput,
  AbortableProcessResult,
} from "../../utils/process-runner";
import { resolveGitBinary } from "../../utils/git-binary";
import {
  acquireGitWorktreeFlock,
  releaseGitWorktreeFlock,
} from "../../utils/git-worktree-flock";
import {
  createWorktreeOperationContext,
  type WorktreeOperationContext,
} from "../../utils/worktree-operation";
import { stableStringify } from "../../utils/digest";
import { isWorktreeInUse } from "./in-use";
import {
  LocalBranchIntegrationDeadline,
  proveLocalBranchIntegration,
} from "../../utils/branch-integration";

/** Dependency seams keep the destructive boundary testable without bypassing Git. */
export interface WorktreeDeletionExecutorDeps {
  /** Repository path selected by the caller; it must match the token exactly. */
  repository?: string;
  /** Directory containing the repository owner-token lock. */
  repositoryLeaseDir?: string;
  /** Current process CWD, supplied by the adapter rather than inferred in tests. */
  cwd?: string;
  hooks?: readonly string[];
  budgetMs?: number;
  now?: () => number;
  platform?: NodeJS.Platform;
  census?: (
    repository: string,
    defaultBranch: string,
    timeoutMs: number,
  ) => Promise<GitWorkspaceFacts>;
  isWorktreeInUse?: (worktreePath: string) => boolean;
  integrationProof?: (
    branch: string,
    head: string,
    defaultBranch: string,
    repository: string,
    operation: WorktreeOperationContext,
  ) => Promise<WorktreeDeletionIntegrationProof | undefined>;
  terminalProof?: (
    changeId: string,
    repository: string,
    operation: WorktreeOperationContext,
  ) => Promise<WorktreeDeletionTerminalProof | undefined>;
  /**
   * Lifecycle-specific cleanup that must complete after safety revalidation
   * and before Git removal. The worktree planner/executor remains the only
   * destructive authority; adapters may only provide this bounded pre-remove
   * hook for adjacent ownership cleanup (for example OpenCode workspaces).
   */
  beforeRemove?: (input: {
    plan: WorktreeDeletionPlan;
    operation: WorktreeOperationContext;
  }) => Promise<
    | { ok: true; warning?: string }
    | { ok: false; status?: "busy" | "repair_required"; reason: string }
  >;
  acquireLease?: (
    repositoryLeaseDir: string,
  ) => ReturnType<typeof acquireGitWorktreeFlock>;
  releaseLease?: typeof releaseGitWorktreeFlock;
  runProcess?: (
    input: AbortableProcessInput,
  ) => Promise<AbortableProcessResult>;
  /** Runs only after Git and filesystem both prove the worktree is absent. */
  reconcileAfterDeletion?: (input: {
    plan: WorktreeDeletionPlan;
    census: GitWorkspaceFacts;
    operation: WorktreeOperationContext;
  }) => Promise<void>;
}

export interface WorktreeDeletionExecutorInput {
  plan: WorktreeDeletionPlan;
  /** Explicit target identity; falls back to deps.repository, then plan.repository. */
  repository?: string;
  cwd?: string;
  hooks?: readonly string[];
  budgetMs?: number;
  now?: number;
}

export type WorktreeDeletionExecutorResult = WorktreeDeletionResult & {
  stage?: string;
  warning?: string;
};

const DEFAULT_BUDGET_MS = 7_500;
const DEFAULT_RESPONSE_RESERVE_MS = 500;

class WorktreeDeletionStageDeadline extends Error {
  constructor(readonly stage: string) {
    super(`${stage} exceeded the deletion operation budget`);
    this.name = "WorktreeDeletionStageDeadline";
  }
}

function failure(
  status: Extract<WorktreeDeletionExecutorResult["status"], string>,
  reason: string,
  stage?: string,
): WorktreeDeletionExecutorResult {
  return {
    ok: false,
    status: status as never,
    reason,
    ...(stage ? { stage } : {}),
  } as WorktreeDeletionExecutorResult;
}

function isTimeout(result: AbortableProcessResult): boolean {
  return result.timedOut || result.aborted;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return false;
    throw error;
  }
}

async function identity(path: string): Promise<string> {
  try {
    // realpath makes a symlinked repository a different target from the plan.
    const { realpath } = await import("node:fs/promises");
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

function currentWorktree(
  census: GitWorkspaceFacts,
  plan: WorktreeDeletionPlan,
): GitWorktreeFact | undefined {
  return census.worktrees.find(
    (item) =>
      resolve(item.path) === resolve(plan.facts.worktree) ||
      item.branch === plan.facts.branch,
  );
}

function factsFromCensus(
  census: GitWorkspaceFacts,
  candidate: GitWorktreeFact,
  repository: string,
  cwd: string,
  isInUse: boolean,
): WorktreeDeletionFacts {
  const first = census.worktrees[0];
  const mainWorktree =
    resolve(candidate.path) === resolve(repository) ||
    (first !== undefined && resolve(first.path) === resolve(candidate.path));
  return {
    repository,
    worktree: candidate.path,
    branch: candidate.branch ?? null,
    head: candidate.headSha,
    detached: candidate.detached,
    bare: candidate.bare,
    locked: candidate.locked,
    prunable: candidate.prunable,
    dirty: candidate.dirty,
    mainWorktree,
    cwd,
    cwdInsideWorktree:
      resolve(cwd) === resolve(candidate.path) ||
      resolve(cwd).startsWith(`${resolve(candidate.path)}/`),
    inUse: isInUse,
    gitCorrupt: candidate.corrupt === true,
  };
}

function sameFacts(
  expected: WorktreeDeletionFacts,
  actual: WorktreeDeletionFacts,
): boolean {
  return stableStringify(expected) === stableStringify(actual);
}

function sameProof(
  expected: WorktreeDeletionIntegrationProof | undefined,
  actual: WorktreeDeletionIntegrationProof | undefined,
): boolean {
  return stableStringify(expected) === stableStringify(actual);
}

function safeToRemove(
  facts: WorktreeDeletionFacts,
  allowDirty = false,
): boolean {
  return (
    facts.mainWorktree !== true &&
    facts.detached === false &&
    facts.bare === false &&
    facts.locked === false &&
    facts.prunable === false &&
    (allowDirty || facts.dirty === false) &&
    facts.cwdInsideWorktree === false &&
    facts.inUse === false &&
    facts.gitCorrupt !== true
  );
}

export class WorktreeDeletionExecutor {
  private readonly deps: WorktreeDeletionExecutorDeps;

  constructor(deps: WorktreeDeletionExecutorDeps = {}) {
    this.deps = deps;
  }

  async execute(
    input: WorktreeDeletionExecutorInput,
  ): Promise<WorktreeDeletionExecutorResult> {
    const parsed = WorktreeDeletionPlanSchema.safeParse(input.plan);
    if (!parsed.success) return failure("refused", "invalid_plan");
    const plan = parsed.data;
    const now = input.now ?? this.deps.now?.() ?? Date.now();
    const clock = this.deps.now ?? Date.now;
    let payload: ReturnType<typeof decodeWorktreeDeletionToken>;
    try {
      payload = decodeWorktreeDeletionToken(plan.token);
    } catch {
      return failure("refused", "malformed_wdp1_token");
    }
    if (now >= plan.expiresAt || now >= payload.expiresAt)
      return failure("refused", "expired_plan", "token_validation");

    const targetRepository =
      input.repository ?? this.deps.repository ?? plan.repository;
    if ((this.deps.platform ?? process.platform) !== "linux")
      return failure(
        "unsupported",
        "destructive_worktree_delete_requires_linux",
      );
    if (
      (await identity(targetRepository)) !== (await identity(plan.repository))
    )
      return failure(
        "drifted",
        "repository_identity_changed",
        "target_validation",
      );

    const operation = createWorktreeOperationContext({
      budgetMs: input.budgetMs ?? this.deps.budgetMs ?? DEFAULT_BUDGET_MS,
      responseReserveMs: DEFAULT_RESPONSE_RESERVE_MS,
      now,
    });
    const repositoryLeaseDir =
      this.deps.repositoryLeaseDir ?? resolve(plan.repository, ".adv");
    const acquire = this.deps.acquireLease ?? acquireGitWorktreeFlock;
    const release = this.deps.releaseLease ?? releaseGitWorktreeFlock;
    let lock: Awaited<ReturnType<typeof acquireGitWorktreeFlock>> | undefined;
    const cwd = input.cwd ?? this.deps.cwd ?? plan.facts.cwd ?? process.cwd();
    const census = this.deps.census ?? scanGitWorkspaceFacts;
    const runProcess = this.deps.runProcess ?? runAbortableProcess;
    const hooks = input.hooks ?? this.deps.hooks ?? [];

    const expiryDecision = (
      stage: string,
    ): WorktreeDeletionExecutorResult | null =>
      clock() >= plan.expiresAt
        ? failure("drifted", "plan_expired_during_apply", stage)
        : null;

    const runBounded = async <T>(
      stage: string,
      work: () => Promise<T>,
    ): Promise<T> => {
      const remaining = operation.remainingMs() - operation.responseReserveMs;
      if (remaining <= 0) throw new WorktreeDeletionStageDeadline(stage);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          work(),
          new Promise<T>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new WorktreeDeletionStageDeadline(stage)),
              Math.max(1, remaining),
            );
            timer.unref?.();
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const runCensus = async (
      stage: string,
    ): Promise<GitWorkspaceFacts | null> => {
      if (operation.remainingMs() <= operation.responseReserveMs) return null;
      operation.startStage(stage);
      try {
        return await runBounded(stage, () =>
          census(
            plan.repository,
            plan.integration?.defaultBranch ?? "HEAD",
            Math.max(1, operation.remainingMs() - operation.responseReserveMs),
          ),
        );
      } catch (error) {
        if (error instanceof WorktreeDeletionStageDeadline) throw error;
        return null;
      } finally {
        operation.finishStage(stage);
      }
    };

    const evaluate = async (
      current: GitWorkspaceFacts,
      stage: string,
    ): Promise<WorktreeDeletionExecutorResult | null> => {
      const candidate = currentWorktree(current, plan);
      const onDisk = await exists(plan.facts.worktree);
      if (!candidate && !onDisk)
        return failure("already_absent", "git_and_filesystem_absent", stage);
      if (!candidate || !onDisk)
        return failure("repair_required", "git_and_filesystem_disagree", stage);
      const inUse =
        this.deps.isWorktreeInUse?.(candidate.path) ??
        isWorktreeInUse(candidate.path);
      const actual = factsFromCensus(
        current,
        candidate,
        plan.repository,
        cwd,
        inUse,
      );
      if (!sameFacts(plan.facts, actual))
        return failure("drifted", "bound_safety_fact_changed", stage);
      if (!safeToRemove(actual, plan.force === true))
        return failure("refused", "unsafe_worktree_state", stage);

      const branchFact = current.branches.find(
        (item) => item.branch === plan.facts.branch,
      );
      const integration = plan.integration;
      if (
        !branchFact ||
        !integration ||
        branchFact.headSha !== integration.head
      )
        return failure("drifted", "integration_fact_changed", stage);
      if (this.deps.integrationProof) {
        const currentProof = await runBounded(stage, () =>
          this.deps.integrationProof!(
            plan.facts.branch ?? "",
            actual.head,
            integration.defaultBranch,
            plan.repository,
            operation,
          ),
        );
        if (!sameProof(integration, currentProof))
          return failure("drifted", "integration_proof_changed", stage);
      } else if (branchFact.merged) {
        if (integration.kind !== "merged_to_default")
          return failure("drifted", "integration_proof_changed", stage);
      } else {
        const currentProof = await runBounded(stage, () =>
          proveLocalBranchIntegration(
            plan.facts.branch ?? "",
            actual.head,
            integration.defaultBranch,
            plan.repository,
            operation,
          ),
        );
        if (!sameProof(integration, currentProof))
          return failure("drifted", "integration_proof_changed", stage);
      }
      if (plan.terminal && !this.deps.terminalProof)
        return failure(
          "repair_required",
          "terminal_proof_recheck_unavailable",
          stage,
        );
      if (plan.terminal && this.deps.terminalProof) {
        const terminal = await runBounded(stage, () =>
          this.deps.terminalProof!(
            plan.terminal!.changeId,
            plan.repository,
            operation,
          ),
        );
        if (stableStringify(plan.terminal) !== stableStringify(terminal))
          return failure("drifted", "terminal_proof_changed", stage);
      }
      return null;
    };

    try {
      if (expiryDecision("lease")) return expiryDecision("lease")!;
      if (operation.remainingMs() <= operation.responseReserveMs)
        return failure("deadline_exceeded", "deadline_exceeded", "lease");
      operation.startStage("lease");
      const leasePromise = Promise.resolve(acquire(repositoryLeaseDir));
      let leaseTimer: ReturnType<typeof setTimeout> | undefined;
      type LeaseResult = Awaited<ReturnType<typeof acquireGitWorktreeFlock>>;
      const leaseResult = await new Promise<
        | { kind: "acquired"; lock: LeaseResult }
        | { kind: "failed" }
        | { kind: "deadline" }
      >((resolveLease) => {
        leaseTimer = setTimeout(
          () => resolveLease({ kind: "deadline" }),
          Math.max(1, operation.remainingMs() - operation.responseReserveMs),
        );
        leaseTimer.unref?.();
        leasePromise.then(
          (acquired) => resolveLease({ kind: "acquired", lock: acquired }),
          () => resolveLease({ kind: "failed" }),
        );
      });
      if (leaseTimer) clearTimeout(leaseTimer);
      if (leaseResult.kind === "deadline") {
        void leasePromise.then(async (lateLease) => {
          if (lateLease.owned)
            await release(repositoryLeaseDir, lateLease.ownerToken);
        });
        await operation.abort("deadline");
        return failure("deadline_exceeded", "deadline_exceeded", "lease");
      }
      if (leaseResult.kind === "failed")
        return failure(
          "repair_required",
          "repository_lease_unavailable",
          "lease",
        );
      lock = leaseResult.lock;
      operation.finishStage("lease");
      if (!lock.owned) return failure("busy", "repository_lease_held", "lease");

      const initialExpiry = expiryDecision("census");
      if (initialExpiry) return initialExpiry;
      const before = await runCensus("census");
      if (!before)
        return failure(
          "deadline_exceeded",
          "census_deadline_exceeded",
          "census",
        );
      const beforeDecision = await evaluate(before, "census");
      if (beforeDecision) return beforeDecision;

      let beforeRemoveWarning: string | undefined;
      if (this.deps.beforeRemove) {
        const preRemove = await runBounded("before_remove", () =>
          this.deps.beforeRemove!({ plan, operation }),
        );
        if (!preRemove.ok)
          return failure(
            preRemove.status ?? "repair_required",
            preRemove.reason,
            "before_remove",
          );
        beforeRemoveWarning = preRemove.warning;
      }

      for (const command of hooks) {
        const hookExpiry = expiryDecision("preDelete_hook");
        if (hookExpiry) return hookExpiry;
        if (operation.remainingMs() <= operation.responseReserveMs) {
          await operation.abort("deadline");
          return failure(
            "deadline_exceeded",
            "deadline_exceeded",
            "preDelete_hook",
          );
        }
        operation.startStage("preDelete_hook");
        const hookResult = await runBounded("preDelete_hook", () =>
          runProcess({
            command: "/bin/sh",
            args: ["-c", command],
            cwd: plan.facts.worktree,
            signal: operation.signal,
            timeoutMs: Math.max(
              1,
              operation.remainingMs() - operation.responseReserveMs,
            ),
            destructiveSubtree: true,
            operation,
          }),
        );
        operation.finishStage("preDelete_hook");
        if (
          isTimeout(hookResult) ||
          operation.remainingMs() <= operation.responseReserveMs
        ) {
          await operation.abort("deadline");
          return failure(
            "deadline_exceeded",
            "preDelete_hook_deadline_exceeded",
            "preDelete_hook",
          );
        }
        if (!hookResult.closed || hookResult.exitCode !== 0)
          return failure("refused", "preDelete_hook_failed", "preDelete_hook");
      }

      const postHookExpiry = expiryDecision("post_hook_census");
      if (postHookExpiry) return postHookExpiry;
      const afterHooks = await runCensus("post_hook_census");
      if (!afterHooks)
        return failure(
          "deadline_exceeded",
          "post_hook_census_deadline_exceeded",
          "post_hook_census",
        );
      const hookDecision = await evaluate(afterHooks, "post_hook_census");
      if (hookDecision) return hookDecision;

      const removeExpiry = expiryDecision("remove");
      if (removeExpiry) return removeExpiry;
      if (operation.remainingMs() <= operation.responseReserveMs) {
        await operation.abort("deadline");
        return failure("deadline_exceeded", "deadline_exceeded", "remove");
      }
      operation.startStage("remove");
      const removeResult = await runBounded("remove", () =>
        runProcess({
          command: resolveGitBinary(),
          args: [
            "worktree",
            "remove",
            ...(plan.force === true ? ["--force"] : []),
            "--",
            plan.facts.worktree,
          ],
          cwd: plan.repository,
          signal: operation.signal,
          timeoutMs: Math.max(
            1,
            operation.remainingMs() - operation.responseReserveMs,
          ),
          destructiveSubtree: true,
          operation,
        }),
      );
      operation.finishStage("remove");
      if (
        isTimeout(removeResult) ||
        operation.remainingMs() <= operation.responseReserveMs
      ) {
        await operation.abort("deadline");
        return failure(
          "deadline_exceeded",
          "remove_deadline_exceeded",
          "remove",
        );
      }
      if (!removeResult.closed || removeResult.exitCode !== 0)
        return failure("indeterminate", "git_worktree_remove_failed", "remove");

      const postDeleteExpiry = expiryDecision("post_delete_census");
      if (postDeleteExpiry) return postDeleteExpiry;
      const after = await runCensus("post_delete_census");
      if (!after)
        return failure(
          "indeterminate",
          "post_delete_census_unavailable",
          "post_delete_census",
        );
      const remaining = currentWorktree(after, plan);
      if (remaining || (await exists(plan.facts.worktree)))
        return failure(
          "indeterminate",
          "git_removal_not_confirmed",
          "post_delete_census",
        );

      let warning: string | undefined;
      if (this.deps.reconcileAfterDeletion) {
        try {
          await this.deps.reconcileAfterDeletion({
            plan,
            census: after,
            operation,
          });
        } catch (error) {
          warning = `reconciliation failed after confirmed removal: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      return {
        ok: true,
        status: "deleted",
        repository: plan.repository,
        worktree: plan.facts.worktree,
        ...(warning || beforeRemoveWarning
          ? {
              warning: [beforeRemoveWarning, warning]
                .filter(Boolean)
                .join("; "),
            }
          : {}),
      };
    } catch (error) {
      if (
        operation.signal.aborted ||
        operation.remainingMs() <= operation.responseReserveMs
      )
        return failure(
          "deadline_exceeded",
          "deadline_exceeded",
          operation.currentStage,
        );
      if (error instanceof WorktreeDeletionStageDeadline)
        return failure("deadline_exceeded", error.message, error.stage);
      if (error instanceof LocalBranchIntegrationDeadline)
        return failure(
          "deadline_exceeded",
          error.message,
          operation.currentStage,
        );
      if (
        error instanceof Error &&
        /unsupported.*platform/i.test(error.message)
      )
        return failure("unsupported", error.message, operation.currentStage);
      return failure(
        "indeterminate",
        error instanceof Error ? error.message : String(error),
        operation.currentStage,
      );
    } finally {
      await operation.abort("operation_complete");
      operation.dispose();
      if (lock?.owned) await release(repositoryLeaseDir, lock.ownerToken);
    }
  }
}

export async function executeWorktreeDeletion(
  input: WorktreeDeletionExecutorInput,
  deps: WorktreeDeletionExecutorDeps = {},
): Promise<WorktreeDeletionExecutorResult> {
  return new WorktreeDeletionExecutor(deps).execute(input);
}

/** Names used by adapters during the convergence task; all share one executor. */
export const applyWorktreeDeletion = executeWorktreeDeletion;
export const executeDeletion = executeWorktreeDeletion;
