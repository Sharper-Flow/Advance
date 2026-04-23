/**
 * Tool Output Formatters
 *
 * Pure functions that convert structured ADV tool data into pre-formatted
 * display strings. Agent passes these through verbatim instead of
 * reconstructing formatted output from raw data.
 *
 * Design principles:
 * - Pure functions: no side effects, no store access, no async
 * - Deterministic: identical input → identical output
 * - Compact: bullet lists, not prose. ≤15 lines total per formatter
 * - Graceful degradation: missing data → placeholder, not errors
 */

// =============================================================================
// Shared Types
// =============================================================================

export interface FormattedTaskReady {
  readyList: string;
  blockedList: string;
  nextSuggested?: { id: string; title: string };
  todoFormat?: string;
}

export interface FormattedStatus {
  specsSection: string;
  activeSection: string;
  archivedSection: string;
  recommendationsList: string[];
  healthSection: string;
}

export interface FormattedValidation {
  summary: string;
  errorTable: string;
  checklist: string;
  nextAction: string;
}

export interface FormattedDoomLoop {
  inDoomLoop: boolean;
  attemptSummary: string;
  banner: string;
  suggestedAction: string;
}

export interface FormattedSmellReport {
  smellReport: string;
  gapChecklist: string;
  nextAction: string;
}

// Input types for formatters

export interface TaskReadyInput {
  ready: Array<{ id: string; content: string; status: string }>;
  blocked: Array<{
    task: { id: string; content: string; status: string };
    blockedBy: string[];
  }>;
}

export interface StatusInput {
  specCount: number;
  requirementCount: number;
  activeChanges: Array<{
    id: string;
    title: string;
    minutesSinceActivity: number;
    recency: string;
  }>;
  archivedCount: number;
  recommendations: string[];
  temporalAlive: boolean;
}

export interface ValidationInput {
  passed: boolean;
  errors: Array<{ code: string; message: string; path: string }>;
  warnings: Array<{ code: string; message: string; path: string }>;
}

export type DoomLoopInput = {
  retry_count: number;
  max_retries: number;
  last_error: string;
  error_class: string;
  attempts?: Array<{
    attempt_number: number;
    error: string;
    strategy_label?: string;
    outcome: string;
    attempted_at: string;
    diagnosis: string;
    fix_tried: string;
  }>;
} | null;

