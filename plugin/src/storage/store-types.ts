/**
 * Store Types
 *
 * Exported Store interface, SearchResult, and activity helpers.
 * Extracted from store.ts to keep the composition root under 300 lines.
 */

import { GATE_ORDER } from "../types";
import type {
  ArtifactPayload,
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
  WisdomEntry,
  WisdomType,
  Cancellation,
  TddReclassification,
  Gates,
  GateId,
  BulkCloseResult,
  Epic,
  EpicEntry,
} from "../types";
import type { ProjectPaths, LoadResult } from "./json";
import type { ProductContext } from "./product-context";

export interface ProductOriginTags {
  product_id?: string;
  origin_repo_id?: string;
  origin_repo_project_id?: string;
  origin_repo_path?: string;
}

export interface ChangeCreateInitialMetadata {
  origin?: Change["origin"];
  fast_follow_of?: Change["fast_follow_of"];
  cross_project_origin?: Change["cross_project_origin"];
  scope_repos?: Change["scope_repos"];
  epic_membership?: Change["epic_membership"];
}

export interface ChangeCreateOptions {
  initialMetadata?: ChangeCreateInitialMetadata;
}

/**
 * Options-object input for `Store.changes.create()`. Replaces the positional
 * 7-arg artifact API. Artifact content is carried in `artifacts` keyed by
 * canonical `ArtifactKind`. Only defined fields are written; undefined fields
 * are no-ops.
 *
 * `capability` and `initialMetadata` are folded in from the legacy positional
 * shape. The positional signature remains alongside this options-object
 * variant until T20 deletes it atomically (see removePositionalArtifactApi
 * change plan KD-10 phase 17).
 */
export interface ChangeCreateOptionsBag {
  capability?: string;
  artifacts?: ArtifactPayload;
  initialMetadata?: ChangeCreateInitialMetadata;
}

export interface ChangeCreateResult {
  changeId: string;
  path: string;
  problemStatementPath?: string;
  agreementPath?: string;
  designPath?: string;
  executiveSummaryPath?: string;
  acceptancePath?: string;
  duplicateWarning?: string;
}

export interface UpdateArtifactsResult {
  success: boolean;
  proposalPath?: string;
  problemStatementPath?: string;
  agreementPath?: string;
  designPath?: string;
  executiveSummaryPath?: string;
  acceptancePath?: string;
  error?: string;
}

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

