/**
 * Context Snapshot Formatter
 *
 * Renders a compact, scannable summary of the agent's internal state
 * for a change, making it visible and verifiable by the user.
 *
 * Addresses the context agreement gap: the agent holds rich structured
 * state that the user cannot see without explicit formatting.
 */

// =============================================================================
// Types
// =============================================================================

import { GATE_COMMAND } from "./phase-plan";
import { observedAttemptCount } from "../types/tasks";
import type { WorkflowDirective } from "./workflow-directive";
import type { EpicMembershipVerification } from "../types/epics";

export interface GateInfo {
  status: string;
  completed_at?: string;
  completed_by?: string;
}

export interface ContextSnapshotInput {
  changeId: string;
  title: string;
  userOutcomeCount?: number;
  gates?: Record<string, GateInfo>;
  taskCounts: {
    done: number;
    in_progress: number;
    pending: number;
    cancelled: number;
  };
  workdir?: string;
  currentTask?: { id: string; title: string };
  /** Total wisdom entries for this change */
  wisdomCount?: number;
  /** Breakdown by type (e.g. { pattern: 2, gotcha: 1 }) */
  wisdomByType?: Record<string, number>;
  /** Union count of all touched_files across tasks */
  touchedFilesCount?: number;
  /** Doom-loop budget proximity indicator (e.g. "⚠ 2/3 budget") */
  errorBudgetProximity?: string;
  /**
   * Authoritative execution directive (derive-on-read). When provided, the
   * snapshot renders a compact `Next:` orientation line so agents see the
   * same next-action the gate/status surfaces consume.
   */
  directive?: WorkflowDirective;
  /** Compact Epic membership context for child changes (no full Epic hydration) */
  epicMembership?: {
    epic_id: string;
    entry_id: string;
    order: number;
    title: string;
    linked_at: string;
  };
  epicMembershipVerification?: EpicMembershipVerification;
  /**
   * Optional Resume Freshness advisory (added by addResumeFreshnessAdvisory).
   * When present and not skipped, renders a `Freshness:` line.
   * Local structural type — pure formatter does NOT import from storage layer.
   * Shape mirrors `ResumeFreshnessResult` from `plugin/src/storage/resume-freshness.ts`.
   */
  resumeFreshness?: ContextSnapshotResumeFreshness;
}

/**
 * Local structural type for resumeFreshness field. Defined here (not imported
 * from storage) to preserve formatter purity (AC5, C5).
 */
export interface ContextSnapshotResumeFreshness {
  findings: Array<{ code: string; label: string; summary: string }>;
  skipped: boolean;
}

type SnapshotTaskLike = {
  id: string;
  title: string;
  status: string;
  touched_files?: string[];
  error_recovery?: {
    retry_count?: number;
    /** Bounded retention window — not the attempt count. */
    attempts?: readonly { attempt_number?: number }[];
    /** True attempt count including entries elided by the retention bound. */
    total_attempts?: number;
  };
};

