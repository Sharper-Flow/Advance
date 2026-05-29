/**
 * Worktree Auto-Manage Helper (rq-autoManageAdvWorktrees Block B)
 *
 * Two pure-ish functions plus a single async entry point shared by all
 * mutation guards (gate.ts, task.ts). Centralizes the activation matrix
 * and the auto-create-then-BLOCK contract so per-tool guards stay thin.
 *
 * - `evaluateWorktreeGuardActivation(change, features)` classifies the
 *   guard mode based on the per-change marker and the global flag.
 * - `ensureWorktreeForMutation(input)` is the async helper that
 *   (a) short-circuits ALLOW when off / not-in-main / non-auto-managed,
 *   (b) BLOCKs with `expectedWorktreePath` when a worktree already
 *       exists for the change branch on main checkout,
 *   (c) calls `advWorktreeResume` and BLOCKs with the new path on
 *       success, OR BLOCKs with a structured AC6 error on failure.
 *
 * Design references:
 *   - design.md KD-1 (two-layer guard), KD-4 (insertion point), KD-5
 *     (cross-project projection), KD-6 (signals).
 *   - agreement.md AC1 (auto-create on first mutation), AC5 (per-change
 *     conditioning), AC6 (structured failure).
 *   - rq-worktreeRegistry01 (registry remains canonical).
 *   - DONT1 (no silent retry), DONT2 (proposal-gate exemption).
 */

import type { Change } from "../types";
import type { Store } from "../storage/store";
import { createLogger } from "../utils/debug-log";
import { resolveGitSessionContext } from "../utils/git-session";
import type { GitSessionContext } from "../utils/git-session";
import {
  checkWorktreeIsolation,
  WORKTREE_ISOLATION_REMEDIATION,
  type WorktreeIsolationDeps,
  type WorktreeIsolationErrorClass,
  type WorktreeIsolationErrorCode,
  type WorktreeIsolationResult,
} from "./worktree-isolation-guard";
import {
  advWorktreeResume,
  type AdvWorktreeCreateDeps,
  type AdvWorktreeResumeResult,
} from "./worktree";
import {
  initStateDb,
  worktreeExistsForChange,
  type WorktreeStateAccess,
} from "./worktree/state";

// ---------------------------------------------------------------------------
// Activation evaluation
// ---------------------------------------------------------------------------

export type WorktreeGuardMode = "off" | "block_only" | "auto_manage";

/**
 * Single source of truth for the per-change-marker + global-flag matrix
 * documented in design.md § KD-4. Replaces inline
 * `readBooleanFeatureFlag(features, "worktree_guard_enforce", false)`
 * short-circuits at every guard call site.
 *
 * Matrix:
 *   marker=true                                  → "auto_manage" (new changes)
 *   marker=false AND flag=true                   → "block_only" (legacy + project-enforced)
 *   marker=false AND flag=false                  → "off"        (legacy + project-permissive)
 *   marker=undefined AND flag=true               → "block_only" (lazy-migration-pending project-enforced)
 *   marker=undefined AND flag=false              → "off"        (lazy-migration-pending project-permissive)
 *
 * Per AC3 the marker takes precedence: an auto-managed change activates
 * the auto_manage path regardless of the global flag. A non-auto-managed
 * change defers to the global flag, preserving legacy behavior exactly.
 */
export function evaluateWorktreeGuardActivation(
  change: Change | undefined,
  features: unknown,
): { mode: WorktreeGuardMode } {
  if (change?.worktree_auto_managed === true) {
    return { mode: "auto_manage" };
  }
  const flag = readBooleanFeatureFlag(features, "worktree_guard_enforce", true);
  if (flag) return { mode: "block_only" };
  return { mode: "off" };
}

