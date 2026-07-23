/**
 * adv CLI — Epic roadmap + repo backlog future-work renderer
 *
 * Shows Epic shell entries and repo backlog items, surfacing only the presence
 * of a durable future-work context packet (text-only `[ctx]` marker). Packet
 * contents are never rendered.
 */

import { createReadStream, existsSync } from "fs";
import { readFile } from "fs/promises";
import { createInterface } from "readline";
import { join } from "path";
import type { Client } from "@temporalio/client";

import {
  buildEpicWorkflowId,
  createTemporalClientBundle,
  EPIC_WORKFLOW_QUERY_NAMES,
} from "../../plugin/src/cli/temporal-boundary";
import { resolveProjectId, resolveRepoRoot } from "./project";
import { BOLD, RESET, shouldUseColor } from "./render";

export const QUERY_TIMEOUT_MS = 5_000;
const BACKLOG_DIR = ".adv";
const BACKLOG_FILE = "backlog.jsonl";

// =============================================================================
// Local shapes
// =============================================================================

export interface RoadmapEntry {
  kind: "shell" | "change";
  order: number;
  title: string;
  hasContextPacket: boolean;
}

export interface RoadmapBacklogItem {
  id: string;
  title: string;
  hasContextPacket: boolean;
}

export interface RoadmapPayload {
  source: "temporal";
  live: boolean;
  generated_at: string;
  project_id: string | null;
  epic_id: string;
  epic_title: string;
  entries: RoadmapEntry[];
  backlog: RoadmapBacklogItem[];
  error?: string;
  remediation?: string;
}

export interface RoadmapOptions {
  epicId: string;
  projectId: string;
  repoRoot: string;
  now: Date;
  timeoutMs: number;
}

// =============================================================================
// Context packet presence guard
// =============================================================================

/**
 * Returns true when `value` is a non-empty context packet. Empty objects,
 * undefined, and null all yield false.
 */
export function hasContextPacket(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const packet = value as Record<string, unknown>;
  return Object.entries(packet).some(([, v]) => {
    if (v === undefined) return false;
    if (typeof v === "string") return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object" && v !== null) return Object.keys(v).length > 0;
    return true;
  });
}

// =============================================================================
// Epic normalization
// =============================================================================

function normalizeEpic(raw: unknown): {
  title: string;
  entries: RoadmapEntry[];
} {
  const fallbackTitle = "(untitled)";
  if (typeof raw !== "object" || raw === null) {
    return { title: fallbackTitle, entries: [] };
  }
  const epic = raw as Record<string, unknown>;
  const title =
    typeof epic.title === "string" && epic.title.length > 0
      ? epic.title
      : fallbackTitle;

  const entries: RoadmapEntry[] = [];
  if (Array.isArray(epic.entries)) {
    for (const item of epic.entries) {
      if (typeof item !== "object" || item === null) continue;
      const entry = item as Record<string, unknown>;
      const kind = entry.kind === "shell" ? "shell" : "change";
      const order =
        typeof entry.order === "number" && Number.isFinite(entry.order)
          ? entry.order
          : 0;
      const titleStr =
        typeof entry.title === "string" && entry.title.length > 0
          ? entry.title
          : typeof entry.success_hint === "string" &&
              entry.success_hint.length > 0
            ? entry.success_hint
            : "(untitled)";
      entries.push({
        kind,
        order,
        title: titleStr,
        hasContextPacket: hasContextPacket(entry.context_packet),
      });
    }
  }
  entries.sort((a, b) => a.order - b.order);
  return { title, entries };
}

// =============================================================================
// Backlog reading
// =============================================================================

export function backlogPath(repoRoot: string): string {
  return join(repoRoot, BACKLOG_DIR, BACKLOG_FILE);
}

interface RawBacklogItem {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  context_packet?: unknown;
}

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

async function readBacklogLatestItems(
  path: string,
): Promise<RawBacklogItem[]> {
  if (!existsSync(path)) return [];

  const raw = await readFile(path, "utf8");
  const lines = raw.split(/\r?\n/);
  // First line is the header; remaining lines are records.
  const records: RawBacklogItem[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line) as RawBacklogItem);
    } catch {
      // Skip malformed lines; the store is append-only and we render best-effort.
    }
  }
  return records;
}

function normalizeBacklogItems(records: RawBacklogItem[]): RoadmapBacklogItem[] {
  const latest = new Map<string, RoadmapBacklogItem>();
  for (const record of records) {
    const id =
      typeof record.id === "string" && record.id.length > 0 ? record.id : null;
    if (!id) continue;
    const title =
      typeof record.title === "string" && record.title.length > 0
        ? record.title
        : id;
    latest.set(id, {
      id,
      title,
      hasContextPacket: hasContextPacket(record.context_packet),
    });
  }
  // Keep only items whose latest record is active.
  return records
    .filter(
      (record) =>
        typeof record.id === "string" &&
        record.id.length > 0 &&
        typeof record.status === "string" &&
        record.status === "active",
    )
    .map((record) => latest.get(record.id as string))
    .filter((item): item is RoadmapBacklogItem => item !== undefined);
}

