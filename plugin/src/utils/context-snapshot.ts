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

export interface GateInfo {
  status: string;
  completed_at?: string;
  completed_by?: string;
}

export interface ContextSnapshotInput {
  changeId: string;
  title: string;
  successCriteriaCount?: number;
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
  /** Autopilot mode indicator — set when approval_mode === "autopilot" */
  approval_mode?: string;
  /** ISO8601 timestamp when autopilot was invoked */
  autopilot_invoked_at?: string;
}

type SnapshotTaskLike = {
  id: string;
  title: string;
  status: string;
};

type SnapshotWisdomLike = {
  type: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum box width for context snapshot display boxes.
 *  Accommodates typical change IDs (e.g. "tk-abc1234567") and gate status
 *  markers like [✓ planning] [○ execution] without line wrapping in
 *  80-column terminals. Shared by formatContextSnapshot and
 *  formatCrossRepoSwitch. */
const MIN_BOX_WIDTH = 55;

type SnapshotChangeLike = {
  id: string;
  title: string;
  tasks: SnapshotTaskLike[];
  wisdom?: SnapshotWisdomLike[];
  approval_mode?: string;
  autopilot_invoked_at?: string;
};

export function countSuccessCriteria(
  proposalText?: string,
): number | undefined {
  if (proposalText === undefined) return undefined;

  const criteriaMatch =
    proposalText.match(
      /##\s*success\s+criteria\s*\n([\s\S]*?)(?=\n##\s|\n---)/i,
    ) ?? proposalText.match(/##\s*success\s+criteria\s*\n([\s\S]*)/i);

  if (!criteriaMatch) return 0;

  return criteriaMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ")).length;
}

export function summarizeTasks(tasks: SnapshotTaskLike[]): {
  taskCounts: ContextSnapshotInput["taskCounts"];
  currentTask?: { id: string; title: string };
} {
  const taskCounts = {
    done: tasks.filter((t) => t.status === "done").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    cancelled: tasks.filter((t) => t.status === "cancelled").length,
  };
  const inProgressTask = tasks.find((t) => t.status === "in_progress");

  return {
    taskCounts,
    currentTask: inProgressTask
      ? { id: inProgressTask.id, title: inProgressTask.title }
      : undefined,
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
}: {
  change: SnapshotChangeLike;
  proposalText?: string;
  gates?: Record<string, GateInfo>;
  workdir?: string;
}): string {
  const { taskCounts, currentTask } = summarizeTasks(change.tasks);
  const { wisdomCount, wisdomByType } = summarizeWisdom(change.wisdom);

  return formatContextSnapshot({
    changeId: change.id,
    title: change.title,
    successCriteriaCount: countSuccessCriteria(proposalText),
    gates,
    taskCounts,
    workdir,
    currentTask,
    wisdomCount,
    wisdomByType,
    approval_mode: change.approval_mode,
    autopilot_invoked_at: change.autopilot_invoked_at,
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
export function formatContextSnapshot(input: ContextSnapshotInput): string {
  const {
    changeId,
    title,
    successCriteriaCount,
    taskCounts,
    workdir,
    currentTask,
    wisdomCount,
    wisdomByType,
  } = input;

  const gateProgress = formatGateProgress(input.gates);

  // Build task summary
  const taskParts: string[] = [];
  if (taskCounts.done > 0) taskParts.push(`${taskCounts.done} done`);
  if (taskCounts.in_progress > 0)
    taskParts.push(`${taskCounts.in_progress} active`);
  if (taskCounts.pending > 0) taskParts.push(`${taskCounts.pending} pending`);
  if (taskCounts.cancelled > 0)
    taskParts.push(`${taskCounts.cancelled} cancelled`);
  if (taskParts.length === 0) taskParts.push("0 done | 0 active | 0 pending");
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

  // Build content lines — budget management to stay within 10 lines
  const lines: string[] = [
    `CONTEXT: ${changeId}`,
    title,
  ];

  // Autopilot mode indicator
  if (input.approval_mode === "autopilot" && input.autopilot_invoked_at) {
    lines.push(`Mode: autopilot (since ${input.autopilot_invoked_at})`);
  }

  lines.push(
    "",
    `Gates: ${gateProgress}`,
    `Success: ${successCriteriaCount ?? "?"} criteria`,
    taskLine,
  );

  // Budget: we have 3 remaining line slots (10 total - 2 box borders - 5 fixed lines above)
  // Priority: wisdom line > success criteria (already included) > current task
  // When both currentTask AND wisdom are present, we still fit (9 content lines = 11 total with borders)
  // which is close enough — but let's drop the Success line if we need to save space
  const hasCurrentTask = !!currentTask;
  const needBudgetTrim = hasCurrentTask && hasWisdom;
  if (needBudgetTrim) {
    // Remove Success line to make room for both Current and Wisdom
    lines.splice(4, 1); // Remove "Success: ..." line
  }

  if (hasWisdom && wisdomLine) {
    lines.push(wisdomLine);
  }

  if (currentTask) {
    const taskDesc =
      currentTask.title.length > 40
        ? currentTask.title.slice(0, 37) + "..."
        : currentTask.title;
    lines.push(`Current: ${currentTask.id} (${taskDesc})`);
  }

  lines.push(`Workdir: ${workdir ?? "(unavailable)"}`);

  // Calculate box width
  const maxContent = Math.max(...lines.map((l) => l.length));
  const innerWidth = Math.max(MIN_BOX_WIDTH, maxContent + 3);

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
 * Render a cross-repo switch indicator.
 *
 * Format:
 * ```
 * ╔═══════════════════════════════════════════════════════════╗
 * ║ 🔀 SWITCHING REPOSITORY CONTEXT                          ║
 * ║ From: /home/user/dev/frontend                            ║
 * ║ To:   /home/user/dev/backend                             ║
 * ║ Task: tk-backend01 (Add /api/oauth/callback endpoint)    ║
 * ╚═══════════════════════════════════════════════════════════╝
 * ```
 */
export function formatCrossRepoSwitch(input: CrossRepoSwitchInput): string {
  const { fromPath, toPath, taskId, taskTitle } = input;

  const taskDesc =
    taskTitle.length > 45 ? taskTitle.slice(0, 42) + "..." : taskTitle;

  const lines = [
    "🔀 SWITCHING REPOSITORY CONTEXT",
    `From: ${fromPath}`,
    `To:   ${toPath}`,
    `Task: ${taskId} (${taskDesc})`,
  ];

  const maxContent = Math.max(...lines.map((l) => l.length));
  const innerWidth = Math.max(MIN_BOX_WIDTH, maxContent + 3);

  const top = `╔${"═".repeat(innerWidth)}╗`;
  const bottom = `╚${"═".repeat(innerWidth)}╝`;

  const boxLines = [top, ...lines.map((l) => boxLine(l, innerWidth)), bottom];

  return boxLines.join("\n");
}
