/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the cutover decision is made.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { runStorageLayerParity } from "../../parity-harness";
import { STORAGE_LAYER_SCENARIOS } from "../../parity-scenarios";

const OUTPUT = process.env.ADV_VALIDATION_OUTPUT;

describe("parity collector", () => {
  let env: TestWorkflowEnvironment;
  let worker: Worker;
  let runPromise: Promise<void> | undefined;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
    worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue: "advance-validate-parity",
      workflowsPath: fileURLToPath(new URL("../../workflows.ts", import.meta.url)),
      activities: {},
    });
    runPromise = worker.run();
  });

  afterAll(async () => {
    worker.shutdown();
    await runPromise?.catch(() => undefined);
    await env.teardown();
  });

  it("runs all storage-layer parity scenarios and emits JSON evidence", async () => {
    const result = await runStorageLayerParity({
      projectDir: fileURLToPath(new URL("../../../../..", import.meta.url)),
      projectId: "bdf259aa162ae192af5b18899ccdc653b085528d",
      scenarios: STORAGE_LAYER_SCENARIOS,
    });

    const unresolvedMismatches = result.results.reduce(
      (n, r) => n + r.mismatches.length,
      0,
    );

    if (OUTPUT) {
      await writeFile(
        OUTPUT,
        JSON.stringify(
          {
            pass: result.summary.failed === 0 && unresolvedMismatches === 0,
            unresolvedMismatches,
            scenarioCount: result.summary.total,
            results: result.results,
          },
          null,
          2,
        ),
      );
    }

    expect(result.summary.total).toBe(6);
    expect(result.summary.failed).toBe(0);
    expect(unresolvedMismatches).toBe(0);
  }, 30_000);
});
