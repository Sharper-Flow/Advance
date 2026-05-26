#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  BLANK_ASSISTANT_ROWS_SQL,
  classifyBlankAssistantRows,
  classifyToolPartRows,
  createSessionActivityLivenessResolver,
  getDeletableBlankAssistantIds,
  getDefaultOpenCodeDbPath,
  getRepairableToolPartIds,
  normalizeBlankAssistantRow,
  normalizeSessionActivityRow,
  normalizeToolPartRow,
  SESSION_ACTIVITY_ROWS_SQL,
  STALE_TOOL_PART_ROWS_SQL,
  STALE_BLANK_ASSISTANT_THRESHOLD_MS,
  type BlankAssistantRow,
  type OpenCodeSessionActivityRow,
  type ToolPartRow,
} from "../plugin/src/utils/opencode-session-debt";

// rq-opencodeDebt01: explicit dry-run + backup-before-repair utility.

const TOOL_PART_REPAIR_ERROR =
  "Interrupted by opencode-session-doctor after stale orphan classification";

interface Args {
  dbPath: string;
  dryRun: boolean;
  apply: boolean;
  backupDir?: string;
  thresholdMs: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dbPath: getDefaultOpenCodeDbPath().dbPath,
    dryRun: false,
    apply: false,
    thresholdMs: STALE_BLANK_ASSISTANT_THRESHOLD_MS,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--db") args.dbPath = requireValue(argv, ++i, "--db");
    else if (arg === "--backup-dir")
      args.backupDir = requireValue(argv, ++i, "--backup-dir");
    else if (arg === "--threshold-ms")
      args.thresholdMs = Number(requireValue(argv, ++i, "--threshold-ms"));
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.dryRun && !args.apply) args.dryRun = true;
  if (args.dryRun && args.apply)
    throw new Error("Use either --dry-run or --apply, not both");
  if (!Number.isFinite(args.thresholdMs) || args.thresholdMs < 1_000) {
    throw new Error("--threshold-ms must be at least 1000ms");
  }
  if (args.apply && !args.backupDir) {
    throw new Error("--apply requires --backup-dir <dir>");
  }

  return args;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function printUsage(): void {
  console.log(`Usage:
  bun scripts/opencode-session-doctor.ts --dry-run [--db <path>] [--threshold-ms <ms>]
  bun scripts/opencode-session-doctor.ts --apply --backup-dir <dir> [--db <path>] [--threshold-ms <ms>]

Repairs only classified orphan debt:
  - orphan ghost blank assistant messages: role=assistant, finish=null, zero parts, and liveness classified as orphan_ghost
  - stale orphan tool parts: type=tool, state.status running/pending, beyond threshold, and liveness classified as orphan_ghost
Default DB: $OPENCODE_DB or ~/.local/share/opencode/opencode.db
Default threshold: ${STALE_BLANK_ASSISTANT_THRESHOLD_MS}ms`);
}

function loadBlankAssistantRows(dbPath: string): BlankAssistantRow[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query(BLANK_ASSISTANT_ROWS_SQL)
      .all()
      .map(normalizeBlankAssistantRow)
      .filter((row): row is BlankAssistantRow => row !== null);
  } finally {
    db.close();
  }
}

function loadSessionActivityRows(dbPath: string): OpenCodeSessionActivityRow[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query(SESSION_ACTIVITY_ROWS_SQL)
      .all()
      .map(normalizeSessionActivityRow)
      .filter((row): row is OpenCodeSessionActivityRow => row !== null);
  } finally {
    db.close();
  }
}

function loadToolPartRows(dbPath: string): ToolPartRow[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query(STALE_TOOL_PART_ROWS_SQL)
      .all()
      .map(normalizeToolPartRow)
      .filter((row): row is ToolPartRow => row !== null);
  } finally {
    db.close();
  }
}

async function backupDatabaseFiles(
  dbPath: string,
  backupDir: string,
): Promise<string[]> {
  validateOpenCodeSchema(dbPath);
  checkpointWal(dbPath);
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const copied: string[] = [];
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (!existsSync(file)) continue;
    const dest = join(backupDir, `${basename(file)}.${stamp}.backup`);
    await copyFile(file, dest);
    copied.push(dest);
  }
  if (copied.length === 0)
    throw new Error("No database files were backed up; refusing apply");
  verifySqliteBackup(copied[0]);
  return copied;
}

function validateOpenCodeSchema(dbPath: string): void {
  const db = new Database(dbPath, { readonly: true });
  try {
    const tables = new Set(
      (
        db
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('message', 'part', 'session')",
          )
          .all() as Array<{ name?: string }>
      ).map((row) => row.name),
    );
    for (const required of ["message", "part", "session"]) {
      if (!tables.has(required)) {
        throw new Error(
          `Database does not look like an OpenCode session DB; missing table: ${required}`,
        );
      }
    }
  } finally {
    db.close();
  }
}

