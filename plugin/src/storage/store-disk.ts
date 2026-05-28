/**
 * Disk-only Store backend (P2.7).
 *
 * Replaces the SQLite-backed `createLegacyStore` with a minimal,
 * disk-native Store implementation. Used as the substrate that
 * `createTemporalStoreBackend` wraps for the Temporal-only architecture.
 *
 * Why a disk-only backend at all (instead of pure-Temporal)?
 *
 * The Temporal store still needs a few things from a non-Temporal source:
 *   - **Paths**: ProjectPaths is the canonical computation that maps repo
 *     root + config to changes/specs/agenda/wisdom directories.
 *   - **Disk artifact writes**: changes.create, changes.save,
 *     changes.updateArtifacts manipulate proposal.md / change.json on disk.
 *     These are the source-of-truth files that survive workflow eviction.
 *   - **Cross-repo target init**: when adv_change_create is called with
 *     `target_path`, the cross-project flow needs to scaffold a change in
 *     the target repo's filesystem before any Temporal workflow exists.
 *   - **Cold-start fallbacks**: when Visibility API isn't available
 *     (test mocks), listChangeDirs reads disk directly.
 *
 * The previous `createLegacyStore` did all this PLUS maintained a SQLite
 * cache for FTS, dependency resolution, and stale-status calculation.
 * P2.3 replaced the FTS need with linear scan, P2.4 replaced the listing
 * need with the Visibility API, and the Temporal store overrides every
 * task / gate / wisdom-mutation method. So SQLite has zero remaining
 * consumers — and along with it the 11 legacy files (sqlite.ts, health.ts,
 * corruption-recovery.ts, store-sync.ts, store-context.ts, store-changes,
 * store-tasks, store-gates, store-specs, store-locks, store-legacy itself).
 *
 * This module provides the disk-only minimum the Temporal store needs to
 * function; everything else is overridden upstream in `store-temporal.ts`.
 */

import { mkdir } from "fs/promises";
import { basename, join } from "path";

