/**
 * Backlog Coordination Tools (rq-backlogCoord01..07).
 *
 * Two tools today:
 *   - `adv_wip_state` (rq-backlogCoord04) — single-call WIP aggregator over
 *     active changes (Temporal Visibility via store), worktrees (Temporal
 *     Visibility via `listWorktreesAcrossChanges`), and peer sessions
 *     (privacy-defensive projection via `listPeerSessions`).
 *
 * `adv_backlog_state` (rq-backlogCoord01, rq-backlogCoord05, rq-backlogCoord07)
 * is added in a subsequent task (C1).
 */
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";
import { initStateDb, listWorktreesAcrossChanges } from "./worktree/state";
import { listPeerSessions } from "./session";

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

export interface WipStateResponse {
  active_changes: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    lastActivityAt: string;
    taskCount: number;
    completedTasks: number;
  }>;
  worktrees: WipWorktreeEntry[];
  peer_sessions: WipPeerSessionEntry[];
  generated_at: string;
  warnings: Array<{ source: string; reason: string }>;
}

/**
 * Injection seam for tests. Production uses default providers that wire to
 * `listWorktreesAcrossChanges` + `listPeerSessions`.
 */
export interface WipStateProviders {
  worktreesProvider?: (projectRoot: string) => Promise<WipWorktreeEntry[]>;
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
): Promise<WipWorktreeEntry[]> {
  const access = await initStateDb(projectRoot);
  const records = await listWorktreesAcrossChanges(access);
  if (records === null) return [];
  return records.map((r) => ({
    changeId: r.changeId ?? "",
    branch: r.branch,
    path: r.path,
    status: r.status,
    materialized: true,
  }));
}

async function defaultSessionsProvider(
  projectRoot: string,
): ReturnType<NonNullable<WipStateProviders["sessionsProvider"]>> {
  return listPeerSessions({ projectRoot });
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
      if (worktreesResult.status === "fulfilled") {
        worktrees = worktreesResult.value;
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
        generated_at: new Date().toISOString(),
        warnings,
      };

      return formatToolOutput(response);
    },
  },
};
