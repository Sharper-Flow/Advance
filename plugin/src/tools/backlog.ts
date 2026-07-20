/**
 * Backlog Coordination Tools (rq-backlogCoord04, rq-wipPoisonIsolation01).
 *
 * One tool:
 *   - `adv_wip_state` (rq-backlogCoord04) — single-call WIP aggregator over
 *     active changes (Temporal Visibility via store), worktrees (Temporal
 *     Visibility via `listWorktreesAcrossChanges`), and peer sessions
 *     (privacy-defensive projection via `listPeerSessions`).
 *
 * consolidateAdvToolSurface2 (tk-f022bfadbd81): `adv_backlog_state` was
 * removed completely; its TTL-bounded freshness and O(1) Visibility
 * annotation behavior moved into the sole backlog reader at the time.
 * reshapeTriagePortfolioBalance later retired `adv_roadmap` itself;
 * portfolio-balance output now lives in `/adv-triage`.
 *
 * Snapshot invariant: all scoring fields may be null; this tool is read-only
 * on snapshot. GH Project remains canonical for any remaining numeric data.
 */
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";
import type { Task } from "../types";
import {
  createInventoryBudget,
  INVENTORY_INTERNAL_BUDGET_MS,
  type InventoryBudget,
} from "./worktree/inventory-budget";
import {
  initStateDb,
  listWorktreesAcrossChanges,
  type WorktreeCrossChangeWarning,
} from "./worktree/state";
import { listPeerSessions } from "./session";
import {
  compactOpsFollowupAnnotation,
  compactOpsFollowupLinkAnnotations,
  type CompactOpsFollowupAnnotation,
  type CompactOpsFollowupLinkAnnotation,
} from "./ops-followup-readback";

/** Materialized worktree shape returned from cross-change visibility. */
export interface WipWorktreeEntry {
  changeId: string;
  branch: string;
  path: string;
  status: string;
  materialized: boolean;
}

/** Privacy-defensive peer-session projection passthrough. */
export interface WipPeerSessionEntry {
  sessionId: string;
  startedAt: string;
  /** Last heartbeat; optional because legacy records may lack the field. */
  lastSeenAt?: string;
  isSelf: boolean;
  worktree?: string;
}

export interface WipPoisonedWorkflowEntry {
  /** Always set in the final WIP response; optional on provider inputs. */
  source?: "worktrees";
  changeId: string;
  workflowId: string;
  recoveryReason: "poisoned_history" | "missing_workflow" | "query_failed";
  evidenceSummary: string;
  message: string;
}

export interface WipWorktreesProviderResult {
  worktrees: WipWorktreeEntry[];
  warnings?: WorktreeCrossChangeWarning[];
  poisonedWorkflows?: WipPoisonedWorkflowEntry[];
  unavailable?: boolean;
  /** Snapshot completeness metadata (only present from the default provider). */
  complete?: boolean;
  stopReason?: string;
  stoppedStage?: string;
  inspectedCount?: number;
  candidateCount?: number;
  omitted?: Array<{
    scope: string;
    changeId?: string;
    branch?: string;
    reason: string;
  }>;
}

type WipWorktreesProviderValue =
  | WipWorktreeEntry[]
  | WipWorktreesProviderResult;

export interface WipStateResponse {
  active_changes: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    lastActivityAt: string;
    taskCount: number;
    completedTasks: number;
    ops_followup?: CompactOpsFollowupAnnotation;
    ops_followup_links?: CompactOpsFollowupLinkAnnotation[];
  }>;
  worktrees: WipWorktreeEntry[];
  peer_sessions: WipPeerSessionEntry[];
  poisoned_workflows: WipPoisonedWorkflowEntry[];
  generated_at: string;
  warnings: Array<{ source: string; reason: string }>;
  /** Warning-only rows for in-progress tasks assigned to non-live peer sessions. */
  orphan_warnings?: Array<{
    changeId: string;
    taskId: string;
    taskTitle: string;
    assignedTo: string;
    recovery: string;
  }>;
  /** Typed degradation metadata for slow or incomplete sources. */
  degradation?: WipStateDegradation;
}

