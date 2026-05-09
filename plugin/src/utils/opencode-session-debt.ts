import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// rq-opencodeDebt01: read-only diagnostics for stale blank assistant messages.

export const STALE_BLANK_ASSISTANT_THRESHOLD_MS = 5 * 60 * 1000;
const DEFAULT_SAMPLE_LIMIT = 10;

export interface BlankAssistantRow {
  id: string;
  session_id: string;
  created_ms: number;
  part_count: number;
}

export interface ClassifiedBlankAssistantRow extends BlankAssistantRow {
  age_ms: number;
}

export type BlankAssistantLiveness =
  | "live_in_flight"
  | "idle_active_session"
  | "orphan_ghost"
  | "unknown";

export interface OpenCodeSessionDebtClassification {
  threshold_ms: number;
  total_blank: number;
  /** @deprecated Use orphan_ghost. Kept for existing status/report callers. */
  repairable_stale: ClassifiedBlankAssistantRow[];
  live_in_flight: ClassifiedBlankAssistantRow[];
  idle_active_session: ClassifiedBlankAssistantRow[];
  orphan_ghost: ClassifiedBlankAssistantRow[];
  ignored_with_parts: ClassifiedBlankAssistantRow[];
}

export type OpenCodeSessionDebtScan =
  | (OpenCodeSessionDebtClassification & {
      available: true;
      db_path: string;
      checked_at: string;
    })
  | {
      available: false;
      db_path: string;
      checked_at: string;
      reason: string;
      threshold_ms: number;
      total_blank: 0;
      repairable_stale: [];
      live_in_flight: [];
      idle_active_session: [];
      orphan_ghost: [];
      ignored_with_parts: [];
    };

interface ClassifyOptions {
  nowMs?: number;
  thresholdMs?: number;
  sampleLimit?: number;
  resolveSessionLiveness?: (
    row: BlankAssistantRow,
  ) => BlankAssistantLiveness | undefined;
}

interface ScanOptions extends ClassifyOptions {
  dbPath?: string;
  env?: OpenCodeDbEnv;
  importSqlite?: () => Promise<unknown>;
}

interface OpenCodeDbEnv {
  OPENCODE_DB?: string;
}

type BunSqliteDatabaseConstructor = new (
  path: string,
  options: { readonly: true },
) => {
  query: (sql: string) => { all: () => unknown[] };
  close: () => void;
};

export function getDefaultOpenCodeDbPath(env?: OpenCodeDbEnv): string {
  return (
    env?.OPENCODE_DB ||
    process.env.OPENCODE_DB ||
    join(homedir(), ".local", "share", "opencode", "opencode.db")
  );
}

export function classifyBlankAssistantRows(
  rows: BlankAssistantRow[],
  options: ClassifyOptions = {},
): OpenCodeSessionDebtClassification {
  const nowMs = options.nowMs ?? Date.now();
  const thresholdMs = options.thresholdMs ?? STALE_BLANK_ASSISTANT_THRESHOLD_MS;
  const sampleLimit = options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;

  const result: OpenCodeSessionDebtClassification = {
    threshold_ms: thresholdMs,
    total_blank: rows.length,
    repairable_stale: [],
    live_in_flight: [],
    idle_active_session: [],
    orphan_ghost: [],
    ignored_with_parts: [],
  };

  for (const row of rows) {
    const classified: ClassifiedBlankAssistantRow = {
      ...row,
      age_ms: Math.max(0, nowMs - row.created_ms),
    };

    if (row.part_count > 0) {
      pushSample(result.ignored_with_parts, classified, sampleLimit);
      continue;
    }

    const liveness = options.resolveSessionLiveness?.(row);
    if (liveness === "orphan_ghost") {
      pushSample(result.orphan_ghost, classified, sampleLimit);
      pushSample(result.repairable_stale, classified, sampleLimit);
      continue;
    }
    if (liveness === "live_in_flight") {
      pushSample(result.live_in_flight, classified, sampleLimit);
      continue;
    }
    if (liveness === "idle_active_session" || liveness === "unknown") {
      pushSample(result.idle_active_session, classified, sampleLimit);
      continue;
    }

    if (classified.age_ms >= thresholdMs) {
      pushSample(result.idle_active_session, classified, sampleLimit);
    } else {
      pushSample(result.live_in_flight, classified, sampleLimit);
    }
  }

  return result;
}

export function getDeletableBlankAssistantIds(
  classification: OpenCodeSessionDebtClassification,
): string[] {
  return classification.orphan_ghost.map((row) => row.id);
}

export async function scanOpenCodeSessionDebt(
  options: ScanOptions = {},
): Promise<OpenCodeSessionDebtScan> {
  const dbPath = options.dbPath ?? getDefaultOpenCodeDbPath(options.env);
  const thresholdMs = options.thresholdMs ?? STALE_BLANK_ASSISTANT_THRESHOLD_MS;
  const checkedAt = new Date().toISOString();

  if (!existsSync(dbPath)) {
    return unavailable(
      dbPath,
      checkedAt,
      thresholdMs,
      `OpenCode database not found: ${dbPath}`,
    );
  }

  let db: InstanceType<BunSqliteDatabaseConstructor> | undefined;
  try {
    const sqlite = (await (options.importSqlite ?? importBunSqlite)()) as {
      Database?: BunSqliteDatabaseConstructor;
    };
    if (!sqlite.Database) {
      return unavailable(
        dbPath,
        checkedAt,
        thresholdMs,
        "bun:sqlite Database export unavailable",
      );
    }

    db = new sqlite.Database(dbPath, { readonly: true });
    const rows = db
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
      .map(normalizeRow)
      .filter((row): row is BlankAssistantRow => row !== null);

    return {
      available: true,
      db_path: dbPath,
      checked_at: checkedAt,
      ...classifyBlankAssistantRows(rows, options),
    };
  } catch (err) {
    return unavailable(
      dbPath,
      checkedAt,
      thresholdMs,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    db?.close();
  }
}

function pushSample<T>(items: T[], item: T, limit: number): void {
  if (items.length < limit) items.push(item);
}

function normalizeRow(row: unknown): BlankAssistantRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const id = String(candidate.id ?? "");
  const sessionId = String(candidate.session_id ?? "");
  const rawCreatedMs = candidate.created_ms;
  const createdMs = Number(rawCreatedMs);
  const partCount = Number(candidate.part_count ?? 0);
  if (
    !id ||
    !sessionId ||
    rawCreatedMs === null ||
    rawCreatedMs === undefined ||
    !Number.isFinite(createdMs) ||
    createdMs <= 0
  ) {
    return null;
  }
  return {
    id,
    session_id: sessionId,
    created_ms: createdMs,
    part_count: Number.isFinite(partCount) ? partCount : 0,
  };
}

function unavailable(
  dbPath: string,
  checkedAt: string,
  thresholdMs: number,
  reason: string,
): OpenCodeSessionDebtScan {
  return {
    available: false,
    db_path: dbPath,
    checked_at: checkedAt,
    reason,
    threshold_ms: thresholdMs,
    total_blank: 0,
    repairable_stale: [],
    live_in_flight: [],
    idle_active_session: [],
    orphan_ghost: [],
    ignored_with_parts: [],
  };
}

async function importBunSqlite(): Promise<unknown> {
  // Keep this dynamic so Node-based typecheck/tests do not try to resolve Bun-only sqlite.
  const specifier = "bun:" + "sqlite";
  return import(specifier);
}
