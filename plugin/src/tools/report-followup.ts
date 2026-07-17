/**
 * Report Follow-Up Promotion Tool
 *
 * Promotes a typed report follow-up (ordinary `follow_ups` or
 * `required_follow_ups`) into a durable typed owner:
 *
 * - **Pre-planning**: creates a task on the source change carrying
 *   `followup_ref`.
 * - **Post-planning**: creates a same-project fast-follow child change
 *   carrying `followup_ref` in `fast_follow_of`.
 *
 * Operational work continues through `adv_followup_promote` and
 * `ops_followup_links`; only `blocks` affects release. Ordinary suggestions
 * remain immutable report metadata until deliberately promoted. New
 * mutations reject Agenda source while legacy records parse.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Store } from "../storage/store-types";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import { taskAddedSignal } from "../temporal/messages";
import {
  ReportFollowUpKindSchema,
  type ReportFollowUpKind,
  type ReportFollowUpRef,
  type ScopedSubagentReport,
  type Change,
  type Task,
  type TaskEvidencePlan,
  type TaskType,
} from "../types";
import { resolveTaskEvidence } from "../validator/task-classifier";
import {
  reportFollowUpId,
  reportKeyFromReport,
  resolveReportFollowUpByRef,
} from "../types/subagent-reports";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";

const RoutingSchema = z.enum([
  "pre_planning_task",
  "post_planning_fast_follow",
]);

function makeTaskId(): string {
  return `tk-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function findReportByKey(
  change: Change,
  reportKey: string,
): ScopedSubagentReport | undefined {
  return (change.subagent_reports ?? []).find(
    (report) => reportKeyFromReport(report) === reportKey,
  );
}

async function getChangeHandleForChangeId(
  store: Store,
  changeId: string,
): Promise<ReturnType<typeof getChangeHandle>> {
  const bundle = getService();
  if (!bundle) throw new Error("Temporal service not available");
  const projectId =
    store.productContext?.productProjectId ??
    (await getProjectId(store.paths.root));
  if (!projectId) throw new Error("Could not resolve project ID");
  return getChangeHandle(bundle.client, projectId, changeId);
}

async function loadSourceChange(
  store: Store,
  changeId: string,
): Promise<{ ok: true; change: Change } | { ok: false; error: string }> {
  const result = await store.changes.get(changeId);
  if (!result.success) {
    return { ok: false, error: result.error ?? `Failed to load ${changeId}` };
  }
  if (!result.data) {
    return { ok: false, error: `Source change not found: ${changeId}` };
  }
  return { ok: true, change: result.data };
}

interface PromotionInput {
  source_change_id: string;
  source_report_key: string;
  follow_up_kind: ReportFollowUpKind;
  follow_up_index: number;
  summary: string;
  capability?: string;
  type?: TaskType;
  metadata?: Record<string, string>;
  routing?: z.infer<typeof RoutingSchema>;
  dryRun?: boolean;
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
}

function validateArgs(
  args: PromotionInput,
): { ok: true } | { ok: false; error: string } {
  if (!args.summary.trim()) {
    return { ok: false, error: "summary is required and cannot be blank." };
  }
  if (!args.source_change_id.trim()) {
    return { ok: false, error: "source_change_id is required." };
  }
  if (!args.source_report_key.trim()) {
    return { ok: false, error: "source_report_key is required." };
  }
  if (args.follow_up_index < 0) {
    return { ok: false, error: "follow_up_index must be >= 0." };
  }
  if (args.target_path) {
    return {
      ok: false,
      error:
        "target_path is not supported: report follow-up promotion creates same-project owners only (C1).",
    };
  }
  return { ok: true };
}

function resolveRouting(
  change: Change,
  explicit?: z.infer<typeof RoutingSchema>,
): z.infer<typeof RoutingSchema> {
  if (explicit) return explicit;
  const planningDone = change.gates?.planning?.status === "done";
  return planningDone ? "post_planning_fast_follow" : "pre_planning_task";
}

async function createPrePlanningTask(
  input: PromotionInput,
  sourceStore: Store,
  sourceChange: Change,
  ref: ReportFollowUpRef,
): Promise<
  | { ok: true; result: { taskId: string; task: Task } }
  | { ok: false; error: string }
> {
  const now = new Date().toISOString();
  const tasks = sourceChange.tasks ?? [];
  const nextPriority =
    tasks.length === 0 ? 0 : Math.max(...tasks.map((t) => t.priority ?? 0)) + 1;

  const mergedMetadata: Record<string, string> = {
    ...(input.metadata ?? {}),
    followup_ref: JSON.stringify(ref),
  };

  const task: Task = {
    id: makeTaskId(),
    title: input.summary,
    type: input.type ?? "code",
    status: "pending",
    priority: nextPriority,
    created_at: now,
    ...(Object.keys(mergedMetadata).length > 0
      ? { metadata: mergedMetadata }
      : {}),
    followup_ref: ref,
  };

  // Normalize evidence plan for every planned pre-planning task.
  const evidenceResolution = resolveTaskEvidence(task);
  const evidencePlan: TaskEvidencePlan = {
    policy: evidenceResolution.policy!,
    proof_target: evidenceResolution.proof_target!,
    ...(evidenceResolution.rationale
      ? { rationale: evidenceResolution.rationale }
      : {}),
    ...(evidenceResolution.review_conclusion
      ? { review_conclusion: evidenceResolution.review_conclusion }
      : {}),
    provenance: "new",
  };
  task.evidence_plan = evidencePlan;

  try {
    const handle = await getChangeHandleForChangeId(
      sourceStore,
      input.source_change_id,
    );
    await fireSignalAndRefresh(
      handle,
      sourceStore,
      input.source_change_id,
      taskAddedSignal,
      {
        task,
        addedAt: now,
      },
    );
    return { ok: true, result: { taskId: task.id, task } };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to create pre-planning task: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function createPostPlanningFastFollow(
  input: PromotionInput,
  sourceStore: Store,
  sourcePath: string,
  ref: ReportFollowUpRef,
): Promise<
  | { ok: true; result: { changeId: string; path: string } }
  | { ok: false; error: string }
> {
  const linkedAt = new Date().toISOString();
  const fastFollowOf = {
    parent_change_id: input.source_change_id,
    linked_at: linkedAt,
    followup_ref: ref,
  };

  try {
    const result = await sourceStore.changes.create(input.summary, {
      capability: input.capability,
      initialMetadata: {
        fast_follow_of: fastFollowOf,
      },
    });
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to create fast-follow child change: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function promoteInStore(
  input: PromotionInput,
  sourceStore: Store,
  sourcePath: string,
): Promise<string> {
  const sourceLoad = await loadSourceChange(
    sourceStore,
    input.source_change_id,
  );
  if (!sourceLoad.ok) return formatToolOutput({ error: sourceLoad.error });
  const sourceChange = sourceLoad.change;

  const report = findReportByKey(sourceChange, input.source_report_key);
  if (!report) {
    return formatToolOutput({
      error: `Report not found on source change: ${input.source_report_key}`,
    });
  }

  const ref: ReportFollowUpRef = {
    report_key: input.source_report_key,
    kind: input.follow_up_kind,
    index: input.follow_up_index,
  };

  const resolved = resolveReportFollowUpByRef(report, ref);
  if (!resolved) {
    return formatToolOutput({
      error: `Follow-up not found at ${input.follow_up_kind}[${input.follow_up_index}] in report ${input.source_report_key}`,
    });
  }

  const routing = resolveRouting(sourceChange, input.routing);

  if (input.dryRun) {
    return formatToolOutput({
      success: true,
      dryRun: true,
      source_change_id: input.source_change_id,
      followup_ref: ref,
      followup_id: reportFollowUpId(ref),
      routing,
      would_create:
        routing === "pre_planning_task"
          ? {
              kind: "task",
              title: input.summary,
              type: input.type ?? "code",
            }
          : {
              kind: "fast_follow_child",
              title: input.summary,
              parent_change_id: input.source_change_id,
            },
    });
  }

  if (routing === "pre_planning_task") {
    const createResult = await createPrePlanningTask(
      input,
      sourceStore,
      sourceChange,
      ref,
    );
    if (!createResult.ok)
      return formatToolOutput({ error: createResult.error });

    const output: Record<string, unknown> = {
      success: true,
      source_change_id: input.source_change_id,
      followup_ref: ref,
      followup_id: reportFollowUpId(ref),
      routing,
      task_id: createResult.result.taskId,
      task: createResult.result.task,
    };
    return formatToolOutput(output);
  }

  const createResult = await createPostPlanningFastFollow(
    input,
    sourceStore,
    sourcePath,
    ref,
  );
  if (!createResult.ok) return formatToolOutput({ error: createResult.error });

  const output: Record<string, unknown> = {
    success: true,
    source_change_id: input.source_change_id,
    followup_ref: ref,
    followup_id: reportFollowUpId(ref),
    routing,
    child_change_id: createResult.result.changeId,
    child_path: createResult.result.path,
  };
  return formatToolOutput(output);
}

export const reportFollowupTools = {
  adv_report_followup_promote: {
    description:
      "Promote a typed report follow-up (follow_ups or required_follow_ups) into a durable typed owner. " +
      "Before planning: creates a task on the source change carrying followup_ref. " +
      "After planning: creates a same-project fast-follow child change carrying followup_ref in fast_follow_of. " +
      "Operational work continues through adv_followup_promote; only blocks affects release. " +
      "Ordinary suggestions remain immutable report metadata until deliberately promoted. " +
      "New mutations reject Agenda source while legacy records parse.",
    args: {
      source_change_id: z
        .string()
        .describe("Change ID that owns the report follow-up."),
      source_report_key: z
        .string()
        .describe(
          "Stable sub-agent report key (subagentReportKey format) identifying the report.",
        ),
      follow_up_kind: ReportFollowUpKindSchema.describe(
        "Which follow-up array to promote: follow_ups (ordinary) or required_follow_ups (required).",
      ),
      follow_up_index: z
        .number()
        .int()
        .min(0)
        .describe(
          "Zero-based index within the selected follow-up array. Combined with source_report_key and follow_up_kind, this forms the structural followup_ref.",
        ),
      summary: z
        .string()
        .describe(
          "Title for the new task or fast-follow child change. Start with an action verb.",
        ),
      capability: z
        .string()
        .optional()
        .describe(
          "Primary capability affected (used for fast-follow child changes).",
        ),
      type: z
        .enum(["code", "docs", "ops", "research", "approval", "verification"])
        .optional()
        .describe(
          "Task type for pre-planning task creation. Defaults to 'code'.",
        ),
      metadata: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Optional task metadata merged with followup_ref for pre-planning tasks.",
        ),
      routing: RoutingSchema.optional().describe(
        "Explicit routing override. When omitted, derived from planning gate status: not done → pre_planning_task; done → post_planning_fast_follow.",
      ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "When true, returns a preview without creating tasks or changes.",
        ),
    },
    execute: async (args: PromotionInput, store: Store): Promise<string> => {
      const argValidation = validateArgs(args);
      if (!argValidation.ok)
        return formatToolOutput({ error: argValidation.error });

      const sourcePath = store.paths.root;
      return promoteInStore(args, store, sourcePath);
    },
  },
};
