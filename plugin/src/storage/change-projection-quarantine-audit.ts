/**
 * Change Projection Quarantine Audit Store
 *
 * Purpose-specific append-only audit log for `adv_change_projection_quarantine`.
 * Every successful quarantine appends one durable audit entry outside the
 * ADV Agenda/planning/gate/backlog/Epic state. The log is read-only for
 * operators; it is never consumed by change lifecycle or task selection logic.
 *
 * Mirrors the snapshot-repair-audit pattern: append-only JSONL, file-lock
 * serialized, permanent history.
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

export const CHANGE_PROJECTION_QUARANTINE_AUDIT_FILENAME =
  "change-projection-quarantine-audit.jsonl";

// =============================================================================
// Types
// =============================================================================

export const ChangeProjectionQuarantineReasonSchema = z.enum([
  "oversized",
  "corrupt",
  "unreadable",
  "schema_error",
]);

export type ChangeProjectionQuarantineReason = z.infer<
  typeof ChangeProjectionQuarantineReasonSchema
>;

export const ChangeProjectionQuarantineOutcomeSchema = z.literal("success");

export type ChangeProjectionQuarantineOutcome = z.infer<
  typeof ChangeProjectionQuarantineOutcomeSchema
>;

export interface ChangeProjectionQuarantineAuditEntry {
  /** Unique audit entry id (cqpq-{nanoid(8)}). */
  id: string;
  /** ADV project ID that owns the quarantined change projection. */
  project_id: string;
  /** Change ID whose active projection was quarantined. */
  change_id: string;
  /** Diagnostic reason the projection was rejected by the bounded reader. */
  reason: ChangeProjectionQuarantineReason;
  /** Action executed (always "quarantine"). */
  action: "quarantine";
  /** Absolute path of the active projection before the move. */
  source_path: string;
  /** Absolute path where the projection was retained. */
  quarantine_path: string;
  /** Byte size of the retained projection file. */
  size_bytes: number;
  /** ISO-8601 UTC timestamp of the retained file's last modification time. */
  mtime: string;
  /** Outcome of the quarantine (only "success" entries are persisted). */
  outcome: ChangeProjectionQuarantineOutcome;
  /** ISO-8601 UTC timestamp of when the quarantine completed. */
  recorded_at: string;
}

export type ChangeProjectionQuarantineAuditInput = Omit<
  ChangeProjectionQuarantineAuditEntry,
  "id" | "recorded_at"
>;

// =============================================================================
// Schemas
// =============================================================================

export const ChangeProjectionQuarantineAuditEntrySchema = z.object({
  id: z.string().startsWith("cqpq-").min(5),
  project_id: z.string().min(1),
  change_id: z.string().min(1),
  reason: ChangeProjectionQuarantineReasonSchema,
  action: z.literal("quarantine"),
  source_path: z.string().min(1),
  quarantine_path: z.string().min(1),
  size_bytes: z.number().int().min(0),
  mtime: z.string().datetime({ offset: true }),
  outcome: ChangeProjectionQuarantineOutcomeSchema,
  recorded_at: z.string().datetime({ offset: true }),
});

export const ChangeProjectionQuarantineAuditInputSchema =
  ChangeProjectionQuarantineAuditEntrySchema.omit({
    id: true,
    recorded_at: true,
  });

// =============================================================================
// Path Resolution
// =============================================================================

export const getChangeProjectionQuarantineAuditPath = (
  projectDir: string,
  overridePath?: string,
): string => {
  return (
    overridePath ??
    join(projectDir, ".adv", CHANGE_PROJECTION_QUARANTINE_AUDIT_FILENAME)
  );
};

// =============================================================================
// Operations
// =============================================================================

export async function appendChangeProjectionQuarantineAudit(
  projectDir: string,
  input: ChangeProjectionQuarantineAuditInput,
  overridePath?: string,
): Promise<ChangeProjectionQuarantineAuditEntry> {
  const parsed = ChangeProjectionQuarantineAuditInputSchema.parse(input);

  const path = getChangeProjectionQuarantineAuditPath(projectDir, overridePath);
  await mkdir(dirname(path), { recursive: true });

  const entry: ChangeProjectionQuarantineAuditEntry = {
    id: `cqpq-${nanoid(8)}`,
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

export async function listChangeProjectionQuarantineAudits(
  projectDir: string,
  overridePath?: string,
): Promise<ChangeProjectionQuarantineAuditEntry[]> {
  const path = getChangeProjectionQuarantineAuditPath(projectDir, overridePath);
  if (!existsSync(path)) return [];

  const content = await readFile(path, "utf-8");
  const entries: ChangeProjectionQuarantineAuditEntry[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line) as unknown;
      const parsed = ChangeProjectionQuarantineAuditEntrySchema.safeParse(raw);
      if (parsed.success) entries.push(parsed.data);
    } catch {
      // Malformed lines are skipped; append-only log should not contain them.
    }
  }

  return entries;
}
