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
  normalizeChangeCode,
  buildTabTitle,
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
  getStatus,
  resetStatus,
  cleanup,
  trackRetry,
  clearRetry,
  getDoomLoopInfo,
  pruneStaleRetries,
  clearAllRetries,
} from "./status";
