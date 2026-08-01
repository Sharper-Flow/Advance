/**
 * rq-isolSessionTaskQueue05 — orphan-session-queue adoption integration test.
 *
 * Proves the cross-cutting adoption ACTION that unit tests cannot: the real
 * OrphanQueueAdopter, driven against a REAL Temporal server, registers a REAL
 * poller (real Worker.create) for a stranded session queue, and the previously
 * unreachable workflow becomes queryable (AC2). Idempotency (AC5) and the
 * diagnostics surface (AC7) are exercised through the real coordinator.
 *
 * Why the Visibility enumeration is stubbed here: the Temporal time-skipping
 * TEST server does not implement `ListWorkflowExecutions`
 * (`UNIMPLEMENTED: Method .../ListWorkflowExecutions is unimplemented`), so the
 * real `listOrphanSessionQueues` Visibility query cannot run against it. The
 * enumeration logic (filter / group / sort / idempotency / unordered-page
 * handling) is covered by 13 unit tests in `list-orphan-session-queues.test.ts`
 * with mocked Visibility streams. This test stubs only the enumeration stream
 * and exercises everything downstream with REAL Temporal primitives.
 *
 * Covers (integration level):
 *   AC2 — after adoption, a query against the workflow on that queue succeeds.
 *   AC5 — idempotency: a re-scan does not re-register an already-polled queue.
 *   AC6 — the restart-path seam (attachWorkerWithAdoption) constructs and drives
 *         the adopter so the orphaned workflow becomes queryable.
 *   AC7 — adoption state surfaces in getDiagnostics().
 */
import { getSharedWorkflowBundle } from "../../temporal/__tests__/with-test-env";
import { describe, expect, it, vi } from "vitest";
import { Worker } from "@temporalio/worker";

import { createDefaultGates } from "../../types";
import type { ChangeWorkflowInput } from "../contracts";
import { buildSessionTaskQueue } from "../client";
import { getChangeStateQuery } from "../messages";
import type { OrphanListClient } from "../list-orphan-session-queues";
import { OrphanQueueAdopter } from "../orphan-queue-adopter";
import { attachWorkerWithAdoption } from "../../plugin-init";
import { withTimeSkippingTestWorkflowEnvironment } from "./with-test-env";

const PROJECT_ID = "orphan-adopt-001";
const SESSION_ID = "sess_AdoptE2E1";
const CHANGE_ID = "orphan-adopt-change-1";

function makeInput(): ChangeWorkflowInput {
  return {
    projectId: PROJECT_ID,
    changeId: CHANGE_ID,
    title: "Orphan adoption e2e",
    initializedAt: "2026-07-23T00:00:00.000Z",
    sessionId: SESSION_ID,
    searchAttributesEnabled: false,
    seedState: {
      status: "active",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
      affectedProjects: [PROJECT_ID],
      affectedPaths: ["plugin/src/temporal"],
    },
  };
}

/** Settle poller registration after Worker.create (real registerQueue analog). */
const POLLER_SETTLE_MS = 500;