type SnapshotWisdomLike = {
  type: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum box width for context snapshot display boxes — keeps a stable look
 *  for short content. Boxes never grow narrower than this. */
const MIN_BOX_WIDTH = 40;

/** Maximum inner width for compact chat-output surfaces. Caps ticker and
 *  cross-repo switch output at 80 columns total (78 inner + 2 box-border
 *  characters). Full context snapshots may grow wider when the 7-gate row
 *  requires it; long change IDs are truncated separately. */
const MAX_BOX_WIDTH = 78;

/** Reserved characters for `CONTEXT: ` prefix + box rails + minimum padding.
 *  Used to compute how many chars of a change ID can fit on the CONTEXT line. */
const CONTEXT_LINE_PREFIX_RESERVED = 12;

type SnapshotChangeLike = {
  id: string;
  title: string;
  tasks: SnapshotTaskLike[];
  wisdom?: SnapshotWisdomLike[];
  epic_membership?: ContextSnapshotInput["epicMembership"];
  epic_membership_verification?: ContextSnapshotInput["epicMembershipVerification"];
};

export function countUserOutcomes(proposalText?: string): number | undefined {
  if (proposalText === undefined) return undefined;

  const outcomesMatch =
    proposalText.match(
      /##\s*user\s+outcomes\s*\n([\s\S]*?)(?=\n##\s|\n---)/i,
    ) ?? proposalText.match(/##\s*user\s+outcomes\s*\n([\s\S]*)/i);

  if (!outcomesMatch) return 0;

  return outcomesMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ")).length;
}

export function summarizeTasks(tasks: SnapshotTaskLike[]): {
  taskCounts: ContextSnapshotInput["taskCounts"];
  currentTask?: { id: string; title: string };
  touchedFilesCount?: number;
  errorBudgetProximity?: string;
} {
  const taskCounts = {
    done: tasks.filter((t) => t.status === "done").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    cancelled: tasks.filter((t) => t.status === "cancelled").length,
  };
  const inProgressTask = tasks.find((t) => t.status === "in_progress");

  // Compute touched files count (union of all task touched_files)
  const allTouched = new Set<string>();
  for (const t of tasks) {
    if (t.touched_files) {
      for (const f of t.touched_files) allTouched.add(f);
    }
  }
  const touchedFilesCount = allTouched.size > 0 ? allTouched.size : undefined;

  // Compute error budget proximity (max retry_count / 3 threshold)
  const DOOM_LOOP_THRESHOLD = 3;
  let maxRetry = 0;
  for (const t of tasks) {
    // retry_count tracks the bounded retention window, so an operator would
    // see "3/3" after a dozen attempts. Report what occurred.
    const rc = observedAttemptCount(t.error_recovery);
    if (rc > maxRetry) maxRetry = rc;
  }
  const errorBudgetProximity =
    maxRetry > 0 ? `⚠ ${maxRetry}/${DOOM_LOOP_THRESHOLD} budget` : undefined;

  return {
    taskCounts,
    currentTask: inProgressTask
      ? { id: inProgressTask.id, title: inProgressTask.title }
      : undefined,
    touchedFilesCount,
    errorBudgetProximity,
  };
}

function summarizeWisdom(wisdom?: SnapshotWisdomLike[]): {
  wisdomCount: number;
  wisdomByType?: Record<string, number>;
} {
  if (!wisdom || wisdom.length === 0) {
    return { wisdomCount: 0, wisdomByType: undefined };
  }

  return {
    wisdomCount: wisdom.length,
    wisdomByType: wisdom.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.type] = (acc[entry.type] || 0) + 1;
      return acc;
    }, {}),
  };
}

export function buildChangeContextSnapshot({
  change,
  proposalText,
  gates,
  workdir,
  directive,
  resumeFreshness,
  epicMembershipVerification,
}: {
  change: SnapshotChangeLike;
  proposalText?: string;
  gates?: Record<string, GateInfo>;
  workdir?: string;
  directive?: WorkflowDirective;
  resumeFreshness?: ContextSnapshotResumeFreshness;
  epicMembershipVerification?: EpicMembershipVerification;
}): string {
  const { taskCounts, currentTask, touchedFilesCount, errorBudgetProximity } =
    summarizeTasks(change.tasks);
  const { wisdomCount, wisdomByType } = summarizeWisdom(change.wisdom);

  return formatContextSnapshot({
    changeId: change.id,
    title: change.title,
    userOutcomeCount: countUserOutcomes(proposalText),
    gates,
    taskCounts,
    workdir,
    currentTask,
    wisdomCount,
    wisdomByType,
    touchedFilesCount,
    errorBudgetProximity,
    directive,
    epicMembership: change.epic_membership,
    epicMembershipVerification,
    resumeFreshness,
  });
}

export interface CrossRepoSwitchInput {
  fromPath: string;
  toPath: string;
  taskId: string;
  taskTitle: string;
}

// =============================================================================
// Gate Display
// =============================================================================

import { GATE_ORDER } from "../types";

function formatGateProgress(gates?: Record<string, GateInfo>): string {
  if (!gates) {
    return GATE_ORDER.map((g) => `[○ ${g}]`).join(" ");
  }

  return GATE_ORDER.map((gateId) => {
    const gate = gates[gateId];
    if (!gate) return `[○ ${gateId}]`;

    const status = gate.status;
    if (status === "done") return `[✓ ${gateId}]`;
    if (status === "skipped") return `[⏭ ${gateId}]`;
    return `[○ ${gateId}]`;
  }).join(" ");
}

/**
 * Compact gate-progress glyph for the ticker (rq-ctxticker1).
 *
 * Forms:
 *   - "proposal ○→discovery" — none done (or no gates record)
 *   - "design ✓→planning"    — partial; last completed → first incomplete
 *   - "release ✓"            — all done
 */
export function formatGateArrow(gates?: Record<string, GateInfo>): string {
  if (!gates) return `${GATE_ORDER[0]} ○→${GATE_ORDER[1]}`;

  const isDone = (g?: GateInfo): boolean =>
    g?.status === "done" || g?.status === "skipped";

  if (GATE_ORDER.every((id) => isDone(gates[id]))) {
    return `${GATE_ORDER[GATE_ORDER.length - 1]} ✓`;
  }

  const firstIncompleteIdx = GATE_ORDER.findIndex((id) => !isDone(gates[id]));

  if (firstIncompleteIdx <= 0) {
    return `${GATE_ORDER[0]} ○→${GATE_ORDER[1]}`;
  }

  return `${GATE_ORDER[firstIncompleteIdx - 1]} ✓→${GATE_ORDER[firstIncompleteIdx]}`;
}

