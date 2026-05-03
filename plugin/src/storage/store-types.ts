/**
 * Store Types
 *
 * Exported Store interface, SearchResult, and recency utility functions.
 * Extracted from store.ts to keep the composition root under 300 lines.
 */

import { GATE_ORDER } from "../types";
import type {
  Spec,
  Change,
  ChangeClosure,
  Task,
  TaskType,
  ProjectConfig,
  SpecListResponse,
  ChangeListResponse,
  TaskReadyResponse,
  ProjectStatus,
  ChangeRecency,
  RecencyBand,
  TddPhase,
  TddPhaseEvidence,
  WisdomEntry,
  WisdomType,
  Cancellation,
  TddReclassification,
  TaskRunEvent,
  TaskRunState,
  Gates,
  GateId,
  BulkCloseResult,
} from "../types";
import type { ProjectPaths, LoadResult } from "./json";

// Inlined from former ./sqlite module (deleted in P2.7).
export interface WisdomSearchResult {
  id: string;
  type: WisdomType;
  content: string;
  source_task?: string;
  recorded_at: string;
  scope: string;
  change_id?: string;
  highlight?: string;
}

export interface TaskEvidenceRecordResult {
  task: Task;
  duplicate: boolean;
  corrected: boolean;
  correctionReason?: string;
}

export interface Store {
  paths: ProjectPaths;
  config: ProjectConfig | null;

  // Lifecycle
  init: () => Promise<void>;
  sync: () => Promise<void>;
  close: () => void;
  flush: () => Promise<void>;

  // Specs
  specs: {
    list: (filter?: {
      capability?: string;
      tag?: string;
    }) => Promise<SpecListResponse>;
    get: (capability: string) => Promise<LoadResult<Spec | null>>;
    search: (query: string, limit?: number) => Promise<SearchResult[]>;
    save: (spec: Spec) => Promise<void>;
  };

  // Changes
  changes: {
    list: (filter?: {
      status?: string;
      includeArchived?: boolean;
      includeClosed?: boolean;
      prefix?: string;
      titleContains?: string;
      createdBefore?: string;
      lastActivityBefore?: string;
    }) => Promise<ChangeListResponse>;
    get: (changeId: string) => Promise<LoadResult<Change | null>>;
    create: (
      summary: string,
      capability?: string,
      proposalContent?: string,
      problemStatementContent?: string,
      agreementContent?: string,
      designContent?: string,
    ) => Promise<{
      changeId: string;
      path: string;
      problemStatementPath?: string;
      agreementPath?: string;
      designPath?: string;
      duplicateWarning?: string;
    }>;
    save: (change: Change) => Promise<void>;
    updateArtifacts: (
      changeId: string,
      proposalContent?: string,
      problemStatementContent?: string,
      agreementContent?: string,
      designContent?: string,
    ) => Promise<{
      success: boolean;
      proposalPath?: string;
      problemStatementPath?: string;
      agreementPath?: string;
      designPath?: string;
      error?: string;
    }>;
    close: (changeId: string, closure: ChangeClosure) => Promise<Change | null>;
    closeBatch: (
      changeIds: string[],
      closure: ChangeClosure,
    ) => Promise<BulkCloseResult>;
  };

