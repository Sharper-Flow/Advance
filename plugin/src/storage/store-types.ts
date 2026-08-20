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
  Delta,
  DeltaAdd,
  DeltaModify,
  DeltaRemove,
  DeltaRename,
  WisdomEntry,
  WisdomType,
  Cancellation,
  TddReclassification,
  Gates,
  GateCompletion,
  GateId,
  BulkCloseResult,
  Epic,
  EpicEntry,
  EpicChangeRef,
  EpicMembershipStatus,
  RetiredEpicProjection,
  WorkNodeRef,
} from "../types";
import type { ProjectPaths } from "./json";
import type { LoadResult } from "./change-projection-reader";
import type { ProductContext } from "./product-context";
import { z } from "zod";

export interface ResolvedChangeList {
  changes: Change[];
  /** Source-backed candidate order used by bounded health orientation. */
  rankedIds?: string[];
  warnings?: import("../types").TerminalWarning[];
  hydrationStats?: import("../types").HydrationStats;
}

/**
 * Stable, source-keyed diagnostics from a project authority.
 *
 * Unknown counts are represented as `null` rather than fabricated zeros so
 * callers can distinguish "none" from "could not be established".
 */
export interface AuthorityDiagnostics {
  /** Source identifier for the authority producing the diagnostics. */
  source: string;
  /** Number of active candidates established by the authority; null when unknown. */
  activeCandidateCount: number | null;
  /** Number of candidates whose facts could not be established; null when unknown. */
  omittedCount: number | null;
  /** Number of candidates reconciled to a confirmed terminal shadow; null when unknown. */
  shadowCount: number | null;
  /** Wall-clock elapsed milliseconds spent resolving the authority; null when unavailable. */
  elapsedMs: number | null;
}

/**
 * Single active change proven by the active conflict authority.
 * Membership comes only from Visibility; facts come only from validated
 * durable active projections.
 */
export interface ChangeConflictAuthorityEntry {
  id: string;
  title: string;
  status: string;
  /** Capability names derived from the change's deltas. */
  capabilities: string[];
  /** Optional Epic membership projection for conflict context. */
  epic_membership?: Change["epic_membership"];
  /** Same-project fast-follow lineage context. */
  fast_follow_of?: Change["fast_follow_of"];
}

/**
 * Result of the active-only conflict authority.
 *
 * Complete only when the Visibility enumeration succeeded, every page was
 * consumed, and every Visibility-proven candidate had its durable active
 * facts established or was reconciled to a confirmed terminal shadow.
 * Any source/page error, deadline, missing/wrong projection, candidate
 * omission, or terminal shadow that cannot be confirmed makes the result
 * incomplete and sets `canConcludeClean` to false.
 */
export interface ChangeConflictAuthority {
  /** Active changes proven by Visibility and validated durable facts. */
  active: ChangeConflictAuthorityEntry[];
  /** Complete only when every Visibility page and every candidate fact succeeded. */
  completeness: "complete" | "incomplete";
  /** Structural fail-closed guard: false when the authority is incomplete. */
  canConcludeClean: boolean;
  /** Typed warnings explaining why the authority is incomplete. */
  warnings: string[];
  /** Source identifier for auditability. */
  source: string;
  /** Stable diagnostics for the authority source. */
  authorityDiagnostics?: AuthorityDiagnostics;
  /** Number of Visibility-proven active candidates (including omitted ones). */
  candidateCount: number;
  /** Number of candidates whose facts could not be established. */
  omittedCount: number;
  /** Number of candidates reconciled to a confirmed terminal shadow. */
  shadowCount?: number;
}

/**
 * Bounded read options for `Store.status()` (fixChangeListTimeouts KD4).
 *
 * - `recentLimit` moves the summary bound upstream into the resolver so
 *   deep per-change hydration stops at the limit instead of hydrating
 *   every candidate and slicing afterwards. When the bound truncates
 *   candidates the result carries typed degradation (warnings +
 *   hydrationStats.boundedOmitted); counts/recency stay complete only
 *   when every candidate resolves within the bound.
 * These options are optional; stores that cannot honor them (target-path
 * snapshots) ignore them safely.
 */
export interface StatusReadOptions {
  recentLimit?: number;
  /** Use source-backed global recency before bounded hydration (health view). */
  sourceRanked?: boolean;
  /** Mutable marker owned by one status request; never shared across calls. */
  projectionState?: DiskProjectionReadState;
}

