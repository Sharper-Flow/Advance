/**
 * Store Cleanup Tool — `adv_store_cleanup` (legacy Agenda cleanup).
 *
 * Maintenance-only cleanup for legacy Agenda data across discoverable local
 * ADV stores. Supports scan → dry_run → approval-gated execute.
 *
 * Reuses shared store-discovery primitives plus live-lock refusal,
 * ledger-based idempotency, and manifest-before-delete.
 *
 * Retained indefinitely as operator-only maintenance (C6): dry-run plans are
 * bounded and reviewable (summary counts + paged renders), and plan_hash
 * always covers the full plan content — including paginated-out stores — so
 * an approval pinned to any render authorizes exactly one full plan.
 *
 * Design references: AC7, AC9, AC10, SC3, C3, C4, C6, DONT2, DONT5.
 * Spec: rq-storeCleanupCoupling01 (cleanup/consolidation coupling, lock
 * refusal, manifest-before-delete ordering, indefinite operator-only
 * retention).
 */

import { appendFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import {
  mapWithConcurrency,
  STORE_SCAN_CONCURRENCY,
} from "../utils/concurrency";
import {
  walkStoreDirs,
  defaultDataHomeRoot,
  CONSOLIDATION_LEDGER_FILENAME,
} from "./store-discovery";
import type { Store } from "../storage/store";

// =============================================================================
// Constants
// =============================================================================

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^sha256:[0-9a-f]{64}$/;

/** Manifest filename inside each cleaned store (design: manifest-before-delete). */
export const AGENDA_CLEANUP_MANIFEST_FILENAME = "agenda-cleanup-manifest.jsonl";

/** dry_run paging bounds (AC9): default page size and hard maximum. */
export const CLEANUP_PLAN_DEFAULT_LIMIT = 20;
export const CLEANUP_PLAN_MAX_LIMIT = 100;

// =============================================================================
// Schemas
// =============================================================================

export const StoreCleanupAgendaSummarySchema = z
  .object({
    exists: z.boolean(),
    rows: z.number().int().nonnegative(),
    content_hash: z.string().nullable(),
    malformed: z.number().int().nonnegative(),
  })
  .strict();

export const StoreCleanupWorkerLockSchema = z
  .object({
    present: z.boolean(),
    live: z.boolean().nullable(),
    pid: z.number().int().nullable(),
  })
  .strict();

export const StoreCleanupConsolidationLedgerSchema = z
  .object({
    exists: z.boolean(),
    rows: z.number().int().nonnegative(),
    agenda_rows: z.number().int().nonnegative(),
  })
  .strict();

export const StoreCleanupManifestStatusSchema = z
  .object({
    manifest_exists: z.boolean(),
    last_outcome: z.string().nullable(),
  })
  .strict();

export const StoreCleanupStoreClassificationSchema = z.enum([
  "has_agenda",
  "no_agenda",
  "unsafe",
  "already_cleaned",
]);

export const StoreCleanupStoreSchema = z
  .object({
    project_id: z.string(),
    path: z.string(),
    layout: z.enum(["legacy", "shard"]),
    agenda: StoreCleanupAgendaSummarySchema,
    worker_lock: StoreCleanupWorkerLockSchema,
    consolidation_ledger: StoreCleanupConsolidationLedgerSchema,
    cleanup: StoreCleanupManifestStatusSchema,
    classification: StoreCleanupStoreClassificationSchema,
  })
  .strict();
export type StoreCleanupStore = z.infer<typeof StoreCleanupStoreSchema>;

export const StoreCleanupScanResultSchema = z
  .object({
    action: z.literal("scan"),
    data_home_root: z.string(),
    stores: z.array(StoreCleanupStoreSchema),
    flagged: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();
export type StoreCleanupScanResult = z.infer<
  typeof StoreCleanupScanResultSchema
>;

export const StoreCleanupPlanStoreSchema = z
  .object({
    project_id: z.string(),
    path: z.string(),
    agenda_path: z.string(),
    rows: z.number().int().nonnegative(),
    content_hash: z.string().nullable(),
    outcome: z.enum(["delete", "skip", "retain"]),
    reason: z.string(),
  })
  .strict();
export type StoreCleanupPlanStore = z.infer<typeof StoreCleanupPlanStoreSchema>;

export const StoreCleanupPlanSummarySchema = z
  .object({
    total_stores: z.number().int().nonnegative(),
    delete_count: z.number().int().nonnegative(),
    skip_count: z.number().int().nonnegative(),
    retain_count: z.number().int().nonnegative(),
    total_rows: z.number().int().nonnegative(),
    delete_rows: z.number().int().nonnegative(),
  })
  .strict();
export type StoreCleanupPlanSummary = z.infer<
  typeof StoreCleanupPlanSummarySchema
>;

export const StoreCleanupPlanSchema = z
  .object({
    schema_version: z.literal(1),
    action: z.literal("dry_run"),
    generated_at: z.string(),
    plan_hash: z.string().regex(SHA256_HEX),
    summary: StoreCleanupPlanSummarySchema,
    stores: z.array(StoreCleanupPlanStoreSchema),
    has_more: z.boolean(),
    zero_mutations: z.literal(true),
  })
  .strict();
export type StoreCleanupPlan = z.infer<typeof StoreCleanupPlanSchema>;

export const StoreCleanupManifestRowSchema = z
  .object({
    schema_version: z.literal(1),
    project_id: z.string().regex(SHA40),
    agenda_path: z.string(),
    source_hash: z.string().regex(SHA256_HEX).nullable(),
    source_rows: z.number().int().nonnegative(),
    // `prepared` is persisted before destructive deletion. A terminal row is
    // appended after the delete attempt so the manifest remains both a
    // pre-delete audit record and an accurate outcome history.
    outcome: z.enum(["prepared", "applied", "retained", "skipped", "failed"]),
    reason: z.string(),
    timestamp: z.string(),
  })
  .strict();
export type StoreCleanupManifestRow = z.infer<
  typeof StoreCleanupManifestRowSchema
>;

export const StoreCleanupExecuteStoreSchema = z
  .object({
    project_id: z.string(),
    outcome: z.enum(["applied", "skipped", "failed", "retained"]),
    reason: z.string(),
    manifest_path: z.string().optional(),
  })
  .strict();
export type StoreCleanupExecuteStore = z.infer<
  typeof StoreCleanupExecuteStoreSchema
>;

export const StoreCleanupReportSchema = z
  .object({
    schema_version: z.literal(1),
    action: z.literal("execute"),
    generated_at: z.string(),
    plan_hash: z.string().regex(SHA256_HEX),
    stores: z.array(StoreCleanupExecuteStoreSchema),
    success: z.boolean(),
    no_op: z.boolean(),
    error: z.string().optional(),
  })
  .strict();
export type StoreCleanupReport = z.infer<typeof StoreCleanupReportSchema>;

// =============================================================================
// Helpers
// =============================================================================

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

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

interface AgendaAnalysis {
  rows: number;
  malformed: number;
  hashes: Set<string>;
  /** SHA-256 of the whole raw agenda.jsonl content, or null when absent. */
  contentHash: string | null;
}

/**
 * Pure analysis of a single `agenda.jsonl` payload. Callers read the file once
 * (via {@link readFileSafe}) and pass the content here, so a store is never
 * read twice during a scan (AC2, SC4).
 */
export function analyzeAgenda(content: string | null): AgendaAnalysis {
  if (content === null) {
    return { rows: 0, malformed: 0, hashes: new Set(), contentHash: null };
  }
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
  return {
    rows: lines.length,
    malformed,
    hashes,
    contentHash: sha256(content),
  };
}

async function probeWorkerLock(storePath: string): Promise<{
  present: boolean;
  live: boolean | null;
  pid: number | null;
}> {
  const raw = await readFileSafe(join(storePath, "worker.lock"));
  if (raw === null) return { present: false, live: null, pid: null };
  try {
    const parsed = JSON.parse(raw) as { pid?: unknown };
    const pid = typeof parsed.pid === "number" ? parsed.pid : null;
    const { isProcessAlive } = await import("../utils/process-liveness");
    return {
      present: true,
      live: pid === null ? null : isProcessAlive(pid),
      pid,
    };
  } catch {
    return { present: true, live: null, pid: null };
  }
}

async function probeConsolidationLedger(storePath: string): Promise<{
  exists: boolean;
  rows: number;
  agenda_rows: number;
}> {
  const raw = await readFileSafe(
    join(storePath, CONSOLIDATION_LEDGER_FILENAME),
  );
  if (raw === null) return { exists: false, rows: 0, agenda_rows: 0 };
  let rows = 0;
  let agendaRows = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as { item_kind?: string };
      rows += 1;
      if (parsed.item_kind === "agenda_row") agendaRows += 1;
    } catch {
      // Malformed rows are counted but don't affect agenda_rows.
      rows += 1;
    }
  }
  return { exists: true, rows, agenda_rows: agendaRows };
}

async function probeCleanupManifest(storePath: string): Promise<{
  manifest_exists: boolean;
  last_outcome: string | null;
}> {
  const raw = await readFileSafe(
    join(storePath, AGENDA_CLEANUP_MANIFEST_FILENAME),
  );
  if (raw === null) return { manifest_exists: false, last_outcome: null };
  let lastOutcome: string | null = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as { outcome?: string };
      if (typeof parsed.outcome === "string") lastOutcome = parsed.outcome;
    } catch {
      // Ignore malformed manifest rows.
    }
  }
  return { manifest_exists: true, last_outcome: lastOutcome };
}

