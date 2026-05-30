import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

// rq-opencodeDebt01: read-only diagnostics for stale blank assistant messages and stale tool parts.

export const STALE_BLANK_ASSISTANT_THRESHOLD_MS = 5 * 60 * 1000;
const DEFAULT_SAMPLE_LIMIT = 10;

export interface BlankAssistantRow {
  id: string;
  session_id: string;
  created_ms: number;
  part_count: number;
}

export interface OpenCodeSessionActivityRow {
  session_id: string;
  time_updated_ms: number;
}

interface SessionDebtLivenessRow {
  session_id: string;
  created_ms: number;
  updated_ms?: number;
}

export interface ToolPartRow extends SessionDebtLivenessRow {
  id: string;
  message_id: string;
  session_id: string;
  created_ms: number;
  updated_ms: number;
  tool: string;
  call_id: string;
  status: "running" | "pending";
  child_session_id?: string;
  child_session_updated_ms?: number;
}

export interface ClassifiedBlankAssistantRow extends BlankAssistantRow {
  age_ms: number;
}

export interface ClassifiedToolPartRow extends ToolPartRow {
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
  total_tool_parts: number;
  total_orphan_ghost: number;
  total_live_in_flight: number;
  total_idle_active_session: number;
  total_repairable_tool_parts: number;
  total_live_tool_parts: number;
  total_idle_tool_parts: number;
  /** @deprecated Use orphan_ghost. Kept for existing status/report callers. */
  repairable_stale: ClassifiedBlankAssistantRow[];
  live_in_flight: ClassifiedBlankAssistantRow[];
  idle_active_session: ClassifiedBlankAssistantRow[];
  orphan_ghost: ClassifiedBlankAssistantRow[];
  ignored_with_parts: ClassifiedBlankAssistantRow[];
  repairable_tool_parts: ClassifiedToolPartRow[];
  live_tool_parts: ClassifiedToolPartRow[];
  idle_tool_parts: ClassifiedToolPartRow[];
}

export interface ResolvedDbPath {
  dbPath: string;
  envValue?: string;
  attemptedPath?: string;
  fallbackUsed: boolean;
}

export type OpenCodeSessionDebtScan =
  | (OpenCodeSessionDebtClassification & {
      available: true;
      db_path: string;
      checked_at: string;
      diagnostics?: string;
    })
  | {
      available: false;
      db_path: string;
      checked_at: string;
      reason: string;
      diagnostics?: string;
      threshold_ms: number;
      total_blank: 0;
      total_tool_parts: 0;
      total_orphan_ghost: 0;
      total_live_in_flight: 0;
      total_idle_active_session: 0;
      total_repairable_tool_parts: 0;
      total_live_tool_parts: 0;
      total_idle_tool_parts: 0;
      repairable_stale: [];
      live_in_flight: [];
      idle_active_session: [];
      orphan_ghost: [];
      ignored_with_parts: [];
      repairable_tool_parts: [];
      live_tool_parts: [];
      idle_tool_parts: [];
    };

