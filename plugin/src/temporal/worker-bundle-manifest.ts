/**
 * Worker bundle generation manifest.
 *
 * The OOP Temporal worker child loads `dist/temporal/worker.js`, which in
 * turn loads the workflow bundle `dist/temporal/workflows.js`. Together
 * those two files define the *bundle generation* a running worker was
 * started from. This module writes and reads an atomic manifest that pins
 * the generation so the plugin host can detect when the on-disk bundle has
 * drifted from the bundle its worker child is running (see
 * `worker-roll.ts`).
 *
 * Generation contract:
 *   - SHA-256 is computed over BOTH `worker.js` and `workflows.js`.
 *   - `generation` is the SHA-256 of the two file hashes concatenated with
 *     their names, so a change to either file changes the generation.
 *   - The manifest is written LAST (after both bundles exist) via a
 *     temp-file + rename in the same directory, so a concurrent reader
 *     never observes a partially written manifest.
 */

import { createHash, randomUUID } from "crypto";
import { readFile, rename, writeFile } from "fs/promises";
import { join } from "path";

export const WORKER_BUNDLE_MANIFEST_FILENAME = "bundle-manifest.json";
export const WORKER_BUNDLE_MANIFEST_SCHEMA_VERSION = 1;

/** Files that define the bundle generation. Both are required. */
export const WORKER_BUNDLE_FILES = ["worker.js", "workflows.js"] as const;
export type WorkerBundleFile = (typeof WORKER_BUNDLE_FILES)[number];

export interface WorkerBundleManifest {
  schema_version: typeof WORKER_BUNDLE_MANIFEST_SCHEMA_VERSION;
  /** SHA-256 hex digest over both bundle file hashes. */
  generation: string;
  /** Per-file SHA-256 hex digests keyed by bundle file name. */
  files: Record<WorkerBundleFile, string>;
  /** ISO timestamp of when the manifest was written. */
  built_at: string;
}

export interface WriteWorkerBundleManifestOptions {
  now?: () => Date;
}

async function hashFileSha256(path: string): Promise<string> {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

/**
 * Compute the generation digest from the per-file hashes. The file names
 * are part of the hashed payload so a hash cannot shift between files
 * without changing the generation.
 */
export function computeWorkerBundleGeneration(
  files: Record<WorkerBundleFile, string>,
): string {
  const hash = createHash("sha256");
  for (const name of WORKER_BUNDLE_FILES) {
    hash.update(`${name}:${files[name]}\n`);
  }
  return hash.digest("hex");
}

/**
 * Hash both bundle files and atomically write the manifest into
 * `bundleDir`. Must run AFTER the bundler has finished writing both
 * `worker.js` and `workflows.js` (the manifest is the LAST write of the
 * build). Throws when either bundle file is missing — a build that cannot
 * produce both bundles must not produce a manifest.
 */
export async function writeWorkerBundleManifest(
  bundleDir: string,
  options: WriteWorkerBundleManifestOptions = {},
): Promise<WorkerBundleManifest> {
  const files = {} as Record<WorkerBundleFile, string>;
  for (const name of WORKER_BUNDLE_FILES) {
    files[name] = await hashFileSha256(join(bundleDir, name)).catch(
      (err: NodeJS.ErrnoException) => {
        throw new Error(
          `Cannot write worker bundle manifest: ${name} is missing from ${bundleDir} (${err.code ?? err.message}).`,
        );
      },
    );
  }

  const builtAt = (options.now ?? (() => new Date()))().toISOString();
  const manifest: WorkerBundleManifest = {
    schema_version: WORKER_BUNDLE_MANIFEST_SCHEMA_VERSION,
    generation: computeWorkerBundleGeneration(files),
    files,
    built_at: builtAt,
  };

  const manifestPath = join(bundleDir, WORKER_BUNDLE_MANIFEST_FILENAME);
  const tmpPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(manifest, null, 2));
  await rename(tmpPath, manifestPath);

  return manifest;
}

/**
 * Read and validate the bundle manifest. Returns null when the manifest is
 * absent, unparsable, or fails schema validation — callers treat an
 * unreadable manifest as "generation unknown" and never roll on it.
 */
export async function readWorkerBundleManifest(
  bundleDir: string,
): Promise<WorkerBundleManifest | null> {
  const manifestPath = join(bundleDir, WORKER_BUNDLE_MANIFEST_FILENAME);
  const raw = await readFile(manifestPath, "utf8").catch(() => null);
  if (!raw || !raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const candidate = parsed as Partial<WorkerBundleManifest>;
  if (candidate.schema_version !== WORKER_BUNDLE_MANIFEST_SCHEMA_VERSION) {
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
    WORKER_BUNDLE_FILES.some(
      (name) =>
        typeof (candidate.files as Record<string, unknown>)[name] !==
          "string" ||
        !/^[0-9a-f]{64}$/.test(
          (candidate.files as Record<string, string>)[name],
        ),
    )
  ) {
    return null;
  }
  if (typeof candidate.built_at !== "string") return null;

  return candidate as WorkerBundleManifest;
}

/**
 * Convenience reader for the common case where only the generation digest
 * is needed. Returns null when the manifest is missing or invalid.
 */
export async function readWorkerBundleGeneration(
  bundleDir: string,
): Promise<string | null> {
  const manifest = await readWorkerBundleManifest(bundleDir);
  return manifest?.generation ?? null;
}
