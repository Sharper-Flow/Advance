/**
 * P1.9 — End-to-end workflow-boot test.
 *
 * Boots the Temporal-backed stack (TestWorkflowEnvironment + real
 * NativeConnection + in-process Worker + Temporal-backed store) and
 * exercises core `adv_*` tools end-to-end. Verifies the whole stack
 * works together — not just unit-level mocks.
 *
 * Tagged `separate_verification`: the test IS the deliverable. No
 * production change accompanies it.
 *
 * Acceptance:
 *   1. Stack boots in <30s
 *   2. ≥3 tools succeed (adv_change_create, adv_change_show, adv_change_list)
 *   3. Blocks CI on failure
 *   4. Parallel-safe (unique temp dir + isolated TestWorkflowEnvironment per run)
 *
 * Auto-skip when preconditions fail (Temporal test server not
 * available, etc.) so CI on platforms without Temporal binary doesn't
 * red-herring.
 */

import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";

import { createInProcessWorker } from "../temporal/in-process-worker";
import { createTemporalStoreBackend } from "../storage/store-temporal";
import { createLegacyStore } from "../storage/store-legacy";
import { changeTools } from "../tools/change";
import { initStsl, closeStsl, resetStsl } from "../temporal/service";
import { createTempDir, cleanupTempDir, parseToolOutput } from "./setup";
import { withTestWorkflowEnvironment } from "../temporal/__tests__/with-test-env";

describe("P1.9 — E2E tool calls (real Temporal stack)", () => {
  it("adv_change_create → adv_change_show → adv_change_list end-to-end", async () => {
    const tempDir = await createTempDir("p1-9-e2e-");
    try {
      await withTestWorkflowEnvironment(
        () => TestWorkflowEnvironment.createTimeSkipping(),
        async (env) => {
          // Build a real Temporal client + worker using the env's
          // shared connections. Worker uses workflowsPath; client uses
          // the env's namespaceless default.
          const namespace = "default";
          const projectId = "e2e-proj";
          const taskQueue = `advance-${projectId}`;

          const worker = await createInProcessWorker({
            address: env.address ?? "127.0.0.1:7233",
            namespace,
            queues: [taskQueue],
            connection: env.nativeConnection,
          });

          try {
            // Initialize STSL against the test server. This registers
            // ADV's custom search attributes (AdvProjectId, etc.)
            // which the workflow seed uses on start. Without this,
            // workflow.start fails with "search attribute is not
            // defined" on the test server (no shared state with prod).
            resetStsl(); // clear any prior test's cached bundle
            const bundle = await initStsl({
              ADV_TEMPORAL_ADDRESS: env.address ?? "127.0.0.1:7233",
              ADV_TEMPORAL_NAMESPACE: namespace,
              ADV_TEMPORAL_ALLOW_REMOTE: "true",
            });

            // Build the Temporal-backed store directly (skips
            // plugin-init's worker bootstrap, which we already exercise
            // via createInProcessWorker above).
            const legacy = await createLegacyStore(tempDir);
            const store = createTemporalStoreBackend({
              legacy,
              // bundle.client is the real @temporalio/client Client, which
              // satisfies TemporalHandleClient at runtime but the structural
              // signatures don't unify (Client.workflow.start has stricter
              // overloads). Cast through unknown — the e2e test exercises
              // the real wire shape.
              temporal: { client: bundle.client as unknown as never },
              projectId,
            });
            await store.init();

            // 1. adv_change_create — exercises legacy disk write +
            //    ensureChangeWorkflowStarted + Temporal workflow start.
            const createResult = await changeTools.adv_change_create.execute(
              {
                summary: "E2E test change",
                proposal: "# E2E proposal",
                problemStatement: "Test problem statement",
              },
              store,
            );
            const created = parseToolOutput<{
              changeId: string;
              proposalPath?: string;
            }>(createResult);
            expect(created.changeId).toBeTruthy();
            expect(created.changeId).toMatch(/e2eTestChange|e2etestchange/i);

            // 2. adv_change_show — exercises Temporal query path.
            const showResult = await changeTools.adv_change_show.execute(
              { changeId: created.changeId },
              store,
            );
            const shown = parseToolOutput<{
              id: string;
              title: string;
              status: string;
            }>(showResult);
            expect(shown.id).toBe(created.changeId);
            expect(shown.title).toBe("E2E test change");
            expect(shown.status).toBe("draft");

            // 3. adv_change_list — exercises Visibility API path.
            const listResult = await changeTools.adv_change_list.execute(
              {},
              store,
            );
            const listed = parseToolOutput<{
              changes: Array<{ id: string; title: string }>;
            }>(listResult);
            expect(listed.changes.length).toBeGreaterThanOrEqual(1);
            expect(listed.changes.some((c) => c.id === created.changeId)).toBe(
              true,
            );
          } finally {
            await worker.shutdown();
            await closeStsl();
          }
        },
      );
    } finally {
      await cleanupTempDir(tempDir);
    }
  }, 60_000);
});
