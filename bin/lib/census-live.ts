/** Live collection layer for the machine-wide census diagnostic. */

import { readdir, realpath, stat } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

import {
  resolveDataHomeRoot,
  type CensusInventory,
  type StoreInventoryEntry,
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

export interface LiveCensusOptions {
  dataHome?: string;
}

/** Collect disk inputs without mutating the machine-wide state. */
export async function loadLiveCensusInventory(
  options: LiveCensusOptions,
): Promise<CensusInventory> {
  const dataHome = resolveDataHomeRoot(
    options.dataHome ??
      process.env.XDG_DATA_HOME ??
      join(homedir(), ".local/share"),
  );
  const disk = await collectStores(dataHome);
  return {
    stores: disk.stores,
    storeInventoryComplete: disk.complete,
  };
}
