/**
 * Replay-check harness: runs `Worker.runReplayHistory` against an exported
 * history file, mirroring `replay-determinism.test.ts`. Used to validate a
 * generated history before committing it as a fixture.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-replay-history.ts <history.json> <workflowId> [replayName]
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Worker } from "@temporalio/worker";

const workflowsPath = fileURLToPath(
  new URL("../src/temporal/workflows.ts", import.meta.url),
);

async function main(): Promise<void> {
  const [historyPath, workflowId, replayName] = process.argv.slice(2);
  if (!historyPath || !workflowId) {
    throw new Error(
      "Usage: check-replay-history.ts <history.json> <workflowId> [replayName]",
    );
  }
  const history = JSON.parse(await readFile(historyPath, "utf8")) as {
    events: Array<{ eventId: string; eventType: string }>;
  };
  console.log(
    `Replaying ${history.events.length} events for workflowId=${workflowId}`,
  );
  await Worker.runReplayHistory(
    {
      workflowsPath,
      replayName: replayName ?? "check-replay-history",
    },
    history,
    workflowId,
  );
  console.log("REPLAY_OK");
}

main().catch((err) => {
  console.error("REPLAY_FAILED", err);
  process.exit(1);
});
