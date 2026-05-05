/**
 * Workflow termination on terminal status (archive / close).
 *
 * Verifies the design from change `terminatechangeworkflowonarchi`:
 * after `archiveRequestedSignal` or `changeCancelledSignal` is processed, the
 * change workflow reaches a Completed state in Temporal instead of
 * remaining in Running forever (zombie).
 *
 * These tests prevent regressions where `wf.condition` only exited on
 * history rotation and terminal changes remained Running forever.
 *
 * Pattern follows `replay-determinism.test.ts` for env + worker setup.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { withTestWorkflowEnvironment } from "./with-test-env";
import { archiveRequestedSignal, changeCancelledSignal } from "../messages";
import { createDefaultGates } from "../../types";
import type { ChangeWorkflowInput } from "../contracts";
import { requiredAdvSearchAttributes } from "../observability";

const workflowsPath = fileURLToPath(
  new URL("../workflows.ts", import.meta.url),
);

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

/**
 * Wait up to `timeoutMs` for the workflow to reach Completed status.
 * Uses `handle.result()` (resolves when workflow returns) with a
 * timeout race so red-phase tests fail predictably instead of hanging.
 */
async function waitForCompleted(
  handle: { result: () => Promise<unknown> },
  timeoutMs: number,
): Promise<"completed" | "timeout" | "rejected"> {
  return await Promise.race<"completed" | "timeout" | "rejected">([
    handle
      .result()
      .then(() => "completed" as const)
      .catch(() => "rejected" as const),
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), timeoutMs),
    ),
  ]);
}

function makeChangeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "proj-term-001",
    changeId,
    title: `Termination test: ${changeId}`,
    initializedAt: new Date().toISOString(),
    searchAttributesEnabled: false,
    seedState: {
      status: "draft",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

describe("changeWorkflow terminal-state exit (terminatechangeworkflowonarchi)", () => {
  it("Completes after archiveChangeUpdate resolves", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        await registerAdvSearchAttributes(env);

        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "termination-test-archive",
        });

        await worker.runUntil(async () => {
          const input = makeChangeInput("archive-test-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `term-archive-${Date.now()}`,
            taskQueue: "termination-test-archive",
            args: [input],
          });

          // Trigger archive — sets state.status = "archived"
          await handle.signal(archiveRequestedSignal, {
            approvalEvidence: "Test archive approval",
            requestedBy: "tester",
            requestedAt: new Date().toISOString(),
          });

          // After fix: workflow exits cleanly via terminal-state branch.
          // Before fix: workflow stays Running until history rotation.
          const outcome = await waitForCompleted(handle, 5_000);
          expect(outcome).toBe("completed");

          // Confirm via describe() — defense in depth
          const description = await handle.describe();
          expect(description.status.name).toBe("COMPLETED");
        });
      },
    );
  }, 30_000);

  it("Completes after closeChangeUpdate resolves", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        await registerAdvSearchAttributes(env);

        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "termination-test-close",
        });

        await worker.runUntil(async () => {
          const input = makeChangeInput("close-test-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `term-close-${Date.now()}`,
            taskQueue: "termination-test-close",
            args: [input],
          });

          // Trigger close with a cancellation payload — sets state.status = "closed"
          await handle.signal(changeCancelledSignal, {
            approvalEvidence: "Test cancellation",
            reason: "cancelled",
            cancelledBy: "tester",
            cancelledAt: new Date().toISOString(),
          });

          const outcome = await waitForCompleted(handle, 5_000);
          expect(outcome).toBe("completed");

          const description = await handle.describe();
          expect(description.status.name).toBe("COMPLETED");
        });
      },
    );
  }, 30_000);

  // Note: a "stays Running on non-terminal status" negative test was
  // attempted but is unstable in TimeSkipping env (the env eventually
  // fast-forwards START_TO_CLOSE timeout regardless of in-test waits).
  // Negative behavior is covered by:
  //   - replay-determinism.test.ts (workflows do continue-as-new on
  //     non-terminal mutations without Completing prematurely)
  //   - the fact that this test file's positive cases would fail if the
  //     predicate were inverted (workflows would Complete BEFORE the
  //     archive/close update arrives, which they do not)
});