function readBooleanFeatureFlag(
  features: unknown,
  key: string,
  defaultValue: boolean,
): boolean {
  if (!features || typeof features !== "object") return defaultValue;
  const value = (features as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : defaultValue;
}

// ---------------------------------------------------------------------------
// Auto-create + structured BLOCK helper
// ---------------------------------------------------------------------------

export interface EnsureWorktreeForMutationDeps {
  getSessionContext?: WorktreeIsolationDeps["getSessionContext"];
  /**
   * Test seam: override `advWorktreeResume` so unit tests can simulate
   * each failure variant from `AdvWorktreeResumeResult` without spinning
   * up real git worktrees. Production callers omit and the real resume
   * tool is used.
   */
  resume?: (
    target: { changeId: string; branch?: string },
    opts: { base?: string; force?: boolean },
    runtime: AdvWorktreeCreateDeps,
  ) => Promise<AdvWorktreeResumeResult>;
  /**
   * Test seam for the AdvWorktreeCreateDeps bundle. Production callers
   * supply the real { projectRoot, database, log, store } via the tool
   * layer; tests inject a minimal mock.
   */
  resumeRuntime?: AdvWorktreeCreateDeps;
  /**
   * Optional projection callback fired after auto-create succeeds. The
   * production wiring (Block D) routes through `worktreeAttachedSignal`
   * to project the path onto the change record; tests can capture it to
   * assert the projection contract without firing real signals.
   */
  onAttached?: (info: {
    changeId: string;
    role: "current" | "target" | "scope";
    repoId?: string;
    path: string;
  }) => void | Promise<void>;
  /**
   * Optional registry lookup for the "worktree already exists for this
   * change on main" branch. When omitted, we fall through to
   * `advWorktreeResume`, which internally reuses existing materialized
   * records via `getWorktreeRecord` — so the lookup is purely an
   * optimization to avoid the resume call when we already know the path.
   */
  lookupExistingPath?: (
    changeId: string,
  ) => Promise<string | undefined> | string | undefined;
  /**
   * Test seam for the existing-worktree probe (rq-worktreeMutationGuard01.4).
   * Production callers omit this; the probe reads the durable change-workflow
   * `worktrees` map via `worktreeExistsForChange` using the resumeRuntime
   * database (target-correct for cross-project mutations, GFD-7). Returns
   * `true` only when a setup-ready worktree exists for the change. The probe
   * is read-only and side-effect-free — it MUST NOT materialize a worktree.
   */
  worktreeExists?: (changeId: string) => Promise<boolean> | boolean;
  onWarning?: (message: string) => void;
}

export async function buildWorktreeAutoManageDeps(
  store: Store,
  overrides: Omit<EnsureWorktreeForMutationDeps, "resumeRuntime"> = {},
): Promise<EnsureWorktreeForMutationDeps> {
  const projectRoot = store.paths.root;
  const database = await initStateDb(projectRoot);
  const log = createLogger("worktree-auto-manage");

  return {
    ...overrides,
    resumeRuntime: {
      projectRoot,
      database,
      log,
      store,
    },
  };
}

export interface EnsureWorktreeForMutationInput {
  /**
   * Loaded change for per-change-marker conditioning (AC5). Optional so
   * legacy guard call sites without per-change context can still route
   * through the unified helper for the block_only / off paths. When
   * omitted, activation cannot land on `auto_manage` (the marker is
   * never true on a missing change), so the auto-create branch is
   * unreachable without a changeId.
   */
  change?: Change;
  cwd: string;
  /**
   * Role hint for the projection signal:
   *   "current" — operating in the originating project's repo (default).
   *   "target"  — operating in a `target_path` cross-project mutation.
   *   "scope"   — operating in a product-linked `scope_repos[*]` repo;
   *               `repoId` MUST be set when role="scope".
   * Block C call sites in gate.ts/task.ts pass "current" today; Block
   * D1/D2 extend the call sites to forward "target"/"scope" with
   * `repoId`.
   */
  role?: "current" | "target" | "scope";
  repoId?: string;
  features?: unknown;
  deps?: EnsureWorktreeForMutationDeps;
}

export async function ensureWorktreeForMutation(
  input: EnsureWorktreeForMutationInput,
): Promise<WorktreeIsolationResult> {
  const { change, cwd, role = "current", repoId, features, deps } = input;
  const activation = evaluateWorktreeGuardActivation(change, features);

  if (activation.mode === "off") {
    return { decision: "ALLOW" };
  }

  // Defensive: auto_manage requires a change to resume against. If a caller
  // mismatches activation with input (shouldn't happen — activation reads
  // the marker off the change), fall back to block_only behavior.
  if (activation.mode === "auto_manage" && !change) {
    // unreachable in practice; left as a structural guard
    return checkWorktreeIsolation(cwd, {
      getSessionContext: deps?.getSessionContext,
      onWarning: deps?.onWarning,
    });
  }

  // Defer git-context resolution until we know we might BLOCK. The session
  // context guard mirrors the legacy `checkWorktreeIsolation` posture: on
  // git-detect failure we ALLOW + warn so non-git workdirs (e.g., tests
  // running in tmpdirs) don't get spurious BLOCKs.
  const getSessionContext =
    deps?.getSessionContext ??
    ((path: string) => resolveGitSessionContext(path, undefined));

  let ctx: GitSessionContext;
  try {
    ctx = getSessionContext(cwd);
  } catch (err) {
    deps?.onWarning?.(
      `worktree-auto-manage: git context detection failed for ${cwd}; allowing (${err instanceof Error ? err.message : String(err)})`,
    );
    return { decision: "ALLOW" };
  }

  if (!ctx.isMainCheckout) {
    return { decision: "ALLOW" };
  }

  // Existing-worktree exception (rq-worktreeMutationGuard01.4, AC11-13).
  //
  // When a setup-ready ADV worktree already exists for the change, ALLOW the
  // state-transition mutation from main regardless of the worktree_auto_managed
  // marker. Existing-worktree detection over the durable change-workflow
  // `worktrees` map is the structural authority (P33); the marker is only a
  // fast-path hint. MCP tool callers cannot relocate process.cwd() mid-session,
  // so BLOCKing a durable signal when isolation already exists serves no purpose.
  // This is scoped strictly to state-transition signals; file-write isolation
  // (task checkpoint / edits) is untouched.
  //
  // Placed BEFORE the block_only branch so non-auto-managed (block_only) changes
  // with an existing worktree ALLOW, and before auto_manage create logic to
  // short-circuit a redundant resume. On probe error / Temporal-unavailable the
  // probe returns false (never ALLOW on unknown existence) and we fall through
  // to the marker-based behavior below.
  if (change) {
    const exists = await resolveWorktreeExists(deps, change.id);
    if (exists) {
      return { decision: "ALLOW" };
    }
  }

  // block_only mode: emit the legacy WorktreeIsolationViolation surface.
  // checkWorktreeIsolation re-derives the session context internally, but
  // we already have it — pass it through to avoid the double-call.
  if (activation.mode === "block_only") {
    return checkWorktreeIsolation(cwd, {
      getSessionContext: () => ctx,
      onWarning: deps?.onWarning,
    });
  }

  // auto_manage mode: try to surface an existing worktree path, else
  // call advWorktreeResume to materialize one. When the worktree already
  // exists, ALLOW the mutation — the isolation purpose is to ensure mutations
  // land in the right git context, and MCP tool callers cannot change their
  // CWD mid-session. Blocking when the worktree is ready serves no purpose
  // for state-transition operations (gate completion, task status updates).
  // File-write operations (task checkpoint) have their own workdir handling.
  //
  // change is guaranteed defined here: activation === "auto_manage" implies
  // change.worktree_auto_managed === true, so change cannot be undefined.
  const changeId = change!.id;
  const existing = await Promise.resolve(deps?.lookupExistingPath?.(changeId));
  if (existing) {
    await fireAttachment(deps, changeId, role, repoId, existing);
    return { decision: "ALLOW" } as const;
  }

  const resumeImpl = deps?.resume ?? advWorktreeResume;
  if (!deps?.resumeRuntime) {
    // Production callers must supply the runtime bundle. Defensive guard:
    // if a call site forgets, surface a structured failure so the agent
    // sees a clear error instead of a vague NPE downstream.
    return autoCreateFailure({
      mainCheckoutPath: ctx.mainCheckoutPath ?? cwd,
      code: "GIT_FAILED",
      reason:
        "worktree-auto-manage: deps.resumeRuntime missing — caller did not wire the worktree create deps bundle",
    });
  }

  let result: AdvWorktreeResumeResult;
  try {
    result = await resumeImpl({ changeId }, {}, deps.resumeRuntime);
  } catch (err) {
    return autoCreateFailure({
      mainCheckoutPath: ctx.mainCheckoutPath ?? cwd,
      code: "GIT_FAILED",
      reason: `advWorktreeResume threw: ${err instanceof Error ? err.message : String(err)}`,
      underlying_error: err instanceof Error ? err.message : String(err),
    });
  }

  if (result.ok) {
    await fireAttachment(deps, changeId, role, repoId, result.path);
    return { decision: "ALLOW" } as const;
  }

  // Map advWorktreeResume failure variants to AC6 errorClass + code.
  return mapResumeFailure(result, ctx.mainCheckoutPath ?? cwd);
}

/**
 * Resolve whether a setup-ready ADV worktree exists for `changeId`.
 *
 * Prefers the `worktreeExists` test seam. Production callers omit the seam and
 * we read the durable change-workflow `worktrees` map via `worktreeExistsForChange`
 * using the resumeRuntime database — which `buildWorktreeAutoManageDeps(activeStore)`
 * derives from the active/target store, so the probe queries the correct project
 * namespace for cross-project (`target_path`) mutations (GFD-7).
 *
 * Returns false on any error or when the database is unavailable — never assert a
 * worktree on unknown existence (the guard must not ALLOW on probe failure).
 */
async function resolveWorktreeExists(
  deps: EnsureWorktreeForMutationDeps | undefined,
  changeId: string,
): Promise<boolean> {
  if (deps?.worktreeExists) {
    try {
      return await Promise.resolve(deps.worktreeExists(changeId));
    } catch (err) {
      deps.onWarning?.(
        `worktree-auto-manage: worktreeExists seam threw for ${changeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
  const access: WorktreeStateAccess | undefined = deps?.resumeRuntime?.database;
  if (!access) return false;
  try {
    return await worktreeExistsForChange(access, changeId);
  } catch (err) {
    deps?.onWarning?.(
      `worktree-auto-manage: worktree existence probe threw for ${changeId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

async function fireAttachment(
  deps: EnsureWorktreeForMutationDeps | undefined,
  changeId: string,
  role: "current" | "target" | "scope",
  repoId: string | undefined,
  path: string,
): Promise<void> {
  if (!deps?.onAttached) return;
  try {
    await deps.onAttached({ changeId, role, repoId, path });
  } catch (err) {
    deps.onWarning?.(
      `worktree-auto-manage: onAttached hook threw for ${changeId} ${role}${repoId ? `:${repoId}` : ""}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function autoCreateFailure(input: {
  mainCheckoutPath: string;
  code: WorktreeIsolationErrorCode;
  reason: string;
  underlying_error?: string;
  errorClass?: WorktreeIsolationErrorClass;
}): WorktreeIsolationResult {
  return {
    decision: "BLOCK",
    errorClass: input.errorClass ?? "WorktreeAutoCreateFailure",
    code: input.code,
    mainCheckoutPath: input.mainCheckoutPath,
    reason: input.reason,
    underlying_error: input.underlying_error,
    remediation: WORKTREE_ISOLATION_REMEDIATION,
  };
}

/**
 * Translate `AdvWorktreeResumeResult` failure variants into structured
 * AC6 errorClass + code. Stable — agents branch on these.
 *
 * The classifier is intentionally explicit (no fallthrough catch-all)
 * so a new variant added to `AdvWorktreeResumeResult` causes a TS error
 * here and forces the maintainer to choose a code.
 */
function mapResumeFailure(
  result: Extract<AdvWorktreeResumeResult, { ok: false }>,
  mainCheckoutPath: string,
): WorktreeIsolationResult {
  switch (result.error) {
    case "TARGET_REQUIRED":
      return autoCreateFailure({
        mainCheckoutPath,
        code: "RESUME_INVALID_TARGET",
        reason: `advWorktreeResume could not resolve a branch from the input target. ${result.hint}`,
      });
    case "SETUP_FAILED":
      return autoCreateFailure({
        mainCheckoutPath,
        errorClass: "WorktreeSetupFailed",
        code: "SETUP_HOOK_FAILED",
        reason: `Worktree setup did not complete for ${result.branch}: ${result.reason}`,
        underlying_error: result.reason,
      });
    case "BRANCH_IN_USE":
      return autoCreateFailure({
        mainCheckoutPath,
        errorClass: "WorktreeBranchCollision",
        code: "BRANCH_IN_USE_BY_OTHER_CHANGE",
        reason: `Branch ${result.branch} is already owned by other ADV change workflow(s): ${result.ownerChangeIds.join(", ")}. ${result.hint}`,
      });
    case "BRANCH_LOCKED":
      return autoCreateFailure({
        mainCheckoutPath,
        code: "BRANCH_LOCKED",
        reason: result.hint,
      });
    case "DEFAULT_BRANCH_UNRESOLVABLE":
      return autoCreateFailure({
        mainCheckoutPath,
        code: "DEFAULT_BRANCH_UNRESOLVABLE",
        reason: result.hint,
      });
    case "STALE_BASE":
      return autoCreateFailure({
        mainCheckoutPath,
        code: "STALE_BASE",
        reason: `${result.reason}. Suggested: ${result.suggestion}`,
      });
    case "GIT_FAILED": {
      const lower = result.reason.toLowerCase();
      const code: WorktreeIsolationErrorCode =
        lower.includes("no space") || lower.includes("disk full")
          ? "DISK_FULL"
          : lower.includes("permission denied") ||
              lower.includes("operation not permitted")
            ? "PERMISSION_DENIED"
            : "GIT_FAILED";
      return autoCreateFailure({
        mainCheckoutPath,
        code,
        reason: result.reason,
        underlying_error: result.reason,
      });
    }
    case "INVALID_BRANCH":
      return autoCreateFailure({
        mainCheckoutPath,
        code: "INVALID_BRANCH",
        reason: result.reason,
      });
  }
}
