/**
 * Terminal Utilities
 *
 * Handles terminal tab title and color updates via OSC sequences.
 * Supports tmux environments with proper TTY detection.
 */

import * as fs from "fs";
import { execSync } from "child_process";
import type { StatusMarker } from "../types";

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
export const invalidateTtyCache = (): void => {
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

// =============================================================================
// Tab Title Helpers
// =============================================================================

/**
 * Common verb prefixes to strip from camelCase/kebab/snake change IDs.
 * Applied before title-casing to surface the meaningful noun phrase.
 */
const CHANGE_ID_PREFIXES = [
  "refactor",
  "improve",
  "remove",
  "create",
  "update",
  "change",
  "add",
  "fix",
];

/**
 * Normalize a camelCase, kebab-case, or snake_case change ID into
 * a human-readable Title Case label suitable for a terminal tab title.
 *
 * Algorithm:
 *   1. Insert space at camelCase boundaries
 *   2. Replace separators (- _) with spaces
 *   3. Normalize whitespace
 *   4. Strip leading verb prefix (if result would remain non-empty)
 *   5. Title-case each word
 *   6. Fall back to full raw ID (title-cased) if result is empty
 *
 * Examples:
 *   addFeatureX            → "Feature X"
 *   fixAuthTimeout         → "Auth Timeout"
 *   improve-terminal-tab   → "Terminal Tab"
 *   fix_auth_timeout       → "Auth Timeout"
 *   terminalTabTitle       → "Terminal Tab Title"
 */
export const normalizeChangeCode = (changeId: string): string => {
  if (!changeId) return "";

  // Step 1: split camelCase → "add Feature X"
  // Step 2: replace separators → words
  // Step 3: normalise whitespace
  const spaced = changeId
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = spaced.split(" ").filter(Boolean);
  if (words.length === 0) return changeId;

  // Step 4: strip leading verb prefix (case-insensitive, whole-word only)
  const firstLower = words[0].toLowerCase();
  const matchedPrefix = CHANGE_ID_PREFIXES.find((p) => firstLower === p);
  const remainder =
    matchedPrefix && words.length > 1 ? words.slice(1) : words;

  // Step 5: title-case
  const titled = remainder
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  // Step 6: fallback — should not be empty given the guard above, but be safe
  return titled || words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
};

/**
 * Build the terminal tab title string.
 *
 * Format:
 *   - Active change: "<emoji> <normalizedChangeCode>"
 *   - No active change: "<emoji>"  (bare emoji only — project name dropped)
 *
 * No progress counter is ever included.
 */
export const buildTabTitle = (
  emoji: string,
  _projectName: string,
  changeId: string | undefined,
): string => {
  if (changeId) {
    const label = normalizeChangeCode(changeId);
    return label ? `${emoji} ${label}` : emoji;
  }
  return emoji;
};

/**
 * Ring the terminal bell (audio alert).
 * Used to notify user when attention is needed (EARTH, MIC states).
 */
export const ringBell = (): void => {
  log("ringBell");
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

/**
 * Get model name from environment, formatting it for display.
 * Strips "Claude" prefix and common suffixes for brevity.
 * Falls back to empty string if not set.
 *
 * NOTE: Currently unused but kept for future use.
 */
const _getModelName = (): string => {
  const model = process.env.OPENCODE_MODEL || process.env.ANTHROPIC_MODEL || "";
  if (!model) return "";

  // Format model name for display
  let displayName = model
    .replace(/^claude-/i, "") // Remove "claude-" prefix
    .replace(/-\d{8}$/, "") // Remove date suffix like -20250514
    .replace(/-latest$/, ""); // Remove -latest suffix

  // Capitalize and format common model names
  const modelMappings: Record<string, string> = {
    "opus-4": "Opus 4",
    "sonnet-4": "Sonnet 4",
    "haiku-4": "Haiku 4",
    "3-5-sonnet": "Sonnet 3.5",
    "3-opus": "Opus 3",
    "3-haiku": "Haiku 3",
  };

  for (const [pattern, replacement] of Object.entries(modelMappings)) {
    if (displayName.toLowerCase().includes(pattern)) {
      displayName = replacement;
      break;
    }
  }

  return displayName;
};

/**
 * Update terminal based on status.
 * Title format:
 *   - Active change: "<emoji> <normalizedChangeCode>"
 *   - No active change: "<emoji>"
 * Rings bell for states needing user attention.
 */
export const updateTerminalStatus = (
  status: StatusMarker,
  projectName: string,
  changeId?: string,
  _progress?: string,
): void => {
  const emoji = getStatusEmoji(status);
  const title = buildTabTitle(emoji, projectName, changeId);

  setTitle(title);

  // Ring bell when transitioning from active work (ROCKET) to:
  // - EARTH (work complete, awaiting input)
  // - MIC (user attention needed for question/approval)
  // Do NOT ring on:
  // - New session (lastAlertedStatus is null)
  // - ROCKET -> MOON transitions (still working, just waiting for sub-agent)
  // - MOON -> EARTH transitions (sub-agent completed, but work not necessarily done)
  const previousStatus = lastAlertedStatus;
  lastAlertedStatus = status;

  const needsUserAttention = status === "EARTH" || status === "MIC";
  const wasActiveWork = previousStatus === "ROCKET";

  if (needsUserAttention && previousStatus !== null && wasActiveWork) {
    ringBell();
  }
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
      return "📡";
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
 * Full cleanup - reset title and all module-level state.
 */
export const cleanupTerminal = (): void => {
  resetTitle();
  lastAlertedStatus = null;
  invalidateTtyCache();
};
