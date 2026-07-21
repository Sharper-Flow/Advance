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
import { isWorkflowCompletedError } from "../temporal/recovery-classification";
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

/**
 * Durable per-task `adv_run_test` evidence recorded via `testRunRecordedSignal`
 * and persisted in `state.testRuns[taskId][]` (mirrored as `change.test_runs`).
 * Consulting it lets evidence recorded by ANY session (a sub-agent when plugin
 * tools are available, or an orchestrator relaying a sub-agent report) satisfy
 * the verification gate without the command being echoed in the task free-text.
 * Latest retained record per exact command wins (persisted array order ==
 * workflow application order; no timestamp sort), so a later GREEN supersedes an
 * earlier RED for the same command.
 *
 * rq-subagentReports25: typed test-run binding. The latest record keyed by
 * `runId` is also retained so engineer/designer verification entries carrying
 * a `run_id` bind to durable same-task typed identity. The `command` label
 * remains descriptive only — cosmetic command-label differences (extra args,
 * reordered flags, prefix vars, absolute paths) MUST NOT break identity match.
 */
type DurableTestRunLike = {
  runId?: string;
  command?: string;
  exitCode?: number | null;
};

function latestDurableByCommand(
  records: readonly DurableTestRunLike[] | undefined,
): Map<string, { exitCode: number | null }> {
  const map = new Map<string, { exitCode: number | null }>();
  for (const record of records ?? []) {
    if (record && typeof record.command === "string" && record.command) {
      map.set(record.command, { exitCode: record.exitCode ?? null });
    }
  }
  return map;
}

function latestDurableByRunId(
  records: readonly DurableTestRunLike[] | undefined,
): Map<string, { exitCode: number | null; command: string }> {
  const map = new Map<string, { exitCode: number | null; command: string }>();
  for (const record of records ?? []) {
    if (record && typeof record.runId === "string" && record.runId) {
      map.set(record.runId, {
        exitCode: record.exitCode ?? null,
        command: typeof record.command === "string" ? record.command : "",
      });
    }
  }
  return map;
}

