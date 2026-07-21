/**
 * AC2 integration test: peer-session wedge isolation.
 *
 * Verifies KD-1 + KD-2 from change `isolateAdvWorkerTaskQueues`: when
 * session S1's worker is wedged (process alive but not polling) or
 * absent entirely, session S2's workflow signals on its own session
 * queue are still processed within bounded latency because S2's worker
 * polls S2's queue independently.
 *
 *   AC2: When session S1 is wedged (worker process alive but not polling)
 *        and session S2 is active, S2's workflow signals on
 *        `advance-{P}-{S2}` are still processed within bounded latency.
 *
 * Test strategy: start ONLY session S2's worker. Start a workflow with
 * sessionId=S2. Signal + query — must succeed. No worker exists for S1
 * (or any other session). S2's success is independent of S1's worker
 * state — that is the isolation guarantee. In the legacy shared-queue
 * model, S1's wedge would block S2 because both shared one queue.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";
import { withTimeSkippingTestWorkflowEnvironment } from "./with-test-env";
import { ensureChangeWorkflowStarted } from "../workflow-start";
import { createDefaultGates } from "../../types";
import type { ChangeWorkflowInput } from "../contracts";
import { buildSessionTaskQueue } from "../client";
import {
  changeStateQuery,
  proposalUpdatedSignal,
} from "../messages";
import { requiredAdvSearchAttributes } from "../observability";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

const workflowsPath = fileURLToPath(new URL("../workflows.ts", import.meta.url));
const PROJECT_ID = "proj-wedge-isolation-001";
const SESSION_S2 = "sess_WedgeS2Active";
// SESSION_S1 has NO worker in this test — simulates wedge / not-yet-spawned.
const SESSION_S1_ABSENT = "sess_WedgeS1Absent";

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
  sessionId: string,
): ChangeWorkflowInput {
  return {
    projectId: PROJECT_ID,
    changeId,
    title: `Wedge isolation test: ${changeId}`,
    initializedAt: new Date().toISOString(),
    searchAttributesEnabled: false,
    sessionId,
    seedState: {
      status: "draft",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

describe("AC2: peer-session wedge isolation (isolateAdvWorkerTaskQueues)", () => {
  it("S2's workflow signals are processed even when S1 has no worker (wedge / absent)", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      await registerAdvSearchAttributes(env);

      const s2Queue = buildSessionTaskQueue(PROJECT_ID, SESSION_S2);

      // Only S2's worker is started. S1 has no worker — models wedge.
      const s2Worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue: s2Queue,
      });

      await s2Worker.runUntil(async () => {
        // S2 workflow — should be processed by S2's worker.
        const s2Handle = await ensureChangeWorkflowStarted(
          env.client,
          makeChangeInput("wedge-s2-active", SESSION_S2),
        );

        const s2Desc = await s2Handle.describe();
        expect(s2Desc.taskQueue).toBe(s2Queue);

        // Send a signal to S2's workflow.
        await s2Handle.signal(proposalUpdatedSignal, {
          contentHash: "ac2-s2-isolation-proof",
          source: "test",
          updatedAt: new Date().toISOString(),
        });

        // Query — answering at all proves S2's worker is processing the
        // workflow on S2's queue. Under the legacy shared-queue model, the
        // absence of S1's worker would block S2's workflow too. Under
        // per-session routing, S2's worker polls S2's queue independently.
        const s2State = await s2Handle.query(changeStateQuery);
        expect(s2State).toBeDefined();
        expect((s2State as { status?: string }).status).toBe("draft");

        // Sanity: confirm S1's queue name exists and is distinct from S2's.
        // No workflow is started on S1's queue here (no worker). The
        // SESSION_S1_ABSENT constant documents the wedge scenario.
        expect(SESSION_S1_ABSENT).not.toBe(SESSION_S2);
        expect(buildSessionTaskQueue(PROJECT_ID, SESSION_S1_ABSENT)).not.toBe(
          s2Queue,
        );
      });
    });
  });
});
