/**
 * Plugin bundle generation manifest.
 *
 * The host-loaded plugin bundle (`dist/index.js`) is evaluated once per OpenCode
 * session. The build emits a generation *before* bundling, embeds it into the
 * bundle via a tsup `define`, and then records the final `index.js` SHA-256 in
 * an atomic sidecar manifest (`dist/plugin-bundle-manifest.json`). At runtime
 * the embedded generation is compared against the deployed manifest generation
 * to detect stale plugin bundles without relying on filesystem timestamps.
 *
 * Generation contract:
 *   - `generation` is an opaque pre-bundle token (64-char hex). It is defined
 *     before the bundler runs and never recomputed from the final bytes.
 *   - `files.index` is the SHA-256 of the final `index.js` and is diagnostic
 *     only; equality of `generation` is the staleness authority.
 *   - The manifest is written LAST (after `index.js` exists) via temp-file +
 *     rename so concurrent readers never observe a partial write.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_BUNDLE_MANIFEST_FILENAME = "plugin-bundle-manifest.json";
export const PLUGIN_BUNDLE_MANIFEST_SCHEMA_VERSION = 1;

export const PLUGIN_BUNDLE_STALE_ADVISORY = "PLUGIN_BUNDLE_STALE";

export type PluginBundleFile = "index";

export interface PluginBundleManifest {
  schema_version: typeof PLUGIN_BUNDLE_MANIFEST_SCHEMA_VERSION;
  /** Opaque pre-bundle generation token. */
  generation: string;
  /** Per-file SHA-256 hex digests keyed by bundle file name. */
  files: Record<PluginBundleFile, string>;
  /** ISO timestamp of when the manifest was written. */
  built_at: string;
}

export type PluginBundleFreshnessState = "current" | "stale" | "unknown";

export interface PluginBundleFreshness {
  state: PluginBundleFreshnessState;
  loadedGeneration: string | null;
  deployedGeneration: string | null;
  deployedIndexSha256: string | null;
  reason: string | null;
  recovery: string | null;
  advisoryType?: typeof PLUGIN_BUNDLE_STALE_ADVISORY;
}

export interface WritePluginBundleManifestOptions {
  now?: () => Date;
}

// Injected by the production build (`scripts/build-plugin.ts`). In dev/test
// source execution it is undefined, so the loaded generation is null.
declare const __ADV_PLUGIN_BUNDLE_GENERATION__: string | undefined;

const capturedPluginBundleGeneration: string | null =
  typeof __ADV_PLUGIN_BUNDLE_GENERATION__ !== "undefined" &&
  __ADV_PLUGIN_BUNDLE_GENERATION__
    ? __ADV_PLUGIN_BUNDLE_GENERATION__
    : null;

/**
 * Return the generation embedded into the loaded plugin bundle at build time.
 * Returns null when the bundle was not built with a generation (e.g. dev
 * source runs or pre-feature builds).
 */
export function getLoadedPluginBundleGeneration(): string | null {
  return capturedPluginBundleGeneration;
}

/**
 * Generate an opaque pre-bundle generation token.
 */
export function generatePluginBundleGeneration(): string {
  return randomBytes(32).toString("hex");
}

async function hashFileSha256(path: string): Promise<string> {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

/**
 * Hash the plugin bundle's `index.js` and atomically write the manifest into
 * `distDir`. Must run AFTER the bundler has finished writing `index.js` (the
 * manifest is the LAST write of the plugin build). Throws when `index.js` is
 * missing — a build that cannot produce the plugin bundle must not produce a
 * manifest.
 */
export async function writePluginBundleManifest(
  distDir: string,
  generation: string,
  options: WritePluginBundleManifestOptions = {},
): Promise<PluginBundleManifest> {
  const indexPath = join(distDir, "index.js");
  const indexSha256 = await hashFileSha256(indexPath).catch(
    (err: NodeJS.ErrnoException) => {
      throw new Error(
        `Cannot write plugin bundle manifest: index.js is missing from ${distDir} (${err.code ?? err.message}).`,
      );
    },
  );

  const builtAt = (options.now ?? (() => new Date()))().toISOString();
  const manifest: PluginBundleManifest = {
    schema_version: PLUGIN_BUNDLE_MANIFEST_SCHEMA_VERSION,
    generation,
    files: { index: indexSha256 },
    built_at: builtAt,
  };

  const manifestPath = join(distDir, PLUGIN_BUNDLE_MANIFEST_FILENAME);
  const tmpPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(manifest, null, 2));
  await rename(tmpPath, manifestPath);

  return manifest;
}

