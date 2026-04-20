/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { Worker } from "@temporalio/worker";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "../../../..");

export const REPLAY_HISTORY_FILES = {
  syntheticChangeLifecycle: resolve(
    HERE,
    "histories/synthetic-change-lifecycle.json",
  ),
  syntheticReentryAndClosure: resolve(
    HERE,
    "histories/synthetic-reentry-and-closure.json",
  ),
  smokeCaptured: resolve(HERE, "histories/smoke-captured.json"),
} as const;

async function loadTemporalProtoPackage() {
  const pnpmRoot = join(PLUGIN_ROOT, "node_modules", ".pnpm");
  const entries = await readdir(pnpmRoot);
  const protoDir = entries.find((name) =>
    name.startsWith("@temporalio+proto@"),
  );
  if (!protoDir) {
    throw new Error("Unable to locate @temporalio/proto in pnpm virtual store");
  }
  const protoPath = join(
    pnpmRoot,
    protoDir,
    "node_modules",
    "@temporalio",
    "proto",
    "protos",
    "index.js",
  );
  return import(pathToFileURL(protoPath).href);
}

export async function replayWorkflowHistories(input: {
  histories: string[];
  workflowsPath?: string;
}): Promise<{ pass: boolean; replayed: number }> {
  const workflowsPath =
    input.workflowsPath ??
    fileURLToPath(new URL("../../workflows.ts", import.meta.url));
  const { temporal } = await loadTemporalProtoPackage();

  for (const file of input.histories) {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    const history = temporal.api.history.v1.History.fromObject(parsed);
    await Worker.runReplayHistory({ workflowsPath }, history as any);
  }

  return { pass: true, replayed: input.histories.length };
}
