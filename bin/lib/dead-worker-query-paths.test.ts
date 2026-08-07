/**
 * Structural guard: dead worker-query state loaders stay deleted.
 *
 * The CLI status reader must remain a direct disk projection read. This guard
 * prevents worker/query vocabulary from being reintroduced into the reader.
 *
 * Dead code with a live defect is a trap, not merely clutter: the next person
 * to need "load live status" would have found a function that looks correct and
 * hangs without a polling worker.
 *
 * fixWorkerDependentResume — AC10
 *
 * Run with: bun test bin/lib/dead-worker-query-paths.test.ts
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const LIVE_STATUS = join(REPO_ROOT, "bin/lib/live-status.ts");

describe("dead worker-query paths are gone", () => {
  test("live-status.ts no longer defines listLiveChangeStates", () => {
    const source = readFileSync(LIVE_STATUS, "utf8");

    expect(source).not.toContain("listLiveChangeStates");
  });

  test("live-status.ts no longer defines loadLiveStatus", () => {
    const source = readFileSync(LIVE_STATUS, "utf8");

    expect(source).not.toContain("export async function loadLiveStatus");
  });

  test("live-status.ts issues no workflow or visibility query", () => {
    const source = readFileSync(LIVE_STATUS, "utf8");

    // No handle-and-query construct should remain in the disk reader.
    expect(source).not.toContain("getHandle(");
    expect(source).not.toContain(".query(");
    expect(source).not.toContain("Visibility");
  });

  test("the disk loader survives", () => {
    const source = readFileSync(LIVE_STATUS, "utf8");

    // Guard against over-deletion: the CLI still needs a disk read path.
    expect(source).toContain("export async function loadLiveSummaries");
    expect(source).toContain("loadSummariesFromDisk");
  });
});