// =============================================================================
// scan
// =============================================================================

export interface ScanStoresForCleanupOptions {
  dataHomeRoot: string;
}

/**
 * Enumerate all discoverable local ADV stores and classify them by agenda
 * presence and cleanup safety. Read-only (C3, C4).
 */
export async function scanStoresForCleanup(
  options: ScanStoresForCleanupOptions,
): Promise<StoreCleanupScanResult> {
  const { stores } = await walkStoreDirs(options.dataHomeRoot);

  // Probe each store with bounded concurrency (DONT1: never unbounded). Within
  // a store the four independent files are read in parallel, and agenda.jsonl
  // is read exactly once (AC2, SC4). Ordering is deterministic because results
  // are collected in input order and then sorted by project_id below.
  const perStore = await mapWithConcurrency(
    stores,
    STORE_SCAN_CONCURRENCY,
    async (ref) => {
      const agendaPath = join(ref.path, "agenda.jsonl");
      const [agendaContent, lock, ledger, manifest] = await Promise.all([
        readFileSafe(agendaPath),
        probeWorkerLock(ref.path),
        probeConsolidationLedger(ref.path),
        probeCleanupManifest(ref.path),
      ]);
      const agenda = analyzeAgenda(agendaContent);
      const agendaExists = agenda.rows > 0 || agenda.malformed > 0;

      const warnings: string[] = [];
      let classification: StoreCleanupStore["classification"];
      if (!agendaExists) {
        classification = manifest.manifest_exists
          ? "already_cleaned"
          : "no_agenda";
      } else if (lock.present && lock.live) {
        classification = "unsafe";
        warnings.push(
          `store ${ref.projectId} holds a live worker.lock (pid ${lock.pid}); cleanup refuses until stale sessions are closed`,
        );
      } else if (ledger.exists && ledger.agenda_rows > 0) {
        classification = "unsafe";
        warnings.push(
          `store ${ref.projectId} has a consolidation ledger with ${ledger.agenda_rows} agenda_row entries; cleanup refuses to preserve consolidation evidence`,
        );
      } else {
        classification = "has_agenda";
      }

      const entry: StoreCleanupStore = {
        project_id: ref.projectId,
        path: ref.path,
        layout: ref.layout,
        agenda: {
          exists: agendaExists,
          rows: agenda.rows,
          content_hash: agenda.contentHash,
          malformed: agenda.malformed,
        },
        worker_lock: lock,
        consolidation_ledger: ledger,
        cleanup: manifest,
        classification,
      };
      return { entry, warnings };
    },
  );

  const entries: StoreCleanupStore[] = perStore.map((p) => p.entry);
  const warnings: string[] = perStore.flatMap((p) => p.warnings);

  return {
    action: "scan",
    data_home_root: options.dataHomeRoot,
    stores: entries.sort((a, b) => a.project_id.localeCompare(b.project_id)),
    flagged: entries
      .filter((e) => e.classification === "unsafe")
      .map((e) => e.project_id)
      .sort(),
    warnings: warnings.sort(),
  };
}

