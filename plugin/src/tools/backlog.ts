/**
 * Backlog Coordination Tools (rq-backlogCoord04, rq-wipPoisonIsolation01).
 *
 * One tool:
 *   - `adv_wip_state` (rq-backlogCoord04) — single-call WIP aggregator over
 *     active changes via store, worktrees via `listWorktreesAcrossChanges`,
 *     and peer sessions
 *     (privacy-defensive projection via `listPeerSessions`).
 *
 * consolidateAdvToolSurface2 (tk-f022bfadbd81): `adv_backlog_state` was
 * removed completely; its TTL-bounded freshness and O(1) Visibility
 * annotation behavior moved into the sole backlog reader at the time.
 * reshapeTriagePortfolioBalance later retired the portfolio reader tool itself;
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
import { initStateDb, listWorktreesAcrossChanges } from "./worktree/state";
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

interface WorktreeInventoryWarning {
  changeId?: string;
  message: string;
  errorClass: string;
  evidenceSummary?: string;
}

export interface WipWorktreesProviderResult {
  worktrees: WipWorktreeEntry[];
  warnings?: WorktreeInventoryWarning[];
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
  /** Aggregate typed coordination claim inventory with completeness/overlap evidence. */
  claim_inventory?: WipClaimInventory;
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

/** A single valid typed coordination claim surfaced from an active change. */
export interface WipClaimInventoryEntry {
  change_id: string;
  scope_summary: string;
  responsibility: string;
  exact_identifiers: string[];
  generated_terms: string[];
  claimed_at: string;
  claimed_by?: string;
}

/** Exact-identifier conflict between two or more active changes. */
export interface WipClaimInventoryConflict {
  identifier: string;
  change_ids: string[];
}

/** Aggregate claim inventory with structural completeness and overlap evidence. */
export interface WipClaimInventory {
  claims: WipClaimInventoryEntry[];
  completeness: "complete" | "degraded" | "blocked";
  can_conclude_clean: boolean;
  conflicts: WipClaimInventoryConflict[];
  warnings: string[];
  /**
   * Optional advisory ranked search results. Present only when a free-text
   * query is supplied. Advisory search never assigns claims, establishes
   * ownership, or emits a no-conflict result; the exact-identifier overlap
   * path remains the sole authority.
   */
  advisory_search?: AdvisorySearchResult;
}

/** Input candidate for advisory free-text ranking. */
export interface AdvisorySearchCandidate {
  change_id: string;
  title: string;
  description?: string;
  scope_summary?: string;
  responsibility?: string;
  exact_identifiers: string[];
  generated_terms: string[];
}

/** A single ranked advisory match. */
export interface AdvisorySearchResultItem {
  change_id: string;
  title: string;
  responsibility?: string;
  scope_summary?: string;
  score: number;
  rank: number;
  matched_fields: string[];
  matched_terms: string[];
}

/** Advisory free-text search output. */
export interface AdvisorySearchResult {
  advisory: true;
  query: string;
  results: AdvisorySearchResultItem[];
  total_candidates: number;
  note: string;
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

function formatWorktreeWarning(warning: WorktreeInventoryWarning): string {
  const subject = warning.changeId
    ? `change ${warning.changeId}`
    : "worktree visibility";
  const evidence = warning.evidenceSummary
    ? ` Evidence: ${warning.evidenceSummary}`
    : "";
  return `${warning.message} (${subject}; ${warning.errorClass}).${evidence}`;
}

function isValidClaim(value: unknown): value is {
  scope_summary: string;
  responsibility: string;
  exact_identifiers: string[];
  generated_terms: string[];
  claimed_at: string;
  claimed_by?: string;
} {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.scope_summary === "string" &&
    typeof v.responsibility === "string" &&
    Array.isArray(v.exact_identifiers) &&
    Array.isArray(v.generated_terms) &&
    typeof v.claimed_at === "string"
  );
}

/**
 * Normalize and tokenize free text into lowercase alphanumeric tokens.
 * Hyphens and underscores are treated as delimiters so that identifier-shaped
 * substrings (e.g. "tk-refresh-001") collapse into searchable tokens.
 */
