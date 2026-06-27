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

async function buildStore(
  mode: BenchMode,
  repoRoot: string,
  externalRoot: string,
): Promise<Store> {
  if (mode === "temporal") {
    throw temporalModeFailure();
  }
  // Documented disk substitute: same Store interface as the Temporal
  // backend without requiring a live worker. Surfaces under test
  // (adv_status views, adv_change_list, adv_change_show, adv_run_test)
  // exercise the same code paths the agent hits in production.
  return createDiskStore(repoRoot, { externalRoot });
}

async function ensureBenchmarkFixture(
  store: Store,
  changeId: string,
): Promise<{ changeId: string; taskId: string; source: string }> {
  // Disk mode runs under an isolated XDG_DATA_HOME, so fixture creation cannot
  // mutate real ADV state. Ensure adv_change_show and adv_run_test measure real
  // non-error tool paths instead of silently skipping missing task evidence.
  try {
    const existing = await store.changes.get(changeId);
    if (existing.success && existing.data) {
      const tasks = await store.tasks.list(changeId);
      if (tasks.length > 0) {
        return { changeId, taskId: tasks[0].id, source: "existing" };
      }
      const task = await store.tasks.add(
        changeId,
        "Latency benchmark fixture",
        {
          type: "verification",
          metadata: { tdd_intent: "not_applicable" },
        },
      );
      return { changeId, taskId: task.id, source: "created_task" };
    }
  } catch {
    /* create an isolated fixture below */
  }

  const created = await store.changes.create("Add latency benchmark fixture", {
    artifacts: {
      proposal: "# Proposal\n\nSynthetic fixture for ADV latency benchmark.",
    },
  });
  const task = await store.tasks.add(
    created.changeId,
    "Latency benchmark fixture",
    {
      type: "verification",
      metadata: { tdd_intent: "not_applicable" },
    },
  );
  return {
    changeId: created.changeId,
    taskId: task.id,
    source: "created_change",
  };
}

function temporalModeFailure(): Error {
  return new Error(
    "[bench] --mode temporal requires a running Temporal worker and a real TemporalClientBundle. " +
      "Remediation: start `temporal server start-dev`, start the ADV worker, " +
      "then run an operator-owned wrapper that constructs createStore() with the live bundle. " +
      "No disk substitute was used.",
  );
}

async function maybeCreateDummyTask(
  store: Store,
  changeId: string,
): Promise<string | null> {
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

  const store = await buildStore(
    args.mode,
    args.repoRoot,
    join(tempBenchHome, "state"),
  );
  const initStartedAt = performance.now();
  await store.init();
  const initMs = performance.now() - initStartedAt;

  try {
    const fixture =
      args.mode === "disk"
        ? await ensureBenchmarkFixture(store, args.changeId)
        : {
            changeId: args.changeId,
            taskId: await maybeCreateDummyTask(store, args.changeId),
            source: "existing",
          };
    const taskId = fixture.taskId;
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
            { changeId: fixture.changeId },
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
            await store.tasks.list(fixture.changeId);
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
        requested_change_id: args.changeId,
        change_id_used: fixture.changeId,
        iterations: args.iterations,
        warmup: args.warmup,
        mode: args.mode,
        substitute: args.mode === "disk" ? "createDiskStore" : "createStore",
        fixture_source: fixture.source,
        task_id_used: taskId ?? "(no task — adv_run_test samples skipped)",
        runtime: `node ${process.version}`,
        platform: `${process.platform}/${process.arch}`,
        xdg_data_home_isolated: true,
        temporal_setup: args.mode === "disk" ? "not_required" : "live_required",
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