export interface DiskProjectionReadState {
  loaded: boolean;
}

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
  same_project_dependencies?: Change["same_project_dependencies"];
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

/**
 * Bounded portfolio state attached to adv_change_create results
 * (rq-createPortfolioLine01 / AC4). `available: false` is the explicit
 * degradation marker when the deadline-capped read fails — distinguishable
 * from a legitimately zero portfolio.
 */
export interface ChangePortfolioState {
  available: boolean;
  open_count?: number;
  never_terminal_share?: number;
  nudge?: string;
}

export interface ChangeCreateResult {
  changeId: string;
  duplicateWarning?: string;
  /** Attached by the adv_change_create tool layer (tools/portfolio-state.ts). */
  portfolioState?: ChangePortfolioState;
}

/**
 * Storage-only create result. The projection path is retained for internal
 * follow-up linkage; narrative artifact paths are no longer created.
 */
export interface ChangeCreateStorageResult extends ChangeCreateResult {
  path: string;
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

// =============================================================================
// ReadSnapshot<T> — projection read model contract
// =============================================================================

export const ReadSnapshotFoundSchema = <T extends z.ZodTypeAny>(
  snapshotSchema: T,
) =>
  z.object({
    found: z.literal(true),
    snapshot: snapshotSchema,
    stateRevision: z.number(),
    projectionRevision: z.number(),
    source: z.literal("read_model"),
    degraded: z.object({ reason: z.string() }).optional(),
  });

export const ReadSnapshotNotFoundSchema = z.object({
  found: z.literal(false),
  reason: z.literal("not_found"),
  source: z.literal("read_model"),
});

export const ReadSnapshotSchema = <T extends z.ZodTypeAny>(snapshotSchema: T) =>
  z.union([
    ReadSnapshotFoundSchema(snapshotSchema),
    ReadSnapshotNotFoundSchema,
  ]);

export type ReadSnapshot<T> =
  | {
      found: true;
      snapshot: T;
      stateRevision: number;
      projectionRevision: number;
      source: "read_model";
      degraded?: { reason: string };
    }
  | { found: false; reason: "not_found"; source: "read_model" };

// =============================================================================
// Store authority split: read surface vs command surface
// =============================================================================

interface StoreBase {
  paths: ProjectPaths;
  config: ProjectConfig | null;
  /** Request-scoped when a marker is supplied; no-arg calls retain legacy semantics. */
  hasLoadedDiskProjection?: (state?: DiskProjectionReadState) => boolean;
  /** Product-link identity context. Omitted for legacy/mock stores. */
  productContext?: ProductContext;

  // Lifecycle
  init: () => Promise<void>;
  sync: () => Promise<void>;
  close: () => void;
  flush: () => Promise<void>;
}

/** Read-only projection surface. No command authority. */
export interface ReadStore extends StoreBase {
  // Specs
  specs: {
    list: (filter?: {
      capability?: string;
      tag?: string;
    }) => Promise<SpecListResponse>;
    get: (capability: string) => Promise<LoadResult<Spec | null>>;
    search: (query: string, limit?: number) => Promise<SearchResult[]>;
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
      sort?: "recency" | "stalest" | "default";
      limit?: number;
      offset?: number;
      /** Internal caller-specific cap for per-change hydration. */
      validationConcurrency?: number;
      /** Internal caller-specific cap for diagnostic hydration. */
      maxCandidates?: number;
    }) => Promise<ChangeListResponse>;
    get: (changeId: string) => Promise<LoadResult<Change | null>>;
  };

  // Tasks
  tasks: {
    list: (
      changeId: string,
      status?: string,
      filter?: string,
    ) => Promise<Task[]>;
    ready: (changeId: string) => Promise<TaskReadyResponse>;
    get: (taskId: string) => Promise<Task | null>;
    show: (taskId: string) => Promise<{ task: Task; changeId: string } | null>;
  };

  // Wisdom
  wisdom: {
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
  };

  // Status
  status: (options?: StatusReadOptions) => Promise<ProjectStatus>;

  // Epics
  epics: {
    list: (filter?: { status?: "active" | "all" }) => Promise<Epic[]>;
    get: (epicId: string) => Promise<LoadResult<Epic | null>>;
    getRetiredProjection: (
      epicId: string,
    ) => Promise<LoadResult<RetiredEpicProjection | null>>;
  };
}

/** Command (mutation) surface. */
export interface CommandStore extends StoreBase {
  // Specs
  specs: {
    save: (spec: Spec) => Promise<void>;
  };

