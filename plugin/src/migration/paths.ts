/**
 * paths — migration state location resolution (AC9/DDC5).
 *
 * The migration state root holds the cutover receipt, its audit log, and the
 * loaded-build session registry. It anchors to the DEPLOYMENT root (the
 * parent of the deployed plugin dir) so it is machine-global across `oc`
 * per-project XDG shards — every shard loads the same deployed plugin, so
 * the receipt and registry must be shared.
 *
 * Resolution order: `ADV_MIGRATION_STATE_DIR` (tests/ops override) → own
 * plugin root derived from the module location → the canonical deploy
 * location (`~/.local/share/Advance/migration`).
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  BUILD_IDENTITY_FILENAME,
  readBuildIdentityFile,
  resolveOwnPluginRoot,
  type BuildIdentity,
} from "./build-identity";

export const ADV_MIGRATION_STATE_DIR_ENV = "ADV_MIGRATION_STATE_DIR";
export const ADV_BUILD_IDENTITY_FILE_ENV = "ADV_BUILD_IDENTITY_FILE";

export function resolveMigrationRoot(input?: {
  env?: NodeJS.ProcessEnv;
  moduleUrl?: string;
  homeDir?: string;
}): string {
  const env = input?.env ?? process.env;
  const override = env[ADV_MIGRATION_STATE_DIR_ENV];
  if (override) return override;
  const pluginRoot = resolveOwnPluginRoot(input?.moduleUrl ?? import.meta.url);
  if (pluginRoot) return join(pluginRoot, "..", "migration");
  return join(
    input?.homeDir ?? homedir(),
    ".local",
    "share",
    "Advance",
    "migration",
  );
}

/**
 * Resolve this process's own build identity: the recorded identity file of
 * the bundle the code is running from. Null in dev/src mode (no dist) —
 * callers treat that as "identity unavailable" (never a match).
 */
export function resolveOwnBuildIdentity(input?: {
  env?: NodeJS.ProcessEnv;
  moduleUrl?: string;
}): BuildIdentity | null {
  const env = input?.env ?? process.env;
  const identityFile = env[ADV_BUILD_IDENTITY_FILE_ENV];
  if (identityFile) {
    return readBuildIdentityFile(identityFile);
  }
  const pluginRoot = resolveOwnPluginRoot(input?.moduleUrl ?? import.meta.url);
  if (!pluginRoot) return null;
  const path = join(pluginRoot, "dist", BUILD_IDENTITY_FILENAME);
  if (!existsSync(path)) return null;
  return readBuildIdentityFile(path);
}
