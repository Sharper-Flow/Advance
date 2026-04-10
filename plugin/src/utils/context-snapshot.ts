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
}

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

/**
 * Gate display labels — derived from GATE_DEFS.
 * Use short labels where the full ID is too long for the snapshot line.
 */
const GATE_SHORT_LABELS: Record<string, string> = {
  // Short labels for gates whose full ID is too long for the snapshot line
  // Currently all 7-gate IDs are short enough to use directly
};

/** Get display label for a gate ID (short label if available, otherwise the ID itself) */
const getGateLabel = (gateId: string): string =>
  GATE_SHORT_LABELS[gateId] ?? gateId;

function formatGateProgress(gates?: Record<string, GateInfo>): string {
  if (!gates) {
    return GATE_ORDER.map((g) => `[○ ${getGateLabel(g)}]`).join(" ");
  }

  return GATE_ORDER.map((gateId) => {
    const gate = gates[gateId];
    const label = getGateLabel(gateId);
    if (!gate) return `[○ ${label}]`;

    const status = gate.status;
    if (status === "done") return `[✓ ${label}]`;
    if (status === "skipped") return `[⏭ ${label}]`;
    return `[○ ${label}]`;
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
    "",
    `Gates: ${gateProgress}`,
    `Success: ${successCriteriaCount ?? "?"} criteria`,
    taskLine,
  ];

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
  const innerWidth = Math.max(55, maxContent + 3);

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
  const innerWidth = Math.max(55, maxContent + 3);

  const top = `╔${"═".repeat(innerWidth)}╗`;
  const bottom = `╚${"═".repeat(innerWidth)}╝`;

  const boxLines = [top, ...lines.map((l) => boxLine(l, innerWidth)), bottom];

  return boxLines.join("\n");
}