export interface WipStateDegradation {
  /** Worktree inventory degradation; present only when the snapshot is incomplete. */
  worktree?: {
    complete: boolean;
    stopReason?: string;
    stoppedStage?: string;
    inspectedCount?: number;
    candidateCount?: number;
    omitted?: number;
  };
}

/**
 * Injection seam for tests. Production uses default providers that wire to
 * `listWorktreesAcrossChanges` + `listPeerSessions`.
 */
export interface WipStateProviders {
  worktreesProvider?: (
    projectRoot: string,
    budget?: InventoryBudget,
  ) => Promise<WipWorktreesProviderValue>;
  sessionsProvider?: (projectRoot: string) => Promise<{
    sessions: Array<{
      sessionId: string;
      startedAt: string;
      lastSeenAt?: string;
      isSelf: boolean;
      worktree?: string;
    }>;
    total: number;
    deadFiltered: number;
    unavailable?: boolean;
  }>;
  tasksProvider?: (changeId: string) => Promise<Task[]>;
}

/**
 * Caller-visible safety-net timeout for `adv_wip_state`.
 *
 * The worktree inventory fans out to every change workflow; on large projects
 * it can exceed the default 10s tool safety net. The inner collector stops at
 * 55s (INVENTORY_INTERNAL_BUDGET_MS), reserving 5s to render a partial response
 * before this outer wrapper fires. See docs/specs/advance-meta.md § Per-tool
 * safety-net timeout overrides.
 */
export const WIP_CALLER_TIMEOUT_MS = 60_000;

const MAX_ORPHAN_WARNINGS = 50;
const ORPHAN_RECOVERY =
  "Reassign the task via adv_task_update or resume the owning session; no automatic status mutation occurred.";

/**
 * Production execution context for `adv_wip_state`. Tests may still pass a bare
 * `Store` as the second argument for backward compatibility.
 */
export interface WipStateExecuteContext {
  store: Store;
  /** Host abort signal, forwarded to the worktree collector when available. */
  signal?: AbortSignal;
}

function isWipStateExecuteContext(
  value: Store | WipStateExecuteContext,
): value is WipStateExecuteContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "store" in value &&
    typeof (value as WipStateExecuteContext).store === "object" &&
    (value as WipStateExecuteContext).store !== null
  );
}
async function defaultWorktreesProvider(
  projectRoot: string,
  budget?: InventoryBudget,
): Promise<WipWorktreesProviderResult> {
  const access = await initStateDb(projectRoot);
  const result = await listWorktreesAcrossChanges(access, { budget });
  return {
    worktrees: result.unavailable
      ? []
      : result.records.map((r) => ({
          changeId: r.changeId ?? "",
          branch: r.branch,
          path: r.path,
          status: r.status,
          materialized: true,
        })),
    warnings: result.warnings,
    poisonedWorkflows: result.poisonedWorkflows,
    unavailable: result.unavailable,
    complete: result.complete,
    ...(result.stopReason ? { stopReason: result.stopReason } : {}),
    ...(result.stoppedStage ? { stoppedStage: result.stoppedStage } : {}),
    ...(typeof result.inspectedCount === "number"
      ? { inspectedCount: result.inspectedCount }
      : {}),
    ...(typeof result.candidateCount === "number"
      ? { candidateCount: result.candidateCount }
      : {}),
    ...(result.omitted ? { omitted: result.omitted } : {}),
  };
}

async function defaultSessionsProvider(
  projectRoot: string,
): ReturnType<NonNullable<WipStateProviders["sessionsProvider"]>> {
  return listPeerSessions({ projectRoot });
}

async function defaultTasksProvider(
  store: Store,
  changeId: string,
): Promise<Task[]> {
  if (!store.tasks?.list) return [];
  return store.tasks.list(changeId);
}

