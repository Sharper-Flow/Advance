/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changeWorkflow } from "../../workflows";
import {
  addTaskUpdate,
  addChangeWisdomUpdate,
  cancelTaskUpdate,
  changeBootstrapQuery,
  changeReadyQuery,
  changeStateQuery,
  changeTaskQuery,
  changeTasksQuery,
  closeChangeUpdate,
  completeGateUpdate,
  recordTaskEvidenceUpdate,
  reclassifyTaskTddUpdate,
  reopenFromGateUpdate,
  setTaskPhaseUpdate,
  updateArtifactMetadataUpdate,
  updateTaskUpdate,
} from "../../messages";
import { buildChangeWorkflowId, buildProjectTaskQueue } from "../../client";
import { createIntegrationHarness } from "./_helpers";

export const COVERED_CHANGE_MESSAGE_NAMES = [
  "adv.change.bootstrap",
  "adv.change.state",
  "adv.change.tasks",
  "adv.change.ready",
  "adv.change.task",
  "adv.change.addTask",
  "adv.change.updateTask",
  "adv.change.recordTaskEvidence",
  "adv.change.setTaskPhase",
  "adv.change.cancelTask",
  "adv.change.reclassifyTaskTdd",
  "adv.change.completeGate",
  "adv.change.reopenFromGate",
  "adv.change.addWisdom",
  "adv.change.updateArtifactMetadata",
  "adv.change.closeChange",
] as const;

describe("changeWorkflow integration", () => {
  const projectId = "validate-temporal";
  const changeId = "chg-integration";
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

  it("exercises every change query/update handler end-to-end", async () => {
    const handle = await env.client.workflow.start(changeWorkflow, {
      workflowId: buildChangeWorkflowId(projectId, changeId),
      taskQueue,
      args: [
        {
          projectId,
          changeId,
          title: "Integration Change",
          initializedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
    });

    const bootstrap = await handle.query(changeBootstrapQuery);
    expect(bootstrap.changeId).toBe(changeId);

    const state1 = await handle.query(changeStateQuery);
    expect(state1.title).toBe("Integration Change");

    const task = await handle.executeUpdate(addTaskUpdate, {
      args: [{ title: "first task", metadata: { owner: "integration" } }],
    });
    expect(task.title).toBe("first task");

    const listed = await handle.query(changeTasksQuery, undefined, undefined);
    expect(listed).toHaveLength(1);

    const single = await handle.query(changeTaskQuery, task.id);
    expect(single?.id).toBe(task.id);

    const ready = await handle.query(changeReadyQuery);
    expect(ready.ready.some((t) => t.id === task.id)).toBe(true);

    await handle.executeUpdate(updateTaskUpdate, {
      args: [task.id, { status: "in_progress", notes: "started" }],
    });
    await handle.executeUpdate(recordTaskEvidenceUpdate, {
      args: [
        task.id,
        "red",
        {
          test_file: "x.test.ts",
          command: "pnpm test",
          output_snippet: "failed",
          exit_code: 1,
          recorded_at: "2026-04-20T00:01:00.000Z",
        },
      ],
    });
    await handle.executeUpdate(setTaskPhaseUpdate, {
      args: [task.id, "red"],
    });
    await handle.executeUpdate(cancelTaskUpdate, {
      args: [
        task.id,
        {
          reason: "cleanup",
          approved_by_user: true,
          approved_at: "2026-04-20T00:01:30.000Z",
          approval_evidence: "approved",
        },
      ],
    });
    await handle.executeUpdate(reclassifyTaskTddUpdate, {
      args: [
        task.id,
        {
          from_intent: "inline",
          to_intent: "separate_verification",
          reason: "test",
          approved_by: "user",
          approved_at: "2026-04-20T00:02:00.000Z",
          approval_evidence: "ok",
        },
      ],
    });
    await handle.executeUpdate(completeGateUpdate, {
      args: ["proposal", "note", "agent"],
    });
    await handle.executeUpdate(reopenFromGateUpdate, {
      args: ["proposal", "scope changed", "delta", "evidence"],
    });
    await handle.executeUpdate(addChangeWisdomUpdate, {
      args: ["pattern", "wisdom-entry", task.id],
    });
    await handle.executeUpdate(updateArtifactMetadataUpdate, {
      args: [
        "proposal",
        {
          path: "/tmp/proposal.md",
          updatedAt: "2026-04-20T00:03:00.000Z",
          contentHash: "abc123",
        },
      ],
    });
    await handle.executeUpdate(closeChangeUpdate, {
      args: [
        {
          reason: "superseded",
          approved_by_user: true,
          approved_at: "2026-04-20T00:04:00.000Z",
          approval_evidence: "approved",
        },
      ],
    });

    const state2 = await handle.query(changeStateQuery);
    expect(state2.status).toBe("closed");
    expect(state2.wisdom).toHaveLength(1);
    expect(state2.artifacts.proposal?.path).toBe("/tmp/proposal.md");

    await handle.terminate("integration complete");
  }, 15_000);
});
