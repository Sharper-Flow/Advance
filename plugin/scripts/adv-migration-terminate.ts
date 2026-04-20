#!/usr/bin/env bun
/**
 * @deprecated Transitional operator helper. Deleted by D3b at Phase D.
 *
 * A7c/3 — Terminate stale migrateAllProjectsWorkflow instances before
 * retrying the bootstrap sweep. Only affects adv/migration/* workflows;
 * adv/project/* workflows are never touched.
 *
 * Usage:
 *   PATH="$HOME/.temporalio/bin:$PATH" bun plugin/scripts/adv-migration-terminate.ts [--dry-run]
 */

import { createTemporalClientBundle } from "../src/temporal/client";
import { ensureTemporalRuntime } from "../src/temporal/runtime-manager";
import { getProjectId } from "../src/utils/project-id";

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  const projectId = await getProjectId(process.cwd());
  if (!projectId) {
    console.error("[terminate] FAIL no projectId for cwd");
    return 1;
  }
  const runtime = await ensureTemporalRuntime(projectId);
  const bundle = await createTemporalClientBundle({
    ...process.env,
    ADV_TEMPORAL_ADDRESS: runtime.address,
    ADV_TEMPORAL_NAMESPACE: runtime.namespace,
  });

  try {
    const listIterable = bundle.client.workflow.list({
      query:
        "WorkflowType = 'migrateAllProjectsWorkflow' AND ExecutionStatus = 'Running'",
    });
    let terminated = 0;
    let skipped = 0;
    for await (const exec of listIterable) {
      if (!exec.workflowId.startsWith("adv/migration/")) {
        skipped++;
        continue;
      }
      if (dryRun) {
        console.log(`[terminate] DRY-RUN would terminate ${exec.workflowId} runId=${exec.runId}`);
        terminated++;
        continue;
      }
      try {
        const handle = bundle.client.workflow.getHandle(
          exec.workflowId,
          exec.runId,
        );
        await handle.terminate("A7c: adv-migration-terminate manual cleanup");
        console.log(`[terminate] OK ${exec.workflowId}`);
        terminated++;
      } catch (err) {
        console.error(
          `[terminate] FAIL ${exec.workflowId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    console.log(
      `\n${dryRun ? "[DRY-RUN] " : ""}terminated=${terminated} skipped=${skipped}`,
    );
  } finally {
    await bundle.connection.close();
  }
  return 0;
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`[terminate] FAIL ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
