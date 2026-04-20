/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover is
 * complete. This module exists only to compare legacy and Temporal-backed
 * observable behavior during the validation phase.
 */

import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { Store } from "../storage/store";
import { createLegacyStore, createStore } from "../storage/store";
import { buildProjectTaskQueue } from "./client";
import { ensureChangeWorkflowStarted } from "./migration";

export type BackendKind = "legacy" | "temporal";

export interface ParityMismatch {
  path: string;
  legacy: unknown;
  temporal: unknown;
}

export interface SpecScenario<TOutput = unknown> {
  id: string;
  title: string;
  requirementIds?: string[];
  run: (context: {
    store: Store;
    backend: BackendKind;
    projectDir: string;
    environment: unknown;
  }) => Promise<TOutput> | TOutput;
  compare?: (legacy: TOutput, temporal: TOutput) => ParityMismatch[];
}

export interface ParityScenarioResult {
  id: string;
  title: string;
  requirementIds?: string[];
  status: "PASS" | "FAIL";
  mismatches: ParityMismatch[];
}

export interface ParityRunSummary {
  total: number;
  passed: number;
  failed: number;
}

export interface ParityRunResult {
  summary: ParityRunSummary;
  results: ParityScenarioResult[];
}

export interface TestWorkflowEnvironmentLike {
  teardown?: () => Promise<void> | void;
}

export async function runParityScenarios<TOutput = unknown>(input: {
  projectDir: string;
  scenarios: SpecScenario<TOutput>[];
  createTestWorkflowEnvironment: () => Promise<TestWorkflowEnvironmentLike>;
  createLegacyStore: (args: { projectDir: string }) => Promise<Store>;
  createTemporalStore: (args: {
    projectDir: string;
    environment: TestWorkflowEnvironmentLike;
  }) => Promise<Store>;
}): Promise<ParityRunResult> {
  const environment = await input.createTestWorkflowEnvironment();
  const legacyStore = await input.createLegacyStore({
    projectDir: input.projectDir,
  });
  const temporalStore = await input.createTemporalStore({
    projectDir: input.projectDir,
    environment,
  });

  try {
    const results: ParityScenarioResult[] = [];

    for (const scenario of input.scenarios) {
      const legacy = await scenario.run({
        store: legacyStore,
        backend: "legacy",
        projectDir: input.projectDir,
        environment,
      });
      const temporal = await scenario.run({
        store: temporalStore,
        backend: "temporal",
        projectDir: input.projectDir,
        environment,
      });

      const mismatches = scenario.compare
        ? scenario.compare(legacy, temporal)
        : diffValues(legacy, temporal);

      results.push({
        id: scenario.id,
        title: scenario.title,
        requirementIds: scenario.requirementIds,
        status: mismatches.length === 0 ? "PASS" : "FAIL",
        mismatches,
      });
    }

    const failed = results.filter((r) => r.status === "FAIL").length;
    const passed = results.length - failed;

    return {
      summary: {
        total: results.length,
        passed,
        failed,
      },
      results,
    };
  } finally {
    // Run all teardown steps even if earlier steps throw, so the
    // TestWorkflowEnvironment is never leaked when one store close fails.
    try {
      legacyStore.close?.();
    } catch {
      // best-effort; teardown must still run
    }
    try {
      temporalStore.close?.();
    } catch {
      // best-effort; teardown must still run
    }
    await environment.teardown?.();
  }
}

