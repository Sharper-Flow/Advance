/**
 * Disk-only Store backend (P2.7).
 *
 * Replaces the SQLite-backed `createLegacyStore` with the sole disk-native
 * Store implementation.
 *
 * The filesystem is the source of truth for paths, projections, cross-repo
 * initialization, and cold-start reads.
 *
 *   - **Paths**: ProjectPaths is the canonical computation that maps repo
 *     root + config to changes/specs/wisdom directories.
 *   - **Disk projection writes**: changes.create and changes.save persist
 *     change.json and its projection documents.
 *   - **Cross-repo target init**: when adv_change_create is called with
 *     `target_path`, the cross-project flow needs to scaffold a change in
 *     the target repo's filesystem before any other state exists.
 *   - **Cold-start fallbacks**: when Visibility API isn't available
 *     (test mocks), listChangeDirs reads disk directly.
 *
 * The previous `createLegacyStore` did all this PLUS maintained a SQLite
 * cache for FTS, dependency resolution, and stale-status calculation.
 * P2.3 replaced the FTS need with linear scan and P2.4 replaced the listing
 * need with direct disk reads. So SQLite has zero remaining
 * consumers — and along with it the 11 legacy files (sqlite.ts, health.ts,
 * corruption-recovery.ts, store-sync.ts, store-context.ts, store-changes,
 * store-tasks, store-gates, store-specs, store-locks, store-legacy itself).
 *
 * This module provides the complete Store implementation; all namespaces
 * use the disk-backed operations defined here.
 */

import { mkdir } from "fs/promises";
import { basename, join } from "path";

import { CHANGE_SCHEMA_URL } from "../schema-registry";

import type {
  Change,
  ChangeClosure,
  ChangeStatus,
  Delta,
  DeltaAdd,
  DeltaModify,
  DeltaRemove,
  DeltaRename,
  Spec,
  Task,
  TddReclassification,
  Cancellation,
  WisdomEntry,
  WisdomType,
  ProjectConfig,
} from "../types";
import { CAPABILITY_KEY_PATTERN, WisdomEntrySchema } from "../types";
import {
  createChangeScaffold,
  getProjectPaths,
  hasArchiveBundle,
  listChangeDirs,
  listSpecDirs,
  loadClosedChange,
  loadChange,
  loadProjectConfig,
  loadSpec,
  resolveChangeId,
  saveChange,
  saveProjectConfig,
  saveSpec,
  type LoadResult,
} from "./json";
import {
  normalizeProjectionDocument,
  readBoundedProjectionDocument,
} from "./change-projection-reader";
import { publishSummaryForChange } from "./change-summary-shard";
import {
  listActiveEpicProjections,
  listRetiredEpicProjections,
  loadActiveEpicProjection,
  loadRetiredEpicProjection,
} from "./epic-projection-reader";
import { saveRetiredEpicProjection } from "./epic-projection";
import {
  buildChangeRecency,
  computeLastActivity,
  firstOpenGate,
  type StatusReadOptions,
  type Store,
  type SearchResult,
} from "./store-types";
import { generateChangeId } from "../utils/change-id";
import { searchWisdom, filterChanges } from "./content-search";
import { listProjectWisdom } from "./project-wisdom";
import { createLogger } from "../utils/debug-log";
import { createEpicDiskOps } from "./epics-disk";

/** Keep broad list hydration from exhausting the tool timeout on large stores. */
export const CHANGE_LIST_DEFAULT_VALIDATION_CONCURRENCY = 4;

export async function loadChangesInBatches<T>(
  ids: string[],
  concurrency: number,
  loader: (id: string) => Promise<T>,
): Promise<T[]> {
  const boundedConcurrency = Math.max(1, Math.floor(concurrency));
  const loaded: T[] = [];
  for (let i = 0; i < ids.length; i += boundedConcurrency) {
    loaded.push(
      ...(await Promise.all(
        ids.slice(i, i + boundedConcurrency).map((id) => loader(id)),
      )),
    );
  }
  return loaded;
}

export async function loadClosedChanges(closedPath: string): Promise<Change[]> {
  const closedDirs = await listChangeDirs(closedPath);
  const loaded = await Promise.all(
    closedDirs.map((dir) => loadChange(closedPath, dir)),
  );
  return loaded
    .filter((r): r is { success: true; data: Change } =>
      Boolean(r.success && r.data),
    )
    .map((r) => r.data)
    .filter((change) => change.status === "closed");
}

const logger = createLogger("store-disk");

async function persistChangeProjection(
  paths: { changes: string; summariesDir: string },
  change: Change,
  operationId?: string,
): Promise<void> {
  await saveChange(paths.changes, change);
  await publishSummaryForChange(
    { changesDir: paths.changes, summariesDir: paths.summariesDir },
    change,
    operationId,
  );
}

let lastMonotonicTs = 0;
let monotonicSeq = 0;

/**
 * Typed refusal from the Epic membership write boundary, matching the
 * `Object.assign(new Error(...), { code })` shape used by the Epic store so
 * callers can discriminate a conflict from an infrastructure failure.
 */
function epicMembershipError(
  message: string,
  code: "epic_membership_conflict" | "epic_membership_stale_write",
): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function monotonicId(prefix: string): string {
  const now = Date.now();
  if (now !== lastMonotonicTs) {
    lastMonotonicTs = now;
    monotonicSeq = 0;
  } else {
    monotonicSeq++;
  }
  return `${prefix}-${now}-${monotonicSeq}`;
}

/**
 * Disk-only `Store` implementation.
 *
 * @param directory  Repository root path.
 * @param options.externalRoot  Optional override for the external state root
 *                               (defaults to `$XDG_DATA_HOME/opencode/.../{projectId}/`).
 */
