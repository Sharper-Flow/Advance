/** Process facts for an active ADV session. */
export interface SessionRecord {
  sessionId: string;
  worktreeBranch?: string;
  worktreePath: string;
  pid: number;
  startedAt: string;
  lastSeenAt: string;
  activeChangeId?: string;
  currentTaskId?: string;
  activeGate?: string;
}
