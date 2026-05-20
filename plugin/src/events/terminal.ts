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

/**
 * Set terminal title via OSC sequence.
 */
const setTitle = (title: string): void => {
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

    // Also update tmux window name — use argv-based execFileSync so the
    // title bypasses shell parsing entirely. No escaping needed for
    // backtick, `$`, backslash, newline, or quotes.
    try {
      execFileSync("tmux", ["rename-window", title], {
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
 * Build tab title from raw project name, raw change ID, and optional prefix.
 *
 * Deliberately avoids semantic normalization, shortname generation, acronym
 * generation, verb stripping, or AI/agent-driven naming. The terminal title is
 * a direct reflection of the project basename and active ADV change ID:
 *
 *   Project
 *   Project: change-id
 *   💀 Project: change-id
 */
export const buildTabTitle = (
  _emoji: string,
  projectName: string,
  changeId: string | undefined,
  prefix?: string,
): string => {
  const projectLabel = cleanTitlePart(projectName);
  const changeLabel = cleanTitlePart(changeId);
  const prefixLabel = cleanTitlePart(prefix);
  const prefixStr = prefixLabel ? `${prefixLabel} ` : "";

  if (projectLabel && changeLabel) {
    return `${prefixStr}${projectLabel}: ${changeLabel}`;
  }
  if (projectLabel) {
    return `${prefixStr}${projectLabel}`;
  }
  if (changeLabel) {
    return `${prefixStr}${changeLabel}`;
  }
  return prefixLabel;
};

// Test seam: injectable callback replaces real bell I/O in tests.
// Avoids fragile fs/stdout spying across tmux/non-tmux environments.
let _onBell: (() => void) | null = null;

/** Replace the real bell with a test callback. Pass null to restore. */
export const _setBellCallback = (cb: (() => void) | null): void => {
  _onBell = cb;
};

/**
 * Ring the terminal bell (audio alert).
 * Used to notify user when attention is needed (EARTH, MIC states).
 */
const ringBell = (): void => {
  log("ringBell");

  if (_onBell) {
    _onBell();
    return;
  }

  const bellSequence = "\x07"; // BEL character

  if (isTmux()) {
    const clientTty = getClientTty();
    if (clientTty) {
      writeToTty(clientTty, bellSequence);
    }
    const paneTty = getPaneTty();
    if (paneTty) {
      writeToTty(paneTty, bellSequence);
    }
  } else {
    try {
      process.stdout.write(bellSequence);
    } catch {
      // ignore
    }
  }
};

// Track last status to avoid repeated alerts
// null = new session (bell should not ring)
// StatusMarker = previous status for transition detection
let lastAlertedStatus: StatusMarker | null = null;

// Bell-gate state: only ring when main agent finishes a response.
// Armed by armPendingFinalAlert() after a qualifying message.updated event.
let pendingFinalAlert = false;
let lastArmedMessageId: string | null = null;
let lastRungMessageId: string | null = null;

/**
 * Arm the pending final alert for a completed main-agent message.
 * Called from index.ts message.updated handler when the main agent
 * finishes a response (not a tool turn).
 * Dedup: no-op if messageId matches lastArmedMessageId.
 */
export const armPendingFinalAlert = (messageId: string): void => {
  if (messageId === lastArmedMessageId) return;
  lastArmedMessageId = messageId;
  pendingFinalAlert = true;
};

/**
 * Test seam: reset bell-gate state. Also called from cleanupTerminal().
 */
export const _clearPendingFinalAlert = (): void => {
  pendingFinalAlert = false;
  lastArmedMessageId = null;
  lastRungMessageId = null;
};

// Bell debounce — absorb transient EARTH states during sub-agent teardown.
// MIC always rings immediately; EARTH waits BELL_DEBOUNCE_MS to confirm idle.
const BELL_DEBOUNCE_MS = 2000;
let bellDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Cancel any pending debounced bell.
 */
const cancelPendingBell = (): void => {
  if (bellDebounceTimer !== null) {
    clearTimeout(bellDebounceTimer);
    bellDebounceTimer = null;
  }
};

/**
 * Update terminal based on status.
 * Title format:
 *   - Active change: "<project>: <change-id>"
 *   - No active change: "<project>"
 *   - BLOCKED: prepends "💀" prefix
 *
 * Bell policy:
 *   - ATTN (permission pending): ring immediately, clear any pending final alert
 *   - ATTN (armed idle): debounce ring (main agent finished)
 *   - BLOCKED → ATTN: debounce ring (user needs to see recovery)
 *   - ATTN without armed flag: no bell (sub-agent teardown, transient idle)
 *   - All other transitions: cancel any pending bell
 *   - New session (null→anything): never ring
 *   - ATTN→ATTN: not active work, no bell
 */
export const updateTerminalStatus = (
  status: StatusMarker,
  projectName: string,
  changeId?: string,
  _progress?: string,
): void => {
  const emoji = getStatusEmoji(status);
  const prefix = status === "BLOCKED" ? "💀" : undefined;
  const title = buildTabTitle(emoji, projectName, changeId, prefix);

  setTitle(title);

  const previousStatus = lastAlertedStatus;
  lastAlertedStatus = status;

  // Permission-ATTN vs idle-IDLE bell policy (#86):
  //
  // ATTN = permission pending (user must approve). Always rings immediately.
  // IDLE = agent finished. Uses armed/debounce state machine.
  //
  //   - WORK/TOOLING → ATTN: ring immediately (permission pending)
  //   - WORK/TOOLING → IDLE: ring (immediate or debounced via armed gate)
  //   - ATTN → IDLE / IDLE → ATTN: ring (permission-ATTN always rings)
  //   - IDLE → IDLE: no ring (no transition)
  //   - ATTN → ATTN: ring immediately (new permission while pending)
  //   - BLOCKED → ATTN: debounce-ring (recovery prompt)
  //   - BLOCKED → IDLE: NO ring (recovery without user action)

  // ATTN (permission pending): always ring immediately.
  if (status === "ATTN" && previousStatus !== null) {
    cancelPendingBell();
    pendingFinalAlert = false;
    ringBell();
    return;
  }

  // IDLE transitions from active work (armed idle or agent-finished).
  if (
    status === "IDLE" &&
    previousStatus !== null &&
    previousStatus !== "ATTN" &&
    previousStatus !== "IDLE"
  ) {
    // BLOCKED → IDLE: silent (recovery completed without user action).
    if (previousStatus === "BLOCKED") {
      cancelPendingBell();
      return;
    }

    // Armed gate: debounce-ring only if main agent completed a qualifying response.
    if (pendingFinalAlert) {
      // Dedup: skip if this message was already rung.
      if (lastArmedMessageId === lastRungMessageId) {
        pendingFinalAlert = false;
        return;
      }
      cancelPendingBell();
      const messageId = lastArmedMessageId;
      bellDebounceTimer = setTimeout(() => {
        bellDebounceTimer = null;
        if (lastAlertedStatus === "IDLE") {
          lastRungMessageId = messageId;
          pendingFinalAlert = false;
          ringBell();
        }
      }, BELL_DEBOUNCE_MS);
      return;
    }

    // Non-armed IDLE: ring immediately (agent finished without sub-agent).
    cancelPendingBell();
    pendingFinalAlert = false;
    ringBell();
    return;
  }

  // All other transitions: cancel any pending bell
  cancelPendingBell();
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
  cancelPendingBell();
  resetTitle();
  lastAlertedStatus = null;
  _clearPendingFinalAlert();
  invalidateTtyCache();
};
