import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import {
  decodeWorktreeDeletionToken,
  WorktreeDeletionPlanSchema,
  type WorktreeDeletionFacts,
  type WorktreeDeletionIntegrationProof,
  type WorktreeDeletionPlan,
  type WorktreeDeletionResult,
  type WorktreeDeletionTerminalProof,
  WorktreeDeletionArchiveRecoverySchema,
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
import { parseGitRemoteUrl } from "../../utils/git-remote";
import { isValidGitBranchRef } from "../../utils/git-ref";
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
import {
  parseGitNameStatusZ,
  parseGitStatusPorcelainV1Z,
} from "./porcelain-parser";

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
    (facts.dirty === false || allowDirty) &&
    facts.cwdInsideWorktree === false &&
    facts.inUse === false &&
    facts.gitCorrupt !== true
  );
}

function sha256Bytes(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function archivePathInside(
  worktree: string,
  allowedRoot: string,
  filePath: string,
): boolean {
  const root = resolve(worktree, allowedRoot);
  const absolute = resolve(worktree, filePath);
  return absolute === root || absolute.startsWith(`${root}/`);
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

    const runGit = async (
      args: string[],
      stage: string = operation.currentStage ?? "revalidation",
    ): Promise<
      | { ok: true; stdout: string }
      | { ok: false; timedOut: boolean; detail: string }
    > => {
      const remaining = operation.remainingMs() - operation.responseReserveMs;
      if (remaining <= 0 || operation.signal.aborted) {
        await operation.abort("deadline");
        throw new WorktreeDeletionStageDeadline(stage);
      }
      const result = await runBounded(stage, () =>
        runProcess({
          command: resolveGitBinary(),
          args,
          cwd: plan.repository,
          signal: operation.signal,
          timeoutMs: Math.max(1, remaining),
          operation,
        }),
      );
      if (
        isTimeout(result) ||
        operation.remainingMs() <= operation.responseReserveMs
      ) {
        await operation.abort("deadline");
        throw new WorktreeDeletionStageDeadline(stage);
      }
      if (!result.closed || result.exitCode !== 0)
        return {
          ok: false,
          timedOut: false,
          detail:
            result.stderr.trim() ||
            result.stdout.trim() ||
            `git ${args[0]} failed`,
        };
      return {
        ok: true,
        stdout: args.includes("status") ? result.stdout : result.stdout.trim(),
      };
    };

    const revalidatePrMerged = async (
      integration: WorktreeDeletionIntegrationProof,
      actual: WorktreeDeletionFacts,
      stage: string,
    ): Promise<WorktreeDeletionExecutorResult | null> => {
      const {
        prNumber,
        prHeadOid,
        mergeCommitOid,
        headRepository,
        baseRepository,
        defaultBranch,
        branch,
        head,
      } = integration;
      if (
        typeof prNumber !== "number" ||
        !Number.isInteger(prNumber) ||
        prNumber <= 0 ||
        typeof prHeadOid !== "string" ||
        prHeadOid.trim().length === 0 ||
        typeof mergeCommitOid !== "string" ||
        mergeCommitOid.trim().length === 0 ||
        typeof headRepository !== "string" ||
        headRepository.trim().length === 0 ||
        typeof baseRepository !== "string" ||
        baseRepository.trim().length === 0 ||
        typeof defaultBranch !== "string" ||
        !isValidGitBranchRef(defaultBranch) ||
        typeof branch !== "string" ||
        !isValidGitBranchRef(branch) ||
        typeof head !== "string" ||
        head.trim().length === 0
      )
        return failure(
          "repair_required",
          "pr_revalidation_missing_bound_fact",
          stage,
        );

      const gitFailure = (_result: {
        ok: false;
        timedOut: boolean;
        detail: string;
      }): WorktreeDeletionExecutorResult =>
        failure("repair_required", "pr_revalidation_git_failed", stage);

      const localHead = await runGit([
        "rev-parse",
        "--verify",
        `refs/heads/${branch}^{commit}`,
      ]);
      if (!localHead.ok) return gitFailure(localHead);
      if (localHead.stdout !== actual.head || localHead.stdout !== head)
        return failure("drifted", "pr_revalidation_local_head_drifted", stage);

      const localBelongsToPrHead = await runGit([
        "merge-base",
        "--is-ancestor",
        ...(plan.removalMode === "archive_owned_projection"
          ? [prHeadOid, localHead.stdout]
          : [localHead.stdout, prHeadOid]),
      ]);
      if (!localBelongsToPrHead.ok)
        return failure(
          "drifted",
          plan.removalMode === "archive_owned_projection"
            ? "pr_revalidation_pr_head_not_ancestor_of_local_head"
            : "pr_revalidation_local_head_not_in_pr",
          stage,
        );

      const origin = await runGit(["config", "--get", "remote.origin.url"]);
      if (!origin.ok) return gitFailure(origin);
      const currentRepository = parseGitRemoteUrl(origin.stdout);
      const currentRepositoryName = currentRepository
        ? `${currentRepository.owner}/${currentRepository.name}`
        : undefined;
      if (
        !currentRepositoryName ||
        currentRepositoryName !== headRepository ||
        currentRepositoryName !== baseRepository
      )
        return failure("drifted", "pr_revalidation_repository_drifted", stage);

      const currentDefault = await runGit([
        "symbolic-ref",
        "--quiet",
        "--short",
        "refs/remotes/origin/HEAD",
      ]);
      if (!currentDefault.ok) return gitFailure(currentDefault);
      if (currentDefault.stdout.replace(/^origin\//, "") !== defaultBranch)
        return failure(
          "drifted",
          "pr_revalidation_default_branch_drifted",
          stage,
        );

      const fetchedPrHead = await runGit([
        "fetch",
        "--no-tags",
        "origin",
        `refs/pull/${prNumber}/head`,
      ]);
      if (!fetchedPrHead.ok) return gitFailure(fetchedPrHead);
      const fetchedPrHeadOid = await runGit([
        "rev-parse",
        "--verify",
        "FETCH_HEAD^{commit}",
      ]);
      if (!fetchedPrHeadOid.ok) return gitFailure(fetchedPrHeadOid);
      if (fetchedPrHeadOid.stdout !== prHeadOid)
        return failure("drifted", "pr_revalidation_pr_head_drifted", stage);

      const fetchedDefault = await runGit([
        "fetch",
        "--no-tags",
        "origin",
        `refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`,
      ]);
      if (!fetchedDefault.ok) return gitFailure(fetchedDefault);
      const fetchedDefaultOid = await runGit([
        "rev-parse",
        "--verify",
        `refs/remotes/origin/${defaultBranch}^{commit}`,
      ]);
      if (!fetchedDefaultOid.ok) return gitFailure(fetchedDefaultOid);
      if (
        plan.removalMode === "archive_owned_projection" &&
        plan.archiveRecovery?.defaultBranchSha !== fetchedDefaultOid.stdout
      )
        return failure(
          "drifted",
          "archive_recovery_default_head_drifted",
          stage,
        );
      const mergeIsReachable = await runGit([
        "merge-base",
        "--is-ancestor",
        mergeCommitOid,
        `refs/remotes/origin/${defaultBranch}`,
      ]);
      if (!mergeIsReachable.ok)
        return failure(
          "drifted",
          "pr_revalidation_merge_commit_unreachable",
          stage,
        );

      const expired = expiryDecision(stage);
      if (expired) return expired;

      return null;
    };

    const revalidateArchiveOwned = async (
      actual: WorktreeDeletionFacts,
      stage: string,
    ): Promise<WorktreeDeletionExecutorResult | null> => {
      const recovery = plan.archiveRecovery;
      if (
        plan.removalMode !== "archive_owned_projection" ||
        !recovery ||
        !WorktreeDeletionArchiveRecoverySchema.safeParse(recovery).success
      )
        return failure("refused", "archive_recovery_proof_missing", stage);
      if (
        plan.force === true ||
        plan.integration?.kind !== "pr_merged" ||
        !plan.terminal ||
        stableStringify(plan.terminal) !== stableStringify(recovery.terminal)
      )
        return failure(
          "refused",
          "archive_recovery_terminal_proof_missing",
          stage,
        );
      if (
        recovery.repository !== plan.repository ||
        recovery.worktree !== actual.worktree ||
        recovery.branch !== actual.branch ||
        recovery.localHead !== actual.head ||
        recovery.localHead !== plan.facts.head ||
        recovery.cwd !== actual.cwd ||
        recovery.cwdInsideWorktree !== actual.cwdInsideWorktree ||
        recovery.locked !== actual.locked ||
        recovery.inUse !== actual.inUse ||
        recovery.clean !== !actual.dirty ||
        recovery.prNumber !== plan.integration?.prNumber ||
        recovery.prHeadOid !== plan.integration?.prHeadOid ||
        recovery.mergeCommitOid !== plan.integration?.mergeCommitOid ||
        recovery.prRepository !== plan.integration?.headRepository ||
        recovery.prRepository !== plan.integration?.baseRepository ||
        recovery.branch !== `change/${recovery.changeId}`
      )
        return failure("drifted", "archive_recovery_fact_changed", stage);

      const allowed = new Map(
        recovery.canonicalFiles.map((file) => [file.path, file.sha256]),
      );
      if (
        recovery.allowedRoot !== `.adv/archive/${recovery.bundleId}` ||
        recovery.canonicalBundlePath.split(/[\\/]/).pop() !== recovery.bundleId
      )
        return failure("drifted", "archive_recovery_bundle_identity", stage);
      if (
        sha256Bytes(
          Buffer.from(
            stableStringify({
              bundleId: recovery.bundleId,
              canonicalFiles: recovery.canonicalFiles,
            }),
          ),
        ) !== recovery.canonicalIdentity
      )
        return failure("drifted", "archive_recovery_canonical_identity", stage);
      for (const file of recovery.canonicalFiles) {
        if (!file.path.startsWith(`${recovery.allowedRoot}/`))
          return failure(
            "drifted",
            "archive_recovery_path_outside_root",
            stage,
          );
        let canonicalContent: Buffer;
        try {
          canonicalContent = await readFile(
            join(
              recovery.canonicalBundlePath,
              file.path.slice(recovery.allowedRoot.length + 1),
            ),
          );
        } catch {
          return failure(
            "drifted",
            "archive_recovery_canonical_unreadable",
            stage,
          );
        }
        if (sha256Bytes(canonicalContent) !== file.sha256)
          return failure(
            "drifted",
            "archive_recovery_canonical_hash_mismatch",
            stage,
          );
      }
      const expected = new Map(
        recovery.changedPaths.map((file) => [file.path, file.status]),
      );
      const statusResult = await runGit([
        "-C",
        recovery.worktree,
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ]);
      if (!statusResult.ok)
        return failure("repair_required", "archive_recovery_git_failed", stage);
      let statusEntries;
      try {
        statusEntries = parseGitStatusPorcelainV1Z(statusResult.stdout);
      } catch {
        return failure("drifted", "archive_recovery_status_malformed", stage);
      }
      if (statusEntries.length !== 0)
        return failure("drifted", "archive_recovery_worktree_dirty", stage);

      const diffResult = await runGit([
        "diff",
        "--name-status",
        "-z",
        `${recovery.prHeadOid}..${recovery.localHead}`,
      ]);
      if (!diffResult.ok)
        return failure("repair_required", "archive_recovery_git_failed", stage);
      let diffEntries;
      try {
        diffEntries = parseGitNameStatusZ(diffResult.stdout);
      } catch {
        return failure("drifted", "archive_recovery_diff_malformed", stage);
      }
      if (
        diffEntries.length !== expected.size ||
        diffEntries.some(
          (entry) =>
            !["A", "M"].includes(entry.status) ||
            entry.status !== expected.get(entry.path) ||
            !expected.has(entry.path) ||
            !allowed.has(entry.path) ||
            !archivePathInside(
              recovery.worktree,
              recovery.allowedRoot,
              entry.path,
            ),
        )
      )
        return failure("drifted", "archive_recovery_commit_paths", stage);
      for (const entry of diffEntries) {
        let content: Buffer;
        try {
          content = await readFile(join(recovery.worktree, entry.path));
        } catch {
          return failure("drifted", "archive_recovery_file_unreadable", stage);
        }
        if (sha256Bytes(content) !== allowed.get(entry.path))
          return failure("drifted", "archive_recovery_hash_mismatch", stage);
      }
      return null;
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
      const archiveMode = plan.removalMode === "archive_owned_projection";
      if (!safeToRemove(actual, !archiveMode && plan.force === true))
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
      if (integration.kind === "pr_merged") {
        const prDecision = await revalidatePrMerged(integration, actual, stage);
        if (prDecision) return prDecision;
      } else if (this.deps.integrationProof) {
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
      if (archiveMode) {
        const archiveDecision = await revalidateArchiveOwned(actual, stage);
        if (archiveDecision) return archiveDecision;
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
      const expired = expiryDecision(stage);
      if (expired) return expired;
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
            ...(plan.removalMode !== "archive_owned_projection" &&
            plan.force === true
              ? ["--force"]
              : []),
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