function tokenize(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function tokenMatches(queryToken: string, fieldTokens: string[]): boolean {
  return fieldTokens.some(
    (fieldToken) =>
      fieldToken === queryToken ||
      fieldToken.startsWith(queryToken) ||
      queryToken.startsWith(fieldToken),
  );
}

const MAX_ADVISORY_RESULTS = 20;

/**
 * Rank active changes against a free-text query using title, description,
 * scope summary, responsibility, exact identifiers, and generated terms.
 * Results are strictly advisory: they do not create claims, assign ownership,
 * or determine overlap/no-conflict.
 */
export function rankAdvisorySearch(
  query: string,
  candidates: AdvisorySearchCandidate[],
  completeness: WipClaimInventory["completeness"],
): AdvisorySearchResult {
  const queryTokens = tokenize(query);
  const resultItems: AdvisorySearchResultItem[] = [];

  if (queryTokens.length > 0) {
    for (const candidate of candidates) {
      const titleTokens = tokenize(candidate.title);
      const descriptionTokens = tokenize(candidate.description);
      const scopeTokens = tokenize(candidate.scope_summary);
      const responsibilityTokens = tokenize(candidate.responsibility ?? "");
      const exactIdTokens = candidate.exact_identifiers.flatMap((id) =>
        tokenize(id),
      );
      const generatedTokens = candidate.generated_terms.flatMap((t) =>
        tokenize(t),
      );

      let score = 0;
      const matchedFields = new Set<string>();
      const matchedTerms = new Set<string>();

      for (const token of queryTokens) {
        if (tokenMatches(token, titleTokens)) {
          score += 4;
          matchedFields.add("title");
          matchedTerms.add(token);
        }
        if (tokenMatches(token, descriptionTokens)) {
          score += 2;
          matchedFields.add("description");
          matchedTerms.add(token);
        }
        if (tokenMatches(token, scopeTokens)) {
          score += 3;
          matchedFields.add("scope_summary");
          matchedTerms.add(token);
        }
        if (tokenMatches(token, responsibilityTokens)) {
          score += 2;
          matchedFields.add("responsibility");
          matchedTerms.add(token);
        }
        if (tokenMatches(token, exactIdTokens)) {
          score += 3;
          matchedFields.add("exact_identifiers");
          matchedTerms.add(token);
        }
        if (tokenMatches(token, generatedTokens)) {
          score += 1;
          matchedFields.add("generated_terms");
          matchedTerms.add(token);
        }
      }

      if (score === 0) continue;

      resultItems.push({
        change_id: candidate.change_id,
        title: candidate.title,
        responsibility: candidate.responsibility,
        scope_summary: candidate.scope_summary,
        score,
        rank: 0,
        matched_fields: [...matchedFields],
        matched_terms: [...matchedTerms],
      });
    }

    resultItems.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title);
    });

    let currentRank = 0;
    let previousScore: number | undefined;
    for (const item of resultItems.slice(0, MAX_ADVISORY_RESULTS)) {
      if (item.score !== previousScore) {
        currentRank += 1;
        previousScore = item.score;
      }
      item.rank = currentRank;
    }
  }

  const baseNote =
    "Advisory discovery only. Exact identifier overlap in claim_inventory.conflicts remains the authority for ownership/no-conflict; search results do not assign claims.";
  const completenessNote =
    completeness !== "complete"
      ? " Inventory completeness is not 'complete'; results may omit active changes."
      : "";

  return {
    advisory: true,
    query: query.trim(),
    results: resultItems.slice(0, MAX_ADVISORY_RESULTS),
    total_candidates: candidates.length,
    note: `${baseNote}${completenessNote}`,
  };
}

/**
 * Build the aggregate claim inventory from active changes and determine
 * whether it is complete enough to conclude "no conflict".
 *
 * Only exact_identifier overlap is checked; generated_terms are surfaced for
 * transparency but intentionally excluded from conflict detection (fuzzy
 * matching is out of scope).
 */