// =============================================================================
// Box Drawing Helpers
// =============================================================================

function boxLine(content: string, width: number): string {
  const padding = Math.max(0, width - content.length - 1);
  return `║ ${content}${" ".repeat(padding)}║`;
}

// =============================================================================
// Context Snapshot
// =============================================================================

/**
 * Render a compact context snapshot (max 10 lines).
 *
 * Format:
 * ```
 * ╔═══════════════════════════════════════════════════════════╗
 * ║ CONTEXT: improveContextAgreement                         ║
 * ║ Improve context agreement                                ║
 * ║                                                          ║
 * ║ Gates: [✓ research] [✓ prep] [○ impl] [○ review] ...    ║
 * ║ Success: 3 criteria                                      ║
 * ║ Tasks: 2 done | 1 active | 5 pending                    ║
 * ║ Current: tk-abc123 (Implement feature X)                ║
 * ║ Workdir: /home/user/dev/my-project                       ║
 * ╚═══════════════════════════════════════════════════════════╝
 * ```
 */
/**
 * Compact single-line rendering of a workflow directive for agent orientation.
 * Surfaces the same next-action the gate/status surfaces consume so the
 * context snapshot, gate status, and status recommendations agree.
 */
function formatDirectiveNextLine(directive: WorkflowDirective): string {
  const action = directive.action;
  const gate = action.gateId;
  const command = action.command;
  switch (action.kind) {
    case "archived":
      return "Next: archived";
    case "recovery":
      return `Next: recovery${gate ? ` · ${gate}` : ""}`;
    case "blocked":
      return `Next: blocked${gate ? ` · ${gate}` : ""}`;
    case "approval":
      return `Next: approval${gate ? ` · ${gate}` : ""}`;
    case "never_started":
    case "continue":
    default:
      if (gate && command === GATE_COMMAND[gate]) {
        return `Next: ${gate} → /${command}`;
      }
      if (gate) return `Next: blocked · ${gate}`;
      return `Next: blocked`;
  }
}

