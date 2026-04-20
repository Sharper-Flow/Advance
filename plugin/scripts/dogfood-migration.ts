#!/usr/bin/env bun
/**
 * @deprecated Transitional dogfood runner. Deleted by D3b at Phase D.
 *
 * A7b — Real 18-project dogfood.
 *
 * Runs the real bootstrap path (tryInitStore + in-process worker + eager
 * migration sweep) against this machine's ~/.local/share/opencode/plugins/
 * advance/*\/ directory, polls the migration workflow with a 5-minute hard
 * ceiling, queries every resulting ProjectWorkflow's migration_ledger, and
 * writes a JSON report to docs/temporal-migration-dogfood.md.
 *
 * Success criterion: every discovered project has
 *   `MigrationLedgerEntry { status: "done" }` in its projectWorkflow state,
 * OR has `{ status: "failed", detail }` with a clear remediation path.
 *
 * Usage:
 *   PATH="$HOME/.temporalio/bin:$PATH" bun plugin/scripts/dogfood-migration.ts
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildProjectWorkflowId,
  createTemporalClientBundle,
} from "../src/temporal/client";
import { createInProcessWorker } from "../src/temporal/in-process-worker";
import { projectMigrationLedgerQuery } from "../src/temporal/messages";
import {
  discoverBootstrapProjectPaths,
  runBootstrapMigrationSweep,
  type BootstrapMigrationStatus,
} from "../src/plugin-init";
import type { WorkflowClientLike } from "../src/temporal/migrate-runner";
import {
  ensureTemporalRuntime,
  probeTemporalClientRuntime,
} from "../src/temporal/runtime-manager";
import { getExternalRoot, getProjectId } from "../src/utils/project-id";

const DEADLINE_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 10_000;

interface PerProjectReport {
  projectId: string;
  workflowStarted: boolean;
  ledger: unknown[] | null;
  status: "done" | "failed" | "pending" | "missing";
  detail?: string;
}

interface DogfoodReport {
  startedAt: string;
  completedAt: string;
  deadlineMs: number;
  sweepOutcome: BootstrapMigrationStatus["status"];
  sweepRunId?: string;
  projectCount: number;
  doneCount: number;
  failedCount: number;
  pendingCount: number;
  perProject: PerProjectReport[];
}

async function main(): Promise<number> {
  const probe = probeTemporalClientRuntime();
  if (!probe.supported) {
    console.error(`[dogfood] ENVIRONMENTAL: ${probe.reason}`);
    return 2;
  }

  const projectId = await getProjectId(process.cwd());
  if (!projectId) {
    console.error("[dogfood] FAIL no projectId for cwd");
    return 1;
  }
  const externalRoot = getExternalRoot(projectId);
  const advanceRoot = dirname(externalRoot);
  const startedAt = new Date().toISOString();

  console.log(`[dogfood] advanceRoot=${advanceRoot}`);
  console.log(`[dogfood] controlProjectId=${projectId}`);

  const runtime = await ensureTemporalRuntime(projectId);
  console.log(
    `[dogfood] runtime address=${runtime.address} startedRuntime=${runtime.startedRuntime}`,
  );

  const allProjectPaths = await discoverBootstrapProjectPaths([advanceRoot]);
  console.log(`[dogfood] discovered ${allProjectPaths.length} project paths`);

  const worker = await createInProcessWorker({
    address: runtime.address,
    namespace: runtime.namespace,
    queues: [`advance-${projectId}`],
  });
  console.log(
    `[dogfood] in-process worker polling initial queues=${worker.queues.join(",")}`,
  );

  const bundle = await createTemporalClientBundle({
    ...process.env,
    ADV_TEMPORAL_ADDRESS: runtime.address,
    ADV_TEMPORAL_NAMESPACE: runtime.namespace,
  });

  const sweepResult = await runBootstrapMigrationSweep({
    projectId,
    externalRoot,
    client: bundle.client as unknown as { workflow: WorkflowClientLike },
    timeoutMs: DEADLINE_MS,
    worker,
  });
  console.log(
    `[dogfood] sweep outcome=${sweepResult.status} totalProjects=${sweepResult.totalProjects} runId=${sweepResult.runId ?? "n/a"}`,
  );
  console.log(`[dogfood] worker queues now=${worker.queues.join(",")}`);

  // Poll the per-project migration_ledger every POLL_INTERVAL_MS until
  // every project reports a terminal status, or DEADLINE_MS fires.
  const pollDeadline = Date.now() + DEADLINE_MS;
  const perProject = new Map<string, PerProjectReport>();
  for (const projectPath of allProjectPaths) {
    const basename = projectPath.split("/").pop() ?? projectPath;
    perProject.set(basename, {
      projectId: basename,
      workflowStarted: false,
      ledger: null,
      status: "pending",
    });
  }

  async function refreshLedger(): Promise<void> {
    for (const [basename, entry] of perProject) {
      if (entry.status === "done" || entry.status === "failed") continue;
      try {
        const handle = bundle.client.workflow.getHandle(
          buildProjectWorkflowId(basename),
        );
        const ledger = (await handle.query(
          projectMigrationLedgerQuery,
        )) as Array<{ status: string; detail?: string }>;
        entry.workflowStarted = true;
        entry.ledger = ledger;
        const projectImport = ledger.find(
          (e) => (e as { key?: string }).key === "project-import",
        );
        if (projectImport) {
          if (projectImport.status === "done") {
            entry.status = "done";
          } else if (projectImport.status === "failed") {
            entry.status = "failed";
            entry.detail = projectImport.detail;
          }
        }
      } catch (err) {
        entry.workflowStarted = false;
        const message = err instanceof Error ? err.message : String(err);
        if (/workflow not found/i.test(message)) {
          entry.status = "missing";
        } else {
          entry.status = "failed";
          entry.detail = message;
        }
      }
    }
  }

  while (Date.now() < pollDeadline) {
    await refreshLedger();
    const snapshot = [...perProject.values()];
    const done = snapshot.filter((p) => p.status === "done").length;
    const failed = snapshot.filter((p) => p.status === "failed").length;
    const pending = snapshot.length - done - failed;
    console.log(
      `[dogfood] progress done=${done} failed=${failed} pending=${pending} / ${snapshot.length}`,
    );
    if (pending === 0) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const perProjectArray = [...perProject.values()];
  const doneCount = perProjectArray.filter((p) => p.status === "done").length;
  const failedCount = perProjectArray.filter(
    (p) => p.status === "failed",
  ).length;
  const pendingCount =
    perProjectArray.length - doneCount - failedCount;
  const report: DogfoodReport = {
    startedAt,
    completedAt: new Date().toISOString(),
    deadlineMs: DEADLINE_MS,
    sweepOutcome: sweepResult.status,
    sweepRunId: sweepResult.runId,
    projectCount: perProjectArray.length,
    doneCount,
    failedCount,
    pendingCount,
    perProject: perProjectArray,
  };

  const reportPath = join(
    dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "docs",
    "temporal-migration-dogfood.md",
  );
  const markdown = [
    "# Temporal Migration Dogfood Report",
    "",
    "> @deprecated Transitional artifact. Deleted by D3b at Phase D cutover.",
    "",
    `Generated: ${report.completedAt}`,
    "",
    `- Sweep outcome: **${report.sweepOutcome}** (runId \`${report.sweepRunId ?? "n/a"}\`)`,
    `- Projects: ${report.projectCount}`,
    `- Done: ${report.doneCount}`,
    `- Failed: ${report.failedCount}`,
    `- Pending (deadline hit): ${report.pendingCount}`,
    "",
    "## Per-project ledger",
    "",
    "```json",
    JSON.stringify(report, null, 2),
    "```",
  ].join("\n");
  await writeFile(reportPath, markdown);

  try {
    await worker.shutdown();
  } catch {
    /* best-effort */
  }
  try {
    await bundle.connection.close();
  } catch {
    /* best-effort */
  }

  console.log(
    `[dogfood] report written=${reportPath} done=${doneCount}/${perProjectArray.length} failed=${failedCount} pending=${pendingCount}`,
  );
  if (failedCount > 0 || pendingCount > 0) {
    console.log(
      `[dogfood] PARTIAL: ${pendingCount} pending, ${failedCount} failed — see report + docs/temporal-recovery.md for remediation.`,
    );
    return failedCount === 0 ? 0 : 1;
  }
  console.log(
    `[dogfood] PASS all ${doneCount} projects show migration_ledger status=done`,
  );
  return 0;
}

try {
  const code = await main();
  process.exit(code);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /Executable not found in \$PATH|temporal runtime.*did not become reachable/i.test(
      message,
    )
  ) {
    console.error(`[dogfood] ENVIRONMENTAL: ${message}`);
    process.exit(2);
  }
  console.error(`[dogfood] FAIL ${message}`);
  process.exit(1);
}
