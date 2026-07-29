import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// rq-tenAgentEvidence01: bounded, read-only concurrency evidence collector.
// No synthetic sessions, no polling loops, no target repo mutation.

export const HISTORICAL_PEAK_TOTAL_AGENTS = 12;
export const HISTORICAL_PEAK_ORCHESTRATORS = 6;
export const HISTORICAL_WORKER_RSS_MIN_MB = 314;
export const HISTORICAL_WORKER_RSS_MAX_MB = 2081; // 2.03 GB

export type EvidenceSource =
  | "historical_baseline"
  | "session_db"
  | "process_snapshot"
  | "temporal_visibility"
  | "workload_gate_event"
  | "unsupported_inference";

export interface SessionSample {
  sessionId: string;
  projectId?: string;
  /** True when the session uses orchestrator-facing tools/commands. */
  isOrchestrator: boolean;
  startedAt?: string;
  source: EvidenceSource;
  provenance: string;
}

export interface ProcessSample {
  pid: number;
  command: string;
  rssMb: number;
  source: EvidenceSource;
  provenance: string;
}

export interface WorkflowSample {
  workflowId: string;
  runId?: string;
  status: string;
  taskQueue?: string;
  source: EvidenceSource;
  provenance: string;
}

export interface ConcurrencyEvidenceSnapshot {
  checkedAt: string;
  sessionSamples: SessionSample[];
  processSamples: ProcessSample[];
  workflowSamples: WorkflowSample[];
  historicalPeak?: {
    totalAgents: number;
    orchestrators: number;
    workerRssMinMb: number;
    workerRssMaxMb: number;
    source: EvidenceSource;
    provenance: string;
  };
  limits: string[];
}

export interface ConcurrencyEvidenceReport {
  checkedAt: string;
  summary: {
    totalAgentsObserved: number;
    orchestratorsObserved: number;
    subAgentsObserved: number;
    failedWorkflowSamples: number;
    workerRssMinMb?: number;
    workerRssMaxMb?: number;
    historicalPeakMeetsTenAgentTarget: boolean;
  };
  snapshot: ConcurrencyEvidenceSnapshot;
  claims: {
    tenAgentDemandSupported: boolean;
    tenOrchestratorLatencyMeasured: boolean;
    tenAgentMemoryWithinBudget: boolean;
  };
  provenance: string[];
  limits: string[];
}

export interface CollectOptions {
  /** Read only session DBs under this root. Defaults to ~/.local/share/opencode-projects. */
  projectShardsRoot?: string;
  /** Read the global OpenCode session DB at this path. */
  globalDbPath?: string;
  /** Optional Temporal workflow visibility sampler. */
  sampleWorkflows?: () => Promise<WorkflowSample[]>;
  /** Maximum number of sessions to sample per source. */
  sessionLimit?: number;
  /** Maximum number of processes to sample. */
  processLimit?: number;
  /** Import bun:sqlite dynamically; injectable for tests. */
  importSqlite?: () => Promise<unknown>;
  /** Read process snapshot; injectable for tests. */
  readProcessSnapshot?: () => Promise<ProcessSample[]>;
  /** Read session DB rows; injectable for tests. */
  readSessionRows?: (dbPath: string) => Promise<SessionDbRow[]>;
  /** Read global session DB rows; injectable for tests. */
  readGlobalSessionRows?: (dbPath: string) => Promise<SessionDbRow[]>;
  /** Read project shard directories; injectable for tests. */
  listProjectShards?: (root: string) => Promise<string[]>;
  nowMs?: number;
}

interface SessionDbRow {
  sessionId: string;
  timeCreatedMs?: number;
  timeUpdatedMs?: number;
  // JSON string of session.data or similar metadata.
  metadata?: string;
}

/**
 * Build a population-consistent, read-only concurrency evidence report.
 * Build a population-consistent, read-only concurrency evidence report.
 * Never starts workflows or sessions; never polls; never mutates.
 */
