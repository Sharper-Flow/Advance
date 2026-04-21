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
  createTemporalClientBundle,
} from "../temporal/client";
import { projectAgendaQuery, projectWisdomQuery } from "../temporal/messages";
import {
  rebuildProjectWorkflowState,
  reImportChangeState,
} from "../temporal/migration";
import type { WorkflowClientLike } from "../temporal/migrate-runner";
import { formatToolOutput } from "../utils/tool-output";

type WorkflowClientSurface = { workflow: WorkflowClientLike };

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

      const bundle = await createTemporalClientBundle(process.env);
      try {
        const projectHandle = bundle.client.workflow.getHandle(
          buildProjectWorkflowId(projectId),
        ) as unknown as {
          terminate: (reason?: string) => Promise<void>;
          query: (queryDef: unknown, ...args: unknown[]) => Promise<unknown>;
        };

        await projectHandle
          .terminate(
            `adv_workflow_repair: rebuild project workflow from legacy snapshot (${args.approvalEvidence.trim()})`,
          )
          .catch(() => undefined);

        await rebuildProjectWorkflowState(
          bundle.client as unknown as WorkflowClientSurface,
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

        await reImportChangeState(
          bundle.client as unknown as WorkflowClientSurface,
          {
            projectId,
            change: changeResult.data,
          },
        );

        const repairedHandle = bundle.client.workflow.getHandle(
          buildProjectWorkflowId(projectId),
        ) as unknown as {
          query: (queryDef: unknown, ...args: unknown[]) => Promise<unknown>;
        };
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
