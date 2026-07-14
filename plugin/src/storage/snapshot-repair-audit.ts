/**
 * Snapshot Repair Audit Store
 *
 * Purpose-specific append-only audit log for `adv_snapshot_health` repairs.
 * Replaces the legacy Agenda-based audit trail (see retireAgendaWorkflow
 * agreement AC4 / design "Purpose-specific repair audit").
 *
 * Each successful repair appends one entry recording the finding pattern,
 * target path, before/after summary, ISO-8601 timestamp, and outcome. The
 * audit log lives outside planning, gates, backlog, and Epic state — it is
 * a durable, read-only audit record only and is never consumed by task
 * selection, gate evaluation, or change lifecycle logic.
 *
 * Implementation mirrors `storage/project-wisdom.ts`: append-only JSONL with
 * mkdir + file-lock + appendFile so concurrent writers are serialized.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { acquireFileLock } from "../utils/fs";

// =============================================================================
// Constants
// =============================================================================

export const SNAPSHOT_REPAIR_AUDIT_FILENAME = "snapshot-repair-audit.jsonl";

// =============================================================================
// Types
// =============================================================================

/**
 * Outcome of a snapshot repair attempt.
 *
 * Only `"success"` outcomes are appended to the audit log by
 * `adv_snapshot_health`; skipped/failed repairs are visible in
 * `repair_preview.details` but do not produce durable audit entries.
 */
export type SnapshotRepairAuditOutcome = "success";

/**
 * Audit entry appended after a successful snapshot repair.
 *
 * Fields required by retireAgendaWorkflow design "Purpose-specific repair
 * audit": pattern, target path, before/after summary, timestamp, outcome.
 */
export interface SnapshotRepairAuditEntry {
  /** Unique audit entry id (sra-{nanoid(8)}). */
  id: string;
  /** Snapshot corruption pattern detected (e.g. "stale_lock"). */
  pattern: string;
  /** Repair action that was executed (whitelisted in adv_snapshot_health). */
  action: string;
  /** Absolute path of the artifact the repair acted on. */
  target_path: string;
  /** Human-readable summary of the pre-repair state. */
  before_summary: string;
  /** Human-readable summary of the post-repair state. */
  after_summary: string;
  /** Outcome of the repair (only "success" entries are persisted). */
  outcome: SnapshotRepairAuditOutcome;
  /** ISO-8601 UTC timestamp of when the repair completed. */
  recorded_at: string;
}

/**
 * Input shape for `appendSnapshotRepairAudit`. The storage layer fills in
 * `id` and `recorded_at` so callers cannot forge either.
 */
export type SnapshotRepairAuditInput = Omit<
  SnapshotRepairAuditEntry,
  "id" | "recorded_at"
>;

/**
 * Zod schema used both for input validation and for line-level parse during
 * `listSnapshotRepairAudits`. Kept strict to reject corrupted audit rows.
 */
export const SnapshotRepairAuditEntrySchema = z.object({
  id: z.string().startsWith("sra-").min(5),
  pattern: z.string().min(1),
  action: z.string().min(1),
  target_path: z.string().min(1),
  before_summary: z.string().min(1),
  after_summary: z.string().min(1),
  outcome: z.literal("success"),
  recorded_at: z.string().datetime({ offset: true }),
});

export const SnapshotRepairAuditInputSchema =
  SnapshotRepairAuditEntrySchema.omit({
    id: true,
    recorded_at: true,
  });

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Resolve the snapshot-repair audit log path.
 *
 * When `overridePath` is provided (typically `ProjectPaths.snapshotRepairAudit`)
 * it is returned directly — supporting external state directories. Otherwise
 * falls back to `{projectDir}/.adv/snapshot-repair-audit.jsonl`, matching the
 * convention used by `wisdom.jsonl` and `reflections.jsonl`.
 */
export const getSnapshotRepairAuditPath = (
  projectDir: string,
  overridePath?: string,
): string => {
  return (
    overridePath ?? join(projectDir, ".adv", SNAPSHOT_REPAIR_AUDIT_FILENAME)
  );
};

// =============================================================================
// Operations
// =============================================================================

/**
 * Append a single snapshot-repair audit entry.
 *
 * Append-only: the entry is serialized as one JSONL row. The operation holds
 * a file lock for the duration of the append to serialize concurrent
 * writers from different processes that share the audit log.
 *
 * The audit log is strictly additive. There is no update, delete, or
 * compaction path — audit history is permanent by design (DDC5: repair
 * audits cannot enter planning, gates, backlog, or Epic state).
 */
export async function appendSnapshotRepairAudit(
  projectDir: string,
  input: SnapshotRepairAuditInput,
  overridePath?: string,
): Promise<SnapshotRepairAuditEntry> {
  // Validate caller-provided fields before any filesystem mutation so a
  // malformed record never reaches the audit log.
  const parsed = SnapshotRepairAuditInputSchema.parse(input);

  const path = getSnapshotRepairAuditPath(projectDir, overridePath);
  await mkdir(dirname(path), { recursive: true });

  const entry: SnapshotRepairAuditEntry = {
    id: `sra-${nanoid(8)}`,
    recorded_at: new Date().toISOString(),
    ...parsed,
  };

  const releaseLock = await acquireFileLock(path);
  try {
    await appendFile(path, JSON.stringify(entry) + "\n", "utf-8");
  } finally {
    await releaseLock();
  }

  return entry;
}

/**
 * Read all snapshot-repair audit entries from the log.
 *
 * Returns an empty array when the file is missing. Malformed lines are
 * skipped silently — the audit log is append-only and should never contain
 * them, but a partial write from a crash must not block subsequent reads.
 *
 * Entries are returned in append order (oldest first).
 */
export async function listSnapshotRepairAudits(
  projectDir: string,
  overridePath?: string,
): Promise<SnapshotRepairAuditEntry[]> {
  const path = getSnapshotRepairAuditPath(projectDir, overridePath);
  if (!existsSync(path)) return [];

  const content = await readFile(path, "utf-8");
  const entries: SnapshotRepairAuditEntry[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line) as unknown;
      const parsed = SnapshotRepairAuditEntrySchema.safeParse(raw);
      if (parsed.success) {
        entries.push(parsed.data);
      }
      // Malformed rows are skipped; see function docstring.
    } catch {
      // JSON parse failure — skip line.
    }
  }

  return entries;
}
