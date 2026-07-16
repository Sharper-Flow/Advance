/**
 * Integration tests for the conservative stale-only temporal test-server
 * reaper (reapLeakedTestServers, AC3/AC4/AC5).
 *
 * Safety model under test:
 *   - reaps ONLY processes whose argv[0] basename matches the
 *     `temporal-test-server-sdk-typescript-*` test-server binary
 *   - requires same UID, conservative minimum age, and PID/start-identity
 *     revalidation before every signal (TERM → bounded wait → revalidate →
 *     optional KILL)
 *   - never touches `temporal server start-dev` / port 7233 shaped processes
 *   - skips anything whose identity cannot be established
 *
 * Tests pass explicit PIDs to the reaper so concurrently running REAL test
 * servers on this host are never candidates. Dummy servers are copies of the
 * `sleep` binary renamed to match the test-server basename, or `exec -a`
 * bash doubles for argv shapes `sleep` cannot express.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, realpathSync } from "fs";
import { join } from "path";

const REAPER = join(import.meta.dir, "lib", "oc-test-reaper.bash");
const OC_TEST = join(import.meta.dir, "oc-test");

const spawnedPids: number[] = [];

afterEach(() => {
  for (const pid of spawnedPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  spawnedPids.length = 0;
});

/**
 * Spawn a long-lived dummy whose argv[0] is a test-server-shaped path
 * (basename `temporal-test-server-sdk-typescript-9.9.9-<tag>`) and whose
 * remaining argv carries `tokens`. The fake path never exists on disk —
 * `exec -a` only controls argv, so there is no file residue.
 *
 * Doubles are bash loops: this host's coreutils is a multicall binary that
 * dispatches on argv[0], so renamed copies of `sleep` refuse to run, while
 * bash ignores argv[0] and provides a faithful long-lived TERM-able process.
 */
function spawnDouble(tag: string, tokens: string[] = [], ignoreTerm = false): number {
  const fakeArgv0 = `/tmp/temporal-test-server-sdk-typescript-9.9.9-${tag}`;
  const body = ignoreTerm
    ? "trap '' TERM; while :; do sleep 1; done"
    : "while :; do sleep 5; done";
  const script = `exec -a "$0" bash -c '${body}' -- "$@"`;
  const proc = Bun.spawn(["bash", "-c", script, fakeArgv0, ...tokens], {
    stdout: "ignore",
    stderr: "ignore",
  });
  proc.unref();
  spawnedPids.push(proc.pid);
  return proc.pid;
}

interface ReaperRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runReaper(pids: number[], env: Record<string, string> = {}): Promise<ReaperRun> {
  const proc = Bun.spawn(["bash", REAPER, ...pids.map(String)], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

/** Process is gone from the reaper's perspective: no /proc entry or a zombie. */
function isReaped(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const rest = stat.slice(stat.lastIndexOf(")") + 2);
    const state = rest.split(" ")[0];
    return state === "Z";
  } catch {
    return true;
  }
}

function isAlive(pid: number): boolean {
  return !isReaped(pid);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("oc-test temporal test-server reaper", () => {
  test("reaps a stale orphaned test server (TERM path)", async () => {
    const pid = spawnDouble("orphan-term");
    await sleepMs(2000); // age the orphan past the threshold

    const run = await runReaper([pid], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "1",
      OC_TEST_REAPER_TERM_GRACE_SECONDS: "3",
    });

    expect(run.exitCode).toBe(0);
    expect(isReaped(pid)).toBe(true);
    expect(run.stderr).toContain(`${pid}`);
  });

  test("skips a fresh peer younger than the minimum age (AC4)", async () => {
    const pid = spawnDouble("fresh-peer");

    const run = await runReaper([pid], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "3600",
    });

    expect(run.exitCode).toBe(0);
    expect(isAlive(pid)).toBe(true);
  });

  test("skips processes carrying the `server start-dev` token even with a matching basename", async () => {
    const pid = spawnDouble("start-dev-shape", ["server", "start-dev", "--port", "7234"]);
    await sleepMs(2000);

    const run = await runReaper([pid], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "1",
    });

    expect(run.exitCode).toBe(0);
    expect(isAlive(pid)).toBe(true);
  });

