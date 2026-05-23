import { z } from "zod";
import type { Store } from "../storage/store-types";
import { addAgendaItem } from "../storage/agenda";
import { getService } from "../temporal/service";
import { subagentReportSubmittedSignal } from "../temporal/messages";
import { subagentReportKey } from "../temporal/contracts";
import {
  SUBAGENT_REPORT_SCHEMA_VERSION,
  SubagentAgentSchema,
  SubagentConsumerWarningSchema,
  SupportedSubagentReportSchema,
  type Change,
  type SupportedSubagentReport,
  type Task,
} from "../types";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
import {
  formatTargetProjectContext,
  withTargetPathStore,
  type TargetProjectOutputContext,
} from "./target-project";

type ConsumerWarning = z.infer<typeof SubagentConsumerWarningSchema>;

const targetArgs = {
  target_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute path to another ADV project. When provided, routes the operation through that project's target store.",
    ),
  target_confirmed: z
    .literal(true)
    .optional()
    .describe(
      "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
    ),
  confirmationEvidence: z
    .string()
    .optional()
    .describe(
      "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
    ),
};

const reportAgentProbeSchema = z
  .object({
    schema_version: z.literal(SUBAGENT_REPORT_SCHEMA_VERSION),
    agent: SubagentAgentSchema,
  })
  .passthrough();

interface SubmitArgs {
  report: unknown;
  dryRun?: boolean;
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
}

async function getChangeHandleForChangeId(store: Store, changeId: string) {
  const bundle = getService();
  if (!bundle) throw new Error("Temporal service not available");
  const projectId =
    store.productContext?.productProjectId ??
    (await getProjectId(store.paths.root));
  if (!projectId) throw new Error("Could not resolve project ID");
  return getChangeHandle(bundle.client, projectId, changeId);
}

async function loadChange(store: Store, changeId: string): Promise<Change> {
  const result = await store.changes.get(changeId);
  if (!result.success) throw new Error(result.error);
  if (!result.data) throw new Error(`Change not found: ${changeId}`);
  return result.data;
}

function getTaskOrError(change: Change, taskId: string): Task {
  const task = (change.tasks ?? []).find(
    (candidate) => candidate.id === taskId,
  );
  if (!task)
    throw new Error(`Task not found in change ${change.id}: ${taskId}`);
  return task;
}

function parseReport(
  rawReport: unknown,
):
  | { ok: true; report: SupportedSubagentReport }
  | { ok: false; code: string; message: string; details?: unknown } {
  const probe = reportAgentProbeSchema.safeParse(rawReport);
  if (!probe.success) {
    return {
      ok: false,
      code: "INVALID_REPORT",
      message: "Invalid sub-agent report payload",
      details: probe.error.issues,
    };
  }

  if (
    probe.data.agent === "adv-researcher" ||
    probe.data.agent === "adv-tron"
  ) {
    return {
      ok: false,
      code: "UNSUPPORTED_AGENT",
      message: `Unsupported sub-agent report type for v1 submit: ${probe.data.agent}`,
    };
  }

  const parsed = SupportedSubagentReportSchema.safeParse(rawReport);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_REPORT",
      message: "Invalid sub-agent report payload",
      details: parsed.error.issues,
    };
  }

  return { ok: true, report: parsed.data };
}

function reportId(report: SupportedSubagentReport): string {
  return subagentReportKey({
    changeId: report.change_id,
    taskId: report.task_id,
    agent: report.agent,
    attempt: report.attempt,
  });
}

function hasExistingReport(task: Task, id: string): boolean {
  return (task.subagent_reports ?? []).some(
    (existing) => reportId(existing) === id,
  );
}

function reportFollowUps(report: SupportedSubagentReport): string[] {
  if (report.agent === "adv-engineer") return report.follow_ups;
  return [];
}

function extractRecordedExitCode(text: string): number | undefined {
  const match = text.match(/(?:exitCode|exit_code|exit\s+code)\D*(-?\d+)/i);
  if (!match) return undefined;
  return Number.parseInt(match[1] ?? "", 10);
}

