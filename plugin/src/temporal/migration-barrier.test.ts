import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import { createDefaultGates } from "../types";
import type { ChangeWorkflowInput } from "./contracts";
import { getProcessedMarkersQuery, migrationMarkerSignal } from "./messages";
import { signalMigrationMarkerAndWait } from "./migration-replay";
import { withTestWorkflowEnvironment } from "./__tests__/with-test-env";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

function makeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "migration-barrier-test-project",
    changeId,
    title: "Migration barrier test",
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

describe("migration marker barrier", () => {
  it("waits until marker signals are visible to the processed-marker query over 10 runs", async () => {
    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const taskQueue = `migration-barrier-${Date.now()}`;
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowsPath,
          taskQueue,
        });

        await worker.runUntil(async () => {
          const handle = await env.client.workflow.start("changeWorkflow", {
            workflowId: `migration-barrier-${Date.now()}`,
            taskQueue,
            args: [makeInput("migrationBarrierChange")],
          });

          for (let i = 0; i < 10; i++) {
            const markerId = `marker-${i}`;
            await signalMigrationMarkerAndWait(handle, markerId, {
              timeoutMs: 10_000,
              pollIntervalMs: 10,
            });
          }

          const markers = await handle.query(getProcessedMarkersQuery);
          expect(markers).toHaveLength(10);
          expect(markers).toEqual(
            Array.from({ length: 10 }, (_, i) => `marker-${i}`),
          );

          await handle.signal(migrationMarkerSignal, { markerId: "final" });
          await signalMigrationMarkerAndWait(handle, "final", {
            timeoutMs: 10_000,
            pollIntervalMs: 10,
            signalFirst: false,
          });
        });
      },
    );
  }, 60_000);
});
