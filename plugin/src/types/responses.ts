/**
 * Tool Response Types Domain
 *
 * SpecListResponse, ChangeListResponse, TaskReadyResponse,
 * ChangeRecency, ProjectStatus.
 */

import type { Task } from "./tasks";
import type {
  ChangeStatus,
  FastFollowOf,
  OpsFollowupLink,
  OpsFollowupProfile,
} from "./changes";

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
  | "workflow_query";

export type TerminalWarningCode =
  | "TERMINAL_SOURCE_DEGRADED"
  | "TERMINAL_CANDIDATE_OMITTED"
  | "SOURCE_DEADLINE_EXCEEDED";

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
  terminalFromWorkflow: number;
  omitted: number;
}

export interface HydrationStats {
  totalIds?: number;
  fromMemo?: number;
  fromCache?: number;
  fromHydration?: number;
  terminalCandidates?: number;
  terminalFromArchive?: number;
  terminalFromDisk?: number;
  terminalFromWorkflow?: number;
  omitted?: number;
  /**
   * True when the request-scoped aggregate read deadline
   * (TEMPORAL_READ_DEADLINE_BUDGET_MS) expired before all required
   * sources/candidates resolved. A result carrying this flag is
   * explicitly degraded — never a complete-looking partial.
   */
  deadlineExceeded?: boolean;
}

export interface ChangeListResponse {
  changes: Array<{
    id: string;
    title: string;
    status: ChangeStatus;
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
}
