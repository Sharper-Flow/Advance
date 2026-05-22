/**
 * Backlog Coordination Tools (rq-backlogCoord01..07).
 *
 * Two tools:
 *   - `adv_wip_state` (rq-backlogCoord04) — single-call WIP aggregator over
 *     active changes (Temporal Visibility via store), worktrees (Temporal
 *     Visibility via `listWorktreesAcrossChanges`), and peer sessions
 *     (privacy-defensive projection via `listPeerSessions`).
 *   - `adv_backlog_state` (rq-backlogCoord01, rq-backlogCoord05, rq-backlogCoord07)
 *     — ranked backlog reader with TTL-bounded freshness and O(1) Visibility
 *     annotation of active changes per issue number.
 *
 * Human-authority invariant (rq-backlogCoord06): neither tool exposes a
 * mutation surface for the Value (V) field. Both are read-only; V flows
 * only from human action via GitHub Project UI or explicit `/adv-triage`
 * user-mediated assignment. WSJF (V × TC × RROE / E) is unchanged.
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
  assessAnnotationFreshness,
  readSnapshotFile,
  type RoadmapBug,
  type RoadmapFeature,
  type RoadmapDeferred,
} from "./roadmap";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import { queryActiveChangesByIssueNumbers } from "../temporal/visibility-claim-queries";

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

/**
 * adv_backlog_state response shape — backlog items + annotations + freshness.
 */
export interface BacklogStateResponse {
  bugs: Array<RoadmapBug & { active_change?: { changeId: string } }>;
  features: Array<RoadmapFeature & { active_change?: { changeId: string } }>;
  deferred: RoadmapDeferred[];
  counts: { total: number; bugs: number; features: number; deferred: number };
  project: { owner: string; number: number; title: string };
  freshness: {
    needs_refresh: boolean;
    age_ms: number | null;
    ttl_ms: number;
    last_refreshed: string | null;
    next_refresh_after: string | null;
    refresh_reason?: string;
  };
}

/**
 * adv_backlog_state args (Zod-typed; mirror adv_roadmap filters).
 */
const BacklogStateArgsSchema = z.object({
  kind: z.enum(["bug", "feature", "all"]).optional(),
  top: z.number().int().positive().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  forceRefresh: z.boolean().optional(),
});

export interface BacklogStateProviders {
  /**
   * Visibility-backed annotator. Receives all snapshot issue numbers in a
   * single batch (rq-backlogCoord05). Production wires to
   * `queryActiveChangesByIssueNumbers`; tests inject a deterministic Map.
   */
  activeChangesAnnotator?: (
    projectId: string,
    issueNumbers: number[],
  ) => Promise<Map<number, { changeId: string }>>;
  /** Frozen clock for deterministic freshness assertions. */
  now?: Date;
}

async function defaultAnnotator(
  projectId: string,
  issueNumbers: number[],
): Promise<Map<number, { changeId: string }>> {
  const bundle = getService();
  if (!bundle) return new Map();
  const client = bundle.client as unknown as Parameters<
    typeof queryActiveChangesByIssueNumbers
  >[0];
  if (!client.workflow?.list) return new Map();
  const results = await queryActiveChangesByIssueNumbers(
    client,
    projectId,
    issueNumbers,
  );
  // Strip non-changeId fields for stable response shape.
  const m = new Map<number, { changeId: string }>();
  for (const [issue, info] of results) {
    m.set(issue, { changeId: info.changeId });
  }
  return m;
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

  adv_backlog_state: {
    description:
      "Single-call ranked-backlog read with TTL-bounded freshness and O(1) active-change annotation per issue number (rq-backlogCoord01, rq-backlogCoord05, rq-backlogCoord07). Replaces the agent-facing read path of `adv_roadmap` (which becomes a thin delegation wrapper in task C4).",
    args: BacklogStateArgsSchema.shape,
    execute: async (
      args: z.infer<typeof BacklogStateArgsSchema>,
      store: Store,
      _maybeOverridePath?: string,
      providers: BacklogStateProviders = {},
    ) => {
      const root = store.paths.root;
      const snapshot = await readSnapshotFile(root);
      if (!snapshot.ok) {
        return formatToolOutput({
          error: snapshot.error,
          hint: snapshot.hint,
        });
      }

      const now = providers.now ?? new Date();
      const freshness = assessAnnotationFreshness(snapshot.snapshot, now);
      const forceRefresh = Boolean(args.forceRefresh);

      // Annotate via single Visibility query (rq-backlogCoord05).
      const issueNumbers = [
        ...snapshot.snapshot.bugs.map((b) => b.number),
        ...snapshot.snapshot.features.map((f) => f.number),
      ];
      const annotator = providers.activeChangesAnnotator ?? defaultAnnotator;
      const projectId = (await getProjectId(root)) ?? "";
      const annotations = await annotator(projectId, issueNumbers);

      // Apply filters (mirror adv_roadmap semantics).
      const kindFilter = args.kind ?? "all";
      const priorityFilter = args.priority;
      const top = args.top;

      let bugs = snapshot.snapshot.bugs;
      let features = snapshot.snapshot.features;
      if (kindFilter === "bug") features = [];
      if (kindFilter === "feature") bugs = [];
      if (priorityFilter) {
        bugs = bugs.filter((b) => b.priority === priorityFilter);
      }
      if (top !== undefined) {
        features = features.slice(0, top);
      }

      const annotateBug = (
        b: RoadmapBug,
      ): RoadmapBug & { active_change?: { changeId: string } } => {
        const ac = annotations.get(b.number);
        return ac ? { ...b, active_change: ac } : { ...b };
      };
      const annotateFeature = (
        f: RoadmapFeature,
      ): RoadmapFeature & { active_change?: { changeId: string } } => {
        const ac = annotations.get(f.number);
        return ac ? { ...f, active_change: ac } : { ...f };
      };

      const response: BacklogStateResponse = {
        bugs: bugs.map(annotateBug),
        features: features.map(annotateFeature),
        deferred: snapshot.snapshot.deferred,
        counts: snapshot.snapshot.counts,
        project: snapshot.snapshot.project,
        freshness: {
          needs_refresh: forceRefresh ? true : freshness.needs_refresh,
          age_ms: freshness.age_ms,
          ttl_ms: freshness.ttl_ms,
          last_refreshed: freshness.last_refreshed,
          next_refresh_after: freshness.next_refresh_after,
          ...(forceRefresh
            ? { refresh_reason: "force_refresh_requested" }
            : freshness.needs_refresh
              ? { refresh_reason: "ttl_expired_or_unset" }
              : {}),
        },
      };

      return formatToolOutput(response);
    },
  },
};
