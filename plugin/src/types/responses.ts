/**
 * Tool Response Types Domain
 *
 * SpecListResponse, ChangeListResponse, TaskReadyResponse,
 * ChangeRecency, ProjectStatus.
 */

import type { Task } from "./tasks";
import type { ChangeStatus, FastFollowOf } from "./changes";

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
  }>;
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
