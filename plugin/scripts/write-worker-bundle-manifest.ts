#!/usr/bin/env node
/**
 * build:worker finalizer — writes the worker bundle generation manifest.
 *
 * Runs as the LAST step of `pnpm run build:worker` (after tsup has written
 * both dist/temporal/worker.js and dist/temporal/workflows.js). The
 * manifest pins the bundle generation (SHA-256 over both files) so the
 * plugin host can detect when a running out-of-process worker child is
 * stale relative to the on-disk bundle. See
 * src/temporal/worker-bundle-manifest.ts for the generation contract.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { writeWorkerBundleManifest } from "../src/temporal/worker-bundle-manifest";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const bundleDir = join(pluginRoot, "dist", "temporal");

try {
  const manifest = await writeWorkerBundleManifest(bundleDir);
  console.log(
    `worker bundle manifest written: generation=${manifest.generation.slice(0, 12)}… (${bundleDir})`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