/**
 * Read and validate the plugin bundle manifest. Returns null when the manifest
 * is absent, unparsable, empty, or fails schema validation — callers treat an
 * unreadable manifest as "generation unknown" and never report stale on it.
 */
export async function readPluginBundleManifest(
  distDir: string,
): Promise<PluginBundleManifest | null> {
  const manifestPath = join(distDir, PLUGIN_BUNDLE_MANIFEST_FILENAME);
  const raw = await readFile(manifestPath, "utf8").catch(() => null);
  if (!raw || !raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const candidate = parsed as Partial<PluginBundleManifest>;
  if (candidate.schema_version !== PLUGIN_BUNDLE_MANIFEST_SCHEMA_VERSION) {
    return null;
  }
  if (
    typeof candidate.generation !== "string" ||
    !/^[0-9a-f]{64}$/.test(candidate.generation)
  ) {
    return null;
  }
  if (
    !candidate.files ||
    typeof candidate.files !== "object" ||
    typeof (candidate.files as Record<string, unknown>).index !== "string" ||
    !/^[0-9a-f]{64}$/.test((candidate.files as Record<string, string>).index)
  ) {
    return null;
  }
  if (
    typeof candidate.built_at !== "string" ||
    !isCanonicalIsoTimestamp(candidate.built_at)
  ) {
    return null;
  }

  return candidate as PluginBundleManifest;
}

/** The manifest contract requires the canonical ISO string emitted by Date. */
function isCanonicalIsoTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

const RESTART_RECOVERY = "Restart OpenCode to load the current plugin bundle.";
const UNKNOWN_RECOVERY =
  "Manifest state is unreadable; verify deployment and restart OpenCode if stale behavior persists.";

/**
 * Compare the loaded plugin bundle generation against the deployed manifest.
 * Returns a bounded freshness verdict with recovery guidance. Never throws.
 */
export function comparePluginBundleGenerations(
  loadedGeneration: string | null,
  deployedManifest: PluginBundleManifest | null,
): PluginBundleFreshness {
  if (loadedGeneration === null) {
    return {
      state: "unknown",
      loadedGeneration: null,
      deployedGeneration: deployedManifest?.generation ?? null,
      deployedIndexSha256: deployedManifest?.files.index ?? null,
      reason: "missing_loaded_generation",
      recovery: UNKNOWN_RECOVERY,
    };
  }

  if (deployedManifest === null) {
    return {
      state: "unknown",
      loadedGeneration,
      deployedGeneration: null,
      deployedIndexSha256: null,
      reason: "missing_manifest",
      recovery: UNKNOWN_RECOVERY,
    };
  }

  if (loadedGeneration === deployedManifest.generation) {
    return {
      state: "current",
      loadedGeneration,
      deployedGeneration: deployedManifest.generation,
      deployedIndexSha256: deployedManifest.files.index,
      reason: null,
      recovery: null,
    };
  }

  return {
    state: "stale",
    advisoryType: PLUGIN_BUNDLE_STALE_ADVISORY,
    loadedGeneration,
    deployedGeneration: deployedManifest.generation,
    deployedIndexSha256: deployedManifest.files.index,
    reason: "generation_mismatch",
    recovery: RESTART_RECOVERY,
  };
}

/**
 * Read the deployed manifest and compare it against the loaded plugin bundle
 * generation. The optional `loadedGenerationOverride` supports tests; when
 * omitted, the generation captured at module evaluation is used.
 */
export async function getPluginBundleFreshness(
  distDir: string,
  loadedGenerationOverride?: string,
): Promise<PluginBundleFreshness> {
  const loaded = loadedGenerationOverride ?? getLoadedPluginBundleGeneration();
  const deployed = await readPluginBundleManifest(distDir);
  return comparePluginBundleGenerations(loaded, deployed);
}

/**
 * Resolve the Advance plugin root directory from the location of this module.
 *
 * This module lives at `plugin/src/plugin-bundle-manifest.ts` in source and is
 * bundled into `plugin/dist/index.js` (or a sibling `plugin/dist/chunk-*.js`)
 * at runtime. In both contexts the parent directory of the module's directory
 * is the plugin root (`.../advance/plugin`), never the repo root.
 */
export function getPluginRoot(moduleUrl: string = import.meta.url): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "..");
}

/**
 * Resolve the `plugin/dist` directory that hosts the deployed bundle and its
 * sidecar manifest. Centralizes the path calculation so callers do not drift
 * between source and bundled runtime contexts.
 */
export function getPluginBundleDistDir(
  moduleUrl: string = import.meta.url,
): string {
  return resolve(getPluginRoot(moduleUrl), "dist");
}
