import { fileURLToPath } from "node:url";
import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import { createDefaultGates } from "../types";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import type { ChangeWorkflowInput } from "./contracts";
import { writeChangeProjection } from "./activities";
import { archiveRequestedSignal, gateCompletedSignal } from "./messages";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

function makeChangeInput(
  changeId: string,
  projectionChangesDir: string,
): ChangeWorkflowInput {
  return {
    projectId: "projection-workflow-project",
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
      await withTestWorkflowEnvironment(
        () => TestWorkflowEnvironment.createTimeSkipping(),
        async (env) => {
          const taskQueue = `projection-workflow-${Date.now()}`;
          const worker = await Worker.create({
            connection: env.nativeConnection,
            workflowsPath,
            activities: { writeChangeProjection },
            taskQueue,
          });
          const projectionChangesDir = join(dir, "changes");

          await worker.runUntil(async () => {
            const handle = await env.client.workflow.start("changeWorkflow", {
              workflowId: `projection-workflow-${Date.now()}`,
              taskQueue,
              args: [
                makeChangeInput("projection-change", projectionChangesDir),
              ],
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
        },
      );
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);
});