// =============================================================================
// dry_run
// =============================================================================

export interface BuildCleanupPlanOptions {
  dataHomeRoot: string;
  now?: () => Date;
}

/**
 * Build the read-only cleanup plan. Zero mutations (C4). Each store with
 * agenda data is classified as delete (safe), retain (unsafe), or skip
 * (no agenda / already cleaned).
 */
export async function buildCleanupPlan(
  options: BuildCleanupPlanOptions,
): Promise<StoreCleanupPlan> {
  const scan = await scanStoresForCleanup({
    dataHomeRoot: options.dataHomeRoot,
  });
  const now = options.now ?? (() => new Date());

  const planStores: StoreCleanupPlanStore[] = scan.stores.map((store) => {
    const agendaPath = join(store.path, "agenda.jsonl");
    if (!store.agenda.exists) {
      return {
        project_id: store.project_id,
        path: store.path,
        agenda_path: agendaPath,
        rows: store.agenda.rows,
        content_hash: store.agenda.content_hash,
        outcome: "skip" as const,
        reason: store.cleanup.manifest_exists ? "already_cleaned" : "no_agenda",
      };
    }
    if (store.worker_lock.present && store.worker_lock.live) {
      return {
        project_id: store.project_id,
        path: store.path,
        agenda_path: agendaPath,
        rows: store.agenda.rows,
        content_hash: store.agenda.content_hash,
        outcome: "retain" as const,
        reason: "live_worker_lock",
      };
    }
    if (
      store.consolidation_ledger.exists &&
      store.consolidation_ledger.agenda_rows > 0
    ) {
      return {
        project_id: store.project_id,
        path: store.path,
        agenda_path: agendaPath,
        rows: store.agenda.rows,
        content_hash: store.agenda.content_hash,
        outcome: "retain" as const,
        reason: "consolidation_ledger_agenda_rows",
      };
    }
    return {
      project_id: store.project_id,
      path: store.path,
      agenda_path: agendaPath,
      rows: store.agenda.rows,
      content_hash: store.agenda.content_hash,
      outcome: "delete" as const,
      reason: "safe",
    };
  });

  const sortedStores = planStores.sort((a, b) =>
    a.project_id.localeCompare(b.project_id),
  );

  // AC9: bounded aggregate counts over the FULL plan, independent of any
  // render-time paging (summary is part of the hashed plan content).
  const summary: StoreCleanupPlanSummary = {
    total_stores: sortedStores.length,
    delete_count: sortedStores.filter((s) => s.outcome === "delete").length,
    skip_count: sortedStores.filter((s) => s.outcome === "skip").length,
    retain_count: sortedStores.filter((s) => s.outcome === "retain").length,
    total_rows: sortedStores.reduce((acc, s) => acc + s.rows, 0),
    delete_rows: sortedStores
      .filter((s) => s.outcome === "delete")
      .reduce((acc, s) => acc + s.rows, 0),
  };

  const planBase = {
    schema_version: 1 as const,
    action: "dry_run" as const,
    summary,
    stores: sortedStores,
    zero_mutations: true as const,
  };

  return {
    ...planBase,
    generated_at: now().toISOString(),
    // DDC3 / rq-storeCleanupCoupling01.4: plan_hash covers the full plan
    // content — including stores a paged render would omit — so execute
    // always applies exactly the approved full plan.
    plan_hash: sha256(canonicalize(planBase)),
    has_more: false,
  };
}

