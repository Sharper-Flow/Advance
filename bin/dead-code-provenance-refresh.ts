#!/usr/bin/env bun

/** Fixed-scope, provenance-only Knip baseline maintenance command. */

import { join } from "path";

import {
  provenanceRefreshExitCode,
  refreshDeadCodeBaselineProvenance,
} from "./lib/slop-scan/baseline-provenance";

const pluginRoot = join(import.meta.dir, "../plugin");
const baselinePath = join(
  import.meta.dir,
  "lib/slop-scan/dead-code-baseline.json",
);
const configPath = join(pluginRoot, "knip.json");

export async function main(
  argv: string[] = Bun.argv.slice(2),
): Promise<number> {
  if (argv.length > 0) {
    process.stderr.write("dead-code:provenance:refresh takes no options.\n");
    return 2;
  }

  const result = await refreshDeadCodeBaselineProvenance({
    baselinePath,
    configPath,
    pluginRoot,
  });
  const diagnostic = result.diagnostics[0];
  if (result.status === "current" || result.status === "refreshed") {
    process.stdout.write(
      `[OK] Dead-code baseline provenance ${result.status}.\n`,
    );
  } else {
    process.stderr.write(
      `Dead-code provenance refresh ${result.status}: ${diagnostic ?? "no diagnostic"}\n`,
    );
  }
  return provenanceRefreshExitCode(result);
}

if (import.meta.main) process.exit(await main());
