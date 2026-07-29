#!/usr/bin/env bun
/**
 * Generate the ten-agent concurrency evidence report.
 *
 * Usage:
 *   bun scripts/generate-concurrency-evidence-report.ts [--out <path>]
 *
 * Defaults to docs/ten-agent-concurrency-evidence.md.
 *
 * This script is read-only: it samples existing session DBs, process metadata,
 * and (optionally) Temporal workflow visibility. It does not start sessions,
 * workflows, or synthetic load.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  collectConcurrencyEvidence,
  renderMarkdownReport,
} from "../plugin/src/utils/concurrency-evidence-collector";

async function main() {
  const outFlag = process.argv.findIndex((a) => a === "--out");
  const outPath =
    outFlag !== -1 && process.argv[outFlag + 1]
      ? resolve(process.argv[outFlag + 1])
      : resolve(process.cwd(), "docs", "ten-agent-concurrency-evidence.md");

  const report = await collectConcurrencyEvidence();
  const markdown = renderMarkdownReport(report);
  writeFileSync(outPath, markdown, "utf8");
  console.log(JSON.stringify({ outPath, checkedAt: report.checkedAt }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
