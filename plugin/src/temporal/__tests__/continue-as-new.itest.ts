import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type {
  WorkflowHandle,
  WorkflowHandleWithStartDetails,
} from "@temporalio/client";

import { createDefaultGates } from "../../types";
import type { ChangeWorkflowInput, ChangeWorkflowState } from "../contracts";
import {
  DEFAULT_CHANGE_HISTORY_THRESHOLD,
  shouldContinueAsNewFromInfo,
} from "../contracts";
import { getChangeStateQuery, taskAddedSignal } from "../messages";
import { withTestWorkflowEnvironment } from "./with-test-env";

const workflowsPath = fileURLToPath(
  new URL("../workflows.ts", import.meta.url),
);

type ChangeWorkflowHandle = WorkflowHandle<
  typeof import("../workflows").changeWorkflow
>;
type StartedChangeWorkflowHandle = WorkflowHandleWithStartDetails<
  typeof import("../workflows").changeWorkflow
>;

function makeChangeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "continue-as-new-test-project",
    changeId,
    title: `Continue-as-new test: ${changeId}`,
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

function makeTask(id: string) {
  return {
    id,
    title: `Task ${id}`,
    type: "code" as const,
    status: "pending" as const,
    priority: 0,
    created_at: "2026-05-05T00:00:00.000Z",
  };
}

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
    `State predicate never satisfied within timeout. tasks=${finalState.tasks.length}`,
  );
}

describe("changeWorkflow continue-as-new", () => {
  it("uses both Temporal-suggested and explicit history-length triggers", () => {
    expect(
      shouldContinueAsNewFromInfo({ continueAsNewSuggested: true }, 5000),
    ).toBe(true);
    expect(shouldContinueAsNewFromInfo({ historyLength: 5000 }, 5000)).toBe(
      true,
    );
    expect(shouldContinueAsNewFromInfo({ historyLength: 4999 }, 5000)).toBe(
      false,
    );
  });

  it("continues as new after 5,000+ history events while preserving in-flight signal state", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `continue-as-new-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const workflowId = `continue-as-new-${Date.now()}`;
          const handle: StartedChangeWorkflowHandle =
            await env.client.workflow.start("changeWorkflow", {
              workflowId,
              taskQueue,
              args: [makeChangeInput("can-test")],
            });
          const firstRunId = handle.firstExecutionRunId;
          expect(DEFAULT_CHANGE_HISTORY_THRESHOLD).toBe(5000);

          const signalCount = 5_200;
          const signalResults = await Promise.allSettled(
            Array.from({ length: signalCount }, (_, i) =>
              handle.signal(taskAddedSignal, {
                task: makeTask(`can-tk-${i}`),
                addedAt: `2026-05-05T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
              }),
            ),
          );

          expect(
            signalResults.filter((r) => r.status === "rejected"),
          ).toHaveLength(0);

          const latestHandle =
            env.client.workflow.getHandle<
              typeof import("../workflows").changeWorkflow
            >(workflowId);
          const state = await pollForState(
            latestHandle,
            (s) => s.tasks.length === signalCount,
            60000,
          );
          const description = await latestHandle.describe();

          expect(state.tasks).toHaveLength(signalCount);
          expect(new Set(state.tasks.map((t) => t.id)).size).toBe(signalCount);
          expect(description.status.name).toBe("RUNNING");
          if (description.runId === firstRunId) {
            throw new Error(
              `continue-as-new did not rotate; historyLength=${description.historyLength}`,
            );
          }
          expect(description.runId).not.toBe(firstRunId);
          expect(description.historyLength).toBeLessThan(
            DEFAULT_CHANGE_HISTORY_THRESHOLD,
          );
        });
      },
    );
  }, 120000);
});
