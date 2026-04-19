/**
 * Bounded corruption-recovery retry for the SQLite-backed store.
 *
 * The store keeps JSON as source of truth and SQLite as a derived
 * cache. When the sqlite handle reports corruption at startup the
 * cache is rebuildable from JSON, but a single-shot delete+reopen
 * was prone to false failures under transient filesystem contention
 * (Windows / NFS / concurrent worktrees).
 *
 * This module owns the bounded retry loop and the corruption-error
 * heuristic so `store.ts` can stay lean.
 */

import { createLogger } from "../utils/debug-log";

const logger = createLogger("store");

/**
 * Injected recovery policy. Pure, side-effect-free signature so the
 * loop itself can be exercised by unit tests without filesystems or
 * sqlite.
 */
export interface RecoverOptions {
  maxAttempts: number;
  backoffMs: number;
  /**
   * Remove the corrupted DB artifacts so the next `attempt` can start
   * from a clean slate.
   */
  reset: () => Promise<void>;
  /**
   * Try to re-open + re-init the database. Should throw on continued
   * corruption; the loop will catch and retry up to `maxAttempts`.
   */
  attempt: () => Promise<void>;
  /**
   * Optional log sink. Defaults to the shared `store`-scoped logger.
   */
  log?: (msg: string) => void;
}

/**
 * Bounded corruption-recovery retry loop.
 *
 * Behavior:
 *   - Runs at most `maxAttempts` cycles of `reset` → `attempt`.
 *   - Backs off `backoffMs` BETWEEN attempts (not after the last).
 *   - Logs each attempt (1-indexed) with the attempt number and error.
 *   - Rethrows the last error after exhausting retries.
 */
export async function recoverCorruptedDatabase(
  opts: RecoverOptions,
): Promise<void> {
  const log = opts.log ?? ((m: string) => logger.warn(m));
  let lastError: Error | undefined;
  for (let i = 1; i <= opts.maxAttempts; i++) {
    try {
      await opts.reset();
      await opts.attempt();
      return;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      log(
        `Database recovery attempt ${i}/${opts.maxAttempts} failed: ${lastError.message}`,
      );
      if (i < opts.maxAttempts) {
        await new Promise((r) => setTimeout(r, opts.backoffMs));
      }
    }
  }
  throw lastError;
}

export const isCorruptionError = (error: Error): boolean =>
  error.message.includes("corrupted") ||
  error.message.includes("malformed") ||
  error.message.includes("corrupt");
