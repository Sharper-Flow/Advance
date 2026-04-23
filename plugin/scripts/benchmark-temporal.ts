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
import { dirname, join } from "node:path";

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
/* Contamination tagging (A2 placeholder — will be replaced by real   */
/* implementation when A2 completes)                                  */
/* ------------------------------------------------------------------ */

export function classifyContaminationPlaceholder(): ContaminationTag {
  // A2 will replace this with real logic consulting:
  // - getTemporalRetryTelemetry()
  // - getTemporalHealth()
  // - per-op fallback counters
  return "clean";
}

/* ------------------------------------------------------------------ */
/* Runners (A3 placeholder — will be replaced by real implementation   */
/* when A3 completes)                                                 */
/* ------------------------------------------------------------------ */

export async function runColdStart(
  _op: BenchmarkOp,
  _n: number,
): Promise<BenchmarkSample[]> {
  // A3 will implement child-process-per-sample isolation
  throw new Error("runColdStart not yet implemented — complete A3 first");
}

export async function runWarmInteractive(
  _op: BenchmarkOp,
  _n: number,
  _gapMs: number,
): Promise<BenchmarkSample[]> {
  // A3 will implement in-process sampling with configurable gap
  throw new Error("runWarmInteractive not yet implemented — complete A3 first");
}

export async function runRepeatedCommand(
  _op: BenchmarkOp,
  _n: number,
): Promise<BenchmarkSample[]> {
  // A3 will implement back-to-back in-process sampling
  throw new Error("runRepeatedCommand not yet implemented — complete A3 first");
}

/* ------------------------------------------------------------------ */
/* Single-shot execution (used by cold-start child processes)         */
/* ------------------------------------------------------------------ */

async function runSingleShot(op: BenchmarkOp): Promise<BenchmarkSample> {
  // B1-B3 will provide real op adapters; this is the integration point
  const runId = `single-${Date.now()}`;
  const startedAt = new Date().toISOString();

  // Placeholder: just measure a no-op until B1 provides real adapters
  const { duration_ns } = await time("noop", async () => {
    // Real implementation will call op adapters here
    return Promise.resolve();
  });

  const finishedAt = new Date().toISOString();

  return {
    op,
    mode: "cold-start",
    run_id: runId,
    sample_index: 0,
    duration_ns,
    contamination: classifyContaminationPlaceholder(),
    started_at: startedAt,
    finished_at: finishedAt,
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

  // Single-shot mode (used by cold-start child processes)
  if (args.singleShot && args.op) {
    const sample = await runSingleShot(args.op);
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

  let benchmarkSamples: BenchmarkSample[];
  switch (mode) {
    case "cold-start":
      benchmarkSamples = await runColdStart(op, samples);
      break;
    case "warm-interactive":
      benchmarkSamples = await runWarmInteractive(op, samples, gapMs);
      break;
    case "repeated-command":
      benchmarkSamples = await runRepeatedCommand(op, samples);
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
    const fs = await import("node:fs/promises");
    await fs.mkdir(args.outputDir, { recursive: true });
    const samplesPath = join(args.outputDir, `${runId}.jsonl`);
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