export async function runStorageLayerParity<TOutput = unknown>(input: {
  projectDir: string;
  projectId: string;
  externalRoot?: string;
  scenarios: SpecScenario<TOutput>[];
}): Promise<ParityRunResult> {
  const tempRoot = await mkdtemp(join(tmpdir(), `${input.projectId}-parity-`));
  const isolatedExternalRoot = join(tempRoot, "state");
  if (input.externalRoot) {
    await cp(input.externalRoot, isolatedExternalRoot, { recursive: true });
  } else {
    await mkdir(isolatedExternalRoot, { recursive: true });
  }

  const taskQueue = buildProjectTaskQueue(input.projectId);
  let worker: Worker | undefined;
  let runPromise: Promise<void> | undefined;
  let bootstrapLegacy: Store | undefined;

  try {
    return await runParityScenarios({
      projectDir: input.projectDir,
      scenarios: input.scenarios,
      createTestWorkflowEnvironment: async () => {
        const env = await TestWorkflowEnvironment.createTimeSkipping();
        worker = await Worker.create({
          connection: env.nativeConnection,
          taskQueue,
          workflowsPath: fileURLToPath(
            new URL("./workflows.ts", import.meta.url),
          ),
          activities: {},
        });
        runPromise = worker.run();

        return {
          ...env,
          teardown: async () => {
            // Initiate worker shutdown, then await both the shutdown signal and
            // the run promise so the worker is fully drained before the
            // TestWorkflowEnvironment is torn down.
            await worker?.shutdown();
            await runPromise?.catch(() => undefined);
            try {
              bootstrapLegacy?.close?.();
            } catch {
              // best-effort; env teardown must still run
            }
            await env.teardown();
          },
        } satisfies TestWorkflowEnvironmentLike;
      },
      createLegacyStore: async ({ projectDir }) =>
        createStore(projectDir, { externalRoot: isolatedExternalRoot }),
      createTemporalStore: async ({ projectDir, environment }) => {
        const env = environment as TestWorkflowEnvironment;
        const baseTemporal = await createStore(projectDir, {
          externalRoot: isolatedExternalRoot,
          temporalBundle: {
            address: String(env.address),
            namespace: String(env.namespace),
            connection: env.connection,
            client: env.client,
          },
          projectIdOverride: input.projectId,
        });

        bootstrapLegacy = await createLegacyStore(projectDir, {
          externalRoot: isolatedExternalRoot,
        });

        return {
          ...baseTemporal,
          changes: {
            ...baseTemporal.changes,
            create: async (
              summary: string,
              capability?: string,
              proposalContent?: string,
              problemStatementContent?: string,
              agreementContent?: string,
              designContent?: string,
            ) => {
              const created = await bootstrapLegacy!.changes.create(
                summary,
                capability,
                proposalContent,
                problemStatementContent,
                agreementContent,
                designContent,
              );

              await ensureChangeWorkflowStarted(
                {
                  workflow: env.client.workflow as unknown as Parameters<
                    typeof ensureChangeWorkflowStarted
                  >[0]["workflow"],
                },
                {
                  projectId: input.projectId,
                  changeId: created.changeId,
                  title: summary,
                  initializedAt: new Date().toISOString(),
                },
              );

              return created;
            },
          },
        } satisfies Store;
      },
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function diffValues(
  legacy: unknown,
  temporal: unknown,
  path = "",
): ParityMismatch[] {
  if (isDeepStrictEqual(legacy, temporal)) {
    return [];
  }

  if (
    typeof legacy !== "object" ||
    legacy === null ||
    typeof temporal !== "object" ||
    temporal === null
  ) {
    return [
      {
        path: path || "$",
        legacy,
        temporal,
      },
    ];
  }

  if (Array.isArray(legacy) || Array.isArray(temporal)) {
    if (!Array.isArray(legacy) || !Array.isArray(temporal)) {
      return [
        {
          path: path || "$",
          legacy,
          temporal,
        },
      ];
    }

    const mismatches: ParityMismatch[] = [];
    const maxLength = Math.max(legacy.length, temporal.length);
    for (let i = 0; i < maxLength; i++) {
      mismatches.push(
        ...diffValues(legacy[i], temporal[i], `${path || "$"}[${i}]`),
      );
    }
    return mismatches;
  }

  const legacyRecord = legacy as Record<string, unknown>;
  const temporalRecord = temporal as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(legacyRecord),
    ...Object.keys(temporalRecord),
  ]);

  const mismatches: ParityMismatch[] = [];
  for (const key of keys) {
    const nextPath = path ? `${path}.${key}` : key;
    mismatches.push(
      ...diffValues(legacyRecord[key], temporalRecord[key], nextPath),
    );
  }
  return mismatches;
}
