/**
 * ADV latency benchmark (rq-advLatencyBench01, advance-meta v1.12).
 *
 * Default mode is a documented isolated substitute backed by the
 * Temporal-free `createDiskStore`, so the harness initializes under the
 * Temporal-only store contract without requiring a live Temporal worker.
 *
 * The disk substitute exercises the same tool surfaces that ADV agents
 * hit most often:
 *
 *   - `adv_status view:"summary"`                  (warm default read)
 *   - `adv_status view:"health"`                   (detailed view)
 *   - `adv_change_list`                            (default summary path)
 *   - `adv_change_show`                            (phase-start read)
 *   - `adv_run_test` (fast no-op + timed sample)   (TDD hot path)
 *
 * Tools that require a live Temporal worker (e.g. `adv_task_list`,
 * `adv_task_show`) are skipped in `--mode disk` because the disk store
 * does not expose a Temporal handle. They run when `--mode temporal` is
 * used with a real bundle.
 *
 * The substitute does NOT measure Temporal RTT — that requires a real
 * Temporal worker. When you need the authoritative number, run the same
 * harness with `--mode temporal` after starting `temporal server
 * start-dev`; the script will refuse to start without a real bundle so
 * results cannot be silently confused with the substitute path.
 *
 * Usage (from `plugin/` root):
 *   pnpm exec tsx scripts/bench-adv-latency.ts \
 *     --change-id <change-id> [--iterations 10] [--warmup 2] [--mode disk] \
 *     [--out reports/latency.md]
 *
 * Output: Markdown report on stdout (and optionally to `--out`).
 */
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { createDiskStore } from "../src/storage/store-disk";
import type { Store } from "../src/storage/store";
import { statusTools } from "../src/tools/status";
import { changeTools } from "../src/tools/change";
import { testTools } from "../src/tools/test";
import {
  renderLatencyReport,
  runTimedSamples,
  type LatencyMeasurement,
} from "../src/perf/latency";

type BenchMode = "disk" | "temporal";

interface Args {
  repoRoot: string;
  changeId: string;
  iterations: number;
  warmup: number;
  mode: BenchMode;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    repoRoot: resolve(process.cwd(), ".."),
    changeId: "reduceTemporalRoundTrip",
    iterations: 10,
    warmup: 2,
    mode: "disk",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--repo-root" && next) args.repoRoot = resolve(next);
    if (arg === "--change-id" && next) args.changeId = next;
    if (arg === "--iterations" && next) args.iterations = Number(next);
    if (arg === "--warmup" && next) args.warmup = Number(next);
    if (arg === "--out" && next) args.out = resolve(next);
    if (arg === "--mode" && next) {
      if (next !== "disk" && next !== "temporal") {
        throw new Error(`Unknown bench mode: ${next}; expected disk|temporal`);
      }
      args.mode = next;
    }
  }

  if (args.iterations <= 0) {
    throw new Error("--iterations must be > 0");
  }
  return args;
}

async function buildStore(mode: BenchMode, repoRoot: string): Promise<Store> {
  if (mode === "temporal") {
    throw new Error(
      "[bench] --mode temporal requires a running Temporal worker. " +
        "Start `temporal server start-dev`, then pipe a real " +
        "TemporalClientBundle into createStore() yourself. The bench " +
        "intentionally refuses to fake a Temporal bundle so results are " +
        "never silently substituted.",
    );
  }
  // Documented disk substitute: same Store interface as the Temporal
  // backend without requiring a live worker. Surfaces under test
  // (adv_status views, adv_change_list, adv_change_show, adv_run_test)
  // exercise the same code paths the agent hits in production.
  return createDiskStore(repoRoot);
}

async function maybeCreateDummyTask(
  store: Store,
  changeId: string,
): Promise<string | null> {
  // Try to find an existing task so adv_run_test has a real task to
  // record against. Bench should not mutate ADV state; if no task is
  // available, fall back to a synthetic one that the disk store will
  // accept for read purposes only.
  try {
    const tasks = await store.tasks.list(changeId);
    if (tasks.length > 0) {
      return tasks[0].id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tempBenchHome = await mkdtemp(join(tmpdir(), "adv-bench-"));
  const originalXdg = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = tempBenchHome;

  const store = await buildStore(args.mode, args.repoRoot);
  const initStartedAt = performance.now();
  await store.init();
  const initMs = performance.now() - initStartedAt;

  try {
    const taskId = await maybeCreateDummyTask(store, args.changeId);
    const operations: LatencyMeasurement[] = [];

    operations.push({
      label: "store.init",
      stats: {
        count: 1,
        min_ms: initMs,
        p50_ms: initMs,
        p95_ms: initMs,
        max_ms: initMs,
        avg_ms: initMs,
      },
    });

    operations.push(
      await runTimedSamples(
        'adv_status view:"summary"',
        async () => {
          await statusTools.adv_status.execute({ view: "summary" }, store);
        },
        args.iterations,
        args.warmup,
      ),
    );

    operations.push(
      await runTimedSamples(
        'adv_status view:"health"',
        async () => {
          await statusTools.adv_status.execute({ view: "health" }, store);
        },
        args.iterations,
        args.warmup,
      ),
    );

    operations.push(
      await runTimedSamples(
        "adv_change_list",
        async () => {
          await changeTools.adv_change_list.execute({}, store);
        },
        args.iterations,
        args.warmup,
      ),
    );

    operations.push(
      await runTimedSamples(
        "adv_change_show",
        async () => {
          await changeTools.adv_change_show.execute(
            { changeId: args.changeId },
            store,
          );
        },
        args.iterations,
        args.warmup,
      ),
    );

    if (args.mode === "disk") {
      operations.push(
        await runTimedSamples(
          "store.tasks.list (disk)",
          async () => {
            await store.tasks.list(args.changeId);
          },
          args.iterations,
          args.warmup,
        ),
      );
    }

    if (taskId) {
      operations.push(
        await runTimedSamples(
          "adv_run_test echo (fast)",
          async () => {
            await testTools.adv_run_test.execute(
              {
                taskId,
                command: "echo bench",
              },
              store,
              args.repoRoot,
            );
          },
          args.iterations,
          args.warmup,
        ),
      );

      operations.push(
        await runTimedSamples(
          "adv_run_test true (no-op)",
          async () => {
            await testTools.adv_run_test.execute(
              {
                taskId,
                command: "true",
              },
              store,
              args.repoRoot,
            );
          },
          args.iterations,
          args.warmup,
        ),
      );
    }

    const report = renderLatencyReport({
      title: "ADV Latency Report",
      metadata: {
        repo_root: args.repoRoot,
        change_id: args.changeId,
        iterations: args.iterations,
        warmup: args.warmup,
        mode: args.mode,
        substitute: args.mode === "disk" ? "createDiskStore" : "createStore",
        task_id_used: taskId ?? "(no task — adv_run_test samples skipped)",
        adv_profile: process.env.ADV_PROFILE === "1",
      },
      operations,
    });

    if (args.out) {
      await mkdir(dirname(args.out), { recursive: true });
      await writeFile(args.out, report, "utf-8");
    }

    process.stdout.write(report);
  } finally {
    store.close();
    if (originalXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXdg;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
