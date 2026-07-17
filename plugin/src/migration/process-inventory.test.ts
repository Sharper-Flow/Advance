/**
 * process-inventory tests — worker/session process classification (AC9/DDC5).
 *
 * Worker processes are matched by a `dist/temporal/worker.js` argv token and
 * classified as deployed (under the deployment root) or foreign (any other
 * checkout — a dev-spawned worker still executes project workflows with its
 * own build). OpenCode session processes are matched by executable basename
 * `opencode` (verified against the live machine's /proc shape). The scan
 * itself must be complete: an unreadable process table is unknown inventory
 * and blocks activation.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import { collectProcessInventory } from "./process-inventory";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
  tempDirs = [];
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await createTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

const DEPLOYED_WORKER =
  "/home/x/.local/share/Advance/plugin/dist/temporal/worker.js";
const BOOT_MS = 1_700_000_000_000;

function addProc(
  procRoot: string,
  pid: number,
  comm: string,
  argv: string[],
  startTicks: string,
): void {
  const dir = join(procRoot, String(pid));
  mkdirSync(dir, { recursive: true });
  const fields3to21 = Array.from({ length: 19 }, (_, i) => String(100 + i));
  writeFileSync(
    join(dir, "stat"),
    `${pid} (${comm}) ${[...fields3to21, startTicks, "0", "0"].join(" ")}`,
  );
  writeFileSync(join(dir, "cmdline"), argv.join("\0") + "\0");
}

function scan(opts: { procRoot: string; selfPid?: number; nowMs?: number }) {
  return collectProcessInventory({
    deployedWorkerScript: DEPLOYED_WORKER,
    procRoot: opts.procRoot,
    bootTimeMs: BOOT_MS,
    selfPid: opts.selfPid ?? 1,
  });
}

describe("collectProcessInventory", () => {
  test("classifies deployed workers, foreign workers, and sessions", async () => {
    const proc = await tempDir("adv-procinv-classify-");
    addProc(
      proc,
      100,
      "node",
      ["node", DEPLOYED_WORKER, "--queue", "q"],
      "500",
    );
    addProc(
      proc,
      200,
      "node",
      ["node", "/home/x/dev/advance/plugin/dist/temporal/worker.js"],
      "600",
    );
    addProc(proc, 300, "opencode", ["opencode", "--agent", "adv"], "700");
    addProc(proc, 400, "bash", ["bash", "-lc", "echo hi"], "800");

    const inv = scan({ procRoot: proc });
    expect(inv.scanComplete).toBe(true);
    expect(inv.workers).toHaveLength(2);
    const deployed = inv.workers.find((w) => w.pid === 100);
    const foreign = inv.workers.find((w) => w.pid === 200);
    expect(deployed?.root).toBe("deployed");
    expect(foreign?.root).toBe("foreign");
    expect(foreign?.workerScriptPath).toBe(
      "/home/x/dev/advance/plugin/dist/temporal/worker.js",
    );
    expect(inv.sessions.map((s) => s.pid)).toEqual([300]);
    // start ticks 500 @100Hz after boot → +5s
    expect(deployed?.startTimeMs).toBe(BOOT_MS + 5000);
  });

  test("source-mode workers (temporal/worker.ts via tsx) are foreign workers", async () => {
    const proc = await tempDir("adv-procinv-srcworker-");
    addProc(
      proc,
      150,
      "node",
      ["tsx", "/home/x/dev/advance/plugin/src/temporal/worker.ts"],
      "500",
    );
    const inv = scan({ procRoot: proc });
    expect(inv.workers).toHaveLength(1);
    expect(inv.workers[0].root).toBe("foreign");
  });

  test("excludes the scanning process itself from sessions", async () => {
    const proc = await tempDir("adv-procinv-self-");
    addProc(proc, 999, "opencode", ["opencode"], "500");
    const inv = scan({ procRoot: proc, selfPid: 999 });
    expect(inv.sessions).toHaveLength(0);
  });

  test("unreadable proc root is an incomplete scan, not an empty one", async () => {
    const root = await tempDir("adv-procinv-unreadable-");
    const inv = scan({ procRoot: join(root, "missing") });
    expect(inv.scanComplete).toBe(false);
    expect(inv.problems.length).toBeGreaterThan(0);
  });

  test("processes without readable start ticks carry null startTimeMs", async () => {
    const proc = await tempDir("adv-procinv-noticks-");
    const dir = join(proc, "555");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cmdline"), "opencode\0");
    // no stat file
    const inv = scan({ procRoot: proc });
    expect(inv.sessions).toHaveLength(1);
    expect(inv.sessions[0].startTimeMs).toBeNull();
  });
});