export interface SmellInput {
  type: string;
  text: string;
  suggestion: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Truncate a string to maxLen characters, appending "..." if truncated.
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

// =============================================================================
// Validation error code → fix suggestion lookup
// =============================================================================

const VALIDATION_FIX_SUGGESTIONS: Record<string, string> = {
  DUPLICATE_REQUIREMENT_ID: "Use unique ID format: rq-{nanoid}",
  SPEC_NOT_FOUND: "Check spec file exists in .adv/specs/",
  MISSING_SCENARIO: "Add Given/When/Then scenario",
  TASK_TDD_INVERSION: "Merge test task into implementation task",
  NO_TASKS: "Run /adv-prep to generate task graph",
  NO_DELTAS: "Add spec deltas or document why none needed",
  PROPOSAL_TASK_DRIFT: "Add tasks for proposal sections or verify coverage",
  CROSS_REPO_MISSING_METADATA: "Set target_repo and target_path on cross-repo task",
  CLARIFY_MISSING_SUCCESS_CRITERIA: "Define measurable success criteria",
};

function getFixSuggestion(code: string): string {
  return VALIDATION_FIX_SUGGESTIONS[code] ?? "Review and fix";
}

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format task readiness output for display.
 */
export function formatTaskReadyOutput(input: TaskReadyInput): FormattedTaskReady {
  const readyList =
    input.ready.length > 0
      ? input.ready.map((t) => `- ${t.id}: ${truncate(t.content, 60)}`).join("\n")
      : "(no tasks ready)";

  const blockedList =
    input.blocked.length > 0
      ? input.blocked
          .map(
            (b) =>
              `- ${b.task.id}: ${truncate(b.task.content, 50)} (blocked by: ${b.blockedBy.join(", ")})`,
          )
          .join("\n")
      : "(no blocked tasks)";

  const next = input.ready[0];
  return {
    readyList,
    blockedList,
    nextSuggested: next
      ? { id: next.id, title: truncate(next.content, 60) }
      : undefined,
    todoFormat: next ? `${next.id} › ${truncate(next.content, 50)}` : undefined,
  };
}

/**
 * Format status output for display.
 */
export function formatStatusOutput(input: StatusInput): FormattedStatus {
  const specsSection = `## Specs\n${input.specCount} capabilities, ${input.requirementCount} requirements`;

  const recencyEmoji = (recency: string): string => {
    switch (recency) {
      case "hot":
        return "🔥";
      case "warm":
        return "⚠️";
      case "stale":
        return "⏰";
      default:
        return "•";
    }
  };

  const activeLines = input.activeChanges.map((c) => {
    const emoji = recencyEmoji(c.recency);
    const mins = c.minutesSinceActivity;
    const timeLabel =
      mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
    return `${emoji} ${c.id} (${timeLabel})`;
  });

  const activeSection =
    activeLines.length > 0
      ? `## Active Changes\n${activeLines.join("\n")}`
      : "## Active Changes\n(none)";

  const archivedSection = `## Archived\n${input.archivedCount} total`;
  const healthSection = `Temporal: ${input.temporalAlive ? "server alive ✓" : "server down ✗"}`;

  return {
    specsSection,
    activeSection,
    archivedSection,
    recommendationsList: input.recommendations,
    healthSection,
  };
}

/**
 * Format validation output for display.
 */
export function formatValidationOutput(input: ValidationInput): FormattedValidation {
  const errorCount = input.errors.length;
  const warningCount = input.warnings.length;

  const summary = input.passed
    ? `Passed: ✓ | Errors: ${errorCount} | Warnings: ${warningCount}`
    : `Passed: ✗ | Errors: ${errorCount} | Warnings: ${warningCount}`;

  let errorTable = "| Code | Path | Fix |\n|------|------|-----|";
  if (errorCount > 0) {
    const rows = input.errors.map(
      (e) => `| ${e.code} | ${truncate(e.path, 30)} | ${getFixSuggestion(e.code)} |`,
    );
    errorTable += "\n" + rows.join("\n");
  }

  const checklistItems: string[] = [];
  if (errorCount > 0) checklistItems.push(`- [ ] Fix ${errorCount} error(s)`);
  if (warningCount > 0) checklistItems.push(`- [ ] Review ${warningCount} warning(s)`);
  const checklist =
    checklistItems.length > 0
      ? `## Validation Checklist\n${checklistItems.join("\n")}`
      : "## Validation Checklist\n(all clear)";

  const nextAction = input.passed
    ? "All clear — proceed to next step"
    : `Fix ${errorCount} error(s) before proceeding`;

  return { summary, errorTable, checklist, nextAction };
}

/**
 * Format doom-loop diagnostics from error_recovery data.
 */
export function formatDoomLoopDiagnostics(input: DoomLoopInput): FormattedDoomLoop {
  if (!input) {
    return {
      inDoomLoop: false,
      attemptSummary: "",
      banner: "",
      suggestedAction: "",
    };
  }

  const inDoomLoop = input.retry_count >= input.max_retries;

  const attemptSummary =
    input.attempts && input.attempts.length > 0
      ? `${input.attempts.length} attempts: ${input.attempts.map((a) => a.strategy_label || a.error).join(" → ")}`
      : `${input.retry_count}/${input.max_retries} retries used`;

  const banner = inDoomLoop
    ? `[ADV:BLOCKED] Doom loop detected (${input.retry_count}/${input.max_retries} retries exhausted)`
    : "";

  const suggestedAction = inDoomLoop
    ? "Escalate to user — retry budget exhausted"
    : input.retry_count > 0
      ? `Retry ${input.retry_count}/${input.max_retries} — ${input.max_retries - input.retry_count} remaining`
      : "";

  return { inDoomLoop, attemptSummary, banner, suggestedAction };
}

/**
 * Format requirement smell report.
 */
export function formatSmellReport(smells: SmellInput[]): FormattedSmellReport {
  if (smells.length === 0) {
    return {
      smellReport: "No requirement smells detected",
      gapChecklist: `## Gap Checklist\n- 0 smells to fix`,
      nextAction: "No smells — proceed",
    };
  }

  const lines = smells.map(
    (s) => `- '${s.text}' is ${s.type} → ${s.suggestion}`,
  );
  const smellReport = `## Requirement Smells\n${lines.join("\n")}`;
  const gapChecklist = `## Gap Checklist\n- [ ] Fix ${smells.length} smell(s)`;

  const nextAction = `Fix ${smells.length} requirement smell(s) before /adv-prep`;

  return { smellReport, gapChecklist, nextAction };
}
