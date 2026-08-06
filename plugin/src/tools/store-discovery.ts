/** Shared disk-store discovery for maintenance tools. */

import { readdir } from "fs/promises";
import { basename, dirname, join } from "path";
import { getDataHome } from "../utils/project-id";

const SHA40 = /^[0-9a-f]{40}$/;

export const CONSOLIDATION_LEDGER_FILENAME = "consolidation-ledger.jsonl";

export interface StoreDirRef {
  projectId: string;
  path: string;
  layout: "legacy" | "shard";
  shard: string | null;
}

export interface LayoutWalk {
  layout: "legacy" | "shard";
  root: string;
  exists: boolean;
}

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

/** Resolve the directory holding both legacy and per-project store layouts. */
export function defaultDataHomeRoot(): string {
  const dataHome = getDataHome();
  const leaf = basename(dataHome);
  const parent = basename(dirname(dataHome));
  if (parent === "opencode-projects" && SHA40.test(leaf)) {
    return dirname(dirname(dataHome));
  }
  return dataHome;
}

/** Enumerate discoverable ADV stores without mutating or requiring them. */
export async function walkStoreDirs(dataHomeRoot: string): Promise<{
  stores: StoreDirRef[];
  layouts: LayoutWalk[];
}> {
  const stores: StoreDirRef[] = [];
  const layouts: LayoutWalk[] = [];

  const legacyRoot = join(dataHomeRoot, "opencode/plugins/advance");
  const legacyNames = await readdirSafe(legacyRoot);
  layouts.push({
    layout: "legacy",
    root: legacyRoot,
    exists: await pathExists(legacyRoot),
  });
  for (const name of legacyNames) {
    stores.push({
      projectId: name,
      path: join(legacyRoot, name),
      layout: "legacy",
      shard: null,
    });
  }

  const shardsRoot = join(dataHomeRoot, "opencode-projects");
  layouts.push({
    layout: "shard",
    root: shardsRoot,
    exists: await pathExists(shardsRoot),
  });
  for (const shard of await readdirSafe(shardsRoot)) {
    const advanceRoot = join(shardsRoot, shard, "opencode/plugins/advance");
    for (const name of await readdirSafe(advanceRoot)) {
      stores.push({
        projectId: name,
        path: join(advanceRoot, name),
        layout: "shard",
        shard,
      });
    }
  }

  return { stores, layouts };
}
