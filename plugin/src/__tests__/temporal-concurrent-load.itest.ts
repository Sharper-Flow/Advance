/**
 * T39 — Temporal concurrent-load stress scenarios (A4, Phase 5)
 *
 * Three stress-test scenarios using T38's runConcurrentClients harness:
 *   A) Worker-lock contention   — 5 clients, ~30s, no deadlocks
 *   B) State-write race         — 5 clients × 10 worktree cycles, monotonic versions
 *   C) Worker-kill respawn-elect — stale-PID reclaim, ops continue
 *
 * Linux-only (process.platform guard below).
 * Opt-in via RUN_INTEGRATION_TESTS env var so default `pnpm test` skips these
 * long-running tests.
 *
 * Run with:
 *   RUN_INTEGRATION_TESTS=1 pnpm test src/__tests__/temporal-concurrent-load.itest.ts
 */

import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createInProcessWorker } from "../temporal/in-process-worker";
import { initStsl, closeStsl, resetStsl } from "../temporal/service";
import { acquireWorkerLock, releaseWorkerLock } from "../temporal/worker-lock";
import { registerInProcessTemporalWorker } from "../plugin-init";
import { createTempDir, cleanupTempDir } from "./setup";
import { withTestWorkflowEnvironment } from "../temporal/__tests__/with-test-env";
import { ensureProjectWorkflowStarted } from "../temporal/migration";

/* ------------------------------------------------------------------ */
/* Dynamic import of dev-only benchmark harness (outside rootDir)    */
/* ------------------------------------------------------------------ */

interface ConcurrentClientResult {
  clients: number;
  totalOps: number;
  opsPerSec: number;
  durationSec: number;
  lostUpdates: Array<{
    clientId: number;
    op: string;
    prevVersion: number;
    nextVersion: number;
  }>;
  errors: Array<{
    clientId: number;
    op: string;
    message: string;
  }>;
}

