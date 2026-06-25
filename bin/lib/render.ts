/**
 * adv CLI — terminal rendering helpers
 *
 * Zero dependencies; compatible with Bun runtime.
 */

import type { ChangeSummary } from "./types";

// =============================================================================
// Color Constants
// =============================================================================

export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";
export const RED = "\x1b[31m";
export const YELLOW = "\x1b[33m";
export const RESET = "\x1b[0m";

// =============================================================================
// Color Detection
// =============================================================================

export function shouldUseColor(noColorFlag: boolean): boolean {
  if (process.env.NO_COLOR) return false;
  if (noColorFlag) return false;
  if (!process.stdout.isTTY) return false;
  const bun = (globalThis as any).Bun;
  if (bun && typeof bun.enableANSIColors === "boolean") {
    return bun.enableANSIColors;
  }
  return true;
}

// =============================================================================
// Time Formatting
// =============================================================================

export function relativeTime(iso: string, now: Date): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function emojiFor(recency: "hot" | "warm" | "stale"): string {
  switch (recency) {
    case "hot":
      return "🔥";
    case "warm":
      return "⏳";
    case "stale":
      return "⏰";
  }
}

// =============================================================================
// Table Formatting
// =============================================================================

export function formatTable(
  summaries: ChangeSummary[],
  useColor: boolean,
  now: Date,
): string {
  if (summaries.length === 0) return "(no active changes)";

  const W = {
    id: Math.max(
      20,
      ...summaries.map((s) => {
        const base = s.parentChangeId ? `↳ ${s.id}` : s.id;
        return s.epicId ? `${base} [${s.epicId}]` : base;
      }).map((label) => label.length),
    ),
    title: Math.max(
      25,
      ...summaries.map((s) => Math.min(s.title.length, 40)),
    ),
    gate: 13,
    tasks: 5,
  };

  const colHeader = [
    "".padEnd(2),
    "ID".padEnd(W.id),
    "TITLE".padEnd(W.title),
    "TASKS".padStart(W.tasks),
    "GATES".padEnd(W.gate),
    "LAST ACTIVITY",
  ].join("  ");

  const lines: string[] = [];

  if (useColor) {
    lines.push(`${DIM}${colHeader}${RESET}`);
  } else {
    lines.push(colHeader);
  }

  for (const s of summaries) {
    const idLabel = s.parentChangeId
      ? `↳ ${s.id}${s.epicId ? ` [${s.epicId}]` : ""}`
      : `${s.id}${s.epicId ? ` [${s.epicId}]` : ""}`;
    const titleStr =
      s.title.length > W.title
        ? s.title.slice(0, W.title - 1) + "…"
        : s.title;
    const taskStr = `${s.tasksDone}/${s.tasksTotal}`;
    const timeStr = relativeTime(s.lastActivityAt, now);

    const parts = [
      emojiFor(s.recency),
      idLabel.padEnd(W.id),
      titleStr.padEnd(W.title),
      taskStr.padStart(W.tasks),
      s.gateProgressStr,
      timeStr,
    ];

    const row = parts.join("  ");
    if (useColor) {
      const color =
        s.recency === "hot" ? RED : s.recency === "warm" ? YELLOW : DIM;
      lines.push(`${color}${row}${RESET}`);
    } else {
      lines.push(row);
    }
  }

  return lines.join("\n");
}

// =============================================================================
// JSON helper
// =============================================================================

export function emitJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