import type {
  Change,
  ChangeClosure,
  ChangeStatus,
  Spec,
  Task,
  TddReclassification,
  Cancellation,
  WisdomEntry,
  WisdomType,
  ProjectConfig,
} from "../types";
import { WisdomEntrySchema } from "../types";
import {
  createChangeScaffold,
  getProjectPaths,
  listChangeDirs,
  listSpecDirs,
  loadChange,
  loadProjectConfig,
  loadSpec,
  resolveChangeId,
  saveChange,
  saveProjectConfig,
  saveSpec,
  updateChangeArtifacts,
  type LoadResult,
} from "./json";
import {
  buildChangeRecency,
  computeLastActivity,
  type Store,
  type SearchResult,
} from "./store-types";
import { generateChangeId } from "../utils/change-id";
import { searchWisdom, filterChanges } from "./content-search";
import { listProjectWisdom } from "./project-wisdom";

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
          features: {
            tdd_enforcement: "strict",
            worktree_auto_create: true,
            // rq-autoManageAdvWorktrees AC2 — default true (post-rollout).
            // Explicit `false` preserves legacy permissive behavior.
            worktree_guard_enforce: true,
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
        const ids = await listChangeDirs(paths.changes);
        // When status is explicitly "archived"/"closed", auto-enable the
        // corresponding include flag so the status filter isn't immediately
        // undone by the exclusion below.
        const effectiveIncludeArchived =
          filter?.includeArchived || filter?.status === "archived";
        const effectiveIncludeClosed =
          filter?.includeClosed || filter?.status === "closed";
        const loaded = await Promise.all(
          ids.map((id) => loadChange(paths.changes, id)),
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
            created_at: c.created_at,
            lastActivityAt: computeLastActivity(c),
            taskCount: c.tasks.length,
            completedTasks: c.tasks.filter((t) => t.status === "done").length,
            fast_follow_of: c.fast_follow_of,
          })),
        };
      },

      get: async (changeId: string): Promise<LoadResult<Change | null>> => {
        const { id, candidates } = await resolveChangeId(
          paths.changes,
          changeId,
        );
        if (!id) {
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
        }
        return loadChange(paths.changes, id);
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
          $schema:
            "https://raw.githubusercontent.com/anomalyco/oc-plugins/main/advance/plugin/schemas/change.schema.json",
          id: changeId,
          title: summary,
          status: "draft",
          created_at: new Date().toISOString(),
          tasks: [],
          deltas: {},
          ...(initialMetadata?.origin !== undefined
            ? { origin: initialMetadata.origin }
            : {}),
          ...(initialMetadata?.fast_follow_of !== undefined
            ? { fast_follow_of: initialMetadata.fast_follow_of }
            : {}),
          ...(initialMetadata?.scope_repos !== undefined
            ? { scope_repos: initialMetadata.scope_repos }
            : {}),
        } as Change;
        await saveChange(paths.changes, change);

        return {
          changeId,
          path: scaffold.proposalPath,
          problemStatementPath: scaffold.problemStatementPath,
          agreementPath: scaffold.agreementPath,
          designPath: scaffold.designPath,
          executiveSummaryPath: scaffold.executiveSummaryPath,
          duplicateWarning,
        };
      },

      save: async (change: Change) => {
        await saveChange(paths.changes, change);
      },

      updateArtifacts: async (changeId, artifacts) => {
        const { id, candidates } = await resolveChangeId(
          paths.changes,
          changeId,
        );
        if (!id) {
          const hint =
            candidates.length > 0
              ? ` Did you mean: ${candidates.join(", ")}?`
              : "";
          return {
            success: false,
            error: `Change not found: "${changeId}".${hint}`,
          };
        }
        const result = await updateChangeArtifacts(paths.changes, id, artifacts);
        if (result.error) {
          return { success: false, error: result.error };
        }
        return {
          success: true,
          proposalPath: result.proposalPath,
          problemStatementPath: result.problemStatementPath,
          agreementPath: result.agreementPath,
          designPath: result.designPath,
          executiveSummaryPath: result.executiveSummaryPath,
        };
      },

      close: async (changeId, closure: ChangeClosure) => {
        const result = await loadChange(paths.changes, changeId);
        if (!result.success || !result.data) return null;
        if (result.data.status === "archived") {
          throw new Error(`Cannot close archived change: ${changeId}`);
        }
        result.data.status = "closed";
        result.data.closure = closure;
        await saveChange(paths.changes, result.data);
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
          if (
            result.data.status !== "draft" &&
            result.data.status !== "pending"
          ) {
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
            await saveChange(paths.changes, result.data);
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

      // Disk store has no in-memory cache; refresh is a no-op. The
      // Store interface requires the method so the temporal store
      // (which does cache) can satisfy the contract.
      refresh: async (_changeId: string): Promise<void> => {
        // intentional no-op
      },
    },

    // -------------------------------------------------------------------
    // Tasks — store-temporal overrides every method, but Store interface
    // requires the namespace to exist. Provide thin disk-backed
    // implementations for the rare path that reaches here (cross-repo
    // tooling pre-Temporal-bootstrap, test fallbacks).
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
          await saveChange(paths.changes, result.data);
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
          id: `tk-${Math.random().toString(36).slice(2, 10)}`,
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
        await saveChange(paths.changes, result.data);
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
          await saveChange(paths.changes, result.data);
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
          await saveChange(paths.changes, result.data);
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
          id: `ws-${Math.random().toString(36).slice(2, 10)}`,
          type,
          content,
          source_task: sourceTask,
          recorded_at: new Date().toISOString(),
          ...origin,
        });
        result.data.wisdom = [...(result.data.wisdom ?? []), entry];
        await saveChange(paths.changes, result.data);
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
        } catch {
          // Empty/missing project wisdom is fine.
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
        } catch {
          // Empty/missing project wisdom is fine.
        }
        return all;
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
        await saveChange(paths.changes, result.data);
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
        await saveChange(paths.changes, result.data);
      },
    },

    // -------------------------------------------------------------------
    // Status — Temporal store overrides this entirely (buildTemporalStatus).
    // The disk-only fallback returns minimal shape for tests/cross-repo.
    // -------------------------------------------------------------------
    status: async () => {
      const ids = await listChangeDirs(paths.changes);
      const specs = await listSpecDirs(paths.specs);
      const loaded = await Promise.all(
        ids.map((id) => loadChange(paths.changes, id)),
      );
      const changes = loaded
        .filter((r): r is { success: true; data: Change } =>
          Boolean(r.success && r.data),
        )
        .map((r) => r.data);
      const archivedChanges = await loadArchivedChanges();
      const activeIds = new Set(changes.map((change) => change.id));
      for (const archived of archivedChanges) {
        if (!activeIds.has(archived.id)) {
          changes.push(archived);
        }
      }
      const byStatus: Record<ChangeStatus, number> = {
        draft: 0,
        pending: 0,
        active: 0,
        archived: 0,
        closed: 0,
      };
      for (const change of changes) byStatus[change.status]++;
      const now = new Date();
      const recent = changes
        .filter(
          (change) =>
            change.status !== "archived" && change.status !== "closed",
        )
        .map((change) =>
          buildChangeRecency(
            change,
            {
              total: change.tasks.length,
              done: change.tasks.filter((task) => task.status === "done")
                .length,
            },
            now,
          ),
        )
        .sort((a, b) => {
          const cmp = b.lastActivityAt.localeCompare(a.lastActivityAt);
          return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
        });
      return {
        specs: { count: specs.length, capabilities: specs },
        changes: {
          active: recent.length,
          byStatus,
          recent,
        },
        recommendations: [],
      };
    },
  };

  return store;
}
