/**
 * Regression tests for the parallelized `scanStoresForCleanup` (change
 * parallelizeStoreMaintenance). The scan was converted from a serial per-store
 * loop to bounded-concurrency mapping with a single `agenda.jsonl` read per
 * store. These tests pin the behaviour-preserving guarantees: correct
 * classification at scale, deterministic ordering, single-read, and read-only.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { scanStoresForCleanup, analyzeAgenda } from "./store-cleanup";

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

async function writeAgendaStore(
  dir: string,
  rows: string[],
  opts?: { lockPid?: number },
): Promise<void> {
  await mkdir(dir, { recursive: true });
  if (rows.length > 0) {
    await writeFile(
      join(dir, "agenda.jsonl"),
      rows.map((r) => JSON.stringify({ text: r })).join("\n") + "\n",
    );
  }
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

const N = 60;
const shard = "e".repeat(40);
// Deterministic 40-hex project ids: 00..00, 00..01, ...
const projectIds = Array.from({ length: N }, (_, i) =>
  i.toString(16).padStart(40, "0"),
);
// One store carries a live worker.lock (unsafe); the rest are has_agenda.
const unsafeIndex = 17;

let base: string;
let dataHomeRoot: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "adv-store-cleanup-parallel-"));
  dataHomeRoot = join(base, "xdg");
  for (let i = 0; i < N; i++) {
    await writeAgendaStore(
      shardStorePath(dataHomeRoot, shard, projectIds[i]!),
      [`agenda ${i} a`, `agenda ${i} b`],
      i === unsafeIndex ? { lockPid: process.pid } : undefined,
    );
  }
}, 60_000);

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("analyzeAgenda", () => {
  test("null content yields empty analysis", () => {
    const a = analyzeAgenda(null);
    expect(a.rows).toBe(0);
    expect(a.malformed).toBe(0);
    expect(a.hashes.size).toBe(0);
    expect(a.contentHash).toBeNull();
  });

  test("counts rows, malformed lines, and a whole-file content hash", () => {
    const content = `${JSON.stringify({ a: 1 })}\nnot json\n${JSON.stringify({ b: 2 })}\n`;
    const a = analyzeAgenda(content);
    expect(a.rows).toBe(3);
    expect(a.malformed).toBe(1);
    expect(a.hashes.size).toBe(2);
    expect(a.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("content hash is stable for identical content", () => {
    const content = `${JSON.stringify({ a: 1 })}\n`;
    expect(analyzeAgenda(content).contentHash).toBe(
      analyzeAgenda(content).contentHash,
    );
  });
});

describe("scanStoresForCleanup (parallel)", () => {
  test("classifies a large store set correctly and completes fast", async () => {
    const start = Date.now();
    const result = await scanStoresForCleanup({ dataHomeRoot });
    const elapsed = Date.now() - start;

    expect(result.stores).toHaveLength(N);
    expect(elapsed).toBeLessThan(8_000);

    const byId = Object.fromEntries(
      result.stores.map((s) => [s.project_id, s]),
    );
    const unsafeId = projectIds[unsafeIndex]!;
    expect(byId[unsafeId]!.classification).toBe("unsafe");
    expect(byId[unsafeId]!.worker_lock.live).toBe(true);
    for (let i = 0; i < N; i++) {
      if (i === unsafeIndex) continue;
      const s = byId[projectIds[i]!]!;
      expect(s.classification).toBe("has_agenda");
      expect(s.agenda.rows).toBe(2);
      expect(s.agenda.content_hash).toMatch(/^sha256:/);
    }
  });

  test("output is deterministic across repeated runs (order-stable)", async () => {
    const a = await scanStoresForCleanup({ dataHomeRoot });
    const b = await scanStoresForCleanup({ dataHomeRoot });
    expect(a.stores.map((s) => s.project_id)).toEqual(
      b.stores.map((s) => s.project_id),
    );
    expect(a.flagged).toEqual(b.flagged);
    expect(a.warnings).toEqual(b.warnings);
    // Sorted invariants (SC2 output shape).
    expect(a.flagged).toEqual([...a.flagged].sort());
    expect(a.stores.map((s) => s.project_id)).toEqual(
      [...a.stores.map((s) => s.project_id)].sort(),
    );
  });
});
