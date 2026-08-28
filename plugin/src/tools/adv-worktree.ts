/**
 * ADV Worktree Tools (T24 — KD-8 phase 1)
 *
 * Tool definitions for `adv_worktree_create`, `adv_worktree_delete`,
 * `adv_worktree_cleanup`, and `adv_worktree_triage`.
 *
 * These wrap the underlying worktree implementations from
 * `tools/worktree/` and format output via `formatToolOutput()`.
 */

import { z } from "zod";
import { INVENTORY_INTERNAL_BUDGET_MS } from "./worktree/inventory-budget";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";
import type { OpencodeClient } from "../utils/opencode-types";
import {
  advWorktreeCreate,
  advWorktreeResume,
  advWorktreeDelete,
  advWorktreeCleanup,
  advWorktreeDetachBatch,
  loadWorktreeConfig,
} from "./worktree";
import {
  createAdvWorkspace,
  deleteAdvWorkspace,
  getSessionWorkspaceID,
  warpFlagEnabled,
  warpSession,
  workspaceAndWarpAvailable,
  type WarpDeps,
} from "../utils/workspace-warp";
import { triageWorktrees } from "./worktree/triage";
import {
  getPendingDeletes,
  initStateDb,
  type WorktreeStateAccess,
} from "./worktree/state";
import { cleanupArchivedMergedBranches } from "./archive-helpers/archived-branch-cleanup";
import {
  appendTargetProjectContextOutput,
  withTargetPathStore,
  type TargetProjectContext,
} from "./target-project";
import {
  createWorktreeOperationContext,
  type WorktreeOperationContext,
} from "../utils/worktree-operation";

/**
 * Safe timeout budget for worktree tool wrappers (cleanup and delete).
 *
 * Must be strictly below the 50s execute override these tools carry in
 * `tool-registry.ts` (the same mechanism as `adv_worktree_triage`) so the
 * shared operation deadline can cancel and settle every destructive stage
 * before the `safeExecute` wrapper rejects. The 8s predecessor sat under the
 * 10s default execute ceiling, which could not fit the plan → git census →
 * branch integration proof → PR evidence chain on large repositories
 * (measured on a 40-worktree project: every stage timed out while bare
 * `git worktree list` took 11ms and `gh pr view` 1.4s).
 *
 * rq-worktreeBoundedCleanup02 AC1.
 */
export const WORKTREE_TOOL_SAFE_TIMEOUT_MS = 45_000;

/** Reserve time for formatting and SDK handoff before the 10s tool ceiling. */
const WORKTREE_TOOL_RETURN_RESERVE_MS = 500;

function cleanupItemTimeoutForToolBudget(effectiveTimeoutMs: number): number {
  return Math.max(1, effectiveTimeoutMs - WORKTREE_TOOL_RETURN_RESERVE_MS);
}

/** Upper bound for any single git subprocess on the cleanup discovery path. */
const DISCOVERY_GIT_BUDGET_CEILING_MS = 2_000;

/**
 * Per-subprocess git bound for cleanup discovery.
 *
 * rq-worktreeBoundedCleanup02 requires internal operations to be bounded
 * *below* the tool budget. The local git helpers default to 30s
 * (`worktree/index.ts`) and 10s (`worktree/census.ts`) for non-cleanup
 * callers, so a single slow invocation could otherwise consume the tool
 * budget several times over. Bounding each call keeps the failure granular: one hung
 * subprocess is killed instead of starving the whole pass.
 *
 * Aggregate discovery cost across many worktrees remains policed by the outer
 * race and is reported via the timeout response `stage` field.
 */
export function discoveryGitBudgetForToolBudget(
  effectiveTimeoutMs: number,
): number {
  // Non-finite input would propagate NaN through Math.max into
  // execFile({ timeout: NaN }), which is undefined behaviour. Zod rejects NaN
  // at the tool boundary, but this helper is exported and must not depend on
  // its callers for safety.
  const budget = Number.isFinite(effectiveTimeoutMs) ? effectiveTimeoutMs : 0;
  return Math.max(
    1,
    Math.min(DISCOVERY_GIT_BUDGET_CEILING_MS, Math.floor(budget / 4)),
  );
}

/**
 * Clamp a caller-supplied timeout to the safe tool budget.
 *
 * Returns the clamped value and the effective timeout actually used, so
 * callers can surface `effectiveTimeoutMs` in tool output for transparency.
 *
 * rq-worktreeBoundedCleanup02 AC2.
 */
function clampToSafeBudget(requestedMs: number | undefined): {
  effectiveTimeoutMs: number;
  wasClamped: boolean;
} {
  const requested = requestedMs ?? WORKTREE_TOOL_SAFE_TIMEOUT_MS;
  if (requested > WORKTREE_TOOL_SAFE_TIMEOUT_MS) {
    return {
      effectiveTimeoutMs: WORKTREE_TOOL_SAFE_TIMEOUT_MS,
      wasClamped: true,
    };
  }
  return { effectiveTimeoutMs: requested, wasClamped: false };
}

