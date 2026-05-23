import type { GitSessionContext } from "../utils/git-session";
import { resolveGitSessionContext } from "../utils/git-session";

export type WorktreeIsolationDecision = "ALLOW" | "BLOCK";

/**
 * rq-autoManageAdvWorktrees AC6 — structured failure classes for the
 * auto-create + block guard surface. The legacy block path emits
 * `WorktreeIsolationViolation` only; the new auto-manage path emits one
 * of the four classes below with a machine-readable `code` so agents
 * can branch on it deterministically (P33 — heuristics never own
 * correctness for mutation gating).
 */
export type WorktreeIsolationErrorClass =
  | "WorktreeIsolationViolation"
  | "WorktreeAutoCreateFailure"
  | "WorktreeBranchCollision"
  | "WorktreeSetupFailed";

export type WorktreeIsolationErrorCode =
  | "BRANCH_IN_USE_BY_OTHER_CHANGE"
  | "BRANCH_LOCKED"
  | "BRANCH_EXISTS_WORKTREE_MISSING"
  | "DEFAULT_BRANCH_UNRESOLVABLE"
  | "STALE_BASE"
  | "SETUP_HOOK_FAILED"
  | "DISK_FULL"
  | "PERMISSION_DENIED"
  | "GIT_FAILED"
  | "INVALID_BRANCH"
  | "RESUME_INVALID_TARGET";

export interface WorktreeIsolationResult {
  decision: WorktreeIsolationDecision;
  errorClass?: WorktreeIsolationErrorClass;
  /** Machine-readable failure code (AC6); set only for auto-manage BLOCKs. */
  code?: WorktreeIsolationErrorCode;
  reason?: string;
  mainCheckoutPath?: string;
  /**
   * Path the agent SHOULD use as `workdir` for the retry. Set when:
   * - block_only mode finds an existing worktree (current behavior, extended).
   * - auto-manage mode either finds an existing worktree OR successfully
   *   auto-creates one — in both cases the agent should re-run with this
   *   workdir per AC1.
   */
  expectedWorktreePath?: string;
  /** Original error message from advWorktreeResume when auto-create failed. */
  underlying_error?: string;
  remediation?: string;
}

export interface WorktreeIsolationDeps {
  getSessionContext?: (cwd: string) => GitSessionContext;
  onWarning?: (message: string) => void;
}

export const WORKTREE_ISOLATION_REMEDIATION =
  "Resume or create the ADV worktree with adv_worktree_resume / adv_worktree_create, switch the session or tool workdir to the returned path, then retry from inside that worktree.";

export function checkWorktreeIsolation(
  cwd: string,
  deps: WorktreeIsolationDeps = {},
): WorktreeIsolationResult {
  const getSessionContext =
    deps.getSessionContext ??
    ((path) => resolveGitSessionContext(path, undefined));

  let ctx: GitSessionContext;
  try {
    ctx = getSessionContext(cwd);
  } catch (error) {
    deps.onWarning?.(
      `worktree-isolation-guard: git context detection failed for ${cwd}; allowing (${error instanceof Error ? error.message : String(error)})`,
    );
    return { decision: "ALLOW" };
  }

  if (!ctx.isMainCheckout) return { decision: "ALLOW" };

  return {
    decision: "BLOCK",
    errorClass: "WorktreeIsolationViolation",
    mainCheckoutPath: ctx.mainCheckoutPath,
    reason: `Worktree isolation: ADV mutating operations require a worktree, not the main checkout (${ctx.mainCheckoutPath ?? cwd}).`,
    remediation: WORKTREE_ISOLATION_REMEDIATION,
  };
}
