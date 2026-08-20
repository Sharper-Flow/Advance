import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";

const pluginRoot = resolve(import.meta.dirname, "../..");
const bundlePath = join(pluginRoot, "dist/summary-candidates-cli.js");

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
  tempDirs = [];
});

describe("summary candidates CLI bundle", () => {
  test(
    "builds a loadable classifier that reads canonical projections",
    { timeout: 180_000 },
    async () => {
      execFileSync("pnpm", ["run", "build"], {
        cwd: pluginRoot,
        stdio: "pipe",
      });

      const bundle = (await import(
        `${pathToFileURL(bundlePath).href}?test=${Date.now()}`
      )) as typeof import("./change-projection-reader");

      const fixtureRoot = await createTempDir("summary-candidates-bundle-");
      tempDirs.push(fixtureRoot);
      const changesDir = join(fixtureRoot, "changes");
      await mkdir(join(changesDir, "open-change"), { recursive: true });
      await mkdir(join(changesDir, "archived-change"), { recursive: true });
      await writeFile(
        join(changesDir, "open-change/change.json"),
        JSON.stringify({
          ...SAMPLE_CHANGE,
          id: "open-change",
          status: "draft",
        }),
      );
      await writeFile(
        join(changesDir, "archived-change/change.json"),
        JSON.stringify({
          ...SAMPLE_CHANGE,
          id: "archived-change",
          status: "archived",
        }),
      );

      await expect(
        bundle.classifySummaryCandidates(changesDir, [
          "open-change",
          "archived-change",
          "missing-change",
        ]),
      ).resolves.toEqual({
        valid: ["open-change"],
        excluded: [
          { id: "archived-change", reason: "canonical_terminal" },
          { id: "missing-change", reason: "canonical_missing" },
        ],
      });
    },
  );
});
