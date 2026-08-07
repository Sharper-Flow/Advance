/**
 * WisdomDraft helpers — pure functions for SEMANTIC error_recovery → draft
 * creation, draft lifecycle transitions, and task-scoped queries.
 *
 * Backing for rq-wisdomAutoSurfacing01. These helpers do NOT mutate state;
 * callers (tools/task.ts, tools/checkpoint.ts, tools/wisdom.ts) own signal
 * emission. Keeping the logic pure makes the lifecycle state machine
 * testable without requiring external runtime services.
 */
import { randomUUID } from "node:crypto";
import type { ErrorRecovery, Task, WisdomDraft } from "../types";
import { observedAttemptCount } from "../types/tasks";

/**
 * Generate a stable WisdomDraft ID: dr-<8hex>.
 * DDC3: unique per task. Uses crypto-grade randomness like tk- IDs.
 */
export function generateWisdomDraftId(): string {
  return `dr-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/**
 * Returns true if a task already carries a draft in the `suggested` state.
 * Used for D4 dedup: at most one suggested draft per task at a time.
 */
export function hasSuggestedDraft(task: Task | undefined): boolean {
  return (task?.wisdom_drafts ?? []).some((d) => d.status === "suggested");
}

/**
 * D4 trigger evaluation. Returns a fresh WisdomDraft when ALL of:
 *   1. error_recovery is present
 *   2. error_recovery.error_class === "SEMANTIC"
 *   3. error_recovery.attempts[] is non-empty (the triggering attempt(s))
 *   4. task does not already have a draft in the "suggested" state (dedup)
 *
 * Returns null otherwise. Idempotent: calling twice with the same task state
 * yields at most one new draft.
 *
 * Suggested content template (D4):
 *   "{diagnosis} → {fix_tried}" joined by "; " across all attempts.
 *
 * Suggested type (D4 + DONT3): always "failure" for SEMANTIC triggers.
 * Future FATAL support may add "gotcha"; not in scope for this change.
 */
export function maybeCreateWisdomDraftFromErrorRecovery(
  currentTask: Task | undefined,
  errorRecovery: ErrorRecovery | undefined,
  now: string,
): WisdomDraft | null {
  if (!errorRecovery) return null;
  if (errorRecovery.error_class !== "SEMANTIC") return null;
  const attempts = errorRecovery.attempts ?? [];
  if (attempts.length === 0) return null;
  if (hasSuggestedDraft(currentTask)) return null;

  // attempts[] is a bounded retention window. Without saying so, a draft
  // distilled from 3 retained entries reads as the whole story when a dozen
  // attempts actually contributed — the elided diagnoses are unrecoverable
  // here, so the draft must at least disclose that they existed.
  const totalAttempts = observedAttemptCount(errorRecovery);
  const elidedCount = totalAttempts - attempts.length;
  const attemptNarrative = attempts
    .map((a) => `${a.diagnosis} → ${a.fix_tried}`)
    .join("; ");
  const suggestedContent =
    elidedCount > 0
      ? `${attemptNarrative} [${elidedCount} earlier attempt${
          elidedCount === 1 ? "" : "s"
        } elided from the retained window]`
      : attemptNarrative;

  return {
    id: generateWisdomDraftId(),
    suggested_type: "failure",
    // Cap at 2000 chars (matches WisdomEntrySchema.content limit and
    // WisdomDraftSchema.suggested_content schema) to bound persisted content
    // payload size when many SEMANTIC attempts are joined.
    suggested_content:
      suggestedContent.length > 2000
        ? `${suggestedContent.slice(0, 1997)}...`
        : suggestedContent,
    source_attempts: attempts.map((a) => a.attempt_number),
    status: "suggested",
    created_at: now,
  };
}

/**
 * Append a draft to an existing drafts array (returns a new array — pure).
 */
export function appendDraft(
  existing: WisdomDraft[] | undefined,
  newDraft: WisdomDraft,
): WisdomDraft[] {
  return [...(existing ?? []), newDraft];
}

/**
 * Transition a draft to the dismissed terminal state. Returns a new array
 * with the matching draft updated; unknown IDs leave the array unchanged.
 *
 * Used by adv_task_checkpoint auto-dismiss (dismiss_reason: "auto_checkpoint")
 * and explicit user dismiss paths (dismiss_reason: "user_dismissed").
 *
 * DDC4: idempotent — dismissing an already-dismissed draft is a no-op
 * (the dismiss_at/dismiss_reason are not overwritten).
 */
export function dismissDraft(
  drafts: WisdomDraft[] | undefined,
  draftId: string,
  reason: WisdomDraft["dismiss_reason"],
  now: string,
): WisdomDraft[] {
  return (drafts ?? []).map((d) => {
    if (d.id !== draftId) return d;
    if (d.status !== "suggested") return d; // idempotent guard
    return {
      ...d,
      status: "dismissed" as const,
      dismissed_at: now,
      dismiss_reason: reason,
    };
  });
}

/**
 * Dismiss ALL suggested drafts on a task. Used by checkpoint auto-dismiss.
 * Returns the count of drafts that transitioned (for AC5 reporting) and
 * the new drafts array.
 */
export function dismissAllSuggestedDrafts(
  drafts: WisdomDraft[] | undefined,
  reason: WisdomDraft["dismiss_reason"],
  now: string,
): {
  drafts: WisdomDraft[];
  dismissedCount: number;
  pendingReviewCount: number;
} {
  const list = drafts ?? [];
  const pendingReviewCount = list.filter(
    (d) => d.status === "suggested",
  ).length;
  if (pendingReviewCount === 0) {
    return { drafts: list, dismissedCount: 0, pendingReviewCount: 0 };
  }
  let dismissedCount = 0;
  const next = list.map((d) => {
    if (d.status !== "suggested") return d;
    dismissedCount += 1;
    return {
      ...d,
      status: "dismissed" as const,
      dismissed_at: now,
      dismiss_reason: reason,
    };
  });
  return { drafts: next, dismissedCount, pendingReviewCount };
}

/**
 * Transition a draft to the promoted terminal state, recording the new
 * wisdom ID. Used by adv_wisdom_add from_draft_id.
 *
 * Returns null only when the draft is not found; returns the array
 * unchanged when the draft is in a non-suggested terminal state (caller
 * detects via pre-validation with findDraft and surfaces the appropriate
 * DRAFT_ALREADY_PROMOTED / DRAFT_DISMISSED error).
 */
export function promoteDraft(
  drafts: WisdomDraft[] | undefined,
  draftId: string,
  promotedWisdomId: string,
): WisdomDraft[] | null {
  const list = drafts ?? [];
  let found = false;
  const next = list.map((d) => {
    if (d.id !== draftId) return d;
    found = true;
    if (d.status !== "suggested") return d; // caller detects no-status-change
    return {
      ...d,
      status: "promoted" as const,
      promoted_wisdom_id: promotedWisdomId,
    };
  });
  if (!found) return null;
  // Detect non-suggested source state — caller will see status unchanged
  // and surface the appropriate error. We return the array as-is so the
  // signal caller can pre-validate via findDraft.
  return next;
}

/**
 * Lookup a draft by ID. Returns undefined if not present.
 */
export function findDraft(
  drafts: WisdomDraft[] | undefined,
  draftId: string,
): WisdomDraft | undefined {
  return (drafts ?? []).find((d) => d.id === draftId);
}

/**
 * Filter drafts by status — used by change-level wisdom queries (AC7) and
 * by the system-block nudge (AC8) to detect pending-review drafts.
 */
export function draftsByStatus(
  drafts: WisdomDraft[] | undefined,
  status: WisdomDraft["status"],
): WisdomDraft[] {
  return (drafts ?? []).filter((d) => d.status === status);
}
