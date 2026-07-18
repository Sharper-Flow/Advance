/**
 * Regression tests for the parallelized `scanStoresForRepo` (change
 * parallelizeStoreMaintenance). The per-store loop — which spawns git identity
 * probes and reads several directories per store — was converted from serial to
 * bounded-concurrency mapping. These tests pin behaviour-preserving guarantees:
 * correct classification at scale, deterministic ordering, order-preserved
 * warnings, and fast completion.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { scanStoresForRepo } from "./store-consolidate";

const run = promisify(execFile);
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}

function shardStorePath(
  dataHomeRoot: string,
  shard: string,
  projectId: string,
): string {
  return join(
    dataHomeRoot,
    "opencode-projects",
    shard,
    "opencode/plugins/advance",
    projectId,
  );
}

async function writeStore(
  dir: string,
  opts?: { lockPid?: number },
): Promise<void> {
  await mkdir(join(dir, "changes"), { recursive: true });
  if (opts?.lockPid !== undefined) {
    await writeFile(
      join(dir, "worker.lock"),
      JSON.stringify({
        pid: opts.lockPid,
        worker_id: "test-worker",
        acquired_at: "2026-07-11T00:00:00.000Z",
        schema_version: 2,
        last_heartbeat: new Date().toISOString(),
      }),
    );
  }
}

const shard = "a".repeat(40);
const UNRELATED_COUNT = 50;

let base: string;
let repoDir: string;
let dataHomeRoot: string;
let rootSha: string;
let childSha: string;
const unrelatedIds = Array.from({ length: UNRELATED_COUNT }, (_, i) =>
  (i + 1).toString(16).padStart(40, "0"),
);
const lockedIndex = 21;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "adv-store-consolidate-parallel-"));
  repoDir = join(base, "repo");
  await run("git", ["init", "-b", "main", repoDir]);
  await git(repoDir, "config", "user.email", "t@t");
  await git(repoDir, "config", "user.name", "t");
  await writeFile(join(repoDir, "f.txt"), "x\n");
  await git(repoDir, "add", ".");
  await git(repoDir, "commit", "-m", "c1");
  rootSha = (await git(repoDir, "rev-list", "--max-parents=0", "HEAD"))
    .split("\n")[0]!
    .trim();
  await writeFile(join(repoDir, "f.txt"), "y\n");
  await git(repoDir, "add", ".");
  await git(repoDir, "commit", "-m", "c2");
  childSha = await git(repoDir, "rev-parse", "HEAD");

  dataHomeRoot = join(base, "xdg");
  // True store (id == identity root commit).
  await writeStore(shardStorePath(dataHomeRoot, shard, rootSha));
  // Orphan candidate (a commit of this repo but not the root).
  await writeStore(shardStorePath(dataHomeRoot, shard, childSha));
  // Many unrelated stores (valid 40-hex ids that are not commits here).
  for (let i = 0; i < UNRELATED_COUNT; i++) {
    await writeStore(
      shardStorePath(dataHomeRoot, shard, unrelatedIds[i]!),
      i === lockedIndex ? { lockPid: process.pid } : undefined,
    );
  }
}, 60_000);

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("scanStoresForRepo (parallel)", () => {
  test("classifies a large store set and completes fast", async () => {
    const start = Date.now();
    const result = await scanStoresForRepo({ directory: repoDir, dataHomeRoot });
    const elapsed = Date.now() - start;

    expect(result.identity.kind).toBe("ok");
    expect(result.stores).toHaveLength(UNRELATED_COUNT + 2);
    expect(elapsed).toBeLessThan(8_000);

    const byId = Object.fromEntries(
      result.stores.map((s) => [s.project_id, s]),
    );
    expect(byId[rootSha]!.relation).toBe("true_store");
    expect(byId[childSha]!.relation).toBe("orphan_candidate");
    expect(byId[childSha]!.unstable_identity_suspect).toBe(true);
    // Orphan candidate is flagged.
    expect(result.flagged).toContain(childSha);
    // Unrelated ids classified as unrelated.
    for (const id of unrelatedIds) {
      expect(byId[id]!.relation).toBe("unrelated");
    }
    // Live worker.lock surfaces exactly one warning.
    expect(result.warnings.filter((w) => w.includes("holds a live"))).toHaveLength(
      1,
    );
  });

  test("output is deterministic across repeated runs", async () => {
    const a = await scanStoresForRepo({ directory: repoDir, dataHomeRoot });
    const b = await scanStoresForRepo({ directory: repoDir, dataHomeRoot });
    expect(a.stores.map((s) => s.project_id)).toEqual(
      b.stores.map((s) => s.project_id),
    );
    expect(a.flagged).toEqual(b.flagged);
    expect(a.warnings).toEqual(b.warnings);
    // Entries are project_id-sorted (SC2 output shape).
    expect(a.stores.map((s) => s.project_id)).toEqual(
      [...a.stores.map((s) => s.project_id)].sort(),
    );
  });
});
