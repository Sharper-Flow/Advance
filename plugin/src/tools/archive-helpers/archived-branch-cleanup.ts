/**
 * Archived merged-branch cleanup (rq-archiveBranchCleanup01).
 *
 * Operator-explicit git-branch hygiene for archived ADV changes whose
 * `change/{id}` branch is fully merged into the default branch
 * (squash-merge-safe detection). This is git maintenance, not ADV recovery
 * state, so it lives behind `adv_worktree_cleanup mode=archived_branches`
 * rather than the retired archive-repair surface.
 *
 * Performance model (rq-archivedBranchCleanupInversion01): the archived-id
 * filter is built from LOCAL branch count — one `store.changes.get(id)` per
 * local `change/*` branch (bounded, concurrency-capped) — never by
 * enumerating the whole archive via `store.changes.list`. The fetch is
 * skipped on dryRun and bounded (real process kill) on wet runs; synchronous
 * detection git is per-call bounded; the helper self-returns typed partial
 * results when the effective tool budget is exhausted.
 */

import { execGit } from "../../utils/git.js";
import { withTimeout, TimeoutError } from "../../utils/with-timeout.js";
import { readdir } from "fs/promises";
import type { Store } from "../../storage/store";
import { createLogger } from "../../utils/debug-log";
import {
  deleteChangeBranch,
  detectArchivedMergedBranches,
  detectDefaultBranch,
  getCheckedOutChangeBranches,
  listLocalChangeBranchEntries,
  makeBoundedRunGit,
  resolveRepoRoot,
  type LocalChangeBranchEntry,
} from "./git-finalize";

/** Fallback budget when the handler does not pass an effective timeout. */
const SAFE_BUDGET_MS = 8_000;
/** Reserve for output formatting/handoff below the effective budget. */
const RETURN_RESERVE_MS = 500;
/** Bounded concurrency cap for per-id residual archived-status reads
 * (rq-archivedBranchCleanupInversion01.2 — residual set only; archive-dir
 * members never reach this path). */
const STATUS_LOOKUP_CONCURRENCY = 8;
/** Ceiling for the wet-run `git fetch` sub-budget. */
const FETCH_MAX_MS = 2_000;
/** Floor for a single per-id status read. */
const MIN_PER_ITEM_MS = 500;
/** Floor for a single per-call detection git invocation. */
const MIN_PER_CALL_GIT_MS = 500;

const logger = createLogger("archived-branch-cleanup");

export interface ArchivedBranchCleanupInput {
  store: Store;
  changeId?: string;
  dryRun?: boolean;
  /** Candidate identity/evidence carried from the count-matched cleanup approval. */
  approvalEvidence?: string;
  /**
   * Handler-clamped effective budget (ms). The helper derives its internal
   * deadline (`effectiveTimeoutMs - RETURN_RESERVE_MS`) and self-returns typed
   * partial results on expiry, so the tool never surfaces a raw
   * `ToolExecutionTimeout`. Omitted → the safe default budget is used.
   */
  effectiveTimeoutMs?: number;
}

type OmissionReason = "not_archived" | "lookup_failed" | "deadline_exceeded";

interface Omission {
  changeId: string;
  branch?: string;
  reason: OmissionReason;
  detail?: string;
}

/**
 * Per-id archived-status classification. `archived` becomes a deletion
 * candidate; every other outcome is an `omit` carrying the typed omission
 * reason (fail-closed: unknown / non-archived / lookup failures are never
 * candidates).
 */
type ChangeStatusLookup =
  | { changeId: string; kind: "archived" }
  | { changeId: string; kind: "omit"; reason: OmissionReason; detail?: string };

/**
 * Resolve one change's archived status via `store.changes.get`, bounded by a
 * per-item timeout. Maps every `LoadResult` variant fail-closed:
 *   - `{success:true, data:{status:"archived"}}` → archived (candidate)
 *   - `{success:true, data:{status:<other>}}`     → not_archived
 *   - `{success:true, data:null}`                 → lookup_failed (fail-closed)
 *   - `{success:false, type:*}`                   → lookup_failed
 *   - per-item timeout                            → deadline_exceeded
 *   - unexpected rejection                        → lookup_failed
 */
