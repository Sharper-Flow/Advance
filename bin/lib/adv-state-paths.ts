/**
 * adv CLI — ADV project state directory resolution
 *
 * Disk projections are the sole read authority. The CLI locates a project's
 * state directory itself.
 *
 * Two layouts exist:
 *   canonical: {dataHome}/opencode/plugins/advance/{projectId}
 *   oc shard:  ~/.local/share/opencode-projects/{projectId}/opencode/plugins/advance/{projectId}
 *
 * The shard layout is used for projects opened through the `oc` wrapper. Shard
 * lookup deliberately uses the REAL home data dir rather than XDG_DATA_HOME:
 * `oc` sets XDG_DATA_HOME to the *current* project's shard, so honouring it
 * would nest one project's shard path inside another's.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { resolveExternalRoot } from "./project";

/**
 * Resolve a project's ADV state directory, preferring whichever layout
 * actually contains the requested subdirectory.
 *
 * @param projectId ADV project id
 * @param subdir subdirectory that must exist and be non-empty (e.g. "changes")
 * @returns absolute path to `{stateDir}/{subdir}`
 */
export function resolveAdvStateSubdir(
  projectId: string,
  subdir: string,
): string {
  const canonical = join(resolveExternalRoot(projectId), subdir);
  const shard = join(
    homedir(),
    ".local",
    "share",
    "opencode-projects",
    projectId,
    "opencode",
    "plugins",
    "advance",
    projectId,
    subdir,
  );
  try {
    return readdirSync(canonical).length > 0 ? canonical : shard;
  } catch {
    return shard;
  }
}
