/**
 * Terminal Utilities
 *
 * Handles terminal tab title and color updates via OSC sequences.
 * Supports tmux environments with proper TTY detection.
 */

import * as fs from "fs";
import { execSync, execFileSync } from "child_process";
import type { StatusMarker } from "../types";
import {
  ADV_DEBUG_ENABLED,
  appendDebugLog,
  createLogger,
} from "../utils/debug-log";

// =============================================================================
// Debug Logging
// =============================================================================

const DEBUG = ADV_DEBUG_ENABLED;
const logger = createLogger("terminal");

/**
 * Log debug message to file.
 */
const logToFile = (msg: string): void => {
  appendDebugLog("terminal", msg);
};

/**
 * Log debug message to both file and stderr when ADV_DEBUG=1.
 *
 * Uses `logger.error` so the same structured logger carries terminal
 * debug output; the DEBUG gate keeps output quiet in normal runs.
 */
const log = (msg: string): void => {
  if (DEBUG) {
    logToFile(msg);
    logger.error(msg);
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

// Cache TTY paths with expiry to handle tmux reattach/detach
const TTY_CACHE_TTL_MS = 60_000; // Re-detect TTY every 60 seconds
let cachedPaneTty: string | null | undefined;
let cachedClientTty: string | null | undefined;
let ttyCacheTimestamp = 0;

const isTtyCacheStale = (): boolean =>
  Date.now() - ttyCacheTimestamp > TTY_CACHE_TTL_MS;

const getPaneTty = (): string | null => {
  if (cachedPaneTty === undefined || isTtyCacheStale()) {
    cachedPaneTty = getTmuxPaneTty();
    ttyCacheTimestamp = Date.now();
  }
  return cachedPaneTty;
};

const getClientTty = (): string | null => {
  if (cachedClientTty === undefined || isTtyCacheStale()) {
    cachedClientTty = getTmuxClientTty();
    ttyCacheTimestamp = Date.now();
  }
  return cachedClientTty;
};

/**
 * Invalidate the TTY cache, forcing re-detection on next use.
 * Useful after tmux detach/reattach or environment changes.
 */
const invalidateTtyCache = (): void => {
  cachedPaneTty = undefined;
  cachedClientTty = undefined;
  ttyCacheTimestamp = 0;
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
  } catch (error) {
    log(`writeToTty failed: tty=${tty} error=${String(error)}`);
    return false;
  }
};

const sanitizeOscTitlePayload = (title: string): string =>
  title
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : char;
    })
    .join("")
    .replace(/ {2,}/g, " ");

/**
 * Set terminal title via OSC sequence.
 */
const setTitle = (title: string): void => {
  log(`setTitle: "${title}"`);
  const sanitizedTitle = sanitizeOscTitlePayload(title);
  const sequence = `\x1b]0;${sanitizedTitle}\x1b\\`;

  if (isTmux()) {
    const clientTty = getClientTty();
    if (clientTty) {
      writeToTty(clientTty, sequence);
    }

    const paneTty = getPaneTty();
    if (paneTty) {
      writeToTty(paneTty, sequence);
    }

    // Also update tmux window name — use argv-based execFileSync so the
    // title bypasses shell parsing entirely. No escaping needed for
    // backtick, `$`, backslash, newline, or quotes.
    try {
      execFileSync("tmux", ["rename-window", sanitizedTitle], {
        stdio: "ignore",
        timeout: 1000,
      });
    } catch (error) {
      log(`tmux rename-window failed: ${String(error)}`);
    }
    return;
  }

  // Non-tmux: try /dev/tty, then stdout
  try {
    fs.accessSync("/dev/tty", fs.constants.W_OK);
    fs.writeFileSync("/dev/tty", sequence);
  } catch (ttyError) {
    log(`setTitle /dev/tty write failed: ${String(ttyError)}`);
    if (!process.stdout.isTTY) {
      log("setTitle stdout fallback skipped: stdout is not a TTY");
      return;
    }
    try {
      process.stdout.write(sequence);
    } catch (stdoutError) {
      log(`setTitle stdout write failed: ${String(stdoutError)}`);
    }
  }
};

/**
 * Test-only export of setTitle (underscore-prefixed to signal
 * non-public API). See terminal.test.ts.
 */
export const _setTitle = setTitle;

/**
 * Reset terminal title.
 */
const resetTitle = (): void => {
  log("resetTitle");
  setTitle("");
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
  } catch (error) {
    log(`getProjectName failed: ${String(error)}`);
    return "Unknown";
  }
};

// =============================================================================
// Tab Title Helpers
// =============================================================================

const cleanTitlePart = (value: string | undefined): string =>
  (value ?? "").trim();

/**
 * Build tab title from raw project name and raw change ID.
 *
 * Deliberately avoids semantic normalization, shortname generation, acronym
 * generation, verb stripping, or AI/agent-driven naming. The terminal title is
 * a direct reflection of the initial project basename and active ADV change ID:
 *
 *   Project
 *   Project: change-id
 */
export const buildTabTitle = (
  _emoji: string,
  projectName: string,
  changeId: string | undefined,
  _prefix?: string,
): string => {
  const projectLabel = cleanTitlePart(projectName);
  const changeLabel = cleanTitlePart(changeId);

  if (projectLabel && changeLabel) {
    return `${projectLabel}: ${changeLabel}`;
  }
  if (projectLabel) {
    return projectLabel;
  }
  if (changeLabel) {
    return changeLabel;
  }
  return "";
};

let lastTitle: string | null = null;

/**
 * Update terminal based on status.
 * Title format:
 *   - Active change: "<project>: <change-id>"
 *   - No active change: "<project>"
 *
 * Title policy: identity-only. Do not encode status/progress or repeatedly
 * rewrite the tab title during normal status churn. The initial simple
 * `project: advChange` title is updated only when the identity string changes.
 *
 * Notification policy: ADV core does not emit audible terminal bells for
 * status transitions. Attention/completion notifications are handled by the
 * host/tool integration layer (for example Warp/OpenCode notifications) or by
 * user terminal settings outside this module.
 */
export const updateTerminalStatus = (
  status: StatusMarker,
  projectName: string,
  changeId?: string,
  _progress?: string,
): void => {
  const title = buildTabTitle(getStatusEmoji(status), projectName, changeId);

  if (title !== lastTitle) {
    lastTitle = title;
    setTitle(title);
  }
};

/**
 * Get emoji for status marker.
 */
const getStatusEmoji = (status: StatusMarker): string => {
  switch (status) {
    case "WORK":
      return "🟩";
    case "TOOLING":
      return "🟨";
    case "ATTN":
      return "🟥";
    case "IDLE":
      return "⬜";
    case "BLOCKED":
      return "🟥";
    default:
      return "📦";
  }
};

/**
 * Full cleanup - reset title and all module-level state.
 */
export const cleanupTerminal = (): void => {
  resetTitle();
  lastTitle = null;
  invalidateTtyCache();
};
