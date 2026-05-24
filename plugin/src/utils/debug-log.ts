/**
 * Plugin logger.
 *
 * Provides severity-leveled logging through a single local logger:
 *   - `debug` → file sink only when ADV_DEBUG=1
 *   - `info`  → file sink only when ADV_DEBUG=1
 *   - `warn`  → console.warn in normal runs + file sink when ADV_DEBUG=1
 *   - `error` → console.error in normal runs + file sink when ADV_DEBUG=1
 *
 * The legacy `appendDebugLog(scope, msg)` helper is preserved as a
 * compatibility shim that delegates to the `debug` level so existing
 * call sites keep their current behavior until migrated.
 */

import * as fs from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMeta = Record<string, unknown>;

export interface Logger {
  debug: (msg: string, meta?: LogMeta) => void;
  info: (msg: string, meta?: LogMeta) => void;
  warn: (msg: string, meta?: LogMeta) => void;
  error: (msg: string, meta?: LogMeta) => void;
}

/**
 * Whether the file-sink debug log is enabled for the current process.
 *
 * Resolved once at module load time. Tests that toggle `ADV_DEBUG` must
 * also reset Vitest module state (e.g. `vi.resetModules()`) to re-read
 * the environment, which the co-located test file does.
 */
export const ADV_DEBUG_ENABLED = process.env.ADV_DEBUG === "1";
export const ADV_PROFILE_ENABLED = process.env.ADV_PROFILE === "1";

const isDebugEnabled = (): boolean => process.env.ADV_DEBUG === "1";
const isProfileEnabled = (): boolean => process.env.ADV_PROFILE === "1";

const getDebugLogPath = (): string => {
  const debugDir = process.env.ADV_CACHE_DIR ?? process.env.TMPDIR ?? tmpdir();
  return join(debugDir, "adv-debug.log");
};

const getProfileLogPath = (): string => {
  const debugDir = process.env.ADV_CACHE_DIR ?? process.env.TMPDIR ?? tmpdir();
  return join(debugDir, "adv-profile.log");
};

const formatMeta = (meta?: LogMeta): string => {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    // meta contained circular references or non-serializable values;
    // fall back to a best-effort summary rather than crashing.
    return ` [meta-unserializable]`;
  }
};

const writeFileSink = (scope: string, level: LogLevel, line: string): void => {
  if (!isDebugEnabled()) return;
  try {
    const logPath = getDebugLogPath();
    fs.mkdirSync(dirname(logPath), { recursive: true });
    fs.appendFileSync(
      logPath,
      `${new Date().toISOString()} [${scope}] (${level}) ${line}\n`,
    );
  } catch {
    // Debug logging is best-effort — never crash the caller.
  }
};

/**
 * Create a scoped logger. `scope` is a short module/service name that
 * appears in both the console prefix and the file sink.
 *
 * Console output (warn/error) is gated on `ADV_DEBUG=1` to prevent
 * Temporal retry/init spam from drowning interactive sessions. All
 * levels always write to the file sink when `ADV_DEBUG=1`.
 */
export const createLogger = (scope: string): Logger => {
  const consolePrefix = `[adv:${scope}]`;

  const emit = (level: LogLevel, msg: string, meta?: LogMeta): void => {
    const metaStr = formatMeta(meta);
    const fileLine = `${msg}${metaStr}`;
    const consoleLine = `${consolePrefix} ${msg}${metaStr}`;

    writeFileSink(scope, level, fileLine);

    // Console output only when ADV_DEBUG=1. Normal sessions are quiet;
    // diagnostics live in the file sink for offline inspection.
    if (isDebugEnabled()) {
      if (level === "warn") {
        console.warn(consoleLine);
      } else if (level === "error") {
        console.error(consoleLine);
      }
    }
    // debug/info: file sink only, no console output.
  };

  return {
    debug: (msg, meta) => emit("debug", msg, meta),
    info: (msg, meta) => emit("info", msg, meta),
    warn: (msg, meta) => emit("warn", msg, meta),
    error: (msg, meta) => emit("error", msg, meta),
  };
};

/**
 * Legacy compatibility shim. Delegates to the `debug` level of a
 * scope-local logger so existing call sites keep writing to the
 * file-sink when `ADV_DEBUG=1` and stay silent otherwise.
 */
export const appendDebugLog = (scope: string, msg: string): void => {
  if (!isDebugEnabled()) return;
  try {
    const logPath = getDebugLogPath();
    fs.mkdirSync(dirname(logPath), { recursive: true });
    fs.appendFileSync(
      logPath,
      `${new Date().toISOString()} [${scope}] ${msg}\n`,
    );
  } catch {
    // Best-effort; never crash the caller.
  }
};

/**
 * Append a structured profiling event to the dedicated file sink.
 * Silent unless `ADV_PROFILE=1`.
 */
export const appendProfileLog = (scope: string, meta: LogMeta): void => {
  if (!isProfileEnabled()) return;
  try {
    const logPath = getProfileLogPath();
    fs.mkdirSync(dirname(logPath), { recursive: true });
    fs.appendFileSync(
      logPath,
      `${new Date().toISOString()} [${scope}] ${JSON.stringify(meta)}\n`,
    );
  } catch {
    // Best-effort; never crash the caller.
  }
};