function checkpointWal(dbPath: string): void {
  const db = new Database(dbPath, { readwrite: true, create: false });
  try {
    db.run("PRAGMA busy_timeout = 5000");
    db.run("PRAGMA wal_checkpoint(PASSIVE)");
  } finally {
    db.close();
  }
}

function verifySqliteBackup(dbPath: string): void {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.query("PRAGMA quick_check").get() as Record<
      string,
      unknown
    > | null;
    const result = row ? String(Object.values(row)[0] ?? "") : "";
    if (result.toLowerCase() !== "ok") {
      throw new Error(`Backup quick_check failed for ${dbPath}: ${result}`);
    }
  } finally {
    db.close();
  }
}

function applyRepairs(
  dbPath: string,
  messageIds: string[],
  toolPartIds: string[],
  nowMs: number,
  thresholdMs: number,
): { deleted: number; repairedToolParts: number; skippedToolParts: number } {
  const db = new Database(dbPath, { readwrite: true, create: false });
  try {
    db.run("PRAGMA busy_timeout = 5000");
    db.run("BEGIN IMMEDIATE");
    const deleted = deleteMessagesInTransaction(
      db,
      messageIds,
      nowMs,
      thresholdMs,
    );
    const toolResult = repairToolPartsInTransaction(
      db,
      toolPartIds,
      nowMs,
      thresholdMs,
    );
    db.run("COMMIT");
    return {
      deleted,
      repairedToolParts: toolResult.repaired,
      skippedToolParts: toolResult.skipped,
    };
  } catch (err) {
    try {
      db.run("ROLLBACK");
    } catch {
      // Ignore rollback failure; preserve the original error.
    }
    throw err;
  } finally {
    db.close();
  }
}

function deleteMessagesInTransaction(
  db: Database,
  ids: string[],
  nowMs: number,
  thresholdMs: number,
): number {
  if (ids.length === 0) return 0;
  const selectMessage = db.query(`
    SELECT
      m.id AS id,
      m.session_id AS session_id,
      json_extract(m.data, '$.time.created') AS created_ms,
      json_extract(m.data, '$.role') AS role,
      json_extract(m.data, '$.finish') AS finish,
      (SELECT COUNT(*) FROM part p WHERE p.message_id = m.id) AS part_count,
      s.time_updated AS session_updated_ms
    FROM message m
    LEFT JOIN session s ON s.id = m.session_id
    WHERE m.id = ?
  `);
  const deleteMessage = db.query("DELETE FROM message WHERE id = ?");
  let deleted = 0;
  for (const id of ids) {
    const row = selectMessage.get(id) as Record<string, unknown> | null;
    if (!isStillDeletableBlankAssistant(row, nowMs, thresholdMs)) continue;
    const result = deleteMessage.run(id) as { changes?: number };
    deleted += Number(result.changes ?? 0);
  }
  return deleted;
}

function isStillDeletableBlankAssistant(
  row: Record<string, unknown> | null,
  nowMs: number,
  thresholdMs: number,
): boolean {
  if (!row) return false;
  const createdMs = Number(row.created_ms);
  const sessionUpdatedMs = Number(row.session_updated_ms);
  const latestActivityMs = Math.max(
    Number.isFinite(createdMs) ? createdMs : 0,
    Number.isFinite(sessionUpdatedMs) ? sessionUpdatedMs : 0,
  );
  return (
    row.role === "assistant" &&
    row.finish === null &&
    Number(row.part_count ?? 0) === 0 &&
    latestActivityMs > 0 &&
    nowMs - latestActivityMs >= thresholdMs
  );
}

function repairToolPartsInTransaction(
  db: Database,
  ids: string[],
  endMs: number,
  thresholdMs: number,
): { repaired: number; skipped: number } {
  if (ids.length === 0) return { repaired: 0, skipped: 0 };
  const selectPart = db.query(`
    SELECT
      p.data AS data,
      p.message_id AS message_id,
      p.time_updated AS updated_ms,
      s.time_updated AS session_updated_ms,
      json_extract(p.data, '$.state.status') AS status
    FROM part p
    LEFT JOIN session s ON s.id = p.session_id
    WHERE p.id = ?
  `);
  const updatePart = db.query(
    "UPDATE part SET data = ?, time_updated = ? WHERE id = ?",
  );
  const selectMessageParts = db.query(
    "SELECT data FROM part WHERE message_id = ? ORDER BY id",
  );
  const selectMessage = db.query("SELECT data FROM message WHERE id = ?");
  const updateMessage = db.query(
    "UPDATE message SET data = ?, time_updated = ? WHERE id = ?",
  );
  const touchedMessages = new Set<string>();
  let repaired = 0;
  let skipped = 0;

  for (const id of ids) {
    const row = selectPart.get(id) as Record<string, unknown> | null;
    if (!isStillRepairableToolPart(row, endMs, thresholdMs)) {
      skipped += 1;
      continue;
    }
    try {
      const data = JSON.parse(String(row!.data)) as Record<string, unknown>;
      data.state = buildInterruptedToolState(data.state, endMs);
      const result = updatePart.run(JSON.stringify(data), endMs, id) as {
        changes?: number;
      };
      repaired += Number(result.changes ?? 0);
      touchedMessages.add(String(row!.message_id));
    } catch {
      skipped += 1;
    }
  }

  for (const messageId of touchedMessages) {
    const childRows = selectMessageParts.all(messageId) as Array<{
      data?: string;
    }>;
    if (childRows.length === 0 || !childRows.every(isTerminalPartData)) {
      continue;
    }
    const messageRow = selectMessage.get(messageId) as { data?: string } | null;
    if (!messageRow?.data) continue;
    const messageData = JSON.parse(messageRow.data) as Record<string, unknown>;
    const time =
      messageData.time && typeof messageData.time === "object"
        ? { ...(messageData.time as Record<string, unknown>) }
        : {};
    if (time.completed === undefined) time.completed = endMs;
    messageData.time = time;
    if (messageData.finish === undefined || messageData.finish === null) {
      messageData.finish = "error";
    }
    updateMessage.run(JSON.stringify(messageData), endMs, messageId);
  }

  return { repaired, skipped };
}

