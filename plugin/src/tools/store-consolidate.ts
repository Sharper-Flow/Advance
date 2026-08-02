/**
 * Store Consolidation Tool — `adv_store_consolidate` (read-only half).
 *
 * rq-storeConsolidation01: merges an orphaned identity store (minted under a
 * shallow-boundary / graft pseudo-root SHA) into the true-root store.
 *
 * This module implements the two read-only actions:
 *  - `scan`: enumerate candidate orphan external stores for the current repo
 *    across XDG shard layouts (`opencode-projects/<shard>/opencode/plugins/
 *    advance/<id>/` and legacy `opencode/plugins/advance/<id>/`); flag state
 *    dirs minted under shallow-boundary / unstable SHAs using structural git
 *    checks only (C3).
 *  - `dry_run`: emit the full per-item consolidation plan — changes
 *    partitioned live vs terminal, archive bundles, Epics (incl.
 *    retired-epics), wisdom/reflections row counts, per-ID collision
 *    report (AC5, DONT2) — with ZERO mutations (AC3, C2).
 *
 * retireAgendaWorkflow: consolidation no longer reads or writes
 * `agenda.jsonl`. Legacy Agenda data is the responsibility of
 * `adv_store_cleanup`, which is mutually serialized with consolidation
 * via the shared ledger/lock primitives. Consolidation skips the file;
 * cleanup handles its deletion and audit manifest.
 *
 * The `execute` action (task tk-9e02f3b6015f) applies the exact dry-run
 * plan: approval-gated (C2), terminal-first disk-projection imports, live
 * change/Epic recreation under the true identity via the existing Temporal
 * creation/signal path (new workflows with carried state — never history
 * rewrites, C1), content-hash-deduped jsonl appends, and an append-only
 * ledger keyed on (sourceProjectId, targetProjectId, itemId) so re-runs
 * are structurally idempotent no-ops (AC6, DDC4). The orphan store is
 * never modified or deleted (DONT4). The dry-run plan and the execute
 * report share `ConsolidationReportSchema` (DDC3).
 *
 * Testability: every filesystem walk is rooted at an injectable
 * `dataHomeRoot` (the directory holding `opencode/` and
 * `opencode-projects/`), so tests never touch real XDG stores.
 */

