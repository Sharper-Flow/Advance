#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  classifyBlankAssistantRows,
  getDeletableBlankAssistantIds,
  getDefaultOpenCodeDbPath,
  STALE_BLANK_ASSISTANT_THRESHOLD_MS,
  type BlankAssistantRow,
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
    dbPath: getDefaultOpenCodeDbPath(),
    dryRun: false,
    apply: false,
    thresholdMs: STALE_BLANK_ASSISTANT_THRESHOLD_MS,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--db") args.dbPath = requireValue(argv, ++i, "--db");
    else if (arg === "--backup-dir") args.backupDir = requireValue(argv, ++i, "--backup-dir");
    else if (arg === "--threshold-ms") args.thresholdMs = Number(requireValue(argv, ++i, "--threshold-ms"));
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.dryRun && !args.apply) args.dryRun = true;
  if (args.dryRun && args.apply) throw new Error("Use either --dry-run or --apply, not both");
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
      .query(
        `
          SELECT
            m.id AS id,
            m.session_id AS session_id,
            json_extract(m.data, '$.time.created') AS created_ms,
            (SELECT COUNT(*) FROM part p WHERE p.message_id = m.id) AS part_count
          FROM message m
          WHERE json_extract(m.data, '$.role') = 'assistant'
            AND json_extract(m.data, '$.finish') IS NULL
            AND (SELECT COUNT(*) FROM part p WHERE p.message_id = m.id) = 0
          ORDER BY json_extract(m.data, '$.time.created') DESC
        `,
      )
      .all()
      .map((row) => row as Record<string, unknown>)
      .map((row) => ({
        id: String(row.id),
        session_id: String(row.session_id),
        created_ms: Number(row.created_ms),
        part_count: Number(row.part_count),
      }))
      .filter((row) => row.id && row.session_id && Number.isFinite(row.created_ms));
  } finally {
    db.close();
  }
}

async function backupDatabaseFiles(dbPath: string, backupDir: string): Promise<string[]> {
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const copied: string[] = [];
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (!existsSync(file)) continue;
    const dest = join(backupDir, `${basename(file)}.${stamp}.backup`);
    await copyFile(file, dest);
    copied.push(dest);
  }
  if (copied.length === 0) throw new Error("No database files were backed up; refusing apply");
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
  const classification = classifyBlankAssistantRows(rows, {
    thresholdMs: args.thresholdMs,
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
