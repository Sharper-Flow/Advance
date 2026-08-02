/**
 * AC1 + AC5 integration test: workflow task-queue routing.
 *
 * Verifies the per-session task-queue routing design from change
 * `isolateAdvWorkerTaskQueues` (KD-2 / KD-10):
 *
 *   AC1: When session S1 on project P starts a change workflow, the
 *        workflow's task queue is `advance-{P}-{S1}` (verified via Temporal
 *        workflow describe or task-queue inspection).
 *
 *   AC5: Epic workflows route to `advance-{P}` (project queue), not a
 *        session queue.
 *
 * Pattern follows `workflow-termination.itest.ts` for env + worker setup.
 * Integration tests run in the `temporal` vitest project (sequential,
 * fileParallelism: false).
 */
import { getSharedWorkflowBundle } from "../../temporal/__tests__/with-test-env";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";
import { withTimeSkippingTestWorkflowEnvironment } from "./with-test-env";
import {
  ensureChangeWorkflowStarted,
  ensureEpicWorkflowStarted,
} from "../workflow-start";
import { createDefaultGates } from "../../types";
import type { ChangeWorkflowInput, EpicWorkflowInput } from "../contracts";
import { buildProjectTaskQueue, buildSessionTaskQueue } from "../client";
import { requiredAdvSearchAttributes } from "../observability";
import { TemporalOperationsOwner } from "../operations";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

const PROJECT_ID = "b".repeat(40);
const SESSION_ID = "sess_RouteItest1";

function ownerFromEnv(env: TestWorkflowEnvironment): TemporalOperationsOwner {
  return new TemporalOperationsOwner(
    {
      client: env.client,
      connection: env.connection,
      namespace: env.namespace ?? "default",
    },
    PROJECT_ID,
  );
}

async function registerAdvSearchAttributes(
  env: TestWorkflowEnvironment,
): Promise<void> {
  const searchAttributes: Record<string, number> = {};
  for (const attr of requiredAdvSearchAttributes()) {
    searchAttributes[attr.name] = attr.typeCode;
  }
  try {
    await env.connection.operatorService.addSearchAttributes({
      namespace: env.namespace ?? "default",
      searchAttributes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes("already exists")) {
      throw err;
    }
  }
}

function makeChangeInput(
  changeId: string,
  sessionId?: string,
): ChangeWorkflowInput {
  return {
    projectId: PROJECT_ID,
    changeId,
    title: `Routing test: ${changeId}`,
    initializedAt: new Date().toISOString(),
    searchAttributesEnabled: false,
    ...(sessionId !== undefined ? { sessionId } : {}),
    seedState: {
      status: "draft",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

function makeEpicInput(epicId: string): EpicWorkflowInput {
  return {
    projectId: PROJECT_ID,
    epicId,
    title: `Epic routing test: ${epicId}`,
    narrative: "Epic stays on the permanent project queue (UD2 / KD-2).",
    initializedAt: new Date().toISOString(),
    searchAttributesEnabled: false,
  };
}

describe("AC1 + AC5: workflow task-queue routing (isolateAdvWorkerTaskQueues)", () => {
  it("AC1: change workflow with sessionId routes to advance-{P}-{sess}", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      await registerAdvSearchAttributes(env);

      const sessionQueue = buildSessionTaskQueue(PROJECT_ID, SESSION_ID);
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowBundle: await getSharedWorkflowBundle(),
        taskQueue: sessionQueue,
      });

      await worker.runUntil(async () => {
        const handle = await ensureChangeWorkflowStarted(
          ownerFromEnv(env),
          makeChangeInput("routing-ac1-change", SESSION_ID),
        );

        // AC1 verification: the workflow's task queue is the session queue.
        const description = await env.client.workflow
          .getHandle(handle.workflowId)
          .describe();
        expect(description.taskQueue).toBe(sessionQueue);
        expect(description.taskQueue).toBe(
          `advance-${PROJECT_ID}-${SESSION_ID}`,
        );
      });
    });
  });

  it("AC1 backward-compat: change workflow WITHOUT sessionId routes to advance-{P}", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      await registerAdvSearchAttributes(env);

      const projectQueue = buildProjectTaskQueue(PROJECT_ID);
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowBundle: await getSharedWorkflowBundle(),
        taskQueue: projectQueue,
      });

      await worker.runUntil(async () => {
        const handle = await ensureChangeWorkflowStarted(
          ownerFromEnv(env),
          // sessionId intentionally omitted — legacy / pre-init / tests
          makeChangeInput("routing-legacy-change"),
        );

        const description = await env.client.workflow
          .getHandle(handle.workflowId)
          .describe();
        expect(description.taskQueue).toBe(projectQueue);
        expect(description.taskQueue).toBe(`advance-${PROJECT_ID}`);
      });
    });
  });

  it("AC5: epic workflow routes to advance-{P} (project queue, not session-scoped)", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      await registerAdvSearchAttributes(env);

      const projectQueue = buildProjectTaskQueue(PROJECT_ID);
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowBundle: await getSharedWorkflowBundle(),
        taskQueue: projectQueue,
      });

      await worker.runUntil(async () => {
        const handle = await ensureEpicWorkflowStarted(
          ownerFromEnv(env),
          makeEpicInput("routing-ac5-epic"),
        );

        // AC5 verification: epic workflow is on the permanent project queue,
        // NOT on a session-scoped queue. Epic lifecycle spans sessions (UD2).
        const description = await env.client.workflow
          .getHandle(handle.workflowId)
          .describe();
        expect(description.taskQueue).toBe(projectQueue);
        expect(description.taskQueue).toBe(`advance-${PROJECT_ID}`);
        expect(description.taskQueue).not.toContain(SESSION_ID);
      });
    });
  });
});
