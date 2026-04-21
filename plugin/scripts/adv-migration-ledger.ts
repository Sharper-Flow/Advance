#!/usr/bin/env bun
/**
 * @deprecated Transitional operator helper. Deleted by D3b at Phase D.
 *
 * A7c/2 — Query projectMigrationLedgerQuery on every live adv/project/*
 * workflow and print a per-project status table.
 *
 * Usage:
 *   PATH="$HOME/.temporalio/bin:$PATH" bun plugin/scripts/adv-migration-ledger.ts
 */

import {
  buildProjectWorkflowId,
  createTemporalClientBundle,
} from "../src/temporal/client";
import { projectMigrationLedgerQuery } from "../src/temporal/messages";
import { ensureTemporalRuntime } from "../src/temporal/runtime-manager";
import { getProjectId } from "../src/utils/project-id";

interface LedgerRow {
  projectId: string;
  status: string;
  detail?: string;
  key?: string;
  source?: string;
}

async function main(): Promise<number> {
  const projectId = await getProjectId(process.cwd());
  if (!projectId) {
    console.error("[ledger] FAIL no projectId for cwd");
    return 1;
  }
  const runtime = await ensureTemporalRuntime(projectId);
  const bundle = await createTemporalClientBundle({
    ...process.env,
    ADV_TEMPORAL_ADDRESS: runtime.address,
    ADV_TEMPORAL_NAMESPACE: runtime.namespace,
  });

  try {
    // Collect project IDs FIRST so the workflow.list iterator is fully
    // drained before we start firing queries — avoids a deadlock where
    // the list subscription and the query subscription share the same
    // gRPC channel.
    const projectIds: string[] = [];
    const listIterable = bundle.client.workflow.list({
      query: "WorkflowType = 'projectWorkflow' AND ExecutionStatus = 'Running'",
    });
    for await (const exec of listIterable) {
      const match = exec.workflowId.match(/^adv\/project\/(.+)$/);
      if (match) projectIds.push(match[1]);
    }

    const rows: LedgerRow[] = [];
    for (const pid of projectIds) {
      try {
        const handle = bundle.client.workflow.getHandle(
          buildProjectWorkflowId(pid),
        );
        const ledger = (await handle.query(
          projectMigrationLedgerQuery,
        )) as Array<{ status: string; detail?: string; key?: string; source?: string }>;
        const latest = ledger.at(-1);
        rows.push({
          projectId: pid,
          status: latest?.status ?? "empty",
          detail: latest?.detail,
          key: latest?.key,
          source: latest?.source,
        });
      } catch (err) {
        rows.push({
          projectId: pid,
          status: "query-failed",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    rows.sort((a, b) => a.projectId.localeCompare(b.projectId));
    console.log(
      [
        "projectId".padEnd(42),
        "status".padEnd(14),
        "key".padEnd(18),
        "source".padEnd(18),
        "detail",
      ].join(" "),
    );
    for (const r of rows) {
      console.log(
        [
          r.projectId.padEnd(42),
          (r.status ?? "").padEnd(14),
          (r.key ?? "").padEnd(18),
          (r.source ?? "").padEnd(18),
          r.detail ?? "",
        ].join(" "),
      );
    }
    console.log(`\ntotal: ${rows.length}`);
  } finally {
    await bundle.connection.close();
  }
  return 0;
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`[ledger] FAIL ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
