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
  const remainder = matchedPrefix && words.length > 1 ? words.slice(1) : words;

  // Step 5: title-case
  const titled = remainder
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  // Step 6: fallback — should not be empty given the guard above, but be safe
  return (
    titled ||
    words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
  );
};

/**
 * Dictionary of common tech + english tokens used by `segmentToken` to split
 * concatenated single-token project names (e.g. `opencodeadvance` → `open`,
 * `code`, `advance`). Lowercase only. Minimum length 2.
 *
 * Kept inline — the list is small (~150 entries, <2 KB in the tsup bundle) and
 * used by a hot-path title helper. An external data file would add bundling
 * complexity for no real benefit at this size.
 *
 * Grouped by category for ease of maintenance. When adding entries, prefer
 * tokens that actually appear in repo/project names and keep min length 2.
 */
export const SHORTNAME_DICTIONARY: readonly string[] = [
  // --- tech stack + domain tokens ---
  "open",
  "code",
  "advance",
  "plugin",
  "plugins",
  "server",
  "client",
  "edge",
  "fast",
  "apply",
  "morph",
  "react",
  "vue",
  "next",
  "node",
  "lib",
  "web",
  "app",
  "apps",
  "api",
  "auth",
  "user",
  "admin",
  "dev",
  "test",
  "build",
  "deploy",
  "flow",
  "chat",
  "bot",
  "cli",
  "ui",
  "ux",
  "data",
  "db",
  "sql",
  "json",
  "yaml",
  "http",
  "mcp",
  "llm",
  "ai",
  "ml",
  "nlp",
  "sdk",
  "pkg",
  "sync",
  "async",
  "gate",
  "port",
  "wire",
  "pipe",
  "hub",
  "bridge",
  "relay",
  "queue",
  "task",
  "tasks",
  "job",
  "jobs",
  "run",
  "runner",
  "cache",
  "store",
  "state",
  "event",
  "events",
  "stream",
  "proxy",
  "router",
  "route",
  "shell",
  "term",
  "terminal",
  "agent",
  "spec",
  "specs",
  "rule",
  "rules",
  "model",
  "prompt",
  // --- common modifiers / connectors ---
  "my",
  "new",
  "old",
  "big",
  "small",
  "slow",
  "first",
  "last",
  "top",
  "end",
  "mid",
  "core",
  "main",
  "util",
  "utils",
  "helper",
  "helpers",
  "tool",
  "tools",
  "kit",
  "box",
  "ship",
  "stop",
  "start",
  "make",
  "get",
  "set",
  "fix",
  "add",
  "log",
  "logs",
  "err",
  "info",
  "debug",
  "warn",
  "trace",
  "mock",
  "real",
  "prod",
  "pro",
  "lite",
  "micro",
  "mini",
  // --- generic nouns that commonly appear in repo names ---
  "spark",
  "cloud",
  "link",
  "lane",
  "stack",
  "site",
  "page",
  "form",
  "field",
  "group",
  "list",
  "line",
  "text",
  "file",
  "path",
  "dir",
  "folder",
  "repo",
  "branch",
  "commit",
  "push",
  "pull",
  "poke",
  "snap",
  "board",
  "deck",
  "scope",
  "guard",
  "mesh",
  "grid",
] as const;

/**
 * O(1)-lookup set view of `SHORTNAME_DICTIONARY`, derived once at module load.
 */
export const SHORTNAME_DICT_SET: ReadonlySet<string> = new Set(
  SHORTNAME_DICTIONARY,
);

/**
 * Dynamic-programming word-break segmentation.
 *
 * Given a lowercase `token` and a `dict` of allowed subwords, returns an
 * array of subwords whose concatenation exactly equals `token`, or `null`
 * if no such decomposition exists (i.e. at least one character cannot be
 * covered by a dictionary entry).
 *
 * Algorithm:
 *   - `dp[i]` is true iff `token[0..i]` can be fully segmented.
 *   - `parent[i]` records the start index of the last matched subword.
 *   - After filling dp/parent, reconstruct the subword list from the tail.
 *
 * Complexity: O(n² · hashCost) for token length n. For typical project
 * names (n ≤ 30) and a ~160-entry dictionary, runtime is microseconds.
 *
 * The "full character cover" requirement is the key correctness guard —
 * it prevents greedy overextension and lets callers safely fall back to
 * the default truncation path when segmentation fails.
 */