  // Changes
  changes: {
    create: (
      summary: string,
      options?: ChangeCreateOptionsBag,
    ) => Promise<ChangeCreateStorageResult>;
    save: (change: Change) => Promise<void>;
    close: (changeId: string, closure: ChangeClosure) => Promise<Change | null>;
    closeBatch: (
      changeIds: string[],
      closure: ChangeClosure,
    ) => Promise<BulkCloseResult>;
    refresh: (changeId: string) => Promise<void>;
    invalidate: (changeId: string) => Promise<void>;
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
  };

  // Tasks
  tasks: {
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
    update: (
      taskId: string,
      status: string,
      notes?: string,
      implementationSummary?: string,
      errorRecovery?: Task["error_recovery"],
      touchedFiles?: string[],
    ) => Promise<Task | null>;
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
  };

  // Spec deltas
  specDeltas: {
    add: (
      changeId: string,
      capability: string,
      delta: DeltaAdd,
      options?: { addedBy?: string },
    ) => Promise<DeltaAdd>;
    modify: (
      changeId: string,
      capability: string,
      delta: DeltaModify,
      options?: { modifiedBy?: string },
    ) => Promise<DeltaModify>;
    amend: (
      changeId: string,
      capability: string,
      deltaId: string,
      delta: Delta,
      options?: { amendedBy?: string },
    ) => Promise<Delta>;
    retract: (
      changeId: string,
      capability: string,
      deltaId: string,
      options?: { retractedBy?: string },
    ) => Promise<void>;
    remove: (
      changeId: string,
      capability: string,
      delta: DeltaRemove,
      options?: { removedBy?: string },
    ) => Promise<DeltaRemove>;
    rename: (
      changeId: string,
      capability: string,
      delta: DeltaRename,
      options?: { renamedBy?: string },
    ) => Promise<DeltaRename>;
  };

  // Gates
  gates: {
    complete: (
      changeId: string,
      gateId: GateId,
      notes?: string,
    ) => Promise<void>;
    reopenFrom: (
      changeId: string,
      fromGate: GateId,
      reason: string,
      scopeDelta?: string,
      reopenedBy?: string,
      approvalEvidence?: string,
    ) => Promise<void>;
  };

  // Epics
  epics: {
    create: (
      epicId: string,
      title: string,
      narrative: string,
      options?: { epicScope?: Epic["epic_scope"] },
    ) => Promise<Epic>;
    update: (
      epicId: string,
      input: {
        title?: string;
        narrative?: string;
        expectedVersion: number;
      },
    ) => Promise<Epic>;
    updateScope: (
      epicId: string,
      input: {
        epicScope?: Epic["epic_scope"];
        expectedVersion: number;
        updatedBy?: string;
        auditEvidence: string;
      },
    ) => Promise<Epic>;
    markMerged: (
      epicId: string,
      input: {
        mergedInto: NonNullable<Epic["merged_into"]>;
        expectedVersion: number;
      },
    ) => Promise<Epic>;
    addShell: (
      epicId: string,
      input: {
        entryId?: string;
        title: string;
        successHint: string;
        order?: number;
        importedFrom?: { backlog_id: string; imported_at: string };
        blockedBy?: WorkNodeRef[];
        context_packet?: import("../types/future-work").FutureWorkContextPacket;
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
        linkedAt?: string;
        membershipStatus?: EpicMembershipStatus;
        terminalSummary?: {
          status: "archived" | "closed";
          completedAt: string;
        };
        linkedBy?: string;
        linkEvidence?: string;
        changeProjectId?: string;
        repoId?: string;
        targetPath?: string;
      },
    ) => Promise<EpicEntry>;
    retargetChange: (
      epicId: string,
      input: {
        entryId: string;
        fromChangeId: string;
        toChangeId: string;
        title?: string;
        changeRef?: EpicChangeRef;
        membershipStatus?: EpicMembershipStatus;
        retargetedBy?: string;
        retargetEvidence?: string;
      },
    ) => Promise<EpicEntry>;
    unlinkChange: (
      epicId: string,
      entryId: string,
      unlinkEvidence: string,
    ) => Promise<void>;
    setEntryMembershipStatus: (
      epicId: string,
      input: {
        entryId: string;
        membershipStatus: EpicMembershipStatus;
        evidence: string;
      },
    ) => Promise<EpicEntry>;
    setEntryTerminalSummary: (
      epicId: string,
      input: {
        entryId: string;
        status: "archived" | "closed";
        completedAt: string;
      },
    ) => Promise<EpicEntry>;
    reorder: (
      epicId: string,
      entryIds: string[],
      expectedVersion: number,
    ) => Promise<Epic>;
    saveRetiredProjection: (
      epicId: string,
      projection: RetiredEpicProjection,
    ) => Promise<void>;
    retire: (
      epicId: string,
      input: {
        expectedVersion: number;
        evidence: string;
        retiredBy: string;
        dryRun?: boolean;
      },
    ) => Promise<RetiredEpicProjection>;
    repairIndex: (input: { evidence: string; dryRun?: boolean }) => Promise<{
      total: number;
      backfilled: number;
      refreshed: number;
      unverified: number;
      skipped: number;
      unreachable: number;
      epics: Array<{
        epic_id: string;
        status: string;
        action:
          | "would_backfill"
          | "backfilled"
          | "would_refresh"
          | "refreshed"
          | "unverified"
          | "skipped"
          | "unreachable";
        error?: string;
      }>;
    }>;
  };
}

