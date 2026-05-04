import { readFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const loadedModulePath = fileURLToPath(import.meta.url);
const pluginRoot = resolve(dirname(loadedModulePath), "../..");
const processStartedAt = new Date(
  Date.now() - Math.round(process.uptime() * 1000),
).toISOString();

export type PluginRuntimeInfo = {
  loaded_module_path: string;
  process_started_at: string;
  build_marker_path: string;
  build_marker_found: boolean;
  build_marker?: unknown;
  worker_script_path: string;
  reload_caveat: string;
};

export async function getPluginRuntimeInfo(): Promise<PluginRuntimeInfo> {
  const buildMarkerPath = resolve(pluginRoot, "dist", "oca-build.json");
  const workerScriptPath = resolve(pluginRoot, "dist", "temporal", "worker.js");
  let buildMarker: unknown;
  let buildMarkerFound = false;
  try {
    buildMarker = JSON.parse(await readFile(buildMarkerPath, "utf8"));
    buildMarkerFound = true;
  } catch {
    buildMarker = undefined;
  }

  return {
    loaded_module_path: loadedModulePath,
    process_started_at: processStartedAt,
    build_marker_path: buildMarkerPath,
    build_marker_found: buildMarkerFound,
    ...(buildMarkerFound ? { build_marker: buildMarker } : {}),
    worker_script_path: workerScriptPath,
    reload_caveat:
      "Restart OpenCode after rebuilding Advance; host-loaded plugin tool code is not hot-reloaded.",
  };
}
