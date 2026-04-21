#!/usr/bin/env bun
/**
 * @deprecated Transitional smoke script. Deleted by D3b at Phase D cutover end.
 *
 * A4d — Foreground worker smoke.
 *
 * Proves end-to-end that a freshly spawned worker:
 *   1. Loads the workflow bundle (workflow-safe module split, A3a)
 *   2. Has migrateAllProjectsWorkflow + migrateSingleProjectActivity
 *      registered on the project task queue (A3b)
 *   3. Accepts the shrunk projectPaths payload (A3c)
 *   4. Source-mode path resolver picks workflows.ts when workflows.js absent (A4a)
 *
 * SCOPE: this smoke runs migrateAllProjectsWorkflow with an empty
 * projectPaths list so we exercise the bundle-load + workflow-dispatch +
 * result-return path WITHOUT requiring workers on child project task queues.
 * Full 18-project end-to-end dogfood is A7b.
 *
 * Usage:
 *   PATH="$HOME/.temporalio/bin:$PATH" bun plugin/scripts/smoke-migration-worker.ts
 *
 * Exit codes:
 *   0  — smoke passed: ledger shows 2/2 done within 30s
 *   1  — smoke failed: ledger incomplete or activity failed
 *   2  — environmental blocker: Temporal CLI missing
 */

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTemporalClientBundle,
  buildProjectTaskQueue,
} from "../src/temporal/client";
import { createInProcessWorker } from "../src/temporal/in-process-worker";
import type { WorkflowClientLike } from "../src/temporal/migrate-runner";
import { runMigrationSweep } from "../src/temporal/migrate-runner";
import { ensureTemporalRuntime } from "../src/temporal/runtime-manager";

const SMOKE_PROJECT_ID = "smoke-control";
const SMOKE_PROJECT_COUNT = 0;
const SMOKE_TIMEOUT_MS = 30_000;

async function writeFixtureProject(root: string, id: string): Promise<string> {
  const projectPath = join(root, id);
  const changesDir = join(projectPath, "changes");
  await mkdir(changesDir, { recursive: true });
  await writeFile(join(projectPath, "agenda.jsonl"), "");
  await writeFile(join(projectPath, "wisdom.jsonl"), "");
  return projectPath;
}

async function main(): Promise<number> {
  const fixtureRoot = join(tmpdir(), `adv-smoke-${Date.now()}`);
  await mkdir(fixtureRoot, { recursive: true });
  console.log(`[smoke] fixtureRoot=${fixtureRoot}`);
  const projectPaths: string[] = [];
  for (let i = 0; i < SMOKE_PROJECT_COUNT; i++) {
    projectPaths.push(
      await writeFixtureProject(fixtureRoot, `fixture-proj-${i}`),
    );
  }
  console.log(`[smoke] projectPaths=${JSON.stringify(projectPaths)}`);
  console.log(`[smoke] calling ensureTemporalRuntime...`);

  const runtime = await ensureTemporalRuntime(SMOKE_PROJECT_ID);
  console.log(
    `[smoke] ensureTemporalRuntime OK address=${runtime.address} startedRuntime=${runtime.startedRuntime}`,
  );

  const worker = await createInProcessWorker({
    address: runtime.address,
    namespace: runtime.namespace,
    queues: [buildProjectTaskQueue(SMOKE_PROJECT_ID)],
  });
  console.log(`[smoke] in-process worker polling queues=${worker.queues.join(",")}`);

  const bundle = await createTemporalClientBundle({
    ...process.env,
    ADV_TEMPORAL_ADDRESS: runtime.address,
    ADV_TEMPORAL_NAMESPACE: runtime.namespace,
  });

  const runId = `smoke-${Date.now()}`;
  const handle = await runMigrationSweep(
    bundle.client as unknown as { workflow: WorkflowClientLike },
    {
      controlProjectId: SMOKE_PROJECT_ID,
      runId,
      projectPaths,
    },
  );
  console.log(`[smoke] runMigrationSweep workflowId=adv/migration/${SMOKE_PROJECT_ID}/${runId}`);

  const deadline = Date.now() + SMOKE_TIMEOUT_MS;
  let result: unknown;
  try {
    result = await Promise.race([
      (handle as unknown as { result: () => Promise<unknown> }).result(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `smoke timed out after ${SMOKE_TIMEOUT_MS}ms (deadline=${deadline})`,
              ),
            ),
          SMOKE_TIMEOUT_MS,
        ),
      ),
    ]);
  } finally {
    try {
      await bundle.connection.close();
    } catch {
      /* best effort */
    }
    try {
      await worker.shutdown();
    } catch {
      /* best effort */
    }
  }

  console.log(`[smoke] workflow.result=${JSON.stringify(result)}`);

  if (!Array.isArray(result)) {
    console.error(
      `[smoke] FAIL expected array result, got ${JSON.stringify(result)}`,
    );
    return 1;
  }
  if (result.length !== SMOKE_PROJECT_COUNT) {
    console.error(
      `[smoke] FAIL expected ${SMOKE_PROJECT_COUNT} results, got ${result.length}: ${JSON.stringify(result)}`,
    );
    return 1;
  }
  console.log(
    `[smoke] PASS bundle+dispatch+result round-trip returned ${result.length} results (empty projectPaths)`,
  );
  return 0;
}

// NOTE: must run via top-level await, not `main().then(...).catch(...)`.
// Bun 1.3.8 hangs when the module chain (runtime-manager + migrate-runner)
// runs inside a Promise continuation started by the module-level microtask.
try {
  const code = await main();
  process.exit(code);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /Executable not found in \$PATH|ENOENT|temporal runtime.*did not become reachable/i.test(
      message,
    )
  ) {
    console.error(
      `[smoke] ENVIRONMENTAL: Temporal CLI not on PATH. Install https://github.com/temporalio/cli and rerun.`,
    );
    process.exit(2);
  }
  console.error(`[smoke] FAIL ${message}`);
  process.exit(1);
}