export const segmentToken = (
  token: string,
  dict: ReadonlySet<string>,
): string[] | null => {
  const n = token.length;
  if (n === 0) return null;

  const dp: boolean[] = new Array(n + 1).fill(false);
  const parent: number[] = new Array(n + 1).fill(-1);
  dp[0] = true;

  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < i; j++) {
      if (dp[j] && dict.has(token.slice(j, i))) {
        dp[i] = true;
        parent[i] = j;
        break;
      }
    }
  }

  if (!dp[n]) return null;

  const result: string[] = [];
  let i = n;
  while (i > 0) {
    const j = parent[i];
    result.unshift(token.slice(j, i));
    i = j;
  }
  return result;
};

/**
 * Project name prefixes stripped before shortname generation.
 * Match is case-insensitive and only the first matching prefix is removed.
 */
const SHORTNAME_PREFIXES = ["oc-", "lib-", "node-"];

/**
 * Project name suffixes stripped before shortname generation.
 * Match is case-insensitive and only the first matching suffix is removed.
 */
const SHORTNAME_SUFFIXES = [
  "-plugin",
  "-plugins",
  "-app",
  "-cli",
  "-server",
  "-client",
  "-mcp",
  ".js",
  ".ts",
];

/**
 * Hard cap on shortname length. Balances readability against tmux status-bar
 * and terminal tab-strip compactness. Chosen at 8 because:
 *
 *   - Fits short-but-meaningful words whole (`Advance`, `Plugin`, `Opencode`).
 *   - Keeps the composed title `<emoji> <shortname> · <change>` well under
 *     typical tmux `status-*-length` defaults (~20) and terminal tab strips.
 *   - Acronyms still fit (`OMFA`, `ABGDEZE`) without change.
 *
 * Acronyms and truncated single words both obey this limit.
 */
const SHORTNAME_MAX_LEN = 8;

/**
 * Generate a compact project shortname (≤ 8 chars) from a project/repo name.
 *
 * Algorithm (deterministic — no AI):
 *   1. Trim and strip a single matching prefix (oc-, lib-, node-)
 *   2. Strip a single matching suffix (-plugin, -app, -cli, -server, etc.)
 *   3. Split into words on camelCase boundaries and `-`/`_` separators
 *   4. If a single lowercase token ≥ 4 chars remains, try dictionary
 *      segmentation (`segmentToken`) against `SHORTNAME_DICT_SET`; on
 *      success with 2+ subwords, use those as the word list
 *   5. Multi-word + total > 8 chars → acronym (first letter each, UPPER,
 *      capped to 8)
 *   6. Otherwise join lowercase + truncate to 8 + title-case first letter
 *
 * Examples:
 *   advance                   → "Advance"     (whole, ≤ cap)
 *   opencode                  → "Opencode"    (segments open+code, at cap → compact)
 *   opencodeadvance           → "OCA"         (segments open+code+advance, over cap → acronym)
 *   pokeedge                  → "Pokeedge"    (segments poke+edge, at cap → compact)
 *   xyzzyabcdef               → "Xyzzyabc"    (opaque, truncate to 8)
 *   my-cool-project           → "MCP"         (explicit boundaries, acronym)
 *   opencode-morph-fast-apply → "OMFA"        (explicit boundaries, acronym)
 *   oc-plugins                → "Plugins"     (prefix stripped, whole word fits)
 *   morph-plugin              → "Morph"       (suffix stripped, whole word fits)
 *
 * NOTE: This is the deterministic-only fallback. AI-generated shortnames
 * (cached per project-id) are planned as a future enhancement; they will
 * front-run this function, leaving this path in place for cold-cache and
 * offline cases.
 */
