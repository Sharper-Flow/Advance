/**
 * procfs tests — machine inventory process-table primitives (AC9/DDC5).
 *
 * Fixture /proc trees prove the parsers without touching the real process
 * table: stat field-22 start-time extraction (comm with spaces/parens),
 * NUL-separated cmdline decoding, boot-time parsing, and PID-reuse-safe
 * liveness via start-tick comparison.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  isProcessAlive,
  listProcessEntries,
  processStartTimeMs,
  readBootTimeMs,
  readProcessCmdline,
  readProcessStartTicks,
} from "./procfs";

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

/** Write a Linux-format /proc/<pid>/stat. `rest` are fields 3..22+. */
function writeStat(
  procRoot: string,
  pid: number,
  comm: string,
  restFields: string[],
): void {
  const dir = join(procRoot, String(pid));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "stat"), `${pid} (${comm}) ${restFields.join(" ")}`);
}

function writeCmdline(procRoot: string, pid: number, argv: string[]): void {
  const dir = join(procRoot, String(pid));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cmdline"), argv.join("\0") + "\0");
}

// Fields 3..21 (19 values) then starttime as field 22.
function statFieldsUpToStart(startTicks: string): string[] {
  const fields3to21 = Array.from({ length: 19 }, (_, i) => String(1000 + i));
  return [...fields3to21, startTicks, "0", "0"];
}

describe("readProcessStartTicks", () => {
  test("extracts field 22 start ticks from a normal stat line", async () => {
    const proc = await tempDir("adv-procfs-stat-");
    writeStat(proc, 4242, "node", statFieldsUpToStart("987654"));
    expect(readProcessStartTicks(4242, proc)).toBe("987654");
  });

  test("handles comm containing spaces and parentheses", async () => {
    const proc = await tempDir("adv-procfs-comm-");
    writeStat(proc, 77, "weird (proc) name", statFieldsUpToStart("12345"));
    expect(readProcessStartTicks(77, proc)).toBe("12345");
  });

  test("returns null for missing or malformed stat", async () => {
    const proc = await tempDir("adv-procfs-missing-");
    expect(readProcessStartTicks(999999, proc)).toBeNull();
    const dir = join(proc, "5");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "stat"), "garbage");
    expect(readProcessStartTicks(5, proc)).toBeNull();
  });
});

describe("readProcessCmdline", () => {
  test("decodes NUL-separated argv into a space-joined string", async () => {
    const proc = await tempDir("adv-procfs-cmdline-");
    writeCmdline(proc, 100, ["opencode", "--agent", "adv"]);
    expect(readProcessCmdline(100, proc)).toBe("opencode --agent adv");
  });

  test("returns null for missing cmdline and null for empty cmdline", async () => {
    const proc = await tempDir("adv-procfs-cmdline-empty-");
    expect(readProcessCmdline(31337, proc)).toBeNull();
    writeCmdline(proc, 31337, []);
    expect(readProcessCmdline(31337, proc)).toBeNull();
  });
});

describe("listProcessEntries", () => {
  test("enumerates numeric pid dirs with cmdline + start ticks", async () => {
    const proc = await tempDir("adv-procfs-list-");
    writeStat(proc, 10, "opencode", statFieldsUpToStart("500"));
    writeCmdline(proc, 10, ["opencode"]);
    writeStat(proc, 20, "node", statFieldsUpToStart("700"));
    writeCmdline(proc, 20, ["node", "/x/dist/temporal/worker.js"]);
    // Non-pid entries and unreadable dirs are skipped.
    mkdirSync(join(proc, "self"), { recursive: true });
    mkdirSync(join(proc, "30"), { recursive: true }); // no stat/cmdline

    const entries = listProcessEntries(proc);
    const byPid = new Map(entries.map((e) => [e.pid, e]));
    expect(byPid.get(10)).toEqual({
      pid: 10,
      cmdline: "opencode",
      startTicks: "500",
    });
    expect(byPid.get(20)?.cmdline).toContain("worker.js");
    expect(byPid.has(30)).toBe(false);
  });

  test("returns empty list when proc root is unreadable", async () => {
    const proc = await tempDir("adv-procfs-list-missing-");
    expect(listProcessEntries(join(proc, "nope"))).toEqual([]);
  });
});

describe("readBootTimeMs / processStartTimeMs", () => {
  test("parses btime from /proc/stat and converts ticks to ms", async () => {
    const proc = await tempDir("adv-procfs-btime-");
    writeFileSync(
      join(proc, "stat"),
      "cpu 1 2 3\nbtime 1700000000\nprocesses 1\n",
    );
    const bootMs = readBootTimeMs(proc);
    expect(bootMs).toBe(1_700_000_000_000);
    // 500 ticks at 100 ticks/sec = 5s after boot.
    expect(
      processStartTimeMs("500", { bootTimeMs: bootMs!, clockTicks: 100 }),
    ).toBe(1_700_000_005_000);
  });

  test("returns null when btime is absent", async () => {
    const proc = await tempDir("adv-procfs-btime-missing-");
    writeFileSync(join(proc, "stat"), "cpu 1 2 3\n");
    expect(readBootTimeMs(proc)).toBeNull();
  });
});

describe("isProcessAlive", () => {
  test("live pid with matching start ticks is alive", async () => {
    const proc = await tempDir("adv-procfs-alive-");
    writeStat(proc, 55, "opencode", statFieldsUpToStart("900"));
    expect(
      isProcessAlive(55, {
        procRoot: proc,
        startTicks: "900",
        killProbe: () => true,
      }),
    ).toBe(true);
  });

  test("PID reuse: live pid with DIFFERENT start ticks is not alive", async () => {
    const proc = await tempDir("adv-procfs-reuse-");
    writeStat(proc, 55, "opencode", statFieldsUpToStart("901"));
    expect(
      isProcessAlive(55, {
        procRoot: proc,
        startTicks: "900",
        killProbe: () => true,
      }),
    ).toBe(false);
  });

  test("falls back to killProbe when stat is unreadable; EPERM means alive", async () => {
    const proc = await tempDir("adv-procfs-killprobe-");
    expect(isProcessAlive(66, { procRoot: proc, killProbe: () => true })).toBe(
      true,
    );
    expect(isProcessAlive(66, { procRoot: proc, killProbe: () => false })).toBe(
      false,
    );
  });
});
