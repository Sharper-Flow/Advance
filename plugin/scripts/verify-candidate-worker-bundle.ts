/**
 * verify-candidate-worker-bundle — replay committed histories against the
 * built workflow bundle (rq-workerEvolutionSafety01.1, AC7, D9).
 *
 * This script is intended to run after `pnpm run build:worker` so the candidate
 * worker bundle (`dist/temporal/workflows.js`) is the actual artifact that
 * would be deployed. It replays every committed history fixture under
 * `src/temporal/__tests__/replay/histories` and exits non-zero if any fixture
 * fails. A passing run proves that ordinary deployment of this candidate bundle
 * will not introduce TMPRL1100 nondeterminism for supported histories.
 *
 * Usage:
 *   pnpm run build:worker
 *   pnpm exec tsx scripts/verify-candidate-worker-bundle.ts
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyCommittedReplayFixtures } from "../src/migration/replay-verification";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const historiesDir = join(
  pluginRoot,
  "src",
  "temporal",
  "__tests__",
  "replay",
  "histories",
);
const candidateBundlePath = join(
  pluginRoot,
  "dist",
  "temporal",
  "workflows.js",
);

async function main(): Promise<void> {
  if (!existsSync(candidateBundlePath)) {
    console.error(
      `Candidate worker bundle not found: ${candidateBundlePath}`,
    );
    console.error("Run `pnpm run build:worker` before this script.");
    process.exit(2);
  }

  const report = await verifyCommittedReplayFixtures({
    historiesDir,
    workflowsPath: candidateBundlePath,
    replayNamePrefix: "candidate-worker-bundle",
  });

  console.log(JSON.stringify(report, null, 2));

  if (!report.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    "Candidate worker bundle replay verification failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