function verificationWarnings(
  report: SupportedSubagentReport,
  task: Task,
): ConsumerWarning[] {
  const recorded = [
    task.verification,
    task.summary,
    task.implementation_summary,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");

  if (report.agent === "adv-engineer") {
    return report.verification.flatMap((entry): ConsumerWarning[] => {
      if (!recorded.includes(entry.command)) {
        return [
          {
            kind: "verification_missing" as const,
            message: `No adv_run_test evidence found for reported command: ${entry.command}`,
          },
        ];
      }

      const recordedExitCode = extractRecordedExitCode(recorded);
      if (
        recordedExitCode !== undefined &&
        recordedExitCode !== entry.exit_code
      ) {
        return [
          {
            kind: "verification_mismatch" as const,
            message: `Reported exit_code ${entry.exit_code} differs from recorded exitCode ${recordedExitCode} for command: ${entry.command}`,
          },
        ];
      }

      return [];
    });
  }

  return report.verification.tests_run
    .filter((command) => !recorded.includes(command))
    .map((command) => ({
      kind: "verification_missing" as const,
      message: `No adv_run_test evidence found for reported command: ${command}`,
    }));
}

function withConsumerWarnings(
  report: SupportedSubagentReport,
  warnings: ConsumerWarning[],
): SupportedSubagentReport {
  const merged = [...(report.consumer_warnings ?? []), ...warnings];
  if (merged.length === 0) return report;
  return { ...report, consumer_warnings: merged } as SupportedSubagentReport;
}

async function consumeFollowUps(input: {
  store: Store;
  report: SupportedSubagentReport;
  dryRun?: boolean;
}): Promise<{
  previewCount: number;
  created: unknown[];
  warnings: ConsumerWarning[];
}> {
  const followUps = reportFollowUps(input.report);
  if (input.dryRun) {
    return { previewCount: followUps.length, created: [], warnings: [] };
  }

  const created: unknown[] = [];
  const warnings: ConsumerWarning[] = [];
  for (const followUp of followUps) {
    try {
      created.push(
        await addAgendaItem(input.store.paths.root, followUp, {
          description: `Source: ${input.report.change_id}/${input.report.task_id}/${input.report.agent}`,
          priority: "medium",
          category: "subagent-followup",
          agendaPath: input.store.paths.agenda,
        }),
      );
    } catch (error) {
      warnings.push({
        kind: "consumer_failure",
        message:
          error instanceof Error
            ? `Failed to add follow-up agenda item: ${error.message}`
            : "Failed to add follow-up agenda item",
      });
    }
  }

  return { previewCount: followUps.length, created, warnings };
}

function appendProjectContext(
  output: string,
  projectContext?: TargetProjectOutputContext,
): string {
  if (!projectContext) return output;
  const parsed = JSON.parse(output) as Record<string, unknown>;
  parsed._projectContext = projectContext;
  return JSON.stringify(parsed);
}

async function executeSubmit(
  args: SubmitArgs,
  store: Store,
  projectContext?: TargetProjectOutputContext,
): Promise<string> {
  const parsedReport = parseReport(args.report);
  if (!parsedReport.ok) {
    return appendProjectContext(
      formatToolOutput({
        error: parsedReport.message,
        code: parsedReport.code,
        details: parsedReport.details,
      }),
      projectContext,
    );
  }

  const change = await loadChange(store, parsedReport.report.change_id);
  const task = getTaskOrError(change, parsedReport.report.task_id);
  const id = reportId(parsedReport.report);

  if (hasExistingReport(task, id)) {
    return appendProjectContext(
      formatToolOutput({
        success: true,
        duplicate: true,
        dryRun: Boolean(args.dryRun),
        reportId: id,
        consumerResults: {
          followUps: { previewCount: 0, created: [] },
          verification: { warnings: [] },
        },
      }),
      projectContext,
    );
  }

  const initialWarnings = verificationWarnings(parsedReport.report, task);
  const report = withConsumerWarnings(parsedReport.report, initialWarnings);

  if (!args.dryRun) {
    const handle = await getChangeHandleForChangeId(store, report.change_id);
    await fireSignalAndRefresh(
      handle,
      store,
      report.change_id,
      subagentReportSubmittedSignal,
      {
        taskId: report.task_id,
        report,
        submittedAt: new Date().toISOString(),
      },
    );
  }

  const followUps = await consumeFollowUps({
    store,
    report,
    dryRun: args.dryRun,
  });
  const warnings = [...initialWarnings, ...followUps.warnings];

  return appendProjectContext(
    formatToolOutput({
      success: true,
      duplicate: false,
      dryRun: Boolean(args.dryRun),
      reportId: id,
      report,
      consumerResults: {
        followUps: {
          previewCount: followUps.previewCount,
          created: followUps.created,
        },
        verification: { warnings },
      },
    }),
    projectContext,
  );
}

export const subagentReportTools = {
  adv_subagent_report_submit: {
    description:
      "Submit a typed, Zod-validated sub-agent report and persist it on the owning ADV task.",
    args: {
      report: z
        .unknown()
        .describe(
          "Typed sub-agent report payload. v1 supports adv-engineer and adv-reviewer; adv-researcher and adv-tron are reserved but rejected until populated.",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview validation, dedupe, and consumers without signaling or writing agenda items.",
        ),
      ...targetArgs,
    },
    execute: async (args: SubmitArgs, store: Store): Promise<string> => {
      try {
        if (args.target_path) {
          return withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path: args.target_path,
              target_confirmed: args.target_confirmed,
              confirmationEvidence: args.confirmationEvidence,
              stateRequirement: "temporal-required",
            },
            async ({ context, store: targetStore }) =>
              executeSubmit(
                { ...args, target_path: undefined },
                targetStore,
                formatTargetProjectContext(context),
              ),
          );
        }

        return executeSubmit(args, store);
      } catch (error) {
        return formatToolOutput({
          error:
            error instanceof Error
              ? error.message
              : "Failed to submit sub-agent report",
        });
      }
    },
  },
};
