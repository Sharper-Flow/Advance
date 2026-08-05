/** Live collection layer for the machine-wide census diagnostic. */

import { readdir, readFile, realpath, stat } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

import {
  makeTemporalOperationContext,
  withTemporalOperations,
  type TemporalOperations,
} from "../../plugin/src/cli/temporal-boundary";
import { QUERY_TIMEOUT_MS } from "./live-status";
import {
  resolveDataHomeRoot,
  type CensusInventory,
  type StoreInventoryEntry,
  type TemporalInventoryStatus,
  type WorkflowInventoryRow,
} from "./census";

interface ReadDirectoryResult {
  entries: string[];
  complete: boolean;
}

async function readDirectory(path: string): Promise<ReadDirectoryResult> {
  try {
    return { entries: await readdir(path), complete: true };
  } catch (error) {
    // A missing optional root is a complete empty result; permission and
    // filesystem errors are incomplete so absence cannot become evidence.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { entries: [], complete: true };
    }
    return { entries: [], complete: false };
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function collectEntries(
  root: string,
  position: StoreInventoryEntry["position"],
): Promise<{ stores: StoreInventoryEntry[]; complete: boolean }> {
  const listing = await readDirectory(root);
  const stores: StoreInventoryEntry[] = [];
  for (const entry of listing.entries) {
    const path = join(root, entry);
    try {
      const resolvedPath = await realpath(path);
      if (!(await isDirectory(resolvedPath))) continue;
      stores.push({ entry, path, resolvedPath, position });
    } catch {
      // Broken links are not existing stores and are not identity findings.
    }
  }
  return { stores, complete: listing.complete };
}

async function collectStores(dataHome: string): Promise<{
  stores: StoreInventoryEntry[];
  complete: boolean;
}> {
  const legacy = await collectEntries(
    join(dataHome, "opencode/plugins/advance"),
    { kind: "legacy" },
  );
  const shardsRoot = join(dataHome, "opencode-projects");
  const shardListing = await readDirectory(shardsRoot);
  const stores = [...legacy.stores];
  let complete = legacy.complete && shardListing.complete;

  for (const shardId of shardListing.entries) {
    const shardAdvanceRoot = join(
      shardsRoot,
      shardId,
      "opencode/plugins/advance",
    );
    if (!(await isDirectory(shardAdvanceRoot))) continue;
    const shard = await collectEntries(shardAdvanceRoot, {
      kind: "shard",
      shardId,
    });
    stores.push(...shard.stores);
    complete = complete && shard.complete;
  }
  return { stores, complete };
}

async function collectArchiveChangeIds(
  stores: StoreInventoryEntry[],
): Promise<{ ids: Set<string>; complete: boolean }> {
  const ids = new Set<string>();
  let complete = true;
  const seen = new Set<string>();
  for (const store of stores) {
    if (seen.has(store.resolvedPath)) continue;
    seen.add(store.resolvedPath);
    const archiveListing = await readDirectory(join(store.path, "archive"));
    complete = complete && archiveListing.complete;
    for (const bundleName of archiveListing.entries) {
      const bundlePath = join(store.path, "archive", bundleName);
      if (!(await isDirectory(bundlePath))) continue;
      try {
        const raw = await readFile(join(bundlePath, "change.json"), "utf8");
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "id" in parsed &&
          typeof parsed.id === "string" &&
          bundleName.endsWith(`-${parsed.id}`)
        ) {
          ids.add(parsed.id);
        }
      } catch {
        // An unreadable/non-bundle directory is not positive archive evidence.
      }
    }
  }
  return { ids, complete };
}

async function listRunningWorkflows(
  owner: TemporalOperations,
  projectId: string,
  timeoutMs: number,
  workflowType: WorkflowInventoryRow["workflowType"],
): Promise<WorkflowInventoryRow[]> {
  const query =
    workflowType === "changeWorkflow"
      ? 'WorkflowType = "changeWorkflow" AND ExecutionStatus = "Running"'
      : 'WorkflowType = "epicWorkflow" AND ExecutionStatus = "Running"';
  const result = await owner.list<{ workflowId: string }>(
    makeTemporalOperationContext(
      projectId,
      `adv/census/${workflowType}`,
      "list",
      "bin.census.listRunningWorkflows",
      timeoutMs,
    ),
    query,
    { limit: 1_000_000 },
  );
  if (result.kind !== "complete") {
    throw result.error;
  }
  return result.value.map((row) => ({
    workflowId: row.workflowId,
    workflowType,
    executionStatus: "Running",
  }));
}

async function collectTemporal(
  projectId: string | null,
  timeoutMs: number,
): Promise<{
  workflows: WorkflowInventoryRow[];
  status: TemporalInventoryStatus;
}> {
  if (!projectId) {
    return {
      workflows: [],
      status: {
        kind: "unavailable",
        error:
          "not in a git repo (or git unavailable); Temporal census skipped",
      },
    };
  }
  try {
    const workflows = await withTemporalOperations(
      projectId,
      async (owner) => {
        const [changes, epics] = await Promise.all([
          listRunningWorkflows(owner, projectId, timeoutMs, "changeWorkflow"),
          listRunningWorkflows(owner, projectId, timeoutMs, "epicWorkflow"),
        ]);
        return [...changes, ...epics];
      },
      undefined,
      { connectTimeoutMs: timeoutMs },
    );
    return { workflows, status: { kind: "complete" } };
  } catch (error) {
    return {
      workflows: [],
      status: {
        kind: "unavailable",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export interface LiveCensusOptions {
  dataHome?: string;
  temporalProjectId: string | null;
  timeoutMs?: number;
}

/** Collect disk and live Temporal inputs without mutating either source. */
export async function loadLiveCensusInventory(
  options: LiveCensusOptions,
): Promise<CensusInventory> {
  const dataHome = resolveDataHomeRoot(
    options.dataHome ??
      process.env.XDG_DATA_HOME ??
      join(homedir(), ".local/share"),
  );
  const timeoutMs = options.timeoutMs ?? QUERY_TIMEOUT_MS;
  const disk = await collectStores(dataHome);
  const archives = await collectArchiveChangeIds(disk.stores);
  const temporal = await collectTemporal(options.temporalProjectId, timeoutMs);
  return {
    stores: disk.stores,
    workflows: temporal.workflows,
    archiveChangeIds: archives.ids,
    storeInventoryComplete: disk.complete && archives.complete,
    temporal: temporal.status,
  };
}
