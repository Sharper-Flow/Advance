import { fileURLToPath } from "node:url";
import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";

import { createDefaultGates } from "../types";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import type { ChangeWorkflowInput } from "../temporal/contracts";
import { writeChangeProjection } from "../temporal/activities";
import {
  archiveRequestedSignal,
  gateCompletedSignal,
} from "../temporal/messages";
import { withTimeSkippingTestWorkflowEnvironment } from "../temporal/__tests__/with-test-env";

const workflowsPath = fileURLToPath(
  new URL("../temporal/workflows.ts", import.meta.url),
);

function makeChangeInput(
  changeId: string,
  projectionChangesDir: string,
): ChangeWorkflowInput {
  return {
    projectId: "launcher-projection-project",
    changeId,
    title: `Launcher projection test: ${changeId}`,
    initializedAt: "2026-07-23T10:00:00.000Z",
    searchAttributesEnabled: false,
    projectionChangesDir,
    // Empty archiveProjects lets the terminal signal handler run the projection
    // write without needing a real git worktree or archive proof.
    archiveProjects: [],
    seedState: {
      status: "draft",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf-8"));
}

describe("launcher projection aggregate (signal-driven)", () => {
  it("regenerates on mutating signals and excludes archived changes", async () => {
    const dir = await createTempDir("launcher-projection-itest-");
    try {
      await withTimeSkippingTestWorkflowEnvironment(async (env) => {
        const taskQueue = `launcher-projection-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          activities: { writeChangeProjection },
          taskQueue,
        });
        const projectionChangesDir = join(dir, "changes");
        const aggregatePath = join(dir, "active-launcher-state.json");
        const changeId = "launcher-signal-change";

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `launcher-projection-${Date.now()}`,
            taskQueue,
            args: [makeChangeInput(changeId, projectionChangesDir)],
          });

          // SC1: mutating signal writes per-change projection AND aggregate.
          await handle.signal(gateCompletedSignal, {
            gateId: "proposal",
            completedBy: "tester",
            completedAt: "2026-07-23T10:00:01.000Z",
            compatibilityReason:
              "launcher fixture validates aggregate, not artifact inspection",
          });

          await expect
            .poll(() =>
              readJson(join(projectionChangesDir, `${changeId}.json`)),
            )
            .toMatchObject({
              schemaVersion: 2,
              state: {
                changeId,
                gates: { proposal: { status: "done" } },
              },
            });

          await expect
            .poll(() => readJson(aggregatePath))
            .toMatchObject({
              schema_version: 1,
              source: "disk_projection",
              active_count: 1,
              changes: [{ id: changeId }],
            });

          // SC2: the aggregate is a plain file; read it directly from disk
          // without any Temporal query or workflow round-trip.
          const directAggregate = (await readJson(aggregatePath)) as {
            schema_version: number;
            source: string;
            active_count: number;
            changes: Array<{ id: string }>;
          };
          expect(directAggregate.schema_version).toBe(1);
          expect(directAggregate.source).toBe("disk_projection");
          expect(directAggregate.active_count).toBe(1);
          expect(directAggregate.changes.map((c) => c.id)).toContain(changeId);

          // SC3: archive/close signal regenerates aggregate excluding the change.
          await handle.signal(archiveRequestedSignal, {
            approvalEvidence: "archive for test",
            requestedBy: "tester",
            requestedAt: "2026-07-23T10:00:02.000Z",
          });

          await expect(handle.result()).resolves.toBeUndefined();

          await expect
            .poll(() => readJson(aggregatePath))
            .toMatchObject({
              active_count: 0,
              changes: [],
            });
        });
      });
    } finally {
      await cleanupTempDir(dir);
    }
  }, 30_000);
});
