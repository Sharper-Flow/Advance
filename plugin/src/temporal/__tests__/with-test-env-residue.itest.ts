/**
 * Real Temporal test-server residue proof (reapLeakedTestServers AC5, AC2;
 * safety constraint C1).
 *
 * The acceptance gap: earlier residue coverage (bin/oc-test-reaper.test.ts)
 * used fake argv process doubles (`exec -a` bash loops), which cannot prove
 * that a REAL `TestWorkflowEnvironment` lifecycle failure leaves no
 * test-server residue. This suite uses an actual time-skipping test server
 * constructed through the named helper wrappers (the raw-constructor guard
 * keeps `TestWorkflowEnvironment.create*` inside `with-test-env.ts`):
 *
 *   1. Induced mid-test failure (fn throws): the helper's finally-guaranteed
 *      teardown kills the REAL server — no residue (AC2 + AC5).
 *   2. Crashed runner (a child process SIGKILLs itself with the env live, so
 *      no finally can run): the genuinely leaked REAL server goes stale and
 *      is eliminated by the next conservative pre-run sweep, while a fresh
 *      REAL peer (concurrent-run analogue) and a start-dev/7233-shaped
 *      process are left untouched (AC5 + C1).
 *
 * Process identity evidence comes from the actual server: argv[0] read from
 * /proc must be the real `temporal-test-server-sdk-typescript-*` binary that
 * exists on disk, parented to the creating process.
 *
 * Linux-only: identity is /proc-based (the reaper's macOS fallback path is
 * covered by the doubles in bin/oc-test-reaper.test.ts).
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createTimeSkippingTestWorkflowEnvironment,
  withTimeSkippingTestWorkflowEnvironment,
} from "./with-test-env";

const REAPER = fileURLToPath(
  new URL("../../../../bin/lib/oc-test-reaper.bash", import.meta.url),
);
const CRASH_FIXTURE = fileURLToPath(
  new URL(
    "../../../test/fixtures/temporal/crash-leaks-test-server.mts",
    import.meta.url,
  ),
);

const isLinux = process.platform === "linux" && existsSync("/proc");

/** PIDs this suite spawned; SIGKILLed in afterEach so a failed assertion can
 * never leak a process. The helper/reaper own the happy path; this is the
 * last-resort backstop. */
const trackedPids = new Set<number>();

afterEach(() => {
  for (const pid of trackedPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  trackedPids.clear();
});

interface TestServerProc {
  pid: number;
  ppid: number;
  argv0: string;
}

/** All live processes whose argv[0] basename is the SDK test-server binary. */
function listTestServers(): TestServerProc[] {
  const out: TestServerProc[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let cmdline: string;
    try {
      cmdline = readFileSync(`/proc/${entry}/cmdline`, "utf8");
    } catch {
      continue; // kernel thread or raced exit
    }
    const argv0 = cmdline.split("\0")[0] ?? "";
    const base = argv0.slice(argv0.lastIndexOf("/") + 1);
    if (!base.startsWith("temporal-test-server-sdk-typescript-")) continue;
    let stat: string;
    try {
      stat = readFileSync(`/proc/${entry}/stat`, "utf8");
    } catch {
      continue;
    }
    const rest = stat.slice(stat.lastIndexOf(")") + 2);
    const ppid = Number(rest.split(" ")[1]);
    out.push({ pid: Number(entry), ppid, argv0 });
  }
  return out;
}

/** Identity evidence: the candidate is the real extracted SDK binary on
 * disk, not an `exec -a` argv double. */
function assertRealServerIdentity(proc: TestServerProc): void {
  const base = proc.argv0.slice(proc.argv0.lastIndexOf("/") + 1);
  expect(base.startsWith("temporal-test-server-sdk-typescript-")).toBe(true);
  expect(existsSync(proc.argv0)).toBe(true);
}

/** Gone from the reaper's perspective: no /proc entry or a zombie. */
function isGone(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const rest = stat.slice(stat.lastIndexOf(")") + 2);
    return rest.split(" ")[0] === "Z";
  } catch {
    return true;
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGone(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isGone(pid)) return;
    await sleepMs(100);
  }
  expect(
    isGone(pid),
    `pid ${pid} still present ${timeoutMs}ms after teardown`,
  ).toBe(true);
}

/**
 * Run the crash fixture: a child node process that creates a REAL env via the
 * named helper constructor, reports the server pid, then SIGKILLs itself.
 * Returns the genuinely leaked real test-server pid.
 */
async function spawnCrashFixture(): Promise<number> {
  const child = spawn(process.execPath, [CRASH_FIXTURE], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.pid !== undefined) trackedPids.add(child.pid);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", () => resolve());
  });
  expect(
    child.signalCode,
    `crash fixture must die by SIGKILL; stderr: ${stderr}`,
  ).toBe("SIGKILL");
  const match = stdout.match(/"serverPid"\s*:\s*(\d+)/);
  if (!match) {
    throw new Error(
      `crash fixture did not report a server pid; stderr: ${stderr}`,
    );
  }
  return Number(match[1]);
}

