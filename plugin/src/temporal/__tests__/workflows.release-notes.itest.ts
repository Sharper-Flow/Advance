/**
 * Temporal integration test for release-note setter signal.
 *
 * Verifies:
 *   - releaseNotesSetSignal is accepted by the workflow.
 *   - getState query returns the typed release_notes block.
 *   - Invalid payload is rejected without failing the workflow.
 *   - Idempotent replay leaves state stable.
 */

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";
import { withTimeSkippingTestWorkflowEnvironment } from "./with-test-env";
import { releaseNotesSetSignal, changeStateQuery } from "../messages";
import { createDefaultGates } from "../../types";
import type { ChangeWorkflowInput } from "../contracts";
import type { ReleaseNotesSetSignalPayload } from "../../types";

const workflowsPath = fileURLToPath(
  new URL("../workflows.ts", import.meta.url),
);

function makeChangeInput(changeId: string): ChangeWorkflowInput {
  return {
    projectId: "proj-release-notes-001",
    changeId,
    title: `Release notes test: ${changeId}`,
    initializedAt: new Date().toISOString(),
    searchAttributesEnabled: false,
    seedState: {
      status: "draft",
      tasks: [],
      wisdom: [],
      gates: createDefaultGates(),
      reentry_history: [],
    },
  };
}

function makeValidPayload(): ReleaseNotesSetSignalPayload {
  return {
    release_notes: {
      audience: "external",
      category: "added",
      headline_external: "Added release-note setter",
      area: "workflow",
    },
    set_at: new Date().toISOString(),
    operation_id: "op-release-notes-itest-1",
    command_kind: "releaseNotesSet",
    payload_hash: "hash-itest-1",
  };
}

describe("changeWorkflow releaseNotesSetSignal integration", () => {
  it("applies valid release_notes and returns them via query", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue: "release-notes-test",
      });

      await worker.runUntil(async () => {
        const input = makeChangeInput("release-notes-itest-001");
        const handle = await env.client.workflow.start("changeWorkflow", {
          workflowId: `release-notes-${Date.now()}`,
          taskQueue: "release-notes-test",
          args: [input],
        });

        const payload = makeValidPayload();
        await handle.signal(releaseNotesSetSignal, payload);

        const state = await handle.query(changeStateQuery);
        expect(state.release_notes).toMatchObject({
          audience: "external",
          category: "added",
          headline_external: "Added release-note setter",
          area: "workflow",
        });
        expect(
          state.operation_ledger?.["op-release-notes-itest-1"],
        ).toMatchObject({
          command_kind: "releaseNotesSet",
          outcome: "accepted",
        });

        await handle.cancel();
      });
    });
  });

  it("rejects invalid payload via signal rejection and keeps workflow alive", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue: "release-notes-test",
      });

      await worker.runUntil(async () => {
        const input = makeChangeInput("release-notes-itest-002");
        const handle = await env.client.workflow.start("changeWorkflow", {
          workflowId: `release-notes-invalid-${Date.now()}`,
          taskQueue: "release-notes-test",
          args: [input],
        });

        await handle.signal(releaseNotesSetSignal, {
          release_notes: { audience: "invalid", category: "added" },
          set_at: new Date().toISOString(),
          operation_id: "op-release-notes-invalid",
          command_kind: "releaseNotesSet",
          payload_hash: "hash-invalid",
        } as unknown as ReleaseNotesSetSignalPayload);

        const state = await handle.query(changeStateQuery);
        expect(state.release_notes).toBeUndefined();
        expect(state.signal_rejections).toHaveLength(1);
        expect(state.signal_rejections?.[0]?.signalName).toBe(
          "releaseNotesSet",
        );

        await handle.cancel();
      });
    });
  });

  it("is idempotent on replay", async () => {
    await withTimeSkippingTestWorkflowEnvironment(async (env) => {
      const worker = await Worker.create({
        connection: env.nativeConnection,
        workflowsPath,
        taskQueue: "release-notes-test",
      });

      await worker.runUntil(async () => {
        const input = makeChangeInput("release-notes-itest-003");
        const handle = await env.client.workflow.start("changeWorkflow", {
          workflowId: `release-notes-replay-${Date.now()}`,
          taskQueue: "release-notes-test",
          args: [input],
        });

        const payload = makeValidPayload();
        await handle.signal(releaseNotesSetSignal, payload);
        await handle.signal(releaseNotesSetSignal, payload);

        const state = await handle.query(changeStateQuery);
        expect(state.release_notes).toBeDefined();
        expect(
          state.operation_ledger?.["op-release-notes-itest-1"],
        ).toMatchObject({
          outcome: "idempotent_replay",
        });

        await handle.cancel();
      });
    });
  });
});