/** Simple no-op-ish logger for ADV worktree tools. */
function createLogger(): {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
} {
  return {
    debug: () => {},
    info: () => {},
    warn: (msg: string) => {
      console.warn(msg);
    },
    error: (msg: string) => {
      console.error(msg);
    },
  };
}

interface AdvWorktreeCreateRuntime {
  serverUrl?: URL;
  sessionID?: string;
  /**
   * v1 SDK client from `PluginInput.client`. When present, session lookup
   * routes through the SDK's interceptor pipeline so `x-opencode-directory`
   * is attached automatically (rq-warpModeContract04).
   */
  client?: OpencodeClient;
}

interface TargetWorktreeMutationArgs {
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
}

interface WorktreeDeleteArgs extends TargetWorktreeMutationArgs {
  branch: string;
  force?: boolean;
  dryRun?: boolean;
  planToken?: string;
  approvalEvidence?: string;
}

interface WorktreeResumeArgs extends TargetWorktreeMutationArgs {
  changeId?: string;
  branch?: string;
  base?: string;
  force?: boolean;
}

interface WorktreeCleanupArgs extends TargetWorktreeMutationArgs {
  reason: string;
  dryRun?: boolean;
  approvalEvidence?: string;
  skipDiscovery?: boolean;
  timeoutMs?: number;
  mode?: "worktrees" | "archived_branches";
  changeId?: string;
}

interface WorktreeDetachArgs extends TargetWorktreeMutationArgs {
  branches: string[];
  cutoffMs: number;
  mode: "dry_run" | "apply";
  approvalEvidence?: string;
  requestId?: string;
}

const targetWorktreeMutationArgSchemas = {
  target_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute path to another ADV project. When provided, routes the operation through that project's target worktree store.",
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
};

function buildWarpDeps(input: {
  projectRoot: string;
  serverUrl?: URL;
  client?: OpencodeClient;
}): WarpDeps | undefined {
  return input.serverUrl
    ? {
        serverUrl: input.serverUrl,
        directory: input.projectRoot,
        client: input.client,
      }
    : undefined;
}

function formatMaybeTargetOutput(
  output: string,
  context?: TargetProjectContext,
): string {
  return context ? appendTargetProjectContextOutput(output, context) : output;
}

async function executeWorktreeResume(
  args: WorktreeResumeArgs,
  activeStore: Store,
  context?: TargetProjectContext,
): Promise<string> {
  const projectRoot = activeStore.paths.root;
  const database = await initStateDb(projectRoot);
  const log = createLogger();
  const result = await advWorktreeResume(
    { changeId: args.changeId ?? "", branch: args.branch },
    { base: args.base, force: args.force },
    { projectRoot, database, log, store: activeStore },
  );
  return formatMaybeTargetOutput(formatToolOutput(result), context);
}

async function executeWorktreeDelete(
  args: WorktreeDeleteArgs,
  store: Store,
  options: {
    serverUrl?: URL;
    client?: OpencodeClient;
    operation?: WorktreeOperationContext;
  } = {},
  context?: TargetProjectContext,
): Promise<string> {
  const ownsOperation = !options.operation;
  const operation =
    options.operation ??
    createWorktreeOperationContext({
      budgetMs: WORKTREE_TOOL_SAFE_TIMEOUT_MS,
      responseReserveMs: WORKTREE_TOOL_RETURN_RESERVE_MS,
    });
  if (targetDeleteRoutingExpired(operation)) {
    const timeout = targetDeleteRoutingTimeout(
      Math.max(1, operation.remainingMs()),
    );
    if (ownsOperation) {
      await operation.abort("deadline");
      operation.dispose();
    }
    return formatMaybeTargetOutput(timeout, context);
  }
  const projectRoot = store.paths.root;
  const database = await initWorktreeDb(projectRoot);
  const log = createLogger();
  const warpDeps = buildWarpDeps({
    projectRoot,
    serverUrl: options.serverUrl,
    client: options.client,
  });

  try {
    // The operation starts at the public handler, so target routing time is
    // deducted before planning/execution. Keep the response reserve outside
    // the child budget; the planner and executor then share the same remaining
    // end-to-end budget instead of resetting their clocks after routing.
    const effectiveTimeoutMs = Math.max(1, operation.remainingMs());
    if (
      operation.signal.aborted ||
      operation.remainingMs() <= operation.responseReserveMs
    ) {
      return formatMaybeTargetOutput(
        formatToolOutput({
          ok: false,
          timedOut: true,
          error: `DEADLINE_EXCEEDED: adv_worktree_delete timed out during target routing`,
          status: "deadline_exceeded",
          stage: "target_resolution",
          effectiveTimeoutMs,
          remediation:
            "Retry with a fresh dry-run plan; the shared executor owns cancellation and revalidation.",
        }),
        context,
      );
    }

    const result = await advWorktreeDelete(
      args.branch,
      {
        ...(args.force !== undefined ? { force: args.force } : {}),
        ...(args.dryRun !== undefined ? { dryRun: args.dryRun } : {}),
        ...(args.planToken !== undefined ? { planToken: args.planToken } : {}),
        ...(args.approvalEvidence !== undefined
          ? { approvalEvidence: args.approvalEvidence }
          : {}),
      },
      {
        projectRoot,
        database,
        log,
        store,
        warpDeps,
        // Compatibility telemetry only; the shared operation is authoritative
        // and prevents this value from creating a second deadline.
        operationTimeoutMs: Math.max(
          1,
          Math.floor(operation.remainingMs() - operation.responseReserveMs),
        ),
        operation,
      },
    );
    return formatMaybeTargetOutput(
      formatToolOutput(result as Awaited<ReturnType<typeof advWorktreeDelete>>),
      context,
    );
  } finally {
    if (ownsOperation) {
      await operation.abort("operation_complete");
      operation.dispose();
    }
  }
}

