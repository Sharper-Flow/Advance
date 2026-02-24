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
  currentStatus: "EARTH",
  projectName: "Unknown",
  activeChangeId: null,
  taskProgress: null,
  lastUpdated: Date.now(),
};

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
 */
export const initializeStatus = (projectName: string): void => {
  state = {
    currentStatus: "EARTH",
    projectName,
    activeChangeId: null,
    taskProgress: null,
    lastUpdated: Date.now(),
  };
  updateTerminal();
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
    currentStatus: "EARTH",
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
  retryTrackers.clear();
};

// =============================================================================
// Doom Loop Detection
// =============================================================================

interface RetryTracker {
  taskId: string;
  attempts: number;
  lastError: string | null;
  startTime: number;
}

const retryTrackers = new Map<string, RetryTracker>();
const DOOM_LOOP_THRESHOLD = 3;
const RETRY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Track a retry attempt for a task.
 * Returns true if doom loop detected.
 */
export const trackRetry = (taskId: string, error?: string): boolean => {
  const now = Date.now();
  let tracker = retryTrackers.get(taskId);

  if (!tracker || now - tracker.startTime > RETRY_WINDOW_MS) {
    // Start fresh tracker
    tracker = {
      taskId,
      attempts: 1,
      lastError: error ?? null,
      startTime: now,
    };
    retryTrackers.set(taskId, tracker);
    return false;
  }

  // Increment attempts
  tracker.attempts++;
  tracker.lastError = error ?? tracker.lastError;

  // Check for doom loop
  if (tracker.attempts >= DOOM_LOOP_THRESHOLD) {
    setStatus("DOOM_LOOP");
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
): { inDoomLoop: boolean; attempts: number; lastError: string | null } => {
  const tracker = retryTrackers.get(taskId);
  if (!tracker) {
    return { inDoomLoop: false, attempts: 0, lastError: null };
  }
  return {
    inDoomLoop: tracker.attempts >= DOOM_LOOP_THRESHOLD,
    attempts: tracker.attempts,
    lastError: tracker.lastError,
  };
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
export const clearAllRetries = (): void => {
  retryTrackers.clear();
};
