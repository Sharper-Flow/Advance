/**
 * AC1 + AC5 integration test: workflow task-queue routing.
 *
 * rq-orphanSessionAdoption01: change workflows now default-route to the
 * permanent project queue (advance-{P}) to prevent orphaning when sessions
 * die. Session-scoped queues are still created and polled by the worker,
 * but new workflows are NOT routed to them. Existing orphaned workflows on
 * session queues are adopted at worker startup.
 *
 *   AC1: When session S1 on project P starts a change workflow, the
 *        workflow's task queue is `advance-{P}` (project queue, not
 *        session-scoped — prevents orphaning on session death).
 *
 *   AC5: Epic workflows route to `advance-{P}` (project queue), not a
 *        session queue.
 *
 * Pattern follows `workflow-termination.itest.ts` for env + worker setup.
 * Integration tests run in the `temporal` vitest project (sequential,
 * fileParallelism: false).
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";
import { withTimeSkippingTestWorkflowEnvironment } from "./with-test-env";
import {
  ensureChangeWorkflowStarted,
  ensureEpicWorkflowStarted,
} from "../workflow-start";
import { createDefaultGates } from "../../types";
import type { ChangeWorkflowInput, EpicWorkflowInput } from "../contracts";
import { buildProjectTaskQueue } from "../client";
import { requiredAdvSearchAttributes } from "../observability";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

const workflowsPath = fileURLToPath(
  new URL("../workflows.ts", import.meta.url),
);
const PROJECT_ID = "proj-session-route-001";
const SESSION_ID = "sess_RouteItest1";

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

describe("AC1 + AC5: workflow task-queue routing (rq-orphanSessionAdoption01)", () => {
  it("AC1: change workflow with sessionId routes to advance-{P} (project queue)", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      await registerAdvSearchAttributes(env);

      const projectQueue = buildProjectTaskQueue(PROJECT_ID);
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue: projectQueue,
      });

      await worker.runUntil(async () => {
        const handle = await ensureChangeWorkflowStarted(
          env.client,
          makeChangeInput("routing-ac1-change", SESSION_ID),
        );

        // AC1 verification: the workflow's task queue is the project queue,
        // NOT the session queue — prevents orphaning on session death.
        const description = await handle.describe();
        expect(description.taskQueue).toBe(projectQueue);
        expect(description.taskQueue).toBe(`advance-${PROJECT_ID}`);
        expect(description.taskQueue).not.toContain(SESSION_ID);
      });
    });
  });

  it("AC1 backward-compat: change workflow WITHOUT sessionId routes to advance-{P}", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      await registerAdvSearchAttributes(env);

      const projectQueue = buildProjectTaskQueue(PROJECT_ID);
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue: projectQueue,
      });

      await worker.runUntil(async () => {
        const handle = await ensureChangeWorkflowStarted(
          env.client,
          // sessionId intentionally omitted — legacy / pre-init / tests
          makeChangeInput("routing-legacy-change"),
        );

        const description = await handle.describe();
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
        workflowsPath,
        taskQueue: projectQueue,
      });

      await worker.runUntil(async () => {
        const handle = await ensureEpicWorkflowStarted(
          env.client,
          makeEpicInput("routing-ac5-epic"),
        );

        // AC5 verification: epic workflow is on the permanent project queue,
        // NOT on a session-scoped queue. Epic lifecycle spans sessions (UD2).
        const description = await handle.describe();
        expect(description.taskQueue).toBe(projectQueue);
        expect(description.taskQueue).toBe(`advance-${PROJECT_ID}`);
        expect(description.taskQueue).not.toContain(SESSION_ID);
      });
    });
  });
});
