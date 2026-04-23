import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createStore } from "../src/storage/store";
import { statusTools } from "../src/tools/status";
import { addAgendaItem, loadAgenda } from "../src/storage/agenda";
import {
  addProjectWisdom,
  listProjectWisdom,
} from "../src/storage/project-wisdom";
import { runTimedSamples } from "../src/perf/latency";
import { renderStorageComparisonReport } from "../src/perf/storage-report";

interface Args {
  repoRoot: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    repoRoot: resolve(process.cwd(), ".."),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--repo-root" && next) args.repoRoot = resolve(next);
    if (arg === "--out" && next) args.out = resolve(next);
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tempRoot = join(
    process.env.TMPDIR || "/tmp",
    `adv-storage-bench-${Date.now()}`,
  );
  await mkdir(tempRoot, { recursive: true });

  const store = await createStore(args.repoRoot);
  await store.init();

  try {
    const sqliteCandidate = await runTimedSamples(
      "adv_status",
      async () => {
        await statusTools.adv_status.execute({}, store);
      },
      5,
      1,
    );

    const agendaDir = join(tempRoot, "agenda");
    await mkdir(agendaDir, { recursive: true });
    const agendaAdd = await runTimedSamples(
      "agenda.add",
      async () => {
        await addAgendaItem(agendaDir, `task-${Date.now()}`);
      },
      20,
      5,
    );
    const agendaLoad = await runTimedSamples(
      "agenda.load",
      async () => {
        await loadAgenda(agendaDir);
      },
      10,
      2,
    );

    const wisdomDir = join(tempRoot, "wisdom");
    await mkdir(wisdomDir, { recursive: true });
    const wisdomAdd = await runTimedSamples(
      "wisdom.add",
      async () => {
        await addProjectWisdom(wisdomDir, {
          type: "pattern",
          content: `wisdom-${Date.now()}`,
        });
      },
      20,
      5,
    );
    const wisdomLoad = await runTimedSamples(
      "wisdom.load",
      async () => {
        await listProjectWisdom(wisdomDir);
      },
      10,
      2,
    );

    const report = renderStorageComparisonReport({
      title: "ADV Local Storage Comparison",
      metadata: {
        repo_root: args.repoRoot,
        temporal_disabled: process.env.ADV_DISABLE_TEMPORAL === "1",
      },
      benchmarks: [
        {
          candidate: "sqlite_first_candidate",
          operation: sqliteCandidate.label,
          p50_ms: sqliteCandidate.stats.p50_ms,
          p95_ms: sqliteCandidate.stats.p95_ms,
          notes: "current local ADV path representative hot-path tool",
        },
        {
          candidate: "jsonl",
          operation: agendaAdd.label,
          p50_ms: agendaAdd.stats.p50_ms,
          p95_ms: agendaAdd.stats.p95_ms,
          notes: "agenda append",
        },
        {
          candidate: "jsonl",
          operation: agendaLoad.label,
          p50_ms: agendaLoad.stats.p50_ms,
          p95_ms: agendaLoad.stats.p95_ms,
          notes: "agenda load",
        },
        {
          candidate: "jsonl",
          operation: wisdomAdd.label,
          p50_ms: wisdomAdd.stats.p50_ms,
          p95_ms: wisdomAdd.stats.p95_ms,
          notes: "wisdom append",
        },
        {
          candidate: "jsonl",
          operation: wisdomLoad.label,
          p50_ms: wisdomLoad.stats.p50_ms,
          p95_ms: wisdomLoad.stats.p95_ms,
          notes: "wisdom load",
        },
      ],
      tradeoffs: [
        {
          candidate: "sqlite_first_candidate",
          strengths: [
            "query richness",
            "WAL durability",
            "same-host shared state",
          ],
          risks: [
            "checkpoint/lock tuning",
            "doctor path can still be expensive",
          ],
        },
        {
          candidate: "jsonl",
          strengths: [
            "append-only audit trail",
            "fast append/load at current scale",
          ],
          risks: [
            "compaction",
            "replay/snapshot drift",
            "projection complexity for rich queries",
          ],
        },
      ],
    });

    if (args.out) {
      await mkdir(dirname(args.out), { recursive: true });
      await writeFile(args.out, report, "utf-8");
    }

    process.stdout.write(report);
  } finally {
    store.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
