import { getSharedWorkflowBundle } from "../temporal/__tests__/with-test-env";
import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";
import type { WorkflowHandle } from "@temporalio/client";

import { createDefaultGates } from "../types";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import type { ChangeWorkflowInput } from "./contracts";
import { writeChangeProjection } from "./activities";
import {
  archiveChangeSignal,
  archiveRequestedSignal,
  closeChangeSignal,
  gateCompletedSignal,
} from "./messages";
import { withTimeSkippingTestWorkflowEnvironment } from "./__tests__/with-test-env";

type ChangeWorkflowHandle = WorkflowHandle<
  typeof import("./workflows").changeWorkflow
>;

function makeChangeInput(
  changeId: string,
  projectionChangesDir: string,
): ChangeWorkflowInput {
  return {
    projectId: "0000ec00000000f0000000ec0000000000000000",
    changeId,
    title: `Projection workflow: ${changeId}`,
    initializedAt: "2026-05-05T00:00:00.000Z",
    searchAttributesEnabled: false,
    projectionChangesDir,
    seedState: {
      status: "active",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

async function readProjection(
  projectionChangesDir: string,
  changeId: string,
): Promise<any> {
  return JSON.parse(
    await readFile(join(projectionChangesDir, `${changeId}.json`), "utf-8"),
  );
}

describe("changeWorkflow disk projection", () => {
  it("projects gate signals best-effort and terminal archive before completion", async () => {
    const dir = await createTempDir();
    try {
      await withTimeSkippingTestWorkflowEnvironment(async (env) => {
        const taskQueue = `projection-workflow-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowBundle: await getSharedWorkflowBundle(),
          activities: { writeChangeProjection },
          taskQueue,
        });
        const projectionChangesDir = join(dir, "changes");

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `projection-workflow-${Date.now()}`,
            taskQueue,
            args: [makeChangeInput("projection-change", projectionChangesDir)],
          });

          await handle.signal(gateCompletedSignal, {
            gateId: "proposal",
            completedBy: "tester",
            completedAt: "2026-05-05T00:00:01.000Z",
            compatibilityReason:
              "projection fixture validates projection, not artifact inspection",
          });

          await expect
            .poll(() =>
              readProjection(projectionChangesDir, "projection-change"),
            )
            .toMatchObject({
              schemaVersion: 2,
              state: {
                changeId: "projection-change",
                gates: { proposal: { status: "done" } },
              },
            });

          await handle.signal(archiveRequestedSignal, {
            approvalEvidence: "ship it",
            requestedBy: "tester",
            requestedAt: "2026-05-05T00:00:02.000Z",
          });

          await expect(handle.result()).resolves.toBeUndefined();
          await expect(
            readProjection(projectionChangesDir, "projection-change"),
          ).resolves.toMatchObject({
            schemaVersion: 2,
            state: { status: "archived" },
          });
        });
      });
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);

  it("awaits gate completion projection on the versioned path", async () => {
    const source = await readFile(
      new URL("./workflows.ts", import.meta.url),
      "utf8",
    );
    const gateStart = source.indexOf("wf.setHandler(\n    gateCompletedSignal");
    const gateEnd = source.indexOf("gateReenteredSignal", gateStart);
    const gateHandler = source.slice(gateStart, gateEnd);

    expect(gateHandler).toMatch(
      /wf\.patched\(GATE_COMPLETED_PROJECTION_PATCH\)/,
    );
    expect(gateHandler).toMatch(/await projectChangeState\("gateCompleted"\)/);
  });

  it.each([
    [
      "archived",
      async (handle: ChangeWorkflowHandle) =>
        handle.signal(archiveChangeSignal),
    ],
    [
      "closed",
      async (handle: ChangeWorkflowHandle) =>
        handle.signal(closeChangeSignal, {
          reason: "cancelled",
          approved_by_user: true,
          approval_evidence: "close projection test",
          approved_at: "2026-05-05T00:00:03.000Z",
        }),
    ],
  ])(
    "awaits the terminal projection Activity before completing (%s)",
    async (status, trigger) => {
      const dir = await createTempDir();
      try {
        await withTimeSkippingTestWorkflowEnvironment(async (env) => {
          const taskQueue = `terminal-projection-${status}-${Date.now()}`;
          const events: string[] = [];
          const trackedProjection = async (
            input: WriteChangeProjectionInput,
          ): Promise<WriteChangeProjectionResult> => {
            const result = await writeChangeProjection(input);
            events.push("projection-completed");
            return result;
          };
          const worker = await Worker.create({
            connection: env.nativeConnection,
            workflowBundle: await getSharedWorkflowBundle(),
            activities: { writeChangeProjection: trackedProjection },
            taskQueue,
          });

          await worker.runUntil(async () => {
            const changeId = `terminal-${status}`;
            const handle = await env.client.workflow.start("changeWorkflow", {
              workflowId: `terminal-projection-${status}-${Date.now()}`,
              taskQueue,
              args: [makeChangeInput(changeId, join(dir, "changes"))],
            });

            await trigger(handle);
            await handle.result();
            events.push("workflow-completed");

            expect(events).toEqual([
              "projection-completed",
              "workflow-completed",
            ]);
            await expect(
              readProjection(join(dir, "changes"), changeId),
            ).resolves.toMatchObject({
              schemaVersion: 2,
              state: { status },
            });
          });
        });
      } finally {
        await cleanupTempDir(dir);
      }
    },
    30_000,
  );
});