function targetDeleteRoutingExpired(
  operation: WorktreeOperationContext,
): boolean {
  return (
    operation.signal.aborted ||
    operation.remainingMs() <= operation.responseReserveMs
  );
}

function targetDeleteRoutingTimeout(effectiveTimeoutMs: number): string {
  return formatToolOutput({
    ok: false,
    timedOut: true,
    error: `DEADLINE_EXCEEDED: adv_worktree_delete target resolution timed out after ${effectiveTimeoutMs}ms`,
    status: "deadline_exceeded",
    stage: "target_resolution",
    effectiveTimeoutMs,
    remediation:
      "Retry with a fresh dry-run plan; target routing did not finish before the internal deadline.",
  });
}

async function executeTargetWorktreeDelete(
  args: WorktreeDeleteArgs,
  store: Store,
  options: { serverUrl?: URL; client?: OpencodeClient },
): Promise<string> {
  const { effectiveTimeoutMs } = clampToSafeBudget(undefined);
  const operation = createWorktreeOperationContext({
    budgetMs: effectiveTimeoutMs,
    responseReserveMs: WORKTREE_TOOL_RETURN_RESERVE_MS,
  });
  const routedPromise = withTargetPathStore(
    {
      currentProjectPath: store.paths.root,
      target_path: args.target_path!,
      target_confirmed: args.target_confirmed,
      confirmationEvidence: args.confirmationEvidence,
      // The store is only a lightweight terminal-proof input. Git census and
      // the executor own all deletion effects, including apply.
      stateRequirement: "snapshot-ok",
      operation,
      // Keep the mutation trust gate for apply even though the store itself is
      // deliberately not initialized or migrated.
      mutation: !args.dryRun,
    },
    async ({ context, store: targetStore }) => {
      // withTargetPathStore is intentionally non-cancelling. A late target
      // resolution may finish, but it must never enter planning or execution
      // after the public handler has returned its timeout response.
      if (targetDeleteRoutingExpired(operation)) {
        return targetDeleteRoutingTimeout(effectiveTimeoutMs);
      }
      return executeWorktreeDelete(
        args,
        targetStore,
        { ...options, operation },
        context,
      );
    },
  );

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutRace = new Promise<{ _timedOut: true }>((resolve) => {
    timeoutHandle = setTimeout(
      () => resolve({ _timedOut: true }),
      Math.max(1, operation.remainingMs() - operation.responseReserveMs),
    );
  });
  try {
    const result = await Promise.race([routedPromise, timeoutRace]);
    if (typeof result !== "string") {
      if (result._timedOut) {
        timedOut = true;
        await operation.abort("target_resolution_deadline");
        return targetDeleteRoutingTimeout(effectiveTimeoutMs);
      }
      throw new Error("unexpected target delete routing result");
    }
    return result;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (timedOut) {
      // Keep the aborted guard alive until the non-cancelling resolution
      // settles, then release its deadline timer and child leases.
      void routedPromise.then(
        () => operation.dispose(),
        () => operation.dispose(),
      );
    } else {
      await operation.abort("operation_complete");
      operation.dispose();
    }
  }
}

