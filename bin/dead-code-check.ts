#!/usr/bin/env bun

/** Fixed-scope, read-only dead-code ratchet command used by package scripts and CI. */

import { join } from "path";

import { deadCodeCheckExitCode, runDeadCodeCheck } from "./lib/slop-scan/check";

const pluginRoot = join(import.meta.dir, "../plugin");
const baselinePath = join(
  import.meta.dir,
  "lib/slop-scan/dead-code-baseline.json",
);

export async function main(
  argv: string[] = Bun.argv.slice(2),
): Promise<number> {
  if (argv.length > 0) {
    process.stderr.write(
      "dead-code:check takes no options; baseline updates are not supported.\n",
    );
    return 2;
  }

  const result = await runDeadCodeCheck({
    repoRoot: pluginRoot,
    baselinePath,
  });

  if (result.status === "pass") {
    process.stdout.write("[OK] Dead-code ratchet matches the reviewed set.\n");
  } else if (result.status === "fail") {
    process.stderr.write(
      "Dead-code ratchet found new reviewed fingerprints:\n",
    );
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(`- ${diagnostic}\n`);
    }
    if (result.diagnosticsTruncated > 0) {
      process.stderr.write(
        `- ${result.diagnosticsTruncated} additional finding(s) omitted from diagnostics.\n`,
      );
    }
  } else {
    process.stderr.write(
      "Dead-code ratchet blocked: scan evidence is not trustworthy.\n",
    );
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(`- ${diagnostic}\n`);
    }
  }

  return deadCodeCheckExitCode(result);
}

if (import.meta.main) process.exit(await main());