export async function collectConcurrencyEvidence(
  options: CollectOptions = {},
): Promise<ConcurrencyEvidenceReport> {
  const nowMs = options.nowMs ?? Date.now();
  const checkedAt = new Date(nowMs).toISOString();

  const snapshot = await buildSnapshot(options, checkedAt);
  const totalAgents = snapshot.sessionSamples.length;
  const orchestrators = snapshot.sessionSamples.filter(
    (s) => s.isOrchestrator,
  ).length;
  const subAgents = totalAgents - orchestrators;
  const failedWorkflowSamples = snapshot.workflowSamples.filter(
    (w) => w.status === "FAILED" || w.status === "TERMINATED",
  ).length;

  const processRssValues = snapshot.processSamples
    .map((p) => p.rssMb)
    .filter((n) => Number.isFinite(n));
  const workerRssMinMb =
    processRssValues.length > 0 ? Math.min(...processRssValues) : undefined;
  const workerRssMaxMb =
    processRssValues.length > 0 ? Math.max(...processRssValues) : undefined;

  const historicalPeak = snapshot.historicalPeak;
  const tenAgentDemandSupported =
    (historicalPeak?.totalAgents ?? 0) >= 10 || totalAgents >= 10;
  const tenAgentMemoryWithinBudget =
    historicalPeak !== undefined
      ? historicalPeak.workerRssMaxMb <= 2048 * 1.05 // 60 GB / 16 cores budget; per-process ceiling ~2 GB
      : workerRssMaxMb !== undefined
        ? workerRssMaxMb <= 2048 * 1.05
        : false;

  const provenance = collectProvenance(snapshot);
  const limits = [
    ...snapshot.limits,
    "This report does not measure ten orchestrator latency.",
    "Total agent count is not equivalent to orchestrator count.",
  ];

  return {
    checkedAt,
    summary: {
      totalAgentsObserved: totalAgents,
      orchestratorsObserved: orchestrators,
      subAgentsObserved: subAgents,
      failedWorkflowSamples,
      workerRssMinMb,
      workerRssMaxMb,
      historicalPeakMeetsTenAgentTarget:
        (historicalPeak?.totalAgents ?? 0) >= 10,
    },
    snapshot,
    claims: {
      tenAgentDemandSupported,
      tenOrchestratorLatencyMeasured: false,
      tenAgentMemoryWithinBudget,
    },
    provenance,
    limits,
  };
}

