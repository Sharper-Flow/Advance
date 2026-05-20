/**
 * Signal-driven workflow integration tests (R1.0 RED).
 *
 * Exercises each store mutation as a signal fire + query readback on a
 * real Temporal test environment.  Tests 1-7 verify existing signal
 * handlers already work; tests 8-10 fail on trunk because the required
 * signals (archiveChange, closeChange, updateArtifactMetadata) do not
 * yet have workflow handlers.
 *
 * After R1.1-R1.3 these tests become the GREEN verification.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { WorkflowHandle } from "@temporalio/client";
import { withTestWorkflowEnvironment } from "../../../temporal/__tests__/with-test-env";
import {
  taskAddedSignal,
  taskUpdatedSignal,
  taskCancelledSignal,
  gateCompletedSignal,
  gateReenteredSignal,
  wisdomAddedSignal,
  changeStateQuery,
} from "../../../temporal/messages";
import { createDefaultGates } from "../../../types";
import type {
  ChangeWorkflowInput,
  ChangeWorkflowState,
} from "../../../temporal/contracts";

const workflowsPath = fileURLToPath(
  new URL("../../../temporal/workflows.ts", import.meta.url),
);

function makeChangeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "proj-sig-001",
    changeId,
    title: `Signal test: ${changeId}`,
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

async function waitForProposalStatus(
  handle: WorkflowHandle<typeof import("../../../temporal/workflows").changeWorkflow>,
  status: string,
): Promise<ChangeWorkflowState> {
  for (let i = 0; i < 20; i++) {
    const state = await handle.query(changeStateQuery);
    if (state.gates.proposal.status === status) return state;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return await handle.query(changeStateQuery);
}

describe("changeWorkflow signal mutations (R1.0)", () => {
  it("gateCompletedSignal marks gate as done", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-gate-complete",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("gate-complete-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-gate-complete-${Date.now()}`,
            taskQueue: "sig-test-gate-complete",
            args: [input],
          });
          await handle.signal(gateCompletedSignal, {
            gateId: "proposal",
            approvalEvidence: "test",
            completedBy: "tester",
            completedAt: new Date().toISOString(),
            compatibilityReason: "legacy signal integration fixture has no artifact store",
          });
          const state = await waitForProposalStatus(handle, "done");
          expect(state.gates.proposal.status).toBe("done");
        });
      },
    );
  }, 30_000);

  it("gateReenteredSignal reopens a gate", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-gate-reopen",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("gate-reopen-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-gate-reopen-${Date.now()}`,
            taskQueue: "sig-test-gate-reopen",
            args: [input],
          });
          // First complete the gate
          await handle.signal(gateCompletedSignal, {
            gateId: "proposal",
            approvalEvidence: "test",
            completedBy: "tester",
            completedAt: new Date().toISOString(),
            compatibilityReason: "legacy signal integration fixture has no artifact store",
          });
          await waitForProposalStatus(handle, "done");
          // Then reopen it
          await handle.signal(gateReenteredSignal, {
            fromGateId: "proposal",
            reason: "reopen test",
            reenteredBy: "tester",
            reenteredAt: new Date().toISOString(),
          });
          const state = await waitForProposalStatus(handle, "pending");
          expect(state.gates.proposal.status).toBe("pending");
        });
      },
    );
  }, 30_000);

  it("taskAddedSignal adds a task", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-task-add",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("task-add-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-task-add-${Date.now()}`,
            taskQueue: "sig-test-task-add",
            args: [input],
          });
          const now = new Date().toISOString();
          await handle.signal(taskAddedSignal, {
            task: {
              id: "tk-test-001",
              title: "Test task",
              type: "code",
              status: "pending",
              priority: 0,
              created_at: now,
              deps: [],
            },
            addedAt: now,
          });
          const state = await handle.query(changeStateQuery);
          expect(state.tasks).toHaveLength(1);
          expect(state.tasks[0].id).toBe("tk-test-001");
        });
      },
    );
  }, 30_000);

  it("taskUpdatedSignal updates a task", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-task-update",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("task-update-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-task-update-${Date.now()}`,
            taskQueue: "sig-test-task-update",
            args: [input],
          });
          const now = new Date().toISOString();
          // Add task first
          await handle.signal(taskAddedSignal, {
            task: {
              id: "tk-test-002",
              title: "Test task",
              type: "code",
              status: "pending",
              priority: 0,
              created_at: now,
              deps: [],
            },
            addedAt: now,
          });
          // Update it
          await handle.signal(taskUpdatedSignal, {
            taskId: "tk-test-002",
            partial: { status: "done" },
            updatedAt: now,
          });
          const state = await handle.query(changeStateQuery);
          expect(state.tasks[0].status).toBe("done");
        });
      },
    );
  }, 30_000);

  it("taskCancelledSignal cancels a task", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-task-cancel",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("task-cancel-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-task-cancel-${Date.now()}`,
            taskQueue: "sig-test-task-cancel",
            args: [input],
          });
          const now = new Date().toISOString();
          await handle.signal(taskAddedSignal, {
            task: {
              id: "tk-test-003",
              title: "Test task",
              type: "code",
              status: "pending",
              priority: 0,
              created_at: now,
              deps: [],
            },
            addedAt: now,
          });
          await handle.signal(taskCancelledSignal, {
            taskId: "tk-test-003",
            approvalEvidence: "test-cancel",
            reason: "no longer needed",
            cancelledAt: now,
          });
          const state = await handle.query(changeStateQuery);
          expect(state.tasks[0].status).toBe("cancelled");
        });
      },
    );
  }, 30_000);

  it("taskUpdatedSignal carries reclassify (reclassifyTdd proxy)", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-task-reclassify",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("task-reclassify-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-task-reclassify-${Date.now()}`,
            taskQueue: "sig-test-task-reclassify",
            args: [input],
          });
          const now = new Date().toISOString();
          await handle.signal(taskAddedSignal, {
            task: {
              id: "tk-test-004",
              title: "Test task",
              type: "code",
              status: "pending",
              priority: 0,
              created_at: now,
              deps: [],
            },
            addedAt: now,
          });
          await handle.signal(taskUpdatedSignal, {
            taskId: "tk-test-004",
            partial: {
              metadata: { tdd_intent: "separate_verification" },
            },
            updatedAt: now,
          });
          const state = await handle.query(changeStateQuery);
          expect(state.tasks[0].metadata?.tdd_intent).toBe(
            "separate_verification",
          );
        });
      },
    );
  }, 30_000);

  it("wisdomAddedSignal adds wisdom", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-wisdom-add",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("wisdom-add-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-wisdom-add-${Date.now()}`,
            taskQueue: "sig-test-wisdom-add",
            args: [input],
          });
          const now = new Date().toISOString();
          await handle.signal(wisdomAddedSignal, {
            entry: {
              id: "ws-test-001",
              type: "pattern",
              content: "Test wisdom",
              source_task: "tk-test-001",
              recorded_at: now,
            },
            addedAt: now,
          });
          const state = await handle.query(changeStateQuery);
          expect(state.wisdom).toHaveLength(1);
          expect(state.wisdom[0].content).toBe("Test wisdom");
        });
      },
    );
  }, 30_000);

  // Tests 8-10 require NEW signals that do not exist on trunk.
  // They are expected to fail until R1.1.3 adds the handlers.

  it("archiveChangeSignal archives the change (NEW signal)", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-archive",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("archive-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-archive-${Date.now()}`,
            taskQueue: "sig-test-archive",
            args: [input],
          });
          // NEW signal — does not exist on trunk
          const { archiveChangeSignal } =
            await import("../../../temporal/messages");
          await handle.signal(archiveChangeSignal);
          const state = await handle.query(changeStateQuery);
          expect(state.status).toBe("archived");
        });
      },
    );
  }, 30_000);

  it("closeChangeSignal closes the change (NEW signal)", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-close",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("close-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-close-${Date.now()}`,
            taskQueue: "sig-test-close",
            args: [input],
          });
          // NEW signal — does not exist on trunk
          const { closeChangeSignal } =
            await import("../../../temporal/messages");
          await handle.signal(closeChangeSignal, {
            reason: "cancelled",
            approved_by_user: true,
            approval_evidence: "test",
            approved_at: new Date().toISOString(),
          });
          const state = await handle.query(changeStateQuery);
          expect(state.status).toBe("closed");
        });
      },
    );
  }, 30_000);

  it("updateArtifactMetadataSignal updates artifact metadata (NEW signal)", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue: "sig-test-artifact",
        });
        await worker.runUntil(async () => {
          const input = makeChangeInput("artifact-001");
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `sig-artifact-${Date.now()}`,
            taskQueue: "sig-test-artifact",
            args: [input],
          });
          // NEW signal — does not exist on trunk
          const { updateArtifactMetadataSignal } =
            await import("../../../temporal/messages");
          await handle.signal(updateArtifactMetadataSignal, {
            kind: "proposal",
            metadata: {
              path: "/tmp/proposal.md",
              updatedAt: new Date().toISOString(),
            },
          });
          const state = await handle.query(changeStateQuery);
          expect(state.artifacts.proposal?.path).toBe("/tmp/proposal.md");
        });
      },
    );
  }, 30_000);
});