export async function createDiskStore(
  directory: string,
  options?: { externalRoot?: string },
): Promise<Store> {
  const config = await loadProjectConfig(directory);
  const paths = getProjectPaths(directory, config ?? undefined, {
    externalRoot: options?.externalRoot,
  });

  // Make sure the mutable side-tree exists; tools assume these dirs are
  // present at first write.
  await mkdir(paths.changes, { recursive: true });
  await mkdir(paths.closed, { recursive: true });
  await mkdir(paths.activeEpics, { recursive: true });
  await mkdir(paths.retiredEpics, { recursive: true });
  if (paths.external) {
    await mkdir(paths.external, { recursive: true });
  }

  const loadArchivedChanges = async (): Promise<Change[]> => {
    const archiveDirs = await listChangeDirs(paths.archive);
    const loaded = await Promise.all(
      archiveDirs.map((dir) => loadChange(paths.archive, dir)),
    );
    return loaded
      .filter((r): r is { success: true; data: Change } =>
        Boolean(r.success && r.data),
      )
      .map((r) => r.data)
      .filter((change) => change.status === "archived");
  };

  type StatusSource = {
    id: string;
    title: string;
    status: ChangeStatus;
    created_at: string;
    lastActivityAt: string;
  };

  // Rank from source metadata before calling loadChange. This keeps bounded
  // status reads from hydrating every full Change document just to discover
  // which recent rows should be returned.
  const readStatusSource = async (
    directory: string,
    id: string,
    archive: boolean,
  ): Promise<StatusSource | null> => {
    const result = await readBoundedProjectionDocument(
      join(directory, id, "change.json"),
    );
    if (result.kind !== "ok") return null;
    try {
      const [normalized] = normalizeProjectionDocument(
        JSON.parse(result.content),
      );
      if (!normalized || typeof normalized !== "object") return null;
      const raw = normalized as Record<string, unknown>;
      if (
        typeof raw.id !== "string" ||
        typeof raw.title !== "string" ||
        typeof raw.created_at !== "string"
      ) {
        return null;
      }
      let status: ChangeStatus;
      if (archive) {
        status = "archived";
      } else if (
        raw.status === "draft" ||
        raw.status === "archived" ||
        raw.status === "closed"
      ) {
        status = raw.status;
      } else {
        return null;
      }
      const sourceChange = {
        ...raw,
        status,
        tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      } as Change;
      return {
        id: raw.id,
        title: raw.title,
        status,
        created_at: raw.created_at,
        lastActivityAt: computeLastActivity(sourceChange),
      };
    } catch {
      return null;
    }
  };

  const epicDiskOps = createEpicDiskOps({
    activeEpicsDir: paths.activeEpics,
    retiredEpicsDir: paths.retiredEpics,
  });

  const store: Store = {
    paths,
    config,

    // -------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------
    init: async () => {
      if (!config) {
        await saveProjectConfig(directory, {
          name: basename(directory) || "project",
          specs_dir: ".adv/specs",
          changes_dir: ".adv/changes",
          archive_dir: ".adv/archive",
          docs_dir: "docs/specs",
          db_dir: ".adv/db",
          project_file: "project.md",
          archive_mode: "direct",
          auto_push: true,
          archive: { pr_title_policy: { format: "plain" } },
          features: {
            tdd_enforcement: "strict",
            worktree_auto_create: true,
            // rq-autoManageAdvWorktrees AC2 — default true (post-rollout).
            // Explicit `false` preserves legacy permissive behavior.
            worktree_guard_enforce: true,
            // Default per-session routing; explicit `true` opts into singleton.
            worker_singleton_enforce: false,
            gate_enforcement: "strict",
            wisdom_accumulation: true,
            clarify_enforcement: "advisory",
            slop_scan: {
              nesting_depth_threshold: 8,
              defensive_guard_threshold: 3,
              complexity_threshold: 12,
              ast_timeout_ms: 10000,
            },
          } satisfies NonNullable<ProjectConfig["features"]>,
        });
      }
      // rq-storeReconcileUnboundedProof01.3: artifact-metadata convergence is
      // owned by the reconciler (reconcile-action-artifact-metadata), not by
      // store initialization. init() must not scan projections, rewrite
      // artifact sources, or gate on the migration marker. Running a
      // project-wide one-time migration here charged an O(N) scan to every
      // cross-project mutation's tool budget and latched permanently on
      // foreign-owned residue (retired evidence values owned by the
      // schema-drift action).
    },
    sync: async () => {
      // No-op — disk is the source of truth in this backend.
    },
    close: () => {
      // No-op — no SQLite handle to release.
    },
    flush: async () => {
      // No-op — disk writes complete per operation in this backend.
    },

    // -------------------------------------------------------------------
    // Specs
    // -------------------------------------------------------------------
    specs: {
      list: async (filter) => {
        const dirs = await listSpecDirs(paths.specs);
        const out: Array<{
          name: string;
          title: string;
          version: string;
          requirementCount: number;
        }> = [];
        for (const name of dirs) {
          if (filter?.capability && name !== filter.capability) continue;
          const result = await loadSpec(paths.specs, name);
          if (!result.success || !result.data) continue;
          if (filter?.tag) {
            // Check both spec-level tags AND requirement-level tags. The
            // legacy SQLite-FTS path used a separate tag index that could
            // match either; replicate that semantics in the disk path.
            const specTags = (result.data.tags ?? []) as string[];
            const reqTags = (result.data.requirements ?? []).flatMap(
              (req) => ((req as { tags?: string[] }).tags ?? []) as string[],
            );
            const allTags = new Set([...specTags, ...reqTags]);
            if (!allTags.has(filter.tag)) continue;
          }
          out.push({
            name: result.data.name,
            title: result.data.title ?? result.data.name,
            version:
              typeof result.data.version === "string"
                ? result.data.version
                : String(result.data.version ?? "1"),
            requirementCount: (result.data.requirements ?? []).length,
          });
        }
        return { specs: out };
      },
      get: async (capability: string) => loadSpec(paths.specs, capability),
      search: async (query: string, limit = 20) => {
        // Linear scan across all specs' requirements + content. Replaces
        // the legacy SQLite FTS path. P2.3 bench shows this is sub-ms at
        // typical project scale (<100 specs).
        const dirs = await listSpecDirs(paths.specs);
        const results: SearchResult[] = [];
        const lower = query.toLowerCase();
        for (const name of dirs) {
          const result = await loadSpec(paths.specs, name);
          if (!result.success || !result.data) continue;
          for (const req of result.data.requirements ?? []) {
            const reqAny = req as {
              id: string;
              title?: string;
              body?: string;
            };
            const haystack = [reqAny.title ?? "", reqAny.body ?? ""]
              .join("\n")
              .toLowerCase();
            if (!haystack.includes(lower)) continue;
            results.push({
              spec: result.data.name,
              requirement: reqAny.id,
              title: reqAny.title ?? reqAny.id,
              match: reqAny.body ?? "",
            });
            if (results.length >= limit) return results;
          }
        }
        return results;
      },
      save: async (spec: Spec) => {
        await mkdir(join(paths.specs, spec.name), { recursive: true });
        await saveSpec(paths.specs, spec);
      },
    },

    // -------------------------------------------------------------------
    // Changes
    // -------------------------------------------------------------------
    changes: {
      list: async (filter) => {
        const discoveredIds = await listChangeDirs(paths.changes);
        const ids =
          filter?.maxCandidates === undefined
            ? discoveredIds
            : discoveredIds.slice(0, Math.max(0, filter.maxCandidates));
        // When status is explicitly "archived"/"closed", auto-enable the
        // corresponding include flag so the status filter isn't immediately
        // undone by the exclusion below.
        const effectiveIncludeArchived =
          filter?.includeArchived || filter?.status === "archived";
        const effectiveIncludeClosed =
          filter?.includeClosed || filter?.status === "closed";
        const concurrency = Math.max(
          1,
          Math.floor(
            filter?.validationConcurrency ??
              Math.min(ids.length, CHANGE_LIST_DEFAULT_VALIDATION_CONCURRENCY),
          ),
        );
        const loaded = await loadChangesInBatches(ids, concurrency, (id) =>
          loadChange(paths.changes, id),
        );
        let changes = loaded
          .filter((r): r is { success: true; data: Change } =>
            Boolean(r.success && r.data),
          )
          .map((r) => r.data);

        if (effectiveIncludeArchived) {
          const existingIds = new Set(changes.map((c) => c.id));
          for (const archived of await loadArchivedChanges()) {
            if (!existingIds.has(archived.id)) {
              changes.push(archived);
            }
          }
        }

        if (effectiveIncludeClosed) {
          const existingIds = new Set(changes.map((c) => c.id));
          for (const closed of await loadClosedChanges(paths.closed)) {
            if (!existingIds.has(closed.id)) {
              changes.push(closed);
            }
          }
        }

        if (filter?.status) {
          changes = changes.filter((c) => c.status === filter.status);
        }
        if (!effectiveIncludeArchived) {
          changes = changes.filter((c) => c.status !== "archived");
        }
        if (!effectiveIncludeClosed) {
          changes = changes.filter((c) => c.status !== "closed");
        }
        if (
          filter?.prefix ||
          filter?.titleContains ||
          filter?.createdBefore ||
          filter?.lastActivityBefore
        ) {
          const enriched = changes.map((c) => ({
            ...c,
            lastActivityAt: c.created_at,
          }));
          changes = filterChanges(enriched, {
            prefix: filter.prefix,
            titleContains: filter.titleContains,
            createdBefore: filter.createdBefore,
            lastActivityBefore: filter.lastActivityBefore,
          });
        }

        return {
          changes: changes.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            currentGate: firstOpenGate(c.gates),
            lifecycleState: c.lifecycleState,
            created_at: c.created_at,
            lastActivityAt: computeLastActivity(c),
            taskCount: c.tasks.length,
            completedTasks: c.tasks.filter((t) => t.status === "done").length,
            fast_follow_of: c.fast_follow_of,
            capabilities: Object.keys(c.deltas),
          })),
        };
      },

      get: async (changeId: string): Promise<LoadResult<Change | null>> => {
        const { id, candidates } = await resolveChangeId(
          paths.changes,
          changeId,
        );
        if (id) {
          const loaded = await loadChange(paths.changes, id);
          // rq-terminalProjectionTruth01 bundle dominance: if an archive bundle
          // exists, the shipped invariant holds and the change is `archived`
          // regardless of the active record's (possibly stale) status — the
          // terminal status signal may have been lost after the bundle write.
          // Read-side dominance only; does not write/resurrect the active
          // record (rq-archiveRetirement01.2, rq-fix-archive-terminal-proj).
          if (
            loaded.success &&
            loaded.data &&
            loaded.data.status !== "archived" &&
            (await hasArchiveBundle(paths.archive, changeId))
          ) {
            return {
              success: true,
              data: { ...loaded.data, status: "archived" as const },
            };
          }
          return loaded;
        }
        // No active record resolves for this id. Before returning "not found",
        // consult the archive bundle (self-heal): a terminal-step interruption
        // may have written the bundle + removed nothing, leaving the change
        // reachable only via the bundle. rq-terminalProjectionTruth01.
        if (candidates.length <= 1) {
          if (await hasArchiveBundle(paths.archive, changeId)) {
            const archived = (await loadArchivedChanges()).find(
              (c) => c.id === changeId,
            );
            if (archived) {
              return {
                success: true,
                data: { ...archived, status: "archived" as const },
              };
            }
          }
          // Closure keeps the same fallback shape: a closed change retains its
          // record under `closed/` after the active directory is removed, so
          // the bundle is the only remaining source for this id.
          const closed = await loadClosedChange(paths.closed, changeId);
          if (closed.success && closed.data?.status === "closed") {
            return closed;
          }
        }
        if (candidates.length > 1) {
          return {
            success: false,
            error: `Ambiguous change ID "${changeId}". Matches: ${candidates.join(", ")}`,
            type: "not_found" as const,
          };
        }
        return {
          success: false,
          error: `Change not found: ${changeId}`,
          type: "not_found" as const,
        };
      },

      create: async (summary, options) => {
        const artifacts = options?.artifacts ?? {};
        const initialMetadata = options?.initialMetadata;

        const baseId = generateChangeId(summary);
        const existing = await listChangeDirs(paths.changes);
        let changeId = baseId;
        let counter = 2;
        let duplicateWarning: string | undefined;
        while (existing.includes(changeId)) {
          changeId = `${baseId}${counter}`;
          counter++;
        }
        if (changeId !== baseId) {
          duplicateWarning =
            `WARNING: Change ID "${baseId}" already exists. ` +
            `Created "${changeId}" instead. ` +
            `This may indicate a duplicate change — verify that "${baseId}" ` +
            `is not the same work before proceeding.`;
        }

        const scaffold = await createChangeScaffold(
          paths.changes,
          changeId,
          summary,
          artifacts,
        );

        const change: Change = {
          $schema: CHANGE_SCHEMA_URL,
          id: changeId,
          title: summary,
          status: "draft",
          created_at: new Date().toISOString(),
          tasks: [],
          deltas: {},
          same_project_dependencies:
            initialMetadata?.same_project_dependencies ?? [],
          ...(initialMetadata?.origin !== undefined
            ? { origin: initialMetadata.origin }
            : {}),
          ...(initialMetadata?.fast_follow_of !== undefined
            ? { fast_follow_of: initialMetadata.fast_follow_of }
            : {}),
          ...(initialMetadata?.cross_project_origin !== undefined
            ? { cross_project_origin: initialMetadata.cross_project_origin }
            : {}),
          ...(initialMetadata?.scope_repos !== undefined
            ? { scope_repos: initialMetadata.scope_repos }
            : {}),
          ...(initialMetadata?.epic_membership !== undefined
            ? { epic_membership: initialMetadata.epic_membership }
            : {}),
        } as Change;
        change.documents = scaffold.documents;
        await persistChangeProjection(paths, change, `create:${changeId}`);

        return {
          changeId,
          path: scaffold.changePath,
          duplicateWarning,
        };
      },

      save: async (change: Change) => {
        await persistChangeProjection(paths, change);
      },

      close: async (changeId, closure: ChangeClosure) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return null;
        if (result.data.status === "archived") {
          throw new Error(`Cannot close archived change: ${changeId}`);
        }
        result.data.status = "closed";
        result.data.closure = closure;
        await persistChangeProjection(paths, result.data);
        return result.data;
      },

      closeBatch: async (changeIds: string[], closure: ChangeClosure) => {
        // Pre-validate: fail-all if any target is invalid or protected
        for (const id of changeIds) {
          const result = await loadChange(paths.changes, id);
          if (!result.success || !result.data) {
            return {
              success: false,
              closed: 0,
              results: changeIds.map((cid) => ({
                changeId: cid,
                success: false,
                error:
                  cid === id
                    ? result.success === false
                      ? result.error
                      : "Change not found"
                    : "Aborted due to sibling failure",
              })),
              message: `Bulk close aborted: change "${id}" not found.`,
            };
          }
          if (result.data.status !== "draft") {
            return {
              success: false,
              closed: 0,
              results: changeIds.map((cid) => ({
                changeId: cid,
                success: false,
                error:
                  cid === id
                    ? `Protected status "${result.data!.status}"`
                    : "Aborted due to sibling failure",
              })),
              message: `Bulk close aborted: change "${id}" status "${result.data.status}".`,
            };
          }
        }

        const results: {
          changeId: string;
          success: boolean;
          error?: string;
        }[] = [];
        let closed = 0;
        for (const id of changeIds) {
          try {
            const result = await loadChange(paths.changes, id);
            if (!result.success || !result.data) {
              results.push({ changeId: id, success: false, error: "missing" });
              continue;
            }
            result.data.status = "closed";
            result.data.closure = closure;
            await persistChangeProjection(paths, result.data);
            results.push({ changeId: id, success: true });
            closed++;
          } catch (e) {
            results.push({
              changeId: id,
              success: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        return {
          success: closed === changeIds.length,
          closed,
          results,
          message:
            closed === changeIds.length
              ? `Successfully closed ${closed} change(s).`
              : `Closed ${closed} of ${changeIds.length} change(s).`,
        };
      },

      // Disk store has no in-memory cache; refresh and invalidate are no-ops.
      // The Store interface requires these no-op cache hooks.
      refresh: async (_changeId: string): Promise<void> => {
        // intentional no-op
      },
      invalidate: async (_changeId: string): Promise<void> => {
        // intentional no-op
      },
      setEpicMembership: async (
        changeId,
        { membership, expectedCurrent, setAt },
      ) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return null;
        const current = result.data.epic_membership;

        // A conflicting child projection must not be overwritten. Callers
        // that know what they are replacing pass
        // expectedCurrent; callers that own the authoritative entry — direct
        // convergence — pass none and overwrite unconditionally, because
        // requiring them to predict the current value would defeat the point.
        if (expectedCurrent && current) {
          if (
            current.epic_id !== expectedCurrent.epic_id ||
            current.entry_id !== expectedCurrent.entry_id
          ) {
            throw epicMembershipError(
              `Cannot set Epic membership on ${changeId}: current projection is Epic ${current.epic_id} entry ${current.entry_id}, expected Epic ${expectedCurrent.epic_id} entry ${expectedCurrent.entry_id}`,
              "epic_membership_conflict",
            );
          }
        }
        // An absent projection is deliberately NOT a conflict: fresh links and
        // move-after-clear both arrive with an expectation and nothing to match.

        // Reject only strictly older writes. Equal timestamps must succeed so
        // idempotent convergence re-runs are not starved.
        if (setAt && current?.linked_at && setAt < current.linked_at) {
          throw epicMembershipError(
            `Cannot set Epic membership on ${changeId}: write at ${setAt} is older than the current projection at ${current.linked_at}`,
            "epic_membership_stale_write",
          );
        }

        result.data.epic_membership = membership;
        await persistChangeProjection(paths, result.data);
        return result.data;
      },
      clearEpicMembership: async (changeId, { expected }) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return null;
        const current = result.data.epic_membership;
        if (
          !current ||
          current.epic_id !== expected.epic_id ||
          current.entry_id !== expected.entry_id
        ) {
          throw epicMembershipError(
            `Cannot clear Epic membership: current projection does not match expected Epic ${expected.epic_id} entry ${expected.entry_id}`,
            "epic_membership_conflict",
          );
        }
        delete result.data.epic_membership;
        await persistChangeProjection(paths, result.data);
        return result.data;
      },
    },

    // -------------------------------------------------------------------
    // Tasks — provide thin disk-backed implementations for cross-repo
    // tooling and other callers that use the Store interface.
    // -------------------------------------------------------------------
    tasks: {
      list: async (changeId, status, filter) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return [];
        let tasks = result.data.tasks;
        if (status) tasks = tasks.filter((t) => t.status === status);
        if (filter) {
          const hasKey = filter.match(/^has_metadata_key:(.+)$/);
          const kv = filter.match(/^metadata:([^=]+)=(.+)$/);
          if (hasKey) {
            const key = hasKey[1];
            tasks = tasks.filter((t) => t.metadata && key in t.metadata);
          } else if (kv) {
            const [, key, value] = kv;
            tasks = tasks.filter((t) => t.metadata?.[key] === value);
          }
        }
        return tasks;
      },
      ready: async (changeId) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) {
          return { ready: [], blocked: [] };
        }
        const tasksById = new Map(result.data.tasks.map((t) => [t.id, t]));
        const isResolved = (t: Task) =>
          t.status === "done" || t.status === "cancelled";
        const ready: Task[] = [];
        const blocked: Array<{ task: Task; blockedBy: string[] }> = [];
        // cancelledBlockerContext: surface tasks unblocked by a cancelled
        // blocker so callers can see why a previously-blocked task is now
        // ready. Mirrors the legacy SQLite-backed contract.
        const cancelledBlockerContext: Array<{
          taskId: string;
          cancelledBlockerId: string;
          cancellationReason: string;
        }> = [];
        for (const t of result.data.tasks) {
          if (t.status !== "pending") continue;
          const deps = (t.deps ?? [])
            .filter((d) => d.type === "blocked_by")
            .map((d) => d.target);
          const unmet = deps.filter((d) => {
            const dep = tasksById.get(d);
            return !dep || !isResolved(dep);
          });
          if (unmet.length === 0) {
            ready.push(t);
            for (const depId of deps) {
              const dep = tasksById.get(depId);
              if (dep?.status === "cancelled") {
                cancelledBlockerContext.push({
                  taskId: t.id,
                  cancelledBlockerId: dep.id,
                  cancellationReason:
                    dep.cancellation?.reason ?? "(no reason recorded)",
                });
              }
            }
          } else {
            blocked.push({ task: t, blockedBy: unmet });
          }
        }
        return cancelledBlockerContext.length > 0
          ? { ready, blocked, cancelledBlockerContext }
          : { ready, blocked };
      },
      update: async (
        taskId,
        status,
        notes,
        implementationSummary,
        errorRecovery,
        touchedFiles,
      ) => {
        // Disk-only update — find task, mutate, save.
        const ids = await listChangeDirs(paths.changes);
        for (const id of ids) {
          const result = await loadChange(paths.changes, id);
          if (!result.success || !result.data) continue;
          const task = result.data.tasks.find((t) => t.id === taskId);
          if (!task) continue;
          task.status = status as Task["status"];
          if (status === "in_progress" && !task.started_at) {
            task.started_at = new Date().toISOString();
          }
          if (status === "done" || status === "cancelled") {
            task.completed_at = new Date().toISOString();
            if (notes) task.completed_by = notes;
          }
          if (typeof implementationSummary !== "undefined") {
            task.implementation_summary = implementationSummary;
          }
          if (typeof errorRecovery !== "undefined") {
            task.error_recovery = errorRecovery;
          }
          if (typeof touchedFiles !== "undefined") {
            task.touched_files = touchedFiles;
          }
          await persistChangeProjection(paths, result.data);
          return task;
        }
        return null;
      },
      add: async (changeId, content, options) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }
        const task: Task = {
          id: monotonicId("tk"),
          title: content,
          type: options?.type ?? "code",
          status: "pending",
          priority: 0,
          created_at: new Date().toISOString(),
          ...(options?.section ? { section: options.section } : {}),
          ...(options?.metadata ? { metadata: options.metadata } : {}),
          ...(options?.blockedBy
            ? {
                deps: options.blockedBy.map((target) => ({
                  type: "blocked_by" as const,
                  target,
                })),
              }
            : {}),
        } as Task;
        result.data.tasks.push(task);
        await persistChangeProjection(paths, result.data);
        return task;
      },
      get: async (taskId) => {
        const ids = await listChangeDirs(paths.changes);
        for (const id of ids) {
          const result = await loadChange(paths.changes, id);
          if (!result.success || !result.data) continue;
          const task = result.data.tasks.find((t) => t.id === taskId);
          if (task) return task;
        }
        return null;
      },
      show: async (taskId) => {
        const ids = await listChangeDirs(paths.changes);
        for (const id of ids) {
          const result = await loadChange(paths.changes, id);
          if (!result.success || !result.data) continue;
          const task = result.data.tasks.find((t) => t.id === taskId);
          if (task) return { task, changeId: id };
        }
        return null;
      },
      cancel: async (taskId, cancellation: Cancellation) => {
        const ids = await listChangeDirs(paths.changes);
        for (const id of ids) {
          const result = await loadChange(paths.changes, id);
          if (!result.success || !result.data) continue;
          const task = result.data.tasks.find((t) => t.id === taskId);
          if (!task) continue;
          task.status = "cancelled";
          task.cancellation = cancellation;
          task.completed_at = new Date().toISOString();
          await persistChangeProjection(paths, result.data);
          return task;
        }
        return null;
      },
      reclassifyTdd: async (taskId, reclassification: TddReclassification) => {
        const ids = await listChangeDirs(paths.changes);
        for (const id of ids) {
          const result = await loadChange(paths.changes, id);
          if (!result.success || !result.data) continue;
          const task = result.data.tasks.find((t) => t.id === taskId);
          if (!task) continue;
          task.metadata = {
            ...(task.metadata ?? {}),
            tdd_intent: reclassification.to_intent,
          };
          task.tdd_reclassification = reclassification;
          await persistChangeProjection(paths, result.data);
          return task;
        }
        return null;
      },
    },

    // -------------------------------------------------------------------
    // Wisdom
    // -------------------------------------------------------------------
    wisdom: {
      add: async (changeId, type: WisdomType, content, sourceTask, origin) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }
        const entry: WisdomEntry = WisdomEntrySchema.parse({
          id: monotonicId("ws"),
          type,
          content,
          source_task: sourceTask,
          recorded_at: new Date().toISOString(),
          ...origin,
        });
        result.data.wisdom = [...(result.data.wisdom ?? []), entry];
        await persistChangeProjection(paths, result.data);
        return entry;
      },
      list: async (changeId) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return [];
        return result.data.wisdom ?? [];
      },
      search: async (query, options) => {
        // Linear scan across all changes' wisdom + project wisdom.
        const ids = await listChangeDirs(paths.changes);
        const all: Array<WisdomEntry & { scope: string; change_id?: string }> =
          [];
        for (const id of ids) {
          const result = await loadChange(paths.changes, id);
          if (!result.success || !result.data) continue;
          for (const entry of result.data.wisdom ?? []) {
            all.push({ ...entry, scope: "change", change_id: id });
          }
        }
        try {
          const projectEntries = await listProjectWisdom(paths.root, {
            wisdomPath: paths.wisdom,
          });
          for (const entry of projectEntries) {
            all.push({
              id: entry.id,
              type: entry.type,
              content: entry.content,
              source_task: entry.source_task,
              recorded_at: entry.promoted_at,
              scope: "project",
              product_id: entry.product_id,
              origin_repo_id: entry.origin_repo_id,
              origin_repo_project_id: entry.origin_repo_project_id,
              origin_repo_path: entry.origin_repo_path,
            } as WisdomEntry & { scope: string });
          }
        } catch (err) {
          const summary = err instanceof Error ? err.message : String(err);
          logger.warn(
            `Project wisdom read failed; skipping project entries: ${summary.slice(0, 200)}`,
            { path: paths.wisdom },
          );
        }
        return searchWisdom(all, query, options) as never;
      },
      listAll: async (options) => {
        const ids = await listChangeDirs(paths.changes);
        const all: Array<WisdomEntry & { scope: string; change_id?: string }> =
          [];
        for (const id of ids) {
          const result = await loadChange(paths.changes, id);
          if (!result.success || !result.data) continue;
          for (const entry of result.data.wisdom ?? []) {
            if (options?.type && entry.type !== options.type) continue;
            all.push({ ...entry, scope: "change", change_id: id });
          }
        }
        // Project-level wisdom from JSONL
        try {
          const projectEntries = await listProjectWisdom(paths.root, {
            wisdomPath: paths.wisdom,
          });
          for (const entry of projectEntries) {
            if (options?.type && entry.type !== options.type) continue;
            all.push({
              id: entry.id,
              type: entry.type,
              content: entry.content,
              source_task: entry.source_task,
              recorded_at: entry.promoted_at,
              scope: "project",
              product_id: entry.product_id,
              origin_repo_id: entry.origin_repo_id,
              origin_repo_project_id: entry.origin_repo_project_id,
              origin_repo_path: entry.origin_repo_path,
            } as WisdomEntry & { scope: string });
          }
        } catch (err) {
          const summary = err instanceof Error ? err.message : String(err);
          logger.warn(
            `Project wisdom read failed; skipping project entries: ${summary.slice(0, 200)}`,
            { path: paths.wisdom },
          );
        }
        return all;
      },
    },

    // -------------------------------------------------------------------
    // Spec deltas (append-only, add-only)
    //
    // Disk implementation accepts existing
    // or valid new kebab-case capability keys, reject duplicate delta ids
    // and duplicate add-requirement ids atomically, and never touch global
    // spec files (archive remains the sole global-spec writer).
    // -------------------------------------------------------------------
    specDeltas: {
      add: async (changeId, capability, delta: DeltaAdd, _options) => {
        if (!CAPABILITY_KEY_PATTERN.test(capability)) {
          throw new Error(
            `Malformed capability key: ${JSON.stringify(capability)}`,
          );
        }
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }
        const deltas = result.data.deltas ?? {};
        for (const [existingCapability, entries] of Object.entries(deltas)) {
          for (const entry of entries) {
            if (entry.id === delta.id) {
              throw new Error(
                `Duplicate spec delta id ${delta.id} under capability ${existingCapability}`,
              );
            }
            if (
              entry.operation === "add" &&
              entry.requirement.id === delta.requirement.id
            ) {
              throw new Error(
                `Duplicate requirement id ${delta.requirement.id} under capability ${existingCapability}`,
              );
            }
          }
        }
        result.data.deltas = {
          ...deltas,
          [capability]: [...(deltas[capability] ?? []), delta],
        };
        await persistChangeProjection(paths, result.data);
        return delta;
      },
      modify: async (changeId, capability, delta: DeltaModify, _options) => {
        if (!CAPABILITY_KEY_PATTERN.test(capability)) {
          throw new Error(
            `Malformed capability key: ${JSON.stringify(capability)}`,
          );
        }
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }
        const deltas = result.data.deltas ?? {};
        for (const [existingCapability, entries] of Object.entries(deltas)) {
          for (const entry of entries) {
            if (entry.id === delta.id) {
              throw new Error(
                `Duplicate spec delta id ${delta.id} under capability ${existingCapability}`,
              );
            }
            if (
              existingCapability === capability &&
              entry.operation === "modify" &&
              entry.target_id === delta.target_id
            ) {
              throw new Error(
                `Conflicting modify delta target ${delta.target_id} under capability ${capability}`,
              );
            }
          }
        }
        result.data.deltas = {
          ...deltas,
          [capability]: [...(deltas[capability] ?? []), delta],
        };
        await persistChangeProjection(paths, result.data);
        return delta;
      },
      amend: async (changeId, capability, deltaId, delta: Delta, _options) => {
        if (!CAPABILITY_KEY_PATTERN.test(capability)) {
          throw new Error(
            `Malformed capability key: ${JSON.stringify(capability)}`,
          );
        }
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }
        const deltas = result.data.deltas ?? {};
        const capabilityEntries = deltas[capability] ?? [];
        const index = capabilityEntries.findIndex(
          (entry) => entry.id === deltaId,
        );
        if (index === -1) {
          throw new Error(
            `spec delta ${deltaId} not found under capability ${capability}`,
          );
        }
        if (delta.id !== deltaId) {
          throw new Error(
            `amend id mismatch: delta.id ${delta.id} does not match deltaId ${deltaId}`,
          );
        }
        const nextEntries = [...capabilityEntries];
        nextEntries[index] = delta;
        result.data.deltas = { ...deltas, [capability]: nextEntries };
        await persistChangeProjection(paths, result.data);
        return delta;
      },
      retract: async (changeId, capability, deltaId, _options) => {
        if (!CAPABILITY_KEY_PATTERN.test(capability)) {
          throw new Error(
            `Malformed capability key: ${JSON.stringify(capability)}`,
          );
        }
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }
        const deltas = result.data.deltas ?? {};
        const capabilityEntries = deltas[capability] ?? [];
        const index = capabilityEntries.findIndex(
          (entry) => entry.id === deltaId,
        );
        if (index === -1) {
          throw new Error(
            `spec delta ${deltaId} not found under capability ${capability}`,
          );
        }
        const nextEntries = [
          ...capabilityEntries.slice(0, index),
          ...capabilityEntries.slice(index + 1),
        ];
        result.data.deltas = { ...deltas, [capability]: nextEntries };
        await persistChangeProjection(paths, result.data);
      },
      remove: async (changeId, capability, delta: DeltaRemove, _options) => {
        if (!CAPABILITY_KEY_PATTERN.test(capability)) {
          throw new Error(
            `Malformed capability key: ${JSON.stringify(capability)}`,
          );
        }
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }
        const deltas = result.data.deltas ?? {};
        for (const [existingCapability, entries] of Object.entries(deltas)) {
          for (const entry of entries) {
            if (entry.id === delta.id) {
              throw new Error(
                `Duplicate spec delta id ${delta.id} under capability ${existingCapability}`,
              );
            }
            if (
              existingCapability === capability &&
              entry.operation === "remove" &&
              entry.target_id === delta.target_id
            ) {
              throw new Error(
                `Conflicting remove delta target ${delta.target_id} under capability ${capability}`,
              );
            }
          }
        }
        result.data.deltas = {
          ...deltas,
          [capability]: [...(deltas[capability] ?? []), delta],
        };
        await persistChangeProjection(paths, result.data);
        return delta;
      },
      rename: async (changeId, capability, delta: DeltaRename, _options) => {
        if (!CAPABILITY_KEY_PATTERN.test(capability)) {
          throw new Error(
            `Malformed capability key: ${JSON.stringify(capability)}`,
          );
        }
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) {
          throw new Error(`Change not found: ${changeId}`);
        }
        const deltas = result.data.deltas ?? {};
        for (const [existingCapability, entries] of Object.entries(deltas)) {
          for (const entry of entries) {
            if (entry.id === delta.id) {
              throw new Error(
                `Duplicate spec delta id ${delta.id} under capability ${existingCapability}`,
              );
            }
          }
        }
        result.data.deltas = {
          ...deltas,
          [capability]: [...(deltas[capability] ?? []), delta],
        };
        await persistChangeProjection(paths, result.data);
        return delta;
      },
    },

    // -------------------------------------------------------------------
    // Gates
    // -------------------------------------------------------------------
    gates: {
      get: async (changeId) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return null;
        return result.data.gates ?? null;
      },
      complete: async (changeId, gateId, notes) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return;
        const gates = (result.data.gates ?? {}) as NonNullable<Change["gates"]>;
        gates[gateId] = {
          ...(gates[gateId] ?? { status: "pending" }),
          status: "done",
          completed_at: new Date().toISOString(),
          ...(notes ? { notes } : {}),
        } as NonNullable<Change["gates"]>[typeof gateId];
        result.data.gates = gates;
        await persistChangeProjection(paths, result.data);
      },
      reopenFrom: async (
        changeId,
        fromGate,
        reason,
        scopeDelta,
        reopenedBy,
        approvalEvidence,
      ) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return;
        const gates = (result.data.gates ?? {}) as NonNullable<Change["gates"]>;
        // Pre-flight: target gate must be completed before reopening.
        // Mirrors legacy semantics so reentry tests keep passing.
        const targetGate =
          gates[fromGate as keyof NonNullable<Change["gates"]>];
        if (!targetGate || targetGate.status !== "done") {
          throw new Error(
            `Cannot reopen from gate "${fromGate}" — target gate is not completed (current status: ${targetGate?.status ?? "unset"}).`,
          );
        }
        // Reset target gate + downstream
        const order: Array<
          NonNullable<Change["gates"]> extends infer G
            ? G extends Record<infer K, unknown>
              ? K
              : never
            : never
        > = [
          "proposal",
          "discovery",
          "design",
          "planning",
          "execution",
          "acceptance",
          "release",
        ];
        const idx = order.indexOf(fromGate);
        const resetGates: string[] = [];
        if (idx >= 0) {
          for (let i = idx; i < order.length; i++) {
            const gateKey = order[i] as keyof NonNullable<Change["gates"]>;
            gates[gateKey] = {
              status: "pending",
            } as NonNullable<Change["gates"]>[typeof gateKey];
            resetGates.push(order[i] as string);
          }
        }
        result.data.gates = gates;
        result.data.reentry_history = [
          ...(result.data.reentry_history ?? []),
          {
            from_gate: fromGate as string,
            reason,
            scope_delta: scopeDelta,
            reopened_by: reopenedBy ?? "agent",
            approval_evidence: approvalEvidence,
            reopened_at: new Date().toISOString(),
            gates_reset: resetGates,
          },
        ];
        await persistChangeProjection(paths, result.data);
      },
    },

    // -------------------------------------------------------------------
    // Epics — active and retired projections are the disk authority.
    // -------------------------------------------------------------------
    epics: {
      create: epicDiskOps.create,
      get: async (epicId) => {
        const retired = await loadRetiredEpicProjection(
          paths.retiredEpics,
          epicId,
        );
        if (!retired.success) return retired as LoadResult<null>;
        if (retired.data) {
          return {
            success: true,
            data: retired.data.epic_snapshot,
            source: "retired_projection" as const,
          };
        }
        const active = await loadActiveEpicProjection(
          paths.activeEpics,
          epicId,
        );
        if (!active.success) return active as LoadResult<null>;
        if (active.data)
          return {
            success: true,
            data: active.data,
            source: "active_projection" as const,
          };
        return {
          success: true,
          data: null,
        };
      },
      list: async (filter?: { status?: "active" | "all" }) => {
        const active = await listActiveEpicProjections(paths.activeEpics);
        if (!active.success) return [];
        if (filter?.status !== "all") return active.data;
        const retired = await listRetiredEpicProjections(paths.retiredEpics);
        if (!retired.success) return active.data;
        return [...active.data, ...retired.data].sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            a.id.localeCompare(b.id),
        );
      },
      update: epicDiskOps.update,
      updateScope: epicDiskOps.updateScope,
      markMerged: epicDiskOps.markMerged,
      addShell: epicDiskOps.addShell,
      promoteShell: epicDiskOps.promoteShell,
      linkChange: epicDiskOps.linkChange,
      retargetChange: epicDiskOps.retargetChange,
      unlinkChange: epicDiskOps.unlinkChange,
      setEntryMembershipStatus: epicDiskOps.setEntryMembershipStatus,
      setEntryTerminalSummary: epicDiskOps.setEntryTerminalSummary,
      reorder: epicDiskOps.reorder,
      getRetiredProjection: async (epicId) =>
        loadRetiredEpicProjection(paths.retiredEpics, epicId),
      saveRetiredProjection: async (epicId, projection) =>
        saveRetiredEpicProjection(paths.retiredEpics, epicId, projection),
      retire: epicDiskOps.retire,
      repairIndex: epicDiskOps.repairIndex,
    },

    // -------------------------------------------------------------------
    // Status — disk projections are the sole authority. Source metadata is
    // ranked first, then only the requested recent candidates are hydrated.
    // -------------------------------------------------------------------
    status: async (options?: StatusReadOptions) => {
      const recentLimit = options?.recentLimit;
      if (
        recentLimit !== undefined &&
        (!Number.isInteger(recentLimit) || recentLimit <= 0)
      ) {
        throw new Error(
          `status recentLimit must be a positive integer; received ${String(recentLimit)}`,
        );
      }

      const ids = await listChangeDirs(paths.changes);
      const archiveDirs = await listChangeDirs(paths.archive);
      if (options?.projectionState) options.projectionState.loaded = true;
      const specs = await listSpecDirs(paths.specs);

      const activeSources = (
        await Promise.all(
          ids.map((id) => readStatusSource(paths.changes, id, false)),
        )
      ).filter((source): source is StatusSource => source !== null);
      const archivedSources = (
        await Promise.all(
          archiveDirs.map((id) => readStatusSource(paths.archive, id, true)),
        )
      ).filter((source): source is StatusSource => source !== null);
      const activeIds = new Set(activeSources.map((source) => source.id));

      const byStatus: Record<ChangeStatus, number> = {
        draft: 0,
        archived: 0,
        closed: 0,
      };
      for (const source of [
        ...activeSources,
        ...archivedSources.filter((source) => !activeIds.has(source.id)),
      ]) {
        byStatus[source.status]++;
      }

      const candidates = activeSources
        .filter(
          (source) =>
            source.status !== "archived" && source.status !== "closed",
        )
        .sort((a, b) => {
          const cmp = b.lastActivityAt.localeCompare(a.lastActivityAt);
          return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
        });
      const bound =
        options?.sourceRanked && recentLimit === undefined ? 10 : recentLimit;
      const admitted =
        bound === undefined ? candidates : candidates.slice(0, bound);
      const admittedIds = new Set(admitted.map((source) => source.id));
      const loaded = await Promise.all(
        admitted.map((source) => loadChange(paths.changes, source.id)),
      );
      const now = new Date();
      const recent = loaded
        .filter((result): result is { success: true; data: Change } =>
          Boolean(result.success && result.data),
        )
        .map((result) =>
          buildChangeRecency(
            result.data,
            {
              total: result.data.tasks.length,
              done: result.data.tasks.filter((task) => task.status === "done")
                .length,
            },
            now,
          ),
        )
        .sort((a, b) => {
          const cmp = b.lastActivityAt.localeCompare(a.lastActivityAt);
          return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
        });
      const resolvedChanges = new Map(
        loaded
          .filter((result): result is { success: true; data: Change } =>
            Boolean(result.success && result.data),
          )
          .map((result) => [result.data.id, result.data] as const),
      );

      const omittedIds = candidates
        .filter((source) => !admittedIds.has(source.id))
        .map((source) => source.id);
      const warnings = omittedIds.length
        ? [
            {
              code: "SOURCE_BOUND_EXCEEDED" as const,
              source: "active_disk" as const,
              message: `Read bound (${bound} candidate(s)) limited recent change hydration; ${omittedIds.length} recent candidate(s) were omitted while lifecycle counts remained source-backed.`,
              omittedCount: omittedIds.length,
              omittedIds: omittedIds.slice(0, 20),
            },
          ]
        : undefined;

      return {
        specs: { count: specs.length, capabilities: specs },
        changes: {
          active: recent.length,
          byStatus,
          recent,
        },
        recommendations: [],
        resolvedChanges,
        ...(warnings ? { warnings } : {}),
        ...(omittedIds.length
          ? { hydrationStats: { boundedOmitted: omittedIds.length } }
          : {}),
      };
    },
  };

  return store;
}
