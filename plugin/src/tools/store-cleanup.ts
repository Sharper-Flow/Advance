/**
 * Store Cleanup Tool — `adv_store_cleanup` (legacy Agenda cleanup).
 *
 * Maintenance-only cleanup for legacy Agenda data across discoverable local
 * ADV stores. Supports scan → dry_run → approval-gated execute.
 *
 * Reuses store-consolidation primitives: walkStoreDirs, content hashing,
 * live-lock refusal, ledger-based idempotency, and manifest-before-delete.
 *
 * Design references: AC7, SC3, C3, C4, DONT2, DONT5.
 */

import { appendFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import {
  walkStoreDirs,
  defaultDataHomeRoot,
  CONSOLIDATION_LEDGER_FILENAME,
} from "./store-consolidate";
import type { Store } from "../storage/store";

// =============================================================================
// Constants
// =============================================================================

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^sha256:[0-9a-f]{64}$/;

/** Manifest filename inside each cleaned store (design: manifest-before-delete). */
export const AGENDA_CLEANUP_MANIFEST_FILENAME = "agenda-cleanup-manifest.jsonl";

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

export const StoreCleanupPlanSchema = z
  .object({
    schema_version: z.literal(1),
    action: z.literal("dry_run"),
    generated_at: z.string(),
    plan_hash: z.string().regex(SHA256_HEX),
    stores: z.array(StoreCleanupPlanStoreSchema),
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
    outcome: z.enum(["applied", "retained", "skipped", "failed"]),
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
  const warnings: string[] = [];
  const entries: StoreCleanupStore[] = [];

  for (const ref of stores) {
    const agendaPath = join(ref.path, "agenda.jsonl");
    const agenda = await readJsonlHashed(agendaPath);
    const agendaExists = agenda.rows > 0 || agenda.malformed > 0;
    const agendaContent = await readFileSafe(agendaPath);
    const agendaHash = agendaContent !== null ? sha256(agendaContent) : null;

    const lock = await probeWorkerLock(ref.path);
    const ledger = await probeConsolidationLedger(ref.path);
    const manifest = await probeCleanupManifest(ref.path);

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

    entries.push({
      project_id: ref.projectId,
      path: ref.path,
      layout: ref.layout,
      agenda: {
        exists: agendaExists,
        rows: agenda.rows,
        content_hash: agendaHash,
        malformed: agenda.malformed,
      },
      worker_lock: lock,
      consolidation_ledger: ledger,
      cleanup: manifest,
      classification,
    });
  }

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

  const planBase = {
    schema_version: 1 as const,
    action: "dry_run" as const,
    stores: planStores.sort((a, b) => a.project_id.localeCompare(b.project_id)),
    zero_mutations: true as const,
  };

  return {
    ...planBase,
    generated_at: now().toISOString(),
    plan_hash: sha256(canonicalize(planBase)),
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

export const storeCleanupTools = {
  adv_store_cleanup: {
    description:
      "Maintenance-only legacy Agenda cleanup across discoverable local ADV stores. " +
      "action 'scan' (default, read-only) inventories every store with agenda data, classifying safety. " +
      "action 'dry_run' emits the per-store cleanup plan with zero mutations. " +
      "action 'execute' applies the exact dry-run plan: approval-gated, manifest-before-delete, " +
      "retains unsafe stores for retry, and refuses when worker.lock is live or a consolidation " +
      "ledger with agenda_row entries exists.",
    args: {
      action: z
        .enum(["scan", "dry_run", "execute"])
        .default("scan")
        .describe(
          "scan = inventory stores (read-only); dry_run = per-store plan (read-only); execute = apply plan (approval-gated)",
        ),
      data_home_root: z
        .string()
        .optional()
        .describe(
          "Data-home root holding opencode/ and opencode-projects/. Injected for tests; defaults to the resolved XDG data home.",
        ),
      dry_run_plan_hash: z
        .string()
        .optional()
        .describe(
          "Required for execute. The plan_hash from the matching dry_run output.",
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
        data_home_root?: string;
        dry_run_plan_hash?: string;
        approvedByUser?: boolean;
        approvalEvidence?: string;
      },
      _store: Store,
    ) => {
      const dataHomeRoot = args.data_home_root ?? defaultDataHomeRoot();

      if (args.action === "scan") {
        const result = await scanStoresForCleanup({ dataHomeRoot });
        return formatToolOutput(result, { tool: "adv_store_cleanup" });
      }

      if (args.action === "dry_run") {
        try {
          const plan = await buildCleanupPlan({ dataHomeRoot });
          return formatToolOutput(plan, { tool: "adv_store_cleanup" });
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

      // action === "execute"
      try {
        const report = await executeCleanup({
          dataHomeRoot,
          approvedByUser: args.approvedByUser === true,
          approvalEvidence: args.approvalEvidence ?? "",
          dry_run_plan_hash: args.dry_run_plan_hash ?? "",
        });
        return formatToolOutput(report, { tool: "adv_store_cleanup" });
      } catch (error) {
        return formatToolOutput(
          {
            success: false,
            action: "execute",
            error_code:
              error instanceof StoreCleanupError
                ? error.code
                : "execute_failed",
            error: error instanceof Error ? error.message : String(error),
          },
          { tool: "adv_store_cleanup" },
        );
      }
    },
  },
};
