#!/usr/bin/env bun
/** Generate current disk-only ten-agent concurrency evidence. */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  renderDiskStressReport,
  runDiskConcurrencyStress,
} from "./disk-concurrency-stress";

async function main() {
  const outFlag = process.argv.findIndex((a) => a === "--out");
  const outPath =
    outFlag !== -1 && process.argv[outFlag + 1]
      ? resolve(process.argv[outFlag + 1])
      : resolve(process.cwd(), "docs", "ten-agent-concurrency-evidence.md");

  const report = await runDiskConcurrencyStress();
  const markdown = renderDiskStressReport(report);
  await writeFile(outPath, markdown, "utf8");
  console.log(JSON.stringify({ outPath, checkedAt: report.checkedAt }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