  // Tasks
  tasks: {
    list: (
      changeId: string,
      status?: string,
      filter?: string,
    ) => Promise<Task[]>;
    ready: (changeId: string) => Promise<TaskReadyResponse>;
    update: (
      taskId: string,
      status: string,
      notes?: string,
      implementationSummary?: string,
      errorRecovery?: Task["error_recovery"],
      touchedFiles?: string[],
    ) => Promise<Task | null>;
    add: (
      changeId: string,
      content: string,
      options?: {
        blockedBy?: string[];
        section?: string;
        type?: TaskType;
        metadata?: Record<string, string>;
      },
    ) => Promise<Task>;
    get: (taskId: string) => Promise<Task | null>;
    show: (taskId: string) => Promise<{ task: Task; changeId: string } | null>;
    getRun: (taskId: string) => Promise<TaskRunState | null>;
    listRuns: (changeId: string) => Promise<TaskRunState[]>;
    recordRunEvent: (
      taskId: string,
      event: TaskRunEvent,
    ) => Promise<{ duplicate: boolean; run: TaskRunState } | null>;
    recordEvidence: (
      taskId: string,
      phase: "red" | "green",
      evidence: TddPhaseEvidence,
      options?: { correctionReason?: string },
    ) => Promise<TaskEvidenceRecordResult | null>;
    setPhase: (taskId: string, phase: TddPhase) => Promise<Task | null>;
    cancel: (
      taskId: string,
      cancellation: Cancellation,
    ) => Promise<Task | null>;
    reclassifyTdd: (
      taskId: string,
      reclassification: TddReclassification,
    ) => Promise<Task | null>;
  };

  // Wisdom
  wisdom: {
    add: (
      changeId: string,
      type: WisdomType,
      content: string,
      sourceTask?: string,
    ) => Promise<WisdomEntry>;
    list: (changeId: string) => Promise<WisdomEntry[]>;
    search: (
      query: string,
      options?: { changeId?: string; type?: WisdomType },
    ) => Promise<WisdomSearchResult[]>;
    listAll: (options?: {
      type?: WisdomType;
    }) => Promise<Array<WisdomEntry & { scope: string; change_id?: string }>>;
  };

  // Gates
  gates: {
    get: (changeId: string) => Promise<Gates | null>;
    complete: (
      changeId: string,
      gateId: GateId,
      notes?: string,
    ) => Promise<void>;
    /** Reopen from a gate: reset it and all downstream gates to pending, record re-entry history */
    reopenFrom: (
      changeId: string,
      fromGate: GateId,
      reason: string,
      scopeDelta?: string,
      reopenedBy?: string,
      approvalEvidence?: string,
    ) => Promise<void>;
  };

  // Status
  status: () => Promise<ProjectStatus>;
}

export interface SearchResult {
  spec: string;
  requirement: string;
  title: string;
  match: string;
}

// =============================================================================
// Recency Helpers
// =============================================================================

const RECENCY_HOT_THRESHOLD_MIN = 60;
const RECENCY_STALE_THRESHOLD_MIN = 180;

export function classifyRecency(minutesSince: number): RecencyBand {
  if (minutesSince <= RECENCY_HOT_THRESHOLD_MIN) return "hot";
  if (minutesSince >= RECENCY_STALE_THRESHOLD_MIN) return "stale";
  return "warm";
}

export function computeLastActivity(change: Change): string {
  let latest = change.created_at;
  const consider = (ts: string | null | undefined) => {
    if (ts && ts > latest) latest = ts;
  };

  for (const task of change.tasks) {
    consider(task.created_at);
    consider(task.started_at);
    consider(task.completed_at);
    if (task.cancellation?.approved_at) consider(task.cancellation.approved_at);
  }

  if (change.gates) {
    for (const gateId of GATE_ORDER) {
      consider(change.gates[gateId]?.completed_at);
    }
  }

  consider(change.validation?.validated_at);
  if (change.wisdom) {
    for (const entry of change.wisdom) consider(entry.recorded_at);
  }

  return latest;
}

export function buildChangeRecency(
  change: Change,
  tasks: { total: number; done: number },
  now: Date,
): ChangeRecency {
  const lastActivityAt = computeLastActivity(change);
  const activityDate = new Date(lastActivityAt);
  const minutesSinceActivity = Math.max(
    0,
    Math.floor((now.getTime() - activityDate.getTime()) / 60000),
  );
  return {
    id: change.id,
    title: change.title,
    status: change.status,
    completedTasks: tasks.done,
    taskCount: tasks.total,
    lastActivityAt,
    minutesSinceActivity,
    recency: classifyRecency(minutesSinceActivity),
    parent_change_id: change.fast_follow_of?.parent_change_id,
  };
}
