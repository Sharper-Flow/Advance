/**
 * Structural guard: dead worker-query state loaders stay deleted.
 *
 * `loadLiveStatus` and `listLiveChangeStates` carried the same sequential
 * per-change `getState` defect this change removes: a `for...of await` loop
 * issuing one worker-routed query per change, with no try/catch, so the first
 * timeout threw. Neither had a production caller — the only surviving
 * references were their own definitions and an assertion that the CLI does NOT
 * use them.
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

  test("live-status.ts issues no per-change workflow query", () => {
    const source = readFileSync(LIVE_STATUS, "utf8");

    // The surviving read path is summariesFromVisibility, which is worker-free
    // per rq-statusCliWorkerFree01. No handle-and-query construct should remain.
    expect(source).not.toContain("getHandle(");
    expect(source).not.toContain(".query(");
    expect(source).not.toContain("CHANGE_WORKFLOW_QUERY_NAMES");
  });

  test("the worker-free Visibility loader survives", () => {
    const source = readFileSync(LIVE_STATUS, "utf8");

    // Guard against over-deletion: C3 forbids changing this path's behaviour.
    expect(source).toContain("export async function loadLiveSummaries");
    expect(source).toContain("summariesFromVisibility");
  });
});
