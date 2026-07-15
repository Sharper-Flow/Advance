import { z } from "zod";
import type { Store } from "../storage/store-types";
import { getService } from "../temporal/service";
import {
  subagentReportSubmittedSignal,
  taskUpdatedSignal,
} from "../temporal/messages";
import {
  subagentReportImplementationCycleId,
  subagentReportKey,
} from "../types/subagent-reports";
import {
  SUBAGENT_REPORT_SCHEMA_VERSION,
  SubagentAgentSchema,
  SubagentConsumerWarningSchema,
  ScopedSubagentReportSchema,
  type Change,
  type ErrorRecovery,
  type ScopedSubagentReport,
  type Task,
  type RequiredFollowUp,
} from "../types";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
import { saveRecoveredSubagentReport } from "./_recovery-writers";
import {
  formatTargetProjectContext,
  withTargetPathStore,
  type TargetProjectOutputContext,
} from "./target-project";

type ConsumerWarning = z.infer<typeof SubagentConsumerWarningSchema>;
const ConsumerWarningsSchema = z.array(SubagentConsumerWarningSchema);
const MAX_REPORT_FOLLOW_UPS = 10;

const AdvRunTestEvidenceSchema = z
  .object({
    schema_version: z.literal("adv_run_test.v1"),
    command: z.string().min(1),
    exitCode: z.number().int().nullable(),
    passed: z.boolean(),
    classification: z.string().min(1),
    durationMs: z.number().nonnegative(),
    // rq-TDD010qual: advisory quality signals (optional, additive)
    assertionDensity: z.number().nonnegative().optional(),
    mockSurface: z
      .array(
        z.object({
          pattern: z.string(),
          count: z.number().int().nonnegative(),
        }),
      )
      .optional(),
    behaviorSurface: z.enum(["small", "medium", "large"]).optional(),
  })
  .passthrough();

type AdvRunTestEvidence = z.infer<typeof AdvRunTestEvidenceSchema>;

function validateConsumerWarnings(
  warnings: ConsumerWarning[],
): ConsumerWarning[] {
  return ConsumerWarningsSchema.parse(warnings);
}

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

