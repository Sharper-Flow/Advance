/**
 * ⚠️ DEV-ONLY BENCHMARK HARNESS — NEVER IMPORT INTO SHIPPING CODE
 *
 * This script is a standalone Node/TSX executable for measuring Temporal
 * performance in the Advance plugin. It is NOT part of the tsup bundle
 * and MUST NOT be imported by any file under src/.
 *
 * Usage:
 *   npx tsx plugin/scripts/benchmark-temporal.ts --mode=cold-start --op=adv_status
 *   npx tsx plugin/scripts/benchmark-temporal.ts --mode=warm-interactive --op=adv_change_list --samples=30
 *   npx tsx plugin/scripts/benchmark-temporal.ts --mode=repeated-command --op=adv_task_show --samples=20
 *   npx tsx plugin/scripts/benchmark-temporal.ts --op=adv_status --single-shot
 *
 * Environment:
 *   ADV_TEMPORAL_ADDRESS     — Temporal server address (default: localhost:7233)
 *   ADV_DISABLE_TEMPORAL     — MUST NOT be set (harness refuses to run)
 *   ADV_ALLOW_DEGRADED_FALLBACK — MUST NOT be set (harness refuses to run)
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type BenchmarkMode = "cold-start" | "warm-interactive" | "repeated-command";
export type BenchmarkOp =
  | "adv_status"
  | "adv_change_list"
  | "adv_change_show"
  | "adv_task_list"
  | "adv_task_show"
  | "adv_wisdom_add";

export type ContaminationTag =
  | "clean"
  | "fallback"
  | "server-unreachable"
  | "retry-exhausted"
  | "unknown";

export interface BenchmarkSample {
  op: BenchmarkOp;
  mode: BenchmarkMode;
  run_id: string;
  sample_index: number;
  duration_ns: number;
  contamination: ContaminationTag;
  started_at: string;
  finished_at: string;
}

export interface BenchmarkRecord {
  op: BenchmarkOp;
  mode: BenchmarkMode;
  run_id: string;
  p50_ns: number;
  p95_ns: number;
  max_ns: number;
  samples: number;
  started_at: string;
  finished_at: string;
  contamination: ContaminationTag;
  env: {
    ADV_DISABLE_TEMPORAL: string | undefined;
    ADV_ALLOW_DEGRADED_FALLBACK: string | undefined;
    ADV_TEMPORAL_ADDRESS: string | undefined;
  };
  temporal_health: {
    server_alive: boolean;
    worker_alive: boolean;
    worker_process_alive: boolean;
    registered_queues: string[];
    last_op_at: string | null;
    last_error: string | null;
  } | null;
  retry_telemetry: {
    lastOpAt: string | null;
    lastError: string | null;
  } | null;
}

/* ------------------------------------------------------------------ */
/* CLI parsing                                                        */
/* ------------------------------------------------------------------ */

function parseArgs(argv: string[]): {
  mode?: BenchmarkMode;
  op?: BenchmarkOp;
  samples?: number;
  gapMs?: number;
  singleShot?: boolean;
  outputDir?: string;
} {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const m = arg.match(/^--(\w+)(?:=(.*))?$/);
    if (m) {
      args[m[1]] = m[2] ?? "true";
    }
  }

  const mode = args.mode as BenchmarkMode | undefined;
  const op = args.op as BenchmarkOp | undefined;
  const samples = args.samples ? parseInt(args.samples, 10) : undefined;
  const gapMs = args.gapMs ? parseInt(args.gapMs, 10) : undefined;
  const singleShot = args.singleShot === "true";
  const outputDir = args.outputDir;

  return { mode, op, samples, gapMs, singleShot, outputDir };
}

/* ------------------------------------------------------------------ */
/* Env guards (D3)                                                    */
/* ------------------------------------------------------------------ */

