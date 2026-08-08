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
  acquireGitWorktreeProcessLease,
  GitWorktreeLegacyLockError,
  GitWorktreeLeaseResolutionError,
  migrateLegacyGitWorktreeLock,
  resolveGitWorktreeLeaseDir,
  type GitWorktreeProcessLeaseResult,
  GitWorktreeFlockUnsupportedError,
  GitWorktreeFlockQuiescenceError,
} from "../../utils/git-worktree-flock";
import {
  createWorktreeOperationContext,
  type WorktreeOperationContext,
} from "../../utils/worktree-operation";
import { stableStringify } from "../../utils/digest";
import { appendDebugLog } from "../../utils/debug-log";
import { isWorktreeInUse } from "./in-use";
import {
  LocalBranchIntegrationDeadline,
  proveLocalBranchIntegration,
} from "../../utils/branch-integration";
import type { WorktreeDeletionIntegrationFailure } from "./deletion-planner";

/** Dependency seams keep the destructive boundary testable without bypassing Git. */
export interface WorktreeDeletionExecutorDeps {
  /** Repository path selected by the caller; it must match the token exactly. */
  repository?: string;
  /** Test seam; production derives the lease directory from Git common-dir. */
  repositoryLeaseDir?: string;
  /** Current process CWD, supplied by the adapter rather than inferred in tests. */
  cwd?: string;
  hooks?: readonly string[];
  budgetMs?: number;
  operation?: WorktreeOperationContext;
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
  ) => Promise<
    | WorktreeDeletionIntegrationProof
    | WorktreeDeletionIntegrationFailure
    | undefined
  >;
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
  beforeRemove?: WorktreeBeforeRemoveStage;
  acquireLease?: (
    repositoryLeaseDir: string,
    options?: {
      signal?: AbortSignal;
      operation?: WorktreeOperationContext;
    },
  ) => Promise<GitWorktreeProcessLeaseResult | LegacyGitWorktreeLock>;
  /** Compatibility seam for direct tests; production leases terminate groups. */
  releaseLease?: (
    repositoryLeaseDir: string,
    ownerToken: string,
  ) => Promise<void>;
  runProcess?: (
    input: AbortableProcessInput,
  ) => Promise<AbortableProcessResult>;
  /** Runs only after Git and filesystem both prove the worktree is absent. */
  reconcileAfterDeletion?: WorktreeReconciliationStage;
}

export interface WorktreeDeletionExecutorInput {
  plan: WorktreeDeletionPlan;
  /** Explicit target identity; falls back to deps.repository, then plan.repository. */
  repository?: string;
  cwd?: string;
  hooks?: readonly string[];
  budgetMs?: number;
  now?: number;
  /** Shared operation supplied by a public delete owner. */
  operation?: WorktreeOperationContext;
}

export type WorktreeDeletionExecutorResult = WorktreeDeletionResult & {
  stage?: string;
  warning?: string;
};

export type WorktreeBeforeRemoveResult =
  | { ok: true; warning?: string }
  | { ok: false; status?: "busy" | "repair_required"; reason: string };

export const WORKTREE_BEFORE_REMOVE_STAGE = Symbol(
  "worktree-before-remove-stage",
);

export interface WorktreeBeforeRemoveInput {
  plan: WorktreeDeletionPlan;
  operation: WorktreeOperationContext;
  signal: AbortSignal;
}

export interface WorktreeBeforeRemoveStage {
  readonly [WORKTREE_BEFORE_REMOVE_STAGE]: true;
  readonly kind: "worktree-before-remove";
  readonly settled: Promise<void>;
  start(input: WorktreeBeforeRemoveInput): Promise<WorktreeBeforeRemoveResult>;
  cancel(reason: string): Promise<void>;
}

export const WORKTREE_RECONCILIATION_STAGE = Symbol(
  "worktree-reconciliation-stage",
);

export interface WorktreeReconciliationInput {
  plan: WorktreeDeletionPlan;
  census: GitWorkspaceFacts;
  operation: WorktreeOperationContext;
  signal: AbortSignal;
}

export interface WorktreeReconciliationStage {
  readonly [WORKTREE_RECONCILIATION_STAGE]: true;
  readonly kind: "worktree-reconciliation";
  readonly settled: Promise<void>;
  start(input: WorktreeReconciliationInput): Promise<void>;
  cancel(reason: string): Promise<void>;
}

