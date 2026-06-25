/**
 * adv CLI — shared type definitions
 *
 * Types shared across bin/lib modules and bin/adv.
 * Zero dependencies; compatible with Bun runtime.
 */

export interface GateState {
  status: string;
  completed_at?: string;
  completed_by?: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  status: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  cancellation?: { approved_at?: string };
}

export interface WisdomEntry {
  recorded_at?: string;
}

export interface ChangeRecord {
  id: string;
  title: string;
  status: string;
  lifecycleState?: string;
  created_at: string;
  tasks: TaskRecord[];
  gates?: Record<string, GateState>;
  wisdom?: WisdomEntry[];
  validation?: { validated_at?: string };
  fast_follow_of?: { parent_change_id?: string };
  lastSignalAt?: string;
}

export interface ChangeSummary {
  id: string;
  title: string;
  status: string;
  lifecycleState?: string;
  recency: "hot" | "warm" | "stale";
  lastActivityAt: string;
  minutesSinceActivity: number;
  tasksDone: number;
  tasksTotal: number;
  firstIncompleteGate: string | null;
  gateProgressStr: string;
  parentChangeId?: string;
}

export interface LiveStatusPayload {
  source: "temporal";
  live: boolean;
  stale: false;
  generated_at: string;
  project_id: string;
  counts: {
    active: number;
    archived: number;
    closed: number;
  };
  changes: ChangeSummary[];
  error?: string;
  remediation?: string;
}
