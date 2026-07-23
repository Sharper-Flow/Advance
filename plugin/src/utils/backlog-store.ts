/**
 * Repo Backlog Storage Primitives
 *
 * JSONL-backed append-only store under `.adv/backlog.jsonl`.
 *
 * - Read: stream-parse via readline; per-line Zod validation; header cache.
 * - Write: acquireFileLock → appendFile(content + "\n") → release lock.
 * - Tail-read: files larger than 1MB stream only the last N item lines.
 *
 * Spec citations:
 *   rq-backlogDurability01 — in-repo JSONL store.
 *   rq-backlogFormat01 — header line + per-line Zod validation + malformed reporting.
 *   rq-backlogLifecycle01 — active/archived status and promoted_to target.
 *   rq-backlogPromotion01 — idempotent promotion on (itemId, targetId).
 *   rq-backlogArchive01 — soft-delete and archived-aware reads.
 *   rq-backlogConcurrency01 — file-lock serialization for concurrent appends.
 */

import { appendFile, mkdir, stat, writeFile } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import { dirname, join } from "path";
import { nanoid } from "nanoid";
import {
  BacklogHeaderSchema,
  BacklogItemSchema,
  CURRENT_SCHEMA_VERSION,
  type BacklogHeader,
  type BacklogItem,
  type BacklogMalformedLine,
  type BacklogReadOptions,
  type BacklogReadResult,
} from "../types/backlog";
import type { FutureWorkContextPacket } from "../types/future-work";
import { acquireFileLock } from "./fs";

// =============================================================================
// Constants
// =============================================================================

const BACKLOG_DIR = ".adv";
const BACKLOG_FILE = "backlog.jsonl";
const LARGE_FILE_THRESHOLD_BYTES = 1024 * 1024;
const DEFAULT_TAIL_LIMIT = 1000;

// =============================================================================
// Paths
// =============================================================================

export function getBacklogPath(projectDir: string): string {
  return join(projectDir, BACKLOG_DIR, BACKLOG_FILE);
}

// =============================================================================
// Errors
// =============================================================================

export class BacklogError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "archived"
      | "schema_version"
      | "malformed"
      | "duplicate",
  ) {
    super(message);
    this.name = "BacklogError";
  }
}

// =============================================================================
// Read Helpers
// =============================================================================

async function readFirstLine(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  const stream = createReadStream(path, { end: 4095 });
  const rl = createInterface({ input: stream });
  for await (const line of rl) {
    rl.close();
    stream.destroy();
    return line;
  }
  return null;
}

