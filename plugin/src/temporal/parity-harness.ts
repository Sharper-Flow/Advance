/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover is
 * complete. This module exists only to compare legacy and Temporal-backed
 * observable behavior during the validation phase.
 */

import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { Store } from "../storage/store";
import { createStore } from "../storage/store";
import { buildProjectTaskQueue } from "./client";

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
    legacyStore.close?.();
    temporalStore.close?.();
    await environment.teardown?.();
  }
}

export async function runStorageLayerParity<TOutput = unknown>(input: {
  projectDir: string;
  projectId: string;
  scenarios: SpecScenario<TOutput>[];
}): Promise<ParityRunResult> {
  const taskQueue = buildProjectTaskQueue(input.projectId);
  let worker: Worker | undefined;
  let runPromise: Promise<void> | undefined;

  return runParityScenarios({
    projectDir: input.projectDir,
    scenarios: input.scenarios,
    createTestWorkflowEnvironment: async () => {
      const env = await TestWorkflowEnvironment.createTimeSkipping();
      worker = await Worker.create({
        connection: env.nativeConnection,
        taskQueue,
        workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
        activities: {},
      });
      runPromise = worker.run();

      return {
        ...env,
        teardown: async () => {
          worker?.shutdown();
          await runPromise?.catch(() => undefined);
          await env.teardown();
        },
      } satisfies TestWorkflowEnvironmentLike;
    },
    createLegacyStore: async ({ projectDir }) => createStore(projectDir),
    createTemporalStore: async ({ projectDir, environment }) => {
      const env = environment as TestWorkflowEnvironment;
      return createStore(projectDir, {
        temporalBundle: {
          address: String(env.address),
          namespace: String(env.namespace),
          connection: env.connection,
          client: env.client,
        },
        projectIdOverride: input.projectId,
      });
    },
  });
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
