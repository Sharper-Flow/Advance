/**
 * Plugin bundle generation manifest.
 *
 * The host-loaded plugin bundle (`dist/index.js`) and the ADV MCP server
 * (`dist/mcp-server.js`) are evaluated by the OpenCode host and Vision's
 * Node process respectively. The build emits a generation *before* bundling,
 * embeds it into the bundles via a tsup `define`, and then records the final
 * `index.js` and `mcp-server.js` SHA-256s in an atomic sidecar manifest
 * (`dist/plugin-bundle-manifest.json`). At runtime the embedded generation is
 * compared against the deployed manifest generation to detect stale bundles.
 *
 * Generation contract:
 *   - `generation` is an opaque pre-bundle token (64-char hex). It is defined
 *     before the bundler runs and never recomputed from the final bytes.
 *   - `files.index` is the SHA-256 of the final `index.js` and is diagnostic
 *     only; equality of `generation` is the staleness authority.
 *   - `files.mcp-server` and `files.reconcile-cli` are SHA-256s of their final
 *     bundles and are diagnostic only.
 *   - The manifest is written LAST (after both bundle files exist) via temp-file
 *     + rename so concurrent readers never observe a partial write.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_BUNDLE_MANIFEST_FILENAME = "plugin-bundle-manifest.json";
export const PLUGIN_BUNDLE_MANIFEST_SCHEMA_VERSION = 1;

export const PLUGIN_BUNDLE_STALE_ADVISORY = "PLUGIN_BUNDLE_STALE";

export type PluginBundleFile =
  | "index"
  | "mcp-server"
  | "reconcile-cli"
  | "doctor-cli";

export interface PluginBundleFiles {
  index: string;
  "mcp-server"?: string;
  "reconcile-cli"?: string;
  "doctor-cli"?: string;
}

export interface PluginBundleManifest {
  schema_version: typeof PLUGIN_BUNDLE_MANIFEST_SCHEMA_VERSION;
  /** Opaque pre-bundle generation token. */
  generation: string;
  /** Per-file SHA-256 hex digests keyed by bundle file name. */
  files: PluginBundleFiles;
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

export interface PluginBundleGenerationGuardError {
  error: string;
  code: "PLUGIN_BUNDLE_GENERATION_MISMATCH";
  reason: "generation_mismatch";
  loadedGeneration: string;
  deployedGeneration: string;
  loadedModulePath: string;
  recovery: string;
}

export interface PluginBundleGenerationGuardOptions {
  /** Generation captured by the caller; omitted uses the loaded bundle value. */
  loadedGeneration?: string;
  /** Absolute path of the entry module that owns the loaded generation. */
  loadedModulePath: string;
}

/** Error raised by the host read guard when code identity is stale. */
export class PluginBundleGenerationMismatchError extends Error {
  readonly error: string;
  readonly code = "PLUGIN_BUNDLE_GENERATION_MISMATCH" as const;
  readonly reason = "generation_mismatch" as const;
  readonly loadedGeneration: string;
  readonly deployedGeneration: string;
  readonly loadedModulePath: string;
  readonly recovery: string;

  constructor(refusal: PluginBundleGenerationGuardError) {
    super(refusal.error);
    this.name = "PluginBundleGenerationMismatchError";
    this.error = refusal.error;
    this.loadedGeneration = refusal.loadedGeneration;
    this.deployedGeneration = refusal.deployedGeneration;
    this.loadedModulePath = refusal.loadedModulePath;
    this.recovery = refusal.recovery;
  }
}

export interface WritePluginBundleManifestOptions {
  now?: () => Date;
}

// Injected by the production build (`scripts/build-plugin.ts`). Keep this
// capture at module evaluation: it is the identity of the code that was
// loaded, not a later read of the deploy directory. In dev/test source
// execution it is undefined, so the loaded generation is null.
declare const __ADV_PLUGIN_BUNDLE_GENERATION__: string | undefined;

function captureLoadedPluginBundleGeneration(): string | null {
  if (typeof __ADV_PLUGIN_BUNDLE_GENERATION__ !== "string") return null;
  return /^[0-9a-f]{64}$/.test(__ADV_PLUGIN_BUNDLE_GENERATION__)
    ? __ADV_PLUGIN_BUNDLE_GENERATION__
    : null;
}

export const LOADED_PLUGIN_BUNDLE_GENERATION =
  captureLoadedPluginBundleGeneration();

/**
 * Return the generation embedded into the loaded plugin bundle at build time.
 * Returns null when the bundle was not built with a generation (e.g. dev
 * source runs or pre-feature builds).
 */
