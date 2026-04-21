#!/usr/bin/env bun
/**
 * @deprecated Transitional operator helper. Deleted by D3b at Phase D.
 *
 * A7c/1 — List ADV migration + project workflows with run-id, status, and
 * history length. Useful when the bootstrap sweep hangs and you need to see
 * which workflows are live and whether they've made any history.
 *
 * Usage:
 *   PATH="$HOME/.temporalio/bin:$PATH" bun plugin/scripts/adv-migration-describe.ts
 */

import { createTemporalClientBundle } from "../src/temporal/client";
import { ensureTemporalRuntime } from "../src/temporal/runtime-manager";
import { getProjectId } from "../src/utils/project-id";

interface WorkflowSummary {
  workflowId: string;
  runId: string;
  type: string;
  status: string;
  historyLength: bigint | number;
  startTime?: string;
}

async function main(): Promise<number> {
  const projectId = await getProjectId(process.cwd());
  if (!projectId) {
    console.error("[describe] FAIL no projectId for cwd");
    return 1;
  }
  const runtime = await ensureTemporalRuntime(projectId);
  const bundle = await createTemporalClientBundle({
    ...process.env,
    ADV_TEMPORAL_ADDRESS: runtime.address,
    ADV_TEMPORAL_NAMESPACE: runtime.namespace,
  });

  try {
    const summaries: WorkflowSummary[] = [];
    const listIterable = bundle.client.workflow.list({
      query: "WorkflowType = 'migrateAllProjectsWorkflow' OR WorkflowType = 'projectWorkflow'",
    });
    for await (const exec of listIterable) {
      summaries.push({
        workflowId: exec.workflowId,
        runId: exec.runId,
        type: exec.type,
        status: exec.status.name,
        historyLength: exec.historyLength,
        startTime: exec.startTime?.toISOString?.(),
      });
    }

    summaries.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

    console.log(
      [
        "workflowId".padEnd(80),
        "type".padEnd(28),
        "status".padEnd(10),
        "history".padEnd(8),
        "startTime",
      ].join(" "),
    );
    for (const s of summaries) {
      console.log(
        [
          s.workflowId.padEnd(80),
          s.type.padEnd(28),
          s.status.padEnd(10),
          String(s.historyLength).padEnd(8),
          s.startTime ?? "?",
        ].join(" "),
      );
    }
    console.log(`\ntotal: ${summaries.length}`);
  } finally {
    await bundle.connection.close();
  }
  return 0;
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`[describe] FAIL ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