  test("skips processes bound to port 7233 (defense-in-depth for the real dev server)", async () => {
    const pid = spawnDouble("port-7233-shape", ["--port", "7233"]);
    await sleepMs(2000);

    const run = await runReaper([pid], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "1",
    });

    expect(run.exitCode).toBe(0);
    expect(isAlive(pid)).toBe(true);
  });

  test("escalates to KILL after a bounded wait when TERM is ignored", async () => {
    const pid = spawnDouble("term-ignorer", [], true);
    await sleepMs(2000);

    const started = Date.now();
    const run = await runReaper([pid], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "1",
      OC_TEST_REAPER_TERM_GRACE_SECONDS: "1",
    });
    const elapsed = Date.now() - started;

    expect(run.exitCode).toBe(0);
    expect(isReaped(pid)).toBe(true);
    // Bounded: TERM grace (1s) + revalidation, not an unbounded hang.
    expect(elapsed).toBeLessThan(15_000);
  });

  test("dry run reports but does not signal", async () => {
    const pid = spawnDouble("dry-run");
    await sleepMs(2000);

    const run = await runReaper([pid], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "1",
      OC_TEST_REAPER_DRY_RUN: "1",
    });

    expect(run.exitCode).toBe(0);
    expect(isAlive(pid)).toBe(true);
    expect(run.stderr.toLowerCase()).toContain("dry");
  });

  test("ignores processes that do not match the test-server identity", async () => {
    // A plain `sleep` — argv[0] basename does not match the test-server pattern.
    const proc = Bun.spawn([realpathSync(Bun.which("sleep") ?? "/bin/sleep"), "300"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();
    spawnedPids.push(proc.pid);
    await sleepMs(2000);

    const run = await runReaper([proc.pid], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "1",
    });

    expect(run.exitCode).toBe(0);
    expect(isAlive(proc.pid)).toBe(true);
  });

  test("skips a candidate whose identity cannot be established (nonexistent PID)", async () => {
    const run = await runReaper([99999999], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "0",
    });

    expect(run.exitCode).toBe(0);
    expect(run.stderr).not.toContain("TERM pid 99999999");
    expect(run.stderr).not.toContain("KILL pid 99999999");
  });

  test("falls back to the default minimum age when the knob is garbage", async () => {
    // A ~2s-old double must survive: with the 7200s default restored it is a
    // fresh peer; if the garbage value had been honored it would be reaped.
    const pid = spawnDouble("garbage-knob");
    await sleepMs(2000);

    const run = await runReaper([pid], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "banana",
    });

    expect(run.exitCode).toBe(0);
    expect(isAlive(pid)).toBe(true);
    expect(run.stderr).toContain("invalid OC_TEST_REAPER_MIN_AGE_SECONDS");
  });
});

describe("reaper etime parser (macOS age path)", () => {
  async function parseEtime(etime: string): Promise<ReaperRun> {
    const proc = Bun.spawn(
      ["bash", "-c", `source "$1" && _etime_to_seconds "$2"`, "_", REAPER, etime],
      { stdout: "pipe", stderr: "pipe", env: { ...process.env } },
    );
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return { exitCode, stdout, stderr };
  }

  test("parses [[dd-]hh:]mm:ss shapes, base-10 safe", async () => {
    expect((await parseEtime("04:09")).stdout.trim()).toBe(String(4 * 60 + 9));
    expect((await parseEtime("1:02:03")).stdout.trim()).toBe(String(3600 + 120 + 3));
    expect((await parseEtime("2-03:04:05")).stdout.trim()).toBe(
      String(2 * 86400 + 3 * 3600 + 4 * 60 + 5),
    );
    expect((await parseEtime(" 00:30 ")).stdout.trim()).toBe("30");
  });

  test("rejects unparseable shapes", async () => {
    for (const bad of ["", "abc", "1:2:3:4", "12-", "-", "10:xx"]) {
      const run = await parseEtime(bad);
      expect(run.exitCode).not.toBe(0);
      expect(run.stdout.trim()).toBe("");
    }
  });
});

describe("residue-free proof (AC5)", () => {
  test("induced orphan is reaped while a fresh peer and dev-server-shaped process stay untouched", async () => {
    // Induce an orphan: a leaked test-server double nobody will tear down.
    const orphanPid = spawnDouble("induced-orphan");
    await sleepMs(3000); // orphan is now provably outside the active run window

    // A fresh peer started by a "concurrent run" just before the sweep.
    const freshPeerPid = spawnDouble("concurrent-fresh-peer");
    // A dev-server-shaped process (start-dev token + 7233) that must never die.
    const devServerPid = spawnDouble("dev-server-shape", [
      "server",
      "start-dev",
      "--port",
      "7233",
    ]);

    const run = await runReaper([orphanPid, freshPeerPid, devServerPid], {
      OC_TEST_REAPER_MIN_AGE_SECONDS: "2",
      OC_TEST_REAPER_TERM_GRACE_SECONDS: "3",
    });

    expect(run.exitCode).toBe(0);
    expect(isReaped(orphanPid)).toBe(true); // stale orphan reaped
    expect(isAlive(freshPeerPid)).toBe(true); // concurrent peer untouched
    expect(isAlive(devServerPid)).toBe(true); // dev server untouched

    // No residue: after the test's own cleanup kills the survivors, nothing
    // matching this test's double tag may remain on the host.
    for (const pid of [freshPeerPid, devServerPid]) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
    await sleepMs(200);
    for (const pid of [orphanPid, freshPeerPid, devServerPid]) {
      expect(isReaped(pid)).toBe(true);
    }
  });
});

describe("bin/oc-test wiring", () => {
  async function runOcTest(
    args: string[],
    env: Record<string, string> = {},
  ): Promise<ReaperRun> {
    const proc = Bun.spawn(["bash", OC_TEST, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        // Never touch host processes during wiring tests: nothing is older
        // than this threshold, so every sweep is a no-op scan.
        OC_TEST_REAPER_MIN_AGE_SECONDS: "99999999",
        ...env,
      },
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return { exitCode, stdout, stderr };
  }

  test("propagates a zero exit code and runs pre/post sweeps", async () => {
    const run = await runOcTest(
      ["targeted", "--", "--passWithNoTests", "oc-test-reaper-wiring-no-such-file"],
      {},
    );

    expect(run.exitCode).toBe(0);
    const sweepLines = run.stderr.split("\n").filter((l) => l.includes("oc-test-reaper"));
    expect(sweepLines.length).toBeGreaterThanOrEqual(2); // pre + post
  }, 120_000);

  test("propagates a non-zero exit code from the tier", async () => {
    const run = await runOcTest(
      ["targeted", "--", "oc-test-reaper-wiring-no-such-file"],
      {},
    );

    expect(run.exitCode).not.toBe(0);
  }, 120_000);
});