interface ClassifyOptions {
  nowMs?: number;
  thresholdMs?: number;
  sampleLimit?: number;
  resolveSessionLiveness?: (
    row: SessionDebtLivenessRow,
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

export const BLANK_ASSISTANT_ROWS_SQL = `
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
`;

export const SESSION_ACTIVITY_ROWS_SQL = `
  SELECT
    s.id AS session_id,
    s.time_updated AS time_updated_ms
  FROM session s
`;

export const STALE_TOOL_PART_ROWS_SQL = `
  SELECT
    p.id AS id,
    p.message_id AS message_id,
    p.session_id AS session_id,
    p.time_created AS created_ms,
    p.time_updated AS updated_ms,
    json_extract(p.data, '$.tool') AS tool,
    json_extract(p.data, '$.callID') AS call_id,
    json_extract(p.data, '$.state.status') AS status,
    json_extract(p.data, '$.state.metadata.sessionId') AS child_session_id,
    child.time_updated AS child_session_updated_ms
  FROM part p
  LEFT JOIN session child
    ON child.id = json_extract(p.data, '$.state.metadata.sessionId')
  WHERE json_extract(p.data, '$.type') = 'tool'
    AND json_extract(p.data, '$.state.status') IN ('running', 'pending')
  ORDER BY p.time_updated DESC
`;

export function getDefaultOpenCodeDbPath(env?: OpenCodeDbEnv): ResolvedDbPath {
  const canonicalPath = join(
    homedir(),
    ".local",
    "share",
    "opencode",
    "opencode.db",
  );
  const envValue = env?.OPENCODE_DB ?? process.env.OPENCODE_DB;

  if (!envValue) {
    return { dbPath: canonicalPath, fallbackUsed: false };
  }

  if (isAbsolute(envValue)) {
    return { dbPath: envValue, envValue, fallbackUsed: false };
  }

  const attemptedPath = resolve(process.cwd(), envValue);
  if (existsSync(attemptedPath)) {
    return {
      dbPath: attemptedPath,
      envValue,
      attemptedPath,
      fallbackUsed: false,
    };
  }

  return {
    dbPath: canonicalPath,
    envValue,
    attemptedPath,
    fallbackUsed: true,
  };
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
    total_tool_parts: 0,
    total_orphan_ghost: 0,
    total_live_in_flight: 0,
    total_idle_active_session: 0,
    total_repairable_tool_parts: 0,
    total_live_tool_parts: 0,
    total_idle_tool_parts: 0,
    repairable_stale: [],
    live_in_flight: [],
    idle_active_session: [],
    orphan_ghost: [],
    ignored_with_parts: [],
    repairable_tool_parts: [],
    live_tool_parts: [],
    idle_tool_parts: [],
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
      result.total_orphan_ghost += 1;
      pushSample(result.orphan_ghost, classified, sampleLimit);
      pushSample(result.repairable_stale, classified, sampleLimit);
      continue;
    }
    if (liveness === "live_in_flight") {
      result.total_live_in_flight += 1;
      pushSample(result.live_in_flight, classified, sampleLimit);
      continue;
    }
    if (liveness === "idle_active_session" || liveness === "unknown") {
      result.total_idle_active_session += 1;
      pushSample(result.idle_active_session, classified, sampleLimit);
      continue;
    }

    if (classified.age_ms >= thresholdMs) {
      result.total_idle_active_session += 1;
      pushSample(result.idle_active_session, classified, sampleLimit);
    } else {
      result.total_live_in_flight += 1;
      pushSample(result.live_in_flight, classified, sampleLimit);
    }
  }

  return result;
}

export function classifyToolPartRows(
  rows: ToolPartRow[],
  options: ClassifyOptions = {},
): Pick<
  OpenCodeSessionDebtClassification,
  | "threshold_ms"
  | "total_tool_parts"
  | "total_repairable_tool_parts"
  | "total_live_tool_parts"
  | "total_idle_tool_parts"
  | "repairable_tool_parts"
  | "live_tool_parts"
  | "idle_tool_parts"
> {
  const nowMs = options.nowMs ?? Date.now();
  const thresholdMs = options.thresholdMs ?? STALE_BLANK_ASSISTANT_THRESHOLD_MS;
  const sampleLimit = options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;
  const result = {
    threshold_ms: thresholdMs,
    total_tool_parts: rows.length,
    total_repairable_tool_parts: 0,
    total_live_tool_parts: 0,
    total_idle_tool_parts: 0,
    repairable_tool_parts: [] as ClassifiedToolPartRow[],
    live_tool_parts: [] as ClassifiedToolPartRow[],
    idle_tool_parts: [] as ClassifiedToolPartRow[],
  };

  for (const row of rows) {
    const classified: ClassifiedToolPartRow = {
      ...row,
      age_ms: Math.max(0, nowMs - row.updated_ms),
    };
    const liveness = options.resolveSessionLiveness?.(row);

    if (isLiveTaskToolWait(row, nowMs, thresholdMs)) {
      result.total_live_tool_parts += 1;
      pushSample(result.live_tool_parts, classified, sampleLimit);
      continue;
    }

    // Tool parts require both stale age and orphan liveness before repair.
    // Young orphan-looking rows can be produced while a live runner is still
    // creating DB rows, so age is a safety gate for tool repair.
    if (classified.age_ms < thresholdMs || liveness === "live_in_flight") {
      result.total_live_tool_parts += 1;
      pushSample(result.live_tool_parts, classified, sampleLimit);
      continue;
    }
    if (liveness === "orphan_ghost") {
      result.total_repairable_tool_parts += 1;
      pushSample(result.repairable_tool_parts, classified, sampleLimit);
      continue;
    }
    result.total_idle_tool_parts += 1;
    pushSample(result.idle_tool_parts, classified, sampleLimit);
  }

  return result;
}

