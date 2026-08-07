export type WorktreeRecordStatus =
  | "unmaterialized"
  | "materializing"
  | "created"
  | "active"
  | "idle"
  | "setup_failed"
  | "pending_delete"
  | "merged"
  | "stale"
  | "deleted";

export interface PendingWorktreeDelete {
  branch: string;
  path: string;
  reason: string;
  recordedAt: string;
  attempts: number;
}

export interface WorktreeRecord {
  branch: string;
  path?: string;
  materialized?: boolean;
  changeId?: string;
  status: WorktreeRecordStatus;
  createdAt: string;
  lastSeenAt: string;
  baseRef: string;
  headSha: string;
  source: "tool" | "git_census";
  sourceVersion: number;
  setupReady?: boolean;
  setupFailureReason?: string;
  dirty?: boolean;
  merged?: boolean;
  cleanupEligible?: boolean;
  cleanupBlockedBy?: string[];
  pendingDelete?: PendingWorktreeDelete;
}

export type MaterializedWorktreeRecord = WorktreeRecord & {
  path: string;
  materialized: true;
};