export function checkEnvBypass(): { ok: true } | { ok: false; remediation: string } {
  const disable = process.env.ADV_DISABLE_TEMPORAL;
  const fallback = process.env.ADV_ALLOW_DEGRADED_FALLBACK;

  if (disable) {
    return {
      ok: false,
      remediation:
        "ADV_DISABLE_TEMPORAL is set. This harness measures the Temporal path only. " +
        "Unset it and ensure a Temporal server is reachable at ADV_TEMPORAL_ADDRESS.",
    };
  }

  if (fallback) {
    return {
      ok: false,
      remediation:
        "ADV_ALLOW_DEGRADED_FALLBACK is set. This would contaminate measurements with legacy-file fallback paths. " +
        "Unset it for Temporal-only benchmarking. For legacy-control baselines, use the dedicated --mode=legacy-control flag (not yet implemented).",
    };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Timing helper                                                      */
/* ------------------------------------------------------------------ */

export async function time<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; duration_ns: number }> {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const duration_ns = Number(end - start);
  return { result, duration_ns };
}

/* ------------------------------------------------------------------ */
/* Contamination tagging (A2)                                         */
/* ------------------------------------------------------------------ */

export interface ContaminationContext {
  health: TemporalHealth | null;
  retry: { lastOpAt: string | null; lastError: string | null } | null;
  opError: unknown | null;
  fallbackCount: number;
}

export function classifyContamination(ctx: ContaminationContext): ContaminationTag {
  // Priority 1: per-op fallback counter (explicit legacy path invocation)
  if (ctx.fallbackCount > 0) {
    return "fallback";
  }

  // Priority 2: operation threw — classify the error
  if (ctx.opError != null) {
    const errorText = String(
      ctx.opError instanceof Error ? ctx.opError.message : ctx.opError
    );
    // Retry-exhausted: we see an error but retry telemetry shows a recent success
    // (meaning retries were attempted and eventually succeeded or the error is post-retry)
    if (ctx.retry?.lastError != null && ctx.retry.lastOpAt != null) {
      return "retry-exhausted";
    }
    // Server-unreachable: connection-level failure
    if (/ECONNREFUSED|connection refused|unreachable|Unavailable/i.test(errorText)) {
      return "server-unreachable";
    }
    return "unknown";
  }

  // Priority 3: health probe says server is down
  if (ctx.health != null && !ctx.health.server_alive) {
    return "server-unreachable";
  }

  // Priority 4: retry telemetry shows unresolved error
  if (ctx.retry?.lastError != null && ctx.retry.lastOpAt == null) {
    return "retry-exhausted";
  }

  return "clean";
}

export function recordRun(
  run: BenchmarkSample,
  ctx: ContaminationContext,
): BenchmarkSample {
  return {
    ...run,
    contamination: classifyContamination(ctx),
  };
}

/* ------------------------------------------------------------------ */
/* Runners (A3)                                                       */
/* ------------------------------------------------------------------ */

export type OpAdapter = (op: BenchmarkOp) => Promise<unknown>;

export async function runColdStart(
  op: BenchmarkOp,
  n: number,
  adapter: OpAdapter,
): Promise<BenchmarkSample[]> {
  const samples: BenchmarkSample[] = [];
  const runId = `cold-${op}-${Date.now()}`;

  for (let i = 0; i < n; i++) {
    const startedAt = new Date().toISOString();

    // Spawn a fresh child process per sample so bundle/connection caches
    // cannot be reused. The child runs --single-shot and emits JSON.
    const child = spawn(process.execPath, [
      "--import",
      "tsx",
      __filename,
      `--op=${op}`,
      "--single-shot",
    ], {
      env: { ...process.env, BENCH_CHILD_RUN_ID: `${runId}-${i}` },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });

    const exitCode = await new Promise<number>((resolve) => {
      child.on("close", resolve);
    });

    const finishedAt = new Date().toISOString();

    if (exitCode !== 0) {
      samples.push({
        op,
        mode: "cold-start",
        run_id: runId,
        sample_index: i,
        duration_ns: 0,
        contamination: "unknown",
        started_at: startedAt,
        finished_at: finishedAt,
      });
      continue;
    }

    try {
      const parsed = JSON.parse(stdout.trim()) as BenchmarkSample;
      samples.push({
        ...parsed,
        run_id: runId,
        sample_index: i,
      });
    } catch {
      // Fallback: measure in-process if child output is malformed
      let duration_ns = 0;
      let opError: unknown = null;
      try {
        const timed = await time(op, () => adapter(op));
        duration_ns = timed.duration_ns;
      } catch (err) {
        opError = err;
      }
      samples.push({
        op,
        mode: "cold-start",
        run_id: runId,
        sample_index: i,
        duration_ns,
        contamination: classifyContamination({
          health: null,
          retry: null,
          opError,
          fallbackCount: 0,
        }),
        started_at: startedAt,
        finished_at: finishedAt,
      });
    }
  }

  return samples;
}

export async function runWarmInteractive(
  op: BenchmarkOp,
  n: number,
  gapMs: number,
  adapter: OpAdapter,
): Promise<BenchmarkSample[]> {
  const samples: BenchmarkSample[] = [];
  const runId = `warm-${op}-${Date.now()}`;

  for (let i = 0; i < n; i++) {
    const startedAt = new Date().toISOString();
    let duration_ns = 0;
    let opError: unknown = null;
    try {
      const timed = await time(op, () => adapter(op));
      duration_ns = timed.duration_ns;
    } catch (err) {
      opError = err;
    }
    const finishedAt = new Date().toISOString();

    samples.push({
      op,
      mode: "warm-interactive",
      run_id: runId,
      sample_index: i,
      duration_ns,
      contamination: classifyContamination({
        health: null,
        retry: null,
        opError,
        fallbackCount: 0,
      }),
      started_at: startedAt,
      finished_at: finishedAt,
    });

    if (i < n - 1) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }

  return samples;
}

export async function runRepeatedCommand(
  op: BenchmarkOp,
  n: number,
  adapter: OpAdapter,
): Promise<BenchmarkSample[]> {
  const samples: BenchmarkSample[] = [];
  const runId = `repeat-${op}-${Date.now()}`;

  for (let i = 0; i < n; i++) {
    const startedAt = new Date().toISOString();
    let duration_ns = 0;
    let opError: unknown = null;
    try {
      const timed = await time(op, () => adapter(op));
      duration_ns = timed.duration_ns;
    } catch (err) {
      opError = err;
    }
    const finishedAt = new Date().toISOString();

    samples.push({
      op,
      mode: "repeated-command",
      run_id: runId,
      sample_index: i,
      duration_ns,
      contamination: classifyContamination({
        health: null,
        retry: null,
        opError,
        fallbackCount: 0,
      }),
      started_at: startedAt,
      finished_at: finishedAt,
    });
  }

  return samples;
}

/* ------------------------------------------------------------------ */
/* Single-shot execution (used by cold-start child processes)         */
/* ------------------------------------------------------------------ */

async function runSingleShot(op: BenchmarkOp, adapter: OpAdapter): Promise<BenchmarkSample> {
  const runId = `single-${Date.now()}`;
  const startedAt = new Date().toISOString();

  let duration_ns = 0;
  let opError: unknown = null;
  try {
    const timed = await time(op, () => adapter(op));
    duration_ns = timed.duration_ns;
  } catch (err) {
    opError = err;
  }

  const finishedAt = new Date().toISOString();

  return {
    op,
    mode: "cold-start",
    run_id: runId,
    sample_index: 0,
    duration_ns,
    contamination: classifyContamination({
      health: null,
      retry: null,
      opError,
      fallbackCount: 0,
    }),
    started_at: startedAt,
    finished_at: finishedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Fixture generator (B3)                                             */
/* ------------------------------------------------------------------ */

export interface BenchmarkFixtureOptions {
  externalRoot: string;
  activeChanges?: number;
  tasksPerChange?: number;
  wisdomPerChange?: number;
}

export interface BenchmarkFixture {
  externalRoot: string;
  changeIds: string[];
  taskCounts: Map<string, number>;
  wisdomCounts: Map<string, number>;
}

/**
 * Seed scratch external state with N active changes, each with M tasks
 * and W wisdom entries. Used for O(N) fan-out stress testing.
 */
export async function createBenchmarkFixture(
  options: BenchmarkFixtureOptions,
): Promise<BenchmarkFixture> {
  const {
    externalRoot,
    activeChanges = 50,
    tasksPerChange = 30,
    wisdomPerChange = 5,
  } = options;

  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  // Ensure external root exists
  await fs.mkdir(externalRoot, { recursive: true });

  const changeIds: string[] = [];
  const taskCounts = new Map<string, number>();
  const wisdomCounts = new Map<string, number>();

  for (let i = 0; i < activeChanges; i++) {
    const changeId = `bench-change-${i.toString().padStart(3, "0")}`;
    changeIds.push(changeId);

    const changeDir = path.join(externalRoot, "changes", changeId);
    await fs.mkdir(changeDir, { recursive: true });

    // Write minimal change.json
    const changeData = {
      id: changeId,
      title: `Benchmark change ${i}`,
      status: "active",
      created_at: new Date().toISOString(),
      tasks: [] as Array<{
        id: string;
        title: string;
        status: string;
        type: string;
        section: string;
        priority: number;
        created_at: string;
      }>,
      wisdom: [] as Array<{
        id: string;
        type: string;
        content: string;
        created_at: string;
      }>,
      deltas: {},
      gates: {
        proposal: { status: "done" },
        discovery: { status: "done" },
        design: { status: "done" },
        planning: { status: "done" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      },
    };

    // Add tasks
    for (let t = 0; t < tasksPerChange; t++) {
      changeData.tasks.push({
        id: `tk-bench-${i}-${t}`,
        title: `Task ${t} for change ${i}`,
        status: t % 3 === 0 ? "done" : "pending",
        type: "code",
        section: "Phase B",
        priority: t,
        created_at: new Date().toISOString(),
      });
    }
    taskCounts.set(changeId, tasksPerChange);

    // Add wisdom entries
    for (let w = 0; w < wisdomPerChange; w++) {
      changeData.wisdom.push({
        id: `wisdom-${i}-${w}`,
        type: ["pattern", "success", "failure", "gotcha", "convention"][w % 5],
        content: `Wisdom entry ${w} for change ${i}`,
        created_at: new Date().toISOString(),
      });
    }
    wisdomCounts.set(changeId, wisdomPerChange);

    await fs.writeFile(
      path.join(changeDir, "change.json"),
      JSON.stringify(changeData, null, 2),
      "utf-8",
    );

    // Write minimal proposal.md
    await fs.writeFile(
      path.join(changeDir, "proposal.md"),
      `# Benchmark Proposal ${i}\n\nStress-test fixture.\n`,
      "utf-8",
    );
  }

  return {
    externalRoot,
    changeIds,
    taskCounts,
    wisdomCounts,
  };
}

/* ------------------------------------------------------------------ */
/* Promote-pipeline segmented adapter (B2)                            */
/* ------------------------------------------------------------------ */

export interface PromoteSegmentTiming {
  seg1_change_level_ns: number;   // store.wisdom.add
  seg2_project_level_ns: number;  // getProjectWorkflowHandle + update + query + writeJsonlAtomic
  end_to_end_ns: number;
}

export interface PromotePipelineResult {
  entry: unknown;
  promoted: unknown | undefined;
  timings: PromoteSegmentTiming;
  warning: string | undefined;
}

/**
 * Dedicated adapter for `adv_wisdom_add { promote: true }` that records
 * TWO segment timings per sample, isolating the dual Temporal connections.
 */
export async function runPromotePipeline(
  store: Store,
  changeId: string,
  type: "pattern" | "success" | "failure" | "gotcha" | "convention",
  content: string,
  sourceTask?: string,
): Promise<PromotePipelineResult> {
  // Segment 1: change-level Temporal update+query via store
  const seg1Start = process.hrtime.bigint();
  const entry = await store.wisdom.add(changeId, type, content, sourceTask);
  const seg1End = process.hrtime.bigint();
  const seg1_ns = Number(seg1End - seg1Start);

  // Segment 2: project-level pipeline
  const seg2Start = process.hrtime.bigint();
  let promoted: unknown | undefined;
  let warning: string | undefined;

  try {
    const { getBoundedProjectWorkflowAccess } = await import("../src/tools/project-workflow-helper.ts");
    const { addProjectWisdomUpdate, projectWisdomQuery } = await import("../src/temporal/messages.ts");
    const { writeJsonlAtomic } = await import("../src/storage/jsonl-atomic-writer.ts");

    const temporal = await getBoundedProjectWorkflowAccess({
      projectDir: store.paths.root,
      mutablePath: store.paths.wisdom,
    });

    if (temporal.mode === "workflow-backed") {
      promoted = await temporal.handle.executeUpdate(addProjectWisdomUpdate, {
        args: [{
          type: (entry as { type: string }).type,
          content: (entry as { content: string }).content,
          sourceChange: changeId,
          sourceTask: (entry as { source_task?: string }).source_task,
        }],
      });

      const latest = await temporal.handle.query(projectWisdomQuery, undefined) as Array<{
        id: string;
        type: string;
        content: string;
        sourceChange?: string;
        sourceTask?: string;
        promotedAt: string;
        tags?: string[];
        invalidatedBy?: string;
      }>;

      const mapped = latest.map((e) => ({
        id: e.id,
        type: e.type,
        content: e.content,
        source_change: e.sourceChange,
        source_task: e.sourceTask,
        promoted_at: e.promotedAt,
        tags: e.tags,
        invalidated_by: e.invalidatedBy,
      }));

      await writeJsonlAtomic(store.paths.wisdom, mapped);
      await temporal.bundle.connection.close();
    }
  } catch (err) {
    warning = err instanceof Error ? err.message : String(err);
  }

  const seg2End = process.hrtime.bigint();
  const seg2_ns = Number(seg2End - seg2Start);

  return {
    entry,
    promoted,
    timings: {
      seg1_change_level_ns: seg1_ns,
      seg2_project_level_ns: seg2_ns,
      end_to_end_ns: seg1_ns + seg2_ns,
    },
    warning,
  };
}

/* ------------------------------------------------------------------ */
/* Op Adapters (B1)                                                   */
/* ------------------------------------------------------------------ */

export interface OpAdapterContext {
  store: Store;
  changeId?: string;
  taskId?: string;
}

export type OpAdapterFn = (ctx: OpAdapterContext) => Promise<unknown>;

export const opAdapters: Record<BenchmarkOp, OpAdapterFn> = {
  adv_status: async (ctx) => {
    const { statusTools } = await import("../src/tools/status.ts");
    return statusTools.adv_status.execute({}, ctx.store);
  },

  adv_change_list: async (ctx) => {
    const { changeTools } = await import("../src/tools/change.ts");
    return changeTools.adv_change_list.execute({}, ctx.store);
  },

  adv_change_show: async (ctx) => {
    const { changeTools } = await import("../src/tools/change.ts");
    const changeId = ctx.changeId ?? "investigateTemporalPerformance";
    return changeTools.adv_change_show.execute({ changeId }, ctx.store);
  },

  adv_task_list: async (ctx) => {
    const { taskTools } = await import("../src/tools/task.ts");
    const changeId = ctx.changeId ?? "investigateTemporalPerformance";
    return taskTools.adv_task_list.execute({ changeId }, ctx.store);
  },

  adv_task_show: async (ctx) => {
    const { taskTools } = await import("../src/tools/task.ts");
    const taskId = ctx.taskId ?? "tk-tRAmTAZZ";
    return taskTools.adv_task_show.execute({ taskId }, ctx.store);
  },

  adv_wisdom_add: async (ctx) => {
    const { wisdomTools } = await import("../src/tools/wisdom.ts");
    const changeId = ctx.changeId ?? "investigateTemporalPerformance";
    return wisdomTools.adv_wisdom_add.execute(
      {
        changeId,
        type: "pattern",
        content: "benchmark test wisdom entry",
      },
      ctx.store,
    );
  },
};

/**
 * Build a scratch store bound to a temp external root.
 * This is the integration point for real Temporal measurement.
 */
export async function createBenchmarkStore(
  externalRoot: string,
): Promise<Store> {
  const { createStore } = await import("../src/storage/store.ts");
  // Use the current working directory as the project root
  // but redirect external state to the scratch root
  return createStore(process.cwd(), { externalRoot });
}

/**
 * Create an adapter that binds a specific op to a scratch store.
 * Returns an OpAdapter compatible with the runner signatures.
 */
export function createBoundOpAdapter(
  op: BenchmarkOp,
  externalRoot: string,
  fixture?: { changeId?: string; taskId?: string },
): OpAdapter {
  return async (_opName: BenchmarkOp) => {
    const store = await createBenchmarkStore(externalRoot);
    try {
      const ctx: OpAdapterContext = {
        store,
        changeId: fixture?.changeId,
        taskId: fixture?.taskId,
      };
      return await opAdapters[op](ctx);
    } finally {
      store.close();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Stats                                                              */
/* ------------------------------------------------------------------ */

export function computeStats(samples: number[]): { p50_ns: number; p95_ns: number; max_ns: number } {
  if (samples.length === 0) {
    return { p50_ns: 0, p95_ns: 0, max_ns: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? sorted[sorted.length - 1];
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
  const max = sorted[sorted.length - 1];
  return { p50_ns: p50, p95_ns: p95, max_ns: max };
}

/* ------------------------------------------------------------------ */
/* Health / telemetry collection                                      */
/* ------------------------------------------------------------------ */

async function collectHealthAndTelemetry(): Promise<{
  temporal_health: BenchmarkRecord["temporal_health"];
  retry_telemetry: BenchmarkRecord["retry_telemetry"];
}> {
  // These imports are dynamic so the scaffold can be parsed even when
  // the src/ modules aren't resolvable (e.g. in a bare Node context).
  try {
    const { getTemporalHealth } = await import("../src/temporal/health-probe.ts");
    const { getTemporalRetryTelemetry } = await import("../src/temporal/retry-wrapper.ts");

    const [health, retry] = await Promise.all([
      getTemporalHealth().catch(() => null),
      Promise.resolve(getTemporalRetryTelemetry()),
    ]);

    return {
      temporal_health: health,
      retry_telemetry: retry,
    };
  } catch {
    return {
      temporal_health: null,
      retry_telemetry: null,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Path validation                                                    */
/* ------------------------------------------------------------------ */

export function validateOutputDir(input?: string): { ok: true; path: string } | { ok: false; reason: string } {
  if (!input) {
    return { ok: true, path: join(process.cwd(), "temp", "bench") };
  }

  const { resolve } = await import("node:path");
  const resolved = resolve(process.cwd(), input);
  const cwd = process.cwd();
  const tempRoot = join(cwd, "temp");

  // Reject paths that escape cwd or temp root
  if (!resolved.startsWith(cwd) && !resolved.startsWith(tempRoot)) {
    return { ok: false, reason: `outputDir must be under cwd or temp/ root. Got: ${input}` };
  }

  // Reject obvious traversal
  const normalized = resolved.replace(/\\/g, "/");
  if (normalized.includes("/../") || normalized.endsWith("/..")) {
    return { ok: false, reason: `outputDir contains path traversal. Got: ${input}` };
  }

  return { ok: true, path: resolved };
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Env guard
  const envCheck = checkEnvBypass();
  if (!envCheck.ok) {
    console.error("[BENCH] Environment check failed:");
    console.error(envCheck.remediation);
    process.exit(1);
  }

  // Validate and resolve outputDir
  const dirValidation = validateOutputDir(args.outputDir);
  if (!dirValidation.ok) {
    console.error("[BENCH] Invalid outputDir:", dirValidation.reason);
    process.exit(1);
  }
  const outputDir = dirValidation.path;

  // Single-shot mode (used by cold-start child processes)
  if (args.singleShot && args.op) {
    const fs = await import("node:fs/promises");
    const scratchRoot = join(outputDir, "scratch");
    await fs.mkdir(scratchRoot, { recursive: true });
    const boundAdapter = createBoundOpAdapter(args.op, scratchRoot);
    const sample = await runSingleShot(args.op, boundAdapter);
    console.log(JSON.stringify(sample));
    return;
  }

  // Full benchmark mode
  if (!args.mode || !args.op) {
    console.error("Usage:");
    console.error("  --mode=cold-start|warm-interactive|repeated-command");
    console.error("  --op=adv_status|adv_change_list|adv_change_show|adv_task_list|adv_task_show|adv_wisdom_add");
    console.error("  [--samples=N] [--gapMs=N] [--outputDir=path]");
    console.error("Or for single-shot (cold-start child process):");
    console.error("  --op=NAME --single-shot");
    process.exit(1);
  }

  const mode = args.mode;
  const op = args.op;
  const samples = args.samples ?? (op === "adv_status" || op === "adv_change_list" ? 30 : 20);
  const gapMs = args.gapMs ?? 750;
  const runId = `${mode}-${op}-${Date.now()}`;

  console.error(`[BENCH] Starting run ${runId}`);
  console.error(`[BENCH] Mode: ${mode}, Op: ${op}, Samples: ${samples}`);

  const startedAt = new Date().toISOString();

  // Ensure scratch directory exists BEFORE building adapter
  const fs = await import("node:fs/promises");
  const scratchRoot = join(outputDir, "scratch");
  await fs.mkdir(scratchRoot, { recursive: true });

  // Build a bound adapter for the requested op
  const boundAdapter = createBoundOpAdapter(op, scratchRoot);

  let benchmarkSamples: BenchmarkSample[];
  switch (mode) {
    case "cold-start":
      benchmarkSamples = await runColdStart(op, samples, boundAdapter);
      break;
    case "warm-interactive":
      benchmarkSamples = await runWarmInteractive(op, samples, gapMs, boundAdapter);
      break;
    case "repeated-command":
      benchmarkSamples = await runRepeatedCommand(op, samples, boundAdapter);
      break;
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }

  const finishedAt = new Date().toISOString();

  // Aggregate stats
  const durations = benchmarkSamples.map((s) => s.duration_ns);
  const stats = computeStats(durations);

  // Collect health/telemetry
  const { temporal_health, retry_telemetry } = await collectHealthAndTelemetry();

  // Build record
  const record: BenchmarkRecord = {
    op,
    mode,
    run_id: runId,
    ...stats,
    samples: benchmarkSamples.length,
    started_at: startedAt,
    finished_at: finishedAt,
    contamination: "clean", // A2 will refine per-sample aggregation
    env: {
      ADV_DISABLE_TEMPORAL: process.env.ADV_DISABLE_TEMPORAL,
      ADV_ALLOW_DEGRADED_FALLBACK: process.env.ADV_ALLOW_DEGRADED_FALLBACK,
      ADV_TEMPORAL_ADDRESS: process.env.ADV_TEMPORAL_ADDRESS,
    },
    temporal_health,
    retry_telemetry,
  };

  console.log(JSON.stringify(record, null, 2));

  // Also emit samples as JSONL if outputDir requested
  if (args.outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    const samplesPath = join(outputDir, `${runId}.jsonl`);
    const lines = benchmarkSamples.map((s) => JSON.stringify(s)).join("\n");
    await fs.writeFile(samplesPath, lines + "\n", "utf-8");
    console.error(`[BENCH] Wrote ${benchmarkSamples.length} samples to ${samplesPath}`);
  }

  console.error(`[BENCH] Run ${runId} complete.`);
}

// Only auto-run main when this file is the entry point (not when imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[BENCH] Fatal error:", err);
    process.exit(1);
  });
}