function isLiveTaskToolWait(
  row: ToolPartRow,
  nowMs: number,
  thresholdMs: number,
): boolean {
  if (row.tool !== "task") return false;
  if (!row.child_session_id) return false;
  const childUpdatedMs = row.child_session_updated_ms;
  return (
    childUpdatedMs !== undefined &&
    Number.isFinite(childUpdatedMs) &&
    nowMs - childUpdatedMs < thresholdMs
  );
}

export function getDeletableBlankAssistantIds(
  classification: OpenCodeSessionDebtClassification,
): string[] {
  return classification.orphan_ghost.map((row) => row.id);
}

export function getRepairableToolPartIds(
  classification: Pick<
    OpenCodeSessionDebtClassification,
    "repairable_tool_parts"
  >,
): string[] {
  return classification.repairable_tool_parts.map((row) => row.id);
}

export function createSessionActivityLivenessResolver(
  sessions: OpenCodeSessionActivityRow[],
  options: Pick<ClassifyOptions, "nowMs" | "thresholdMs"> = {},
): (row: SessionDebtLivenessRow) => BlankAssistantLiveness {
  const nowMs = options.nowMs ?? Date.now();
  const thresholdMs = options.thresholdMs ?? STALE_BLANK_ASSISTANT_THRESHOLD_MS;
  const bySessionId = new Map(
    sessions.map((session) => [session.session_id, session.time_updated_ms]),
  );

  return (row) => {
    const sessionUpdatedMs = bySessionId.get(row.session_id);
    if (sessionUpdatedMs === undefined || !Number.isFinite(sessionUpdatedMs)) {
      return "orphan_ghost";
    }

    const latestKnownActivityMs = Math.max(
      row.created_ms,
      row.updated_ms ?? 0,
      sessionUpdatedMs,
    );
    if (nowMs - latestKnownActivityMs < thresholdMs) return "live_in_flight";
    return "orphan_ghost";
  };
}

