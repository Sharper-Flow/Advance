/**
 * Status Management
 *
 * Manages ADV status markers and state transitions.
 */

import type { StatusMarker } from "../types";
import { STATUS_MARKERS } from "../types";
import { observedAttemptCount } from "../types/tasks";
import { updateTerminalStatus, cleanupTerminal } from "./terminal";
import { getCurrentSessionId } from "../utils/session-id";

// =============================================================================
// State
// =============================================================================

interface StatusState {
  currentStatus: StatusMarker;
  projectName: string;
  activeChangeId: string | null;
  activeEpicId: string | null;
  taskProgress: string | null;
  lastUpdated: number;
}

const sessions = new Map<string, StatusState>();

function getOrCreateSessionState(): StatusState {
  const sessionId = getCurrentSessionId() ?? "__default__";
  let sessionState = sessions.get(sessionId);
  if (!sessionState) {
    sessionState = {
      currentStatus: "IDLE",
      projectName: "Unknown",
      activeChangeId: null,
      activeEpicId: null,
      taskProgress: null,
      lastUpdated: Date.now(),
    };
    sessions.set(sessionId, sessionState);
  }
  return sessionState;
}

/**
 * Tracks whether initializeStatus has been called at least once in this
 * process. Once true, subsequent initializeStatus calls preserve in-flight
 * state (projectName, activeChangeId, currentStatus, taskProgress) instead of
 * resetting.
 *
 * Required because OpenCode's InstanceState cache is keyed by directory, so a
 * post-warp scenario instantiates a SECOND ADV plugin instance against the
 * worktree directory. That second instance calls initializeStatus(projectName)
 * again — pre-fix, this destructively reset activeChangeId, blowing away the
 * terminal status marker mid-change. projectName stays anchored to the first
 * init value so tab title remains anchored to the initial project identity
 * when no ADV change is active instead of dynamically changing to the
 * worktree basename.
 *
 * Source invariant: status initialization is idempotent across duplicate
 * OpenCode plugin instances created by worktree/warp session roots.
 */
let initialized = false;

// =============================================================================
// Status Marker Emission
// =============================================================================

/**
 * Get the status marker string for emission in responses.
 */
export const getStatusMarker = (status: StatusMarker): string => {
  return STATUS_MARKERS[status];
};

// =============================================================================
// Status State Management
// =============================================================================

/**
 * Initialize status tracking for a project.
 *
 * Idempotent: on the first call, resets `state` to defaults with the given
 * `projectName`. On subsequent calls, preserves `currentStatus`,
 * `projectName`, `activeChangeId`, and `taskProgress` (so warp-induced
 * double-init doesn't blow away in-flight status or dynamically retitle the
 * tab), and updates `lastUpdated` only.
 *
 * Tests reset the idempotency sentinel via `resetStatusForTest`.
 */
export const initializeStatus = (projectName: string): void => {
  if (initialized) {
    const s = getOrCreateSessionState();
    s.lastUpdated = Date.now();
    return;
  }
  const s = getOrCreateSessionState();
  s.currentStatus = "IDLE";
  s.projectName = projectName;
  s.activeChangeId = null;
  s.activeEpicId = null;
  s.taskProgress = null;
  s.lastUpdated = Date.now();
  initialized = true;
  updateTerminal();
};

/**
 * Test-only: reset the idempotency sentinel so the next `initializeStatus`
 * call performs a full reset. Do NOT call from production code.
 */
export const resetStatusForTest = (): void => {
  initialized = false;
  sessions.clear();
};

/**
 * Set the current status.
 * Always refreshes the terminal display to pick up any changeId/progress changes.
 * Bell logic in terminal.ts independently tracks transitions.
 */
export const setStatus = (status: StatusMarker): void => {
  const s = getOrCreateSessionState();
  s.currentStatus = status;
  s.lastUpdated = Date.now();
  updateTerminal();
};

/**
 * Set the active change being worked on.
 *
 * Accepts optional structured context (epicId) for pane title rendering.
 * The pane identity contract renders stable IDs only — the change ID is
 * the identity, and epicId (when present) prefixes it as
 * `epicId | changeId`. Display titles never enter the title path.
 * Passing null for changeId clears all context.
 */
export const setActiveChange = (
  changeId: string | null,
  context?: { epicId?: string },
): void => {
  const s = getOrCreateSessionState();
  s.activeChangeId = changeId;
  s.activeEpicId = changeId ? (context?.epicId ?? null) : null;
  updateTerminal();
};

/**
 * Update task progress display.
 */
export const setTaskProgress = (completed: number, total: number): void => {
  const s = getOrCreateSessionState();
  s.taskProgress = total > 0 ? `${completed}/${total}` : null;
  updateTerminal();
};

/**
 * Update the terminal display.
 *
 * Forwards stable IDs only — the pane identity contract renders the
 * active change ID (and optional Epic ID), never a display label,
 * project name, status marker, or progress text.
 */
const updateTerminal = (): void => {
  const s = getOrCreateSessionState();
  updateTerminalStatus(
    s.currentStatus,
    s.activeChangeId ?? undefined,
    s.activeEpicId ?? undefined,
  );
};

/**
 * Get current status state.
 */
export const getStatus = (): Readonly<StatusState> => {
  const s = getOrCreateSessionState();
  return { ...s };
};

/**
 * Reset status to idle state.
 */
export const resetStatus = (): void => {
  const s = getOrCreateSessionState();
  s.currentStatus = "IDLE";
  s.activeChangeId = null;
  s.activeEpicId = null;
  s.taskProgress = null;
  s.lastUpdated = Date.now();
  updateTerminal();
};

