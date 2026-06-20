/**
 * Workflow signal-handler tests for ops follow-up signals.
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
  opsEvidenceAppendedSignal,
  opsFollowupLinkAddedSignal,
  opsFollowupSeededSignal,
} from "./messages";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

function makeChangeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "ops-follow-up-test-project",
    changeId,
    title: `Ops follow-up test: ${changeId}`,
    initializedAt: "2026-06-20T04:00:00.000Z",
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

async function withOpsSignalWorker(
  name: string,
  fn: (
    handle: WorkflowHandle<typeof import("./workflows").changeWorkflow>,
  ) => Promise<void>,
): Promise<void> {
  await withTestWorkflowEnvironment(
    () => TestWorkflowEnvironment.createTimeSkipping(),
    async (env) => {
      const taskQueue = `ops-signal-${name}`;
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue,
      });

      await worker.runUntil(async () => {
        const handle = await env.client.workflow.start("changeWorkflow", {
          workflowId: `ops-${name}-${Date.now()}`,
          taskQueue,
          args: [makeChangeInput(name)],
        });
        await fn(handle);
      });
    },
  );
}

describe("changeWorkflow ops follow-up signal handlers", () => {
  it("seeds ops follow-up profile and outbound link via signals", async () => {
    await withOpsSignalWorker("seed-and-link", async (handle) => {
      await handle.signal(opsFollowupSeededSignal, {
        profile: {
          kind: "migration",
          source: {
            source_change_id: "parent-1",
            source_kind: "required_follow_up",
          },
          relationship: "follows_release",
          status: "not_started",
          created_at: "2026-06-20T04:00:00.000Z",
          evidence: [],
        },
        seededAt: "2026-06-20T04:00:01.000Z",
      });
      await handle.signal(opsFollowupLinkAddedSignal, {
        link: {
          id: "ofl-1",
          changeId: "child-1",
          relationship: "follows_release",
          status: "not_started",
          linked_at: "2026-06-20T04:00:01.000Z",
        },
        addedAt: "2026-06-20T04:00:02.000Z",
      });

      const state = await queryState(handle);
      expect(state.ops_followup).toMatchObject({
        kind: "migration",
        relationship: "follows_release",
        status: "not_started",
      });
      expect(state.ops_followup_links).toHaveLength(1);
      expect(state.ops_followup_links?.[0]?.id).toBe("ofl-1");
    });
  }, 30_000);

  it("appends evidence and updates status via signal", async () => {
    await withOpsSignalWorker("evidence", async (handle) => {
      await handle.signal(opsFollowupSeededSignal, {
        profile: {
          kind: "backfill",
          source: {
            source_change_id: "parent-2",
            source_kind: "report_follow_up",
          },
          relationship: "monitors",
          status: "not_started",
          created_at: "2026-06-20T04:00:00.000Z",
          evidence: [],
        },
        seededAt: "2026-06-20T04:00:01.000Z",
      });
      await handle.signal(opsEvidenceAppendedSignal, {
        entry: {
          id: "ev-1",
          recorded_at: "2026-06-20T04:01:00.000Z",
          env: "prod",
          action: "run backfill",
          batch: "batch-1",
          status: "started",
          summary: "Backfill started",
          next_step: "validate",
        },
        status: "running",
        appendedAt: "2026-06-20T04:01:00.000Z",
      });

      const state = await queryState(handle);
      expect(state.ops_followup?.status).toBe("running");
      expect(state.ops_followup?.evidence).toHaveLength(1);
      expect(state.ops_followup?.evidence?.[0]).toMatchObject({
        id: "ev-1",
        batch: "batch-1",
        status: "started",
      });
    });
  }, 30_000);

  it("rejects evidence signal when profile is missing", async () => {
    await withOpsSignalWorker("no-profile", async (handle) => {
      await handle.signal(opsEvidenceAppendedSignal, {
        entry: {
          id: "ev-1",
          recorded_at: "2026-06-20T04:01:00.000Z",
          env: "prod",
          action: "x",
          status: "complete",
          summary: "x",
        },
        appendedAt: "2026-06-20T04:01:00.000Z",
      });

      const state = await queryState(handle);
      expect(state.signal_rejections).toHaveLength(1);
      expect(state.signal_rejections?.[0]?.signalName).toBe(
        "opsEvidenceAppended",
      );
      expect(state.signal_rejections_total).toBe(1);
    });
  }, 30_000);
});
