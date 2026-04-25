import { basename } from "path";
import { z } from "zod";
import type { Store } from "../storage/store";
import { restartCurrentProjectTemporalWorker } from "../plugin-init";
import { getService } from "../temporal/service";
import { repairChangeActivity } from "../temporal/activities";
import { formatToolOutput } from "../utils/tool-output";

// P2.6: WorkflowClientLike / asWorkflowClientSurface / asProjectWorkflowHandle
// were inlined into the tool body before the activity refactor. They're
// preserved as no-op re-exports so tests that import them keep compiling
// during the migration window.
interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  executeUpdate: (
    definition: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
}

interface WorkflowClientLike {
  start: (
    workflow: unknown,
    options: { workflowId: string; taskQueue: string; args: [unknown] },
  ) => Promise<WorkflowHandleLike>;
  getHandle: (workflowId: string) => WorkflowHandleLike;
}

type WorkflowClientSurface = { workflow: WorkflowClientLike };

type ProjectWorkflowHandle = {
  terminate: (reason?: string) => Promise<void>;
  query: (queryDef: unknown, ...args: unknown[]) => Promise<unknown>;
};

export function asWorkflowClientSurface(
  client: unknown,
): WorkflowClientSurface {
  return client as WorkflowClientSurface;
}

export function asProjectWorkflowHandle(
  handle: unknown,
): ProjectWorkflowHandle {
  return handle as ProjectWorkflowHandle;
}

export const temporalOpsTools = {
  adv_temporal_worker_restart: {
    description:
      "Force-restart the in-process Temporal worker for the current project when the respawn loop is exhausted or the worker is wedged.",
    args: {},
    execute: async (_args: Record<string, never>, store: Store) => {
      const result = await restartCurrentProjectTemporalWorker(
        store.paths.root,
      );
      return formatToolOutput({
        success: true,
        ...result,
        message: `Restarted Temporal worker for ${result.projectId}`,
      });
    },
  },

  adv_workflow_repair: {
    description:
      "Repair the current project's workflow state for a single change by rebuilding the project workflow from legacy snapshots, re-importing the specified change, and re-emitting derived agenda/wisdom exports.",
    args: {
      changeId: z
        .string()
        .describe("Change ID to re-import into the repaired project workflow"),
      approvalEvidence: z
        .string()
        .describe("How the user explicitly approved running workflow repair"),
    },
    execute: async (
      args: { changeId: string; approvalEvidence: string },
      store: Store,
    ) => {
      if (!args.approvalEvidence || args.approvalEvidence.trim().length === 0) {
        return formatToolOutput({
          error:
            "approvalEvidence is required. Describe how the user explicitly approved workflow repair.",
        });
      }

      if (!store.paths.external) {
        return formatToolOutput({
          error:
            "Workflow repair requires external state paths; current store is running in legacy in-repo mode.",
        });
      }

      const projectId = basename(store.paths.external);

      const bundle = getService();
      if (!bundle) {
        return formatToolOutput({
          success: false,
          error:
            "Temporal service layer not initialized — cannot repair workflow state",
        });
      }

      // P2.6: All disk + workflow logic moved into `repairChangeActivity`
      // (see `temporal/activities.ts`). Tool body is just argument
      // validation + activity invocation. Critically, the activity does NOT
      // close `bundle.connection` — the service-layer singleton owns that
      // lifecycle (was the poison-pill of the pre-4aa420e bug).
      const result = await repairChangeActivity({
        projectId,
        changeId: args.changeId,
        approvalEvidence: args.approvalEvidence,
        paths: {
          root: store.paths.root,
          changes: store.paths.changes,
          agenda: store.paths.agenda,
          wisdom: store.paths.wisdom,
        },
        client: bundle.client as unknown as Parameters<
          typeof repairChangeActivity
        >[0]["client"],
      });

      if (!result.ok) {
        return formatToolOutput({ error: result.error });
      }
      return formatToolOutput({
        success: true,
        projectId: result.projectId,
        changeId: result.changeId,
        message: result.message,
      });
    },
  },
};
