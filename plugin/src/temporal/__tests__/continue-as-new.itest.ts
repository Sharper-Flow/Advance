import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
import { evaluateGateReadiness } from "../gate-readiness";
import { getChangeStateQuery, taskAddedSignal } from "../messages";
import { withTimeSkippingTestWorkflowEnvironment } from "./with-test-env";

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
      status: "draft",
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
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
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
    });
  }, 120000);

  it("preserves seenReportIds and seenReportIdsTotal across continue-as-new", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      const taskQueue = `continue-as-new-seen-${Date.now()}`;
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue,
      });

      await worker.runUntil(async () => {
        const workflowId = `continue-as-new-seen-${Date.now()}`;
        const handle: StartedChangeWorkflowHandle =
          await env.client.workflow.start("changeWorkflow", {
            workflowId,
            taskQueue,
            args: [
              {
                ...makeChangeInput("can-seen-test"),
                seedState: {
                  ...makeChangeInput("can-seen-test").seedState,
                  seenReportIds: ["can-seen-test|tk-1|adv-engineer|1"],
                  seenReportIdsTotal: 1,
                },
              },
            ],
          });
        const firstRunId = handle.firstExecutionRunId;

        // Trigger continue-as-new with enough signals to cross threshold
        const signalCount = 5_200;
        await Promise.allSettled(
          Array.from({ length: signalCount }, (_, i) =>
            handle.signal(taskAddedSignal, {
              task: makeTask(`can-seen-tk-${i}`),
              addedAt: `2026-05-05T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
            }),
          ),
        );

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

        expect(description.runId).not.toBe(firstRunId);
        expect(state.seenReportIds).toEqual([
          "can-seen-test|tk-1|adv-engineer|1",
        ]);
        expect(state.seenReportIdsTotal).toBe(1);
      });
    });
  }, 120000);

  it("preserves worker-bundle provenance and typed test runs across continue-as-new (KD6/KD7)", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      const taskQueue = `continue-as-new-wbp-${Date.now()}`;
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue,
      });

      await worker.runUntil(async () => {
        const workflowId = `continue-as-new-wbp-${Date.now()}`;
        const changeId = "can-wbp-test";
        const baseInput = makeChangeInput(changeId);
        const input: ChangeWorkflowInput = {
          ...baseInput,
          seedState: {
            ...baseInput.seedState,
            worker_bundle_impact: {
              kind: "required",
              rationale: "Touches workflow-reachable code",
              confirmed_at: "2026-05-05T00:00:00.000Z",
            },
            workerBundleProvenance: {
              source_sha: "sha256-wbp",
              build_run_id: "tr-build-can-1",
              replay_run_id: "tr-replay-can-1",
              worker_manifest_generation: 9,
              recorded_at: "2026-05-05T00:00:01.000Z",
            },
            testRuns: {
              "tk-can-wbp": [
                {
                  runId: "tr-build-can-1",
                  phase: "verify",
                  exitCode: 0,
                  classification: "passed",
                  command: "pnpm run build:worker",
                  durationMs: 1000,
                  evidence_kind: "build_worker",
                  recordedAt: "2026-05-05T00:00:02.000Z",
                },
                {
                  runId: "tr-replay-can-1",
                  phase: "verify",
                  exitCode: 0,
                  classification: "passed",
                  command: "bin/oc-test targeted -- replay-determinism.test.ts",
                  durationMs: 2000,
                  evidence_kind: "replay_determinism",
                  recordedAt: "2026-05-05T00:00:03.000Z",
                },
              ],
            },
          },
        };

        const handle: StartedChangeWorkflowHandle =
          await env.client.workflow.start("changeWorkflow", {
            workflowId,
            taskQueue,
            args: [input],
          });
        const firstRunId = handle.firstExecutionRunId;

        const signalCount = 5_200;
        await Promise.allSettled(
          Array.from({ length: signalCount }, (_, i) =>
            handle.signal(taskAddedSignal, {
              task: makeTask(`can-wbp-tk-${i}`),
              addedAt: `2026-05-05T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
            }),
          ),
        );

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

        expect(description.runId).not.toBe(firstRunId);
        expect(state.worker_bundle_impact).toMatchObject({
          kind: "required",
          rationale: "Touches workflow-reachable code",
        });
        expect(state.workerBundleProvenance).toMatchObject({
          source_sha: "sha256-wbp",
          build_run_id: "tr-build-can-1",
          replay_run_id: "tr-replay-can-1",
          worker_manifest_generation: 9,
        });
        expect(state.testRuns?.["tk-can-wbp"]).toHaveLength(2);
        expect(state.testRuns?.["tk-can-wbp"]?.[0]?.evidence_kind).toBe(
          "build_worker",
        );
        expect(state.testRuns?.["tk-can-wbp"]?.[1]?.evidence_kind).toBe(
          "replay_determinism",
        );

        // KD6: the release gate can still evaluate the provenance after rotation.
        const result = evaluateGateReadiness(state, "release", {
          enforceWorkerBundleProvenance: true,
        });
        expect(
          result.blockers.some((b) =>
            b.code.startsWith("WORKER_BUNDLE_PROVENANCE"),
          ),
        ).toBe(false);
      });
    });
  }, 120000);
});
