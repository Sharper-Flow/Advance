/**
 * write-build-identity — record the immutable build identity into dist/.
 *
 * Runs at the end of `pnpm run build` so `dist/build-identity.json` always
 * describes the exact bundle it ships with. Deploy syncs it; activation and
 * runtime guards read it. See src/migration/build-identity.ts (AC9/DDC5).
 *
 * Usage: pnpm run build:identity
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeBuildIdentityFile } from "../src/migration/build-identity";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const identity = writeBuildIdentityFile(pluginRoot);
console.log(
  `build identity recorded: ${identity.digest} (${identity.files.length} files)`,
);
