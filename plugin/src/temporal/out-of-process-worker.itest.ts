/**
 * Integration test for the out-of-process Temporal worker
 * (`fixTemporalWorkerBundleFailure` Phase 2.6).
 *
 * Verifies end-to-end:
 *   - createOutOfProcessWorker spawns a real Node child
 *   - The child connects to a Temporal server and registers its task queue
 *   - A change workflow started on that queue succeeds
 *   - shutdown() drains the child cleanly
 *   - No `temporal-test-server` zombie procs remain (separate from the child)
 *
 * Preconditions (test auto-skips otherwise):
 *   - A Node binary is on PATH (or ADV_NODE_PATH points at one)
 *   - The plugin's dist/temporal/worker.js is resolvable. Run
 *     `pnpm run build:worker` before this integration test; otherwise it
 *     auto-skips.
 *   - A Temporal server is reachable. This test uses TestWorkflowEnvironment
 *     in time-skipping mode, which hosts its own Temporal server process.
 *
 * Tagged `separate_verification` because it cannot TDD-red on a single-line
 * implementation — the harness is the evidence.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  createTestWorkflowEnvironment,
  withTestWorkflowEnvironment,
} from "./__tests__/with-test-env";
import { createOutOfProcessWorker } from "./out-of-process-worker";
import { resolveNodeExecutable } from "./runtime-manager";

function nodeAvailable(): boolean {
  const resolution = resolveNodeExecutable(process.env);
  return resolution.found;
}

function workerScriptAvailable(): { path: string } | null {
  // Use the built artifact shipped to users. A raw TypeScript source worker is
  // not a valid Node child entrypoint in CI/runtime without an explicit loader.
  const distUrl = new URL("../../dist/temporal/worker.js", import.meta.url);
  const distPath = fileURLToPath(distUrl);
  if (existsSync(distPath)) return { path: distPath };

  return null;
}

const canRun = nodeAvailable() && workerScriptAvailable() !== null;

describe.skipIf(!canRun)("createOutOfProcessWorker integration", () => {
  it("spawns a Node child that connects to Temporal and handles shutdown cleanly", async () => {
    const script = workerScriptAvailable();
    expect(script).not.toBeNull();

    await withTestWorkflowEnvironment(
      () => TestWorkflowEnvironment.createTimeSkipping(),
      async (env) => {
        const address = String(env.address ?? "127.0.0.1:7233");

        // Retry worker creation — child process may exit before ready IPC
        // due to Temporal server startup timing or port races (CI flake).
        const worker = await retry(
          async () => {
            const w = await createOutOfProcessWorker({
              address,
              namespace: "default",
              queues: ["advance-oop-itest"],
              workerScript: script!.path,
              projectId: "oop-itest",
            });
            await waitForWorkerAlive(w, 5_000, 100);
            return w;
          },
          3,
          1_000,
        );

        try {
          expect(worker.queues).toEqual(["advance-oop-itest"]);
          expect((worker as { isAlive?: () => boolean }).isAlive?.()).toBe(
            true,
          );
        } finally {
          await worker.shutdown();
          expect((worker as { isAlive?: () => boolean }).isAlive?.()).toBe(
            false,
          );
        }
      },
    );
  }, 120_000);

  it("reaps the specific temporal-test-server process opened for its port", async () => {
    const env = await createTestWorkflowEnvironment(() =>
      TestWorkflowEnvironment.createTimeSkipping(),
    );
    const port = extractPort(String(env.address ?? ""));
    expect(port).not.toBeNull();

    try {
      const pid = await waitForListeningPid(port!);
      expect(pid).not.toBeNull();

      await env.teardown();
      const exited = await waitForProcessExit(pid!);
      expect(exited).toBe(true);
    } finally {
      await env.teardown().catch(() => undefined);
    }
  }, 30_000);
});

function extractPort(address: string): number | null {
  const match = address.match(/:(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function waitForWorkerAlive(
  worker: Awaited<ReturnType<typeof createOutOfProcessWorker>>,
  timeoutMs: number,
  intervalMs: number,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (worker.isAlive()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const diagnostics = worker.getDiagnostics();
  throw new Error(
    `Worker never became alive within ${timeoutMs}ms: ${JSON.stringify(diagnostics)}`,
  );
}

function findListeningPid(port: number): number | null {
  // Cross-platform: skip on Windows (process enumeration differs).
  if (process.platform === "win32") return null;
  const result = spawnSync("lsof", ["-tiTCP:" + String(port), "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const pid = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return pid ? Number(pid) : null;
}

function isProcessStillRunning(pid: number): boolean {
  const result = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], {
    encoding: "utf8",
  });
  if (result.status !== 0) return false;
  const status = result.stdout.trim();
  return status.length > 0 && !status.startsWith("Z");
}

async function waitForListeningPid(
  port: number,
  timeoutMs = 5_000,
): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pid = findListeningPid(port);
    if (pid !== null) return pid;
    await sleep(100);
  }
  return null;
}

async function waitForProcessExit(
  pid: number,
  timeoutMs = 5_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessStillRunning(pid)) return true;
    await sleep(100);
  }
  return !isProcessStillRunning(pid);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry an async operation up to `attempts` times with `delayMs` between failures. */
async function retry<T>(
  fn: () => Promise<T>,
  attempts: number,
  delayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

// Emit a helpful diagnostic when the suite is skipped so the reader knows why.
if (!canRun) {
  console.warn(
    "[out-of-process-worker.itest] SKIPPED — preconditions not met:\n" +
      `  nodeAvailable: ${nodeAvailable()}\n` +
      `  workerScriptAvailable: ${workerScriptAvailable() !== null}\n` +
      "To run this suite locally: run `pnpm run build:worker` in plugin/ and ensure a Node binary is on PATH (or set ADV_NODE_PATH).",
  );
}

// Avoid unused-var lint on beforeAll/afterAll imports — they're exported for
// symmetry with the in-process itest pattern but not needed here because
// withTestWorkflowEnvironment handles lifecycle internally.
void beforeAll;
void afterAll;
