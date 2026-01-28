/**
 * Events Module
 *
 * Status markers and terminal utilities for ADV plugin.
 */

// Terminal utilities
export {
  isTmux,
  setTitle,
  resetTitle,
  getProjectName,
  updateTerminalStatus,
  cleanupTerminal,
  ringBell,
  invalidateTtyCache,
} from "./terminal";

// Status management
export {
  getStatusMarker,
  initializeStatus,
  setStatus,
  setActiveChange,
  setTaskProgress,
  updateProgressFromChange,
  getStatus,
  resetStatus,
  cleanup,
  detectStatusFromChange,
  detectTddStatus,
  trackRetry,
  clearRetry,
  getDoomLoopInfo,
  pruneStaleRetries,
  clearAllRetries,
} from "./status";