export async function loadBacklogItems(repoRoot: string): Promise<RoadmapBacklogItem[]> {
  const path = backlogPath(repoRoot);
  const records = await readBacklogLatestItems(path);
  // De-duplicate while preserving latest active order.
  const seen = new Set<string>();
  const items: RoadmapBacklogItem[] = [];
  for (const item of normalizeBacklogItems(records)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

// =============================================================================
// Temporal loading
// =============================================================================

export interface RoadmapTemporalClient {
  workflow: {
    getHandle: (workflowId: string) => {
      query: (queryName: string) => Promise<unknown>;
    };
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export async function loadEpic(
  client: RoadmapTemporalClient,
  projectId: string,
  epicId: string,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<{ title: string; entries: RoadmapEntry[] }> {
  const workflowId = buildEpicWorkflowId(projectId, epicId);
  const raw = await withTimeout(
    client.workflow.getHandle(workflowId).query(EPIC_WORKFLOW_QUERY_NAMES.getEpic),
    timeoutMs,
    `Temporal query ${epicId}`,
  );
  return normalizeEpic(raw);
}

export async function loadLiveRoadmap(
  options: RoadmapOptions,
): Promise<RoadmapPayload> {
  const bundle = await withTimeout(
    createTemporalClientBundle(),
    options.timeoutMs,
    "Temporal connection",
  );
  try {
    const epic = await loadEpic(
      bundle.client as unknown as RoadmapTemporalClient,
      options.projectId,
      options.epicId,
      options.timeoutMs,
    );
    const backlog = await loadBacklogItems(options.repoRoot);
    return {
      source: "temporal",
      live: true,
      generated_at: options.now.toISOString(),
      project_id: options.projectId,
      epic_id: options.epicId,
      epic_title: epic.title,
      entries: epic.entries,
      backlog,
    };
  } finally {
    await bundle.connection.close();
  }
}

// =============================================================================
// Payload builders
// =============================================================================

export function buildRoadmapFailure(
  projectId: string | null,
  epicId: string,
  error: unknown,
  now: Date,
): RoadmapPayload {
  const message = error instanceof Error ? error.message : String(error);
  return {
    source: "temporal",
    live: false,
    generated_at: now.toISOString(),
    project_id: projectId,
    epic_id: epicId,
    epic_title: "(unavailable)",
    entries: [],
    backlog: [],
    error: message,
    remediation:
      "Roadmap unavailable. Verify this command is running inside a git repository, the Epic exists, and Temporal is reachable.",
  };
}

// =============================================================================
// Text rendering
// =============================================================================

function formatEntryRow(entry: RoadmapEntry): string {
  const marker = entry.hasContextPacket ? " [ctx]" : "";
  return `[${entry.kind}] ${entry.title}${marker}`;
}

function formatBacklogRow(item: RoadmapBacklogItem): string {
  const marker = item.hasContextPacket ? " [ctx]" : "";
  return `- ${item.title}${marker}`;
}

export function renderRoadmap(
  payload: RoadmapPayload,
  noColorFlag: boolean,
): string {
  const useColor = shouldUseColor(noColorFlag);
  const lines: string[] = [];

  const header = useColor
    ? `${BOLD}ADV roadmap — ${payload.epic_id}${RESET}`
    : `ADV roadmap — ${payload.epic_id}`;
  lines.push(header, "");

  const title = useColor
    ? `${BOLD}# ${payload.epic_title}${RESET}`
    : `# ${payload.epic_title}`;
  lines.push(title);

  if (payload.entries.length > 0) {
    lines.push("", "## Roadmap");
    for (const entry of payload.entries) {
      lines.push(formatEntryRow(entry));
    }
  }

  if (payload.backlog.length > 0) {
    lines.push("", "## Backlog");
    for (const item of payload.backlog) {
      lines.push(formatBacklogRow(item));
    }
  }

  if (payload.entries.length === 0 && payload.backlog.length === 0) {
    lines.push("", "(no future-work rows)");
  }

  return lines.join("\n") + "\n";
}

// =============================================================================
// CLI entry point
// =============================================================================

export interface RunRoadmapResult {
  exitCode: number;
  payload: RoadmapPayload;
}

export async function runRoadmapCommand(
  epicId: string,
  noColor: boolean,
  json: boolean,
): Promise<RunRoadmapResult> {
  const now = new Date();
  const cwd = process.cwd();
  const projectId = await resolveProjectId(cwd);

  if (!projectId) {
    const payload = buildRoadmapFailure(
      null,
      epicId,
      new Error("not in a git repo (or git unavailable)"),
      now,
    );
    if (json) {
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    } else {
      process.stderr.write(`roadmap: ${payload.error}\n`);
    }
    return { exitCode: 1, payload };
  }

  const repoRoot = await resolveRepoRoot(cwd);
  const rawTimeout = Number(process.env.ADV_STATUS_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : QUERY_TIMEOUT_MS;

  try {
    const payload = await loadLiveRoadmap({
      epicId,
      projectId,
      repoRoot,
      now,
      timeoutMs,
    });

    if (json) {
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    } else {
      process.stdout.write(renderRoadmap(payload, noColor));
    }
    return { exitCode: 0, payload };
  } catch (err) {
    const payload = buildRoadmapFailure(projectId, epicId, err, now);
    if (json) {
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    } else {
      process.stderr.write(`roadmap: ${payload.error}\n`);
      process.stderr.write(`hint: ${payload.remediation}\n`);
    }
    return { exitCode: 2, payload };
  }
}