export interface Store {
  paths: ProjectPaths;
  config: ProjectConfig | null;
  /** Product-link identity context. Omitted for legacy/mock stores. */
  productContext?: ProductContext;

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
    /**
     * Create a new change. Options-object API — single typed call shape:
     *
     *   store.changes.create("title", {
     *     capability: "cap",
     *     artifacts: { proposal: "…", problemStatement: "…", ... },
     *     initialMetadata: { origin: { ... }, ... },
     *   })
     *
     * Tool-surface schemas (`adv_change_create`) accept the same user-facing
     * fields as before — this is internal store API only (C10 / C8 in the
     * removePositionalArtifactApi change).
     */
    create: (
      summary: string,
      options?: ChangeCreateOptionsBag,
    ) => Promise<ChangeCreateResult>;
    save: (change: Change) => Promise<void>;
    /**
     * Update narrative artifact files for an existing change. Options-object
     * API — single typed call shape:
     *
     *   store.changes.updateArtifacts(id, {
     *     proposal: "…",
     *     design: "…",
     *     ...
     *   })
     *
     * Only defined fields are written; undefined fields are no-ops.
     */
    updateArtifacts: (
      changeId: string,
      artifacts: ArtifactPayload,
    ) => Promise<UpdateArtifactsResult>;
    close: (changeId: string, closure: ChangeClosure) => Promise<Change | null>;
    closeBatch: (
      changeIds: string[],
      closure: ChangeClosure,
    ) => Promise<BulkCloseResult>;
    /**
     * Invalidate the in-memory change cache and refresh from the durable
     * source of truth (Temporal workflow state for the temporal store,
     * disk for the disk store). Must be called by tool-layer code paths
     * that mutate workflow state via direct fireSignal() — those paths
     * bypass the store's own mutation methods and would otherwise leave
     * stale data in the cache.
     *
     * R1 follow-on regression: adv_gate_complete fires gateCompletedSignal
     * directly to avoid the store.gates.complete() boilerplate, which
     * left changeCache holding pre-signal state with the gate still
     * `pending`. adv_change_archive then read that stale cache and
     * blocked archive even though the workflow gate was already done.
     */
    refresh: (changeId: string) => Promise<void>;
    setEpicMembership: (
      changeId: string,
      input: {
        membership: NonNullable<Change["epic_membership"]>;
        expectedCurrent?: { epic_id: string; entry_id: string };
        setAt?: string;
      },
    ) => Promise<Change | null>;
    clearEpicMembership: (
      changeId: string,
      input: {
        expected: { epic_id: string; entry_id: string };
        clearedAt?: string;
      },
    ) => Promise<Change | null>;
    /**
     * rq-changeSummaryReadModel01 (advance-meta v1.12): lightweight summary
     * listing surface for default read paths (`adv_change_list`,
     * `adv_status` warm path).
     *
     * Returns the same projection shape as `list({})` but skips per-change
     * full hydration when an in-memory summary (`ChangeSummaryMemo`) or
     * cached `Change` already covers the requested IDs. Misses fall back
     * to authoritative full hydration via the same orphan-tolerant path as
     * `get()`, so safety-critical callers (gates, archive, claims, task
     * completion, recovery) MUST continue using `list({...})` / `get(...)`
     * — never this method — when the response contract requires
     * authoritative workflow state.
     *
     * Supports the same filter surface as `list` for compatibility with
     * `adv_change_list` callers; archived/closed inclusion still walks the
     * disk/archive fallback because terminal records are not memo-only.
     *
     * Returns `{ changes, hydrationStats? }` so telemetry callers can
     * observe how many IDs were served from memo vs full hydration without
     * subscribing to the global metrics ring.
     */
    listSummary?: (filter?: {
      status?: string;
      includeArchived?: boolean;
      includeClosed?: boolean;
      prefix?: string;
      titleContains?: string;
      createdBefore?: string;
      lastActivityBefore?: string;
    }) => Promise<
      ChangeListResponse & {
        hydrationStats?: {
          totalIds: number;
          fromMemo: number;
          fromCache: number;
          fromHydration: number;
        };
      }
    >;
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
      origin?: ProductOriginTags,
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

  // Epics
  epics: {
    create: (
      epicId: string,
      title: string,
      narrative: string,
      options?: { epicScope?: Epic["epic_scope"] },
    ) => Promise<Epic>;
    get: (epicId: string) => Promise<LoadResult<Epic | null>>;
    list: () => Promise<Epic[]>;
    update: (
      epicId: string,
      input: { title?: string; narrative?: string; expectedVersion: number },
    ) => Promise<Epic>;
    addShell: (
      epicId: string,
      input: {
        entryId?: string;
        title: string;
        successHint: string;
        order?: number;
      },
    ) => Promise<EpicEntry>;
    promoteShell: (
      epicId: string,
      entryId: string,
      changeId: string,
      promotedBy: string,
    ) => Promise<{ entryId: string; changeId: string }>;
    linkChange: (
      epicId: string,
      input: {
        entryId?: string;
        changeId: string;
        title: string;
        order?: number;
        linkedBy?: string;
        linkEvidence?: string;
        changeProjectId?: string;
        repoId?: string;
        targetPath?: string;
      },
    ) => Promise<EpicEntry>;
    unlinkChange: (epicId: string, entryId: string) => Promise<void>;
    reorder: (
      epicId: string,
      entryIds: string[],
      expectedVersion: number,
    ) => Promise<Epic>;
  };
}

export interface SearchResult {
  spec: string;
  requirement: string;
  title: string;
  match: string;
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
    parent_change_id: change.fast_follow_of?.parent_change_id,
  };
}
