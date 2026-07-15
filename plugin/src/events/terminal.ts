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
const setTitle = (title: string): boolean => {
  const sanitizedTitle = sanitizeOscTitlePayload(title);
  log(`setTitle: ${JSON.stringify(sanitizedTitle)}`);
  const sequence = `\x1b]0;${sanitizedTitle}\x1b\\`;

  if (isTmux()) {
    let titleEmitted = false;
    const clientTty = getClientTty();
    if (clientTty) {
      titleEmitted = writeToTty(clientTty, sequence) || titleEmitted;
    }

    const paneTty = getPaneTty();
    if (paneTty) {
      titleEmitted = writeToTty(paneTty, sequence) || titleEmitted;
    }

    // Also update tmux window name — use argv-based execFileSync so the
    // title bypasses shell parsing entirely. No escaping needed for
    // backtick, `$`, backslash, newline, or quotes.
    try {
      execFileSync("tmux", ["rename-window", "--", sanitizedTitle], {
        stdio: "ignore",
        timeout: 1000,
      });
      titleEmitted = true;
    } catch (error) {
      log(`tmux rename-window failed: ${String(error)}`);
    }
    return titleEmitted;
  }

  // Non-tmux: try /dev/tty, then stdout
  try {
    fs.accessSync("/dev/tty", fs.constants.W_OK);
    fs.writeFileSync("/dev/tty", sequence);
    return true;
  } catch (ttyError) {
    log(`setTitle /dev/tty write failed: ${String(ttyError)}`);
    if (!process.stdout.isTTY) {
      log("setTitle stdout fallback skipped: stdout is not a TTY");
      return false;
    }
    try {
      process.stdout.write(sequence);
      return true;
    } catch (stdoutError) {
      log(`setTitle stdout write failed: ${String(stdoutError)}`);
      return false;
    }
  }
};

/**
 * Test-only export of setTitle (underscore-prefixed to signal
 * non-public API). See terminal.test.ts.
 */
export const _setTitle = setTitle;

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
 * Build the pane title from the active change ID and optional Epic ID.
 *
 * Identity rules (rq-titleIdentity01):
 *   - No active change        → null (no write)
 *   - Active change           → changeId
 *   - Active change + Epic    → "epicId | changeId"
 *
 * The title never falls back to a project name, worktree path, branch,
 * status marker, progress text, or emoji. Returning null is the
 * structural representation of "no reachable active change"; callers
 * must skip the title write rather than substituting a fallback.
 *
 * Deliberately avoids semantic normalization, shortname generation,
 * acronym generation, verb stripping, or AI/agent-driven naming.
 */
export const buildTabTitle = (
  changeId?: string,
  epicId?: string,
): string | null => {
  const changePart = cleanTitlePart(changeId);
  const epicPart = cleanTitlePart(epicId);

  if (changePart && epicPart) {
    return `${epicPart} | ${changePart}`;
  }
  if (changePart) {
    return changePart;
  }
  return null;
};

let lastTitle: string | null = null;

/**
 * Update terminal based on status.
 *
 * Title format (rq-titleIdentity01):
 *   - Active change with Epic: "epicId | changeId"
 *   - Active change without Epic: "changeId"
 *   - No active change: no write (pane keeps its last intentional title)
 *
 * `status` is accepted for API compatibility but does not influence the
 * title — status markers, progress, and emojis are not pane identity.
 */
export const updateTerminalStatus = (
  _status: StatusMarker,
  changeId?: string,
  epicId?: string,
): void => {
  const title = buildTabTitle(changeId, epicId);
  if (title === null) {
    // No reachable active change — skip the title write so terminal
    // transitions never clear the pane (AC1, AC4).
    return;
  }

  if (title !== lastTitle) {
    if (setTitle(title)) {
      lastTitle = title;
    }
  }
};

/**
 * Get emoji for status marker.
 *
 * Retained for the chat-output-display drift contract (rq-idleMarker02)
 * which scans this source for the IDLE/ATTN switch cases. Not referenced
 * by runtime pane identity — status emojis are not pane identity.
 */
const _getStatusEmoji = (status: StatusMarker): string => {
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
 * Full cleanup - reset module-level state without touching the pane.
 *
 * The pane identity contract (fixAdvPanelTitles, AC4 / DONT2) preserves
 * the last intentional ADV title across cleanup. Closing or archiving a
 * change must not clear or replace the existing pane title, so this
 * cleanup does NOT call `resetTitle` / `setTitle("")`.
 */
export const cleanupTerminal = (): void => {
  lastTitle = null;
  invalidateTtyCache();
};