// =============================================================================
// dry_run render paging (AC9)
// =============================================================================

export interface PaginateCleanupPlanOptions {
  offset?: number;
  limit?: number;
  /** Restrict review data to one outcome (e.g. "delete" for delete-only review). */
  outcome?: StoreCleanupPlanStore["outcome"];
}

/**
 * Pure render-time paging over a full plan (AC9, DDC3). Returns a bounded
 * stores slice with `has_more`; `plan_hash` and `summary` are carried through
 * unchanged because they always describe the FULL plan — including
 * paginated-out stores (rq-storeCleanupCoupling01.4). Zero mutations.
 */
export function paginateCleanupPlan(
  plan: StoreCleanupPlan,
  options: PaginateCleanupPlanOptions,
): StoreCleanupPlan {
  // Belt-and-suspenders clamp: the tool-layer Zod args enforce
  // int/nonnegative/1..100 at the registry boundary, but direct callers
  // bypass that validation. Boundedness is the safety property; clamping
  // preserves it without rejecting (mirrors snapshot audit_history limit).
  const rawOffset = options.offset ?? 0;
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.floor(rawOffset))
    : 0;
  const rawLimit = options.limit ?? CLEANUP_PLAN_DEFAULT_LIMIT;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), CLEANUP_PLAN_MAX_LIMIT)
    : CLEANUP_PLAN_DEFAULT_LIMIT;

  const filtered = options.outcome
    ? plan.stores.filter((s) => s.outcome === options.outcome)
    : plan.stores;
  const page = filtered.slice(offset, offset + limit);

  return {
    ...plan,
    stores: page,
    has_more: offset + page.length < filtered.length,
  };
}

