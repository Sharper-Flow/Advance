/**
 * Terminal Utilities
 *
 * Handles terminal tab title and color updates via OSC sequences.
 * Supports tmux environments with proper TTY detection.
 */

import * as fs from "fs";
import { execSync } from "child_process";
import type { StatusMarker } from "../types";
import { TAB_COLORS } from "../types";

// =============================================================================
// Debug Logging
// =============================================================================

const DEBUG = process.env.ADV_DEBUG === "1";

/**
 * Log debug message to file.
 */
const logToFile = (msg: string): void => {
  try {
    fs.appendFileSync(
      "/tmp/adv-debug.log",
      `${new Date().toISOString()} ${msg}\n`,
    );
  } catch {
    // ignore
  }
};

/**
 * Log debug message.
 */
const log = (msg: string): void => {
  if (DEBUG) {
    logToFile(msg);
    console.error(`[ADV:terminal] ${msg}`);
  }
};

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Detect if running inside tmux session.
 */
export const isTmux = (): boolean => !!process.env.TMUX;

/**
 * Get the tmux pane's TTY path.
 */
const getTmuxPaneTty = (): string | null => {
  if (!isTmux()) {
    return null;
  }

  try {
    const result = execSync("tmux display-message -p '#{pane_tty}'", {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const tty = result.trim();
    if (tty && tty.startsWith("/dev/")) {
      log(`getPaneTty: ${tty}`);
      return tty;
    }
  } catch (error) {
    log(`getPaneTty: FAILED - ${error}`);
  }

  return null;
};

/**
 * Get the tmux client's TTY path.
 */
const getTmuxClientTty = (): string | null => {
  if (!isTmux()) {
    return null;
  }

  try {
    const result = execSync("tmux display-message -p '#{client_tty}'", {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const tty = result.trim();
    if (tty && tty.startsWith("/dev/")) {
      log(`getClientTty: ${tty}`);
      return tty;
    }
  } catch (error) {
    log(`getClientTty: FAILED - ${error}`);
  }

  return null;
};

// Cache TTY paths
let cachedPaneTty: string | null | undefined;
let cachedClientTty: string | null | undefined;

const getPaneTty = (): string | null => {
  if (cachedPaneTty === undefined) {
    cachedPaneTty = getTmuxPaneTty();
  }
  return cachedPaneTty;
};

const getClientTty = (): string | null => {
  if (cachedClientTty === undefined) {
    cachedClientTty = getTmuxClientTty();
  }
  return cachedClientTty;
};

// =============================================================================
// OSC Sequence Writing
// =============================================================================

/**
 * Write OSC sequence to a TTY device.
 */
const writeToTty = (tty: string, sequence: string): boolean => {
  try {
    fs.writeFileSync(tty, sequence);
    return true;
  } catch {
    return false;
  }
};

/**
 * Set terminal title via OSC sequence.
 */
export const setTitle = (title: string): void => {
  log(`setTitle: "${title}"`);
  const sequence = `\x1b]0;${title}\x07`;

  if (isTmux()) {
    const clientTty = getClientTty();
    if (clientTty) {
      writeToTty(clientTty, sequence);
    }

    const paneTty = getPaneTty();
    if (paneTty) {
      writeToTty(paneTty, sequence);
    }

    // Also update tmux window name
    try {
      const safeTitle = title.replace(/"/g, '\\"').replace(/\$/g, "\\$");
      execSync(`tmux rename-window "${safeTitle}"`, {
        stdio: "ignore",
        timeout: 1000,
      });
    } catch {
      // ignore
    }
    return;
  }

  // Non-tmux: try /dev/tty, then stdout
  try {
    fs.accessSync("/dev/tty", fs.constants.W_OK);
    fs.writeFileSync("/dev/tty", sequence);
  } catch {
    try {
      process.stdout.write(sequence);
    } catch {
      // ignore
    }
  }
};

/**
 * Reset terminal title.
 */
export const resetTitle = (): void => {
  log("resetTitle");
  setTitle("");
};

/**
 * Set terminal tab color via OSC 9;9 sequence.
 */
export const setTabColor = (color: string): void => {
  log(`setTabColor: ${color}`);
  const sequence = `\x1b]9;9;1;${color}\x07`;

  if (isTmux()) {
    const clientTty = getClientTty();
    if (clientTty) {
      writeToTty(clientTty, sequence);
    }
  } else {
    try {
      process.stdout.write(sequence);
    } catch {
      // ignore
    }
  }
};

/**
 * Reset terminal tab color.
 */
export const resetTabColor = (): void => {
  log("resetTabColor");
  const sequence = `\x1b]9;9;0;\x07`;

  if (isTmux()) {
    const clientTty = getClientTty();
    if (clientTty) {
      writeToTty(clientTty, sequence);
    }
  } else {
    try {
      process.stdout.write(sequence);
    } catch {
      // ignore
    }
  }
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Extract project name from directory path.
 */
export const getProjectName = (directory: string): string => {
  try {
    const parts = directory.split("/");
    return parts[parts.length - 1] || "Unknown";
  } catch {
    return "Unknown";
  }
};

/**
 * Update terminal based on status.
 */
export const updateTerminalStatus = (
  status: StatusMarker,
  projectName: string,
  changeId?: string,
  progress?: string,
): void => {
  // Update tab color
  const color = TAB_COLORS[status];
  if (color) {
    setTabColor(color);
  }

  // Build title
  const emoji = getStatusEmoji(status);
  const progressText = progress ? ` [${progress}]` : "";
  const changeText = changeId ? `: ${changeId}` : "";
  const title = `${emoji} ${projectName}${changeText}${progressText}`;

  setTitle(title);
};

/**
 * Get emoji for status marker.
 */
const getStatusEmoji = (status: StatusMarker): string => {
  switch (status) {
    case "ROCKET":
      return "🚀";
    case "TDD_RED":
      return "🔴";
    case "TDD_GREEN":
      return "🟢";
    case "MOON":
      return "🌙";
    case "EARTH":
      return "🌍";
    case "DOOM_LOOP":
      return "💀";
    case "MIC":
      return "🎤";
    default:
      return "📦";
  }
};

/**
 * Full cleanup - reset title and color.
 */
export const cleanupTerminal = (): void => {
  resetTitle();
  resetTabColor();
};
