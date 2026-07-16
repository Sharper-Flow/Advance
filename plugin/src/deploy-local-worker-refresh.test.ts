import { describe, expect, test, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { spawn, spawnSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");

// Executable regression harness for the deployed Temporal worker refresh in
// deploy-local.sh (change fixDeploymentSyncOrdering, rq-deployAssetContinuation01).
//
// Contract encoded here (AC1/AC2/AC3/AC6; C2/C3 immutable):
//   - A deployed worker that survives the bounded SIGTERM grace period must
//     keep the deploy loud: nonzero final status, [ADV:ACTION_REQUIRED]
//     evidence with worker path/PID, and restart remediation.
//   - That failure must NOT prevent independent asset synchronization
//     (commands, bundled agents) and must be named explicitly as a
//     stale-runtime condition in the final summary.
//   - The run must never claim the new worker bundle is active
//     ("bounce complete") when the bounce failed.
//   - A successful refresh preserves the normal successful final status.
//
// Safety: every deploy runs against a throwaway HOME and a throwaway git
// worktree. The "stuck worker" is a fixture process whose argv contains the
// exact temp-only worker script path the script computes; the script's
// exact-path matcher can only ever match this fixture, so no real worker
// process is enumerated as a match or signaled. The fixture is SIGKILLed in
// cleanup. Fake pnpm/rsync binaries keep the run hermetic and fast.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

interface DeployFixture {
  tempHome: string;
  tempWorktree: string;
  workerScriptPath: string;
  runDeploy: (mode?: "fix" | "check" | "dry-run") => {
    status: number | null;
    output: string;
  };
  cleanup: () => void;
}

function canonicalTempDir(prefix: string): string {
  // realpathSync: the deploy script canonicalizes the runtime plugin path via
  // `pwd -P`, so fixture argv must be built from canonical paths too (e.g. if
  // the tmpdir root contains a symlink component).
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

function writeFakeBuildTools(fakeBin: string, tempHome: string): void {
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(
    join(fakeBin, "pnpm"),
    `#!/usr/bin/env bash
mkdir -p "$PWD/dist" "$PWD/dist/temporal"
printf '// fake build\\n' > "$PWD/dist/index.js"
printf '// fake worker\\n' > "$PWD/dist/temporal/worker.js"
printf '// fake workflows\\n' > "$PWD/dist/temporal/workflows.js"
touch "$PWD/dist/index.js" "$PWD/dist/temporal/worker.js" "$PWD/dist/temporal/workflows.js"
printf '{"schema_version":1,"generation":"fake","files":{"worker.js":"fake","workflows.js":"fake"},"built_at":"2026-01-01T00:00:00.000Z"}
' > "$PWD/dist/temporal/bundle-manifest.json"
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(fakeBin, "rsync"),
    `#!/usr/bin/env bash
src=""
dest=""
for arg in "$@"; do
  src="$dest"
  dest="$arg"
done
mkdir -p "$dest"
cp -a "$src/." "$dest/"
exit 0
`,
    { mode: 0o755 },
  );
  // Sanity marker so a missing fake is distinguishable from a deploy failure.
  writeFileSync(join(tempHome, "fake-tools-ready"), "");
}

function setupDeployFixture(): DeployFixture {
  const tempHome = canonicalTempDir("adv-worker-refresh-home-");
  const tempWorktreeRoot = canonicalTempDir("adv-worker-refresh-wt-");
  const tempWorktree = join(tempWorktreeRoot, "repo-worktree");
  const fakeBin = join(tempHome, "bin");
  const deployRoot = join(tempHome, ".local/share/Advance");
  const runtimePluginPath = join(deployRoot, "plugin");
  const workerScriptPath = join(runtimePluginPath, "dist/temporal/worker.js");
  const cliTarget = join(tempHome, ".local/bin/adv");

  writeFakeBuildTools(fakeBin, tempHome);
  // Pre-create the runtime plugin dir so its canonical path is stable for the
  // fixture worker argv before the first rsync populates it.
  mkdirSync(runtimePluginPath, { recursive: true });
  mkdirSync(join(tempHome, ".config/opencode"), { recursive: true });

  const addResult = spawnSync(
    "git",
    ["worktree", "add", "--detach", tempWorktree],
    { cwd: REPO_ROOT, env: { ...process.env, CI: "true" }, encoding: "utf8" },
  );
  expect(addResult.status).toBe(0);
  // Exercise the live script content from this checkout, not the committed
  // copy, so the harness tracks uncommitted TDD edits to the script.
  writeFileSync(
    join(tempWorktree, "scripts", "deploy-local.sh"),
    readFileSync(DEPLOY_SCRIPT_PATH, "utf8"),
  );

  const runDeploy = (mode: "fix" | "check" | "dry-run" = "fix") => {
    const flag =
      mode === "fix" ? "--fix" : mode === "check" ? "--check" : "--dry-run";
    const result = spawnSync(
      "bash",
      [join(tempWorktree, "scripts", "deploy-local.sh"), flag],
      {
        cwd: tempWorktree,
        env: {
          ...process.env,
          CI: "true",
          HOME: tempHome,
          ADV_LOCAL_DEPLOY_ROOT: deployRoot,
          ADV_BIN_LINK: cliTarget,
          ADV_STATUS_TIMEOUT_MS: "500",
          XDG_CONFIG_HOME: join(tempHome, "xdg-config"),
          XDG_DATA_HOME: join(tempHome, "xdg-data"),
          XDG_CACHE_HOME: join(tempHome, "xdg-cache"),
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        },
        encoding: "utf8",
        timeout: 100_000,
      },
    );
    return {
      status: result.status,
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    };
  };

  const cleanup = () => {
    spawnSync("git", ["worktree", "remove", "--force", tempWorktree], {
      cwd: REPO_ROOT,
      env: { ...process.env, CI: "true" },
      encoding: "utf8",
    });
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempWorktreeRoot, { recursive: true, force: true });
  };

  return { tempHome, tempWorktree, workerScriptPath, runDeploy, cleanup };
}

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function waitForFile(path: string, timeoutMs: number): void {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for fixture file: ${path}`);
    }
    Atomics.wait(sleepBuffer, 0, 0, 5);
  }
}

interface StuckWorkerFixture {
  pid: number;
  kill: () => void;
}

// Spawns a fixture process whose cmdline contains the exact deployed worker
// script path and whose environ declares ADV_TEMPORAL_WORKER_SELF_ROLL=1.
// The script's classifier should mark this worker as advisory and never send
// a signal. Only ever matched by exact temp path.
function spawnSelfRollWorker(workerScriptPath: string): StuckWorkerFixture {
  const readyPath = canonicalTempDir("adv-worker-refresh-self-roll-ready-");
  const readyFile = join(readyPath, "ready");
  const child = spawn(
    "bash",
    [
      "-c",
      // Trailing no-op defeats bash's last-command exec optimization: without
      // it bash execs `sleep`, the cmdline loses the worker-path argument, and
      // the script's exact-path matcher can never see the fixture.
      'trap "" TERM; : > "$FIXTURE_READY_FILE"; sleep 30; :',
      workerScriptPath,
    ],
    {
      env: {
        PATH: process.env.PATH ?? "",
        FIXTURE_READY_FILE: readyFile,
        ADV_TEMPORAL_WORKER_SELF_ROLL: "1",
      },
      stdio: "ignore",
    },
  );
  const pid = child.pid;
  expect(pid).toBeGreaterThan(0);
  waitForFile(readyFile, 5_000);
  // Trap is installed and the process is alive before the deploy runs.
  process.kill(pid as number, 0);

  return {
    pid: pid as number,
    kill: () => {
      try {
        process.kill(pid as number, "SIGKILL");
      } catch {
        // Fixture already exited; nothing to clean up.
      }
      rmSync(readyPath, { recursive: true, force: true });
    },
  };
}

// Spawns a fixture process whose cmdline contains the exact deployed worker
// script path, which ignores SIGTERM, and whose environ contains a malformed
// ADV_TEMPORAL_WORKER_SELF_ROLL value (not exactly "1"). The classifier must
// treat this as legacy and route it to the SIGTERM/grace/action-required path.
function spawnMalformedMarkerWorker(
  workerScriptPath: string,
): StuckWorkerFixture {
  const readyPath = canonicalTempDir("adv-worker-refresh-malformed-ready-");
  const readyFile = join(readyPath, "ready");
  const child = spawn(
    "bash",
    [
      "-c",
      // Trailing no-op defeats bash's last-command exec optimization: without
      // it bash execs `sleep`, the cmdline loses the worker-path argument, and
      // the script's exact-path matcher can never see the fixture.
      'trap "" TERM; : > "$FIXTURE_READY_FILE"; sleep 30; :',
      workerScriptPath,
    ],
    {
      env: {
        PATH: process.env.PATH ?? "",
        FIXTURE_READY_FILE: readyFile,
        ADV_TEMPORAL_WORKER_SELF_ROLL: "yes",
      },
      stdio: "ignore",
    },
  );
  const pid = child.pid;
  expect(pid).toBeGreaterThan(0);
  waitForFile(readyFile, 5_000);
  // Trap is installed and the process is alive before the deploy runs.
  process.kill(pid as number, 0);

  return {
    pid: pid as number,
    kill: () => {
      try {
        process.kill(pid as number, "SIGKILL");
      } catch {
        // Fixture already exited; nothing to clean up.
      }
      rmSync(readyPath, { recursive: true, force: true });
    },
  };
}

// Spawns a fixture process whose cmdline contains the exact deployed worker
// script path and which ignores SIGTERM, so the script's bounded grace period
// elapses with the "worker" still alive. Only ever matched by exact temp path.
function spawnStuckWorker(workerScriptPath: string): StuckWorkerFixture {
  const readyPath = canonicalTempDir("adv-worker-refresh-ready-");
  const readyFile = join(readyPath, "ready");
  const child = spawn(
    "bash",
    [
      "-c",
      // Trailing no-op defeats bash's last-command exec optimization: without
      // it bash execs `sleep`, the cmdline loses the worker-path argument, and
      // the script's exact-path matcher can never see the fixture.
      'trap "" TERM; : > "$FIXTURE_READY_FILE"; sleep 30; :',
      workerScriptPath,
    ],
    {
      env: { PATH: process.env.PATH ?? "", FIXTURE_READY_FILE: readyFile },
      stdio: "ignore",
    },
  );
  const pid = child.pid;
  expect(pid).toBeGreaterThan(0);
  waitForFile(readyFile, 5_000);
  // Trap is installed and the process is alive before the deploy runs.
  process.kill(pid as number, 0);

  return {
    pid: pid as number,
    kill: () => {
      try {
        process.kill(pid as number, "SIGKILL");
      } catch {
        // Fixture already exited; nothing to clean up.
      }
      rmSync(readyPath, { recursive: true, force: true });
    },
  };
}

describe("deploy-local worker refresh regression", () => {
  test("stuck deployed worker stays loud, continues asset sync, and fails final status", () => {
    const fixture = setupDeployFixture();
    const stuck = spawnStuckWorker(fixture.workerScriptPath);
    try {
      const result = fixture.runDeploy();
      try {
        // --- C2/C3 pins: existing loud-failure semantics are immutable. ----
        expect(result.status).not.toBe(0);
        expect(result.output).toContain("[ADV:ACTION_REQUIRED]");
        expect(result.output).toContain(fixture.workerScriptPath);
        expect(result.output).toContain(`PID ${stuck.pid}`);
        expect(result.output).toContain(
          "Restart OpenCode sessions or rerun deploy after workers exit.",
        );
        // C3: a failed bounce must never claim the new worker bundle is active.
        expect(result.output).not.toContain("bounce complete");

        // --- AC1: independent asset sync continues past the failed refresh.
        // Soft asserts so one RED run demonstrates every contract
        // expectation the current script violates, not just the first.
        expect.soft(result.output).toMatch(/\d+ command\(s\) synced/);
        expect
          .soft(
            existsSync(
              join(fixture.tempHome, ".config/opencode/agents/adv-engineer.md"),
            ),
          )
          .toBe(true);

        // --- AC2/AC6: final summary names the stale-runtime condition. -----
        expect.soft(result.output).toContain("==> Done.");
        const summary = result.output.slice(result.output.indexOf("==> Done."));
        expect.soft(summary).toMatch(/worker/i);
        expect.soft(summary).toMatch(/stale/i);
      } catch (err) {
        console.error(`--- deploy-local.sh output ---\n${result.output}`);
        throw err;
      }
    } finally {
      stuck.kill();
      fixture.cleanup();
    }
  });

  test("self-roll capable worker is advisory, not signaled, and deploy succeeds", () => {
    const fixture = setupDeployFixture();
    const selfRoll = spawnSelfRollWorker(fixture.workerScriptPath);
    try {
      const result = fixture.runDeploy();
      try {
        // Advisory: the classifier recognizes ADV_TEMPORAL_WORKER_SELF_ROLL=1
        // and refrains from sending a signal; the deploy stays successful.
        expect(result.status).toBe(0);
        expect(result.output).toContain("advisory");
        expect(result.output).toContain(`PID ${selfRoll.pid}`);
        expect(result.output).not.toContain("[ADV:ACTION_REQUIRED]");
        // The advisory worker stays alive because it was not signaled.
        expect(() => process.kill(selfRoll.pid, 0)).not.toThrow();
        expect(
          existsSync(
            join(fixture.tempHome, ".config/opencode/agents/adv-engineer.md"),
          ),
        ).toBe(true);
      } catch (err) {
        console.error(`--- deploy-local.sh output ---\n${result.output}`);
        throw err;
      }
    } finally {
      selfRoll.kill();
      fixture.cleanup();
    }
  });

  test("malformed self-roll marker falls back to legacy SIGTERM failure", () => {
    const fixture = setupDeployFixture();
    const malformed = spawnMalformedMarkerWorker(fixture.workerScriptPath);
    try {
      const result = fixture.runDeploy();
      try {
        // A malformed marker (not exactly ADV_TEMPORAL_WORKER_SELF_ROLL=1) must
        // be treated as legacy: SIGTERM sent, action-required failure, no
        // advisory classification, and no bounce-complete claim.
        expect(result.status).not.toBe(0);
        expect(result.output).toContain("[ADV:ACTION_REQUIRED]");
        expect(result.output).toContain(`PID ${malformed.pid}`);
        expect(result.output).toContain("SIGTERM sent");
        expect(result.output).not.toContain("advisory");
        expect(result.output).not.toContain("bounce complete");
      } catch (err) {
        console.error(`--- deploy-local.sh output ---\n${result.output}`);
        throw err;
      }
    } finally {
      malformed.kill();
      fixture.cleanup();
    }
  });

  test("check mode is signal-free and reports legacy workers needing bounce", () => {
    const fixture = setupDeployFixture();
    const stuck = spawnStuckWorker(fixture.workerScriptPath);
    try {
      const result = fixture.runDeploy("check");
      try {
        // Check mode must never signal the worker, even though the overall run
        // may fail for unrelated config/CLI setup in this throwaway fixture.
        expect(result.output).toContain("[ADV:ACTION_REQUIRED]");
        expect(result.output).toContain(`PID ${stuck.pid}`);
        expect(result.output).toContain("No worker processes were signaled.");
        expect(result.output).not.toContain("SIGTERM sent");
        // The worker stays alive because it was not signaled.
        expect(() => process.kill(stuck.pid, 0)).not.toThrow();
      } catch (err) {
        console.error(`--- deploy-local.sh output ---\n${result.output}`);
        throw err;
      }
    } finally {
      stuck.kill();
      fixture.cleanup();
    }
  });

  test("check mode is signal-free and reports advisory self-roll workers", () => {
    const fixture = setupDeployFixture();
    const selfRoll = spawnSelfRollWorker(fixture.workerScriptPath);
    try {
      const result = fixture.runDeploy("check");
      try {
        // The worker-refresh portion of check mode is signal-free; the overall
        // status may be nonzero due to unrelated config/CLI checks.
        expect(result.output).toContain("advisory");
        expect(result.output).toContain(`PID ${selfRoll.pid}`);
        expect(result.output).toContain("No worker processes were signaled.");
        expect(result.output).not.toContain("SIGTERM sent");
        expect(result.output).not.toContain("[ADV:ACTION_REQUIRED]");
        expect(() => process.kill(selfRoll.pid, 0)).not.toThrow();
      } catch (err) {
        console.error(`--- deploy-local.sh output ---\n${result.output}`);
        throw err;
      }
    } finally {
      selfRoll.kill();
      fixture.cleanup();
    }
  });

  test("dry-run mode is signal-free and reports legacy workers needing bounce", () => {
    const fixture = setupDeployFixture();
    const stuck = spawnStuckWorker(fixture.workerScriptPath);
    try {
      const result = fixture.runDeploy("dry-run");
      try {
        // Dry-run mode must never signal, but must still report legacy workers.
        expect(result.status).toBe(0);
        expect(result.output).toContain("[ADV:ACTION_REQUIRED]");
        expect(result.output).toContain(`PID ${stuck.pid}`);
        expect(result.output).toContain("No worker processes were signaled.");
        expect(result.output).not.toContain("SIGTERM sent");
        expect(() => process.kill(stuck.pid, 0)).not.toThrow();
      } catch (err) {
        console.error(`--- deploy-local.sh output ---\n${result.output}`);
        throw err;
      }
    } finally {
      stuck.kill();
      fixture.cleanup();
    }
  });

  test("successful worker refresh preserves normal deploy success", () => {
    const fixture = setupDeployFixture();
    try {
      const result = fixture.runDeploy();
      try {
        // AC3: supported assets synchronize and final status stays successful.
        expect(result.status).toBe(0);
        expect(result.output).toContain("==> Done.");
        expect(result.output).toMatch(/\d+ command\(s\) synced/);
        expect(
          existsSync(
            join(fixture.tempHome, ".config/opencode/agents/adv-engineer.md"),
          ),
        ).toBe(true);
        // No false stale-runtime claim on the happy path.
        const summary = result.output.slice(result.output.indexOf("==> Done."));
        expect(summary).not.toMatch(/stale/i);
      } catch (err) {
        console.error(`--- deploy-local.sh output ---\n${result.output}`);
        throw err;
      }
    } finally {
      fixture.cleanup();
    }
  });
});
