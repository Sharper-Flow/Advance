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
} from "./terminal";

// Status management
export {
  getStatusMarker,
  emitStatusMarker,
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
} from "./status";