import { appendFile, cp, mkdir, readdir, readFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { createHash } from "crypto";
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import {
  mapWithConcurrency,
  STORE_SCAN_CONCURRENCY,
} from "../utils/concurrency";
import { getDataHome, resolveProjectIdentity } from "../utils/project-id";
import { execFileGitAsync } from "../utils/git-binary";
import { isProcessAlive } from "../utils/process-liveness";
import { WORKER_LOCK_FILENAME } from "../temporal/worker-lock";
import { buildEpicWorkflowId } from "../temporal/client";
import {
  TemporalOperationsOwner,
  makeTemporalOperationContext,
} from "../temporal/operations";
import { listEpicWorkflows } from "../temporal/list-epic-workflows";
import { loadChange } from "../storage/json";
import { changeSeedStateFromChange } from "../temporal/change-state";
import { buildEpicSeedState } from "../temporal/epic-state";
import {
  ensureChangeWorkflowStarted,
  ensureEpicWorkflowStarted,
} from "../temporal/workflow-start";
import { getEpicStateQuery } from "../temporal/messages";
import { TemporalReadOutcomeError } from "../temporal/outcome-errors";
import type {
  ChangeWorkflowInput,
  EpicWorkflowInput,
  EpicWorkflowState,
} from "../temporal/contracts";
import type { Store } from "../storage/store";

// =============================================================================
// Constants
// =============================================================================

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^sha256:[0-9a-f]{64}$/;

/** Ledger filename inside the target store (design D3/DDC4). */
export const CONSOLIDATION_LEDGER_FILENAME = "consolidation-ledger.jsonl";

const TERMINAL_CHANGE_STATUSES = new Set(["archived", "closed"]);

// =============================================================================
// Schemas (shared dry-run plan / execute report — DDC3; ledger — DDC4)
// =============================================================================

export const ConsolidationPlanActionSchema = z.enum([
  "recreate",
  "import_projection",
  "append_dedupe",
  "skip_collision",
  "skip_ledgered",
]);
export type ConsolidationPlanAction = z.infer<
  typeof ConsolidationPlanActionSchema
>;

export const ConsolidationItemKindSchema = z.enum([
  "change",
  "archive_bundle",
  "epic",
]);
export type ConsolidationItemKind = z.infer<typeof ConsolidationItemKindSchema>;

export const ConsolidationPlanItemSchema = z
  .object({
    id: z.string(),
    kind: ConsolidationItemKindSchema,
    title: z.string().optional(),
    status: z.string().optional(),
    classification: z.enum(["live", "terminal"]).optional(),
    plan_action: ConsolidationPlanActionSchema,
    collision: z.boolean(),
    ledgered: z.boolean(),
    source_path: z.string().optional(),
    content_hash: z.string().optional(),
  })
  .strict();
export type ConsolidationPlanItem = z.infer<typeof ConsolidationPlanItemSchema>;

export const ConsolidationCollisionSchema = z
  .object({
    item_id: z.string(),
    kinds: z.array(z.string()),
    in_source: z.array(z.string()),
    in_target: z.array(z.string()),
    policy: z.literal("halt"),
  })
  .strict();
export type ConsolidationCollision = z.infer<
  typeof ConsolidationCollisionSchema
>;

export const ConsolidationAppendPlanSchema = z
  .object({
    source_rows: z.number().int().nonnegative(),
    target_rows: z.number().int().nonnegative(),
    new_rows: z.number().int().nonnegative(),
    duplicate_rows: z.number().int().nonnegative(),
    malformed_source_rows: z.number().int().nonnegative(),
  })
  .strict();
export type ConsolidationAppendPlan = z.infer<
  typeof ConsolidationAppendPlanSchema
>;

/**
 * Append-only consolidation ledger row (DDC4). Keyed on
 * (source_project_id, target_project_id, item_id); content-hashed so
 * re-runs are structurally idempotent (AC6). Exported for the execute
 * task (tk-9e02f3b6015f).
 *
 * Parse-only legacy: `agenda_row` is retained so existing ledgers with
 * agenda_row entries continue to parse (retireAgendaWorkflow AC8). New
 * consolidations do not write agenda_row items; legacy Agenda data is
 * cleaned up by adv_store_cleanup.
 */
export const ConsolidationLedgerRowSchema = z
  .object({
    schema_version: z.literal(1),
    source_project_id: z.string().regex(SHA40),
    target_project_id: z.string().regex(SHA40),
    item_id: z.string().min(1),
    item_kind: z.enum([
      "change_live",
      "change_terminal",
      "archive_bundle",
      "epic_live",
      "epic_retired",
      "wisdom_row",
      "agenda_row",
      "reflection_row",
    ]),
    action: z.enum(["import_projection", "recreate", "append_dedupe"]),
    content_hash: z.string().regex(SHA256_HEX),
    plan_hash: z.string().regex(SHA256_HEX),
    applied_at: z.string(),
  })
  .strict();
export type ConsolidationLedgerRow = z.infer<
  typeof ConsolidationLedgerRowSchema
>;

/** Execute-time per-item outcome (task 3 fills these; dry_run emits null). */
export const ConsolidationItemOutcomeSchema = z
  .object({
    item_id: z.string(),
    kind: ConsolidationItemKindSchema,
    action: ConsolidationPlanActionSchema,
    status: z.enum(["applied", "skipped", "failed"]),
    error: z.string().optional(),
  })
  .strict();
export type ConsolidationItemOutcome = z.infer<
  typeof ConsolidationItemOutcomeSchema
>;

export const ConsolidationReportSchema = z
  .object({
    schema_version: z.literal(1),
    action: z.enum(["dry_run", "execute"]),
    generated_at: z.string(),
    plan_hash: z.string(),
    source: z
      .object({
        project_id: z.string().regex(SHA40),
        path: z.string(),
        layout: z.enum(["legacy", "shard"]),
      })
      .strict(),
    target: z
      .object({
        project_id: z.string().regex(SHA40),
        path: z.string().nullable(),
        layout: z.enum(["legacy", "shard"]).nullable(),
        exists: z.boolean(),
      })
      .strict(),
    changes: z
      .object({
        live: z.array(ConsolidationPlanItemSchema),
        terminal: z.array(ConsolidationPlanItemSchema),
      })
      .strict(),
    archive_bundles: z.array(ConsolidationPlanItemSchema),
    epics: z
      .object({
        retired: z.array(ConsolidationPlanItemSchema),
        live: z.array(ConsolidationPlanItemSchema),
        live_source: z.enum(["temporal_visibility", "unavailable"]),
      })
      .strict(),
    appends: z
      .object({
        wisdom: ConsolidationAppendPlanSchema,
        reflections: ConsolidationAppendPlanSchema,
      })
      .strict(),
    collisions: z.array(ConsolidationCollisionSchema),
    ledger: z
      .object({
        path: z.string().nullable(),
        exists: z.boolean(),
        rows: z.number().int().nonnegative(),
        malformed_rows: z.number().int().nonnegative(),
        applied_item_ids: z.array(z.string()),
      })
      .strict(),
    safety: z
      .object({
        source_worker_lock_live: z.boolean(),
        notes: z.array(z.string()),
      })
      .strict(),
    outcomes: z.array(ConsolidationItemOutcomeSchema).nullable().default(null),
    zero_mutations: z.boolean(),
    /** Execute reports only: false when any item failed (DDC3 shared shape). */
    success: z.boolean().optional(),
    /** Execute reports only: top-level failure summary; per-item detail in outcomes. */
    error: z.string().optional(),
    /** Execute reports only: true when a re-run applied nothing (AC6). */
    no_op: z.boolean().optional(),
  })
  .strict();
export type ConsolidationReport = z.infer<typeof ConsolidationReportSchema>;

// =============================================================================
// Scan types
// =============================================================================

export const ConsolidationScanStoreSchema = z
  .object({
    project_id: z.string(),
    path: z.string(),
    layout: z.enum(["legacy", "shard"]),
    shard: z.string().nullable(),
    relation: z.enum([
      "true_store",
      "orphan_candidate",
      "unrelated",
      "malformed",
      "identity_unresolved",
    ]),
    is_commit_in_repo: z.boolean().nullable(),
    is_root_commit: z.boolean().nullable(),
    unstable_identity_suspect: z.boolean(),
    note: z.string().nullable(),
    worker_lock: z
      .object({
        present: z.boolean(),
        live: z.boolean().nullable(),
        pid: z.number().int().nullable(),
      })
      .strict(),
    summary: z
      .object({
        changes: z.number().int().nonnegative(),
        archive_bundles: z.number().int().nonnegative(),
        retired_epics: z.number().int().nonnegative(),
        wisdom_rows: z.number().int().nonnegative(),
        reflections_rows: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type ConsolidationScanStore = z.infer<
  typeof ConsolidationScanStoreSchema
>;

export const ConsolidationScanResultSchema = z
  .object({
    action: z.literal("scan"),
    directory: z.string(),
    data_home_root: z.string(),
    identity: z.union([
      z.object({ kind: z.literal("ok"), project_id: z.string() }),
      z.object({ kind: z.literal("not_git") }),
      z.object({
        kind: z.literal("unstable"),
        reason: z.enum(["shallow", "graft"]),
        guidance: z.string(),
      }),
    ]),
    layouts_walked: z.array(
      z
        .object({
          layout: z.enum(["legacy", "shard"]),
          root: z.string(),
          exists: z.boolean(),
        })
        .strict(),
    ),
    stores: z.array(ConsolidationScanStoreSchema),
    flagged: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();
export type ConsolidationScanResult = z.infer<
  typeof ConsolidationScanResultSchema
>;

// =============================================================================
// Filesystem helpers (all read-only)
// =============================================================================

interface StoreDirRef {
  projectId: string;
  path: string;
  layout: "legacy" | "shard";
  shard: string | null;
}

interface LayoutWalk {
  layout: "legacy" | "shard";
  root: string;
  exists: boolean;
}

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function countJsonlRows(path: string): Promise<number> {
  const content = await readFileSafe(path);
  if (content === null) return 0;
  return content.split("\n").filter((line) => line.trim().length > 0).length;
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

/** Deterministic JSON with sorted keys for plan hashing (arrays keep order). */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Resolve the directory that holds `opencode/` and `opencode-projects/`.
 * Under the oc per-project shard, XDG_DATA_HOME itself is
 * `.../opencode-projects/<40hex>`; the walk root is its grandparent.
 */
export function defaultDataHomeRoot(): string {
  const dataHome = getDataHome();
  const leaf = basename(dataHome);
  const parent = basename(dirname(dataHome));
  if (parent === "opencode-projects" && SHA40.test(leaf)) {
    return dirname(dirname(dataHome));
  }
  return dataHome;
}

/**
 * Enumerate ADV external store dirs under a data-home root across both
 * layouts. Read-only; never throws on missing/unreadable dirs.
 */
export async function walkStoreDirs(dataHomeRoot: string): Promise<{
  stores: StoreDirRef[];
  layouts: LayoutWalk[];
}> {
  const stores: StoreDirRef[] = [];
  const layouts: LayoutWalk[] = [];

  const legacyRoot = join(dataHomeRoot, "opencode/plugins/advance");
  const legacyNames = await readdirSafe(legacyRoot);
  layouts.push({
    layout: "legacy",
    root: legacyRoot,
    exists: await pathExists(legacyRoot),
  });
  for (const name of legacyNames) {
    stores.push({
      projectId: name,
      path: join(legacyRoot, name),
      layout: "legacy",
      shard: null,
    });
  }

  const shardsRoot = join(dataHomeRoot, "opencode-projects");
  layouts.push({
    layout: "shard",
    root: shardsRoot,
    exists: await pathExists(shardsRoot),
  });
  for (const shard of await readdirSafe(shardsRoot)) {
    const advanceRoot = join(shardsRoot, shard, "opencode/plugins/advance");
    for (const name of await readdirSafe(advanceRoot)) {
      stores.push({
        projectId: name,
        path: join(advanceRoot, name),
        layout: "shard",
        shard,
      });
    }
  }

  return { stores, layouts };
}

// =============================================================================
// Git helpers (structural classification — C3)
// =============================================================================

async function gitIsCommit(repoDir: string, sha: string): Promise<boolean> {
  try {
    await execFileGitAsync(["cat-file", "-e", `${sha}^{commit}`], {
      cwd: repoDir,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/** True when `sha` has no parents (a real history root). */
async function gitIsRootCommit(repoDir: string, sha: string): Promise<boolean> {
  try {
    const { stdout } = await execFileGitAsync(
      ["rev-list", "--max-parents=0", sha],
      { cwd: repoDir, timeout: 5000 },
    );
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .includes(sha);
  } catch {
    return false;
  }
}

// =============================================================================
// Worker-lock probe (read-only)
// =============================================================================

async function probeWorkerLock(storePath: string): Promise<{
  present: boolean;
  live: boolean | null;
  pid: number | null;
}> {
  const raw = await readFileSafe(join(storePath, WORKER_LOCK_FILENAME));
  if (raw === null) return { present: false, live: null, pid: null };
  try {
    const parsed = JSON.parse(raw) as { pid?: unknown };
    const pid = typeof parsed.pid === "number" ? parsed.pid : null;
    return {
      present: true,
      live: pid === null ? null : isProcessAlive(pid),
      pid,
    };
  } catch {
    return { present: true, live: null, pid: null };
  }
}

// =============================================================================
// Store content probes (read-only)
// =============================================================================

interface ChangeHead {
  id: string;
  title?: string;
  status: string;
}

const ChangeHeadSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    status: z.string().min(1),
  })
  .passthrough();

async function readChangeHead(
  changeJsonPath: string,
): Promise<ChangeHead | null> {
  const raw = await readFileSafe(changeJsonPath);
  if (raw === null) return null;
  try {
    return ChangeHeadSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readStoreChanges(
  storePath: string,
): Promise<{ head: ChangeHead; dir: string; content: string | null }[]> {
  const changesDir = join(storePath, "changes");
  const out: { head: ChangeHead; dir: string; content: string | null }[] = [];
  for (const dir of await readdirSafe(changesDir)) {
    const changeJsonPath = join(changesDir, dir, "change.json");
    const head = await readChangeHead(changeJsonPath);
    if (!head) continue;
    out.push({
      head,
      dir,
      content: await readFileSafe(changeJsonPath),
    });
  }
  return out;
}

async function readStoreArchiveBundles(
  storePath: string,
): Promise<{ head: ChangeHead; dir: string; content: string | null }[]> {
  const archiveDir = join(storePath, "archive");
  const out: { head: ChangeHead; dir: string; content: string | null }[] = [];
  for (const dir of await readdirSafe(archiveDir)) {
    const changeJsonPath = join(archiveDir, dir, "change.json");
    const head = await readChangeHead(changeJsonPath);
    if (!head) continue;
    out.push({
      head,
      dir,
      content: await readFileSafe(changeJsonPath),
    });
  }
  return out;
}

async function readStoreRetiredEpics(storePath: string): Promise<string[]> {
  return readdirSafe(join(storePath, "retired-epics"));
}

async function readJsonlHashed(path: string): Promise<{
  rows: number;
  malformed: number;
  hashes: Set<string>;
}> {
  const content = await readFileSafe(path);
  if (content === null) return { rows: 0, malformed: 0, hashes: new Set() };
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const hashes = new Set<string>();
  let malformed = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    try {
      JSON.parse(trimmed);
      hashes.add(sha256(trimmed));
    } catch {
      malformed += 1;
    }
  }
  return { rows: lines.length, malformed, hashes };
}

// =============================================================================
// scan
// =============================================================================

export interface ScanStoresOptions {
  /** Repo directory whose identity candidate stores are compared against. */
  directory: string;
  /** Injected data-home root (holds `opencode/` and `opencode-projects/`). */
  dataHomeRoot: string;
}

/**
 * Enumerate candidate orphan stores for the repo at `directory` and flag
 * dirs minted under shallow-boundary / unstable SHAs. Read-only (AC3).
 */
export async function scanStoresForRepo(
  options: ScanStoresOptions,
): Promise<ConsolidationScanResult> {
  const resolution = await resolveProjectIdentity(options.directory);
  const identity: ConsolidationScanResult["identity"] =
    resolution.kind === "ok"
      ? { kind: "ok", project_id: resolution.projectId }
      : resolution.kind === "not_git"
        ? { kind: "not_git" }
        : {
            kind: "unstable",
            reason: resolution.reason,
            guidance: resolution.guidance,
          };

  const { stores, layouts } = await walkStoreDirs(options.dataHomeRoot);

  // Classify each store with bounded concurrency (DONT1: never unbounded). The
  // per-store git identity probes (gitIsCommit/gitIsRootCommit) spawn a git
  // process each; a serial loop over hundreds of orphan stores blows the tool
  // budget. Results are collected in input order (mapWithConcurrency preserves
  // it), so warnings retain their original order and entries sort deterministically.
  const perStore = await mapWithConcurrency(
    stores,
    STORE_SCAN_CONCURRENCY,
    async (ref) => {
      const isSha = SHA40.test(ref.projectId);
      let relation: ConsolidationScanStore["relation"] = "malformed";
      let isCommit: boolean | null = null;
      let isRoot: boolean | null = null;
      let suspect = false;
      let note: string | null = null;

      if (!isSha) {
        note = "directory name is not a 40-hex project id";
      } else if (identity.kind !== "ok") {
        relation = "identity_unresolved";
        note =
          "repo identity could not be resolved; structural comparison skipped";
      } else {
        isCommit = await gitIsCommit(options.directory, ref.projectId);
        if (!isCommit) {
          relation = "unrelated";
          note = "not a commit of this repository (belongs to another repo)";
        } else {
          isRoot = await gitIsRootCommit(options.directory, ref.projectId);
          if (ref.projectId === identity.project_id) {
            relation = "true_store";
          } else {
            relation = "orphan_candidate";
            if (!isRoot) {
              suspect = true;
              note =
                "store id is a non-root commit of this repo — the shallow-boundary / graft unstable-identity class; consolidation candidate";
            } else {
              note =
                "store id is a root commit but not the canonical identity root (multi-root repo); review before consolidating";
            }
          }
        }
      }

      const [
        lock,
        changes,
        archiveBundles,
        retiredEpics,
        wisdomRows,
        reflRows,
      ] = await Promise.all([
        probeWorkerLock(ref.path),
        readdirSafe(join(ref.path, "changes")).then((d) => d.length),
        readdirSafe(join(ref.path, "archive")).then((d) => d.length),
        readdirSafe(join(ref.path, "retired-epics")).then((d) => d.length),
        countJsonlRows(join(ref.path, "wisdom.jsonl")),
        countJsonlRows(join(ref.path, "reflections.jsonl")),
      ]);

      const warnings: string[] = [];
      if (lock.present && lock.live) {
        warnings.push(
          `store ${ref.projectId} holds a live ${WORKER_LOCK_FILENAME} (pid ${lock.pid}) — stale sessions may still write; execute refuses while present`,
        );
      }

      const entry: ConsolidationScanStore = {
        project_id: ref.projectId,
        path: ref.path,
        layout: ref.layout,
        shard: ref.shard,
        relation,
        is_commit_in_repo: isCommit,
        is_root_commit: isRoot,
        unstable_identity_suspect: suspect,
        note,
        worker_lock: lock,
        summary: {
          changes,
          archive_bundles: archiveBundles,
          retired_epics: retiredEpics,
          wisdom_rows: wisdomRows,
          reflections_rows: reflRows,
        },
      };
      return { entry, warnings };
    },
  );

  const entries: ConsolidationScanStore[] = perStore.map((p) => p.entry);
  const warnings: string[] = perStore.flatMap((p) => p.warnings);

  return {
    action: "scan",
    directory: options.directory,
    data_home_root: options.dataHomeRoot,
    identity,
    layouts_walked: layouts,
    stores: entries.sort((a, b) => a.project_id.localeCompare(b.project_id)),
    flagged: entries
      .filter((e) => e.unstable_identity_suspect)
      .map((e) => e.project_id)
      .sort(),
    warnings,
  };
}

// =============================================================================
// dry_run
// =============================================================================

export type LiveEpicLister = (projectId: string) => Promise<string[]>;

export interface BuildPlanOptions {
  sourceProjectId: string;
  targetProjectId: string;
  dataHomeRoot: string;
  /** Injectable live-epic enumeration (Temporal visibility). */
  listLiveEpicIds?: LiveEpicLister;
  now?: () => Date;
}

async function defaultListLiveEpicIds(projectId: string): Promise<string[]> {
  let owner: TemporalOperationsOwner | undefined;
  try {
    owner = await TemporalOperationsOwner.fromEnv(projectId);
    const entries = await listEpicWorkflows(owner, {
      projectId,
      status: "active",
    });
    if (entries.kind !== "complete") {
      throw entries.error;
    }
    return entries.value.map((e) => e.id);
  } finally {
    await owner?.close();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Build the read-only consolidation plan for source → target. Throws when
 * the source store does not exist. Zero mutations (AC3); colliding IDs are
 * reported with policy `halt` and marked skip_collision (AC5, DONT2).
 */
export async function buildConsolidationPlan(
  options: BuildPlanOptions,
): Promise<ConsolidationReport> {
  const { stores } = await walkStoreDirs(options.dataHomeRoot);
  const warnings: string[] = [];

  const locate = (projectId: string): StoreDirRef | undefined => {
    const matches = stores.filter((s) => s.projectId === projectId);
    if (matches.length > 1) {
      warnings.push(
        `store ${projectId} exists in multiple layouts; using the shard-layout copy and reporting alternates`,
      );
    }
    // Deterministic preference: shard layout (canonical under oc) first.
    return (
      matches.find((m) => m.layout === "shard") ??
      matches.find((m) => m.layout === "legacy")
    );
  };

  const source = locate(options.sourceProjectId);
  if (!source) {
    throw new Error(
      `source store not found for project ${options.sourceProjectId} under data-home root ${options.dataHomeRoot}`,
    );
  }
  const target = locate(options.targetProjectId);

  const [
    sourceChanges,
    sourceArchive,
    sourceRetiredEpics,
    sourceLock,
    sourceWisdom,
    sourceReflections,
  ] = await Promise.all([
    readStoreChanges(source.path),
    readStoreArchiveBundles(source.path),
    readStoreRetiredEpics(source.path),
    probeWorkerLock(source.path),
    readJsonlHashed(join(source.path, "wisdom.jsonl")),
    readJsonlHashed(join(source.path, "reflections.jsonl")),
  ]);

  // --- Target-side probes (for collisions, ledger, append dedupe) ----------
  const targetChanges = target ? await readStoreChanges(target.path) : [];
  const targetArchive = target
    ? await readStoreArchiveBundles(target.path)
    : [];
  const targetRetiredEpics = target
    ? await readStoreRetiredEpics(target.path)
    : [];
  const targetWisdom = target
    ? await readJsonlHashed(join(target.path, "wisdom.jsonl"))
    : { rows: 0, malformed: 0, hashes: new Set<string>() };
  const targetReflections = target
    ? await readJsonlHashed(join(target.path, "reflections.jsonl"))
    : { rows: 0, malformed: 0, hashes: new Set<string>() };

  // --- Live epics (Temporal visibility; best-effort) -----------------------
  const listLive = options.listLiveEpicIds ?? defaultListLiveEpicIds;
  let liveSource: "temporal_visibility" | "unavailable" = "temporal_visibility";
  let sourceLiveEpics: string[] = [];
  let targetLiveEpics: string[] = [];
  try {
    sourceLiveEpics = await withTimeout(
      listLive(options.sourceProjectId),
      10_000,
    );
    targetLiveEpics = await withTimeout(
      listLive(options.targetProjectId),
      10_000,
    );
  } catch (error) {
    liveSource = "unavailable";
    warnings.push(
      `live epic enumeration unavailable (${error instanceof Error ? error.message : String(error)}); retired-epics disk projection still planned`,
    );
  }

  // --- Ledger (target-side, append-only) -----------------------------------
  // Read BEFORE collision detection: an item that is both ledgered and
  // present in the target is the expected post-consolidation state, not a
  // collision (AC6 re-run idempotency).
  const ledgerPath = target
    ? join(target.path, CONSOLIDATION_LEDGER_FILENAME)
    : null;
  const ledgerApplied = new Set<string>();
  let ledgerRows = 0;
  let ledgerMalformed = 0;
  let ledgerExists = false;
  if (ledgerPath) {
    const raw = await readFileSafe(ledgerPath);
    if (raw !== null) {
      ledgerExists = true;
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const row = ConsolidationLedgerRowSchema.parse(JSON.parse(trimmed));
          if (
            row.source_project_id === options.sourceProjectId &&
            row.target_project_id === options.targetProjectId
          ) {
            ledgerApplied.add(row.item_id);
          }
          ledgerRows += 1;
        } catch {
          ledgerMalformed += 1;
        }
      }
    }
  }

  // --- Collision maps: per-ID across every category ------------------------
  const sourceLocations = new Map<string, string[]>();
  const targetLocations = new Map<string, string[]>();
  const kinds = new Map<string, Set<string>>();
  const add = (
    map: Map<string, string[]>,
    id: string,
    location: string,
    kind: string,
  ) => {
    const list = map.get(id) ?? [];
    list.push(location);
    map.set(id, list);
    const k = kinds.get(id) ?? new Set<string>();
    k.add(kind);
    kinds.set(id, k);
  };

  for (const c of sourceChanges)
    add(sourceLocations, c.head.id, `changes/${c.dir}`, "change");
  for (const c of targetChanges)
    add(targetLocations, c.head.id, `changes/${c.dir}`, "change");
  for (const c of sourceArchive)
    add(sourceLocations, c.head.id, `archive/${c.dir}`, "archive_bundle");
  for (const c of targetArchive)
    add(targetLocations, c.head.id, `archive/${c.dir}`, "archive_bundle");
  for (const id of sourceRetiredEpics)
    add(sourceLocations, id, `retired-epics/${id}`, "epic");
  for (const id of targetRetiredEpics)
    add(targetLocations, id, `retired-epics/${id}`, "epic");
  if (liveSource === "temporal_visibility") {
    for (const id of sourceLiveEpics)
      add(sourceLocations, id, `epics.live/${id}`, "epic");
    for (const id of targetLiveEpics)
      add(targetLocations, id, `epics.live/${id}`, "epic");
  }

  const collisions: ConsolidationCollision[] = [];
  const collidingIds = new Set<string>();
  for (const [id, inSource] of sourceLocations) {
    const inTarget = targetLocations.get(id);
    if (!inTarget) continue;
    // Ledgered items present in both stores are the expected
    // post-consolidation state (we put them there) — not collisions.
    if (ledgerApplied.has(id)) continue;
    collidingIds.add(id);
    collisions.push({
      item_id: id,
      kinds: [...(kinds.get(id) ?? new Set())].sort(),
      in_source: inSource,
      in_target: inTarget,
      policy: "halt",
    });
  }
  collisions.sort((a, b) => a.item_id.localeCompare(b.item_id));

  const planAction = (
    id: string,
    base: ConsolidationPlanAction,
  ): {
    action: ConsolidationPlanAction;
    collision: boolean;
    ledgered: boolean;
  } => {
    if (collidingIds.has(id)) {
      return { action: "skip_collision", collision: true, ledgered: false };
    }
    if (ledgerApplied.has(id)) {
      return { action: "skip_ledgered", collision: false, ledgered: true };
    }
    return { action: base, collision: false, ledgered: false };
  };

  // --- Plan items -----------------------------------------------------------
  const live: ConsolidationPlanItem[] = [];
  const terminal: ConsolidationPlanItem[] = [];
  for (const c of sourceChanges) {
    const isTerminal = TERMINAL_CHANGE_STATUSES.has(c.head.status);
    const decided = planAction(
      c.head.id,
      isTerminal ? "import_projection" : "recreate",
    );
    const item: ConsolidationPlanItem = {
      id: c.head.id,
      kind: "change",
      ...(c.head.title !== undefined ? { title: c.head.title } : {}),
      status: c.head.status,
      classification: isTerminal ? "terminal" : "live",
      plan_action: decided.action,
      collision: decided.collision,
      ledgered: decided.ledgered,
      source_path: `changes/${c.dir}`,
      ...(c.content !== null ? { content_hash: sha256(c.content) } : {}),
    };
    (isTerminal ? terminal : live).push(item);
  }

  const archiveItems: ConsolidationPlanItem[] = sourceArchive.map((c) => {
    const decided = planAction(c.head.id, "import_projection");
    return {
      id: c.head.id,
      kind: "archive_bundle" as const,
      ...(c.head.title !== undefined ? { title: c.head.title } : {}),
      status: c.head.status,
      classification: "terminal" as const,
      plan_action: decided.action,
      collision: decided.collision,
      ledgered: decided.ledgered,
      source_path: `archive/${c.dir}`,
      ...(c.content !== null ? { content_hash: sha256(c.content) } : {}),
    };
  });

  const retiredEpicItems: ConsolidationPlanItem[] = sourceRetiredEpics.map(
    (id) => {
      const decided = planAction(id, "import_projection");
      return {
        id,
        kind: "epic" as const,
        classification: "terminal" as const,
        plan_action: decided.action,
        collision: decided.collision,
        ledgered: decided.ledgered,
        source_path: `retired-epics/${id}`,
      };
    },
  );

  const liveEpicItems: ConsolidationPlanItem[] = sourceLiveEpics.map((id) => {
    const decided = planAction(id, "recreate");
    return {
      id,
      kind: "epic" as const,
      classification: "live" as const,
      plan_action: decided.action,
      collision: decided.collision,
      ledgered: decided.ledgered,
      source_path: `epics.live/${id}`,
    };
  });

  const appendPlan = (
    source: { rows: number; malformed: number; hashes: Set<string> },
    targetSet: { rows: number; hashes: Set<string> },
  ): ConsolidationAppendPlan => {
    let newRows = 0;
    let duplicateRows = 0;
    for (const hash of source.hashes) {
      if (targetSet.hashes.has(hash)) duplicateRows += 1;
      else newRows += 1;
    }
    return {
      source_rows: source.rows,
      target_rows: targetSet.rows,
      new_rows: newRows,
      duplicate_rows: duplicateRows,
      malformed_source_rows: source.malformed,
    };
  };

  if (sourceLock.present && sourceLock.live) {
    warnings.push(
      `source store holds a live ${WORKER_LOCK_FILENAME} (pid ${sourceLock.pid}); execute will refuse until stale sessions are closed`,
    );
  }

  const now = options.now ?? (() => new Date());
  const reportBase = {
    schema_version: 1 as const,
    action: "dry_run" as const,
    source: {
      project_id: source.projectId,
      path: source.path,
      layout: source.layout,
    },
    target: {
      project_id: options.targetProjectId,
      path: target?.path ?? null,
      layout: target?.layout ?? null,
      exists: target !== undefined,
    },
    changes: {
      live: live.sort((a, b) => a.id.localeCompare(b.id)),
      terminal: terminal.sort((a, b) => a.id.localeCompare(b.id)),
    },
    archive_bundles: archiveItems.sort((a, b) => a.id.localeCompare(b.id)),
    epics: {
      retired: retiredEpicItems.sort((a, b) => a.id.localeCompare(b.id)),
      live: liveEpicItems.sort((a, b) => a.id.localeCompare(b.id)),
      live_source: liveSource,
    },
    appends: {
      wisdom: appendPlan(sourceWisdom, targetWisdom),
      reflections: appendPlan(sourceReflections, targetReflections),
    },
    collisions,
    ledger: {
      path: ledgerPath,
      exists: ledgerExists,
      rows: ledgerRows,
      malformed_rows: ledgerMalformed,
      applied_item_ids: [...ledgerApplied].sort(),
    },
    safety: {
      source_worker_lock_live: sourceLock.present && sourceLock.live === true,
      notes: warnings.sort(),
    },
    outcomes: null,
    zero_mutations: true,
  };

  return {
    ...reportBase,
    generated_at: now().toISOString(),
    plan_hash: sha256(canonicalize(reportBase)),
  };
}

// =============================================================================
// execute
// =============================================================================

export type ConsolidationErrorCode =
  | "approval_required"
  | "worker_lock_live"
  | "collisions_present";

/**
 * Typed refusal for the approval/safety gates. Thrown BEFORE any mutation —
 * a rejected execute leaves both stores byte-identical.
 */
export class ConsolidationError extends Error {
  readonly code: ConsolidationErrorCode;
  constructor(code: ConsolidationErrorCode, message: string) {
    super(message);
    this.name = "ConsolidationError";
    this.code = code;
  }
}

/**
 * Default host-side bound for a single live-Epic state query. The Temporal
 * TypeScript `WorkflowHandle.query` exposes no per-call deadline, so the bound
 * lives here on the host side — comfortably below the 10s tool-execution
 * boundary (rq-storeConsolidation bounded-query).
 */
export const DEFAULT_EPIC_QUERY_TIMEOUT_MS = 7_000;

/**
 * Typed, actionable timeout for a live-Epic state query. Kept distinct from a
 * genuine "not found" so a hung query can never be coerced to a null (skip)
 * state: it always surfaces as a per-item `failed` outcome carrying the Epic
 * ID and remediation guidance.
 */
export class EpicQueryTimeoutError extends Error {
  readonly epicId: string;
  readonly timeoutMs: number;
  constructor(epicId: string, timeoutMs: number) {
    super(
      `live Epic state query for "${epicId}" timed out after ${timeoutMs}ms ` +
        `(host-side bound below the 10s tool boundary); the source Epic ` +
        `workflow did not answer in time — restore or restart the source ` +
        `workflow and re-run consolidation`,
    );
    this.name = "EpicQueryTimeoutError";
    this.epicId = epicId;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Race a live-Epic state query against a host-side deadline and observe the
 * losing query's rejection, so a late-settling Temporal query cannot surface
 * as an unhandled promise rejection after the deadline has already failed the
 * item. When the query settles first the timer is cleared and its value (or
 * error) is passed through unchanged.
 */
function boundLiveEpicQuery(
  query: Promise<EpicWorkflowState | null>,
  epicId: string,
  timeoutMs: number,
): Promise<EpicWorkflowState | null> {
  return new Promise<EpicWorkflowState | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Deadline won: attach a no-op observer to the still-pending query so
      // its eventual rejection is never reported as unhandled.
      void query.then(
        () => {},
        () => {},
      );
      reject(new EpicQueryTimeoutError(epicId, timeoutMs));
    }, timeoutMs);
    query.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Injectable recreation backends. Defaults use the existing Temporal
 * creation/signal path (`ensureChangeWorkflowStarted` /
 * `ensureEpicWorkflowStarted`) under the true identity — new workflows with
 * carried state, never history rewrites (C1). Tests inject fakes so no real
 * Temporal server is touched.
 */
export interface ConsolidationExecuteDeps {
  recreateLiveChange?: (input: ChangeWorkflowInput) => Promise<void>;
  queryLiveEpicState?: (
    projectId: string,
    epicId: string,
  ) => Promise<EpicWorkflowState | null>;
  recreateLiveEpic?: (input: EpicWorkflowInput) => Promise<void>;
  /**
   * Host-side bound (ms) applied to each `queryLiveEpicState` call. Defaults
   * to {@link DEFAULT_EPIC_QUERY_TIMEOUT_MS}; tests inject a tiny value.
   */
  epicQueryTimeoutMs?: number;
}

export interface ExecuteConsolidationOptions extends BuildPlanOptions {
  approvedByUser: boolean;
  approvalEvidence: string;
  /** Repo root recorded as the recreated workflow's archive project. */
  archiveProjectPath?: string;
  deps?: ConsolidationExecuteDeps;
}

/**
 * Copy a disk projection directory source → target. Resume-safe:
 *  - identical primary file → fill in any missing files, never overwrite;
 *  - divergent primary file → throw (collision-class, DONT2);
 *  - missing destination → full copy.
 */
async function importDirProjection(
  srcDir: string,
  destDir: string,
  primaryRel: string,
): Promise<void> {
  const [srcPrimary, destPrimary] = await Promise.all([
    readFileSafe(join(srcDir, primaryRel)),
    readFileSafe(join(destDir, primaryRel)),
  ]);
  if (destPrimary !== null && destPrimary !== srcPrimary) {
    throw new Error(
      `destination ${destDir} already exists with divergent ${primaryRel}; refusing to overwrite (collision-class)`,
    );
  }
  await mkdir(dirname(destDir), { recursive: true });
  await cp(srcDir, destDir, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Apply the exact last dry-run plan: terminal-first disk-projection imports,
 * then live recreation under the true identity, then content-hash-deduped
 * jsonl appends. Append-only ledger rows make re-runs structurally
 * idempotent (AC6, DDC4); the orphan store is never modified (DONT4).
 *
 * Throws ConsolidationError (typed refusal, zero mutations) for missing
 * approval, live source worker.lock, or plan collisions.
 */
export async function executeConsolidation(
  options: ExecuteConsolidationOptions,
): Promise<ConsolidationReport> {
  if (
    options.approvedByUser !== true ||
    typeof options.approvalEvidence !== "string" ||
    options.approvalEvidence.trim().length === 0
  ) {
    throw new ConsolidationError(
      "approval_required",
      "execute requires approvedByUser: true and non-blank approvalEvidence (C2)",
    );
  }

  const plan = await buildConsolidationPlan(options);
  const now = options.now ?? (() => new Date());

  if (plan.safety.source_worker_lock_live) {
    throw new ConsolidationError(
      "worker_lock_live",
      `source store ${options.sourceProjectId} holds a live ${WORKER_LOCK_FILENAME}; close stale sessions before consolidating`,
    );
  }
  if (plan.collisions.length > 0) {
    throw new ConsolidationError(
      "collisions_present",
      `plan reports ${plan.collisions.length} collision(s) [${plan.collisions
        .map((c) => c.item_id)
        .join(", ")}]; resolve duplicates before executing (DONT2)`,
    );
  }

  // Resolve (and if necessary create) the target store dir. A missing target
  // is minted under the canonical legacy layout.
  const targetPath =
    plan.target.path ??
    join(
      options.dataHomeRoot,
      "opencode/plugins/advance",
      options.targetProjectId,
    );
  await mkdir(targetPath, { recursive: true });
  const ledgerFilePath = join(targetPath, CONSOLIDATION_LEDGER_FILENAME);

  const sourcePath = plan.source.path;
  const outcomes: ConsolidationItemOutcome[] = [];

  const writeLedger = async (
    row: Omit<
      ConsolidationLedgerRow,
      "schema_version" | "applied_at" | "plan_hash"
    >,
  ): Promise<void> => {
    const full: ConsolidationLedgerRow = {
      schema_version: 1,
      ...row,
      plan_hash: plan.plan_hash,
      applied_at: now().toISOString(),
    };
    await appendFile(ledgerFilePath, `${JSON.stringify(full)}\n`, "utf-8");
  };

  // --- Phase 1: terminal imports (ALL before ANY live recreation) ----------
  const terminalItems: Array<{
    item: ConsolidationPlanItem;
    primaryRel: string;
    itemKind: ConsolidationLedgerRow["item_kind"];
  }> = [
    ...plan.changes.terminal.map((item) => ({
      item,
      primaryRel: "change.json",
      itemKind: "change_terminal" as const,
    })),
    ...plan.archive_bundles.map((item) => ({
      item,
      primaryRel: "change.json",
      itemKind: "archive_bundle" as const,
    })),
    ...plan.epics.retired.map((item) => ({
      item,
      primaryRel: "retired-projection.json",
      itemKind: "epic_retired" as const,
    })),
  ];

  for (const { item, primaryRel, itemKind } of terminalItems) {
    if (item.plan_action === "skip_ledgered") {
      outcomes.push({
        item_id: item.id,
        kind: item.kind,
        action: item.plan_action,
        status: "skipped",
      });
      continue;
    }
    try {
      const srcDir = join(sourcePath, item.source_path!);
      await importDirProjection(
        srcDir,
        join(targetPath, item.source_path!),
        primaryRel,
      );
      const primary = (await readFileSafe(join(srcDir, primaryRel))) ?? "";
      await writeLedger({
        source_project_id: options.sourceProjectId,
        target_project_id: options.targetProjectId,
        item_id: item.id,
        item_kind: itemKind,
        action: "import_projection",
        content_hash: sha256(primary),
      });
      outcomes.push({
        item_id: item.id,
        kind: item.kind,
        action: "import_projection",
        status: "applied",
      });
    } catch (error) {
      outcomes.push({
        item_id: item.id,
        kind: item.kind,
        action: "import_projection",
        status: "failed",
        error: errorMessage(error),
      });
      // Terminal-first invariant: abort before the live phase so a mid-run
      // failure leaves history correct with only live work to retry.
      return finishExecuteReport(plan, outcomes, now, errorMessage(error));
    }
  }

  // --- Phase 2: live recreation under the true identity --------------------
  const ownerRef: { current: TemporalOperationsOwner | null } = {
    current: null,
  };
  const sourceOwnerRef: { current: TemporalOperationsOwner | null } = {
    current: null,
  };
  const getOwner = async (): Promise<TemporalOperationsOwner> => {
    if (!ownerRef.current) {
      ownerRef.current = await TemporalOperationsOwner.fromEnv(
        options.targetProjectId,
      );
    }
    return ownerRef.current;
  };
  const getSourceOwner = async (): Promise<TemporalOperationsOwner> => {
    if (!sourceOwnerRef.current) {
      sourceOwnerRef.current = await TemporalOperationsOwner.fromEnv(
        options.sourceProjectId,
      );
    }
    return sourceOwnerRef.current;
  };

  const deps = options.deps ?? {};
  const epicQueryTimeoutMs =
    deps.epicQueryTimeoutMs ?? DEFAULT_EPIC_QUERY_TIMEOUT_MS;
  const recreateLiveChange =
    deps.recreateLiveChange ??
    (async (input: ChangeWorkflowInput): Promise<void> => {
      await ensureChangeWorkflowStarted(await getOwner(), input);
    });
  const queryLiveEpicState =
    deps.queryLiveEpicState ??
    (async (
      projectId: string,
      epicId: string,
    ): Promise<EpicWorkflowState | null> => {
      const o = await getSourceOwner();
      const workflowId = buildEpicWorkflowId(projectId, epicId);
      const ctx = makeTemporalOperationContext(
        projectId,
        workflowId,
        "query",
        "storeConsolidate.queryLiveEpicState",
        epicQueryTimeoutMs,
      );
      const handle = o.getHandle(ctx);
      const outcome = await o.query(ctx, handle, getEpicStateQuery);
      if (outcome.kind === "complete")
        return outcome.value as EpicWorkflowState;
      if (outcome.kind === "not_found") return null;
      throw new TemporalReadOutcomeError(outcome);
    });
  const recreateLiveEpic =
    deps.recreateLiveEpic ??
    (async (input: EpicWorkflowInput): Promise<void> => {
      await ensureEpicWorkflowStarted(await getOwner(), input);
    });

  try {
    for (const item of plan.changes.live) {
      if (item.plan_action !== "recreate") {
        outcomes.push({
          item_id: item.id,
          kind: item.kind,
          action: item.plan_action,
          status: "skipped",
        });
        continue;
      }
      try {
        const srcDir = join(sourcePath, item.source_path!);
        const dirName = basename(srcDir);
        const loaded = await loadChange(join(sourcePath, "changes"), dirName);
        if (!loaded.success || !loaded.data) {
          throw new Error(
            `source change ${item.id} unreadable (${loaded.success ? "empty" : loaded.error}); cannot carry state`,
          );
        }
        const change = loaded.data;
        // Disk projection + artifact files into the target store (mirrors
        // the store's own non-terminal dual-write).
        await importDirProjection(
          srcDir,
          join(targetPath, "changes", dirName),
          "change.json",
        );
        await recreateLiveChange({
          projectId: options.targetProjectId,
          changeId: change.id,
          title: change.title,
          initializedAt: change.created_at,
          projectionChangesDir: join(targetPath, "changes"),
          ...(options.archiveProjectPath
            ? { archiveProjects: [{ projectPath: options.archiveProjectPath }] }
            : {}),
          seedState: changeSeedStateFromChange(change),
        });
        const raw = (await readFileSafe(join(srcDir, "change.json"))) ?? "";
        await writeLedger({
          source_project_id: options.sourceProjectId,
          target_project_id: options.targetProjectId,
          item_id: item.id,
          item_kind: "change_live",
          action: "recreate",
          content_hash: sha256(raw),
        });
        outcomes.push({
          item_id: item.id,
          kind: item.kind,
          action: "recreate",
          status: "applied",
        });
      } catch (error) {
        outcomes.push({
          item_id: item.id,
          kind: item.kind,
          action: "recreate",
          status: "failed",
          error: errorMessage(error),
        });
      }
    }

    for (const item of plan.epics.live) {
      if (item.plan_action !== "recreate") {
        outcomes.push({
          item_id: item.id,
          kind: item.kind,
          action: item.plan_action,
          status: "skipped",
        });
        continue;
      }
      try {
        const state = await boundLiveEpicQuery(
          queryLiveEpicState(options.sourceProjectId, item.id),
          item.id,
          epicQueryTimeoutMs,
        );
        if (!state) {
          throw new Error(
            `source epic workflow state unavailable for ${item.id}; cannot carry Epic state — restore the source workflow and re-run consolidation`,
          );
        }
        await recreateLiveEpic({
          projectId: options.targetProjectId,
          epicId: item.id,
          title: state.epic.title,
          narrative: state.epic.narrative,
          initializedAt: state.initializedAt,
          seedState: buildEpicSeedState(state),
        });
        await writeLedger({
          source_project_id: options.sourceProjectId,
          target_project_id: options.targetProjectId,
          item_id: item.id,
          item_kind: "epic_live",
          action: "recreate",
          content_hash: sha256(canonicalize(state.epic)),
        });
        outcomes.push({
          item_id: item.id,
          kind: item.kind,
          action: "recreate",
          status: "applied",
        });
      } catch (error) {
        outcomes.push({
          item_id: item.id,
          kind: item.kind,
          action: "recreate",
          status: "failed",
          error: errorMessage(error),
        });
      }
    }
  } finally {
    await Promise.all([
      sourceOwnerRef.current?.close(),
      ownerRef.current?.close(),
    ]);
  }

  // --- Phase 3: jsonl appends with content-hash dedupe ---------------------
  // retireAgendaWorkflow: agenda.jsonl is intentionally absent. Legacy
  // Agenda data is deleted by adv_store_cleanup, not consolidated.
  const appendTargets: Array<{
    file: string;
    itemKind: ConsolidationLedgerRow["item_kind"];
  }> = [
    { file: "wisdom.jsonl", itemKind: "wisdom_row" },
    { file: "reflections.jsonl", itemKind: "reflection_row" },
  ];
  for (const { file, itemKind } of appendTargets) {
    const srcContent = await readFileSafe(join(sourcePath, file));
    if (srcContent === null) continue;
    const targetHashes = (await readJsonlHashed(join(targetPath, file))).hashes;
    const seen = new Set<string>();
    const toAppend: string[] = [];
    for (const line of srcContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        JSON.parse(trimmed);
      } catch {
        continue; // malformed source rows are reported in the plan, never copied
      }
      const hash = sha256(trimmed);
      if (seen.has(hash) || targetHashes.has(hash)) continue;
      seen.add(hash);
      toAppend.push(trimmed);
    }
    if (toAppend.length === 0) continue;
    await appendFile(
      join(targetPath, file),
      toAppend.map((l) => `${l}\n`).join(""),
      "utf-8",
    );
    for (const line of toAppend) {
      const hash = sha256(line);
      await writeLedger({
        source_project_id: options.sourceProjectId,
        target_project_id: options.targetProjectId,
        item_id: hash,
        item_kind: itemKind,
        action: "append_dedupe",
        content_hash: hash,
      });
    }
  }

  return finishExecuteReport(plan, outcomes, now);
}

function finishExecuteReport(
  plan: ConsolidationReport,
  outcomes: ConsolidationItemOutcome[],
  now: () => Date,
  abortError?: string,
): ConsolidationReport {
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const applied = outcomes.filter((o) => o.status === "applied").length;
  return {
    ...plan,
    action: "execute",
    generated_at: now().toISOString(),
    outcomes,
    zero_mutations: false,
    success: failed === 0,
    no_op: applied === 0 && failed === 0,
    ...(failed > 0
      ? {
          error:
            abortError ??
            `${failed} consolidation item(s) failed; see outcomes for per-item errors`,
        }
      : {}),
  };
}

// =============================================================================
// Tool definition
// =============================================================================

const SHA40_DESCRIBE = "40-hex ADV project id (git root commit)";

/**
 * Shared source/target validation + identity resolution for dry_run and
 * execute. Returns either the resolved ids or a user-facing error string.
 */
async function resolveConsolidationTargetIds(
  args: { source_project_id?: string; target_project_id?: string },
  directory: string,
  action: "dry_run" | "execute",
): Promise<
  { sourceProjectId: string; targetProjectId: string } | { error: string }
> {
  if (!args.source_project_id) {
    return { error: `source_project_id is required for ${action}` };
  }
  if (!SHA40.test(args.source_project_id)) {
    return {
      error: `source_project_id must be a ${SHA40_DESCRIBE}; got "${args.source_project_id}"`,
    };
  }
  if (args.target_project_id && !SHA40.test(args.target_project_id)) {
    return {
      error: `target_project_id must be a ${SHA40_DESCRIBE}; got "${args.target_project_id}"`,
    };
  }
  let targetProjectId = args.target_project_id;
  if (!targetProjectId) {
    const resolution = await resolveProjectIdentity(directory);
    if (resolution.kind === "ok") {
      targetProjectId = resolution.projectId;
    } else if (resolution.kind === "unstable") {
      return {
        error: `${resolution.guidance} Pass target_project_id explicitly to override.`,
      };
    } else {
      return {
        error: `could not resolve target identity for ${directory}: not a git repository. Pass target_project_id explicitly to override.`,
      };
    }
  }
  if (args.source_project_id === targetProjectId) {
    return {
      error:
        "source_project_id and target_project_id are the same store; nothing to consolidate",
    };
  }
  return { sourceProjectId: args.source_project_id, targetProjectId };
}

export const storeConsolidateTools = {
  adv_store_consolidate: {
    description:
      "Consolidate an orphaned ADV identity store (minted under a shallow-boundary / unstable SHA) into the true-root store. " +
      "action 'scan' (default, read-only) enumerates candidate orphan stores for the current repo across XDG shard layouts and flags dirs minted under unstable SHAs. " +
      "action 'dry_run' emits the full per-item plan (changes live vs terminal, archive bundles, Epics, wisdom/reflections, per-ID collision report) with zero mutations. " +
      "Colliding item IDs halt with a per-ID report — nothing is overwritten. " +
      "action 'execute' applies the exact dry-run plan: approval-gated (approvedByUser + approvalEvidence), refuses on a live source worker.lock or collisions, imports terminal items as disk projections first, recreates live changes/Epics under the true identity, appends wisdom/reflections with content-hash dedupe, and writes an append-only ledger so re-runs are idempotent no-ops.",
    args: {
      action: z
        .enum(["scan", "dry_run", "execute"])
        .default("scan")
        .describe(
          "scan = enumerate orphan candidates (read-only); dry_run = full per-item plan (read-only); execute = apply the plan (approval-gated, terminal-first, ledger-idempotent)",
        ),
      directory: z
        .string()
        .optional()
        .describe(
          "Repo directory whose identity candidate stores are compared against. Defaults to the current project root.",
        ),
      data_home_root: z
        .string()
        .optional()
        .describe(
          "Data-home root holding opencode/ and opencode-projects/. Injected for tests; defaults to the resolved XDG data home.",
        ),
      source_project_id: z
        .string()
        .optional()
        .describe(
          `${SHA40_DESCRIBE} of the orphan store to consolidate from. Required for dry_run/execute.`,
        ),
      target_project_id: z
        .string()
        .optional()
        .describe(
          `${SHA40_DESCRIBE} of the true-root store to consolidate into. Defaults to the current repo's resolved identity.`,
        ),
      approvedByUser: z
        .boolean()
        .optional()
        .describe("Required for execute. Must be true."),
      approvalEvidence: z
        .string()
        .optional()
        .describe("Required for execute. Audit evidence of user approval."),
    },
    execute: async (
      args: {
        action: "scan" | "dry_run" | "execute";
        directory?: string;
        data_home_root?: string;
        source_project_id?: string;
        target_project_id?: string;
        approvedByUser?: boolean;
        approvalEvidence?: string;
      },
      store: Store,
    ) => {
      const directory = args.directory ?? store.paths.root;
      const dataHomeRoot = args.data_home_root ?? defaultDataHomeRoot();

      if (args.action === "scan") {
        const result = await scanStoresForRepo({ directory, dataHomeRoot });
        return formatToolOutput(result, { tool: "adv_store_consolidate" });
      }

      const action = args.action as "dry_run" | "execute";
      const resolved = await resolveConsolidationTargetIds(
        args,
        directory,
        action,
      );
      if ("error" in resolved) {
        return formatToolOutput(
          { success: false, action, error: resolved.error },
          { tool: "adv_store_consolidate" },
        );
      }

      if (args.action === "execute") {
        try {
          const report = await executeConsolidation({
            sourceProjectId: resolved.sourceProjectId,
            targetProjectId: resolved.targetProjectId,
            dataHomeRoot,
            approvedByUser: args.approvedByUser === true,
            approvalEvidence: args.approvalEvidence ?? "",
            archiveProjectPath: store.paths.root,
          });
          return formatToolOutput(report, { tool: "adv_store_consolidate" });
        } catch (error) {
          return formatToolOutput(
            {
              success: false,
              action: "execute",
              error_code:
                error instanceof ConsolidationError
                  ? error.code
                  : "execute_failed",
              error: errorMessage(error),
            },
            { tool: "adv_store_consolidate" },
          );
        }
      }

      // action === "dry_run"
      try {
        const plan = await buildConsolidationPlan({
          sourceProjectId: resolved.sourceProjectId,
          targetProjectId: resolved.targetProjectId,
          dataHomeRoot,
        });
        return formatToolOutput(plan, { tool: "adv_store_consolidate" });
      } catch (error) {
        return formatToolOutput(
          {
            success: false,
            action: "dry_run",
            error: error instanceof Error ? error.message : String(error),
          },
          { tool: "adv_store_consolidate" },
        );
      }
    },
  },
};
