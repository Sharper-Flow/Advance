import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { WorkflowHandle } from "@temporalio/client";

import { createDefaultGates } from "../../types";
import type { ChangeWorkflowInput, ChangeWorkflowState } from "../contracts";
import {
  agreementUpdatedSignal,
  designUpdatedSignal,
  gateAwaitingApprovalSignal,
  gateCompletedSignal,
  gateInProgressSignal,
  gateStuckSignal,
  getChangeStateQuery,
  proposalUpdatedSignal,
  taskAddedSignal,
  taskAssignedSignal,
  taskBlockedSignal,
  taskUpdatedSignal,
  wisdomAddedSignal,
} from "../messages";
import { withTestWorkflowEnvironment } from "./with-test-env";

const workflowsPath = fileURLToPath(
  new URL("../workflows.ts", import.meta.url),
);

function makeChangeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "concurrent-signaling-test-project",
    changeId,
    title: `Concurrent signaling test: ${changeId}`,
    initializedAt: "2026-05-05T00:00:00.000Z",
    searchAttributesEnabled: false,
    seedState: {
      status: "active",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

function makeTask(id: string, title = id) {
  return {
    id,
    title,
    type: "code" as const,
    status: "pending" as const,
    priority: 0,
    created_at: "2026-05-05T00:00:00.000Z",
  };
}

type ChangeWorkflowHandle = WorkflowHandle<
  typeof import("../workflows").changeWorkflow
>;

async function queryState(
  handle: ChangeWorkflowHandle,
): Promise<ChangeWorkflowState> {
  return handle.query(getChangeStateQuery);
}

async function pollForState(
  handle: ChangeWorkflowHandle,
  predicate: (state: ChangeWorkflowState) => boolean,
  timeoutMs = 60000,
): Promise<ChangeWorkflowState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await queryState(handle);
    if (predicate(state)) return state;
    await new Promise((r) => setTimeout(r, 50));
  }
  const finalState = await queryState(handle);
  throw new Error(
    `State predicate never satisfied within timeout. ` +
      `tasks=${finalState.tasks.length} ` +
      `wisdom=${finalState.wisdom.length} ` +
      `gates=${JSON.stringify(finalState.gates)}`,
  );
}

/**
 * Build the 10 task-add signals for one agent.
 */
function buildAgentTaskAdds(
  handle: ChangeWorkflowHandle,
  agentIdx: number,
): Promise<void>[] {
  const prefix = `agent-${agentIdx}`;
  const signals: Promise<void>[] = [];
  for (let i = 0; i < 10; i++) {
    signals.push(
      handle.signal(taskAddedSignal, {
        task: makeTask(`${prefix}-tk-${i}`, `Task ${prefix}-${i}`),
        addedAt: `2026-05-05T00:00:${String(i).padStart(2, "0")}.000Z`,
      }),
    );
  }
  return signals;
}

/**
 * Build the remaining 40 signals for one agent.
 *
 * Mix: task updates/blocks/assigns, gate transitions, wisdom adds,
 * document updates.  All agents fire gateCompleted for "proposal",
 * so the edge case (duplicate gate completion) is exercised.
 */
function buildAgentRemainingSignals(
  handle: ChangeWorkflowHandle,
  agentIdx: number,
): Promise<void>[] {
  const prefix = `agent-${agentIdx}`;
  const signals: Promise<void>[] = [];

  // 10 taskUpdated
  for (let i = 0; i < 10; i++) {
    signals.push(
      handle.signal(taskUpdatedSignal, {
        taskId: `${prefix}-tk-${i}`,
        partial: { title: `Updated ${prefix}-${i}`, priority: i + 1 },
        updatedAt: `2026-05-05T00:01:${String(i).padStart(2, "0")}.000Z`,
      }),
    );
  }

  // 2 gateInProgress — only for gates that do NOT also receive completed/stuck/awaiting
  const inProgressGates = ["planning", "execution"] as const;
  for (let i = 0; i < inProgressGates.length; i++) {
    signals.push(
      handle.signal(gateInProgressSignal, {
        gateId: inProgressGates[i],
        triggeredBy: prefix,
        triggeredAt: `2026-05-05T00:02:${String(i).padStart(2, "0")}.000Z`,
      }),
    );
  }

  // 3 gateCompleted — all agents complete proposal, so it is fired 3×.
  // proposal is the duplicate-gate edge case; discovery/design are unique.
  const completedGates = ["proposal", "discovery", "design"] as const;
  for (let i = 0; i < completedGates.length; i++) {
    signals.push(
      handle.signal(gateCompletedSignal, {
        gateId: completedGates[i],
        approvalEvidence: `${prefix} approved`,
        completedBy: prefix,
        completedAt: `2026-05-05T00:03:${String(i).padStart(2, "0")}.000Z`,
      }),
    );
  }

  // 1 gateAwaitingApproval
  signals.push(
    handle.signal(gateAwaitingApprovalSignal, {
      gateId: "acceptance",
      evidence: `${prefix} acceptance report`,
      triggeredAt: `2026-05-05T00:03:10.000Z`,
    }),
  );

  // 1 gateStuck
  signals.push(
    handle.signal(gateStuckSignal, {
      gateId: "release",
      reason: `${prefix} conformance drift`,
      triggeredAt: `2026-05-05T00:03:11.000Z`,
    }),
  );

  // 1 extra document signal to reach 40
  signals.push(
    handle.signal(designUpdatedSignal, {
      text: `Design ${prefix}`,
      updatedAt: `2026-05-05T00:07:02.000Z`,
    }),
  );

  // 10 wisdomAdded
  for (let i = 0; i < 10; i++) {
    signals.push(
      handle.signal(wisdomAddedSignal, {
        entry: {
          id: `${prefix}-ws-${i}`,
          type: "pattern",
          content: `Wisdom ${prefix}-${i}`,
          recorded_at: `2026-05-05T00:04:${String(i).padStart(2, "0")}.000Z`,
        },
        addedAt: `2026-05-05T00:04:${String(i).padStart(2, "0")}.000Z`,
      }),
    );
  }

  // 5 taskBlocked (tasks 0-4)
  for (let i = 0; i < 5; i++) {
    signals.push(
      handle.signal(taskBlockedSignal, {
        taskId: `${prefix}-tk-${i}`,
        reason: `Blocked by ${prefix}`,
        attempts: [],
        blockedAt: `2026-05-05T00:05:${String(i).padStart(2, "0")}.000Z`,
      }),
    );
  }

  // 5 taskAssigned (tasks 5-9)
  for (let i = 5; i < 10; i++) {
    signals.push(
      handle.signal(taskAssignedSignal, {
        taskId: `${prefix}-tk-${i}`,
        sessionId: `${prefix}-session`,
        assignedAt: `2026-05-05T00:06:${String(i).padStart(2, "0")}.000Z`,
      }),
    );
  }

  // 2 document signals
  signals.push(
    handle.signal(proposalUpdatedSignal, {
      text: `Proposal ${prefix}`,
      updatedBy: prefix,
      updatedAt: `2026-05-05T00:07:00.000Z`,
    }),
  );
  signals.push(
    handle.signal(agreementUpdatedSignal, {
      text: `Agreement ${prefix}`,
      updatedAt: `2026-05-05T00:07:01.000Z`,
    }),
  );

  return signals;
}

