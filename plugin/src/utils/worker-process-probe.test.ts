/**
 * Unit tests for the ADV worker-process probe (AC5 of
 * fixTemporalTimeoutsWorker).
 *
 * The probe is advisory: it enumerates processes whose cmdline references
 * the ADV Temporal worker script (`dist/temporal/worker.js`) by scanning a
 * proc-style directory, parses PPid from each `<pid>/status`, and flags
 * orphans via the same signal-0 ESRCH liveness check the AC4 parent-liveness
 * watchdog uses. Tests stub the proc directory with a temp dir and inject
 * the liveness probe so they are deterministic on any host.
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import {
  enumerateAdvWorkerProcesses,
  isProcessAlive,
  DEFAULT_WORKER_SCRIPT_MARKER,
} from "./worker-process-probe";

let tempDir: string;

beforeEach(async () => {
  tempDir = await createTempDir();
});

afterEach(async () => {
  await cleanupTempDir(tempDir);
});

/** Write a fake /proc/<pid> entry with cmdline + status files. */
async function writeFakeProcEntry(
  procDir: string,
  pid: number,
  opts: { cmdline?: string[]; ppid?: number | null },
): Promise<void> {
  const dir = join(procDir, String(pid));
  await mkdir(dir, { recursive: true });
  if (opts.cmdline) {
    // Real /proc cmdline is NUL-separated.
    await writeFile(join(dir, "cmdline"), opts.cmdline.join("\0"));
  }
  if (opts.ppid !== undefined && opts.ppid !== null) {
    await writeFile(
      join(dir, "status"),
      `Name:\tnode\nPid:\t${pid}\nPPid:\t${opts.ppid}\n`,
    );
  }
}

describe("enumerateAdvWorkerProcesses", () => {
  test("enumerates processes whose cmdline references the worker script", async () => {
    await writeFakeProcEntry(tempDir, 101, {
      cmdline: ["node", "/opt/advance/plugin/dist/temporal/worker.js"],
      ppid: 50,
    });
    await writeFakeProcEntry(tempDir, 102, {
      cmdline: ["node", "/opt/advance/plugin/dist/temporal/worker.js"],
      ppid: 51,
    });
    // Non-worker process must be ignored.
    await writeFakeProcEntry(tempDir, 103, {
      cmdline: ["node", "/opt/other/server.js"],
      ppid: 52,
    });

    const snapshot = await enumerateAdvWorkerProcesses({
      procDir: tempDir,
      isAlive: () => true,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot!.workerCount).toBe(2);
    expect(snapshot!.orphanCount).toBe(0);
    expect(snapshot!.processes).toEqual([
      { pid: 101, ppid: 50, orphan: false },
      { pid: 102, ppid: 51, orphan: false },
    ]);
  });

  test("flags orphans when the parent pid fails the signal-0 liveness check", async () => {
    await writeFakeProcEntry(tempDir, 201, {
      cmdline: ["node", "/srv/plugin/dist/temporal/worker.js"],
      ppid: 900,
    });
    await writeFakeProcEntry(tempDir, 202, {
      cmdline: ["node", "/srv/plugin/dist/temporal/worker.js"],
      ppid: 901,
    });

    const deadParents = new Set([901]);
    const snapshot = await enumerateAdvWorkerProcesses({
      procDir: tempDir,
      isAlive: (pid) => !deadParents.has(pid),
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot!.workerCount).toBe(2);
    expect(snapshot!.orphanCount).toBe(1);
    expect(snapshot!.processes[0]).toEqual({
      pid: 201,
      ppid: 900,
      orphan: false,
    });
    expect(snapshot!.processes[1]).toEqual({
      pid: 202,
      ppid: 901,
      orphan: true,
    });
  });

  test("returns null when the proc directory is unavailable (non-Linux / missing)", async () => {
    const snapshot = await enumerateAdvWorkerProcesses({
      procDir: join(tempDir, "does-not-exist"),
    });
    expect(snapshot).toBeNull();
  });

  test("honors an aborted status-probe signal before scanning entries", async () => {
    const controller = new AbortController();
    controller.abort(new Error("probe deadline exceeded"));

    await expect(
      enumerateAdvWorkerProcesses({
        procDir: tempDir,
        signal: controller.signal,
      }),
    ).rejects.toThrow("probe deadline exceeded");
  });

  test("skips malformed entries and entries with unreadable cmdline", async () => {
    await writeFakeProcEntry(tempDir, 301, {
      cmdline: ["node", "/x/plugin/dist/temporal/worker.js"],
      ppid: 10,
    });
    // Entry with no cmdline file at all.
    await mkdir(join(tempDir, "302"), { recursive: true });
    // Non-numeric directory name must be ignored.
    await mkdir(join(tempDir, "self"), { recursive: true });

    const snapshot = await enumerateAdvWorkerProcesses({
      procDir: tempDir,
      isAlive: () => true,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot!.workerCount).toBe(1);
    expect(snapshot!.processes).toEqual([
      { pid: 301, ppid: 10, orphan: false },
    ]);
  });

  test("worker with unreadable status file is counted with ppid null and orphan false", async () => {
    const dir = join(tempDir, "401");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "cmdline"),
      ["node", "/x/plugin/dist/temporal/worker.js"].join("\0"),
    );
    // No status file → ppid unknown; must not be misflagged as orphan.

    const snapshot = await enumerateAdvWorkerProcesses({
      procDir: tempDir,
      isAlive: () => false, // would flag everything if ppid were known
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot!.workerCount).toBe(1);
    expect(snapshot!.orphanCount).toBe(0);
    expect(snapshot!.processes).toEqual([
      { pid: 401, ppid: null, orphan: false },
    ]);
  });

  test("honors a custom worker-script marker", async () => {
    await writeFakeProcEntry(tempDir, 501, {
      cmdline: ["bun", "/repo/plugin/src/temporal/worker.ts"],
      ppid: 1,
    });

    const snapshot = await enumerateAdvWorkerProcesses({
      procDir: tempDir,
      marker: "src/temporal/worker.ts",
      isAlive: () => true,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot!.workerCount).toBe(1);
    expect(DEFAULT_WORKER_SCRIPT_MARKER).toBe("dist/temporal/worker.js");
  });

  test("empty proc dir yields a zero-count snapshot (not null)", async () => {
    const snapshot = await enumerateAdvWorkerProcesses({
      procDir: tempDir,
      isAlive: () => true,
    });
    expect(snapshot).toEqual({ workerCount: 0, orphanCount: 0, processes: [] });
  });
});

describe("isProcessAlive (default signal-0 ESRCH probe)", () => {
  test("returns true for the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  test("returns false for a pid that does not exist (ESRCH)", () => {
    // 2^22 is far above any realistic pid_max and guaranteed absent.
    expect(isProcessAlive(4194304)).toBe(false);
  });
});