// =============================================================================
// execute
// =============================================================================

export class StoreCleanupError extends Error {
  readonly code: "approval_required" | "plan_hash_mismatch" | "unsafe_store";
  constructor(
    code: "approval_required" | "plan_hash_mismatch" | "unsafe_store",
    message: string,
  ) {
    super(message);
    this.name = "StoreCleanupError";
    this.code = code;
  }
}

export interface ExecuteCleanupDeps {
  /** Injectable delete function for testing. Defaults to fs.unlink. */
  deleteFile?: (path: string) => Promise<void>;
}

export interface ExecuteCleanupOptions {
  dataHomeRoot: string;
  approvedByUser: boolean;
  approvalEvidence: string;
  dry_run_plan_hash: string;
  now?: () => Date;
  deps?: ExecuteCleanupDeps;
}

/**
 * Apply the cleanup plan: write manifest before delete, retain unsafe stores,
 * and record per-store outcomes. Append-only manifest rows make re-runs
 * idempotent (AC7, DDC4). Failed or unsafe stores are retained for retry
 * (C3, DONT5).
 */
export async function executeCleanup(
  options: ExecuteCleanupOptions,
): Promise<StoreCleanupReport> {
  if (
    options.approvedByUser !== true ||
    typeof options.approvalEvidence !== "string" ||
    options.approvalEvidence.trim().length === 0
  ) {
    throw new StoreCleanupError(
      "approval_required",
      "execute requires approvedByUser: true and non-blank approvalEvidence (C4)",
    );
  }

  const plan = await buildCleanupPlan({ dataHomeRoot: options.dataHomeRoot });
  if (plan.plan_hash !== options.dry_run_plan_hash) {
    throw new StoreCleanupError(
      "plan_hash_mismatch",
      `execute plan_hash ${plan.plan_hash} does not match provided dry_run_plan_hash ${options.dry_run_plan_hash}; re-run dry_run and re-approve`,
    );
  }

  const now = options.now ?? (() => new Date());
  const outcomes: StoreCleanupExecuteStore[] = [];

  for (const store of plan.stores) {
    const manifestPath = join(store.path, AGENDA_CLEANUP_MANIFEST_FILENAME);

    if (store.outcome === "skip") {
      outcomes.push({
        project_id: store.project_id,
        outcome: "skipped",
        reason: store.reason,
      });
      continue;
    }

    if (store.outcome === "retain") {
      const row: StoreCleanupManifestRow = {
        schema_version: 1,
        project_id: store.project_id,
        agenda_path: store.agenda_path,
        source_hash: store.content_hash,
        source_rows: store.rows,
        outcome: "retained",
        reason: store.reason,
        timestamp: now().toISOString(),
      };
      try {
        await appendFile(manifestPath, `${JSON.stringify(row)}\n`, "utf-8");
        outcomes.push({
          project_id: store.project_id,
          outcome: "retained",
          reason: store.reason,
          manifest_path: manifestPath,
        });
      } catch (error) {
        outcomes.push({
          project_id: store.project_id,
          outcome: "failed",
          reason: `manifest_write_failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      continue;
    }

    // store.outcome === "delete"
    // Persist the intent before touching Agenda data. If this fails, do not
    // delete: an approved cleanup must always leave an audit record first.
    const preparedRow: StoreCleanupManifestRow = {
      schema_version: 1,
      project_id: store.project_id,
      agenda_path: store.agenda_path,
      source_hash: store.content_hash,
      source_rows: store.rows,
      outcome: "prepared",
      reason: "approved_cleanup_prepared",
      timestamp: now().toISOString(),
    };
    try {
      await appendFile(
        manifestPath,
        `${JSON.stringify(preparedRow)}\n`,
        "utf-8",
      );
    } catch (error) {
      outcomes.push({
        project_id: store.project_id,
        outcome: "failed",
        reason: `manifest_write_failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const deleteFile = options.deps?.deleteFile ?? unlink;
    let outcome: "applied" | "failed";
    let reason: string;
    try {
      await deleteFile(store.agenda_path);
      outcome = "applied";
      reason = "approved_cleanup";
    } catch (error) {
      outcome = "failed";
      reason = `delete_failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    const row: StoreCleanupManifestRow = {
      schema_version: 1,
      project_id: store.project_id,
      agenda_path: store.agenda_path,
      source_hash: store.content_hash,
      source_rows: store.rows,
      outcome,
      reason,
      timestamp: now().toISOString(),
    };
    try {
      await appendFile(manifestPath, `${JSON.stringify(row)}\n`, "utf-8");
    } catch (error) {
      outcomes.push({
        project_id: store.project_id,
        outcome: "failed",
        reason: `manifest_write_failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    outcomes.push({
      project_id: store.project_id,
      outcome,
      reason,
      manifest_path: manifestPath,
    });
  }

  const failed = outcomes.filter((o) => o.outcome === "failed").length;
  const applied = outcomes.filter((o) => o.outcome === "applied").length;
  const retained = outcomes.filter((o) => o.outcome === "retained").length;

  return {
    schema_version: 1,
    action: "execute",
    generated_at: now().toISOString(),
    plan_hash: plan.plan_hash,
    stores: outcomes,
    success: failed === 0,
    no_op: applied === 0 && failed === 0 && retained === 0,
    ...(failed > 0
      ? {
          error: `${failed} store(s) failed cleanup; see stores for per-store errors`,
        }
      : {}),
  };
}

// =============================================================================
// Tool definition
// =============================================================================

export const storeCleanupHandler = async (
  args: {
    action: "scan" | "dry_run" | "execute";
    data_home_root?: string;
    offset?: number;
    limit?: number;
    outcome?: "delete" | "skip" | "retain";
    dry_run_plan_hash?: string;
    approvedByUser?: boolean;
    approvalEvidence?: string;
  },
  _store: Store,
) => {
  const dataHomeRoot = args.data_home_root ?? defaultDataHomeRoot();
  if (args.action === "scan") {
    return formatToolOutput(await scanStoresForCleanup({ dataHomeRoot }), {
      tool: "adv_store_cleanup",
    });
  }
  if (args.action === "dry_run") {
    try {
      const plan = await buildCleanupPlan({ dataHomeRoot });
      return formatToolOutput(
        paginateCleanupPlan(plan, {
          offset: args.offset,
          limit: args.limit,
          outcome: args.outcome,
        }),
        { tool: "adv_store_cleanup" },
      );
    } catch (error) {
      return formatToolOutput(
        {
          success: false,
          action: "dry_run",
          error: error instanceof Error ? error.message : String(error),
        },
        { tool: "adv_store_cleanup" },
      );
    }
  }
  try {
    return formatToolOutput(
      await executeCleanup({
        dataHomeRoot,
        approvedByUser: args.approvedByUser === true,
        approvalEvidence: args.approvalEvidence ?? "",
        dry_run_plan_hash: args.dry_run_plan_hash ?? "",
      }),
      { tool: "adv_store_cleanup" },
    );
  } catch (error) {
    return formatToolOutput(
      {
        success: false,
        action: "execute",
        error_code:
          error instanceof StoreCleanupError ? error.code : "execute_failed",
        error: error instanceof Error ? error.message : String(error),
      },
      { tool: "adv_store_cleanup" },
    );
  }
};
