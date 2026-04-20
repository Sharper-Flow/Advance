/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the cutover decision is made.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { createStore } from "../../../storage/store";
import { buildChangeWorkflowId, buildProjectTaskQueue } from "../../client";
import type { TemporalClientBundle } from "../../client";
import { changeWorkflow } from "../../workflows";
import {
  addTaskUpdate,
  completeGateUpdate,
  updateTaskUpdate,
} from "../../messages";
import {
  compareLatencyBudgets,
  computePercentiles,
  discardWarmup,
} from "../../latency-bench";
import { describe, expect, it } from "vitest";

const OUTPUT = process.env.ADV_VALIDATION_OUTPUT;

describe("latency collector", () => {
  it("measures the 3 gated ops and emits JSON evidence", async () => {
    const env = await TestWorkflowEnvironment.createTimeSkipping();
    const projectId = "validate-temporal-latency";
    const taskQueue = buildProjectTaskQueue(projectId);
    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: fileURLToPath(
        new URL("../../workflows.ts", import.meta.url),
      ),
      activities: {},
    });
    let runPromise: Promise<void> | undefined;

    try {
      runPromise = worker.run();
      const temporalBundle: TemporalClientBundle = {
        address: String(env.address),
        namespace: String(env.namespace),
        connection: env.connection,
        client: env.client,
      };
      const legacyStore = await createStore(
        fileURLToPath(new URL("../../../../..", import.meta.url)),
      );
      const temporalStore = await createStore(
        fileURLToPath(new URL("../../../../..", import.meta.url)),
        {
          temporalBundle,
          projectIdOverride: projectId,
        },
      );

      const createdLegacy = await legacyStore.changes.create("latency-legacy");
      const temporalHandle = await env.client.workflow.start(changeWorkflow, {
        workflowId: buildChangeWorkflowId(projectId, "latency-temporal"),
        taskQueue,
        args: [
          {
            projectId,
            changeId: "latency-temporal",
            title: "latency-temporal",
            initializedAt: new Date().toISOString(),
          },
        ],
      });
      const temporalTask = await temporalHandle.executeUpdate(addTaskUpdate, {
        args: [{ title: "bench-task" }],
      });
      const legacyTask = await legacyStore.tasks.add(
        createdLegacy.changeId,
        "bench-task",
      );

      const sample = async (fn: () => Promise<void>, count = 40) => {
        const values: number[] = [];
        for (let i = 0; i < count; i++) {
          const start = performance.now();
          await fn();
          values.push(performance.now() - start);
        }
        return discardWarmup(values, 10);
      };

      const legacyTaskUpdate = await sample(() =>
        legacyStore.tasks.update(legacyTask.id, "pending").then(() => {}),
      );
      const temporalTaskUpdate = await sample(() =>
        temporalHandle
          .executeUpdate(updateTaskUpdate, {
            args: [temporalTask.id, { status: "pending" }],
          })
          .then(() => {}),
      );
      const legacyChangeGet = await sample(() =>
        legacyStore.changes.get(createdLegacy.changeId).then(() => {}),
      );
      const temporalChangeGet = await sample(() =>
        temporalStore.changes.get("latency-temporal").then(() => {}),
      );
      const legacyGateComplete = await sample(() =>
        legacyStore.gates
          .complete(createdLegacy.changeId, "proposal", "bench")
          .then(() => {}),
      );
      const temporalGateComplete = await sample(() =>
        temporalHandle
          .executeUpdate(completeGateUpdate, {
            args: ["proposal", "bench", "agent"],
          })
          .then(() => {}),
      );

      const result = compareLatencyBudgets({
        taskUpdate: {
          legacyP95: computePercentiles(legacyTaskUpdate).p95,
          temporalP95: computePercentiles(temporalTaskUpdate).p95,
        },
        changeGet: {
          legacyP95: computePercentiles(legacyChangeGet).p95,
          temporalP95: computePercentiles(temporalChangeGet).p95,
        },
        gateComplete: {
          legacyP95: computePercentiles(legacyGateComplete).p95,
          temporalP95: computePercentiles(temporalGateComplete).p95,
        },
      });

      const p95 = {
        taskUpdate: {
          legacy: computePercentiles(legacyTaskUpdate).p95,
          temporal: computePercentiles(temporalTaskUpdate).p95,
        },
        changeGet: {
          legacy: computePercentiles(legacyChangeGet).p95,
          temporal: computePercentiles(temporalChangeGet).p95,
        },
        gateComplete: {
          legacy: computePercentiles(legacyGateComplete).p95,
          temporal: computePercentiles(temporalGateComplete).p95,
        },
      };

      if (OUTPUT) {
        await writeFile(
          OUTPUT,
          JSON.stringify(
            {
              pass: result.pass,
              ratios: result.ratios,
              p95,
            },
            null,
            2,
          ),
        );
      }

      expect(typeof result.ratios.taskUpdate).toBe("number");
      legacyStore.close();
      temporalStore.close();
      await temporalHandle.terminate("latency complete");
    } finally {
      worker.shutdown();
      await runPromise?.catch(() => undefined);
      await env.teardown();
    }
  }, 60_000);
});
