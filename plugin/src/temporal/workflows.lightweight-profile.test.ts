/**
 * Workflow signal-handler tests for lightweight change profile signals.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { WorkflowHandle } from "@temporalio/client";

import { createDefaultGates } from "../types";
import type { ChangeWorkflowInput, ChangeWorkflowState } from "./contracts";
import {
  getChangeStateQuery,
  lightweightProfileEvaluatedSignal,
  lightweightProfileRequestedSignal,
} from "./messages";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

const timestamp = "2026-07-16T18:00:00.000Z";

function makeChangeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "lightweight-profile-test-project",
    changeId,
    title: `Lightweight profile test: ${changeId}`,
    initializedAt: timestamp,
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

async function queryState(
  handle: WorkflowHandle<typeof import("./workflows").changeWorkflow>,
): Promise<ChangeWorkflowState> {
  return await handle.query(getChangeStateQuery);
}

async function withLightweightProfileWorker(
  name: string,
  fn: (
    handle: WorkflowHandle<typeof import("./workflows").changeWorkflow>,
  ) => Promise<void>,
): Promise<void> {
  await withTestWorkflowEnvironment(
    () => TestWorkflowEnvironment.createTimeSkipping(),
    async (env) => {
      const taskQueue = `lightweight-profile-signal-${name}`;
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue,
      });

      await worker.runUntil(async () => {
        const handle = await env.client.workflow.start("changeWorkflow", {
          workflowId: `lightweight-profile-${name}-${Date.now()}`,
          taskQueue,
          args: [makeChangeInput(name)],
        });
        await fn(handle);
      });
    },
  );
}

function makeEvaluation() {
  return {
    evaluationKey: "req-1:initial:fp-1",
    phase: "initial" as const,
    result: "qualified" as const,
    criteria: [
      {
        criterion: "implementation_task_count" as const,
        status: "satisfied" as const,
        reason: "One implementation task",
      },
      {
        criterion: "changed_file_count" as const,
        status: "satisfied" as const,
        reason: "One path",
      },
      {
        criterion: "spec_delta" as const,
        status: "satisfied" as const,
        reason: "No spec delta",
      },
      {
        criterion: "dependency_change" as const,
        status: "satisfied" as const,
        reason: "No dependency change",
      },
      {
        criterion: "api_compatibility" as const,
        status: "satisfied" as const,
        reason: "Proven private",
      },
      {
        criterion: "repository_scope" as const,
        status: "satisfied" as const,
        reason: "Current project only",
      },
    ],
    evidenceFingerprint: "fp-1",
    observedRevision: "head-abc",
    evaluatedAt: timestamp,
  };
}

describe("changeWorkflow lightweight profile signal handlers", () => {
  it("seeds a lightweight profile request via signal", async () => {
    await withLightweightProfileWorker("request", async (handle) => {
      await handle.signal(lightweightProfileRequestedSignal, {
        request: {
          requestId: "req-1",
          baselineRevision: "base-abc",
          requestedAt: timestamp,
          requestedBy: "agent",
        },
        omissionPolicy: {
          omitDeepScans: true,
          omitGenericExternalResearch: true,
          omitOpportunityScouting: true,
          omitDefaultSpecialistDelegation: true,
        },
        requestedAt: timestamp,
      });

      const state = await queryState(handle);
      expect(state.lightweight_profile).toMatchObject({
        request: {
          requestId: "req-1",
          baselineRevision: "base-abc",
        },
        omissionPolicy: {
          omitDeepScans: true,
          omitGenericExternalResearch: true,
          omitOpportunityScouting: true,
          omitDefaultSpecialistDelegation: true,
        },
        evaluations: [],
      });
      expect(state.lastSignalAt).toBe(timestamp);
    });
  }, 30_000);

  it("appends an evaluation via signal and deduplicates by key", async () => {
    await withLightweightProfileWorker("evaluate", async (handle) => {
      await handle.signal(lightweightProfileRequestedSignal, {
        request: {
          requestId: "req-1",
          baselineRevision: "base-abc",
          requestedAt: timestamp,
        },
        omissionPolicy: {
          omitDeepScans: true,
          omitGenericExternalResearch: true,
          omitOpportunityScouting: true,
          omitDefaultSpecialistDelegation: true,
        },
        requestedAt: timestamp,
      });
      await handle.signal(lightweightProfileEvaluatedSignal, {
        evaluation: makeEvaluation(),
        evaluatedAt: timestamp,
      });
      await handle.signal(lightweightProfileEvaluatedSignal, {
        evaluation: makeEvaluation(),
        evaluatedAt: "2026-07-16T18:01:00.000Z",
      });

      const state = await queryState(handle);
      expect(state.lightweight_profile?.evaluations).toHaveLength(1);
      expect(state.lightweight_profile?.evaluations[0].result).toBe(
        "qualified",
      );
      expect(state.lightweight_profile?.evaluations[0].evaluationKey).toBe(
        "req-1:initial:fp-1",
      );
      expect(state.lastSignalAt).toBe("2026-07-16T18:01:00.000Z");
    });
  }, 30_000);
});
