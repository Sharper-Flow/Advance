import { basename } from "path";
import { z } from "zod";
import type { Store } from "../storage/store";
import { restartCurrentProjectTemporalWorker } from "../plugin-init";
import { loadAgenda } from "../storage/agenda";
import { loadChange } from "../storage/json";
import { AgendaItemSchema, WisdomTypeSchema } from "../types";
import { writeJsonlAtomic } from "../storage/jsonl-atomic-writer";
import { listProjectWisdom } from "../storage/project-wisdom";
import {
  buildProjectWorkflowId,
} from "../temporal/client";
import { getService } from "../temporal/service";
import { projectAgendaQuery, projectWisdomQuery } from "../temporal/messages";
import {
  rebuildProjectWorkflowState,
  reImportChangeState,
} from "../temporal/migration";
import { formatToolOutput } from "../utils/tool-output";

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

const RepairedProjectWisdomEntrySchema = z.object({
  id: z.string(),
  type: WisdomTypeSchema,
  content: z.string().min(1).max(2000),
  sourceChange: z.string().optional(),
  sourceTask: z.string().optional(),
  promotedAt: z.string(),
  tags: z.array(z.string()).optional(),
  invalidatedBy: z.string().optional(),
});

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
      const changeResult = await loadChange(store.paths.changes, args.changeId);
      if (!changeResult.success) {
        return formatToolOutput({ error: changeResult.error });
      }
      if (!changeResult.data) {
        return formatToolOutput({
          error: `No legacy change snapshot found for ${args.changeId}`,
        });
      }

      const agendaResult = await loadAgenda(store.paths.root, {
        agendaPath: store.paths.agenda,
      });
      const projectWisdom = await listProjectWisdom(store.paths.root, {
        wisdomPath: store.paths.wisdom,
      });

      const bundle = getService();
      if (!bundle) {
        return formatToolOutput({
          success: false,
          error: "Temporal service layer not initialized — cannot repair workflow state",
        });
      }
      try {
        const projectHandle = asProjectWorkflowHandle(
          bundle.client.workflow.getHandle(buildProjectWorkflowId(projectId)),
        );

        await projectHandle
          .terminate(
            `adv_workflow_repair: rebuild project workflow from legacy snapshot (${args.approvalEvidence.trim()})`,
          )
          .catch(() => undefined);

        await rebuildProjectWorkflowState(
          asWorkflowClientSurface(bundle.client),
          {
            projectId,
            initializedAt: new Date().toISOString(),
            agenda: agendaResult.items,
            projectWisdom: projectWisdom.map((entry) => ({
              id: entry.id,
              type: entry.type,
              content: entry.content,
              sourceChange: entry.source_change,
              sourceTask: entry.source_task,
              promotedAt: entry.promoted_at,
              tags: entry.tags,
              invalidatedBy: entry.invalidated_by,
            })),
            migrationLedger: [],
          },
        );

        await reImportChangeState(asWorkflowClientSurface(bundle.client), {
          projectId,
          change: changeResult.data,
        });

        const repairedHandle = asProjectWorkflowHandle(
          bundle.client.workflow.getHandle(buildProjectWorkflowId(projectId)),
        );
        const agenda = z
          .array(AgendaItemSchema)
          .parse(await repairedHandle.query(projectAgendaQuery, undefined));
        const wisdom = z
          .array(RepairedProjectWisdomEntrySchema)
          .parse(await repairedHandle.query(projectWisdomQuery, undefined));

        await writeJsonlAtomic(store.paths.agenda, agenda);
        await writeJsonlAtomic(
          store.paths.wisdom,
          wisdom.map((entry) => {
            return {
              id: entry.id,
              type: entry.type,
              content: entry.content,
              source_change: entry.sourceChange,
              source_task: entry.sourceTask,
              promoted_at: entry.promotedAt,
              tags: entry.tags,
              invalidated_by: entry.invalidatedBy,
            };
          }),
        );

        return formatToolOutput({
          success: true,
          projectId,
          changeId: args.changeId,
          message: `Repaired workflow state for ${args.changeId} in project ${projectId}`,
        });
      } finally {
        await bundle.connection.close().catch(() => undefined);
      }
    },
  },
};