describe("rq-isolSessionTaskQueue05: orphan session queue adoption (real worker round-trip)", () => {
  it("registers a real poller for a stranded session queue; the orphaned workflow becomes queryable (AC2/AC5/AC7)", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      const sessionQueue = buildSessionTaskQueue(PROJECT_ID, SESSION_ID);

      // 1. Start a change workflow on the session queue with NO poller → orphan.
      const handle = await env.client.workflow.start("changeWorkflow", {
        workflowId: `adv/change/${PROJECT_ID}/${CHANGE_ID}`,
        taskQueue: sessionQueue,
        args: [makeInput()],
      });
      // RUNNING but stranded — nothing polls sessionQueue yet.

      // 2. Stubbed enumeration client: yields the orphan. The test server does
      //    not implement ListWorkflowExecutions, so the real Visibility query
      //    cannot run; the enumeration logic is unit-tested separately. This
      //    stub feeds the real listOrphanSessionQueues filter exactly what a
      //    real Visibility scan would return for this stranded workflow.
      const stubClient: OrphanListClient = {
        workflow: {
          list: async function* () {
            yield {
              workflowId: `adv/change/${PROJECT_ID}/${CHANGE_ID}`,
              taskQueue: sessionQueue,
              startTime: new Date(),
              status: { name: "RUNNING" },
            };
          },
        },
      };

      // 3. Real worker-shim: registerQueue creates + runs a real Worker on the
      //    queue (the actual registerQueue → Worker.create adoption action).
      const polled = new Set<string>();
      const spawned: Worker[] = [];
      const registerQueue = vi.fn(async (queue: string) => {
        const worker = await Worker.create({
          connection: env.nativeConnection,
          workflowBundle: await getSharedWorkflowBundle(),
          taskQueue: queue,
        });
        spawned.push(worker);
        polled.add(queue);
        void worker.run().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, POLLER_SETTLE_MS));
      });
      const adopter = new OrphanQueueAdopter({
        client: stubClient,
        projectId: PROJECT_ID,
        worker: {
          registerQueue,
          get queues() {
            return [...polled];
          },
        },
      });

      // 4. Adopt: real listOrphanSessionQueues(stub) → registerQueue → real poller.
      await adopter.adoptNextOrphan();
      expect(registerQueue).toHaveBeenCalledWith(sessionQueue);

      // 5. Sentinel (AC2): the previously-stranded workflow is now queryable.
      //    Bounded retry instead of a fixed wait — on a contended runner the
      //    adopted poller may not be attached immediately after Worker.create,
      //    so the first query can transiently fail. Retry until it succeeds or a
      //    ~10s budget elapses (the outer 60s timeout still bounds the test).
      let state: unknown = null;
      const sentinelDeadline = Date.now() + 10_000;
      while (state === null && Date.now() < sentinelDeadline) {
        try {
          state = await handle.query(getChangeStateQuery);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      expect(state).toBeTruthy();

      // 6. Diagnostics surface the adopted queue (AC7): success clears retries.
      const diag = adopter.getDiagnostics();
      const entry = diag.trackedQueues.find((q) => q.queue === sessionQueue);
      expect(entry).toBeDefined();
      expect(entry?.attemptCount).toBe(0);

      // 7. Idempotency (AC5): a re-scan does not re-register an already-polled
      //    queue (it is now in worker.queues).
      await adopter.adoptNextOrphan();
      expect(registerQueue).toHaveBeenCalledTimes(1);

      // Cleanup adopted pollers so env.teardown does not hang on a live worker.
      for (const worker of spawned) {
        try {
          worker.shutdown();
        } catch {
          /* shutdown is best-effort; SDK tolerates double-shutdown */
        }
      }
    });
  }, 60_000);

  it("adopts a stranded queue through the restart-path seam (attachWorkerWithAdoption) and the orphaned workflow becomes queryable (AC6)", async () => {
    const savedAdoptionEnv = process.env.ADV_ORPHAN_QUEUE_ADOPTION;
    process.env.ADV_ORPHAN_QUEUE_ADOPTION = "1";
    try {
      await withTimeSkippingTestWorkflowEnvironment(async (env) => {
        const sessionQueue = buildSessionTaskQueue(PROJECT_ID, SESSION_ID);

        // 1. Start a change workflow on the session queue with NO poller → orphan.
        const handle = await env.client.workflow.start("changeWorkflow", {
          workflowId: `adv/change/${PROJECT_ID}/${CHANGE_ID}`,
          taskQueue: sessionQueue,
          args: [makeInput()],
        });

        // 2. Stubbed enumeration client (test server lacks ListWorkflowExecutions).
        const stubClient: OrphanListClient = {
          workflow: {
            list: async function* () {
              yield {
                workflowId: `adv/change/${PROJECT_ID}/${CHANGE_ID}`,
                taskQueue: sessionQueue,
                startTime: new Date(),
                status: { name: "RUNNING" },
              };
            },
          },
        };

        // 3. Real InProcessWorker: registerQueue creates + runs a real Worker.
        const polled = new Set<string>();
        const spawned: Worker[] = [];
        const worker: import("../in-process-worker").InProcessWorker = {
          registerQueue: vi.fn(async (queue: string) => {
            const w = await Worker.create({
              connection: env.nativeConnection,
              workflowBundle: await getSharedWorkflowBundle(),
              taskQueue: queue,
            });
            spawned.push(w);
            polled.add(queue);
            void w.run().catch(() => undefined);
            await new Promise((resolve) =>
              setTimeout(resolve, POLLER_SETTLE_MS),
            );
          }),
          get queues() {
            return [...polled];
          },
          shutdown: async () => {
            for (const w of spawned) {
              try {
                await w.shutdown();
              } catch {
                /* best-effort */
              }
            }
          },
        };

        // 4. Attach via the restart-path seam.
        const { stopDriver } = attachWorkerWithAdoption(worker, {
          projectId: PROJECT_ID,
          client: stubClient as unknown as import("@temporalio/client").Client,
        });

        // 5. Wait for the 10s driver tick to fire and adoption to complete.
        await new Promise((resolve) => setTimeout(resolve, 10_500));

        // 6. Sentinel (AC6): the previously-stranded workflow is now queryable.
        let state: unknown = null;
        const sentinelDeadline = Date.now() + 10_000;
        while (state === null && Date.now() < sentinelDeadline) {
          try {
            state = await handle.query(getChangeStateQuery);
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
        expect(state).toBeTruthy();

        // 7. Cleanup: stop the driver before shutting down the worker.
        stopDriver?.();
        await worker.shutdown();
      });
    } finally {
      if (savedAdoptionEnv === undefined) {
        delete process.env.ADV_ORPHAN_QUEUE_ADOPTION;
      } else {
        process.env.ADV_ORPHAN_QUEUE_ADOPTION = savedAdoptionEnv;
      }
    }
  }, 60_000);
});
