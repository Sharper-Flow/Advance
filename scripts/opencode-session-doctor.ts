#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  BLANK_ASSISTANT_ROWS_SQL,
  classifyBlankAssistantRows,
  createSessionActivityLivenessResolver,
  getDeletableBlankAssistantIds,
  getDefaultOpenCodeDbPath,
  normalizeBlankAssistantRow,
  normalizeSessionActivityRow,
  SESSION_ACTIVITY_ROWS_SQL,
  STALE_BLANK_ASSISTANT_THRESHOLD_MS,
  type BlankAssistantRow,
  type OpenCodeSessionActivityRow,
} from "../plugin/src/utils/opencode-session-debt";

// rq-opencodeDebt01: explicit dry-run + backup-before-delete repair utility.

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
  if (!Number.isFinite(args.thresholdMs) || args.thresholdMs < 0) {
    throw new Error("--threshold-ms must be a non-negative number");
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

Repairs only orphan ghost blank assistant messages: role=assistant, finish=null, zero parts, and liveness classified as orphan_ghost.
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

async function backupDatabaseFiles(
  dbPath: string,
  backupDir: string,
): Promise<string[]> {
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
  return copied;
}

function deleteMessages(dbPath: string, ids: string[]): number {
  if (ids.length === 0) return 0;
  const db = new Database(dbPath, { readwrite: true, create: false });
  try {
    const deleteMessage = db.query("DELETE FROM message WHERE id = ?");
    let deleted = 0;
    for (const id of ids) {
      const result = deleteMessage.run(id) as { changes?: number };
      deleted += Number(result.changes ?? 0);
    }
    return deleted;
  } finally {
    db.close();
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
  const sessionActivity = loadSessionActivityRows(args.dbPath);
  const nowMs = Date.now();
  const classification = classifyBlankAssistantRows(rows, {
    nowMs,
    thresholdMs: args.thresholdMs,
    resolveSessionLiveness: createSessionActivityLivenessResolver(
      sessionActivity,
      {
        nowMs,
        thresholdMs: args.thresholdMs,
      },
    ),
  });
  const ids = getDeletableBlankAssistantIds(classification);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          available: true,
          mode: "dry-run",
          db_path: args.dbPath,
          would_delete: ids.length,
          ...classification,
        },
        null,
        2,
      ),
    );
    return;
  }

  const backups = await backupDatabaseFiles(args.dbPath, args.backupDir!);
  const deleted = deleteMessages(args.dbPath, ids);
  console.log(
    JSON.stringify(
      {
        available: true,
        mode: "apply",
        db_path: args.dbPath,
        backup_files: backups,
        deleted,
        ...classification,
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