describe("concurrent signaling integration", () => {
  it("handles 3 agents × 50 signals to the same change workflow without rejection (SC1, SC9)", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `concurrent-signaling-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const workflowId = `concurrent-signaling-${Date.now()}`;
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId,
            taskQueue,
            args: [makeChangeInput("concurrent-test")],
          });

          // Phase 1 — seed tasks so subsequent updates never race against adds.
          const addSignals: Promise<void>[] = [];
          for (let agentIdx = 0; agentIdx < 3; agentIdx++) {
            addSignals.push(...buildAgentTaskAdds(handle, agentIdx));
          }
          const addResults = await Promise.allSettled(addSignals);
          expect(
            addResults.filter((r) => r.status === "rejected"),
          ).toHaveLength(0);

          // Barrier: confirm all 30 tasks exist before the concurrent burst.
          await pollForState(handle, (s) => s.tasks.length >= 30, 30000);

          // Phase 2 — fire the remaining 120 signals concurrently (3 agents × 40).
          const burstSignals: Promise<void>[] = [];
          for (let agentIdx = 0; agentIdx < 3; agentIdx++) {
            burstSignals.push(...buildAgentRemainingSignals(handle, agentIdx));
          }

          // SC9: total signal count sanity check (30 adds + 120 burst = 150)
          const totalSignals = addSignals.length + burstSignals.length;
          expect(totalSignals).toBe(150);
          expect(totalSignals).toBeLessThanOrEqual(300);

          // SC1: concurrent burst; none should reject
          const burstResults = await Promise.allSettled(burstSignals);
          const rejections = burstResults.filter(
            (r) => r.status === "rejected",
          );
          expect(rejections).toHaveLength(0);

          // Query/describe barrier — wait until all mutations are reflected
          const state = await pollForState(
            handle,
            (s) =>
              s.wisdom.length >= 30 &&
              s.gates.proposal?.status === "done" &&
              s.gates.discovery?.status === "done" &&
              s.gates.design?.status === "done" &&
              s.gates.planning?.status === "in_progress" &&
              s.gates.execution?.status === "in_progress" &&
              s.gates.acceptance?.status === "awaiting_approval" &&
              s.gates.release?.status === "stuck",
            30000,
          );

          // Verify applied counts
          expect(state.tasks).toHaveLength(30);
          expect(state.wisdom).toHaveLength(30);

          // All tasks were updated (priority > 0 proves update ran)
          const updatedTasks = state.tasks.filter(
            (t) => t.priority && t.priority > 0,
          );
          expect(updatedTasks.length).toBe(30);

          // Blocked tasks: 5 per agent
          const blockedTasks = state.tasks.filter(
            (t) => t.status === "blocked",
          );
          expect(blockedTasks.length).toBe(15);

          // Assigned tasks: 5 per agent (status flipped to in_progress)
          const assignedTasks = state.tasks.filter(
            (t) => t.status === "in_progress" && t.assignedTo,
          );
          expect(assignedTasks.length).toBe(15);

          // Gate edge case: duplicate proposal completion from 3 agents
          // Queue serializes; last write wins; state must be sane
          expect(state.gates.proposal?.status).toBe("done");
          expect(state.gates.discovery?.status).toBe("done");
          expect(state.gates.design?.status).toBe("done");
          expect(state.gates.planning?.status).toBe("in_progress");
          expect(state.gates.execution?.status).toBe("in_progress");
          expect(state.gates.acceptance?.status).toBe("awaiting_approval");
          expect(state.gates.release?.status).toBe("stuck");

          // Documents
          expect(state.documents?.proposal).toBeDefined();
          expect(state.documents?.agreement).toBeDefined();
          expect(state.documents?.design).toBeDefined();

          // Workflow healthy — not failed or terminated
          const description = await handle.describe();
          expect(description.status.name).toBe("RUNNING");
        });
      },
    );
  }, 60_000);
});
