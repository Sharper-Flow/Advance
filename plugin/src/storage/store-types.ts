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
  Gates,
  GateId,
} from "../types";
import type { ProjectPaths, LoadResult } from "./json";

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
    recordEvidence: (
      taskId: string,
      phase: "red" | "green",
      evidence: TddPhaseEvidence,
    ) => Promise<Task | null>;
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
  };

  // Gates
  gates: {
    get: (changeId: string) => Promise<Gates | null>;
    complete: (changeId: string, gateId: GateId) => Promise<void>;
    /** Reopen from a gate: reset it and all downstream gates to pending, record re-entry history */
    reopenFrom: (
      changeId: string,
      fromGate: GateId,
      reason: string,
      scopeDelta?: string,
      reopenedBy?: string,
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
  };
}
