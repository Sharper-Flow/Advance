/**
 * Status Management
 *
 * Manages ADV status markers and state transitions.
 */

import type { StatusMarker } from "../types";
import { STATUS_MARKERS } from "../types";
import { updateTerminalStatus, cleanupTerminal } from "./terminal";

// =============================================================================
// State
// =============================================================================

interface StatusState {
  currentStatus: StatusMarker;
  projectName: string;
  activeChangeId: string | null;
  taskProgress: string | null;
  lastUpdated: number;
}

let state: StatusState = {
  currentStatus: "IDLE",
  projectName: "Unknown",
  activeChangeId: null,
  taskProgress: null,
  lastUpdated: Date.now(),
};

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
 * init value so tab title remains the simple initial `project: advChange`
 * identity instead of dynamically changing to the worktree basename.
 *
 * See change `fixWorktreeSessionRoot` task `tk-f96182eff2ad` and the audit at
 * docs/spikes/module-singleton-audit.md Part A.
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
    state.lastUpdated = Date.now();
    return;
  }
  state = {
    currentStatus: "IDLE",
    projectName,
    activeChangeId: null,
    taskProgress: null,
    lastUpdated: Date.now(),
  };
  initialized = true;
  updateTerminal();
};

/**
 * Test-only: reset the idempotency sentinel so the next `initializeStatus`
 * call performs a full reset. Do NOT call from production code.
 */
export const resetStatusForTest = (): void => {
  initialized = false;
  state = {
    currentStatus: "IDLE",
    projectName: "Unknown",
    activeChangeId: null,
    taskProgress: null,
    lastUpdated: Date.now(),
  };
};

/**
 * Set the current status.
 * Always refreshes the terminal display to pick up any changeId/progress changes.
 * Bell logic in terminal.ts independently tracks transitions.
 */
export const setStatus = (status: StatusMarker): void => {
  state.currentStatus = status;
  state.lastUpdated = Date.now();
  updateTerminal();
};

/**
 * Set the active change being worked on.
 */
export const setActiveChange = (changeId: string | null): void => {
  state.activeChangeId = changeId;
  updateTerminal();
};

/**
 * Update task progress display.
 */
export const setTaskProgress = (completed: number, total: number): void => {
  state.taskProgress = total > 0 ? `${completed}/${total}` : null;
  updateTerminal();
};

/**
 * Update the terminal display.
 */
const updateTerminal = (): void => {
  updateTerminalStatus(
    state.currentStatus,
    state.projectName,
    state.activeChangeId ?? undefined,
    state.taskProgress ?? undefined,
  );
};

/**
 * Get current status state.
 */
export const getStatus = (): Readonly<StatusState> => {
  return { ...state };
};

/**
 * Reset status to idle state.
 */
export const resetStatus = (): void => {
  state = {
    ...state,
    currentStatus: "IDLE",
    activeChangeId: null,
    taskProgress: null,
    lastUpdated: Date.now(),
  };
  updateTerminal();
};

/**
 * Full cleanup on session end.
 * Resets all module-level state to prevent stale data across sessions.
 */
export const cleanup = (): void => {
  cleanupTerminal();
  initialized = false;
  state = {
    currentStatus: "IDLE",
    projectName: "Unknown",
    activeChangeId: null,
    taskProgress: null,
    lastUpdated: Date.now(),
  };
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
 * Useful for Temporal-backed state or after session restart when retryTrackers
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
  const persistedAttempts = persisted?.attempts?.length ?? 0;
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