async function executeWorktreeCleanup(
  args: WorktreeCleanupArgs,
  store: Store,
  options: { serverUrl?: URL; client?: OpencodeClient } = {},
  context?: TargetProjectContext,
): Promise<string> {
  // rq-archiveBranchCleanup01: archived-branch hygiene is git maintenance,
  // not ADV recovery state. It owns no workflow signals, so it routes before
  // the queued-cleanup DB/timeout machinery.
  if (args.mode === "archived_branches") {
    // rq-archivedBranchCleanupInversion01: clamp the caller budget and pass
    // the effective budget to the helper, which self-bounds (per-id verify,
    // bounded fetch, per-call detect) and self-returns typed partial results.
    // The outer race is an emergency last-resort guard only — the helper's
    // internal deadline is tighter, so it normally returns partial first.
    const { effectiveTimeoutMs, wasClamped } = clampToSafeBudget(
      args.timeoutMs,
    );

    const cleanupPromise = cleanupArchivedMergedBranches({
      store,
      changeId: args.changeId,
      dryRun: args.dryRun,
      approvalEvidence: args.approvalEvidence?.trim() || args.reason.trim(),
      effectiveTimeoutMs,
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutRace = new Promise<{ _timedOut: true }>((resolve) => {
      timeoutHandle = setTimeout(
        () => resolve({ _timedOut: true }),
        effectiveTimeoutMs,
      );
    });

    const raced = await Promise.race([cleanupPromise, timeoutRace]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    if ("_timedOut" in raced && raced._timedOut) {
      const clampedNote = wasClamped
        ? ` (requested ${args.timeoutMs}ms was clamped to safe budget ${effectiveTimeoutMs}ms)`
        : "";
      return formatMaybeTargetOutput(
        formatToolOutput({
          success: false,
          timedOut: true,
          mode: "archived_branches",
          effectiveTimeoutMs,
          error: `adv_worktree_cleanup archived_branches exceeded the ${effectiveTimeoutMs}ms safe budget${clampedNote}. This is an emergency guard; the helper normally self-returns partial results, so this indicates stuck git or store I/O.`,
          // rq-worktreeBoundedCleanup02: once the request has been clamped,
          // advising a larger timeoutMs is unreachable — the safe budget is a
          // structural ceiling. `skipDiscovery` is deliberately NOT offered
          // here: this mode routes to cleanupArchivedMergedBranches and never
          // forwards `discover`, so naming it would advise a no-op.
          remediation: wasClamped
            ? `The ${WORKTREE_TOOL_SAFE_TIMEOUT_MS}ms safe budget is a structural ceiling (rq-worktreeBoundedCleanup02) and cannot be raised. Re-run with a narrower changeId filter, or run adv_worktree_triage to inspect merged archived branches individually.`
            : "Retry with a larger timeoutMs (clamped to the safe budget), or investigate a stuck git process / unreachable store.",
        }),
        context,
      );
    }

    const cleanupResult = raced as Record<string, unknown>;
    return formatMaybeTargetOutput(
      formatToolOutput({
        ...cleanupResult,
        effectiveTimeoutMs,
        ...(wasClamped
          ? {
              timeoutNote: `Requested ${args.timeoutMs}ms clamped to safe budget ${effectiveTimeoutMs}ms`,
            }
          : {}),
      }),
      context,
    );
  }

  const projectRoot = store.paths.root;
  const database = await initWorktreeDb(projectRoot);
  const log = createLogger();
  const warpDeps = buildWarpDeps({
    projectRoot,
    serverUrl: options.serverUrl,
    client: options.client,
  });

  // rq-worktreeBoundedCleanup02 AC2: clamp caller timeout to safe budget
  const { effectiveTimeoutMs, wasClamped } = clampToSafeBudget(args.timeoutMs);

  let currentStage: "discovery" | "drain" | "pre" = "pre";
  const cleanupPromise = advWorktreeCleanup(args.reason, {
    projectRoot,
    database,
    log,
    dryRun: args.dryRun,
    approvalEvidence: args.approvalEvidence?.trim() || args.reason.trim(),
    store,
    warpDeps,
    ...(args.skipDiscovery !== undefined && {
      discover: !args.skipDiscovery,
    }),
    onStageEnter: (stage) => {
      currentStage = stage;
    },
    cleanupItemTimeoutMs: cleanupItemTimeoutForToolBudget(effectiveTimeoutMs),
    gitTimeoutMs: discoveryGitBudgetForToolBudget(effectiveTimeoutMs),
  });

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutRace = new Promise<{ _timedOut: true }>((resolve) => {
    timeoutHandle = setTimeout(
      () => resolve({ _timedOut: true }),
      effectiveTimeoutMs,
    );
  });

  const result = await Promise.race([cleanupPromise, timeoutRace]);
  if (timeoutHandle) clearTimeout(timeoutHandle);

  if ("_timedOut" in result && result._timedOut) {
    // Snapshot the stage synchronously, before any await. The inner promise is
    // still running (withTimeout is non-cancelling), so awaiting first would
    // yield the event loop and let it advance the stage — reporting a
    // post-timeout value instead of the one in flight when the budget expired
    // (DONT5).
    const stageAtTimeout = currentStage;
    const clampedNote = wasClamped
      ? ` (requested ${args.timeoutMs}ms was clamped to safe budget ${effectiveTimeoutMs}ms)`
      : "";
    // Distinguish "queue is empty" from "queue could not be read". Collapsing
    // both to 0 would tell the operator that a drain-only retry has nothing to
    // do when in fact the state DB is unreachable — the same class of
    // misleading guidance this change exists to remove.
    const pendingDeletes = await getPendingDeletes(database).then(
      (rows) => ({ ok: true as const, count: rows.length }),
      () => ({ ok: false as const }),
    );
    return formatMaybeTargetOutput(
      formatToolOutput({
        success: false,
        timedOut: true,
        effectiveTimeoutMs,
        stage: stageAtTimeout,
        ...(pendingDeletes.ok
          ? { pendingDeleteCount: pendingDeletes.count }
          : { pendingDeleteCountUnavailable: true }),
        // rq-worktreeTimeoutTruthfulness01: a timeout response must not assert
        // a cause it never tested, nor advise an action that cannot succeed.
        //
        // No poison claim: this branch resolves a setTimeout sentinel, not a
        // rejection, so there is no error to classify. rq-worktreePoisonVisibility01
        // requires error-class plus structured evidence before naming poisoned
        // history — asserting it here would be a guess. Report the stage that
        // was actually in flight instead (rq-worktreeTimeoutTruthfulness01:
        // stage captured synchronously, empty vs unreadable pending-delete
        // queue kept distinguishable, remediation names only actions that can
        // succeed under the clamp).
        error: `adv_worktree_cleanup timed out after ${effectiveTimeoutMs}ms${clampedNote} during ${stageAtTimeout}. The inner promise was not cancelled; queued deletes may still resolve on a later drain pass.`,
        // rq-worktreeBoundedCleanup02: the safe budget is a structural ceiling,
        // so a clamped caller must be given an action that can actually succeed.
        remediation: wasClamped
          ? `The ${WORKTREE_TOOL_SAFE_TIMEOUT_MS}ms safe budget is a structural ceiling (rq-worktreeBoundedCleanup02) and cannot be raised. Retry with skipDiscovery:true to drain already-queued deletes, or run adv_worktree_triage to inspect retained candidates.`
          : "Retry with a larger timeoutMs (clamped to the safe budget), or run adv_worktree_triage to inspect retained candidates.",
      }),
      context,
    );
  }

  const cleanupResult = result as Awaited<
    ReturnType<typeof advWorktreeCleanup>
  >;
  return formatMaybeTargetOutput(
    formatToolOutput({
      success: true,
      removed: cleanupResult.removed,
      retained: cleanupResult.retained,
      effectiveTimeoutMs,
      ...(wasClamped
        ? {
            timeoutNote: `Requested ${args.timeoutMs}ms clamped to safe budget ${effectiveTimeoutMs}ms`,
          }
        : {}),
      ...(cleanupResult.dryRun ? { dryRun: true } : {}),
    }),
    context,
  );
}

async function executeWorktreeDetach(
  args: WorktreeDetachArgs,
  store: Store,
  context?: TargetProjectContext,
): Promise<string> {
  const projectRoot = store.paths.root;
  const database = await initWorktreeDb(projectRoot);
  const log = createLogger();

  // rq-worktreeBoundedCleanup02 AC1: bound detach with safe budget so the
  // tool never exceeds the SDK's 10s hard ceiling.
  const { effectiveTimeoutMs } = clampToSafeBudget(undefined);
  const detachPromise = advWorktreeDetachBatch(
    {
      branches: args.branches,
      cutoffMs: args.cutoffMs,
      mode: args.mode,
      approvalEvidence: args.approvalEvidence,
      requestId: args.requestId,
    },
    projectRoot,
    database,
    {
      log,
    },
  );

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutRace = new Promise<{ _timedOut: true }>((resolve) => {
    timeoutHandle = setTimeout(
      () => resolve({ _timedOut: true }),
      effectiveTimeoutMs,
    );
  });

  const result = await Promise.race([detachPromise, timeoutRace]);
  if (timeoutHandle) clearTimeout(timeoutHandle);

  if ("_timedOut" in result && result._timedOut) {
    return formatMaybeTargetOutput(
      formatToolOutput({
        ok: false,
        timedOut: true,
        // No unevidenced cause claim: this branch resolves a setTimeout
        // sentinel, not a rejection (rq-worktreePoisonVisibility01,
        // rq-worktreeTimeoutTruthfulness01).
        error: `adv_worktree_detach timed out after ${effectiveTimeoutMs}ms. The inner promise was not cancelled; the detach batch may still resolve.`,
        effectiveTimeoutMs,
        remediation:
          "Re-run the detach in mode:dry_run first to see current eligibility, then re-apply. Run adv_worktree_triage to inspect worktree state.",
      }),
      context,
    );
  }

  return formatMaybeTargetOutput(
    formatToolOutput(
      result as Awaited<ReturnType<typeof advWorktreeDetachBatch>>,
    ),
    context,
  );
}

/**
 * Structured downgrade reason emitted on every `mode:warp → mode:terminal`
 * fallback path. Discriminated union so agents can branch on `kind` without
 * parsing the human-readable `warning` string (rq-warpModeContract03).
 */
type DowngradeReason =
  | { kind: "missing_server" }
  | { kind: "missing_session" }
  | { kind: "missing_client" }
  | { kind: "flag_disabled" }
  | { kind: "lookup_failed"; status?: number; detail?: string }
  | { kind: "endpoint_unreachable" }
  | { kind: "warp_failed"; detail: string; cleanupFailed?: boolean };

async function resolveCreateRuntimeMode(
  projectRoot: string,
  log: ReturnType<typeof createLogger>,
  runtime?: AdvWorktreeCreateRuntime,
): Promise<
  | { mode: "legacy" }
  | { mode: "warp"; warpDeps: WarpDeps }
  | {
      mode: "terminal" | "spawn";
      warning?: string;
      downgrade_reason?: DowngradeReason;
    }
  | { mode: "blocked"; output: Record<string, unknown> }
> {
  const config = await loadWorktreeConfig(projectRoot, log);
  if (config.mode !== "warp") return { mode: config.mode };

  const warningMissingServer =
    "mode:warp unavailable because the OpenCode tool context did not include serverUrl; falling back to mode:terminal.";
  if (!runtime?.serverUrl) {
    log.warn(`[worktree] ${warningMissingServer}`);
    return {
      mode: "terminal",
      warning: warningMissingServer,
      downgrade_reason: { kind: "missing_server" },
    };
  }

  const warningMissingSession =
    "mode:warp unavailable because the OpenCode tool context did not include a sessionID; falling back to mode:terminal.";
  if (!runtime.sessionID) {
    log.warn(`[worktree] ${warningMissingSession}`);
    return {
      mode: "terminal",
      warning: warningMissingSession,
      downgrade_reason: { kind: "missing_session" },
    };
  }

  const warningMissingClient =
    "mode:warp unavailable because the OpenCode tool context did not include an SDK client; falling back to mode:terminal.";
  if (!runtime.client) {
    log.warn(`[worktree] ${warningMissingClient}`);
    return {
      mode: "terminal",
      warning: warningMissingClient,
      downgrade_reason: { kind: "missing_client" },
    };
  }

  const warningFlag =
    "mode:warp unavailable because OpenCode workspace sync is not enabled. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true (or OPENCODE_EXPERIMENTAL=true) and restart OpenCode to enable workspace warp; falling back to mode:terminal.";
  if (!warpFlagEnabled()) {
    log.warn(`[worktree] ${warningFlag}`);
    return {
      mode: "terminal",
      warning: warningFlag,
      downgrade_reason: { kind: "flag_disabled" },
    };
  }

  const warpDeps: WarpDeps = {
    serverUrl: runtime.serverUrl,
    directory: projectRoot,
    client: runtime.client,
  };

  const lookup = await getSessionWorkspaceID(warpDeps, runtime.sessionID);
  if (!lookup.ok) {
    const warningSession = `mode:warp unavailable because current session lookup failed (${lookup.detail}); falling back to mode:terminal.`;
    log.warn(`[worktree] ${warningSession}`);
    return {
      mode: "terminal",
      warning: warningSession,
      downgrade_reason: {
        kind: "lookup_failed",
        ...(lookup.status !== undefined ? { status: lookup.status } : {}),
        detail: lookup.detail,
      },
    };
  }
  if (lookup.workspaceID) {
    return {
      mode: "blocked",
      output: {
        ok: false,
        error: "SESSION_ALREADY_WARPED",
        sessionID: runtime.sessionID,
        workspaceID: lookup.workspaceID,
        hint: "Open a fresh OpenCode session from the trunk checkout to create a new worktree.",
      },
    };
  }

  const warningEndpoint =
    "mode:warp unavailable because /experimental/workspace is not reachable. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true and restart OpenCode, or use mode:terminal; falling back to mode:terminal.";
  if (!(await workspaceAndWarpAvailable(warpDeps))) {
    log.warn(`[worktree] ${warningEndpoint}`);
    return {
      mode: "terminal",
      warning: warningEndpoint,
      downgrade_reason: { kind: "endpoint_unreachable" },
    };
  }

  return { mode: "warp", warpDeps };
}

const terminalModePayload = <T extends { path?: string }>(
  result: T,
  warning?: string,
  downgrade_reason?: DowngradeReason,
): T & {
  mode: "terminal";
  workdir: string | undefined;
  warning?: string;
  downgrade_reason?: DowngradeReason;
  message: string;
} => ({
  ...result,
  mode: "terminal",
  workdir: result.path,
  ...(warning ? { warning } : {}),
  ...(downgrade_reason ? { downgrade_reason } : {}),
  message: `IMPORTANT: Terminal mode is active. You MUST use workdir="${result.path}" for ALL subsequent tool calls (bash, read, edit, glob, grep, etc). Do NOT continue operating in the original directory.`,
});

async function initWorktreeDb(
  projectRoot: string,
): Promise<WorktreeStateAccess> {
  return initStateDb(projectRoot);
}

const advWorktreeToolDefinitions = {
  adv_worktree_create: {
    description:
      "Create a new git worktree for isolated development. Returns the worktree path, branch, and base reference.",
    args: {
      branch: z
        .string()
        .describe("Branch name for the worktree (e.g., 'feature/dark-mode')"),
      base: z
        .string()
        .optional()
        .describe("Base branch to create from (defaults to HEAD)"),
      force: z
        .boolean()
        .optional()
        .describe("Force creation even if branch exists"),
      changeId: z
        .string()
        .optional()
        .describe("Existing ADV change ID to resume."),
      resume: z
        .boolean()
        .optional()
        .describe("Resume an existing worktree instead of creating a new one."),
      ...targetWorktreeMutationArgSchemas,
    },
    execute: async (
      args: {
        branch: string;
        base?: string;
        force?: boolean;
        changeId?: string;
        resume?: boolean;
      } & TargetWorktreeMutationArgs,
      store: Store,
      runtime?: AdvWorktreeCreateRuntime,
    ) => {
      if (args.resume || args.changeId) {
        if (args.target_path) {
          return withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path: args.target_path,
              target_confirmed: args.target_confirmed,
              confirmationEvidence: args.confirmationEvidence,
              stateRequirement: "authoritative",
            },
            async ({ context, store: targetStore }) =>
              executeWorktreeResume(args, targetStore, context),
          );
        }
        return executeWorktreeResume(args, store);
      }
      const projectRoot = store.paths.root;
      const database = await initWorktreeDb(projectRoot);
      const log = createLogger();

      const mode = await resolveCreateRuntimeMode(projectRoot, log, runtime);
      if (mode.mode === "blocked") return formatToolOutput(mode.output);

      const result = await advWorktreeCreate(
        args.branch,
        { base: args.base, force: args.force },
        { projectRoot, database, log, store },
      );

      if (!result.ok || mode.mode === "legacy") return formatToolOutput(result);

      if (mode.mode === "terminal") {
        return formatToolOutput(
          terminalModePayload(result, mode.warning, mode.downgrade_reason),
        );
      }

      if (mode.mode === "spawn") {
        return formatToolOutput({
          ...result,
          mode: "spawn",
          workdir: result.path,
          message:
            "Spawn mode is configured; use the returned worktree path for follow-up launch handling.",
        });
      }

      if (mode.mode !== "warp") return formatToolOutput(result);
      const warpDeps = mode.warpDeps;
      let workspaceID: string | undefined;
      let workspaceCleanupFailed: string | undefined;
      try {
        const created = await createAdvWorkspace(warpDeps, {
          directory: result.path,
          branch: args.branch,
        });
        workspaceID = created.workspaceID;
        await warpSession(warpDeps, {
          workspaceID,
          sessionID: runtime?.sessionID ?? "",
        });
      } catch (error) {
        if (workspaceID) {
          try {
            await deleteAdvWorkspace(warpDeps, workspaceID);
          } catch (cleanupError) {
            workspaceCleanupFailed = String(cleanupError);
            log.warn(
              `[worktree] Warp failed AND orphan workspace cleanup failed for ${workspaceID}: ${cleanupError}`,
            );
          }
        }
        const cleanupMessage = workspaceCleanupFailed
          ? `OpenCode workspace cleanup also failed (${workspaceCleanupFailed}); manual cleanup may be required`
          : "cleaned up the OpenCode workspace";
        return formatToolOutput(
          terminalModePayload(
            result,
            `mode:warp failed after creating the git worktree (${error}); ${cleanupMessage}. Falling back to mode:terminal.`,
            {
              kind: "warp_failed",
              detail: String(error),
              ...(workspaceCleanupFailed ? { cleanupFailed: true } : {}),
            },
          ),
        );
      }

      return formatToolOutput({
        ...result,
        mode: "warp",
        workspaceID,
        message:
          "Session warped to workspace. Subsequent tool calls operate with the worktree as the project root — no per-tool workdir override needed.",
      });
    },
  },

  adv_worktree_delete: {
    description:
      "Delete a git worktree by branch name. Safe: checks for uncommitted work and integration requirements before removing.",
    args: {
      branch: z.string().describe("Branch name of the worktree to delete"),
      force: z
        .boolean()
        .optional()
        .describe("Force deletion bypassing some safety checks"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview deletion without running hooks or removing files"),
      planToken: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          "Planner-issued token returned by dryRun:true; required for destructive apply",
        ),
      approvalEvidence: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          "Nonblank evidence of explicit approval for this exact deletion plan",
        ),
      ...targetWorktreeMutationArgSchemas,
    },
    execute: async (
      args: WorktreeDeleteArgs,
      store: Store,
      options: { serverUrl?: URL; client?: OpencodeClient } = {},
    ) => {
      // rq-worktreeTargetCleanup01: target_path delete uses the target store
      // while preserving advWorktreeDelete as the sole deletion authority.
      if (args.target_path) {
        return executeTargetWorktreeDelete(args, store, options);
      }
      return executeWorktreeDelete(args, store, options);
    },
  },

  adv_worktree_cleanup: {
    description:
      "Discover terminal cleanup candidates and retry queued worktree deletions. Safe: skips worktrees still used as a process CWD, preserves dirty/unmerged unsafe worktrees, and keeps retained items queued. Opt-in mode=archived_branches instead scans local change/* branches tied to archived ADV changes, detects fully-merged ones (squash-merge-safe), and deletes the safe ones — post-merge branch hygiene moved here from the retired archive-repair surface so worktree cleanup has a single recovery purpose.",
    args: {
      reason: z
        .string()
        .describe("Brief explanation of why you are running cleanup"),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview cleanup without deleting queued worktrees or merged branches",
        ),
      approvalEvidence: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          "Nonblank evidence naming the approved cleanup candidate set; required for destructive manual cleanup",
        ),
      skipDiscovery: z
        .boolean()
        .optional()
        .describe(
          "Skip the discovery scan and drain only already-queued pending deletes. Only honored in mode=worktrees (the default); ignored in mode=archived_branches. Use after a prior cleanup timed out during discovery and left entries queued.",
        ),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          `Optional wall-clock timeout for the cleanup pass. Defaults to ${WORKTREE_TOOL_SAFE_TIMEOUT_MS}ms (the safe tool budget below these tools' 50s execute override). Values exceeding the safe budget are clamped automatically. The effective timeout is reported in the response as effectiveTimeoutMs. Applies to both mode=worktrees and mode=archived_branches; in archived_branches mode the helper self-bounds and returns typed partial results (partial:true + omissions) rather than a hard timeout when the budget is exhausted.`,
        ),
      mode: z
        .enum(["worktrees", "archived_branches"])
        .optional()
        .describe(
          "worktrees (default) = retry queued worktree deletions; archived_branches = opt-in scan/delete of fully-merged local change/* branches tied to archived ADV changes (operator-explicit, rq-archiveBranchCleanup01)",
        ),
      changeId: z
        .string()
        .optional()
        .describe(
          "Optional archived change ID restricting mode=archived_branches to a single change",
        ),
      ...targetWorktreeMutationArgSchemas,
    },
    execute: async (
      args: WorktreeCleanupArgs,
      store: Store,
      options: { serverUrl?: URL; client?: OpencodeClient } = {},
    ) => {
      // rq-worktreeTargetCleanup01: target_path cleanup uses the target store
      // while preserving advWorktreeCleanup's bounded shared cleanup path.
      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
            stateRequirement: "authoritative",
            mutation: !args.dryRun,
          },
          async ({ context, store: targetStore }) =>
            executeWorktreeCleanup(args, targetStore, options, context),
        );
      }
      return executeWorktreeCleanup(args, store, options);
    },
  },

  /* Internal-only handler retained for future maintenance callers. */
  adv_worktree_detach: {
    description:
      "Operator-only directory-only worktree detach. Removes only the worktree directory for a set of exact branches, preserves the local branch and ADV change record, and writes a durable dematerialize receipt on the owning change workflow. Requires approvalEvidence in apply mode. Never invoked by reapers, triage, startup cleanup, or migration automation.",
    args: {
      branches: z
        .array(z.string().min(1))
        .min(1)
        .describe(
          "Exact branch identifiers to detach (no globbing or age inference)",
        ),
      cutoffMs: z
        .number()
        .int()
        .positive()
        .describe("Positive staleness cutoff in milliseconds"),
      mode: z
        .enum(["dry_run", "apply"])
        .describe("Preview or apply the detach"),
      approvalEvidence: z
        .string()
        .optional()
        .describe("Required for apply mode; ignored for dry_run"),
      requestId: z
        .string()
        .optional()
        .describe(
          "Deterministic id bound to the normalized branch set + cutoff",
        ),
      ...targetWorktreeMutationArgSchemas,
    },
    execute: async (args: WorktreeDetachArgs, store: Store) => {
      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
            stateRequirement: "authoritative",
            mutation: args.mode === "apply",
          },
          async ({ context, store: targetStore }) =>
            executeWorktreeDetach(args, targetStore, context),
        );
      }
      return executeWorktreeDetach(args, store);
    },
  },

  adv_worktree_triage: {
    description:
      "Read-only worktree inventory + advisory recommendations. Detects stale heads, missing registry entries, archived-not-cleaned worktrees, and drift group classifications.",
    args: {
      projectRoot: z
        .string()
        .optional()
        .describe(
          "Optional project root override (defaults to current working directory)",
        ),
    },
    execute: async (
      args: { projectRoot?: string },
      context: Store | { store: Store; signal?: AbortSignal },
    ) => {
      const store = "store" in context ? context.store : context;
      const signal = "store" in context ? context.signal : undefined;
      const repoRoot = args.projectRoot ?? store.paths.root;
      const result = await triageWorktrees(repoRoot, undefined, {
        currentProjectRoot: store.paths.root,
        callerSignal: signal,
        timeoutMs: INVENTORY_INTERNAL_BUDGET_MS,
      });
      return formatToolOutput({
        // An incomplete inventory is actionable but not successful: omitted
        // worktrees must never be mistaken for clean or deletion-safe.
        success: result.complete !== false,
        orphans: result.orphans,
        total: result.total,
        complete: result.complete ?? true,
        ...(result.stopReason ? { stopReason: result.stopReason } : {}),
        ...(result.stoppedStage ? { stoppedStage: result.stoppedStage } : {}),
        ...(typeof result.inspectedCount === "number"
          ? { inspectedCount: result.inspectedCount }
          : {}),
        ...(typeof result.candidateCount === "number"
          ? { candidateCount: result.candidateCount }
          : {}),
        ...(result.omitted ? { omitted: result.omitted } : {}),
        ...(result.stageTimings ? { stageTimings: result.stageTimings } : {}),
      });
    },
  },
};

const {
  adv_worktree_detach: _worktreeDetachDefinition,
  ...advWorktreePublicTools
} = advWorktreeToolDefinitions;

export const advWorktreeTools = advWorktreePublicTools;