export const generateProjectShortname = (projectName: string): string => {
  if (!projectName) return "";

  const trimmed = projectName.trim();
  if (!trimmed) return "";

  // 1. Strip prefix (case-insensitive, first match only)
  let working = trimmed;
  const lowerTrimmed = trimmed.toLowerCase();
  for (const prefix of SHORTNAME_PREFIXES) {
    if (lowerTrimmed.startsWith(prefix)) {
      working = trimmed.slice(prefix.length);
      break;
    }
  }

  // 2. Strip suffix (case-insensitive, first match only)
  const lowerWorking = working.toLowerCase();
  for (const suffix of SHORTNAME_SUFFIXES) {
    if (lowerWorking.endsWith(suffix) && working.length > suffix.length) {
      working = working.slice(0, -suffix.length);
      break;
    }
  }

  // Fallback if strip emptied the string
  if (!working) working = trimmed;

  // 3. Split into words (camelCase + separators)
  let words = working
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "";

  // 4. Dictionary-backed segmentation for single alphabetic tokens ≥ 4 chars.
  //    Restores structure for concatenated names like "opencodeadvance" or
  //    "Opencodeadvance". Lowercased before lookup so capitalization doesn't
  //    change the outcome; the dictionary itself is lowercase-only.
  //    The `≥ 4` threshold is a "nothing to gain below this" guard — 3-char
  //    tokens already fit the 8-char cap whole, so acronymization would make
  //    the result less readable, not more.
  //    The "full cover" requirement of `segmentToken` ensures we only replace
  //    `words` when every character decomposes cleanly; partial matches fall
  //    through to the default truncation path.
  if (
    words.length === 1 &&
    words[0].length >= 4 &&
    /^[a-zA-Z]+$/.test(words[0])
  ) {
    const segments = segmentToken(words[0].toLowerCase(), SHORTNAME_DICT_SET);
    if (segments && segments.length >= 2) {
      words = segments;
    }
  }

  const totalLen = words.reduce((sum, w) => sum + w.length, 0);

  // 5. Multi-word + total over limit → acronym (UPPERCASE, capped)
  if (words.length >= 2 && totalLen > SHORTNAME_MAX_LEN) {
    return words
      .map((w) => w.charAt(0).toUpperCase())
      .join("")
      .slice(0, SHORTNAME_MAX_LEN);
  }

  // 6. Single word OR short multi-word → join + truncate + title-case
  const joined = words.join("").toLowerCase();
  const truncated =
    joined.length <= SHORTNAME_MAX_LEN
      ? joined
      : joined.slice(0, SHORTNAME_MAX_LEN);
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
};

/**
 * Build tab title from emoji, project name, change code, and optional suffix.
 */
export const buildTabTitle = (
  emoji: string,
  projectName: string,
  changeId: string | undefined,
  suffix?: string,
): string => {
  const shortname = generateProjectShortname(projectName);
  const changeLabel = changeId ? normalizeChangeCode(changeId) : "";

  const suffixStr = suffix ? ` ${suffix}` : "";

  if (shortname && changeLabel) {
    return `${emoji} ${shortname} · ${changeLabel}${suffixStr}`;
  }
  if (shortname) {
    return `${emoji} ${shortname}${suffixStr}`;
  }
  if (changeLabel) {
    return `${emoji} ${changeLabel}${suffixStr}`;
  }
  return `${emoji}${suffixStr}`;
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
 *   - Active change: "<emoji> <normalizedChangeCode>"
 *   - No active change: "<emoji>"
 *   - BLOCKED: appends "💀" suffix
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
  const suffix = status === "BLOCKED" ? "💀" : undefined;
  const title = buildTabTitle(emoji, projectName, changeId, suffix);

  setTitle(title);

  const previousStatus = lastAlertedStatus;
  lastAlertedStatus = status;

  // ATTN transitions from active work (armed idle or permission pending):
  if (
    status === "ATTN" &&
    previousStatus !== null &&
    previousStatus !== "ATTN"
  ) {
    // BLOCKED exception: always debounce-ring on blocked→attn (user must see recovery prompt).
    if (previousStatus === "BLOCKED") {
      cancelPendingBell();
      bellDebounceTimer = setTimeout(() => {
        bellDebounceTimer = null;
        if (lastAlertedStatus === "ATTN") {
          ringBell();
        }
      }, BELL_DEBOUNCE_MS);
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
        if (lastAlertedStatus === "ATTN") {
          lastRungMessageId = messageId;
          pendingFinalAlert = false;
          ringBell();
        }
      }, BELL_DEBOUNCE_MS);
      return;
    }

    // Non-armed ATTN: ring immediately (permission pending or other transitions).
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
