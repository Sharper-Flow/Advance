/**
 * Events Module
 *
 * Status markers and terminal utilities for ADV plugin.
 */

// Terminal utilities
export {
  getProjectName,
  buildTabTitle,
  armPendingFinalAlert,
  _clearPendingFinalAlert,
} from "./terminal";

// Status management
export {
  initializeStatus,
  setStatus,
  setActiveChange,
  getStatus,
  cleanup,
  pruneStaleRetries,
} from "./status";
