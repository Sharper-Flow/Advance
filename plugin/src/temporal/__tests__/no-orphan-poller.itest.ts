/**
 * AC8 integration test: session end leaves no orphan polling process.
 *
 * Verifies the worker-shutdown path from change `isolateAdvWorkerTaskQueues`:
 * when a session's worker shuts down (clean shutdown via worker.shutdown()
 * or parent-liveness watchdog), the worker's run() promise resolves and
 * the worker state transitions cleanly to STOPPED. The session's
 * in-flight workflows drain naturally as they complete/archive (KD-4
 * implicit migration); the project queue is still polled by other
 * sessions for epic workflows.
 *
 *   AC8: Session end (worker death via AC4 watchdog) leaves no orphan
 *        polling process; the session's workflows on `advance-{P}-{sess}`
 *        drain naturally as they complete/archive.
 *
 * Test strategy: drive a worker through its full lifecycle
 * (INITIALIZING → RUNNING → STOPPING → DRAINING → DRAINED → STOPPED) on
 * a session queue, then assert worker.run() resolves cleanly after
 * shutdown() is called. A clean shutdown is the SDK contract that no
 * orphan poller remains. The parent-liveness watchdog that triggers
 * shutdown() on parent-process death is unit-tested in worker.test.ts;
 * this integration test verifies the observable lifecycle on a
 * session-scoped queue.
 */
import { getSharedWorkflowBundle } from "../../temporal/__tests__/with-test-env";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";
import { withTimeSkippingTestWorkflowEnvironment } from "./with-test-env";
import { buildSessionTaskQueue } from "../client";

const PROJECT_ID = "proj-no-orphan-001";
const SESSION_ID = "sess_NoOrphanTest1";

describe("AC8: session end leaves no orphan polling process (isolateAdvWorkerTaskQueues)", () => {
  it("worker.shutdown() on session queue resolves cleanly (no orphan poller)", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      const sessionQueue = buildSessionTaskQueue(PROJECT_ID, SESSION_ID);

      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowBundle: await getSharedWorkflowBundle(),
        taskQueue: sessionQueue,
      });

      // Start the worker in background (not runUntil — we need explicit
      // lifecycle control to assert shutdown semantics).
      const runPromise = worker.run();

      // Allow the worker to register with the test server.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Trigger clean shutdown — models watchdog-driven session end.
      worker.shutdown();

      // AC8 invariant: worker.run() resolves after shutdown(). A hanging
      // run() promise would indicate an orphan poller (workflow or
      // activity task still being polled). The SDK contract is that
      // shutdown() halts polling within shutdownGraceTime; worker.run()
      // then resolves.
      const settled = await Promise.race([
        runPromise.then(
          () => "resolved" as const,
          () => "rejected" as const,
        ),
        new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), 5_000),
        ),
      ]);

      expect(settled).toBe("resolved");
    });
  });
});