/** Build the only accepted mutable pre-remove contract. */
export function createWorktreeBeforeRemoveStage(
  run: (
    input: WorktreeBeforeRemoveInput,
  ) => Promise<WorktreeBeforeRemoveResult>,
): WorktreeBeforeRemoveStage {
  let started = false;
  let cancelled = false;
  let resolveSettled!: () => void;
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });

  return {
    [WORKTREE_BEFORE_REMOVE_STAGE]: true,
    kind: "worktree-before-remove",
    settled,
    start(input) {
      if (started) return Promise.reject(new Error("beforeRemove reused"));
      started = true;
      if (cancelled) {
        return Promise.resolve({
          ok: false,
          status: "repair_required" as const,
          reason: "beforeRemove cancelled before start",
        });
      }
      const result = Promise.resolve().then(() => run(input));
      result.then(
        () => resolveSettled(),
        () => resolveSettled(),
      );
      return result;
    },
    async cancel(_reason) {
      cancelled = true;
      resolveSettled();
    },
  };
}

export function createWorktreeReconciliationStage(
  run: (input: WorktreeReconciliationInput) => Promise<void>,
): WorktreeReconciliationStage {
  let started = false;
  let cancelled = false;
  let resolveSettled!: () => void;
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });

  return {
    [WORKTREE_RECONCILIATION_STAGE]: true,
    kind: "worktree-reconciliation",
    settled,
    start(input) {
      if (started) return Promise.reject(new Error("reconciliation reused"));
      started = true;
      if (cancelled) return Promise.resolve();
      const result = Promise.resolve().then(() => run(input));
      result.then(resolveSettled, resolveSettled);
      return result;
    },
    async cancel(_reason) {
      cancelled = true;
      resolveSettled();
    },
  };
}

const DEFAULT_BUDGET_MS = 7_500;
const DEFAULT_RESPONSE_RESERVE_MS = 500;

type LegacyGitWorktreeLock =
  | {
      owned: true;
      ownerPid: number;
      workerId: string;
      ownerToken: string;
      lockPath: string;
    }
  | {
      owned: false;
      ownerPid: number;
      workerId?: string;
      lockPath: string;
      reason: "lock_held_by_alive_pid";
    };
type WorktreeLeaseResult =
  | GitWorktreeProcessLeaseResult
  | LegacyGitWorktreeLock;

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

