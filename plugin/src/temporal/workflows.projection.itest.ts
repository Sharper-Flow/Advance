import { getSharedWorkflowBundle } from "../temporal/__tests__/with-test-env";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";
import type { WorkflowHandle } from "@temporalio/client";

import { createDefaultGates } from "../types";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import type { ChangeWorkflowInput } from "./contracts";
import {
  writeChangeProjection,
  type WriteChangeProjectionInput,
  type WriteChangeProjectionResult,
} from "./activities";
import {
  archiveChangeSignal,
  archiveRequestedSignal,
  closeChangeSignal,
  gateCompletedSignal,
} from "./messages";
import { withTimeSkippingTestWorkflowEnvironment } from "./__tests__/with-test-env";
import { createDiskStore } from "../storage/store-disk";
import { createTemporalStoreBackend } from "../storage/store-temporal";
import { createMockOwnerFromClient } from "./__tests__/mock-owner";
import { changeTools } from "../tools/change";

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

  it("keeps retention-expired archive reads terminal after workflow completion", async () => {
    const dir = await createTempDir("retention-terminal-projection-");
    try {
      const externalRoot = join(dir, "state");
      const projectionChangesDir = join(externalRoot, "changes");
      const changeId = "retention-expired-archive";
      const projectId = "0000ec00000000f0000000ec0000000000000000";

      await withTimeSkippingTestWorkflowEnvironment(async (env) => {
        const taskQueue = `retention-terminal-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowBundle: await getSharedWorkflowBundle(),
          activities: { writeChangeProjection },
          taskQueue,
        });
        const legacy = await createDiskStore(dir, { externalRoot });
        const store = createTemporalStoreBackend({
          legacy,
          temporal: createMockOwnerFromClient({ client: env.client }),
          projectId,
        });

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `retention-terminal-${Date.now()}`,
            taskQueue,
            args: [makeChangeInput(changeId, projectionChangesDir)],
          });

          await handle.signal(archiveChangeSignal);
          await expect(handle.result()).resolves.toBeUndefined();

          // The workflow must finish only after its terminal projection Activity
          // has completed; this is the store-of-record evidence for the
          // retention-expiry failure mode.
          const projected = await readProjection(
            projectionChangesDir,
            changeId,
          );
          expect(projected).toMatchObject({
            schemaVersion: 2,
            state: { changeId, status: "archived" },
          });

          // Retention expiry removes workflow visibility, so the subsequent
          // read ladder must use the terminal bundle on the default branch.
          // Seed that field-observed shape from the projection that was proven
          // durable above; no workflow record is consulted by the reads below.
          const archiveDir = join(externalRoot, "archive", changeId);
          await mkdir(archiveDir, { recursive: true });
          await writeFile(
            join(archiveDir, "change.json"),
            `${JSON.stringify(
              {
                id: changeId,
                title: projected.state.title,
                status: "archived",
                created_at: projected.state.createdAt,
                created_by: "retention-test",
                tasks: projected.state.tasks,
                deltas: projected.state.deltas,
                wisdom: projected.state.wisdom,
                gates: projected.state.gates,
                reentry_history: projected.state.reentry_history,
              },
              null,
              2,
            )}\n`,
          );

          const listed = await store.changes.list({ includeArchived: true });
          const summarized = await store.changes.listSummary?.({
            includeArchived: true,
          });
          expect(listed.changes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: changeId, status: "archived" }),
            ]),
          );
          expect(summarized?.changes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: changeId, status: "archived" }),
            ]),
          );

          const shown = JSON.parse(
            await changeTools.adv_change_show.execute({ changeId }, store),
          ) as { id: string; status: string };
          expect(shown).toMatchObject({ id: changeId, status: "archived" });
        });
      });
    } finally {
      await cleanupTempDir(dir);
    }
  }, 45_000);

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