async function resolveArchivedChangeStatus(
  store: Store,
  changeId: string,
  perItemMs: number,
): Promise<ChangeStatusLookup> {
  try {
    const result = await withTimeout(
      store.changes.get(changeId),
      perItemMs,
      `changes.get(${changeId}) timed out`,
    );
    if (!result.success) {
      return {
        changeId,
        kind: "omit",
        reason: "lookup_failed",
        detail: result.type,
      };
    }
    if (result.data === null) {
      return {
        changeId,
        kind: "omit",
        reason: "lookup_failed",
        detail: "null projection",
      };
    }
    if (result.data.status === "archived") {
      return { changeId, kind: "archived" };
    }
    return {
      changeId,
      kind: "omit",
      reason: "not_archived",
      detail: result.data.status,
    };
  } catch (err) {
    if (err instanceof TimeoutError) {
      return {
        changeId,
        kind: "omit",
        reason: "deadline_exceeded",
        detail: "status lookup timed out",
      };
    }
    return {
      changeId,
      kind: "omit",
      reason: "lookup_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fixed-pool concurrency map. Preserves input order in the result array and
 * never runs more than `cap` tasks concurrently
 * (rq-archivedBranchCleanupInversion01.2).
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  cap: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  };
  const poolSize = Math.min(Math.max(1, cap), Math.max(1, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
}

/**
 * Read archive membership from the authoritative archive directory once.
 * A failed read deliberately returns null so the caller can use the existing
 * fail-closed per-id lookup path instead of treating an unavailable archive
 * as proof that no changes are archived.
 */
async function readArchivedChangeIds(
  store: Store,
): Promise<Set<string> | null> {
  try {
    // Names-only is intentional: archive bundle directory names are the
    // terminal membership index for this bulk scan.
    return new Set(await readdir(store.paths.archive));
  } catch (err) {
    logger.warn(
      "archive directory read failed; falling back to status lookups",
      {
        archiveDir: store.paths.archive,
        error: err instanceof Error ? err.message : String(err),
      },
    );
    return null;
  }
}

/**
 * Build the archived-id set from the LOCAL `change/*` branch list. Archive
 * directory membership is authoritative for the bulk scan; only residual
 * branch ids need bounded per-id status reads. Never calls `store.changes.list`.
 */
async function buildArchivedCandidatesFromLocal(params: {
  store: Store;
  repoRoot: string;
  deadlineAt: number;
}): Promise<
  | { blocked: true; reason: string; details: string[] }
  | { blocked: false; archivedChangeIds: string[]; omissions: Omission[] }
> {
  const { store, repoRoot, deadlineAt } = params;
  const local = listLocalChangeBranchEntries(repoRoot);
  if (local.status === "blocked") {
    return { blocked: true, reason: local.reason, details: local.details };
  }

  // Dedupe by changeId (branch list is already unique per branch; defensive).
  const byId = new Map<string, LocalChangeBranchEntry>();
  for (const entry of local.entries) {
    if (!byId.has(entry.changeId)) byId.set(entry.changeId, entry);
  }
  const uniqueEntries = [...byId.values()];

  // store-disk rq-terminalProjectionTruth01 bundle dominance makes archive
  // membership terminal proof, matching PendingDeleteAuthority.terminalProof
  // "archive_repair_archived_list". Do this before reading active projections,
  // whose status can remain stale after the archive bundle is durable.
  const archivedIdsOnDisk = await readArchivedChangeIds(store);
  const archiveFirstIds: string[] = [];
  const residualEntries: LocalChangeBranchEntry[] = [];
  for (const entry of uniqueEntries) {
    if (archivedIdsOnDisk?.has(entry.changeId)) {
      archiveFirstIds.push(entry.changeId);
    } else {
      residualEntries.push(entry);
    }
  }

  const remaining = Math.max(0, deadlineAt - Date.now());
  const rounds = Math.max(
    1,
    Math.ceil(residualEntries.length / STATUS_LOOKUP_CONCURRENCY),
  );
  const perItemMs = Math.max(MIN_PER_ITEM_MS, Math.floor(remaining / rounds));

  const lookups = await mapWithConcurrency(
    residualEntries,
    STATUS_LOOKUP_CONCURRENCY,
    (entry) => resolveArchivedChangeStatus(store, entry.changeId, perItemMs),
  );

  const archivedChangeIds: string[] = [...archiveFirstIds];
  const omissions: Omission[] = [];
  for (let i = 0; i < lookups.length; i++) {
    const lookup = lookups[i];
    if (lookup.kind === "archived") {
      archivedChangeIds.push(lookup.changeId);
    } else {
      omissions.push({
        changeId: lookup.changeId,
        branch: residualEntries[i].branch,
        reason: lookup.reason,
        ...(lookup.detail ? { detail: lookup.detail } : {}),
      });
    }
  }
  return { blocked: false, archivedChangeIds, omissions };
}

/** Append the un-detected archived ids as deadline_exceeded omissions. */
function withDeadlineExceeded(
  omissions: Omission[],
  undetectedIds: string[],
): Omission[] {
  return [
    ...omissions,
    ...undetectedIds.map(
      (changeId): Omission => ({
        changeId,
        reason: "deadline_exceeded",
        detail: "merge detection skipped: budget exhausted",
      }),
    ),
  ];
}

/** `partial:true` iff at least one omission could not conclusively determine
 * archived/merge status. A `not_archived`-only scan is complete, not partial. */
function isPartial(omissions: Omission[]): boolean {
  return omissions.some(
    (o) => o.reason === "lookup_failed" || o.reason === "deadline_exceeded",
  );
}

function buildPartialResult(params: {
  dryRun?: boolean;
  repoRoot: string;
  defaultBranch: string;
  omissions: Omission[];
  fetchWarnings: string[];
}): Record<string, unknown> {
  const base = {
    success: true,
    partial: true,
    mode: "archived_branches",
    dryRun: !!params.dryRun,
    repoRoot: params.repoRoot,
    defaultBranch: params.defaultBranch,
    omissions: params.omissions,
    ...(params.fetchWarnings.length > 0
      ? { warnings: params.fetchWarnings }
      : {}),
  };
  if (params.dryRun) {
    return { ...base, candidates: [], skipped: [], count: 0 };
  }
  return {
    ...base,
    results: [],
    skipped: [],
    summary: {
      total: 0,
      candidates: 0,
      deleted: 0,
      remoteDeleted: 0,
      failed: 0,
      skippedWorktree: 0,
    },
  };
}

/**
 * Scan local `change/*` branches tied to archived ADV changes, detect the
 * fully-merged ones, and (unless dryRun) delete the safe candidates.
 *
 * Returns the structured tool-output payload. `mode` is set to
 * "archived_branches" so the owning tool surface is explicit in output.
 */
export async function cleanupArchivedMergedBranches(
  input: ArchivedBranchCleanupInput,
): Promise<Record<string, unknown>> {
  const { store, changeId, dryRun, effectiveTimeoutMs } = input;
  if (!dryRun && !input.approvalEvidence?.trim()) {
    return {
      success: false,
      mode: "archived_branches",
      error:
        "APPROVAL_REQUIRED: archived branch cleanup needs approvalEvidence",
    };
  }

  // PHASE 1 — setup + internal deadline (tighter than any handler guard).
  const budget = (effectiveTimeoutMs ?? SAFE_BUDGET_MS) - RETURN_RESERVE_MS;
  const deadlineAt = Date.now() + Math.max(MIN_PER_ITEM_MS, budget);
  const remaining = () => Math.max(0, deadlineAt - Date.now());
  // Setup and safety-filter git calls are synchronous spawnSync calls too.
  // Give each its own bounded runner; otherwise one stuck call could block the
  // event loop past both this helper's deadline and the handler's timer.
  const boundedRunGit = () =>
    makeBoundedRunGit(Math.max(1, Math.min(MIN_PER_CALL_GIT_MS, remaining())));

  const repoRoot = resolveRepoRoot(store.paths.root, {
    runGit: boundedRunGit(),
  });
  const { branch: defaultBranch } = detectDefaultBranch(repoRoot, {
    runGit: boundedRunGit(),
  });

  // PHASE 2 — build target archived ids (per-id inversion) + omissions.
  let targetArchivedChangeIds: string[];
  let omissions: Omission[] = [];

  if (changeId?.trim()) {
    const lookup = await resolveArchivedChangeStatus(
      store,
      changeId,
      Math.max(MIN_PER_ITEM_MS, remaining()),
    );
    if (lookup.kind !== "archived") {
      return {
        success: false,
        mode: "archived_branches",
        changeId,
        error: `Change is not archived or was not found: ${changeId}`,
      };
    }
    targetArchivedChangeIds = [changeId];
  } else {
    const built = await buildArchivedCandidatesFromLocal({
      store,
      repoRoot,
      deadlineAt,
    });
    if (built.blocked) {
      return {
        success: false,
        mode: "archived_branches",
        error: `Cleanup scan blocked: ${built.reason}`,
        details: built.details,
      };
    }
    targetArchivedChangeIds = built.archivedChangeIds;
    omissions = built.omissions;
  }

  // Deadline guard before any network / detection work.
  if (remaining() <= 0) {
    return buildPartialResult({
      dryRun,
      repoRoot,
      defaultBranch,
      omissions: withDeadlineExceeded(omissions, targetArchivedChangeIds),
      fetchWarnings: [],
    });
  }

  // PHASE 3 — fetch (skip on dryRun; bounded real-kill on wet runs).
  const fetchWarnings: string[] = [];
  if (!dryRun) {
    const fetchMs = Math.min(
      FETCH_MAX_MS,
      Math.max(MIN_PER_ITEM_MS, Math.floor(remaining() / 2)),
    );
    try {
      await execGit(["fetch", "origin", defaultBranch], repoRoot, fetchMs);
    } catch (err) {
      fetchWarnings.push(
        `Best-effort default-branch fetch failed or timed out (${fetchMs}ms budget): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Deadline guard before synchronous detection.
  if (remaining() <= 0) {
    return buildPartialResult({
      dryRun,
      repoRoot,
      defaultBranch,
      omissions: withDeadlineExceeded(omissions, targetArchivedChangeIds),
      fetchWarnings,
    });
  }

  // PHASE 4 — detect (per-call bounded runGit so stuck git cannot overrun).
  const perCallMs = Math.max(
    MIN_PER_CALL_GIT_MS,
    Math.floor(remaining() / Math.max(1, targetArchivedChangeIds.length)),
  );
  const detect = detectArchivedMergedBranches(
    { repoRoot, defaultBranch, archivedChangeIds: targetArchivedChangeIds },
    { runGit: makeBoundedRunGit(perCallMs) },
  );
  if (detect.status === "blocked") {
    return {
      success: false,
      mode: "archived_branches",
      error: `Cleanup scan blocked: ${detect.reason}`,
      details: detect.details,
    };
  }
  if (remaining() <= 0) {
    return buildPartialResult({
      dryRun,
      repoRoot,
      defaultBranch,
      omissions: withDeadlineExceeded(omissions, targetArchivedChangeIds),
      fetchWarnings,
    });
  }

  // PHASE 5 — worktree safety filter.
  const checkedOut = getCheckedOutChangeBranches(repoRoot, {
    runGit: boundedRunGit(),
  });
  if (checkedOut.status === "blocked") {
    return {
      success: false,
      mode: "archived_branches",
      error: `Worktree safety check blocked: ${checkedOut.reason}`,
      details: checkedOut.details,
    };
  }

  const candidates = detect.branches.filter(
    (b) => !checkedOut.branches.has(b.branch),
  );
  const skippedWorktree = detect.branches.filter((b) =>
    checkedOut.branches.has(b.branch),
  );
  const skipped = skippedWorktree.map((b) => ({
    ...b,
    reason: "WORKTREE_CHECKED_OUT",
    worktreePath: checkedOut.worktreePaths[b.branch],
  }));

  const partial = isPartial(omissions);

  // PHASE 6 — output.
  if (dryRun) {
    return {
      success: true,
      mode: "archived_branches",
      dryRun: true,
      repoRoot,
      defaultBranch,
      candidates,
      skipped,
      count: candidates.length,
      ...(omissions.length > 0 ? { omissions } : {}),
      ...(partial ? { partial: true } : {}),
      ...(fetchWarnings.length > 0 ? { warnings: fetchWarnings } : {}),
    };
  }

  const results = candidates.map((b) => {
    try {
      const deletion = deleteChangeBranch(repoRoot, b.changeId);
      return {
        changeId: b.changeId,
        branch: b.branch,
        mergeProof: b.mergeProof,
        ...deletion,
      };
    } catch (error) {
      return {
        changeId: b.changeId,
        branch: b.branch,
        mergeProof: b.mergeProof,
        localDeleted: false,
        remoteDeleted: false,
        blocked: {
          reason: "DELETE_FAILED",
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });
  const summary = {
    total: detect.branches.length,
    candidates: candidates.length,
    deleted: results.filter((r) => r.localDeleted).length,
    remoteDeleted: results.filter((r) => r.remoteDeleted).length,
    failed: results.filter((r) => !r.localDeleted).length,
    skippedWorktree: skippedWorktree.length,
  };
  return {
    success: true,
    mode: "archived_branches",
    dryRun: false,
    repoRoot,
    defaultBranch,
    results,
    skipped,
    summary,
    ...(omissions.length > 0 ? { omissions } : {}),
    ...(partial ? { partial: true } : {}),
    ...(fetchWarnings.length > 0 ? { warnings: fetchWarnings } : {}),
  };
}
