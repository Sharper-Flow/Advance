import type { GitSessionContext } from "../utils/git-session";
import { resolveGitSessionContext } from "../utils/git-session";

export type WorktreeIsolationDecision = "ALLOW" | "BLOCK";

export interface WorktreeIsolationResult {
  decision: WorktreeIsolationDecision;
  errorClass?: "WorktreeIsolationViolation";
  reason?: string;
  mainCheckoutPath?: string;
  remediation?: string;
}

export interface WorktreeIsolationDeps {
  getSessionContext?: (cwd: string) => GitSessionContext;
  onWarning?: (message: string) => void;
}

export const WORKTREE_ISOLATION_REMEDIATION =
  "Create or resume an ADV worktree (adv_worktree_create / adv_worktree_resume) and retry from inside the worktree.";

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
