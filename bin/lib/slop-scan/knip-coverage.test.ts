import { describe, expect, test } from "bun:test";
import { join } from "path";

import { buildKnipCommand, normalizeKnipJson } from "./adapters/knip";
import { createToolRunner } from "./runner";

describe("slop-scan Knip coverage", () => {
  test("keeps the CLI projection boundary reachable without hiding real dead modules", async () => {
    const result = await createToolRunner().run({
      detectorId: "knip",
      command: buildKnipCommand(),
      cwd: join(process.cwd(), "plugin"),
      timeoutMs: 120_000,
      findingsExitCodes: [1],
    });
    const unusedFiles = new Set(
      normalizeKnipJson(result.stdout, process.cwd())
        .filter((finding) => finding.name === "unused_file")
        .map((finding) => finding.file),
    );

    expect(unusedFiles.has("src/cli/projection-boundary.ts")).toBe(false);
    expect([...unusedFiles].sort()).toEqual([]);
  }, 30_000);
});
