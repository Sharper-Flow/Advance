/**
 * build-identity — immutable deployed-build identity (AC9/DDC5, C5).
 *
 * The cutover receipt binds to a CONTENT digest of the deployed `dist/` tree,
 * never to mtimes, versions, or prose. `computeBuildIdentity` hashes every
 * file under `dist/` recursively (deterministic path order) into one
 * composite sha256 digest; `writeBuildIdentityFile` records it as
 * `dist/build-identity.json` at build time; `verifyDeployedBuildIdentity`
 * recomputes the deployed tree and compares — any drift (partial deploy,
 * manual patch, stale checkout) makes the build stale, and a stale or
 * unknown identity blocks cutover-receipt activation.
 *
 * The digest also gives cross-checkout comparability: a foreign worker
 * process (started from a dev checkout) can only be treated as
 * current when its own recorded identity digest equals the deployed digest.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const BUILD_IDENTITY_SCHEMA_VERSION = 1;
export const BUILD_IDENTITY_FILENAME = "build-identity.json";

export const BuildIdentityFileEntrySchema = z
  .object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export type BuildIdentityFileEntry = z.infer<
  typeof BuildIdentityFileEntrySchema
>;

export const BuildIdentitySchema = z
  .object({
    schemaVersion: z.literal(BUILD_IDENTITY_SCHEMA_VERSION),
    /** Composite digest: sha256 over `path\0sha256\0bytes\n` lines. */
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    files: z.array(BuildIdentityFileEntrySchema).min(1),
    computedAt: z.string().min(1),
    pluginRoot: z.string().min(1),
  })
  .strict();
export type BuildIdentity = z.infer<typeof BuildIdentitySchema>;

function listDistFiles(distDir: string, prefix = ""): string[] {
  const out: string[] = [];
  const entries = readdirSync(join(distDir, prefix), {
    withFileTypes: true,
  }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listDistFiles(distDir, rel));
    } else if (entry.isFile()) {
      if (rel === BUILD_IDENTITY_FILENAME) continue; // excludes itself
      out.push(rel);
    }
  }
  return out;
}

/**
 * Compute the immutable content identity of a plugin tree's `dist/`.
 * Throws when `dist/` is absent or empty — a plugin without a build cannot
 * have an identity.
 */
export function computeBuildIdentity(pluginRoot: string): BuildIdentity {
  const distDir = join(pluginRoot, "dist");
  if (!existsSync(distDir)) {
    throw new Error(
      `cannot compute build identity: dist directory missing at ${distDir}`,
    );
  }
  const relPaths = listDistFiles(distDir);
  if (relPaths.length === 0) {
    throw new Error(
      `cannot compute build identity: dist directory empty at ${distDir}`,
    );
  }
  const composite = createHash("sha256");
  const files: BuildIdentityFileEntry[] = [];
  for (const rel of relPaths) {
    const content = readFileSync(join(distDir, rel));
    const sha256 = createHash("sha256").update(content).digest("hex");
    files.push({ path: rel, sha256, bytes: content.byteLength });
    composite.update(`${rel}\0${sha256}\0${content.byteLength}\n`);
  }
  return {
    schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION,
    digest: `sha256:${composite.digest("hex")}`,
    files,
    computedAt: new Date().toISOString(),
    pluginRoot: resolve(pluginRoot),
  };
}

/**
 * Compute and atomically record the build identity into
 * `dist/build-identity.json` (tmp write + rename). Invoked at build time so
 * the artifact deploys with the bundle it describes.
 */
export function writeBuildIdentityFile(
  pluginRoot: string,
  opts: { now?: Date } = {},
): BuildIdentity {
  const identity = computeBuildIdentity(pluginRoot);
  if (opts.now) identity.computedAt = opts.now.toISOString();
  const target = join(pluginRoot, "dist", BUILD_IDENTITY_FILENAME);
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(identity, null, 2) + "\n");
  renameSync(tmp, target);
  return identity;
}

/**
 * Read and validate a build-identity file. Returns null when the file is
 * missing, unparseable, or fails schema validation — unknown identity must
 * never be treated as a match.
 */
export function readBuildIdentityFile(
  identityFilePath: string,
): BuildIdentity | null {
  let raw: string;
  try {
    raw = readFileSync(identityFilePath, "utf8");
  } catch {
    return null;
  }
  try {
    return BuildIdentitySchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export type DeployedBuildVerification =
  | { status: "match"; identity: BuildIdentity }
  | { status: "stale"; identity: BuildIdentity; recomputedDigest: string }
  | { status: "missing" }
  | { status: "malformed" };

/**
 * Compare the deployed tree's recorded identity against its recomputed
 * content. `stale` means the recorded file exists and validates but the
 * deployed content drifted — cutover activation must block.
 */
export function verifyDeployedBuildIdentity(
  pluginRoot: string,
): DeployedBuildVerification {
  const identityPath = join(pluginRoot, "dist", BUILD_IDENTITY_FILENAME);
  if (!existsSync(identityPath)) return { status: "missing" };
  const identity = readBuildIdentityFile(identityPath);
  if (!identity) return { status: "malformed" };
  let recomputed: BuildIdentity;
  try {
    recomputed = computeBuildIdentity(pluginRoot);
  } catch {
    return { status: "missing" };
  }
  if (recomputed.digest !== identity.digest) {
    return { status: "stale", identity, recomputedDigest: recomputed.digest };
  }
  return { status: "match", identity };
}

/**
 * Resolve the plugin root from a module URL. Works from the bundled
 * `dist/index.js` (basename dirname is `dist`) and from a dev checkout
 * (`src/migration/*.ts` → two levels up). Returns null when no `dist/` tree
 * is discoverable (pure-src execution without a build).
 */
export function resolveOwnPluginRoot(moduleUrl: string): string | null {
  const here = fileURLToPath(moduleUrl);
  const dir = dirname(here);
  if (basename(dir) === "dist") {
    return dirname(dir);
  }
  const fromSrcMigration = resolve(dir, "..", "..");
  if (existsSync(join(fromSrcMigration, "dist"))) {
    return fromSrcMigration;
  }
  const fromSrc = dirname(dir);
  if (basename(dir) === "src" && existsSync(join(fromSrc, "dist"))) {
    return fromSrc;
  }
  return null;
}

/**
 * mtime (ms) of the deployed build-identity file, or null when absent. Used
 * as the install-time anchor for deployed worker-process staleness: rsync
 * content-preserving deploys replace the file's inode, so its change time
 * reflects when this build landed on the machine.
 */
export function buildIdentityInstalledAtMs(pluginRoot: string): number | null {
  try {
    return statSync(join(pluginRoot, "dist", BUILD_IDENTITY_FILENAME)).ctimeMs;
  } catch {
    return null;
  }
}