/**
 * Full cleanup on session end.
 * Resets all module-level state to prevent stale data across sessions.
 */
export const cleanup = (): void => {
  cleanupTerminal();
  initialized = false;
  sessions.delete(getCurrentSessionId() ?? "__default__");
  retryTrackers.clear();
};

// =============================================================================
// Doom Loop Detection
// =============================================================================

interface RetryTracker {
  taskId: string;
  attempts: number;
  /** TRANSIENT retry count — does NOT count toward doom-loop budget */
  transientCount: number;
  lastError: string | null;
  startTime: number;
}

const retryTrackers = new Map<string, RetryTracker>();
const DOOM_LOOP_THRESHOLD = 3;
const RETRY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

type ErrorClass = "TRANSIENT" | "SEMANTIC" | "ENVIRONMENTAL" | "FATAL";

/**
 * Track a retry attempt for a task.
 * Returns true if doom loop detected.
 * When errorClass === "TRANSIENT", increments transientCount only —
 * does NOT count toward doom-loop budget.
 */
export const trackRetry = (
  taskId: string,
  error?: string,
  errorClass?: ErrorClass,
): boolean => {
  const now = Date.now();
  let tracker = retryTrackers.get(taskId);

  if (!tracker || now - tracker.startTime > RETRY_WINDOW_MS) {
    // Start fresh tracker
    tracker = {
      taskId,
      attempts: errorClass === "TRANSIENT" ? 0 : 1,
      transientCount: errorClass === "TRANSIENT" ? 1 : 0,
      lastError: error ?? null,
      startTime: now,
    };
    retryTrackers.set(taskId, tracker);
    return false;
  }

  // Increment appropriate counter
  if (errorClass === "TRANSIENT") {
    tracker.transientCount++;
  } else {
    tracker.attempts++;
  }
  tracker.lastError = error ?? tracker.lastError;

  // Check for doom loop (TRANSIENT never triggers)
  if (tracker.attempts >= DOOM_LOOP_THRESHOLD) {
    setStatus("BLOCKED");
    return true;
  }

  return false;
};

/**
 * Clear retry tracking for a task (on success).
 */
export const clearRetry = (taskId: string): void => {
  retryTrackers.delete(taskId);
};

/**
 * Get doom loop info for a task.
 */
export const getDoomLoopInfo = (
  taskId: string,
): {
  inDoomLoop: boolean;
  attempts: number;
  transientAttempts: number;
  lastError: string | null;
} => {
  const tracker = retryTrackers.get(taskId);
  if (!tracker) {
    return {
      inDoomLoop: false,
      attempts: 0,
      transientAttempts: 0,
      lastError: null,
    };
  }
  return {
    inDoomLoop: tracker.attempts >= DOOM_LOOP_THRESHOLD,
    attempts: tracker.attempts,
    transientAttempts: tracker.transientCount,
    lastError: tracker.lastError,
  };
};

/**
 * Merge in-memory doom-loop tracking with persisted error_recovery state.
 * Useful for persisted state or after session restart when retryTrackers
 * are empty but task.error_recovery still records 3+ failed attempts.
 *
 * When persisted error_recovery.error_class === "TRANSIENT", those attempts
 * are excluded from the doom-loop count. Missing error_class defaults to
 * SEMANTIC (conservative: counts toward doom-loop budget).
 */
export const getEffectiveDoomLoopInfo = (
  taskId: string,
  persisted?: {
    retry_count?: number;
    attempts?: Array<unknown>;
    last_error?: string | null;
    error_class?: string;
  },
): {
  inDoomLoop: boolean;
  attempts: number;
  transientAttempts: number;
  lastError: string | null;
} => {
  const live = getDoomLoopInfo(taskId);
  // attempts[] is a bounded retention window, so count what occurred. Without
  // this, a restart that leaves only persisted state reports at most
  // max_retries no matter how many attempts really happened.
  const persistedAttempts = observedAttemptCount(persisted);
  const persistedRetryCount = persisted?.retry_count ?? 0;
  const rawPersistedCount = Math.max(persistedAttempts, persistedRetryCount);

  // TRANSIENT errors don't count toward doom-loop budget.
  // Missing error_class defaults to SEMANTIC (conservative).
  const isTransient = persisted?.error_class === "TRANSIENT";
  const effectivePersistedCount = isTransient ? 0 : rawPersistedCount;

  // Use persisted data when it has more info than live tracker,
  // OR when TRANSIENT persisted data exists but live has nothing.
  const hasPersistedData = rawPersistedCount > 0 || persisted?.last_error;
  if (
    hasPersistedData &&
    (effectivePersistedCount > live.attempts ||
      (isTransient && rawPersistedCount > live.transientAttempts))
  ) {
    return {
      inDoomLoop: effectivePersistedCount >= DOOM_LOOP_THRESHOLD,
      attempts: effectivePersistedCount,
      transientAttempts: isTransient
        ? rawPersistedCount
        : live.transientAttempts,
      lastError: persisted?.last_error ?? live.lastError,
    };
  }

  return live;
};

/**
 * Prune stale retry trackers that have exceeded the retry window.
 * Prevents unbounded memory growth over long sessions.
 */
export const pruneStaleRetries = (): number => {
  const now = Date.now();
  let pruned = 0;
  for (const [taskId, tracker] of retryTrackers) {
    if (now - tracker.startTime > RETRY_WINDOW_MS) {
      retryTrackers.delete(taskId);
      pruned++;
    }
  }
  return pruned;
};

/**
 * Clear all retry trackers. Used during cleanup/reset.
 */
const _clearAllRetries = (): void => {
  retryTrackers.clear();
};
