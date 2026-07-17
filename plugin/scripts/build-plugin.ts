#!/usr/bin/env node
/**
 * Production plugin build entrypoint.
 *
 * Generates an opaque plugin bundle generation token, builds `src/index.ts`
 * with the token embedded as a compile-time define, then atomically writes the
 * `dist/plugin-bundle-manifest.json` sidecar describing the final bundle. This
 * script replaces the raw `tsup` invocation in `pnpm run build` so the
 * generated manifest is always produced alongside the built `index.js`.
 *
 * See `src/plugin-bundle-manifest.ts` for the generation contract.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { build } from "tsup";

import config from "../tsup.config";
import { writePluginBundleManifest } from "../src/plugin-bundle-manifest";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(pluginRoot, "dist");

function generatePluginBundleGeneration(): string {
  return randomBytes(32).toString("hex");
}

async function main(): Promise<void> {
  const generation = generatePluginBundleGeneration();

  await build({
    ...config,
    define: {
      ...config.define,
      __ADV_PLUGIN_BUNDLE_GENERATION__: JSON.stringify(generation),
    },
  });

  const manifest = await writePluginBundleManifest(distDir, generation, {
    now: () => new Date(),
  });

  console.log(
    `plugin bundle manifest written: generation=${manifest.generation.slice(0, 12)}… (${distDir})`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
