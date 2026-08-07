/**
 * Pure loop-ledger projection over already-loaded Change / workflow-state-like
 * records (D6). No storage, tool, or node imports — safe for workflow, tool,
 * and test callers.
 *
 * The projector DERIVES a unified loop vocabulary from authoritative source
 * records; it never mutates state, never increments retry budgets, and never
 * authorizes task/gate completion (AC5/D5). Missing legacy fields default
 * safely and never throw (AC6/DDC5).
 *
 * rq-loopLedger01 — opt-in compact/detail _loopLedger readback (1–100/default
 * 20; legacy include.ledger unchanged; target_path + terminal safe).
 * rq-subagentReports23 — report-derived review/harden/verification/ci entries
 * are typed evidence, not authority; UNKNOWN/routing-only → inconclusive.
 * rq-TDD012ledgerEvidence — test_runs + retryFailureCount are evidence, never
 * retry/attempt authority (testRunRecordedSignal ordering + task.error_recovery
 * remain authoritative).
 */

import type {
  LoopKind,
  LoopLedgerEntry,
  LoopLedgerReadback,
  LoopLedgerSummary,
  LoopSourceRef,
  LoopVerdict,
} from "../types/loop-ledger";
import { LOOP_LEDGER_SCHEMA_VERSION } from "../types/loop-ledger";
import { observedAttemptCount } from "../types/tasks";
import type { SubagentAgent } from "../types/subagent-reports";
import type { SubagentReportScope } from "../types/subagent-reports";
import {
  subagentReportImplementationCycleId,
  subagentReportKey,
} from "../types/subagent-reports";

// ---------------------------------------------------------------------------
// Loose structural input (legacy-tolerant). All fields optional.
// ---------------------------------------------------------------------------

interface AttemptLike {
  attempt_number?: number;
  outcome?: string;
  attempted_at?: string;
}

interface TestRunLike {
  runId?: string;
  recordedAt?: string;
}

interface ReportScopeLike {
  kind?: string;
  task_id?: string;
  scope_key?: string;
}

interface ReportLike {
  agent?: string;
  phase?: string;
  verdict?: string;
  status?: string;
  error_class?: string;
  attempt?: number;
  change_id?: string;
  scope?: ReportScopeLike | string | null;
  task_id?: string;
  targets?: Array<Record<string, unknown>> | null;
  findings?: unknown[] | null;
  summary?: string;
  recommended_next_action?: string;
}

interface TaskLike {
  id?: string;
  status?: string;
  attempts?: AttemptLike[] | null;
  error_recovery?: {
    attempts?: AttemptLike[] | null;
    error_class?: string;
    next_strategy?: string;
    retry_count?: number;
    max_retries?: number;
    last_error?: string;
  } | null;
  subagent_reports?: ReportLike[] | null;
}

export interface LoopLedgerSourceState {
  changeId?: string;
  tasks?: TaskLike[] | null;
  subagent_reports?: ReportLike[] | null;
  /** Per-task test-run records (ring-buffered). Evidence refs only (DDC8). */
  testRuns?: Record<string, TestRunLike[] | null | undefined> | null;
}

export interface ProjectLoopLedgerOptions {
  /** When true, include bounded detailed entries (opt-in). */
  details?: boolean;
  /** Detail limit; clamped to [1, MAX_DETAIL_LIMIT]. Default 20. */
  limit?: number;
}

const DEFAULT_DETAIL_LIMIT = 20;
const MAX_DETAIL_LIMIT = 100;

// ---------------------------------------------------------------------------
// Identity helpers (mirror tools/change.ts subagentReportReadbackKey)
// ---------------------------------------------------------------------------

function reportTaskId(report: ReportLike): string | undefined {
  if (
    report.scope &&
    typeof report.scope === "object" &&
    report.scope.kind === "task"
  ) {
    return report.scope.task_id;
  }
  return typeof report.task_id === "string" ? report.task_id : undefined;
}

function reportScope(report: ReportLike): SubagentReportScope | undefined {
  if (
    report.scope &&
    typeof report.scope === "object" &&
    (report.scope.kind === "task" || report.scope.kind === "change")
  ) {
    return report.scope as SubagentReportScope;
  }
  return undefined;
}

