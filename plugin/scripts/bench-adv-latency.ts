import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createStore } from "../src/storage/store";
import { statusTools } from "../src/tools/status";
import { changeTools } from "../src/tools/change";
import { taskTools } from "../src/tools/task";
import {
  renderLatencyReport,
  runTimedSamples,
  type LatencyMeasurement,
} from "../src/perf/latency";

interface Args {
  repoRoot: string;
  changeId: string;
  iterations: number;
  warmup: number;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    repoRoot: resolve(process.cwd(), ".."),
    changeId: "reduceTemporalRoundTrip",
    iterations: 10,
    warmup: 2,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--repo-root" && next) args.repoRoot = resolve(next);
    if (arg === "--change-id" && next) args.changeId = next;
    if (arg === "--iterations" && next) args.iterations = Number(next);
    if (arg === "--warmup" && next) args.warmup = Number(next);
    if (arg === "--out" && next) args.out = resolve(next);
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const store = await createStore(args.repoRoot);
  const initStartedAt = performance.now();
  await store.init();
  const initMs = performance.now() - initStartedAt;

  try {
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
        "adv_status",
        async () => {
          await statusTools.adv_status.execute({}, store);
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
    operations.push(
      await runTimedSamples(
        "adv_task_list",
        async () => {
          await taskTools.adv_task_list.execute(
            { changeId: args.changeId },
            store,
          );
        },
        args.iterations,
        args.warmup,
      ),
    );

    const report = renderLatencyReport({
      title: "ADV Latency Report",
      metadata: {
        repo_root: args.repoRoot,
        change_id: args.changeId,
        iterations: args.iterations,
        warmup: args.warmup,
        temporal_disabled: process.env.ADV_DISABLE_TEMPORAL === "1",
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
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