function verificationWarnings(
  report: ScopedSubagentReport,
  task?: Task,
  durableRecords?: readonly DurableTestRunLike[],
): ConsumerWarning[] {
  if (report.agent === "adv-reviewer") {
    return report.verification.tests_run.map((command) => ({
      kind: "verification_missing" as const,
      message: `Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: ${command}`,
    }));
  }
  if (!task) return [];
  const recorded = [
    task.verification,
    task.summary,
    task.implementation_summary,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
  const structuredEvidence = evidenceByCommand(recorded);
  const durableByCommand = latestDurableByCommand(durableRecords);
  const durableByRunId = latestDurableByRunId(durableRecords);

  if (report.agent === "adv-engineer" || report.agent === "adv-designer") {
    return report.verification.flatMap((entry): ConsumerWarning[] => {
      // rq-subagentReports25: typed-binding provenance. When the entry
      // carries a typed run reference (`test_run_id` preferred, `run_id`
      // accepted as additive alias), identity is (run_id, exit_code); the
      // `command` label is descriptive only and MUST NOT control authority.
      // A missing typed durable record surfaces `verification_missing`; an
      // exit-code mismatch surfaces `verification_mismatch`. The entry's
      // `summary` prose is descriptive only and MUST NOT satisfy the gap.
      const entryRunId =
        typeof (entry as { test_run_id?: unknown }).test_run_id === "string" &&
        (entry as { test_run_id?: string }).test_run_id
          ? (entry as { test_run_id: string }).test_run_id
          : typeof (entry as { run_id?: unknown }).run_id === "string" &&
              (entry as { run_id?: string }).run_id
            ? (entry as { run_id: string }).run_id
            : undefined;

      if (entryRunId) {
        const durable = durableByRunId.get(entryRunId);
        if (!durable) {
          return [
            {
              kind: "verification_missing" as const,
              message: `No durable adv_run_test evidence found for run_id: ${entryRunId}`,
            },
          ];
        }
        if (durable.exitCode !== null && durable.exitCode !== entry.exit_code) {
          return [
            {
              kind: "verification_mismatch" as const,
              message: `Reported exit_code ${entry.exit_code} differs from durable adv_run_test exitCode ${durable.exitCode} for run_id: ${entryRunId}`,
            },
          ];
        }
        return [];
      }

      // Legacy variant (no typed-binding provenance): exact-command
      // compatibility is preserved. No fuzzy normalization, no timestamp
      // cutover; the entry's `command` field is authoritative.
      const durable = durableByCommand.get(entry.command);
      if (durable) {
        if (durable.exitCode !== null && durable.exitCode !== entry.exit_code) {
          return [
            {
              kind: "verification_mismatch" as const,
              message: `Reported exit_code ${entry.exit_code} differs from durable adv_run_test evidence exitCode ${durable.exitCode} for command: ${entry.command}`,
            },
          ];
        }
        return [];
      }

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
  const evidenceBinding =
    report.agent === "adv-engineer" || report.agent === "adv-designer"
      ? {
          evidence_binding_version: report.verification.some(
            (entry) => entry.test_run_id ?? entry.run_id,
          )
            ? ("typed-v1" as const)
            : ("legacy-command-v0" as const),
        }
      : {};
  if (merged.length === 0) {
    return { ...report, ...evidenceBinding } as ScopedSubagentReport;
  }
  return {
    ...report,
    ...evidenceBinding,
    consumer_warnings: merged,
  } as ScopedSubagentReport;
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

// rq-fixWorkflowReliabilityDefects/AC4: malformed report input returns bounded
// diagnostics from the canonical plugin preflight and never mutates workflow
// state. The handler-level parseReport path is defense-in-depth for callers
// that bypass the wrapper (tests, plugins); it MUST NOT silently record task
// error_recovery on malformed input either, because error_recovery is itself a
// workflow mutation. SUBMIT_SIGNAL_FAILED and INVALID_TASK_ANCHOR keep their
// failureRecord path — those are post-parse workflow errors, not malformed
// input, and the orchestrator needs that signal.
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

  // Read fresh workflow state so durable adv_run_test evidence recorded via
  // testRunRecordedSignal is visible: adv_run_test is cache-refresh-exempt, so a
  // stale changeCache entry could otherwise omit just-recorded test_runs and
  // produce a false verification_missing (validator blocker).
  try {
    await store.changes.refresh?.(parsedReport.report.change_id);
  } catch {
    // Best-effort: a refresh failure must never block report submission.
  }
  const change = await loadChange(store, parsedReport.report.change_id);
  if (
    parsedReport.report.agent === "adv-researcher" &&
    parsedReport.report.scope.scope_key.startsWith(
      "researcher:design-validation",
    )
  ) {
    // Relocated from ResearcherSubagentReportSchema.superRefine check-3.
    // Must run BEFORE the AC13 flatMap below: bare strings are silently
    // mapped to [] by the AC13 guard, so without this check a new
    // bare-string blocker would slip through to normal signaling and
    // persist — violating AC3. See design C7 in makeLegacyDesignValidation.
    const stringBlockerIndices: number[] = [];
    parsedReport.report.validation.blockers.forEach((blocker, index) => {
      if (typeof blocker === "string") {
        stringBlockerIndices.push(index);
      }
    });
    if (stringBlockerIndices.length > 0) {
      return appendProjectContext(
        formatToolOutput({
          error:
            "new design-validation blockers require typed contract IDs, in-scope remediation, and source evidence",
          code: "INVALID_REPORT",
          details: { stringBlockerIndices },
        }),
        projectContext,
      );
    }

    const approvedIds = new Set(
      (change.contract?.items ?? []).map((item) => item.id),
    );
    const unknownIds = parsedReport.report.validation.blockers.flatMap(
      (blocker) =>
        typeof blocker === "string"
          ? []
          : blocker.contract_ids.filter((id) => !approvedIds.has(id)),
    );
    if (unknownIds.length > 0) {
      return appendProjectContext(
        formatToolOutput({
          error: "Design-validator blocker cites unknown contract IDs",
          code: "INVALID_REPORT",
          details: { unknownContractIds: [...new Set(unknownIds)] },
        }),
        projectContext,
      );
    }
  }
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

  const initialWarnings = verificationWarnings(
    parsedReport.report,
    task,
    taskId ? change.test_runs?.[taskId] : undefined,
  );
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
        // Tightened authorization for non-terminal WorkflowNotFound recovery
        // (AC3/SC2): use the structural completed-workflow classifier instead
        // of a regex on the message text. This catches err.name-only matches
        // (e.g. WorkflowNotFoundError with a generic message) and rejects
        // benign messages that merely contain a recognized substring.
        const completedWorkflow = isWorkflowCompletedError(error);
        if (completedWorkflow) {
          // Derive precise audit evidence from the error so the recovery
          // record cites the actual completed-workflow marker.
          const errorName = error instanceof Error ? error.name : undefined;
          const evidence =
            errorName && errorName !== "Error"
              ? `${errorName}: ${message}`
              : message;
          try {
            await saveRecoveredSubagentReport({
              store,
              change,
              report,
              authorization: {
                reason: "post_archive_report_persist_race_fallback",
                evidence,
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
        "Typed sub-agent report payload. v1 supports adv-engineer, adv-reviewer, adv-designer, adv-researcher, adv-tron, orchestrator-submitted adv-scanner-bundle reports, and orchestrator-submitted adv-verification-triage-bundle reports. For canonical REVIEWER_REPORT shapes (READY + CONFLICT), see .opencode/agents/adv-reviewer.md § REVIEWER_REPORT Payload — discrimination is by `agent` field; each variant has distinct required fields (e.g., adv-reviewer requires scope, verification, scope_drift, required_main_agent_actions).",
      ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview validation, dedupe, and consumers without signaling or writing state.",
        ),
      ...targetArgs,
    },
    // OpenCode otherwise rejects the strict report union before ADV can return
    // nested issue paths. This schema admits only the report object envelope;
    // canonical args above remain ADV catalog/preflight authority.
    transportArgs: {
      report: z.record(z.string(), z.unknown()),
      dryRun: z.boolean().optional(),
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