async function settleLease(
  lock: WorktreeLeaseResult,
  repositoryLeaseDir: string,
  release?: WorktreeDeletionExecutorDeps["releaseLease"],
): Promise<void> {
  if (!lock.owned) return;
  if ("terminate" in lock) {
    await lock.terminate("operation_complete");
    lock.unregister?.();
    return;
  }
  if (release) await release(repositoryLeaseDir, lock.ownerToken);
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

    const ownsOperation =
      input.operation === undefined && this.deps.operation === undefined;
    const operation =
      input.operation ??
      this.deps.operation ??
      createWorktreeOperationContext({
        budgetMs: input.budgetMs ?? this.deps.budgetMs ?? DEFAULT_BUDGET_MS,
        responseReserveMs: DEFAULT_RESPONSE_RESERVE_MS,
        now,
      });
    let repositoryLeaseDir = this.deps.repositoryLeaseDir;
    const acquire = this.deps.acquireLease ?? acquireGitWorktreeProcessLease;
    const release = this.deps.releaseLease;
    let lock: WorktreeLeaseResult | undefined;
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
      if (remaining <= 0 || operation.signal.aborted) {
        await operation.abort("deadline");
        throw new WorktreeDeletionStageDeadline(stage);
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      const workPromise = Promise.resolve().then(work);
      const deadlinePromise = new Promise<T>((_resolve, reject) => {
        onAbort = () => reject(new WorktreeDeletionStageDeadline(stage));
        operation.signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(
          () => reject(new WorktreeDeletionStageDeadline(stage)),
          Math.max(1, remaining),
        );
        timer.unref?.();
      });
      try {
        return await Promise.race([workPromise, deadlinePromise]);
      } catch (error) {
        if (error instanceof WorktreeDeletionStageDeadline) {
          await operation.abort("deadline");
          if (operation.terminationError) throw operation.terminationError;
        }
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
        if (onAbort) operation.signal.removeEventListener("abort", onAbort);
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
        if (operation.terminationError) throw operation.terminationError;
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
        if (
          !currentProof ||
          ("classification" in currentProof &&
            currentProof.classification !== undefined) ||
          !sameProof(integration, currentProof)
        )
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
      if (!repositoryLeaseDir) {
        repositoryLeaseDir = await runBounded("lease", () =>
          resolveGitWorktreeLeaseDir(plan.repository),
        );
      }
      if (!repositoryLeaseDir)
        return failure(
          "repair_required",
          "git_common_dir_unavailable",
          "lease",
        );
      const activeRepositoryLeaseDir = repositoryLeaseDir;
      if (expiryDecision("lease")) return expiryDecision("lease")!;
      if (operation.remainingMs() <= operation.responseReserveMs)
        return failure("deadline_exceeded", "deadline_exceeded", "lease");
      operation.startStage("lease");
      try {
        lock = await runBounded("lease", () =>
          acquire(activeRepositoryLeaseDir, {
            signal: operation.signal,
            operation,
          }),
        );
      } catch (error) {
        operation.finishStage("lease");
        if (error instanceof GitWorktreeFlockUnsupportedError)
          return failure("unsupported", "kernel_flock_unavailable", "lease");
        if (operation.terminationError)
          return failure(
            "indeterminate",
            "operation_quiescence_failed",
            "lease",
          );
        if (
          operation.signal.aborted ||
          operation.remainingMs() <= operation.responseReserveMs
        )
          return failure("deadline_exceeded", "deadline_exceeded", "lease");
        return failure(
          "repair_required",
          "repository_lease_unavailable",
          "lease",
        );
      }
      if (
        operation.signal.aborted ||
        operation.remainingMs() <= operation.responseReserveMs
      ) {
        if (lock.owned) {
          try {
            await settleLease(lock, activeRepositoryLeaseDir, release);
          } catch {
            // The operation's terminationError is surfaced by the barrier;
            // cleanup must not replace that typed result with a rejection.
          }
        }
        await operation.abort("deadline");
        return failure("deadline_exceeded", "deadline_exceeded", "lease");
      }
      if (!lock.owned) {
        operation.finishStage("lease");
        return failure("busy", "repository_lease_held", "lease");
      }
      const migration = await runBounded("lease", () =>
        migrateLegacyGitWorktreeLock(plan.repository),
      );
      if (migration.removed) {
        // The migration is deliberately audited at the deletion boundary;
        // no startup/background path is allowed to mutate repository files.
        appendDebugLog(
          "worktree-delete",
          `migrated legacy repository lock ${migration.lockPath} to Git administrative lease state`,
        );
      }
      operation.finishStage("lease");

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
        if (
          this.deps.beforeRemove[WORKTREE_BEFORE_REMOVE_STAGE] !== true ||
          this.deps.beforeRemove.kind !== "worktree-before-remove"
        ) {
          return failure(
            "repair_required",
            "uncooperative_before_remove",
            "before_remove",
          );
        }
        const unregisterBeforeRemove = operation.registerChildLease({
          terminate: this.deps.beforeRemove.cancel,
        });
        operation.startStage("before_remove");
        let preRemove;
        try {
          preRemove = await runBounded("before_remove", () =>
            this.deps.beforeRemove!.start({
              plan,
              operation,
              signal: operation.signal,
            }),
          );
        } finally {
          unregisterBeforeRemove();
          operation.finishStage("before_remove");
        }
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

      // Post-delete census is read-only, so its late completion may be
      // abandoned after the shared abort barrier. It must never reach
      // reconciliation after a deadline response.
      let after: GitWorkspaceFacts | null;
      operation.startStage("post_delete_census");
      try {
        after = await runBounded("post_delete_census", () =>
          census(
            plan.repository,
            plan.integration?.defaultBranch ?? "HEAD",
            Math.max(1, operation.remainingMs()),
          ),
        );
      } catch (error) {
        if (error instanceof WorktreeDeletionStageDeadline) {
          return failure(
            "indeterminate",
            "post_delete_census_deadline_exceeded",
            "post_delete_census",
          );
        }
        throw error;
      } finally {
        operation.finishStage("post_delete_census");
      }
      if (!after)
        return failure(
          "indeterminate",
          "post_delete_census_unavailable",
          "post_delete_census",
        );
      const remaining = currentWorktree(after, plan);
      let stillOnDisk = false;
      try {
        stillOnDisk = await runBounded("post_delete_census", () =>
          exists(plan.facts.worktree),
        );
      } catch (error) {
        if (error instanceof WorktreeDeletionStageDeadline) {
          return failure(
            "indeterminate",
            "post_delete_census_deadline_exceeded",
            "post_delete_census",
          );
        }
        throw error;
      }
      if (remaining || stillOnDisk)
        return failure(
          "indeterminate",
          "git_removal_not_confirmed",
          "post_delete_census",
        );

      let warning: string | undefined;
      if (this.deps.reconcileAfterDeletion) {
        if (
          this.deps.reconcileAfterDeletion[WORKTREE_RECONCILIATION_STAGE] !==
            true ||
          this.deps.reconcileAfterDeletion.kind !== "worktree-reconciliation"
        ) {
          return failure(
            "indeterminate",
            "uncooperative_reconciliation",
            "reconcile",
          );
        }
        const unregisterReconciliation = operation.registerChildLease({
          terminate: this.deps.reconcileAfterDeletion.cancel,
        });
        operation.startStage("reconcile");
        try {
          await runBounded("reconcile", () =>
            this.deps.reconcileAfterDeletion!.start({
              plan,
              census: after,
              operation,
              signal: operation.signal,
            }),
          );
        } catch (error) {
          if (operation.terminationError) {
            return failure(
              "indeterminate",
              "operation_quiescence_failed",
              "reconcile",
            );
          }
          if (error instanceof WorktreeDeletionStageDeadline) {
            warning =
              "reconciliation deadline exceeded after confirmed Git removal";
          } else {
            warning = `reconciliation failed after confirmed removal: ${error instanceof Error ? error.message : String(error)}`;
          }
        } finally {
          unregisterReconciliation();
          operation.finishStage("reconcile");
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
      if (operation.terminationError) {
        return failure(
          "indeterminate",
          "operation_quiescence_failed",
          operation.currentStage,
        );
      }
      if (error instanceof WorktreeDeletionStageDeadline)
        return failure("deadline_exceeded", error.message, error.stage);
      if (
        operation.signal.aborted ||
        operation.remainingMs() <= operation.responseReserveMs
      )
        return failure(
          "deadline_exceeded",
          "deadline_exceeded",
          operation.currentStage,
        );
      if (error instanceof LocalBranchIntegrationDeadline)
        return failure(
          "deadline_exceeded",
          error.message,
          operation.currentStage,
        );
      if (
        error instanceof GitWorktreeFlockUnsupportedError ||
        error instanceof GitWorktreeFlockQuiescenceError ||
        (error instanceof Error && /unsupported.*platform/i.test(error.message))
      )
        return failure("unsupported", error.message, operation.currentStage);
      if (error instanceof GitWorktreeLegacyLockError) {
        return {
          ...failure(
            "repair_required",
            `legacy_lock_${error.failure}`,
            "lease",
          ),
          warning: error.message,
        };
      }
      if (error instanceof GitWorktreeLeaseResolutionError) {
        return {
          ...failure("repair_required", "git_common_dir_unavailable", "lease"),
          warning: error.message,
        };
      }
      return failure(
        "indeterminate",
        error instanceof Error ? error.message : String(error),
        operation.currentStage,
      );
    } finally {
      if (ownsOperation) {
        await operation.abort("operation_complete");
        operation.dispose();
      }
      if (lock?.owned && repositoryLeaseDir) {
        try {
          await settleLease(lock, repositoryLeaseDir, release);
        } catch {
          // A barrier failure is already represented by terminationError.
        }
      }
    }
  }
}

export async function executeWorktreeDeletion(
  input: WorktreeDeletionExecutorInput,
  deps: WorktreeDeletionExecutorDeps = {},
): Promise<WorktreeDeletionExecutorResult> {
  return new WorktreeDeletionExecutor(deps).execute(input);
}
