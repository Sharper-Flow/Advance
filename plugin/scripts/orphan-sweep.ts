#!/usr/bin/env -S node --enable-source-maps
/**
 * Orphan-sweep CLI.
 *
 * Usage:
 *   pnpm exec tsx scripts/orphan-sweep.ts            # sweep all projects under default state root
 *   pnpm exec tsx scripts/orphan-sweep.ts --dry-run  # describe-only, no reseed
 *   pnpm exec tsx scripts/orphan-sweep.ts --root <path>
 *
 * Default state root: $XDG_DATA_HOME/opencode/plugins/advance/
 *                  or ~/.local/share/opencode/plugins/advance/
 *
 * Connects to Temporal at $ADV_TEMPORAL_ADDRESS (default 127.0.0.1:7233)
 * and walks every project directory whose name matches a 40-char SHA.
 * Per project, every disk-only change is re-seeded into Temporal.
 *
 * Exit codes:
 *   0 — sweep completed successfully (totalFailed may be > 0; exit code
 *       reflects the sweep itself running, not per-change reseed errors)
 *   1 — sweep aborted before completion (could not connect, etc.)
 */

import { homedir } from "node:os";
import { join } from "node:path";

import {
  sweepAllProjects,
  formatSweepSummary,
  type SweepClient,
} from "../src/temporal/orphan-sweep";
import { initStsl, closeStsl } from "../src/temporal/service";

interface Args {
  stateRoot: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
  const args: Args = {
    stateRoot: join(dataHome, "opencode/plugins/advance"),
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root" && argv[i + 1]) {
      args.stateRoot = argv[i + 1];
      i += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`orphan-sweep — re-seed disk-only changes into Temporal

Usage:
  orphan-sweep [--root <path>] [--dry-run]

Options:
  --root <path>   ADV state root (default: $XDG_DATA_HOME/opencode/plugins/advance)
  --dry-run       Detect orphans only, do not reseed
  --help          Show this message

Environment:
  ADV_TEMPORAL_ADDRESS    Temporal frontend address (default 127.0.0.1:7233)
  ADV_TEMPORAL_NAMESPACE  Namespace to use (default 'default')
`);
      process.exit(0);
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.error(`[orphan-sweep] starting`);
  console.error(`[orphan-sweep]   state root: ${args.stateRoot}`);
  console.error(`[orphan-sweep]   dry run:    ${args.dryRun}`);

  const bundle = await initStsl({});
  let client: SweepClient = bundle.client as unknown as SweepClient;

  // In dry-run mode, intercept workflow.start so we can detect orphans
  // without actually re-seeding them. The describe()-based detection
  // path is unaffected.
  if (args.dryRun) {
    const realStart = bundle.client.workflow.start.bind(bundle.client.workflow);
    void realStart; // silence unused — we explicitly do not call it in dry-run
    client = {
      workflow: {
        start: async (_workflow, opts) => {
          console.error(
            `[orphan-sweep] DRY-RUN would reseed: ${opts.workflowId}`,
          );
          return { workflowId: opts.workflowId };
        },
        getHandle: bundle.client.workflow.getHandle.bind(
          bundle.client.workflow,
        ),
      },
    };
  }

  try {
    const result = await sweepAllProjects({
      stateRoot: args.stateRoot,
      client,
    });

    console.log(formatSweepSummary(result));

    // Always exit 0 when the sweep itself completed. Per-change
    // failures are reported in the summary but don't fail the run.
  } finally {
    await closeStsl();
  }
}

main().catch((err) => {
  console.error(
    `[orphan-sweep] FATAL: ${err instanceof Error ? err.stack : err}`,
  );
  process.exit(1);
});