function reportKey(
  report: ReportLike,
  fallbackChangeId: string,
): string | undefined {
  if (
    typeof report.agent !== "string" ||
    typeof report.attempt !== "number" ||
    !Number.isFinite(report.attempt) ||
    report.attempt < 1
  ) {
    return undefined;
  }
  const changeId =
    (typeof report.change_id === "string" && report.change_id) ||
    fallbackChangeId;
  if (!changeId) return undefined;
  return subagentReportKey({
    changeId,
    taskId: reportTaskId(report),
    scope: reportScope(report),
    agent: report.agent as SubagentAgent,
    attempt: report.attempt,
    implementationCycleId: subagentReportImplementationCycleId(report as never),
  });
}

function latestTimestamp(
  values: Array<string | undefined>,
): string | undefined {
  let latest: string | undefined;
  for (const value of values) {
    if (typeof value !== "string" || !value) continue;
    if (latest === undefined || value > latest) latest = value;
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Source adapters
// ---------------------------------------------------------------------------

const ESCALATED_ERROR_CLASSES = new Set(["FATAL", "ENVIRONMENTAL"]);

function buildApplyEntry(
  task: TaskLike,
  changeId: string,
  testRuns: TestRunLike[],
): LoopLedgerEntry | undefined {
  const taskId = typeof task.id === "string" ? task.id : undefined;
  if (!taskId) return undefined;

  const taskAttempts = task.attempts ?? [];
  const errAttempts = task.error_recovery?.attempts ?? [];
  // error_recovery.attempts is a bounded retention window, so severity must be
  // counted from what occurred, not what was retained. observedAttemptCount
  // also covers the legacy retry_count-only case the old fallback handled.
  let attemptCount =
    taskAttempts.length + observedAttemptCount(task.error_recovery);
  if (attemptCount === 0 && (task.error_recovery?.retry_count ?? 0) > 0) {
    attemptCount = task.error_recovery!.retry_count!;
  }

  // testRuns are evidence refs, never an attempt-count source (DDC8). A task
  // with no recorded retry attempts is not a retry loop — do not fabricate.
  if (attemptCount === 0) return undefined;

  const errorClass = task.error_recovery?.error_class;
  let verdict: LoopVerdict;
  let stopReason: string | undefined;
  if (task.status === "done") {
    verdict = "pass";
    stopReason = "task completed";
  } else if (task.status === "blocked") {
    verdict = "blocked";
    stopReason = "task blocked";
  } else if (errorClass && ESCALATED_ERROR_CLASSES.has(errorClass)) {
    verdict = "blocked";
    stopReason = `escalated: ${errorClass}`;
  } else {
    verdict = "fail";
  }

  const sourceRefs: LoopSourceRef[] = [{ kind: "task", taskId }];
  for (const run of testRuns) {
    if (run && typeof run.runId === "string" && run.runId) {
      sourceRefs.push({ kind: "test_run", taskId, runId: run.runId });
    }
  }

  return {
    id: `apply_retry|${changeId}|${taskId}`,
    kind: "apply_retry",
    producer: "apply",
    evaluator: "task-completion",
    attemptCount,
    verdict,
    errorClass,
    nextAction:
      task.error_recovery?.next_strategy ??
      (verdict === "pass" ? "none" : "retry"),
    stopReason,
    sourceRefs,
    recordedAt: latestTimestamp([
      ...taskAttempts.map((a) => a.attempted_at),
      ...errAttempts.map((a) => a.attempted_at),
      ...testRuns.map((r) => r?.recordedAt),
    ]),
    taskId,
  };
}

function reviewerVerdict(raw: string | undefined): LoopVerdict {
  switch (raw) {
    case "READY":
      return "pass";
    case "NEEDS_WORK":
      return "fail";
    case "BLOCKED":
    case "CONFLICT":
      return "blocked";
    default:
      return "inconclusive";
  }
}

function reviewerNextAction(verdict: LoopVerdict): string {
  switch (verdict) {
    case "pass":
      return "proceed";
    case "fail":
      return "remediate findings";
    case "blocked":
      return "resolve blockers";
    default:
      return "review";
  }
}

function triageVerdict(
  status: string | undefined,
  errorClass: string | undefined,
): LoopVerdict {
  // UNKNOWN / routing-only and explicitly inconclusive results are never
  // authoritative task failures (AC2/D2/DDC4).
  if (errorClass === "UNKNOWN" || status === "inconclusive") {
    return "inconclusive";
  }
  if (status === "pass") return "pass";
  return "fail";
}

function buildReportEntry(
  report: ReportLike,
  fallbackChangeId: string,
): LoopLedgerEntry | undefined {
  const key = reportKey(report, fallbackChangeId);
  if (!key) return undefined;

  const agent = report.agent as string;
  const attempt = report.attempt as number;
  const baseRef: LoopSourceRef = {
    kind: "report",
    reportKey: key,
    agent,
    attempt,
  };

  if (agent === "adv-reviewer") {
    const kind: LoopKind =
      report.phase === "harden" ? "harden_remediation" : "review_remediation";
    const verdict = reviewerVerdict(report.verdict);
    return {
      id: `${kind}|${key}`,
      kind,
      producer: agent,
      evaluator: "adv-reviewer",
      attemptCount: attempt,
      verdict,
      nextAction: reviewerNextAction(verdict),
      stopReason:
        verdict === "pass"
          ? "review READY"
          : verdict === "blocked"
            ? (report.verdict ?? "blocked")
            : undefined,
      sourceRefs: [baseRef],
      taskId: reportTaskId(report),
    };
  }

  if (agent === "adv-scanner-bundle") {
    const kind: LoopKind =
      report.phase === "harden" ? "harden_remediation" : "review_remediation";
    const hasBlocker = (report.findings ?? []).some(
      (finding) =>
        typeof finding === "object" &&
        finding !== null &&
        "severity" in finding &&
        finding.severity === "blocker",
    );
    const verdict: LoopVerdict = hasBlocker ? "fail" : "pass";
    return {
      id: `${kind}|${key}`,
      kind,
      producer: agent,
      evaluator: "adv-scanner-bundle",
      attemptCount: attempt,
      verdict,
      nextAction: report.summary ?? "address scanner findings",
      stopReason: verdict === "pass" ? "scan clean" : undefined,
      sourceRefs: [baseRef],
    };
  }

  if (agent === "adv-verification-triage-bundle") {
    const kind: LoopKind =
      report.phase === "ci_check" ? "ci_repair" : "verification_triage";
    const verdict = triageVerdict(report.status, report.error_class);
    const sourceRefs: LoopSourceRef[] = [baseRef];
    if (kind === "ci_repair") {
      for (const target of report.targets ?? []) {
        if (
          target &&
          target.kind === "ci_check" &&
          typeof target.repo === "string" &&
          typeof target.check_name === "string" &&
          typeof target.head_sha === "string"
        ) {
          sourceRefs.push({
            kind: "ci_check",
            repo: target.repo,
            checkName: target.check_name,
            headSha: target.head_sha,
            runUrl:
              typeof target.run_url === "string" ? target.run_url : undefined,
          });
        }
      }
    }
    return {
      id: `${kind}|${key}`,
      kind,
      producer: agent,
      evaluator: "adv-verification-triage-bundle",
      attemptCount: attempt,
      verdict,
      errorClass: report.error_class,
      nextAction: report.recommended_next_action ?? "triage",
      stopReason:
        verdict === "pass"
          ? "triage passed"
          : verdict === "inconclusive"
            ? "inconclusive/routing-only"
            : undefined,
      sourceRefs,
    };
  }

  // adv-engineer / adv-designer / adv-researcher / adv-tron / adv-visual-review
  // are not distinct loop sources in v1: engineer task work is covered by the
  // apply_retry adapter (authoritative attempts + test evidence); the others
  // are not remediation loops. Skip rather than fabricate (D4).
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function clampLimit(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_DETAIL_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_DETAIL_LIMIT);
}

/**
 * Project a compact loop-ledger readback (and optionally bounded details) from
 * already-loaded change/workflow-state-like records. Pure: no storage, tool,
 * external runtime or node access; never throws on legacy/missing fields.
 */
export function projectLoopLedger(
  state: LoopLedgerSourceState,
  options: ProjectLoopLedgerOptions = {},
): LoopLedgerReadback {
  const changeId =
    typeof state.changeId === "string" && state.changeId
      ? state.changeId
      : "unknown";

  const entries: LoopLedgerEntry[] = [];
  const seenReportKeys = new Set<string>();
  let testRunRefs = 0;
  let ciCheckRefs = 0;

  // apply_retry: one derived entry per task with recorded attempts.
  for (const task of state.tasks ?? []) {
    const taskId = typeof task?.id === "string" ? task.id : undefined;
    const runs = taskId ? (state.testRuns?.[taskId] ?? []) : [];
    const entry = buildApplyEntry(task, changeId, runs as TestRunLike[]);
    if (!entry) continue;
    entries.push(entry);
    testRunRefs += entry.sourceRefs.filter((r) => r.kind === "test_run").length;

    // Task-scoped reports are also loop evidence (legacy duplication with the
    // change sidecar is collapsed via report-key dedupe below).
    for (const report of task.subagent_reports ?? []) {
      const key = reportKey(report, changeId);
      if (!key || seenReportKeys.has(key)) continue;
      const reportEntry = buildReportEntry(report, changeId);
      if (!reportEntry) continue;
      seenReportKeys.add(key);
      entries.push(reportEntry);
      ciCheckRefs += reportEntry.sourceRefs.filter(
        (r) => r.kind === "ci_check",
      ).length;
    }
  }

  // Change-scoped report sidecar.
  for (const report of state.subagent_reports ?? []) {
    const key = reportKey(report, changeId);
    if (!key || seenReportKeys.has(key)) continue;
    const reportEntry = buildReportEntry(report, changeId);
    if (!reportEntry) continue;
    seenReportKeys.add(key);
    entries.push(reportEntry);
    ciCheckRefs += reportEntry.sourceRefs.filter(
      (r) => r.kind === "ci_check",
    ).length;
  }

  const summary = summarize(entries, { testRunRefs, ciCheckRefs });

  const readback: LoopLedgerReadback = {
    version: LOOP_LEDGER_SCHEMA_VERSION,
    summary,
  };

  if (options.details) {
    const limit = clampLimit(options.limit);
    const ordered = [...entries].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    readback.details = ordered.slice(0, limit);
    readback.detailsTruncated = ordered.length > limit;
    readback.detailsLimit = limit;
  }

  return readback;
}

function summarize(
  entries: LoopLedgerEntry[],
  refCounts: { testRunRefs: number; ciCheckRefs: number },
): LoopLedgerSummary {
  const byKind: Partial<Record<LoopKind, number>> = {};
  const byVerdict: Partial<Record<LoopVerdict, number>> = {};
  let retryFailureCount = 0;
  let inconclusiveCount = 0;
  let applyCount = 0;
  let reportCount = 0;

  for (const entry of entries) {
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
    byVerdict[entry.verdict] = (byVerdict[entry.verdict] ?? 0) + 1;
    if (entry.verdict === "fail") retryFailureCount += 1;
    if (entry.verdict === "inconclusive") inconclusiveCount += 1;
    if (entry.kind === "apply_retry") applyCount += 1;
    else reportCount += 1;
  }

  const withTs = entries.filter((e) => typeof e.recordedAt === "string");
  let latest: LoopLedgerEntry | undefined;
  if (withTs.length > 0) {
    latest = withTs.sort((a, b) => {
      const ta = a.recordedAt as string;
      const tb = b.recordedAt as string;
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })[withTs.length - 1];
  } else if (entries.length > 0) {
    latest = [...entries].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )[entries.length - 1];
  }

  return {
    totalEntries: entries.length,
    byKind,
    byVerdict,
    latestStatus: latest
      ? {
          id: latest.id,
          kind: latest.kind,
          verdict: latest.verdict,
          recordedAt: latest.recordedAt,
          taskId: latest.taskId,
        }
      : undefined,
    sourceTotals: {
      tasks: applyCount,
      reports: reportCount,
      testRuns: refCounts.testRunRefs,
      ciChecks: refCounts.ciCheckRefs,
    },
    retryFailureCount,
    inconclusiveCount,
  };
}