function normalizeWorktreesProviderValue(
  value: WipWorktreesProviderValue,
): WipWorktreesProviderResult {
  if (Array.isArray(value)) return { worktrees: value };
  return value;
}

function formatWorktreeWarning(warning: WorktreeCrossChangeWarning): string {
  const subject = warning.changeId
    ? `change ${warning.changeId}`
    : "worktree visibility";
  const evidence = warning.evidenceSummary
    ? ` Evidence: ${warning.evidenceSummary}`
    : "";
  return `${warning.message} (${subject}; ${warning.errorClass}).${evidence}`;
}

function toWipPoisonedWorkflowEntry(
  entry: WipPoisonedWorkflowEntry,
): WipPoisonedWorkflowEntry {
  return {
    ...entry,
    source: "worktrees",
  };
}

export const backlogTools = {
  adv_wip_state: {
    description:
      "Single-call aggregator: returns active changes (Temporal Visibility), worktrees (cross-change), and peer sessions in one tool response. Read-only. Source failures isolate per-section with warnings instead of failing the whole call (rq-backlogCoord04).",
    args: {
      // No public args. The fourth execute parameter accepts test-only provider
      // seams (omitted from the Zod schema so callers cannot pass them).
      _placeholder: z
        .never()
        .optional()
        .describe(
          "Reserved — adv_wip_state takes no public arguments. Project scope is derived from store.paths.root.",
        ),
    },
    execute: async (
      _args: Record<string, unknown>,
      ctx: Store | WipStateExecuteContext,
      _maybeOverridePath?: string,
      providers: WipStateProviders = {},
    ) => {
      const store = isWipStateExecuteContext(ctx) ? ctx.store : ctx;
      const signal = isWipStateExecuteContext(ctx) ? ctx.signal : undefined;
      const projectRoot = store.paths.root;
      const warnings: Array<{ source: string; reason: string }> = [];
      const degradation: WipStateDegradation = {};

      const worktreesProvider =
        providers.worktreesProvider ?? defaultWorktreesProvider;
      const sessionsProvider =
        providers.sessionsProvider ?? defaultSessionsProvider;

      const budget = createInventoryBudget({
        callerSignal: signal,
        timeoutMs: INVENTORY_INTERNAL_BUDGET_MS,
      });

      try {
        const [changesResult, worktreesResult, sessionsResult] =
          await Promise.allSettled([
            store.changes.list({}),
            worktreesProvider(projectRoot, budget),
            sessionsProvider(projectRoot),
          ]);

        let active_changes: WipStateResponse["active_changes"] = [];
        if (changesResult.status === "fulfilled") {
          active_changes = changesResult.value.changes.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            created_at: c.created_at,
            lastActivityAt: c.lastActivityAt,
            taskCount: c.taskCount,
            completedTasks: c.completedTasks,
            ops_followup: compactOpsFollowupAnnotation(c.ops_followup),
            ops_followup_links: compactOpsFollowupLinkAnnotations(
              c.ops_followup_links,
            ),
          }));
        } else {
          warnings.push({
            source: "active_changes",
            reason:
              changesResult.reason instanceof Error
                ? changesResult.reason.message
                : String(changesResult.reason),
          });
        }

        let worktrees: WipWorktreeEntry[] = [];
        let poisoned_workflows: WipPoisonedWorkflowEntry[] = [];
        if (worktreesResult.status === "fulfilled") {
          const value = normalizeWorktreesProviderValue(worktreesResult.value);
          worktrees = value.worktrees;
          poisoned_workflows = (value.poisonedWorkflows ?? []).map(
            toWipPoisonedWorkflowEntry,
          );
          for (const warning of value.warnings ?? []) {
            warnings.push({
              source: "worktrees",
              reason: formatWorktreeWarning(warning),
            });
          }
          if (value.unavailable && !(value.warnings?.length ?? 0)) {
            warnings.push({
              source: "worktrees",
              reason: "worktree visibility unavailable",
            });
          }
          if (value.complete === false) {
            degradation.worktree = {
              complete: false,
              stopReason: value.stopReason,
              stoppedStage: value.stoppedStage,
              inspectedCount: value.inspectedCount,
              candidateCount: value.candidateCount,
              omitted: value.omitted?.length,
            };
            warnings.push({
              source: "worktrees",
              reason: `Worktree snapshot incomplete (${
                value.stopReason ?? "unknown"
              }) at stage ${
                value.stoppedStage ?? "unknown"
              }. Active changes and peer sessions are still current; re-run if the worktree list looks stale.`,
            });
          }
        } else {
          warnings.push({
            source: "worktrees",
            reason:
              worktreesResult.reason instanceof Error
                ? worktreesResult.reason.message
                : String(worktreesResult.reason),
          });
          degradation.worktree = {
            complete: false,
            stopReason: "provider_error",
          };
        }

        let peer_sessions: WipPeerSessionEntry[] = [];
        const liveSessionIds = new Map<string, WipPeerSessionEntry>();
        if (sessionsResult.status === "fulfilled") {
          const value = sessionsResult.value;
          if (value.unavailable) {
            warnings.push({
              source: "peer_sessions",
              reason: "live peer-session detection unavailable",
            });
            warnings.push({
              source: "orphan_tasks",
              reason:
                "Live peer-session data unavailable; orphan task detection skipped.",
            });
          } else {
            peer_sessions = value.sessions;
            for (const s of peer_sessions) liveSessionIds.set(s.sessionId, s);
          }
        } else {
          warnings.push({
            source: "peer_sessions",
            reason:
              sessionsResult.reason instanceof Error
                ? sessionsResult.reason.message
                : String(sessionsResult.reason),
          });
          warnings.push({
            source: "orphan_tasks",
            reason: "Peer session list failed; orphan task detection skipped.",
          });
        }

        const orphan_warnings: NonNullable<
          WipStateResponse["orphan_warnings"]
        > = [];
        if (
          sessionsResult.status === "fulfilled" &&
          !sessionsResult.value.unavailable &&
          active_changes.length > 0
        ) {
          const tasksProvider =
            providers.tasksProvider ??
            ((changeId: string) => defaultTasksProvider(store, changeId));
          const taskLists = await Promise.allSettled(
            active_changes.map((c) => tasksProvider(c.id)),
          );
          for (let i = 0; i < active_changes.length; i += 1) {
            const change = active_changes[i];
            const listResult = taskLists[i];
            if (listResult.status !== "fulfilled") continue;
            for (const task of listResult.value) {
              if (task.status !== "in_progress") continue;
              const assignedTo = task.assignedTo?.trim();
              if (!assignedTo || assignedTo === "agent") continue;
              if (liveSessionIds.has(assignedTo)) continue;
              if (orphan_warnings.length >= MAX_ORPHAN_WARNINGS) break;
              orphan_warnings.push({
                changeId: change.id,
                taskId: task.id,
                taskTitle: task.title,
                assignedTo,
                recovery: ORPHAN_RECOVERY,
              });
            }
            if (orphan_warnings.length >= MAX_ORPHAN_WARNINGS) break;
          }
          if (orphan_warnings.length >= MAX_ORPHAN_WARNINGS) {
            warnings.push({
              source: "orphan_tasks",
              reason: `Orphan task warnings capped at ${MAX_ORPHAN_WARNINGS}; additional tasks omitted.`,
            });
          }
        }

        const response: WipStateResponse = {
          active_changes,
          worktrees,
          peer_sessions,
          poisoned_workflows,
          generated_at: new Date().toISOString(),
          warnings,
          ...(orphan_warnings.length > 0 ? { orphan_warnings } : {}),
          ...(Object.keys(degradation).length > 0 ? { degradation } : {}),
        };

        return formatToolOutput(response);
      } finally {
        budget.dispose();
      }
    },
  },
};