async function runConcurrentClients(opts: {
  clients: number;
  durationSec: number;
  ops?: string[];
  projectDir?: string;
  skipConnectionClose?: boolean;
}): Promise<ConcurrentClientResult> {
  // Dynamic import avoids rootDir restriction; harness is dev-only.
  const mod = await import("../../scripts/benchmark-temporal" as string);
  const fn = (mod as Record<string, unknown>).runConcurrentClients as (
    opts: unknown,
  ) => Promise<ConcurrentClientResult>;
  return fn({ ...opts, skipConnectionClose: true });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

async function initGitRepo(dir: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const opts = { cwd: dir };
  await new Promise<void>((resolve, reject) => {
    execFile("git", ["init"], opts, (err) => (err ? reject(err) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    execFile("git", ["config", "user.email", "test@test.com"], opts, (err) =>
      err ? reject(err) : resolve(),
    );
  });
  await new Promise<void>((resolve, reject) => {
    execFile("git", ["config", "user.name", "Test User"], opts, (err) =>
      err ? reject(err) : resolve(),
    );
  });
  // Create an initial commit so rev-list has something to return.
  await new Promise<void>((resolve, reject) => {
    execFile("git", ["commit", "--allow-empty", "-m", "init"], opts, (err) =>
      err ? reject(err) : resolve(),
    );
  });
}

/* ------------------------------------------------------------------ */
/* Platform + env gating                                              */
/* ------------------------------------------------------------------ */

if (process.platform !== "linux") {
  describe.skip("T39 — Temporal concurrent load (Linux-only)", () => {});
} else {
  describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
    "T39 — Temporal concurrent load",
    () => {
      /* -------------------------------------------------------------- */
      /* Shared harness                                                */
      /* -------------------------------------------------------------- */

      async function withConcurrentHarness<TResult>(
        fn: (opts: {
          projectDir: string;
          mutablePath: string;
        }) => Promise<TResult>,
      ): Promise<TResult> {
        const projectDir = await createTempDir("t39-concurrent-");
        const mutablePath = join(projectDir, "temp", "bench-concurrent");
        await mkdir(mutablePath, { recursive: true });

        // runConcurrentClients uses getBoundedProjectWorkflowAccess, which
        // calls getProjectId(projectDir).  In test mode that needs a real
        // git repo with at least one commit to produce a synthetic projectId.
        await initGitRepo(projectDir);

        try {
          return await withTestWorkflowEnvironment(
            () => TestWorkflowEnvironment.createTimeSkipping(),
            async (env) => {
              const namespace = "default";
              // runConcurrentClients hard-codes mutablePath to
              // join(projectDir, "temp", "bench-concurrent").
              // getBoundedProjectWorkflowAccess uses basename(dirname())
              // of that path, so projectId is always "temp".
              const projectId = "temp";
              const taskQueue = `advance-${projectId}`;

              const worker = await createInProcessWorker({
                address: env.address ?? "127.0.0.1:7233",
                namespace,
                queues: [taskQueue],
                connection: env.nativeConnection,
              });
              registerInProcessTemporalWorker(worker);

              try {
                resetStsl();
                const bundle = await initStsl({
                  ADV_TEMPORAL_ADDRESS: env.address ?? "127.0.0.1:7233",
                  ADV_TEMPORAL_NAMESPACE: namespace,
                  ADV_TEMPORAL_ALLOW_REMOTE: "true",
                });

                // Ensure the project workflow is started so
                // runConcurrentClients can execute updates against it.
                await ensureProjectWorkflowStarted(
                  { workflow: bundle.client.workflow as unknown as never },
                  {
                    projectId,
                    initializedAt: new Date().toISOString(),
                  },
                );

                return await fn({ projectDir, mutablePath });
              } finally {
                await worker.shutdown();
                await closeStsl();
              }
            },
          );
        } finally {
          await cleanupTempDir(projectDir);
        }
      }

      /* -------------------------------------------------------------- */
      /* Scenario A — Worker-lock contention (5 clients, ~30 s)        */
      /* -------------------------------------------------------------- */

      it("A: 5 clients contend for 30 s with no deadlocks or lost updates", async () => {
        await withConcurrentHarness(
          async ({ projectDir, mutablePath: _mutablePath }) => {
            const result = await runConcurrentClients({
              clients: 5,
              durationSec: 30,
              projectDir,
            });

            expect(result.clients).toBe(5);
            // Assert test completed and performed ops
            expect(result.totalOps).toBeGreaterThan(0);
            expect(result.errors).toHaveLength(0);
            // Monotonic source_version preserved across all writes
            expect(result.lostUpdates).toHaveLength(0);
          },
        );
      }, 65_000);

      /* -------------------------------------------------------------- */
      /* Scenario B — State-write race (5 clients × 10 cycles)         */
      /* -------------------------------------------------------------- */

      it("B: 5 clients × 10 worktree_register/worktree_remove cycles", async () => {
        await withConcurrentHarness(
          async ({ projectDir, mutablePath: _mutablePath }) => {
            // Custom op-list drives create/delete pairs.
            // durationSec is a ceiling — each client stops after 10 cycles
            // (implemented by the harness as a time-bounded loop; with
            // only 2 lightweight ops, 10 cycles usually finish well under
            // 5 s, so we keep a generous ceiling).
            const result = await runConcurrentClients({
              clients: 5,
              durationSec: 10,
              ops: ["worktree_register", "worktree_remove"],
              projectDir,
            });

            expect(result.clients).toBe(5);
            // 5 clients × 10 cycles × 2 ops = 100 events expected
            expect(result.totalOps).toBeGreaterThanOrEqual(100);
            expect(result.errors).toHaveLength(0);
            // Replay-determinism proxy: monotonic source_version
            expect(result.lostUpdates).toHaveLength(0);
          },
        );
      }, 35_000);

      /* -------------------------------------------------------------- */
      /* Scenario C — Worker-kill respawn-elect                        */
      /* -------------------------------------------------------------- */

      it("C: stale worker-lock reclaimed after simulated kill", async () => {
        await withConcurrentHarness(
          async ({ projectDir, mutablePath: _mutablePath }) => {
            const externalStateDir = join(projectDir, "external-state");
            await mkdir(externalStateDir, { recursive: true });

            // Seed a stale lock with a non-existent PID to simulate a
            // killed worker.  This is the practical equivalent of
            // "kill -9 <worker-pid>" in an integration test where the
            // worker runs in-process.
            const stalePid = 999999;
            await writeFile(
              join(externalStateDir, "worker.lock"),
              JSON.stringify(
                {
                  pid: stalePid,
                  worker_id: "dead-worker-uuid",
                  acquired_at: new Date().toISOString(),
                },
                null,
                2,
              ),
            );

            // Start concurrent clients — they will operate against the
            // Temporal workflow (the in-process test worker) while the
            // stale lock sits in external state.
            const clientPromise = runConcurrentClients({
              clients: 5,
              durationSec: 15,
              projectDir,
            });

            // Mid-test (~5 s in), trigger stale-PID reclaim by calling
            // acquireWorkerLock.  Per rq-workerSingleton01.3 the lock
            // file is inspected, the PID is found dead (ESRCH), and the
            // lock is removed and re-acquired.
            await new Promise((r) => setTimeout(r, 5_000));
            const reclaim = await acquireWorkerLock(externalStateDir);
            expect(reclaim.owned).toBe(true);
            expect(reclaim.ownerPid).toBe(process.pid);

            // Wait for concurrent clients to finish
            const result = await clientPromise;

            // Pre-kill writes preserved + post-respawn writes succeed
            expect(result.totalOps).toBeGreaterThan(0);
            expect(result.errors).toHaveLength(0);
            expect(result.lostUpdates).toHaveLength(0);

            // Cleanup lock
            await releaseWorkerLock(externalStateDir);
          },
        );
      }, 40_000);
    },
  );
}
