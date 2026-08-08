/**
 * Request-local control plane for destructive worktree operations.
 *
 * The context is created before target/project resolution so that every
 * subsequent stage consumes one end-to-end budget. Child process leases are
 * registered here, rather than in individual stages, which gives deadline
 * cancellation one owner and one AbortController.
 */

export const WORKTREE_DELETE_INTERNAL_BUDGET_MS = 7_500;
export const WORKTREE_DELETE_RESPONSE_RESERVE_MS = 500;

export interface WorktreeChildLease {
  terminate: (reason: string) => Promise<void> | void;
}

export interface WorktreeStageTiming {
  stage: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface WorktreeOperationContext {
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly responseReserveMs: number;
  readonly signal: AbortSignal;
  readonly stageTimings: readonly WorktreeStageTiming[];
  readonly currentStage: string | undefined;
  readonly terminationError: Error | undefined;
  remainingMs(now?: number): number;
  startStage(stage: string, now?: number): void;
  finishStage(stage?: string, now?: number): void;
  registerChildLease(lease: WorktreeChildLease): () => void;
  /** Reject work that would begin after the shared cancellation barrier. */
  throwIfAborted(reason?: string): void;
  abort(reason: string): Promise<void>;
  dispose(): void;
}

export interface CreateWorktreeOperationContextOptions {
  now?: number;
  budgetMs?: number;
  responseReserveMs?: number;
}

export function createWorktreeOperationContext(
  options: CreateWorktreeOperationContextOptions = {},
): WorktreeOperationContext {
  const startedAt = options.now ?? Date.now();
  const budgetMs = options.budgetMs ?? WORKTREE_DELETE_INTERNAL_BUDGET_MS;
  const responseReserveMs =
    options.responseReserveMs ?? WORKTREE_DELETE_RESPONSE_RESERVE_MS;
  const deadlineAt = startedAt + budgetMs;
  const controller = new AbortController();
  const children = new Set<WorktreeChildLease>();
  const timings: WorktreeStageTiming[] = [];
  let currentStage: string | undefined;
  let currentStageStartedAt: number | undefined;
  let abortPromise: Promise<void> | undefined;
  let terminationError: Error | undefined;
  const abort = async (reason: string): Promise<void> => {
    if (abortPromise) return abortPromise;
    abortPromise = (async () => {
      clearTimeout(deadlineTimer);
      if (!controller.signal.aborted) controller.abort(reason);
      const activeChildren = [...children];
      const settled = await Promise.allSettled(
        activeChildren.map((child) => Promise.resolve(child.terminate(reason))),
      );
      const failures = settled.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (failures.length > 0) {
        terminationError = new Error(
          `worktree operation child termination failed: ${failures
            .map((failure) =>
              failure instanceof Error ? failure.message : String(failure),
            )
            .join("; ")}`,
        );
      }
    })();
    return abortPromise;
  };

  const context: WorktreeOperationContext = {
    startedAt,
    deadlineAt,
    responseReserveMs,
    signal: controller.signal,
    get stageTimings() {
      return timings;
    },
    get currentStage() {
      return currentStage;
    },
    get terminationError() {
      return terminationError;
    },
    remainingMs(now = Date.now()) {
      return Math.max(0, deadlineAt - now);
    },
    startStage(stage, now = Date.now()) {
      if (currentStage !== undefined) {
        context.finishStage(currentStage, now);
      }
      currentStage = stage;
      currentStageStartedAt = now;
    },
    finishStage(stage = currentStage, now = Date.now()) {
      if (stage === undefined || currentStageStartedAt === undefined) return;
      if (stage !== currentStage) return;
      timings.push({
        stage,
        startedAt: currentStageStartedAt,
        endedAt: now,
        durationMs: Math.max(0, now - currentStageStartedAt),
      });
      currentStage = undefined;
      currentStageStartedAt = undefined;
    },
    registerChildLease(lease) {
      children.add(lease);
      return () => children.delete(lease);
    },
    throwIfAborted(reason = "operation_aborted") {
      if (controller.signal.aborted || context.remainingMs() <= 0) {
        throw new DOMException(reason, "AbortError");
      }
    },
    abort,
    dispose() {
      clearTimeout(deadlineTimer);
      children.clear();
    },
  };

  const deadlineTimer = setTimeout(
    () => {
      void abort("deadline");
    },
    Math.max(0, budgetMs),
  );
  // A request context must not keep the plugin process alive on its own.
  deadlineTimer.unref?.();

  return context;
}