/** Long-lived double wearing the real dev server's argv shape
 * (`server start-dev --port 7233`) under a test-server basename. */
function spawnDevShapedDouble(): number {
  const fakeArgv0 = "/tmp/temporal-test-server-sdk-typescript-9.9.9-dev-shape";
  // bash ignores argv[0]; this host's coreutils multicall binary refuses a
  // renamed argv[0] (see change wisdom ws-qAkWA_).
  const script = `exec -a "$0" bash -c 'while :; do sleep 5; done' -- "$@"`;
  const child = spawn(
    "bash",
    ["-c", script, fakeArgv0, "server", "start-dev", "--port", "7233"],
    { stdio: "ignore" },
  );
  child.unref();
  if (child.pid === undefined) {
    throw new Error("failed to spawn dev-shaped double");
  }
  trackedPids.add(child.pid);
  return child.pid;
}

interface ReaperRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function runReaper(
  pids: number[],
  env: Record<string, string>,
): Promise<ReaperRun> {
  const child = spawn("bash", [REAPER, ...pids.map(String)], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
  return { exitCode, stdout, stderr };
}

describe.skipIf(!isLinux)(
  "real Temporal test-server residue proof (reapLeakedTestServers AC5)",
  () => {
    it("induced mid-test failure tears down the REAL test server (AC2/AC5)", async () => {
      let server: TestServerProc | undefined;
      await expect(
        withTimeSkippingTestWorkflowEnvironment(async () => {
          const ours = listTestServers().filter((s) => s.ppid === process.pid);
          expect(ours).toHaveLength(1);
          server = ours[0];
          trackedPids.add(server.pid);
          assertRealServerIdentity(server);
          throw new Error("induced mid-test failure (AC5)");
        }),
      ).rejects.toThrow("induced mid-test failure (AC5)");

      if (!server) {
        throw new Error("server identity was not captured inside fn");
      }
      // The helper's finally ran teardown: the REAL server process is gone.
      await waitForGone(server.pid, 10_000);
    }, 90_000);

    it("crashed runner's REAL leaked server is reaped by the next conservative sweep; fresh peer + start-dev/7233 survive (AC5/C1)", async () => {
      // Genuine crash: the fixture SIGKILLs itself with the env live, so no
      // finally/teardown can run. What remains is a REAL leaked test server.
      const leakedPid = await spawnCrashFixture();
      trackedPids.add(leakedPid);
      const leaked = listTestServers().find((s) => s.pid === leakedPid);
      if (!leaked) {
        throw new Error(
          `leaked server pid ${leakedPid} vanished before the sweep`,
        );
      }
      assertRealServerIdentity(leaked);
      expect(isGone(leakedPid)).toBe(false); // the leak is real

      // Age the orphan past this run's conservative threshold: provably
      // outside the active run window (AC4 shape, scaled down for test).
      await sleepMs(2500);

      // A fresh REAL peer: the concurrent-run neighbour that must never be
      // reaped. Constructed through the named helper, torn down in finally.
      const peerEnv = await createTimeSkippingTestWorkflowEnvironment();
      let peerPid: number | undefined;
      let devShapePid: number | undefined;
      try {
        const peers = listTestServers().filter((s) => s.ppid === process.pid);
        expect(peers).toHaveLength(1);
        peerPid = peers[0].pid;
        trackedPids.add(peerPid);
        assertRealServerIdentity(peers[0]);

        devShapePid = spawnDevShapedDouble();

        const run = await runReaper([leakedPid, peerPid, devShapePid], {
          OC_TEST_REAPER_MIN_AGE_SECONDS: "2",
          OC_TEST_REAPER_TERM_GRACE_SECONDS: "3",
        });

        expect(run.exitCode).toBe(0);
        // Stale REAL leak reaped; identity visible in the reaper log.
        expect(isGone(leakedPid)).toBe(true);
        expect(run.stderr).toContain(`TERM pid ${leakedPid}`);
        // Fresh REAL peer untouched (below the conservative minimum age).
        expect(isGone(peerPid)).toBe(false);
        expect(run.stderr).toContain(`skip pid ${peerPid}`);
        // start-dev/7233-shaped process untouched (token exclusion).
        expect(isGone(devShapePid)).toBe(false);
        expect(run.stderr).toContain(`skip pid ${devShapePid}`);
      } finally {
        await peerEnv.teardown();
        if (devShapePid !== undefined) {
          try {
            process.kill(devShapePid, "SIGKILL");
          } catch {
            // already gone
          }
        }
      }

      // No residue from anything this test spawned.
      if (peerPid !== undefined) await waitForGone(peerPid, 10_000);
      if (devShapePid !== undefined) await waitForGone(devShapePid, 10_000);
      await waitForGone(leakedPid, 10_000);
    }, 120_000);
  },
);