const reportIdentitySchema = z
  .object({
    change_id: z.string().min(1).optional(),
    task_id: z.string().min(1).optional(),
    agent: SubagentAgentSchema.optional(),
    attempt: z.number().int().min(1).optional(),
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

function findTask(change: Change, taskId: string): Task | undefined {
  const task = (change.tasks ?? []).find(
    (candidate) => candidate.id === taskId,
  );
  return task;
}

function invalidTaskAnchorOutput(input: {
  change: Change;
  taskId: string;
  report: ScopedSubagentReport;
  projectContext?: TargetProjectOutputContext;
}): string {
  return appendProjectContext(
    formatToolOutput({
      success: false,
      error:
        "Task-scoped sub-agent report references a task that does not exist in this change",
      code: "INVALID_TASK_ANCHOR",
      changeId: input.change.id,
      taskId: input.taskId,
      agent: input.report.agent,
      attempt: input.report.attempt,
      validTaskAnchors: (input.change.tasks ?? []).map((task) => ({
        id: task.id,
        title: task.title,
      })),
      guidance:
        "Task-scoped reports must use an existing ADV task ID. Independent review/harden reports must use the change-scoped reviewer variant. Scanner lanes must not call adv_subagent_report_submit directly.",
    }),
    input.projectContext,
  );
}

function parseReport(
  rawReport: unknown,
):
  | { ok: true; report: ScopedSubagentReport }
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

  const parsed = ScopedSubagentReportSchema.safeParse(rawReport);
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

function reportIdentity(rawReport: unknown): {
  changeId: string;
  taskId?: string;
  agent?: string;
  attempt: number;
} | null {
  const parsed = reportIdentitySchema.safeParse(rawReport);
  if (!parsed.success) return null;
  if (!parsed.data.change_id) return null;
  return {
    changeId: parsed.data.change_id,
    taskId: parsed.data.task_id,
    agent: parsed.data.agent,
    attempt: parsed.data.attempt ?? 1,
  };
}

function submitFailureRecovery(input: {
  code: string;
  message: string;
  identity: NonNullable<ReturnType<typeof reportIdentity>>;
  recordedAt: string;
}): ErrorRecovery {
  const agent = input.identity.agent ?? "unknown-agent";
  return {
    last_error: input.message.slice(0, 200),
    retry_count: input.identity.attempt,
    max_retries: 3,
    error_class: "SEMANTIC",
    next_strategy:
      "Fix sub-agent report payload or Temporal submission path and retry",
    attempts: [
      {
        attempt_number: input.identity.attempt,
        error: input.message,
        diagnosis: input.code,
        fix_tried: "adv_subagent_report_submit",
        strategy_label: `${agent}-report-submit-failure`,
        outcome: "failed",
        attempted_at: input.recordedAt,
      },
    ],
  };
}

async function recordSubmitFailure(input: {
  store: Store;
  rawReport: unknown;
  code: string;
  message: string;
}): Promise<{ recorded: boolean; reason?: string }> {
  const identity = reportIdentity(input.rawReport);
  if (!identity || !identity.taskId) {
    return { recorded: false, reason: "report identity unavailable" };
  }

  const recordedAt = new Date().toISOString();
  try {
    const handle = await getChangeHandleForChangeId(
      input.store,
      identity.changeId,
    );
    await fireSignalAndRefresh(
      handle,
      input.store,
      identity.changeId,
      taskUpdatedSignal,
      {
        taskId: identity.taskId,
        partial: {
          error_recovery: submitFailureRecovery({
            code: input.code,
            message: input.message,
            identity,
            recordedAt,
          }),
        },
        updatedAt: recordedAt,
      },
    );
    return { recorded: true };
  } catch (error) {
    return {
      recorded: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Return the durable task anchor only for task-scoped reports. Legacy string
 * scopes can still pair with a `task_id`; change-scoped sidecars intentionally
 * return undefined so they are stored outside task records.
 */
function reportTaskId(report: ScopedSubagentReport): string | undefined {
  if (typeof report.scope !== "string" && report.scope.kind === "task") {
    return report.scope.task_id;
  }
  return "task_id" in report ? report.task_id : undefined;
}

function reportId(report: ScopedSubagentReport): string {
  return subagentReportKey({
    changeId: report.change_id,
    taskId: reportTaskId(report),
    scope: typeof report.scope === "string" ? undefined : report.scope,
    agent: report.agent,
    attempt: report.attempt,
    implementationCycleId: subagentReportImplementationCycleId(report),
  });
}

function hasExistingReport(task: Task, id: string): boolean {
  return (task.subagent_reports ?? []).some(
    (existing) => reportId(existing) === id,
  );
}

function hasExistingSidecarReport(change: Change, id: string): boolean {
  return (change.subagent_reports ?? []).some(
    (existing) => reportId(existing) === id,
  );
}

function reportFollowUps(report: ScopedSubagentReport): string[] {
  return "follow_ups" in report ? report.follow_ups : [];
}

function reportRequiredFollowUps(
  report: ScopedSubagentReport,
): RequiredFollowUp[] {
  return "required_follow_ups" in report
    ? (report.required_follow_ups ?? [])
    : [];
}

function extractRecordedExitCode(text: string): number | undefined {
  const match = text.match(/(?:exitCode|exit_code|exit\s+code)\D*(-?\d+)/i);
  if (!match) return undefined;
  return Number.parseInt(match[1] ?? "", 10);
}

function collectAdvRunTestEvidence(
  value: unknown,
  target: AdvRunTestEvidence[],
): void {
  const direct = AdvRunTestEvidenceSchema.safeParse(value);
  if (direct.success) {
    target.push(direct.data);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectAdvRunTestEvidence(item, target);
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectAdvRunTestEvidence(item, target);
    }
  }
}

function extractAdvRunTestEvidence(text: string): AdvRunTestEvidence[] {
  const evidence: AdvRunTestEvidence[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;

    try {
      collectAdvRunTestEvidence(JSON.parse(trimmed), evidence);
    } catch {
      // Non-JSON lines remain on the legacy free-text path below.
    }
  }
  return evidence;
}

function evidenceByCommand(text: string): Map<string, AdvRunTestEvidence> {
  return new Map(
    extractAdvRunTestEvidence(text).map((evidence) => [
      evidence.command,
      evidence,
    ]),
  );
}

function verificationWarnings(
  report: ScopedSubagentReport,
  task?: Task,
): ConsumerWarning[] {
  if (!task) return [];
  const recorded = [
    task.verification,
    task.summary,
    task.implementation_summary,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
  const structuredEvidence = evidenceByCommand(recorded);

  if (report.agent === "adv-engineer" || report.agent === "adv-designer") {
    return report.verification.flatMap((entry): ConsumerWarning[] => {
      const evidence = structuredEvidence.get(entry.command);
      if (!evidence && !recorded.includes(entry.command)) {
        return [
          {
            kind: "verification_missing" as const,
            message: `No adv_run_test evidence found for reported command: ${entry.command}`,
          },
        ];
      }

      if (evidence) {
        if (
          evidence.exitCode !== null &&
          evidence.exitCode !== entry.exit_code
        ) {
          return [
            {
              kind: "verification_mismatch" as const,
              message: `Reported exit_code ${entry.exit_code} differs from structured adv_run_test.v1 exitCode ${evidence.exitCode} for command: ${entry.command}`,
            },
          ];
        }
        return [];
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

  if (report.agent === "adv-reviewer") {
    return report.verification.tests_run
      .filter(
        (command) =>
          !structuredEvidence.has(command) && !recorded.includes(command),
      )
      .map((command) => ({
        kind: "verification_missing" as const,
        message: `No adv_run_test evidence found for reported command: ${command}`,
      }));
  }

  return [];
}

function withConsumerWarnings(
  report: ScopedSubagentReport,
  warnings: ConsumerWarning[],
): ScopedSubagentReport {
  const merged = validateConsumerWarnings([
    ...(report.consumer_warnings ?? []),
    ...warnings,
  ]);
  if (merged.length === 0) return report;
  return { ...report, consumer_warnings: merged } as ScopedSubagentReport;
}

// retireAgendaWorkflow: report follow_ups remain source-attributed report
// metadata. No queue is written by the consumer; promotion happens only via
// adv_report_followup_promote / adv_followup_promote (AC2/AC3).
function consumeFollowUps(input: {
  report: ScopedSubagentReport;
  dryRun?: boolean;
}): {
  previewCount: number;
  created: unknown[];
  warnings: ConsumerWarning[];
} {
  const allFollowUps = reportFollowUps(input.report);
  const followUps = allFollowUps.slice(0, MAX_REPORT_FOLLOW_UPS);
  const truncationWarnings: ConsumerWarning[] =
    allFollowUps.length > MAX_REPORT_FOLLOW_UPS
      ? [
          {
            kind: "consumer_failure",
            message: `Report follow_ups truncated from ${allFollowUps.length} to ${MAX_REPORT_FOLLOW_UPS}`,
          },
        ]
      : [];
  void input.dryRun;
  return {
    previewCount: followUps.length,
    created: [],
    warnings: validateConsumerWarnings(truncationWarnings),
  };
}

// rq-subagentReports14: Required Follow-Up Preservation
// rq-opsFollowPromotion01: required follow-ups carry obligation_class,
// severity, and source_contract_id into typed ops follow-up promotion.
// retireAgendaWorkflow AC2: no agenda write; typed owner comes from
// adv_report_followup_promote (task / fast-follow child) or
// adv_followup_promote (ops child).
function consumeRequiredFollowUps(input: {
  report: ScopedSubagentReport;
  dryRun?: boolean;
}): {
  previewCount: number;
  created: unknown[];
  warnings: ConsumerWarning[];
} {
  const requiredFollowUps = reportRequiredFollowUps(input.report);
  void input.dryRun;
  return {
    previewCount: requiredFollowUps.length,
    created: [],
    warnings: [],
  };
}

// rq-designQualityEvidence01: advisory promotion of design-quality concerns.
// retireAgendaWorkflow AC4: designer concerns retain typed disposition and
// release-blocking behavior via state.design_concern_dispositions + the
// gate-readiness evaluator. The consumer no longer writes an agenda item;
// instead it surfaces an advisory `design_concern_promoted` consumer warning
// so the report reflects that structural blockers now apply. Dedupe-key logic
// is retained in `designConcernDedupeKey` for callers that need a stable
// reference to the (change, task, concern) tuple.
const DESIGN_DIMENSION_KEYS = [
  "component_correctness",
  "semantic_html_a11y",
  "responsive_behavior",
  "visual_polish",
  "site_design_consistency",
  "finer_details",
] as const;

function designConcernDedupeKey(
  changeId: string,
  taskId: string,
  concernKey: string,
): string {
  return `design-concern:${changeId}:${taskId}:${concernKey}`;
}

function consumeDesignerDesignConcerns(input: {
  report: ScopedSubagentReport;
  dryRun?: boolean;
}): {
  previewCount: number;
  created: unknown[];
  warnings: ConsumerWarning[];
} {
  const { report } = input;
  if (report.agent !== "adv-designer") {
    return { previewCount: 0, created: [], warnings: [] };
  }

  const taskId = reportTaskId(report);
  const concerns: { concernKey: string; title: string }[] = [];
  for (const dim of DESIGN_DIMENSION_KEYS) {
    if (report.design_dimensions[dim] === "concern") {
      const notes = report.design_dimensions.notes?.trim();
      concerns.push({
        concernKey: `dimension:${dim}`,
        title: `Resolve design concern: ${dim}${notes ? ` — ${notes}` : ""}`,
      });
    }
  }
  report.neighboring_recommendations.forEach((rec, index) => {
    concerns.push({
      concernKey: `neighbor:${index}`,
      title: `Resolve neighboring UI recommendation: ${rec.what}`,
    });
  });

  if (concerns.length === 0 || !taskId) {
    return { previewCount: concerns.length, created: [], warnings: [] };
  }

  void input.dryRun;
  const warnings: ConsumerWarning[] = concerns.map((concern) => ({
    kind: "design_concern_promoted" as const,
    message:
      `Design concern ${concern.concernKey} on task ${taskId} ` +
      `(dedupe ${designConcernDedupeKey(report.change_id, taskId, concern.concernKey)}) ` +
      `is a structural acceptance/release blocker until disposed via ` +
      `adv_design_concern_disposition.`,
  }));

  return {
    previewCount: concerns.length,
    created: [],
    warnings: validateConsumerWarnings(warnings),
  };
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
    const failureRecord =
      !args.dryRun && parsedReport.code === "INVALID_REPORT"
        ? await recordSubmitFailure({
            store,
            rawReport: args.report,
            code: parsedReport.code,
            message: parsedReport.message,
          })
        : undefined;
    return appendProjectContext(
      formatToolOutput({
        error: parsedReport.message,
        code: parsedReport.code,
        details: parsedReport.details,
        ...(failureRecord ? { failureRecord } : {}),
      }),
      projectContext,
    );
  }

  const change = await loadChange(store, parsedReport.report.change_id);
  const taskId = reportTaskId(parsedReport.report);
  const task = taskId ? findTask(change, taskId) : undefined;
  if (taskId && !task) {
    return invalidTaskAnchorOutput({
      change,
      taskId,
      report: parsedReport.report,
      projectContext,
    });
  }
  const id = reportId(parsedReport.report);

  if (
    hasExistingSidecarReport(change, id) ||
    (task && hasExistingReport(task, id))
  ) {
    return appendProjectContext(
      formatToolOutput({
        success: true,
        duplicate: true,
        dryRun: Boolean(args.dryRun),
        reportId: id,
        consumerResults: {
          followUps: { previewCount: 0, created: [] },
          requiredFollowUps: { previewCount: 0, created: [] },
          designConcerns: { previewCount: 0, created: [] },
          verification: { warnings: [] },
        },
      }),
      projectContext,
    );
  }

  const initialWarnings = verificationWarnings(parsedReport.report, task);
  const report = withConsumerWarnings(parsedReport.report, initialWarnings);

  if (!args.dryRun) {
    const isTerminal =
      change.status === "archived" || change.status === "closed";
    if (isTerminal) {
      // rq-subagentReports12: terminal workflows cannot accept
      // subagentReportSubmittedSignal. Route to the disk-projection fallback
      // so post-archive/post-close review reports persist durably. No early
      // return — consumers run after (they are file-based, work post-archive).
      try {
        await saveRecoveredSubagentReport({
          store,
          change,
          report,
          authorization: {
            reason:
              change.status === "archived"
                ? "post_archive_report_persist"
                : "post_close_report_persist",
            evidence: `change status is ${change.status} (terminal workflow)`,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to persist sub-agent report via disk projection";
        return appendProjectContext(
          formatToolOutput({
            error: message,
            code: "SUBMIT_SIGNAL_FAILED",
            reportId: id,
            persisted_via: "terminal-disk-projection",
          }),
          projectContext,
        );
      }
    } else {
      const handle = await getChangeHandleForChangeId(store, report.change_id);
      try {
        await fireSignalAndRefresh(
          handle,
          store,
          report.change_id,
          subagentReportSubmittedSignal,
          {
            ...(reportTaskId(report) ? { taskId: reportTaskId(report) } : {}),
            report,
            submittedAt: new Date().toISOString(),
          },
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to persist sub-agent report";
        // Defensive: an active→terminal race between loadChange and signal
        // surfaces as a completed-workflow error. Fall back to the disk
        // projection instead of returning SUBMIT_SIGNAL_FAILED.
        const isCompletedWorkflow =
          /already completed|WorkflowExecutionAlreadyCompleted|WorkflowNotFound/i.test(
            message,
          );
        if (isCompletedWorkflow) {
          try {
            await saveRecoveredSubagentReport({
              store,
              change,
              report,
              authorization: {
                reason: "post_archive_report_persist_race_fallback",
                evidence: message,
              },
            });
          } catch (fallbackError) {
            const fbMessage =
              fallbackError instanceof Error
                ? fallbackError.message
                : "Disk-projection fallback also failed";
            return appendProjectContext(
              formatToolOutput({
                error: fbMessage,
                code: "SUBMIT_SIGNAL_FAILED",
                reportId: id,
              }),
              projectContext,
            );
          }
        } else {
          const failureRecord = await recordSubmitFailure({
            store,
            rawReport: report,
            code: "SUBMIT_SIGNAL_FAILED",
            message,
          });
          return appendProjectContext(
            formatToolOutput({
              error: message,
              code: "SUBMIT_SIGNAL_FAILED",
              reportId: id,
              failureRecord,
            }),
            projectContext,
          );
        }
      }
    }
  }

  const followUps = consumeFollowUps({
    report,
    dryRun: args.dryRun,
  });
  const requiredFollowUps = consumeRequiredFollowUps({
    report,
    dryRun: args.dryRun,
  });
  const designConcerns = consumeDesignerDesignConcerns({
    report,
    dryRun: args.dryRun,
  });
  const warnings = [
    ...initialWarnings,
    ...followUps.warnings,
    ...requiredFollowUps.warnings,
    ...designConcerns.warnings,
  ];

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
        requiredFollowUps: {
          previewCount: requiredFollowUps.previewCount,
          created: requiredFollowUps.created,
        },
        designConcerns: {
          previewCount: designConcerns.previewCount,
          created: designConcerns.created,
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
      "Submit a typed, Zod-validated sub-agent report and persist it on the owning ADV change/task scope.",
    args: {
      report: ScopedSubagentReportSchema.describe(
        "Typed sub-agent report payload. v1 supports adv-engineer, adv-reviewer, adv-designer, adv-researcher, adv-tron, orchestrator-submitted adv-scanner-bundle reports, and orchestrator-submitted adv-verification-triage-bundle reports.",
      ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview validation, dedupe, and consumers without signaling or writing state.",
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
