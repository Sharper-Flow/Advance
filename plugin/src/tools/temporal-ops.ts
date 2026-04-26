import { basename } from "path";
import { z } from "zod";
import type { Store } from "../storage/store";
import { restartCurrentProjectTemporalWorker } from "../plugin-init";
import { getService } from "../temporal/service";
import { repairChangeActivity } from "../temporal/activities";
import { getTemporalHealth } from "../temporal/health-probe";
import {
  buildChangeWorkflowId,
  buildProjectWorkflowId,
} from "../temporal/client";
import { checkAdvSearchAttributes } from "../temporal/observability";
import { registerMissingAdvSearchAttributes } from "../temporal/observability";
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

type WorkflowReachability =
  | { reachable: true; error?: undefined }
  | { reachable: false; error: string };

async function describeWorkflowReachability(
  bundle: ReturnType<typeof getService>,
  workflowId: string,
): Promise<WorkflowReachability> {
  const describeWorkflowExecution = (
    bundle?.connection as unknown as {
      workflowService?: {
        describeWorkflowExecution?: (req: {
          namespace: string;
          execution: { workflowId: string };
        }) => Promise<unknown>;
      };
    }
  )?.workflowService?.describeWorkflowExecution;

  if (!bundle || typeof describeWorkflowExecution !== "function") {
    return {
      reachable: false,
      error: "Temporal workflow describe unavailable",
    };
  }

  try {
    await describeWorkflowExecution({
      namespace: bundle.namespace,
      execution: { workflowId },
    });
    return { reachable: true };
  } catch (err) {
    return {
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function recommendTemporalRecovery(input: {
  health: Awaited<ReturnType<typeof getTemporalHealth>>;
  stslInitialized: boolean;
  searchAttributesOk: boolean;
  projectWorkflowReachable: boolean | null;
  changeWorkflowReachable: boolean | null;
}): string {
  if (!input.health.server_alive) return "restore Temporal server";
  if (!input.stslInitialized) return "restart OpenCode or initialize STSL";
  if (!input.searchAttributesOk) {
    return "run adv_temporal_register_search_attributes";
  }
  if (!input.health.worker_process_alive || !input.health.worker_alive) {
    return "run adv_temporal_worker_restart";
  }
  if (input.health.stale_queues.length > 0) return "run adv_orphan_sweep dry-run";
  if (input.projectWorkflowReachable === false) return "run adv_workflow_repair";
  if (input.changeWorkflowReachable === false) return "run adv_workflow_repair";
  if (input.health.last_error) return "inspect last_error and retry blocked tool";
  return "none";
}

export const temporalOpsTools = {
  adv_temporal_diagnose: {
    description:
      "Read-only Temporal recovery diagnostic for ADV: classifies server, STSL, worker, workflow, search-attribute, stale-queue, and last-error health with a recommended next action.",
    args: {
      changeId: z
        .string()
        .optional()
        .describe("Optional change ID to check for a reachable change workflow"),
    },
    execute: async (args: { changeId?: string }, store: Store) => {
      const projectId = store.paths.external
        ? basename(store.paths.external)
        : undefined;
      const health = await getTemporalHealth(projectId);
      const bundle = getService();
      const searchAttributes = bundle
        ? await checkAdvSearchAttributes(bundle.connection, bundle.namespace)
        : {
            ok: false,
            present: [],
            missing: [],
            wrongType: [],
            error: "Temporal service layer not initialized",
          };

      const projectWorkflow = projectId
        ? await describeWorkflowReachability(
            bundle,
            buildProjectWorkflowId(projectId),
          )
        : { reachable: false as const, error: "No projectId resolved" };

      const changeWorkflow =
        projectId && args.changeId
          ? {
              changeId: args.changeId,
              ...(await describeWorkflowReachability(
                bundle,
                buildChangeWorkflowId(projectId, args.changeId),
              )),
            }
          : null;

      const recommendedNextAction = recommendTemporalRecovery({
        health,
        stslInitialized: bundle !== null,
        searchAttributesOk: searchAttributes.ok,
        projectWorkflowReachable: projectWorkflow.reachable,
        changeWorkflowReachable: changeWorkflow?.reachable ?? null,
      });

      return formatToolOutput({
        success: true,
        projectId,
        stsl: {
          initialized: bundle !== null,
          namespace: bundle?.namespace ?? null,
          address: bundle?.address ?? null,
          reconnectCount: health.reconnect_count,
        },
        temporalHealth: health,
        searchAttributes,
        projectWorkflow,
        changeWorkflow,
        recommendedNextAction,
      });
    },
  },

  adv_temporal_register_search_attributes: {
    description:
      "Register missing required ADV Temporal search attributes. Creates missing attributes only, refuses wrong-type mutations, and requires explicit user approval.",
    args: {
      approvedByUser: z
        .boolean()
        .describe("Must be true after explicit user approval"),
      approvalEvidence: z
        .string()
        .describe("How the user explicitly approved metadata registration"),
    },
    execute: async (
      args: { approvedByUser: boolean; approvalEvidence: string },
      _store: Store,
    ) => {
      if (!args.approvedByUser || args.approvalEvidence.trim().length === 0) {
        return formatToolOutput({
          success: false,
          error:
            "Explicit user approval is required to register Temporal search attributes.",
        });
      }

      const bundle = getService();
      if (!bundle) {
        return formatToolOutput({
          success: false,
          error:
            "Temporal service layer not initialized — cannot register search attributes",
        });
      }

      const result = await registerMissingAdvSearchAttributes(
        bundle.connection,
        bundle.namespace,
      );

      return formatToolOutput({
        success: result.ok,
        namespace: bundle.namespace,
        approvalEvidence: args.approvalEvidence.trim(),
        result,
        message: result.ok
          ? `ADV Temporal search attributes ready in namespace ${bundle.namespace}`
          : `ADV Temporal search attribute registration requires attention: ${result.error ?? "unknown error"}`,
      });
    },
  },

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