export function formatContextSnapshot(input: ContextSnapshotInput): string {
  const {
    changeId,
    title,
    userOutcomeCount,
    taskCounts,
    workdir,
    currentTask,
    wisdomCount,
    wisdomByType,
    touchedFilesCount,
    errorBudgetProximity,
    directive,
    epicMembership,
    epicMembershipVerification,
    resumeFreshness,
  } = input;

  const gateProgress = formatGateProgress(input.gates);

  // Build task summary (append touched files count if available)
  const taskParts: string[] = [];
  if (taskCounts.done > 0) taskParts.push(`${taskCounts.done} done`);
  if (taskCounts.in_progress > 0)
    taskParts.push(`${taskCounts.in_progress} active`);
  if (taskCounts.pending > 0) taskParts.push(`${taskCounts.pending} pending`);
  if (taskCounts.cancelled > 0)
    taskParts.push(`${taskCounts.cancelled} cancelled`);
  if (taskParts.length === 0) taskParts.push("0 done | 0 active | 0 pending");
  if (touchedFilesCount !== undefined && touchedFilesCount > 0) {
    taskParts.push(`${touchedFilesCount} files`);
  }
  const taskLine = `Tasks: ${taskParts.join(" | ")}`;

  // Build wisdom line (compact type breakdown)
  const hasWisdom = wisdomCount !== undefined && wisdomCount > 0;
  let wisdomLine: string | undefined;
  if (hasWisdom) {
    const typeParts = wisdomByType
      ? Object.entries(wisdomByType)
          .filter(([, count]) => count > 0)
          .map(([type, count]) => `${count} ${type}`)
          .join(", ")
      : "";
    wisdomLine = typeParts
      ? `Wisdom: ${wisdomCount} entries (${typeParts})`
      : `Wisdom: ${wisdomCount} entries`;
  }

  // Truncate the change ID on the CONTEXT line so a long ID never blows the
  // 80-column budget (rq-ctxformat.3). Other places retain the full ID.
  const maxIdChars = MAX_BOX_WIDTH - CONTEXT_LINE_PREFIX_RESERVED;
  const displayChangeId =
    changeId.length > maxIdChars
      ? changeId.slice(0, maxIdChars - 1) + "…"
      : changeId;

  // Build content lines — budget management to stay within 10 lines
  const lines: string[] = [`CONTEXT: ${displayChangeId}`, title];

  if (epicMembership) {
    const verification = epicMembershipVerification
      ? ` · ${epicMembershipVerification}`
      : "";
    const reconcile =
      epicMembershipVerification === "entry_missing" ? " · reconcile" : "";
    lines.push(
      `Epic: ${epicMembership.epic_id} · ${epicMembership.title}${verification}${reconcile}`,
    );
  } else {
    lines.push("");
  }

  lines.push(`Gates: ${gateProgress}`);
  if (directive) {
    lines.push(formatDirectiveNextLine(directive));
  }
  lines.push(
    errorBudgetProximity ?? `Outcomes: ${userOutcomeCount ?? "?"} items`,
    taskLine,
  );

  // Budget: hard 10-line cap (2 borders + 8 content). The directive `Next:`
  // row is a new content line that competes with the wisdom, current-task,
  // and resumeFreshness rows. Count the optional rows present (directive +
  // wisdom + current + freshness) and shed the least-critical lines in
  // stages so every combination stays ≤10:
  //   - ≥2 optional rows: drop the Outcomes/Budget line (least critical).
  //   - ≥3 optional rows: also drop the Current line — redundant with the
  //     directive's next-action orientation.
  //   - 4 optional rows (directive + wisdom + current + freshness):
  //     * No Epic line: drop the blank spacer line (compact).
  //     * Epic line present: drop the Wisdom line — freshness is more
  //       actionable for a stale resume; wisdom is durable project knowledge
  //       available elsewhere. Freshness is always retained (D6: LAST shed).
  const hasCurrentTask = !!currentTask;
  const hasDirective = !!directive;
  const hasFreshness =
    !!resumeFreshness &&
    !resumeFreshness.skipped &&
    resumeFreshness.findings.length > 0;
  const optionalCount =
    (hasDirective ? 1 : 0) +
    (hasWisdom ? 1 : 0) +
    (hasCurrentTask ? 1 : 0) +
    (hasFreshness ? 1 : 0);
  const dropOutcomes = optionalCount >= 2;
  const dropCurrent = optionalCount >= 3;
  const dropSpacerOrWisdom = optionalCount >= 4;
  if (dropOutcomes) {
    const budgetLineIndex = lines.findIndex(
      (line) => line.startsWith("Outcomes:") || line.startsWith("⚠ "),
    );
    if (budgetLineIndex >= 0) lines.splice(budgetLineIndex, 1);
  }

  // 4-optional case (D6): shed spacer or wisdom to preserve Freshness
  let wisdomDropped = false;
  if (dropSpacerOrWisdom) {
    if (!epicMembership) {
      // Drop the blank spacer line at index 2 (CONTEXT/title/spacer/Gates/...)
      // Find first empty line and remove it
      const spacerIdx = lines.findIndex((l) => l === "");
      if (spacerIdx >= 0) lines.splice(spacerIdx, 1);
    } else {
      // Epic line present — drop Wisdom instead (Freshness more actionable)
      wisdomDropped = true;
    }
  }

  if (hasWisdom && wisdomLine && !wisdomDropped) {
    lines.push(wisdomLine);
  }

  if (currentTask && !dropCurrent) {
    const taskDesc =
      currentTask.title.length > 40
        ? currentTask.title.slice(0, 37) + "..."
        : currentTask.title;
    lines.push(`Current: ${currentTask.id} (${taskDesc})`);
  }

  // Freshness line — added LAST among optionals so it's the most recently-
  // pushed content line; shedding priority ensures it's retained in the
  // 4-optional case (D6).
  if (hasFreshness) {
    const topFinding = resumeFreshness?.findings[0];
    const freshnessLine =
      resumeFreshness!.findings.length === 1
        ? `Freshness: 1 finding · ${topFinding?.code ?? "?"}`
        : `Freshness: ${resumeFreshness!.findings.length} findings · ${topFinding?.code ?? "?"}`;
    lines.push(freshnessLine);
  }

  lines.push(`Workdir: ${workdir ?? "(unavailable)"}`);

  // Calculate box width. Floor at MIN_BOX_WIDTH so the snapshot has a stable
  // visual baseline; otherwise grow naturally to fit content. The 7-gate
  // progress line drives width on real-world changes and may exceed 80 cols —
  // that is intentional (rq-ctxsnap1 mandates per-gate visibility). The
  // CONTEXT line was already truncated above so a long change ID cannot
  // single-handedly blow the budget. Cross-repo switch and tickers (which
  // have no gate-progress row) cap separately at MAX_BOX_WIDTH.
  const innerWidth = Math.max(
    MIN_BOX_WIDTH,
    Math.max(...lines.map((l) => l.length)) + 3,
  );

  // Build box
  const top = `╔${"═".repeat(innerWidth)}╗`;
  const bottom = `╚${"═".repeat(innerWidth)}╝`;

  const boxLines = [top, ...lines.map((l) => boxLine(l, innerWidth)), bottom];

  return boxLines.join("\n");
}