function parseHeader(raw: string): {
  header: BacklogHeader;
  malformed?: BacklogMalformedLine;
} {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const validated = BacklogHeaderSchema.parse(parsed);
    return { header: validated };
  } catch (err) {
    return {
      header: { schemaVersion: CURRENT_SCHEMA_VERSION },
      malformed: {
        line: 1,
        raw,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function validateItem(
  line: number,
  raw: string,
): { item?: BacklogItem; malformed?: BacklogMalformedLine } {
  if (raw.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      malformed: {
        line,
        raw,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
  const result = BacklogItemSchema.safeParse(parsed);
  if (!result.success) {
    return {
      malformed: {
        line,
        raw,
        error: result.error.message,
      },
    };
  }
  return { item: result.data };
}

function buildReadResult(
  header: BacklogHeader,
  entries: Array<{
    line: number;
    raw: string;
    item?: BacklogItem;
    malformed?: BacklogMalformedLine;
  }>,
  options: BacklogReadOptions,
): BacklogReadResult {
  const allItems: BacklogItem[] = [];
  const malformed: BacklogMalformedLine[] = [];
  for (const entry of entries) {
    if (entry.malformed) {
      malformed.push(entry.malformed);
      continue;
    }
    if (entry.item) allItems.push(entry.item);
  }

  // Latest record per id, regardless of status.
  const latestMap = new Map<string, BacklogItem>();
  for (const item of allItems) {
    latestMap.set(item.id, item);
  }

  const includeArchived = options.includeArchived ?? false;
  const filtered = allItems.filter((item) => {
    const latest = latestMap.get(item.id);
    if (includeArchived) return true;
    // Exclude any item whose current latest state is archived.
    return latest?.status === "active";
  });

  const latestItems = filtered.filter(
    (item) => latestMap.get(item.id) === item,
  );

  return {
    header,
    items: filtered,
    latestItems,
    malformed,
  };
}

async function readBacklogLines(
  path: string,
  tailLimit?: number,
): Promise<Array<{ line: number; raw: string }>> {
  const stats = await stat(path);
  const useTail =
    tailLimit !== undefined && stats.size > LARGE_FILE_THRESHOLD_BYTES;

  const stream = createReadStream(path);
  const rl = createInterface({ input: stream });
  const lines: Array<{ line: number; raw: string }> = [];
  let lineNo = 0;

  for await (const raw of rl) {
    lineNo += 1;
    if (useTail) {
      lines.push({ line: lineNo, raw });
      if (lines.length > tailLimit) lines.shift();
    } else {
      lines.push({ line: lineNo, raw });
    }
  }

  return lines;
}

/**
 * Read the backlog file. For files larger than 1MB, only the last `tailLimit`
 * lines are streamed (header is still read from the first line).
 */
export async function readBacklog(
  projectDir: string,
  options: BacklogReadOptions = {},
): Promise<BacklogReadResult> {
  const path = getBacklogPath(projectDir);
  if (!existsSync(path)) {
    return {
      header: { schemaVersion: CURRENT_SCHEMA_VERSION },
      items: [],
      latestItems: [],
      malformed: [],
    };
  }

  const firstLine = await readFirstLine(path);
  const { header, malformed: headerMalformed } = firstLine
    ? parseHeader(firstLine)
    : { header: { schemaVersion: CURRENT_SCHEMA_VERSION } };

  const tailLimit =
    options.tailLimit ??
    (options.tailLimit === undefined ? DEFAULT_TAIL_LIMIT : undefined);
  const lines = await readBacklogLines(path, tailLimit);

  const entries: Array<{
    line: number;
    raw: string;
    item?: BacklogItem;
    malformed?: BacklogMalformedLine;
  }> = [];
  if (headerMalformed)
    entries.push({ line: 1, raw: firstLine!, malformed: headerMalformed });

  for (const { line, raw } of lines) {
    if (line === 1) continue; // header handled above
    const { item, malformed } = validateItem(line, raw);
    entries.push({ line, raw, item, malformed });
  }

  return buildReadResult(header, entries, options);
}

// =============================================================================
// Write Helpers
// =============================================================================

function assertWritableSchemaVersion(header: BacklogHeader): void {
  if (header.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new BacklogError(
      `Backlog schema version ${header.schemaVersion} is not supported. Run migration or pass explicit consent.`,
      "schema_version",
    );
  }
}

async function ensureBacklogFile(
  path: string,
  header: BacklogHeader,
): Promise<void> {
  if (existsSync(path)) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(header) + "\n", "utf8");
}

// =============================================================================
// Public Mutations
// =============================================================================

export interface AddBacklogItemInput {
  id?: string;
  title: string;
  success_hint: string;
  context_packet?: FutureWorkContextPacket;
}

/**
 * Add or reactivate a backlog item. If `id` is omitted, a new nanoid is
 * generated. If `id` matches an archived item, a new active record is appended
 * (reactivation).
 */
export async function addBacklogItem(
  projectDir: string,
  input: AddBacklogItemInput,
): Promise<BacklogItem> {
  const path = getBacklogPath(projectDir);
  await mkdir(dirname(path), { recursive: true });
  const releaseLock = await acquireFileLock(path);
  try {
    const existing = await readBacklog(projectDir, {
      includeArchived: true,
      latestOnly: false,
    });
    assertWritableSchemaVersion(existing.header);

    const now = new Date().toISOString();
    const id = input.id ?? `bl-${nanoid(8)}`;
    const previous = existing.latestItems.find((i) => i.id === id);

    const item: BacklogItem = {
      id,
      title: input.title,
      success_hint: input.success_hint,
      status: "active",
      created_at: previous?.created_at ?? now,
      updated_at: now,
      ...(input.context_packet !== undefined
        ? { context_packet: input.context_packet }
        : {}),
    };

    await ensureBacklogFile(path, existing.header);
    await appendFile(path, JSON.stringify(item) + "\n", "utf8");
    return item;
  } finally {
    await releaseLock();
  }
}

export interface PromoteBacklogItemInput {
  id: string;
  kind: "change" | "epic_shell";
  targetId: string;
}

/**
 * Promote a backlog item to a change or Epic shell entry. Idempotent on
 * `(itemId, targetId)`. Refuses promotion of archived items.
 */
export async function promoteBacklogItem(
  projectDir: string,
  input: PromoteBacklogItemInput,
): Promise<BacklogItem> {
  const path = getBacklogPath(projectDir);
  await mkdir(dirname(path), { recursive: true });
  const releaseLock = await acquireFileLock(path);
  try {
    const existing = await readBacklog(projectDir, { includeArchived: true });
    assertWritableSchemaVersion(existing.header);

    const latest = existing.latestItems.find((i) => i.id === input.id);
    if (!latest) {
      throw new BacklogError(
        `Backlog item not found: ${input.id}`,
        "not_found",
      );
    }
    if (latest.status === "archived") {
      throw new BacklogError(
        `Cannot promote archived backlog item: ${input.id}`,
        "archived",
      );
    }
    if (
      latest.promoted_to &&
      latest.promoted_to.kind === input.kind &&
      latest.promoted_to.id === input.targetId
    ) {
      return latest;
    }

    const now = new Date().toISOString();
    const item: BacklogItem = {
      ...latest,
      updated_at: now,
      promoted_to: {
        kind: input.kind,
        id: input.targetId,
        promoted_at: now,
      },
    };

    await ensureBacklogFile(path, existing.header);
    await appendFile(path, JSON.stringify(item) + "\n", "utf8");
    return item;
  } finally {
    await releaseLock();
  }
}

/**
 * Soft-delete a backlog item by appending an archived record.
 */
export async function archiveBacklogItem(
  projectDir: string,
  id: string,
): Promise<BacklogItem | null> {
  const path = getBacklogPath(projectDir);
  await mkdir(dirname(path), { recursive: true });
  const releaseLock = await acquireFileLock(path);
  try {
    const existing = await readBacklog(projectDir, { includeArchived: true });
    assertWritableSchemaVersion(existing.header);

    const latest = existing.latestItems.find((i) => i.id === id);
    if (!latest) return null;
    if (latest.status === "archived") return latest;

    const now = new Date().toISOString();
    const item: BacklogItem = {
      ...latest,
      status: "archived",
      updated_at: now,
      archived_at: now,
    };

    await ensureBacklogFile(path, existing.header);
    await appendFile(path, JSON.stringify(item) + "\n", "utf8");
    return item;
  } finally {
    await releaseLock();
  }
}

/**
 * Fetch a single backlog item by id. Returns null when missing or archived
 * (unless includeArchived is true).
 */
export async function getBacklogItem(
  projectDir: string,
  id: string,
  includeArchived = false,
): Promise<BacklogItem | null> {
  const result = await readBacklog(projectDir, { includeArchived });
  return result.latestItems.find((i) => i.id === id) ?? null;
}

export { CURRENT_SCHEMA_VERSION } from "../types/backlog";
