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
 * annotation behavior moved into the retained sole backlog reader,
 * `adv_roadmap` (plugin/src/tools/roadmap.ts). No wrapper or alias remains.
 *
 * Snapshot invariant: all scoring fields may be null; this tool is read-only
 * on snapshot. GH Project remains canonical for any remaining numeric data.
 */
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";
import {
  initStateDb,
  listWorktreesAcrossChanges,
  type WorktreeCrossChangeWarning,
  type WorktreePoisonedWorkflowEntry,
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
  source: "worktrees";
  changeId: string;
  workflowId: string;
  recoveryReason: "poisoned_history" | "missing_workflow" | "query_failed";
  evidenceSummary: string;
  message: string;
}

export interface WipWorktreesProviderResult {
  worktrees: WipWorktreeEntry[];
  warnings?: WorktreeCrossChangeWarning[];
  poisonedWorkflows?: WorktreePoisonedWorkflowEntry[];
  unavailable?: boolean;
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
}

/**
 * Injection seam for tests. Production uses default providers that wire to
 * `listWorktreesAcrossChanges` + `listPeerSessions`.
 */
export interface WipStateProviders {
  worktreesProvider?: (
    projectRoot: string,
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
}

async function defaultWorktreesProvider(
  projectRoot: string,
): Promise<WipWorktreesProviderResult> {
  const access = await initStateDb(projectRoot);
  const result = await listWorktreesAcrossChanges(access);
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
  };
}

async function defaultSessionsProvider(
  projectRoot: string,
): ReturnType<NonNullable<WipStateProviders["sessionsProvider"]>> {
  return listPeerSessions({ projectRoot });
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
  entry: WorktreePoisonedWorkflowEntry,
): WipPoisonedWorkflowEntry {
  return {
    source: "worktrees",
    changeId: entry.changeId,
    workflowId: entry.workflowId,
    recoveryReason: entry.recoveryReason,
    evidenceSummary: entry.evidenceSummary,
    message: entry.message,
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
      store: Store,
      _maybeOverridePath?: string,
      providers: WipStateProviders = {},
    ) => {
      const projectRoot = store.paths.root;
      const warnings: Array<{ source: string; reason: string }> = [];

      const worktreesProvider =
        providers.worktreesProvider ?? defaultWorktreesProvider;
      const sessionsProvider =
        providers.sessionsProvider ?? defaultSessionsProvider;

      const [changesResult, worktreesResult, sessionsResult] =
        await Promise.allSettled([
          store.changes.list({}),
          worktreesProvider(projectRoot),
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
      } else {
        warnings.push({
          source: "worktrees",
          reason:
            worktreesResult.reason instanceof Error
              ? worktreesResult.reason.message
              : String(worktreesResult.reason),
        });
      }

      let peer_sessions: WipPeerSessionEntry[] = [];
      if (sessionsResult.status === "fulfilled") {
        const value = sessionsResult.value;
        if (value.unavailable) {
          warnings.push({
            source: "peer_sessions",
            reason: "session registry unavailable",
          });
        } else {
          peer_sessions = value.sessions;
        }
      } else {
        warnings.push({
          source: "peer_sessions",
          reason:
            sessionsResult.reason instanceof Error
              ? sessionsResult.reason.message
              : String(sessionsResult.reason),
        });
      }

      const response: WipStateResponse = {
        active_changes,
        worktrees,
        peer_sessions,
        poisoned_workflows,
        generated_at: new Date().toISOString(),
        warnings,
      };

      return formatToolOutput(response);
    },
  },
};
