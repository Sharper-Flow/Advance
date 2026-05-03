/**
 * Compaction Context Builder
 *
 * Pure helper that produces the single text block ADV pushes into
 * `output.context` during `experimental.session.compacting`. Replaces
 * the previous hand-rolled blocks (ACTIVE ADV CHANGE / ADV SPECS CONTEXT
 * / ADV TASK CONTEXT) with a uniform composition over:
 *
 *   1. `buildChangeContextSnapshot(...)` for change/gate/task summary
 *      (AC2 — fidelity parity with steady-state live context).
 *   2. A specs summary block (existing logic, retained).
 *   3. A resume-hint block derived from the in-progress task's
 *      durable run ledger (`store.tasks.getRun(taskId)`).
 *
 * Stale-ledger detection (AC7): when the ledger references a task whose
 * current status is `cancelled` or `done`, the resume hint is replaced
 * with an explicit warning so the agent does not silently resume a
 * superseded task.
 *
 * Pure module: no IO, no store calls. Caller assembles inputs by
 * consulting the store and passes them in.
 */

import {
  buildChangeContextSnapshot,
  type GateInfo,
} from "./context-snapshot";

// ─── Local types (subset of TaskRunState / Task) ────────────────────────────

export interface CompactionTaskRunLike {
  taskId: string;
  phase: string;
  requiredNextAction: string;
  resumeHint: string;
}

export interface CompactionTaskLike {
  id: string;
  title: string;
  status: string;
  touched_files?: string[];
  error_recovery?: { retry_count?: number };
}

export interface CompactionChangeLike {
  id: string;
  title: string;
  approval_mode?: string;
  autopilot_invoked_at?: string;
}

export interface CompactionSpecLike {
  name: string;
  title: string;
}

export interface BuildCompactionContextInput {
  change: CompactionChangeLike;
  tasks: CompactionTaskLike[];
  gates?: Record<string, GateInfo>;
  workdir?: string;
  inProgressTaskRun: CompactionTaskRunLike | null;
  specs: CompactionSpecLike[];
  /** Optional byte budget; output is truncated past this limit. */
  maxBytes?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default max byte budget for the combined compaction block. Sized to
 *  fit comfortably under common provider context-window limits while
 *  preserving the snapshot, resume hint, and a specs summary. */
export const DEFAULT_COMPACTION_MAX_BYTES = 16_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Format the specs summary block. Returns null when no specs exist. */
function formatSpecsSummary(specs: CompactionSpecLike[]): string | null {
  if (specs.length === 0) return null;
  const lines = [
    "=== ADV SPECS CONTEXT ===",
    `Project has ${specs.length} spec(s):`,
    ...specs.slice(0, 5).map((s) => `- ${s.name}: ${s.title}`),
    specs.length > 5 ? `... and ${specs.length - 5} more` : "",
    "=========================",
  ].filter(Boolean);
  return lines.join("\n");
}

/** Format the resume-hint block from the in-progress task's run ledger.
 *  Implements AC7 stale-ledger detection: when the referenced task is
 *  cancelled or done, the hint is replaced with an explicit warning. */
export function formatResumeHint(
  taskRun: CompactionTaskRunLike | null,
  tasks: CompactionTaskLike[],
): string | null {
  if (!taskRun) return null;

  const referencedTask = tasks.find((t) => t.id === taskRun.taskId);
  if (
    referencedTask &&
    (referencedTask.status === "cancelled" ||
      referencedTask.status === "done")
  ) {
    return [
      "=== ADV RESUME HINT ===",
      `⚠ Last ledger reference (task ${taskRun.taskId}) was ${referencedTask.status} before resume.`,
      `Re-evaluate from current ready queue via adv_change_show include:{readyTasks:true}.`,
      "========================",
    ].join("\n");
  }

  return [
    "=== ADV RESUME HINT ===",
    `Task: ${taskRun.taskId}`,
    `Phase: ${taskRun.phase}`,
    `Next action: ${taskRun.requiredNextAction}`,
    `Hint: ${taskRun.resumeHint}`,
    "========================",
  ].join("\n");
}

/** Truncate `text` to `maxBytes` UTF-8 length, appending an explicit
 *  marker so the agent knows context was elided. */
function applyByteBudget(text: string, maxBytes: number): string {
  if (text.length <= maxBytes) return text;
  const marker = "\n\n[... ADV compaction truncated for size budget ...]";
  return text.slice(0, Math.max(0, maxBytes - marker.length)) + marker;
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Compose the full ADV compaction block.
 *
 * Order:
 *   1. Change context snapshot (gate row, task counts, current task)
 *   2. Specs summary (when specs exist)
 *   3. Resume hint (when an in-progress task ledger exists, with
 *      stale-ledger detection per AC7)
 *
 * Sections are joined with `\n\n`. The final string is truncated to
 * `maxBytes` (default 16_000).
 */
export function buildCompactionContext(
  input: BuildCompactionContextInput,
): string {
  const sections: string[] = [];

  // 1. Change snapshot — single source of truth for live + compacted view.
  const snapshot = buildChangeContextSnapshot({
    change: {
      id: input.change.id,
      title: input.change.title,
      tasks: input.tasks,
      approval_mode: input.change.approval_mode,
      autopilot_invoked_at: input.change.autopilot_invoked_at,
    },
    gates: input.gates,
    workdir: input.workdir,
  });
  sections.push(snapshot);

  // 2. Specs summary — retained from previous compaction logic.
  const specs = formatSpecsSummary(input.specs);
  if (specs) sections.push(specs);

  // 3. Resume hint — replaces ad-hoc ADV TASK CONTEXT block. Includes
  //    AC7 stale-ledger detection.
  const resumeHint = formatResumeHint(input.inProgressTaskRun, input.tasks);
  if (resumeHint) sections.push(resumeHint);

  const combined = sections.join("\n\n");
  return applyByteBudget(combined, input.maxBytes ?? DEFAULT_COMPACTION_MAX_BYTES);
}
