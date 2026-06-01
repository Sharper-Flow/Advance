import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

const PLUGIN_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..");
const DEAD_SCHEMA_HOST = "anomalyco/oc-plugins";

function collectFiles(
  root: string,
  predicate: (path: string) => boolean,
): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(path, predicate);
    }
    return predicate(path) ? [path] : [];
  });
}

describe("schema URL references", () => {
  test("stored spec and change artifact schema URLs do not advertise retired oc-plugins URLs", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, ".adv", "specs"), (path) =>
        path.endsWith("spec.json"),
      ),
      join(PLUGIN_ROOT, "src", "archive", "delta.ts"),
      join(PLUGIN_ROOT, "src", "storage", "store-disk.ts"),
    ];

    const offenders = files.filter((path) =>
      readFileSync(path, "utf8").includes(DEAD_SCHEMA_HOST),
    );

    expect(offenders).toEqual([]);
  });
});