export async function scanOpenCodeSessionDebt(
  options: ScanOptions = {},
): Promise<OpenCodeSessionDebtScan> {
  const resolved: ResolvedDbPath = options.dbPath
    ? { dbPath: options.dbPath, fallbackUsed: false }
    : getDefaultOpenCodeDbPath(options.env);
  const dbPath = resolved.dbPath;
  const thresholdMs = options.thresholdMs ?? STALE_BLANK_ASSISTANT_THRESHOLD_MS;
  const nowMs = options.nowMs ?? Date.now();
  const checkedAt = new Date(nowMs).toISOString();

  if (!existsSync(dbPath)) {
    const diagnostics = buildPathDiagnostics(resolved, false);
    return unavailable(
      dbPath,
      checkedAt,
      thresholdMs,
      `OpenCode database not found: ${dbPath}`,
      diagnostics,
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
      .query(BLANK_ASSISTANT_ROWS_SQL)
      .all()
      .map(normalizeBlankAssistantRow)
      .filter((row): row is BlankAssistantRow => row !== null);
    const toolPartRows = db
      .query(STALE_TOOL_PART_ROWS_SQL)
      .all()
      .map(normalizeToolPartRow)
      .filter((row): row is ToolPartRow => row !== null);
    const sessions = db
      .query(SESSION_ACTIVITY_ROWS_SQL)
      .all()
      .map(normalizeSessionActivityRow)
      .filter((row): row is OpenCodeSessionActivityRow => row !== null);
    const classifyOptions: ClassifyOptions = {
      ...options,
      nowMs,
      thresholdMs,
      resolveSessionLiveness:
        options.resolveSessionLiveness ??
        createSessionActivityLivenessResolver(sessions, { nowMs, thresholdMs }),
    };

    return {
      available: true,
      db_path: dbPath,
      checked_at: checkedAt,
      diagnostics: buildPathDiagnostics(resolved, true),
      ...classifyBlankAssistantRows(rows, classifyOptions),
      ...classifyToolPartRows(toolPartRows, classifyOptions),
    };
  } catch (err) {
    return unavailable(
      dbPath,
      checkedAt,
      thresholdMs,
      err instanceof Error ? err.message : String(err),
      buildPathDiagnostics(resolved, true),
    );
  } finally {
    db?.close();
  }
}

function pushSample<T>(items: T[], item: T, limit: number): void {
  if (items.length < limit) items.push(item);
}

export function normalizeBlankAssistantRow(
  row: unknown,
): BlankAssistantRow | null {
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

export function normalizeSessionActivityRow(
  row: unknown,
): OpenCodeSessionActivityRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const sessionId = String(candidate.session_id ?? "");
  const timeUpdatedMs = Number(candidate.time_updated_ms);
  if (!sessionId || !Number.isFinite(timeUpdatedMs) || timeUpdatedMs <= 0) {
    return null;
  }
  return { session_id: sessionId, time_updated_ms: timeUpdatedMs };
}

export function normalizeToolPartRow(row: unknown): ToolPartRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const id = String(candidate.id ?? "");
  const messageId = String(candidate.message_id ?? "");
  const sessionId = String(candidate.session_id ?? "");
  const createdMs = Number(candidate.created_ms);
  const updatedMs = Number(candidate.updated_ms);
  const tool = String(candidate.tool ?? "");
  const callId = String(candidate.call_id ?? "");
  const status = String(candidate.status ?? "");
  const childSessionId = String(candidate.child_session_id ?? "") || undefined;
  const rawChildSessionUpdatedMs = candidate.child_session_updated_ms;
  const childSessionUpdatedMs = Number(rawChildSessionUpdatedMs);
  if (
    !id ||
    !messageId ||
    !sessionId ||
    !Number.isFinite(createdMs) ||
    createdMs <= 0 ||
    !Number.isFinite(updatedMs) ||
    updatedMs <= 0 ||
    !tool ||
    !callId ||
    (status !== "running" && status !== "pending")
  ) {
    return null;
  }
  return {
    id,
    message_id: messageId,
    session_id: sessionId,
    created_ms: createdMs,
    updated_ms: updatedMs,
    tool,
    call_id: callId,
    status,
    child_session_id: childSessionId,
    child_session_updated_ms:
      rawChildSessionUpdatedMs !== null &&
      rawChildSessionUpdatedMs !== undefined &&
      Number.isFinite(childSessionUpdatedMs) &&
      childSessionUpdatedMs > 0
        ? childSessionUpdatedMs
        : undefined,
  };
}

function unavailable(
  dbPath: string,
  checkedAt: string,
  thresholdMs: number,
  reason: string,
  diagnostics?: string,
): OpenCodeSessionDebtScan {
  return {
    available: false,
    db_path: dbPath,
    checked_at: checkedAt,
    reason,
    diagnostics,
    threshold_ms: thresholdMs,
    total_blank: 0,
    total_tool_parts: 0,
    total_orphan_ghost: 0,
    total_live_in_flight: 0,
    total_idle_active_session: 0,
    total_repairable_tool_parts: 0,
    total_live_tool_parts: 0,
    total_idle_tool_parts: 0,
    repairable_stale: [],
    live_in_flight: [],
    idle_active_session: [],
    orphan_ghost: [],
    ignored_with_parts: [],
    repairable_tool_parts: [],
    live_tool_parts: [],
    idle_tool_parts: [],
  };
}

function buildPathDiagnostics(
  resolved: ResolvedDbPath,
  available: boolean,
): string | undefined {
  if (!resolved.envValue) return undefined;

  let diagnostics = `OPENCODE_DB=${resolved.envValue}`;
  if (resolved.attemptedPath) {
    diagnostics += `, attempted: ${resolved.attemptedPath}`;
  }
  if (resolved.fallbackUsed) {
    diagnostics += available
      ? `, fallback: ${resolved.dbPath}`
      : `, fallback unavailable`;
  }
  return diagnostics;
}

async function importBunSqlite(): Promise<unknown> {
  // Keep this dynamic so Node-based typecheck/tests do not try to resolve Bun-only sqlite.
  const specifier = "bun:" + "sqlite";
  return import(specifier);
}