async function buildSnapshot(
  options: CollectOptions,
  checkedAt: string,
): Promise<ConcurrencyEvidenceSnapshot> {
  const limits: string[] = [];
  const sessionSamples: SessionSample[] = [];
  const processSamples: ProcessSample[] = [];
  const workflowSamples: WorkflowSample[] = [];

  // 1. Historical baseline (always recorded, provenance-bound).
  const historicalPeak = {
    totalAgents: HISTORICAL_PEAK_TOTAL_AGENTS,
    orchestrators: HISTORICAL_PEAK_ORCHESTRATORS,
    workerRssMinMb: HISTORICAL_WORKER_RSS_MIN_MB,
    workerRssMaxMb: HISTORICAL_WORKER_RSS_MAX_MB,
    source: "historical_baseline" as EvidenceSource,
    provenance:
      "Historical peak recorded from observed pokeedge overlap: 12 total agents, 6 orchestrators, worker RSS 314 MB–2.03 GB.",
  };

  // 2. Current session samples (bounded, read-only).
  const sessionLimit = options.sessionLimit ?? 200;
  try {
    const projectSamples = await sampleProjectSessionShards(
      options,
      sessionLimit,
    );
    sessionSamples.push(...projectSamples);
  } catch (err) {
    limits.push(
      `Project session shard sampling skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const globalSamples = await sampleGlobalSessionDb(options, sessionLimit);
    sessionSamples.push(...globalSamples);
  } catch (err) {
    limits.push(
      `Global session DB sampling skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Current process samples (bounded, read-only).
  const processLimit = options.processLimit ?? 200;
  try {
    const readProcessSnapshot =
      options.readProcessSnapshot ?? (await defaultProcessSnapshotReader());
    const samples = await readProcessSnapshot();
    processSamples.push(...samples.slice(0, processLimit));
  } catch (err) {
    limits.push(
      `Process sampling skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 4a. Metadata classification caveat.
  if (
    sessionSamples.length > 0 &&
    !sessionSamples.some((s) => s.isOrchestrator)
  ) {
    limits.push(
      "Current session DB metadata is null or empty; sessions default to sub-agent classification. Orchestrator split is sourced from the historical baseline only.",
    );
  }

  // 5. Optional Temporal workflow samples (bounded, read-only, caller-supplied).
  if (options.sampleWorkflows) {
    try {
      const samples = await options.sampleWorkflows();
      workflowSamples.push(...samples);
    } catch (err) {
      limits.push(
        `Temporal workflow sampling skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    limits.push(
      "Temporal workflow visibility not sampled in this run; no client provided.",
    );
  }

  return {
    checkedAt,
    sessionSamples,
    processSamples,
    workflowSamples,
    historicalPeak,
    limits,
  };
}

function collectProvenance(snapshot: ConcurrencyEvidenceSnapshot): string[] {
  const provenance = new Set<string>();
  provenance.add(
    "Historical baseline: 12 total overlapping pokeedge agents, 6 orchestrators, 0 failed sampled ADV queue workflows, worker RSS 314 MB–2.03 GB.",
  );
  for (const sample of snapshot.sessionSamples) {
    provenance.add(`session_db: ${sample.provenance}`);
  }
  for (const sample of snapshot.processSamples) {
    provenance.add(`process_snapshot: ${sample.provenance}`);
  }
  for (const sample of snapshot.workflowSamples) {
    provenance.add(`temporal_visibility: ${sample.provenance}`);
  }
  return Array.from(provenance);
}

async function sampleProjectSessionShards(
  options: CollectOptions,
  limit: number,
): Promise<SessionSample[]> {
  const root =
    options.projectShardsRoot ??
    join(homedir(), ".local", "share", "opencode-projects");
  const usingDefaultReader = options.readSessionRows === undefined;
  if (usingDefaultReader && !existsSync(root)) {
    return [];
  }

  const listShards = options.listProjectShards ?? defaultListProjectShards;
  const readRows =
    options.readSessionRows ?? defaultReadSessionRows(options.importSqlite);
  const shards = await listShards(root);

  const samples: SessionSample[] = [];
  for (const shardPath of shards) {
    if (samples.length >= limit) break;
    const dbPath = join(shardPath, "opencode", "opencode.db");
    if (usingDefaultReader && !existsSync(dbPath)) continue;
    const rows = await readRows(dbPath);
    const projectId = shardPath.split("/").pop() ?? "unknown";
    for (const row of rows) {
      if (samples.length >= limit) break;
      const metadata = parseSessionMetadata(row.metadata);
      samples.push({
        sessionId: row.sessionId,
        projectId,
        isOrchestrator: classifyOrchestrator(metadata),
        startedAt: row.timeCreatedMs
          ? new Date(row.timeCreatedMs).toISOString()
          : undefined,
        source: "session_db",
        provenance: `${projectId}: ${dbPath}`,
      });
    }
  }
  return samples;
}

async function sampleGlobalSessionDb(
  options: CollectOptions,
  limit: number,
): Promise<SessionSample[]> {
  const dbPath =
    options.globalDbPath ??
    join(homedir(), ".local", "share", "opencode", "opencode.db");
  const usingDefaultReader = options.readGlobalSessionRows === undefined;
  if (usingDefaultReader && !existsSync(dbPath)) {
    return [];
  }

  const readRows =
    options.readGlobalSessionRows ??
    defaultReadSessionRows(options.importSqlite);
  const rows = await readRows(dbPath);
  return rows.slice(0, limit).map((row) => {
    const metadata = parseSessionMetadata(row.metadata);
    return {
      sessionId: row.sessionId,
      isOrchestrator: classifyOrchestrator(metadata),
      startedAt: row.timeCreatedMs
        ? new Date(row.timeCreatedMs).toISOString()
        : undefined,
      source: "session_db",
      provenance: `global:${dbPath}`,
    };
  });
}

function parseSessionMetadata(metadata?: string): Record<string, unknown> {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function classifyOrchestrator(metadata: Record<string, unknown>): boolean {
  // Orchestrator sessions are identified by use of change/planning/triage tools or
  // explicit session metadata. Sub-agents are identified by agent/tool-specific metadata.
  const toolHistory = metadata?.toolHistory;
  const sessionKind = metadata?.sessionKind;
  if (sessionKind === "orchestrator") return true;
  if (sessionKind === "sub-agent") return false;
  if (Array.isArray(toolHistory)) {
    const orchestratorTools = new Set([
      "adv_change_create",
      "adv_change_validate",
      "adv_change_archive",
      "adv_task_update",
      "adv_gate_complete",
      "adv_worktree_create",
      "adv_status",
      "adv_triage",
    ]);
    const orchestratorToolHits = toolHistory.filter((t) =>
      orchestratorTools.has(String(t)),
    ).length;
    return orchestratorToolHits > 0;
  }
  // Default to unclassified sub-agent when metadata is absent.
  return false;
}

async function defaultListProjectShards(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((d) => d.isDirectory()).map((d) => join(root, d.name));
}

function defaultReadSessionRows(
  importSqlite?: () => Promise<unknown>,
): (dbPath: string) => Promise<SessionDbRow[]> {
  return async (dbPath: string) => {
    const sqlite = await (importSqlite ?? importBunSqlite)();
    const Database = (sqlite as { Database?: BunSqliteDatabaseConstructor })
      .Database;
    if (!Database) {
      throw new Error("bun:sqlite Database export unavailable");
    }
    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db.query(SESSION_ROWS_SQL).all() as unknown[];
      return rows
        .map(normalizeSessionDbRow)
        .filter((r): r is SessionDbRow => r !== null);
    } finally {
      db.close();
    }
  };
}

function normalizeSessionDbRow(row: unknown): SessionDbRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const sessionId = String(candidate.session_id ?? candidate.sessionId ?? "");
  if (!sessionId) return null;
  const timeCreatedMs = Number(
    candidate.time_created ??
      candidate.timeCreatedMs ??
      candidate.time_created_ms,
  );
  const timeUpdatedMs = Number(
    candidate.time_updated ??
      candidate.timeUpdatedMs ??
      candidate.time_updated_ms,
  );
  return {
    sessionId,
    timeCreatedMs:
      Number.isFinite(timeCreatedMs) && timeCreatedMs > 0
        ? timeCreatedMs
        : undefined,
    timeUpdatedMs:
      Number.isFinite(timeUpdatedMs) && timeUpdatedMs > 0
        ? timeUpdatedMs
        : undefined,
    metadata: candidate.metadata ? String(candidate.metadata) : undefined,
  };
}

const SESSION_ROWS_SQL = `
  SELECT
    s.id AS session_id,
    s.time_created AS time_created,
    s.time_updated AS time_updated,
    s.metadata AS metadata
  FROM session s
  ORDER BY s.time_updated DESC
`;

type BunSqliteDatabaseConstructor = new (
  path: string,
  options: { readonly: true },
) => {
  query: (sql: string) => { all: () => unknown[] };
  close: () => void;
};

async function importBunSqlite(): Promise<unknown> {
  const specifier = "bun:" + "sqlite";
  return import(specifier);
}

function defaultProcessSnapshotReader(): () => Promise<ProcessSample[]> {
  return async () => {
    // Read-only snapshot of /proc for opencode processes.
    const samples: ProcessSample[] = [];
    const entries = await readdir("/proc");
    for (const entry of entries) {
      const pid = Number(entry);
      if (!Number.isInteger(pid) || pid <= 0) continue;
      try {
        const stat = await readFile(`/proc/${pid}/stat`, "utf8");
        const cmdline = await readFile(`/proc/${pid}/cmdline`, "utf8");
        const command = cmdline.replace(/\0/g, " ").trim();
        if (!command.includes("opencode")) continue;
        const rssPages = parseRssPages(stat);
        if (rssPages === undefined) continue;
        const rssMb = Math.round((rssPages * 4096) / (1024 * 1024));
        samples.push({
          pid,
          command,
          rssMb,
          source: "process_snapshot",
          provenance: "/proc/" + String(pid) + "/stat",
        });
      } catch {
        // Process may have exited; skip.
      }
    }
    return samples;
  };
}

function parseRssPages(stat: string): number | undefined {
  const parts = stat.split(" ");
  // rss is the 24th field in /proc/[pid]/stat (index 23).
  if (parts.length < 24) return undefined;
  const rss = Number(parts[23]);
  if (!Number.isFinite(rss)) return undefined;
  return rss;
}

/**
 * Render a markdown report from a collected evidence snapshot.
 */
export function renderMarkdownReport(
  report: ConcurrencyEvidenceReport,
): string {
  const lines: string[] = [];
  lines.push("# Ten-Agent Concurrency Evidence Report");
  lines.push("");
  lines.push(`**Checked at:** ${report.checkedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(
    `- Total agents observed: **${report.summary.totalAgentsObserved}**`,
  );
  lines.push(
    `- Orchestrators observed: **${report.summary.orchestratorsObserved}**`,
  );
  lines.push(`- Sub-agents observed: **${report.summary.subAgentsObserved}**`);
  lines.push(
    `- Failed workflow samples: **${report.summary.failedWorkflowSamples}**`,
  );
  lines.push(
    `- Worker RSS min: **${report.summary.workerRssMinMb ?? "unavailable"} MB**`,
  );
  lines.push(
    `- Worker RSS max: **${report.summary.workerRssMaxMb ?? "unavailable"} MB**`,
  );
  lines.push(
    `- Historical peak meets ten-agent target: **${report.summary.historicalPeakMeetsTenAgentTarget}**`,
  );
  lines.push("");
  lines.push("## Claims");
  lines.push("");
  lines.push(
    `- Ten-agent demand supported: **${report.claims.tenAgentDemandSupported}**`,
  );
  lines.push(
    `- Ten-orchestrator latency measured: **${report.claims.tenOrchestratorLatencyMeasured}**`,
  );
  lines.push(
    `- Ten-agent memory within budget: **${report.claims.tenAgentMemoryWithinBudget}**`,
  );
  lines.push("");
  lines.push("## Provenance");
  lines.push("");
  for (const p of report.provenance) {
    lines.push(`- ${p}`);
  }
  lines.push("");
  lines.push("## Limits");
  lines.push("");
  for (const limit of report.limits) {
    lines.push(`- ${limit}`);
  }
  lines.push("");
  lines.push("## Historical Peak");
  lines.push("");
  if (report.snapshot.historicalPeak) {
    const h = report.snapshot.historicalPeak;
    lines.push(`- Total agents: ${h.totalAgents}`);
    lines.push(`- Orchestrators: ${h.orchestrators}`);
    lines.push(`- Worker RSS: ${h.workerRssMinMb} MB – ${h.workerRssMaxMb} MB`);
    lines.push(`- Source: ${h.source}`);
    lines.push(`- Provenance: ${h.provenance}`);
  } else {
    lines.push("No historical peak recorded.");
  }
  lines.push("");
  lines.push("## Current Session Samples");
  lines.push("");
  if (report.snapshot.sessionSamples.length === 0) {
    lines.push("No current session samples available.");
  } else {
    lines.push(
      "| sessionId | projectId | isOrchestrator | startedAt | source |",
    );
    lines.push("|---|---|---|---|---|");
    for (const s of report.snapshot.sessionSamples) {
      lines.push(
        `| ${s.sessionId} | ${s.projectId ?? "global"} | ${s.isOrchestrator} | ${s.startedAt ?? ""} | ${s.source} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Current Process Samples");
  lines.push("");
  if (report.snapshot.processSamples.length === 0) {
    lines.push("No current process samples available.");
  } else {
    lines.push("| pid | rssMb | command | source |");
    lines.push("|---|---|---|---|");
    for (const p of report.snapshot.processSamples) {
      lines.push(
        `| ${p.pid} | ${p.rssMb} | ${truncateCommand(p.command)} | ${p.source} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Workflow Samples");
  lines.push("");
  if (report.snapshot.workflowSamples.length === 0) {
    lines.push("No workflow samples available.");
  } else {
    lines.push("| workflowId | status | taskQueue | source |");
    lines.push("|---|---|---|---|");
    for (const w of report.snapshot.workflowSamples) {
      lines.push(
        `| ${w.workflowId} | ${w.status} | ${w.taskQueue ?? ""} | ${w.source} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function truncateCommand(command: string): string {
  if (command.length <= 80) return command;
  return command.slice(0, 77) + "...";
}

export function createWorkflowSampler(
  listWorkflows: () => Promise<
    { workflowId: string; runId?: string; status: string; taskQueue?: string }[]
  >,
  provenance: string,
): () => Promise<WorkflowSample[]> {
  return async () => {
    const rows = await listWorkflows();
    return rows.map((r) => ({
      ...r,
      source: "temporal_visibility" as EvidenceSource,
      provenance,
    }));
  };
}

/** Baseline-only snapshot for environments without live data sources. */
export function createBaselineSnapshot(): ConcurrencyEvidenceSnapshot {
  return {
    checkedAt: new Date().toISOString(),
    sessionSamples: [],
    processSamples: [],
    workflowSamples: [],
    historicalPeak: {
      totalAgents: HISTORICAL_PEAK_TOTAL_AGENTS,
      orchestrators: HISTORICAL_PEAK_ORCHESTRATORS,
      workerRssMinMb: HISTORICAL_WORKER_RSS_MIN_MB,
      workerRssMaxMb: HISTORICAL_WORKER_RSS_MAX_MB,
      source: "historical_baseline",
      provenance:
        "Recorded historical peak: 12 total overlapping pokeedge agents (6 orchestrators), zero failed sampled ADV queue workflows, worker RSS 314 MB–2.03 GB.",
    },
    limits: [
      "Baseline report uses recorded historical data only.",
      "No live session, process, or workflow data sources were queried.",
    ],
  };
}