function buildClaimInventory(
  activeChanges: Array<{
    id: string;
    title?: string;
    description?: string;
    coordination_claim?: unknown;
  }>,
  worktreeState: {
    available: boolean;
    complete: boolean;
  },
  activeChangesAvailable: boolean,
  query?: string,
): WipClaimInventory {
  const warnings: string[] = [];
  let completeness: WipClaimInventory["completeness"] = "complete";

  if (!activeChangesAvailable) {
    completeness = "blocked";
    warnings.push(
      "Active change enumeration failed; claim inventory cannot be built.",
    );
  } else if (!worktreeState.available) {
    completeness = "blocked";
    warnings.push(
      "Worktree inventory unavailable; claim inventory cannot be verified as complete.",
    );
  } else if (!worktreeState.complete) {
    completeness = "degraded";
    warnings.push(
      "Worktree inventory is incomplete or timed out; claim inventory may be missing active changes.",
    );
  }

  const claims: WipClaimInventoryEntry[] = [];
  const identifierIndex = new Map<string, string[]>();
  const searchCandidates: AdvisorySearchCandidate[] = [];

  for (const change of activeChanges) {
    const baseCandidate: AdvisorySearchCandidate = {
      change_id: change.id,
      title: change.title ?? "",
      description: change.description,
      exact_identifiers: [],
      generated_terms: [],
    };

    if (!isValidClaim(change.coordination_claim)) {
      if (activeChangesAvailable) {
        searchCandidates.push(baseCandidate);
      }
      continue;
    }

    const claim = change.coordination_claim;
    claims.push({
      change_id: change.id,
      scope_summary: claim.scope_summary,
      responsibility: claim.responsibility,
      exact_identifiers: claim.exact_identifiers,
      generated_terms: claim.generated_terms,
      claimed_at: claim.claimed_at,
      ...(claim.claimed_by !== undefined
        ? { claimed_by: claim.claimed_by }
        : {}),
    });

    searchCandidates.push({
      ...baseCandidate,
      scope_summary: claim.scope_summary,
      responsibility: claim.responsibility,
      exact_identifiers: claim.exact_identifiers,
      generated_terms: claim.generated_terms,
    });

    for (const id of claim.exact_identifiers) {
      const entry = identifierIndex.get(id);
      if (entry) {
        entry.push(change.id);
      } else {
        identifierIndex.set(id, [change.id]);
      }
    }
  }

  const conflicts: WipClaimInventoryConflict[] = [];
  for (const [identifier, changeIds] of identifierIndex.entries()) {
    if (changeIds.length > 1) {
      conflicts.push({ identifier, change_ids: [...changeIds] });
    }
  }

  if (conflicts.length > 0) {
    warnings.push(
      `Exact identifier overlap detected on ${conflicts.length} identifier(s); no-conflict conclusion is unsafe.`,
    );
  }

  const can_conclude_clean =
    completeness === "complete" && conflicts.length === 0;

  const inventory: WipClaimInventory = {
    claims,
    completeness,
    can_conclude_clean,
    conflicts,
    warnings,
  };

  const normalizedQuery = query?.trim();
  if (normalizedQuery) {
    inventory.advisory_search = rankAdvisorySearch(
      normalizedQuery,
      searchCandidates,
      completeness,
    );
  }

  return inventory;
}

export const backlogTools = {
  adv_wip_state: {
    description:
      "Single-call aggregator: returns active changes, worktrees, and peer sessions in one tool response. Read-only. Source failures isolate per-section with warnings instead of failing the whole call (rq-backlogCoord04).",
    args: {
      query: z
        .string()
        .max(200)
        .optional()
        .describe(
          "Optional free-text advisory search query. When provided, claim_inventory includes ranked advisory results over titles, descriptions, scope claims, responsibility, and identifiers. Search is advisory only and never assigns claims or emits a no-conflict result.",
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
      let worktreeInventoryAvailable: boolean;
      let worktreeInventoryComplete: boolean;

      const worktreesProvider =
        providers.worktreesProvider ?? defaultWorktreesProvider;
      const sessionsProvider =
        providers.sessionsProvider ?? defaultSessionsProvider;

      const budget = createInventoryBudget({
        callerSignal: signal,
        timeoutMs: INVENTORY_INTERNAL_BUDGET_MS,
      });

      const query =
        typeof _args.query === "string" ? _args.query.trim() : undefined;

      try {
        const [changesResult, worktreesResult, sessionsResult] =
          await Promise.allSettled([
            store.changes.list({}),
            worktreesProvider(projectRoot, budget),
            sessionsProvider(projectRoot),
          ]);

        let active_changes: WipStateResponse["active_changes"] = [];
        const rawActiveChanges: Array<{
          id: string;
          title?: string;
          description?: string;
          coordination_claim?: unknown;
        }> = [];
        if (changesResult.status === "fulfilled") {
          const filtered = changesResult.value.changes.filter(
            (c) => c.status !== "archived" && c.status !== "closed",
          );
          for (const c of filtered) {
            rawActiveChanges.push(c);
          }
          active_changes = filtered.map((c) => ({
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
        if (worktreesResult.status === "fulfilled") {
          const value = normalizeWorktreesProviderValue(worktreesResult.value);
          worktrees = value.worktrees;
          worktreeInventoryAvailable = true;
          worktreeInventoryComplete = value.complete !== false;
          if (value.unavailable) {
            worktreeInventoryAvailable = false;
            worktreeInventoryComplete = false;
          }
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
          worktreeInventoryAvailable = false;
          worktreeInventoryComplete = false;
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

        const claim_inventory = buildClaimInventory(
          rawActiveChanges,
          {
            available: worktreeInventoryAvailable,
            complete: worktreeInventoryComplete,
          },
          changesResult.status === "fulfilled",
          query,
        );

        const response: WipStateResponse = {
          active_changes,
          worktrees,
          peer_sessions,
          generated_at: new Date().toISOString(),
          warnings,
          claim_inventory,
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