export function getLoadedPluginBundleGeneration(): string | null {
  return LOADED_PLUGIN_BUNDLE_GENERATION;
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
 * Hash the plugin bundle's `index.js`, `mcp-server.js`, `reconcile-cli.js`, and `doctor-cli.js`
 * and atomically write
 * the manifest into `distDir`. Must run AFTER the bundler has finished writing
 * both artifacts (the manifest is the LAST write of the plugin build). Throws
 * when either artifact is missing — a build that cannot produce both bundles
 * must not produce a manifest.
 */
export async function writePluginBundleManifest(
  distDir: string,
  generation: string,
  options: WritePluginBundleManifestOptions = {},
): Promise<PluginBundleManifest> {
  const indexPath = join(distDir, "index.js");
  const mcpServerPath = join(distDir, "mcp-server.js");
  const reconcileCliPath = join(distDir, "reconcile-cli.js");
  const doctorCliPath = join(distDir, "doctor-cli.js");

  const [indexSha256, mcpServerSha256, reconcileCliSha256, doctorCliSha256] =
    await Promise.all([
      hashFileSha256(indexPath).catch((err: NodeJS.ErrnoException) => {
        throw new Error(
          `Cannot write plugin bundle manifest: index.js is missing from ${distDir} (${err.code ?? err.message}).`,
        );
      }),
      hashFileSha256(mcpServerPath).catch((err: NodeJS.ErrnoException) => {
        throw new Error(
          `Cannot write plugin bundle manifest: mcp-server.js is missing from ${distDir} (${err.code ?? err.message}).`,
        );
      }),
      hashFileSha256(reconcileCliPath).catch((err: NodeJS.ErrnoException) => {
        throw new Error(
          `Cannot write plugin bundle manifest: reconcile-cli.js is missing from ${distDir} (${err.code ?? err.message}).`,
        );
      }),
      hashFileSha256(doctorCliPath).catch(() => undefined),
    ]);

  const builtAt = (options.now ?? (() => new Date()))().toISOString();
  const manifest: PluginBundleManifest = {
    schema_version: PLUGIN_BUNDLE_MANIFEST_SCHEMA_VERSION,
    generation,
    files: {
      index: indexSha256,
      "mcp-server": mcpServerSha256,
      "reconcile-cli": reconcileCliSha256,
      ...(doctorCliSha256 ? { "doctor-cli": doctorCliSha256 } : {}),
    },
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
  const files = candidate.files as Record<string, unknown> | undefined;
  if (
    !files ||
    typeof files !== "object" ||
    typeof files.index !== "string" ||
    !/^[0-9a-f]{64}$/.test(files.index)
  ) {
    return null;
  }
  // The manifest is produced atomically with both hashes; if an older
  // manifest lacks mcp-server.js, preserve backward compatibility by
  // accepting it as a partial record. If the key is present, validate it.
  if (
    "mcp-server" in files &&
    (typeof files["mcp-server"] !== "string" ||
      !/^[0-9a-f]{64}$/.test(files["mcp-server"]))
  ) {
    return null;
  }
  if (
    "reconcile-cli" in files &&
    (typeof files["reconcile-cli"] !== "string" ||
      !/^[0-9a-f]{64}$/.test(files["reconcile-cli"]))
  ) {
    return null;
  }
  if (
    "doctor-cli" in files &&
    (typeof files["doctor-cli"] !== "string" ||
      !/^[0-9a-f]{64}$/.test(files["doctor-cli"]))
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
 * Select recovery for the process that actually owns the loaded bundle.
 * `mcp-server.js` is supervised by Vision, not by an OpenCode session.
 *
 * Vision exposes no per-server restart verb, and `vision daemon reload` only
 * sends SIGHUP to the daemon — it does not respawn the stdio children that
 * hold the bundle. Restarting the systemd user service is what actually
 * reloads them. The server is named per project, so the hint stays generic
 * rather than naming one.
 */
export function getPluginBundleRecoveryHint(loadedModulePath: string): string {
  if (basename(loadedModulePath) === "mcp-server.js") {
    return "Restart the Vision daemon (systemctl --user restart vision.service) to load the current plugin bundle.";
  }
  return RESTART_RECOVERY;
}

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
 * Check the code-identity guard used by read surfaces. Unknown freshness is
 * deliberately allowed: an absent/unreadable manifest must not turn a routine
 * read into a bundle-availability failure. Only a generation mismatch is a
 * typed refusal.
 */
export async function getPluginBundleGenerationGuardError(
  distDir: string,
  options: PluginBundleGenerationGuardOptions,
): Promise<PluginBundleGenerationGuardError | null> {
  const freshness = await getPluginBundleFreshness(
    distDir,
    options.loadedGeneration,
  );
  if (
    freshness.state !== "stale" ||
    freshness.loadedGeneration === null ||
    freshness.deployedGeneration === null
  ) {
    return null;
  }

  return {
    error:
      "Read refused: loaded plugin bundle generation does not match the deployed manifest.",
    code: "PLUGIN_BUNDLE_GENERATION_MISMATCH",
    reason: "generation_mismatch",
    loadedGeneration: freshness.loadedGeneration,
    deployedGeneration: freshness.deployedGeneration,
    loadedModulePath: options.loadedModulePath,
    recovery: getPluginBundleRecoveryHint(options.loadedModulePath),
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
 * Narrow release preflight check for the loaded plugin bundle identity.
 *
 * Refuses release only when the loaded bundle generation is strictly older than
 * the deployed manifest generation. The advisory [ADV:PLUGIN_BUNDLE_STALE]
 * banner in system-block/status health is preserved elsewhere; this is a
 * release-time guard, not a replacement for that advisory.
 *
 * Returns `null` for `current` or `unknown` freshness so dev/source runs and
 * unreadable manifests do not block release.
 */
export interface PluginBundleReleasePreflightError {
  error: string;
  code: string;
  remediation: string;
  reason: string;
  loadedGeneration: string | null;
  deployedGeneration: string | null;
}

export async function getPluginBundleReleasePreflightError(
  distDir: string,
  loadedGenerationOverride?: string,
): Promise<PluginBundleReleasePreflightError | null> {
  const freshness = await getPluginBundleFreshness(
    distDir,
    loadedGenerationOverride,
  );
  if (freshness.state !== "stale") return null;

  return {
    error:
      "Release preflight failed: loaded plugin bundle is stale versus the deployed bundle.",
    code: "PLUGIN_BUNDLE_STALE_RELEASE_PREFLIGHT",
    remediation: freshness.recovery ?? RESTART_RECOVERY,
    reason: freshness.reason ?? "generation_mismatch",
    loadedGeneration: freshness.loadedGeneration,
    deployedGeneration: freshness.deployedGeneration,
  };
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
