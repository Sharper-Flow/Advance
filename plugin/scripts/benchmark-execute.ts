/**
 * Benchmark execution orchestrator (B4).
 *
 * This script runs the full benchmark matrix and captures datasets.
 * It is designed to be run manually against a real Temporal server:
 *
 *   npx tsx plugin/scripts/benchmark-execute.ts
 *
 * Environment:
 *   ADV_TEMPORAL_ADDRESS — Temporal server (default: localhost:7233)
 *   ADV_DISABLE_TEMPORAL — MUST NOT be set
 *   ADV_ALLOW_DEGRADED_FALLBACK — MUST NOT be set for Temporal runs
 *
 * Output:
 *   temp/bench/<run-id>/samples.jsonl
 *   temp/bench/<run-id>/summary.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  runColdStart,
  runWarmInteractive,
  runRepeatedCommand,
  createBoundOpAdapter,
  createBenchmarkFixture,
  computeStats,
  type BenchmarkOp,
  type BenchmarkMode,
  type BenchmarkSample,
  type BenchmarkRecord,
} from "./benchmark-temporal";

const OPS: BenchmarkOp[] = [
  "adv_status",
  "adv_change_list",
  "adv_change_show",
  "adv_task_list",
  "adv_task_show",
  "adv_wisdom_add",
];

const MODES: BenchmarkMode[] = ["cold-start", "warm-interactive", "repeated-command"];

function sampleCount(op: BenchmarkOp): number {
  return op === "adv_status" || op === "adv_change_list" ? 30 : 20;
}

async function main() {
  const runId = `run-${Date.now()}`;
  const outputDir = join(process.cwd(), "temp", "bench", runId);
  await mkdir(outputDir, { recursive: true });

  console.error(`[BENCH-EXEC] Run ID: ${runId}`);
  console.error(`[BENCH-EXEC] Output: ${outputDir}`);

  // Check env
  if (process.env.ADV_DISABLE_TEMPORAL || process.env.ADV_ALLOW_DEGRADED_FALLBACK) {
    console.error("[BENCH-EXEC] Error: bypass flags must not be set for Temporal benchmarking");
    process.exit(1);
  }

  // Create stress fixture
  console.error("[BENCH-EXEC] Creating stress fixture (50 changes × 30 tasks)...");
  const fixtureRoot = join(outputDir, "fixture");
  const fixture = await createBenchmarkFixture({
    externalRoot: fixtureRoot,
    activeChanges: 50,
    tasksPerChange: 30,
    wisdomPerChange: 5,
  });
  console.error(`[BENCH-EXEC] Fixture: ${fixture.changeIds.length} changes`);

  const allSamples: BenchmarkSample[] = [];
  const records: BenchmarkRecord[] = [];

  // Use generated fixture IDs instead of hardcoded ones
  const fixtureChangeId = fixture.changeIds[0];
  if (!fixtureChangeId) {
    throw new Error("Benchmark fixture produced no change IDs");
  }
  const fixtureTaskId = `tk-bench-0-0`;

  // Main benchmark matrix
  for (const op of OPS) {
    for (const mode of MODES) {
      const n = sampleCount(op);
      console.error(`[BENCH-EXEC] ${mode} / ${op} (n=${n})`);

      const adapter = createBoundOpAdapter(op, fixtureRoot, {
        changeId: fixtureChangeId,
        taskId: fixtureTaskId,
      });

      let samples: BenchmarkSample[];
      const startedAt = new Date().toISOString();

      try {
        switch (mode) {
          case "cold-start":
            samples = await runColdStart(op, n, adapter);
            break;
          case "warm-interactive":
            samples = await runWarmInteractive(op, n, 750, adapter);
            break;
          case "repeated-command":
            samples = await runRepeatedCommand(op, n, adapter);
            break;
        }
      } catch (err) {
        console.error(`[BENCH-EXEC] FAILED ${mode}/${op}:`, err);
        samples = [];
      }

      const finishedAt = new Date().toISOString();
      const durations = samples.map((s) => s.duration_ns);
      const stats = computeStats(durations);

      const record: BenchmarkRecord = {
        op,
        mode,
        run_id: runId,
        ...stats,
        samples: samples.length,
        started_at: startedAt,
        finished_at: finishedAt,
        contamination: "clean",
        env: {
          ADV_DISABLE_TEMPORAL: process.env.ADV_DISABLE_TEMPORAL,
          ADV_ALLOW_DEGRADED_FALLBACK: process.env.ADV_ALLOW_DEGRADED_FALLBACK,
          ADV_TEMPORAL_ADDRESS: process.env.ADV_TEMPORAL_ADDRESS,
        },
        temporal_health: null,
        retry_telemetry: null,
      };

      records.push(record);
      allSamples.push(...samples);
    }
  }

  // Stress run: adv_status + adv_change_list with 50-change fixture
  console.error("[BENCH-EXEC] Stress run: repeated-command with 50-change fixture");
  for (const op of ["adv_status", "adv_change_list"] as BenchmarkOp[]) {
    const adapter = createBoundOpAdapter(op, fixtureRoot);
    const startedAt = new Date().toISOString();
    const samples = await runRepeatedCommand(op, 30, adapter);
    const finishedAt = new Date().toISOString();
    const durations = samples.map((s) => s.duration_ns);
    const stats = computeStats(durations);

    records.push({
      op,
      mode: "repeated-command",
      run_id: `${runId}-stress`,
      ...stats,
      samples: samples.length,
      started_at: startedAt,
      finished_at: finishedAt,
      contamination: "clean",
      env: {
        ADV_DISABLE_TEMPORAL: process.env.ADV_DISABLE_TEMPORAL,
        ADV_ALLOW_DEGRADED_FALLBACK: process.env.ADV_ALLOW_DEGRADED_FALLBACK,
        ADV_TEMPORAL_ADDRESS: process.env.ADV_TEMPORAL_ADDRESS,
      },
      temporal_health: null,
      retry_telemetry: null,
    });
    allSamples.push(...samples);
  }

  // Write outputs
  const samplesPath = join(outputDir, "samples.jsonl");
  const lines = allSamples.map((s) => JSON.stringify(s)).join("\n");
  await writeFile(samplesPath, lines + "\n", "utf-8");

  const summaryPath = join(outputDir, "summary.json");
  await writeFile(summaryPath, JSON.stringify({ runId, records }, null, 2), "utf-8");

  console.error(`[BENCH-EXEC] Wrote ${allSamples.length} samples to ${samplesPath}`);
  console.error(`[BENCH-EXEC] Wrote summary to ${summaryPath}`);
  console.error("[BENCH-EXEC] Done.");
}

main().catch((err) => {
  console.error("[BENCH-EXEC] Fatal:", err);
  process.exit(1);
});
