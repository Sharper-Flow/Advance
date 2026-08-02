import { describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { spawn, spawnSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  createDeployFixture,
  withDeployFixture,
} from "./__tests__/deploy-local-fixture";

const REPO_ROOT = resolve(__dirname, "../..");

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
// worktree via the shared deploy-local fixture. The "stuck worker" is a
// fixture process whose argv contains the exact temp-only worker script path
// the script computes; the script's exact-path matcher can only ever match
// this fixture, so no real worker process is enumerated as a match or
// signaled. The fixture is SIGKILLed in cleanup. Fake pnpm/rsync binaries keep
// the run hermetic and fast.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

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
  const readyPath = mkdtempSync(
    join(tmpdir(), "adv-worker-refresh-self-roll-ready-"),
  );
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
  const readyPath = mkdtempSync(
    join(tmpdir(), "adv-worker-refresh-malformed-ready-"),
  );
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
  const readyPath = mkdtempSync(join(tmpdir(), "adv-worker-refresh-ready-"));
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

function runOutput(result: {
  stdout?: string | null;
  stderr?: string | null;
}): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function workerEnv(fixture: { tempHome: string }): Record<string, string> {
  return {
    ADV_STATUS_TIMEOUT_MS: "500",
    ADV_BIN_LINK: join(fixture.tempHome, ".local", "bin", "adv"),
    XDG_CONFIG_HOME: join(fixture.tempHome, "xdg-config"),
    XDG_DATA_HOME: join(fixture.tempHome, "xdg-data"),
    XDG_CACHE_HOME: join(fixture.tempHome, "xdg-cache"),
  };
}

function runtimePluginPath(fixture: { tempHome: string }): string {
  return join(fixture.tempHome, ".local", "share", "Advance", "plugin");
}

function workerScriptPath(fixture: { tempHome: string }): string {
  return join(runtimePluginPath(fixture), "dist", "temporal", "worker.js");
}

describe("deploy-local worker refresh regression", () => {
  test("deploy-local fixture refuses the repository root as working directory", () => {
    const fixture = createDeployFixture();
    try {
      expect(() => fixture.runDeploy(["--fix"], {}, REPO_ROOT)).toThrow(
        /Refusing to run deploy from repository root/i,
      );
    } finally {
      fixture.cleanup();
    }
  });

  test("no spawn uses the repository root as its working directory", () => {
    const source = readFileSync(__filename, "utf8");
    expect(source).not.toMatch(/\{[^}]*cwd:\s*REPO_ROOT[^}]*\}/s);
  });

  test("deploy-local fixture records no pnpm build during normal --fix", () => {
    withDeployFixture((fixture) => {
      const result = fixture.runDeploy(["--fix"]);
      expect(result.status).toBe(0);
      const pnpmLog = readFileSync(fixture.pnpmLog, "utf8");
      expect(pnpmLog).toContain("run generate:manifests");
      expect(pnpmLog).not.toContain("run build");
    });
  });

  test("deploy-local fixture leaves the source worktree and build output unmodified", () => {
    const before = spawnSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).stdout;
    withDeployFixture((fixture) => {
      fixture.runDeploy(["--fix"]);
    });
    const after = spawnSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).stdout;
    expect(after).toBe(before);
  });

  test("stuck deployed worker stays loud, continues asset sync, and fails final status", () => {
    withDeployFixture((fixture) => {
      mkdirSync(runtimePluginPath(fixture), { recursive: true });
      const stuck = spawnStuckWorker(workerScriptPath(fixture));
      try {
        const result = fixture.runDeploy(["--fix"], workerEnv(fixture));
        try {
          // --- C2/C3 pins: existing loud-failure semantics are immutable. ----
          expect(result.status).not.toBe(0);
          expect(runOutput(result)).toContain("[ADV:ACTION_REQUIRED]");
          expect(runOutput(result)).toContain(workerScriptPath(fixture));
          expect(runOutput(result)).toContain(`PID ${stuck.pid}`);
          expect(runOutput(result)).toContain(
            "Restart OpenCode sessions or rerun deploy after workers exit.",
          );
          // C3: a failed bounce must never claim the new worker bundle is active.
          expect(runOutput(result)).not.toContain("bounce complete");

          // --- AC1: independent asset sync continues past the failed refresh.
          // Soft asserts so one RED run demonstrates every contract
          // expectation the current script violates, not just the first.
          expect.soft(runOutput(result)).toMatch(/\d+ command\(s\) synced/);
          expect
            .soft(
              existsSync(
                join(
                  fixture.tempHome,
                  ".config/opencode/agents/adv-engineer.md",
                ),
              ),
            )
            .toBe(true);

          // --- AC2/AC6: final summary names the stale-runtime condition. -----
          expect.soft(runOutput(result)).toContain("==> Done.");
          const summary = runOutput(result).slice(
            runOutput(result).indexOf("==> Done."),
          );
          expect.soft(summary).toMatch(/worker/i);
          expect.soft(summary).toMatch(/stale/i);
        } catch (err) {
          console.error(`--- deploy-local.sh output ---\n${runOutput(result)}`);
          throw err;
        }
      } finally {
        stuck.kill();
      }
    });
  });

  test("self-roll capable worker is advisory, not signaled, and deploy succeeds", () => {
    withDeployFixture((fixture) => {
      mkdirSync(runtimePluginPath(fixture), { recursive: true });
      const selfRoll = spawnSelfRollWorker(workerScriptPath(fixture));
      try {
        const result = fixture.runDeploy(["--fix"], workerEnv(fixture));
        try {
          // Advisory: the classifier recognizes ADV_TEMPORAL_WORKER_SELF_ROLL=1
          // and refrains from sending a signal; the deploy stays successful.
          expect(result.status).toBe(0);
          expect(runOutput(result)).toContain("advisory");
          expect(runOutput(result)).toContain(`PID ${selfRoll.pid}`);
          expect(runOutput(result)).not.toContain("[ADV:ACTION_REQUIRED]");
          // The advisory worker stays alive because it was not signaled.
          expect(() => process.kill(selfRoll.pid, 0)).not.toThrow();
          expect(
            existsSync(
              join(fixture.tempHome, ".config/opencode/agents/adv-engineer.md"),
            ),
          ).toBe(true);
        } catch (err) {
          console.error(`--- deploy-local.sh output ---\n${runOutput(result)}`);
          throw err;
        }
      } finally {
        selfRoll.kill();
      }
    });
  });

  test("malformed self-roll marker falls back to legacy SIGTERM failure", () => {
    withDeployFixture((fixture) => {
      mkdirSync(runtimePluginPath(fixture), { recursive: true });
      const malformed = spawnMalformedMarkerWorker(workerScriptPath(fixture));
      try {
        const result = fixture.runDeploy(["--fix"], workerEnv(fixture));
        try {
          // A malformed marker (not exactly ADV_TEMPORAL_WORKER_SELF_ROLL=1) must
          // be treated as legacy: SIGTERM sent, action-required failure, no
          // advisory classification, and no bounce-complete claim.
          expect(result.status).not.toBe(0);
          expect(runOutput(result)).toContain("[ADV:ACTION_REQUIRED]");
          expect(runOutput(result)).toContain(`PID ${malformed.pid}`);
          expect(runOutput(result)).toContain("SIGTERM sent");
          expect(runOutput(result)).not.toContain("advisory");
          expect(runOutput(result)).not.toContain("bounce complete");
        } catch (err) {
          console.error(`--- deploy-local.sh output ---\n${runOutput(result)}`);
          throw err;
        }
      } finally {
        malformed.kill();
      }
    });
  });

  test("check mode is signal-free and reports legacy workers needing bounce", () => {
    withDeployFixture((fixture) => {
      mkdirSync(runtimePluginPath(fixture), { recursive: true });
      const stuck = spawnStuckWorker(workerScriptPath(fixture));
      try {
        const result = fixture.runDeploy(["--check"], workerEnv(fixture));
        try {
          // Check mode must never signal the worker, even though the overall run
          // may fail for unrelated config/CLI setup in this throwaway fixture.
          expect(runOutput(result)).toContain("[ADV:ACTION_REQUIRED]");
          expect(runOutput(result)).toContain(`PID ${stuck.pid}`);
          expect(runOutput(result)).toContain(
            "No worker processes were signaled.",
          );
          expect(runOutput(result)).not.toContain("SIGTERM sent");
          // The worker stays alive because it was not signaled.
          expect(() => process.kill(stuck.pid, 0)).not.toThrow();
        } catch (err) {
          console.error(`--- deploy-local.sh output ---\n${runOutput(result)}`);
          throw err;
        }
      } finally {
        stuck.kill();
      }
    });
  });

  test("check mode is signal-free and reports advisory self-roll workers", () => {
    withDeployFixture((fixture) => {
      mkdirSync(runtimePluginPath(fixture), { recursive: true });
      const selfRoll = spawnSelfRollWorker(workerScriptPath(fixture));
      try {
        const result = fixture.runDeploy(["--check"], workerEnv(fixture));
        try {
          // The worker-refresh portion of check mode is signal-free; the overall
          // status may be nonzero due to unrelated config/CLI checks.
          expect(runOutput(result)).toContain("advisory");
          expect(runOutput(result)).toContain(`PID ${selfRoll.pid}`);
          expect(runOutput(result)).toContain(
            "No worker processes were signaled.",
          );
          expect(runOutput(result)).not.toContain("SIGTERM sent");
          expect(runOutput(result)).not.toContain("[ADV:ACTION_REQUIRED]");
          expect(() => process.kill(selfRoll.pid, 0)).not.toThrow();
        } catch (err) {
          console.error(`--- deploy-local.sh output ---\n${runOutput(result)}`);
          throw err;
        }
      } finally {
        selfRoll.kill();
      }
    });
  });

  test("dry-run mode is signal-free and reports legacy workers needing bounce", () => {
    withDeployFixture((fixture) => {
      mkdirSync(runtimePluginPath(fixture), { recursive: true });
      const stuck = spawnStuckWorker(workerScriptPath(fixture));
      try {
        const result = fixture.runDeploy(["--dry-run"], workerEnv(fixture));
        try {
          // Dry-run mode must never signal, but must still report legacy workers.
          expect(result.status).toBe(0);
          expect(runOutput(result)).toContain("[ADV:ACTION_REQUIRED]");
          expect(runOutput(result)).toContain(`PID ${stuck.pid}`);
          expect(runOutput(result)).toContain(
            "No worker processes were signaled.",
          );
          expect(runOutput(result)).not.toContain("SIGTERM sent");
          expect(() => process.kill(stuck.pid, 0)).not.toThrow();
        } catch (err) {
          console.error(`--- deploy-local.sh output ---\n${runOutput(result)}`);
          throw err;
        }
      } finally {
        stuck.kill();
      }
    });
  });

  test("dry-run mode is signal-free and reports advisory self-roll workers", () => {
    withDeployFixture((fixture) => {
      mkdirSync(runtimePluginPath(fixture), { recursive: true });
      const selfRoll = spawnSelfRollWorker(workerScriptPath(fixture));
      try {
        const result = fixture.runDeploy(["--dry-run"], workerEnv(fixture));
        try {
          expect(result.status).toBe(0);
          expect(runOutput(result)).toContain("advisory");
          expect(runOutput(result)).toContain(`PID ${selfRoll.pid}`);
          expect(runOutput(result)).toContain(
            "No worker processes were signaled.",
          );
          expect(runOutput(result)).not.toContain("SIGTERM sent");
          expect(runOutput(result)).not.toContain("[ADV:ACTION_REQUIRED]");
          expect(() => process.kill(selfRoll.pid, 0)).not.toThrow();
        } catch (err) {
          console.error(`--- deploy-local.sh output ---\n${runOutput(result)}`);
          throw err;
        }
      } finally {
        selfRoll.kill();
      }
    });
  });

  test("successful worker refresh preserves normal deploy success", () => {
    withDeployFixture((fixture) => {
      try {
        const result = fixture.runDeploy(["--fix"], workerEnv(fixture));
        try {
          // AC3: supported assets synchronize and final status stays successful.
          expect(result.status).toBe(0);
          expect(runOutput(result)).toContain("==> Done.");
          expect(runOutput(result)).toMatch(/\d+ command\(s\) synced/);
          expect(
            existsSync(
              join(fixture.tempHome, ".config/opencode/agents/adv-engineer.md"),
            ),
          ).toBe(true);
          // No false stale-runtime claim on the happy path.
          const summary = runOutput(result).slice(
            runOutput(result).indexOf("==> Done."),
          );
          expect(summary).not.toMatch(/stale/i);
        } catch (err) {
          console.error(`--- deploy-local.sh output ---\n${runOutput(result)}`);
          throw err;
        }
      } finally {
        // no worker fixture to kill
      }
    });
  });
});
