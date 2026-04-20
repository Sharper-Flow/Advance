/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { projectWorkflow } from "../../workflows";
import {
  addAgendaItemUpdate,
  addProjectWisdomUpdate,
  projectAgendaQuery,
  projectBootstrapQuery,
  projectMigrationLedgerQuery,
  projectStateQuery,
  projectWisdomQuery,
  recordMigrationEntryUpdate,
  updateAgendaItemUpdate,
} from "../../messages";
import { buildProjectTaskQueue, buildProjectWorkflowId } from "../../client";
import { createIntegrationHarness } from "./_helpers";

export const COVERED_PROJECT_MESSAGE_NAMES = [
  "adv.project.bootstrap",
  "adv.project.state",
  "adv.project.agenda",
  "adv.project.wisdom",
  "adv.project.migrationLedger",
  "adv.project.addAgendaItem",
  "adv.project.updateAgendaItem",
  "adv.project.addWisdom",
  "adv.project.recordMigrationEntry",
] as const;

describe("projectWorkflow integration", () => {
  const projectId = "validate-temporal-project";
  const taskQueue = buildProjectTaskQueue(projectId);
  let env: Awaited<ReturnType<typeof createIntegrationHarness>>["env"];
  let worker: Awaited<ReturnType<typeof createIntegrationHarness>>["worker"];
  let runPromise: Promise<void> | undefined;

  beforeAll(async () => {
    ({ env, worker } = await createIntegrationHarness(taskQueue));
    runPromise = worker.run();
  });

  afterAll(async () => {
    if (worker) {
      worker.shutdown();
      await runPromise?.catch(() => undefined);
    }
    if (env) {
      await env.teardown();
    }
  });

  it("exercises every project query/update handler end-to-end", async () => {
    const handle = await env.client.workflow.start(projectWorkflow, {
      workflowId: buildProjectWorkflowId(projectId),
      taskQueue,
      args: [
        {
          projectId,
          initializedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
    });

    const bootstrap = await handle.query(projectBootstrapQuery);
    expect(bootstrap.projectId).toBe(projectId);

    const agendaItem = await handle.executeUpdate(addAgendaItemUpdate, {
      args: [{ title: "agenda item" }],
    });
    expect(agendaItem.title).toBe("agenda item");

    await handle.executeUpdate(updateAgendaItemUpdate, {
      args: [agendaItem.id, { status: "active", completion_notes: "running" }],
    });

    const wisdom = await handle.executeUpdate(addProjectWisdomUpdate, {
      args: [{ type: "pattern", content: "wisdom" }],
    });
    expect(wisdom.content).toBe("wisdom");

    await handle.executeUpdate(recordMigrationEntryUpdate, {
      args: [
        {
          key: "project-import",
          source: "json",
          status: "done",
          recordedAt: "2026-04-20T00:01:00.000Z",
          detail: "ok",
        },
      ],
    });

    const state = await handle.query(projectStateQuery);
    const agenda = await handle.query(projectAgendaQuery, undefined);
    const listedWisdom = await handle.query(projectWisdomQuery, undefined);
    const ledger = await handle.query(projectMigrationLedgerQuery);

    expect(state.agenda).toHaveLength(1);
    expect(agenda[0]?.status).toBe("active");
    expect(listedWisdom).toHaveLength(1);
    expect(ledger).toHaveLength(1);

    await handle.terminate("integration complete");
  }, 15_000);
});
