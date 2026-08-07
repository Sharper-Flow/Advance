/**
 * Tool Response Types Domain
 *
 * SpecListResponse, ChangeListResponse, TaskReadyResponse,
 * ChangeRecency, ProjectStatus.
 */

import type { Task } from "./tasks";
import type {
  ChangeLifecycleState,
  ChangeStatus,
  FastFollowOf,
  OpsFollowupLink,
  OpsFollowupProfile,
} from "./changes";
import type { GateId } from "./gates";

// =============================================================================
// Tool Response Types
// =============================================================================

export interface SpecListResponse {
  specs: Array<{
    name: string;
    title: string;
    version: string;
    requirementCount: number;
  }>;
}

export type TerminalSource =
  | "visibility"
  | "active_disk"
  | "archive"
  | "projection_read";

export type TerminalWarningCode =
  | "TERMINAL_SOURCE_DEGRADED"
  | "TERMINAL_CANDIDATE_OMITTED"
  | "SOURCE_DEADLINE_EXCEEDED"
  | "SOURCE_PROJECTION_DURABLY_ABSENT"
  | "SOURCE_BOUND_EXCEEDED"
  | "SOURCE_RANKING_DEGRADED";

export interface TerminalWarning {
  code: TerminalWarningCode;
  source: TerminalSource;
  message: string;
  omittedCount?: number;
  /**
   * Bounded list of candidate IDs omitted by this warning (max 20).
   * Present when specific candidates could not be resolved — e.g. after
   * the aggregate read deadline expired — so operators can re-query the
   * named changes instead of inferring completeness from row counts.
   */
  omittedIds?: string[];
}

export interface TerminalHydrationStats {
  terminalCandidates: number;
  terminalFromArchive: number;
  terminalFromDisk: number;
  terminalFromProjection: number;
  omitted: number;
}

export interface HydrationStats {
  totalIds?: number;
  fromMemo?: number;
  fromHydration?: number;
  terminalCandidates?: number;
  terminalFromArchive?: number;
  terminalFromDisk?: number;
  terminalFromProjection?: number;
  omitted?: number;
  /**
   * True when the request-scoped aggregate read deadline
   * (STATUS_READ_DEADLINE_BUDGET_MS) expired before all required
   * sources/candidates resolved. A result carrying this flag is
   * explicitly degraded — never a complete-looking partial.
   */
  deadlineExceeded?: boolean;
  /**
   * Candidates truncated by a caller-supplied read bound (e.g. the
   * summary recent limit) before hydration. Present only when the bound
   * cut candidates; counts/recency derived from such a result are
   * explicitly incomplete.
   */
  boundedOmitted?: number;
  /** True when the workflow source is durably absent after a disk projection read. */
  durableAbsence?: boolean;
  /**
   * Specific candidate IDs omitted because the aggregate read deadline
   * expired or the circuit breaker tripped. Present when callers need to
   * re-query named items instead of inferring completeness from counts.
   */
  omittedIds?: string[];
}

export interface ChangeListResponse {
  changes: Array<{
    id: string;
    title: string;
    status: ChangeStatus;
    /**
     * First non-done gate in gate order, or "done" when all gates are
     * complete. Additive gate-progress hint used by adv_change_list to
     * derive the per-row `phase` (legacy status stays "draft" for every
     * open change, so it cannot convey progress).
     */
    currentGate: GateId | "done";
    /** Lifecycle authority (open/archived/closed); optional on legacy rows. */
    lifecycleState?: ChangeLifecycleState;
    created_at: string;
    lastActivityAt: string;
    taskCount: number;
    completedTasks: number;
    /** Same-project fast-follow lineage (optional) */
    fast_follow_of?: FastFollowOf;
    /** Convenience top-level annotation when fast_follow_of is set (added by adv_change_list) */
    parent_change_id?: string;
    /** Inbound ops follow-up profile when this change is a linked follow-up. */
    ops_followup?: OpsFollowupProfile;
    /** Outbound ops follow-up links when this change has promoted follow-ups. */
    ops_followup_links?: OpsFollowupLink[];
    /** Optional Epic membership projection for bounded list/status annotation. */
    epic_membership?: import("./epics").EpicMembership;
    /**
     * Capability names derived from the change's deltas. Populated by
     * authoritative Store implementations for one-pass validation
     * inventory projection; omitted when the Store cannot expose it
     * without a second read.
     */
    capabilities?: string[];
  }>;
  warnings?: TerminalWarning[];
  hydrationStats?: HydrationStats;
}

export interface TaskReadyResponse {
  ready: Task[];
  blocked: Array<{
    task: Task;
    blockedBy: string[];
  }>;
  /** Context for tasks unblocked by cancelled blockers */
  cancelledBlockerContext?: Array<{
    taskId: string;
    cancelledBlockerId: string;
    cancellationReason: string;
  }>;
}

interface _ArchiveResult {
  success: boolean;
  specsUpdated: string[];
  docsGenerated: string[];
  archivePath: string;
}

/**
 * Per-change activity summary included in ProjectStatus.
 * Computed from the most recent timestamp across tasks, gates, and change metadata.
 */
export interface ChangeRecency {
  /** Change ID */
  id: string;
  /** Change title */
  title: string;
  /** Change status */
  status: ChangeStatus;
  /** Tasks completed / total */
  completedTasks: number;
  taskCount: number;
  /** ISO8601 timestamp of the most recent activity on this change */
  lastActivityAt: string;
  /** Minutes elapsed since lastActivityAt (at time of status generation) */
  minutesSinceActivity: number;
  /** Parent change ID when this change is a same-project fast-follow */
  parent_change_id?: string;
}

export interface ProjectStatus {
  specs: {
    count: number;
    capabilities: string[];
  };
  changes: {
    active: number;
    byStatus: Record<ChangeStatus, number>;
    /** Active (non-archived) changes sorted by most recent activity first */
    recent: ChangeRecency[];
  };
  recommendations: string[];
  /**
   * Request-local resolved change documents keyed by canonical id
   * (fixChangeListTimeouts KD4). Transport-only: lets `adv_status`
   * enrichment reuse already-hydrated documents/proposal projections
   * instead of issuing duplicate per-change reads. Callers MUST strip
   * this field before serializing tool output; it is never truth beyond
   * the single status read that produced it.
   */
  resolvedChanges?: ReadonlyMap<string, import("./changes").Change>;
  /**
   * Typed degradation from bounded/deadline-limited status resolution
   * (C2). Present only when the result is incomplete.
   */
  warnings?: TerminalWarning[];
  /** Hydration/degradation statistics for the status read, when any. */
  hydrationStats?: HydrationStats;
}