function isStillRepairableToolPart(
  row: Record<string, unknown> | null,
  nowMs: number,
  thresholdMs: number,
): boolean {
  if (!row) return false;
  const updatedMs = Number(row.updated_ms);
  const sessionUpdatedMs = Number(row.session_updated_ms);
  const latestActivityMs = Math.max(
    Number.isFinite(updatedMs) ? updatedMs : 0,
    Number.isFinite(sessionUpdatedMs) ? sessionUpdatedMs : 0,
  );
  return (
    (row.status === "running" || row.status === "pending") &&
    latestActivityMs > 0 &&
    nowMs - latestActivityMs >= thresholdMs &&
    typeof row.data === "string" &&
    typeof row.message_id === "string"
  );
}
function buildInterruptedToolState(
  state: unknown,
  endMs: number,
): Record<string, unknown> {
  const current =
    state && typeof state === "object"
      ? { ...(state as Record<string, unknown>) }
      : {};
  const metadata =
    current.metadata && typeof current.metadata === "object"
      ? { ...(current.metadata as Record<string, unknown>) }
      : {};
  const time =
    current.time && typeof current.time === "object"
      ? { ...(current.time as Record<string, unknown>) }
      : {};
  metadata.interrupted = true;
  time.end = endMs;
  return {
    ...current,
    status: "error",
    error: TOOL_PART_REPAIR_ERROR,
    metadata,
    time,
  };
}

function isTerminalPartData(row: { data?: string }): boolean {
  if (!row.data) return false;
  try {
    const data = JSON.parse(row.data) as { state?: { status?: unknown } };
    return data.state?.status !== "running" && data.state?.status !== "pending";
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(args.dbPath)) {
    console.log(
      JSON.stringify(
        {
          available: false,
          db_path: args.dbPath,
          reason: "OpenCode database not found",
          mode: args.apply ? "apply" : "dry-run",
        },
        null,
        2,
      ),
    );
    return;
  }

  const rows = loadBlankAssistantRows(args.dbPath);
  const toolPartRows = loadToolPartRows(args.dbPath);
  const sessionActivity = loadSessionActivityRows(args.dbPath);
  const nowMs = Date.now();
  const livenessResolver = createSessionActivityLivenessResolver(
    sessionActivity,
    {
      nowMs,
      thresholdMs: args.thresholdMs,
    },
  );
  const classification = classifyBlankAssistantRows(rows, {
    nowMs,
    thresholdMs: args.thresholdMs,
    sampleLimit: args.apply ? Number.MAX_SAFE_INTEGER : undefined,
    resolveSessionLiveness: livenessResolver,
  });
  const toolPartClassification = classifyToolPartRows(toolPartRows, {
    nowMs,
    thresholdMs: args.thresholdMs,
    sampleLimit: args.apply ? Number.MAX_SAFE_INTEGER : undefined,
    resolveSessionLiveness: livenessResolver,
  });
  const ids = getDeletableBlankAssistantIds(classification);
  const toolPartIds = getRepairableToolPartIds(toolPartClassification);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          available: true,
          mode: "dry-run",
          db_path: args.dbPath,
          would_delete: classification.total_orphan_ghost,
          would_repair_tool_parts:
            toolPartClassification.total_repairable_tool_parts,
          ...classification,
          ...toolPartClassification,
        },
        null,
        2,
      ),
    );
    return;
  }

  const backups = await backupDatabaseFiles(args.dbPath, args.backupDir!);
  const applied = applyRepairs(
    args.dbPath,
    ids,
    toolPartIds,
    nowMs,
    args.thresholdMs,
  );
  console.log(
    JSON.stringify(
      {
        available: true,
        mode: "apply",
        db_path: args.dbPath,
        backup_files: backups,
        deleted: applied.deleted,
        repaired_tool_parts: applied.repairedToolParts,
        skipped_tool_parts: applied.skippedToolParts,
        ...classification,
        ...toolPartClassification,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