export interface Store extends ReadStore, CommandStore {
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
      /**
       * Internal caller-specific cap for per-change hydration. Validation uses
       * this to keep its request-wide Store work within its four-read budget.
       */
      validationConcurrency?: number;
      /** Internal caller-specific cap for diagnostic hydration. */
      maxCandidates?: number;
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
    ) => Promise<ChangeCreateStorageResult>;
    save: (change: Change) => Promise<void>;
    close: (changeId: string, closure: ChangeClosure) => Promise<Change | null>;
    closeBatch: (
      changeIds: string[],
      closure: ChangeClosure,
    ) => Promise<BulkCloseResult>;
    /**
     * Invalidate the in-memory change cache and refresh from the durable
     * source of truth. Must be called by tool-layer code paths that mutate
     * state outside the store's own mutation methods and would otherwise
     * leave stale data in the cache.
     *
     * R1 follow-on regression: callers that mutate gate state outside the
     * store's own method must refresh before a subsequent archive read, or
     * the cache can retain a stale `pending` gate and block archive.
     */
    refresh: (changeId: string) => Promise<void>;
    /**
     * Drop the in-memory change cache entry without issuing a readback query
     * or disk write. The next read reloads the durable state. Use this when
     * the caller has already confirmed the authoritative state and a refresh
     * readback could race and re-poison the cache with a stale snapshot.
     */
    invalidate: (changeId: string) => Promise<void>;
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

  // Spec deltas (change-scoped, append-only writers).
  //
  // Records an add-operation delta under `change.deltas[capability]`.
  // Existing and valid new kebab-case capability keys are accepted. Archive
  // remains the sole writer of global spec files; this surface only mutates
  // the change-owned durable delta record. Duplicate delta ids and duplicate
  // add-requirement ids are rejected atomically with state left unchanged.
  specDeltas: {
    add: (
      changeId: string,
      capability: string,
      delta: DeltaAdd,
      options?: { addedBy?: string },
    ) => Promise<DeltaAdd>;
    modify: (
      changeId: string,
      capability: string,
      delta: DeltaModify,
      options?: { modifiedBy?: string },
    ) => Promise<DeltaModify>;
    amend: (
      changeId: string,
      capability: string,
      deltaId: string,
      delta: Delta,
      options?: { amendedBy?: string },
    ) => Promise<Delta>;
    retract: (
      changeId: string,
      capability: string,
      deltaId: string,
      options?: { retractedBy?: string },
    ) => Promise<void>;
    remove: (
      changeId: string,
      capability: string,
      delta: DeltaRemove,
      options?: { removedBy?: string },
    ) => Promise<DeltaRemove>;
    rename: (
      changeId: string,
      capability: string,
      delta: DeltaRename,
      options?: { renamedBy?: string },
    ) => Promise<DeltaRename>;
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
  status: (options?: StatusReadOptions) => Promise<ProjectStatus>;

  // Epics
  epics: {
    create: (
      epicId: string,
      title: string,
      narrative: string,
      options?: { epicScope?: Epic["epic_scope"] },
    ) => Promise<Epic>;
    get: (epicId: string) => Promise<LoadResult<Epic | null>>;
    list: (filter?: { status?: "active" | "all" }) => Promise<Epic[]>;
    update: (
      epicId: string,
      input: { title?: string; narrative?: string; expectedVersion: number },
    ) => Promise<Epic>;
    updateScope: (
      epicId: string,
      input: {
        epicScope?: Epic["epic_scope"];
        expectedVersion: number;
        updatedBy?: string;
        auditEvidence: string;
      },
    ) => Promise<Epic>;
    markMerged: (
      epicId: string,
      input: {
        mergedInto: NonNullable<Epic["merged_into"]>;
        expectedVersion: number;
      },
    ) => Promise<Epic>;
    addShell: (
      epicId: string,
      input: {
        entryId?: string;
        title: string;
        successHint: string;
        order?: number;
        importedFrom?: { backlog_id: string; imported_at: string };
        blockedBy?: WorkNodeRef[];
        context_packet?: import("../types/future-work").FutureWorkContextPacket;
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
        linkedAt?: string;
        membershipStatus?: EpicMembershipStatus;
        terminalSummary?: {
          status: "archived" | "closed";
          completedAt: string;
        };
        linkedBy?: string;
        linkEvidence?: string;
        changeProjectId?: string;
        repoId?: string;
        targetPath?: string;
      },
    ) => Promise<EpicEntry>;
    retargetChange: (
      epicId: string,
      input: {
        entryId: string;
        fromChangeId: string;
        toChangeId: string;
        title?: string;
        changeRef?: EpicChangeRef;
        membershipStatus?: EpicMembershipStatus;
        retargetedBy?: string;
        retargetEvidence?: string;
      },
    ) => Promise<EpicEntry>;
    unlinkChange: (
      epicId: string,
      entryId: string,
      unlinkEvidence: string,
    ) => Promise<void>;
    setEntryMembershipStatus: (
      epicId: string,
      input: {
        entryId: string;
        membershipStatus: import("../types").EpicMembershipStatus;
        evidence: string;
      },
    ) => Promise<EpicEntry>;
    setEntryTerminalSummary: (
      epicId: string,
      input: {
        entryId: string;
        status: "archived" | "closed";
        completedAt: string;
      },
    ) => Promise<EpicEntry>;
    reorder: (
      epicId: string,
      entryIds: string[],
      expectedVersion: number,
    ) => Promise<Epic>;
    /**
     * Load the durable retired projection for an Epic, if one exists.
     * Returns null when no retired projection has been persisted.
     */
    getRetiredProjection: (
      epicId: string,
    ) => Promise<LoadResult<RetiredEpicProjection | null>>;
    /**
     * Persist a durable retired projection for an Epic. Used by the
     * retirement lifecycle path before the Epic is completed.
     */
    saveRetiredProjection: (
      epicId: string,
      projection: RetiredEpicProjection,
    ) => Promise<void>;
    /**
     * Guarded Epic retirement: verify the Epic is completed with no active or
     * future entries, then persist a retired projection. Supports dry-run to
     * preview the projection without persisting it.
     */
    retire: (
      epicId: string,
      input: {
        expectedVersion: number;
        evidence: string;
        retiredBy: string;
        dryRun?: boolean;
      },
    ) => Promise<RetiredEpicProjection>;
    /**
     * Audited backfill/repair of the Epic status index. Does not retire,
     * archive, or mutate Epic records beyond status-index repair.
     */
    repairIndex: (input: { evidence: string; dryRun?: boolean }) => Promise<{
      total: number;
      backfilled: number;
      refreshed: number;
      unverified: number;
      skipped: number;
      unreachable: number;
      epics: Array<{
        epic_id: string;
        status: string;
        action:
          | "would_backfill"
          | "backfilled"
          | "would_refresh"
          | "refreshed"
          | "unverified"
          | "skipped"
          | "unreachable";
        error?: string;
      }>;
    }>;
  };
}

export interface SearchResult {
  spec: string;
  requirement: string;
  title: string;
  match: string;
}

/**
 * First non-done gate in GATE_ORDER, or "done" when every gate is complete.
 * Accepts the full `Gates` map from a hydrated change. Only `status ===
 * "done"` advances. Missing gates data means nothing has completed, so the
 * first gate is current.
 */
export function firstOpenGate(gates: Gates | undefined): GateId | "done" {
  if (!gates) return GATE_ORDER[0];
  // GateId is `string` at the type level (GATE_IDS is a string tuple), so
  // access goes through one contained, runtime-safe cast. Every GATE_ORDER
  // key exists on the shape by construction; missing keys read as undefined
  // and count as not-done.
  const byGate = gates as Record<string, GateCompletion | undefined>;
  for (const gateId of GATE_ORDER) {
    const gate = byGate[gateId];
    const done = gate?.status === "done";
    if (!done) return gateId;
  }
  return "done";
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