// =============================================================================
// Cross-Repo Switch Indicator
// =============================================================================

/**
 * Render a cross-repo switch indicator (rq-ctxswitch).
 *
 * Format (3 content lines + 2 borders = 5 total):
 * ```
 * ╔═══════════════════════════════════════════════════════════╗
 * ║ 🔀 SWITCHING REPOSITORY CONTEXT                           ║
 * ║ /home/user/dev/frontend → /home/user/dev/backend          ║
 * ║ Task: tk-backend01 (Add /api/oauth/callback endpoint)     ║
 * ╚═══════════════════════════════════════════════════════════╝
 * ```
 *
 * Long combined `from → to` strings or task titles are truncated rather than
 * allowed to grow the box past MAX_BOX_WIDTH (80 cols total).
 */
export function formatCrossRepoSwitch(input: CrossRepoSwitchInput): string {
  const { fromPath, toPath, taskId, taskTitle } = input;

  const taskDesc =
    taskTitle.length > 45 ? taskTitle.slice(0, 42) + "..." : taskTitle;

  // Compose the three content rows with from→to merged onto a single line.
  const lines = [
    "🔀 SWITCHING REPOSITORY CONTEXT",
    `${fromPath} → ${toPath}`,
    `Task: ${taskId} (${taskDesc})`,
  ];

  // Clamp width to MAX_BOX_WIDTH; truncate any line that would overflow so the
  // box stays ≤80 cols even with very long paths.
  const innerWidth = Math.min(
    Math.max(MIN_BOX_WIDTH, Math.max(...lines.map((l) => l.length)) + 3),
    MAX_BOX_WIDTH,
  );

  const truncatedLines = lines.map((line) =>
    line.length > innerWidth - 1 ? line.slice(0, innerWidth - 2) + "…" : line,
  );

  const top = `╔${"═".repeat(innerWidth)}╗`;
  const bottom = `╚${"═".repeat(innerWidth)}╝`;

  const boxLines = [
    top,
    ...truncatedLines.map((l) => boxLine(l, innerWidth)),
    bottom,
  ];

  return boxLines.join("\n");
}

// =============================================================================
// Compact Context Ticker (rq-ctxticker1, rq-ctxticker2)
// =============================================================================

/** Maximum chars allowed for the change ID inside a ticker before truncation. */
const TICKER_MAX_ID_CHARS = 20;

export interface TickerSnapshotInput {
  changeId: string;
  gates?: Record<string, GateInfo>;
  taskCounts: ContextSnapshotInput["taskCounts"];
}

/**
 * Render a compact, single-line context ticker for transient task transitions.
 *
 * Format: `║ {changeId-truncated} · {gateArrow} · {done}/{total} ║`
 *
 * Constraints (rq-ctxticker1):
 *   - Single line, ≤80 columns
 *   - Change ID truncated to ≤TICKER_MAX_ID_CHARS chars (with `…` suffix)
 *   - Deterministic (same input → same output)
 */
export function formatTickerSnapshot(input: TickerSnapshotInput): string {
  const id =
    input.changeId.length > TICKER_MAX_ID_CHARS
      ? input.changeId.slice(0, TICKER_MAX_ID_CHARS - 1) + "…"
      : input.changeId;
  const arrow = formatGateArrow(input.gates);
  const total =
    input.taskCounts.done +
    input.taskCounts.in_progress +
    input.taskCounts.pending +
    input.taskCounts.cancelled;
  const counts = `${input.taskCounts.done}/${total}`;
  return `║ ${id} · ${arrow} · ${counts} ║`;
}

/**
 * Build a compact context ticker from change-shaped input.
 *
 * Parallel to buildChangeContextSnapshot; emitted by transient task tools
 * (adv_task_update→in_progress|done, adv_task_ready, adv_task_add,
 * adv_task_cancel) per rq-ctxticker2.
 */
export function buildChangeContextTicker({
  change,
  gates,
}: {
  change: SnapshotChangeLike;
  gates?: Record<string, GateInfo>;
}): string {
  const { taskCounts } = summarizeTasks(change.tasks);
  return formatTickerSnapshot({
    changeId: change.id,
    gates,
    taskCounts,
  });
}
