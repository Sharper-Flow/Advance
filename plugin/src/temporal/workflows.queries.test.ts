import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import type { Task } from "../types";
import { createDefaultGates } from "../types";
import type { ChangeWorkflowInput } from "./contracts";
import {
  acceptanceCriteriaSetSignal,
  gateAwaitingApprovalSignal,
  getChangeStateQuery,
  getCurrentBucketQuery,
  getInvestmentReportQuery,
  getReadyTasksQuery,
  getReviewVerificationQuery,
  getTaskRunSummaryQuery,
  taskAddedSignal,
  taskBlockedSignal,
  taskCompletedSignal,
} from "./messages";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

function makeTask(id: string, status: Task["status"] = "pending"): Task {
  return {
    id,
    title: id,
    type: "code",
    status,
    priority: 0,
    created_at: "2026-05-05T00:00:00.000Z",
  };
}

function makeChangeInput(): ChangeWorkflowInput {
  const gates = createDefaultGates();
  gates.proposal = { status: "done" };
  gates.discovery = { status: "done" };
  gates.design = { status: "done" };
  gates.planning = { status: "done" };
  gates.execution = { status: "done" };

  return {
    projectId: "query-test-project",
    changeId: "query-test-change",
    title: "Query handler test",
    initializedAt: "2026-05-05T00:00:00.000Z",
    searchAttributesEnabled: false,
    seedState: {
      status: "active",
      tasks: [
        makeTask("tk-ready"),
        {
          ...makeTask("tk-blocked"),
          deps: [{ type: "blocked_by", target: "tk-blocker" }],
        },
        makeTask("tk-blocker", "pending"),
        makeTask("tk-done", "done"),
      ],
      wisdom: [],
      gates,
      reentry_history: [],
      acceptanceCriteria: ["SC1", "SC2"],
      lastSignalAt: "2026-05-05T00:00:00.000Z",
    },
  };
}

describe("changeWorkflow query handlers", () => {
  it("returns derived state, bucket, ready tasks, investment, review, and task summaries", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = "workflow-query-handlers";
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `query-handlers-${Date.now()}`,
            taskQueue,
            args: [makeChangeInput()],
          });

          await handle.signal(taskAddedSignal, {
            task: makeTask("tk-new"),
            addedAt: "2026-05-05T00:00:01.000Z",
          });
          await handle.signal(taskCompletedSignal, {
            taskId: "tk-new",
            verification: "query tests pass",
            summary: "completed via signal",
            filesTouched: ["plugin/src/temporal/workflows.ts"],
            completedAt: "2026-05-05T00:00:02.000Z",
          });
          await handle.signal(taskBlockedSignal, {
            taskId: "tk-blocker",
            reason: "needs user input",
            attempts: [
              {
                attempt_number: 1,
                error: "missing input",
                diagnosis: "human decision needed",
                fix_tried: "surface question",
                strategy_label: "ask-user",
                outcome: "failed",
                attempted_at: "2026-05-05T00:00:03.000Z",
              },
            ],
            blockedAt: "2026-05-05T00:00:03.000Z",
          });
          await handle.signal(gateAwaitingApprovalSignal, {
            gateId: "acceptance",
            evidence: "review done",
            triggeredAt: "2026-05-05T00:00:04.000Z",
          });
          await handle.signal(acceptanceCriteriaSetSignal, {
            criteria: ["SC1", "SC2", "SC3"],
            setAt: "2026-05-05T00:00:05.000Z",
          });

          await expect(
            handle.query(getChangeStateQuery),
          ).resolves.toMatchObject({
            changeId: "query-test-change",
            acceptanceCriteria: ["SC1", "SC2", "SC3"],
          });
          await expect(handle.query(getCurrentBucketQuery)).resolves.toBe(
            "awaiting_approval",
          );
          await expect(handle.query(getReadyTasksQuery)).resolves.toMatchObject(
            {
              ready: [expect.objectContaining({ id: "tk-ready" })],
              blocked: [
                expect.objectContaining({
                  task: expect.objectContaining({ id: "tk-blocked" }),
                  blockedBy: ["tk-blocker"],
                }),
              ],
            },
          );
          await expect(
            handle.query(getInvestmentReportQuery),
          ).resolves.toMatchObject({
            taskCounts: {
              total: 5,
              done: 2,
              pending: 2,
              blocked: 1,
            },
            retryCount: 1,
            tier: "auto",
          });
          await expect(
            handle.query(getReviewVerificationQuery),
          ).resolves.toMatchObject({
            acceptanceCriteriaCount: 3,
            incompleteTaskCount: 3,
            readyForAcceptance: false,
          });
          await expect(handle.query(getTaskRunSummaryQuery)).resolves.toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                taskId: "tk-new",
                status: "done",
                verification: "query tests pass",
              }),
              expect.objectContaining({
                taskId: "tk-blocker",
                status: "blocked",
                attempts: 1,
              }),
            ]),
          );
        });
      },
    );
  }, 30_000);
});
