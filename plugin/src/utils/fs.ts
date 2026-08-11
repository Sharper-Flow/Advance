/**
 * File System Utilities
 *
 * Shared atomic write and file locking primitives.
 * Used by json.ts and project-wisdom.ts.
 */

import { writeFile, mkdir, rename, unlink, readFile, open } from "fs/promises";
import { dirname } from "path";

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_LOCK_TIMEOUT_MS = 15000;
const LOCK_INITIAL_WAIT_MS = 25;
const LOCK_MAX_WAIT_MS = 500;
const STALE_LOCK_MS = 30000;

// =============================================================================
// Bounded Backoff Retry
// =============================================================================

export interface BoundedRetryOptions<T> {
  /** Returns a successful value to stop retrying, or a miss to backoff. */
  attempt: (attempt: number) => Promise<{ ok: true; value: T } | { ok: false }>;
  /** Total wall-clock budget in milliseconds. */
  budgetMs: number;
  /** Initial backoff base in milliseconds. */
  baseMs: number;
  /** Maximum backoff in milliseconds. */
  capMs: number;
  /**
   * Jitter strength (0 = none, 1 = full). Delay is computed as
   * `base * (0.5 + random() * jitter * 0.5)` so it always stays within
   * `[base * 0.5, base * (0.5 + jitter * 0.5)]`.
   */
  jitter?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface BoundedRetrySuccess<T> {
  ok: true;
  value: T;
  attempts: number;
  elapsedMs: number;
}

export interface BoundedRetryFailure {
  ok: false;
  attempts: number;
  elapsedMs: number;
}

export type BoundedRetryResult<T> =
  | BoundedRetrySuccess<T>
  | BoundedRetryFailure;

/**
 * Retry an attempt with bounded exponential backoff and jitter.
 *
 * The first attempt is made immediately; each miss sleeps before the next
 * attempt until the budget is exhausted. The final return value always
 * includes the number of attempts and elapsed time, so callers can surface
 * structured diagnostics instead of a bare failure.
 */
export async function boundedRetry<T>(
  options: BoundedRetryOptions<T>,
): Promise<BoundedRetryResult<T>> {
  const {
    attempt,
    budgetMs,
    baseMs,
    capMs,
    jitter = 1,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = options;
  const start = now();
  let attempts = 0;

  while (true) {
    attempts += 1;
    const result = await attempt(attempts);
    if (result.ok) {
      return {
        ok: true,
        value: result.value,
        attempts,
        elapsedMs: now() - start,
      };
    }

    const elapsed = now() - start;
    if (elapsed >= budgetMs) {
      return { ok: false, attempts, elapsedMs: elapsed };
    }

    const base = Math.min(capMs, baseMs * 2 ** (attempts - 1));
    const delay = Math.min(
      budgetMs - elapsed,
      base * (0.5 + random() * jitter * 0.5),
    );
    if (delay <= 0) {
      return { ok: false, attempts, elapsedMs: now() - start };
    }
    await sleep(delay);
  }
}

// =============================================================================
// Atomic Write
// =============================================================================

let tempCounter = 0;

/**
 * Atomically write a file by writing to a temp file first, then renaming.
 * This prevents corrupted files from interrupted writes.
 *
 * After the rename, the parent directory is fsynced so the directory entry
 * is durable on disk (POSIX crash-recovery semantics).
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${tempCounter++}`;

  try {
    await mkdir(dirname(filePath), { recursive: true });

    // Write data to temp file
    const handle = await open(tempPath, "w");
    try {
      await handle.writeFile(content, "utf-8");
      // Force data to be flushed to disk before rename
      // This prevents the "truncated file with NUL bytes" failure mode
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(tempPath, filePath);
    await syncDir(dirname(filePath));
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Open a directory and fsync it so newly-created or renamed entries inside
 * it are durable on disk. Required after atomic writes and directory creation
 * for crash-recoverable archive publication.
 */
export async function syncDir(dirPath: string): Promise<void> {
  const handle = await open(dirPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// =============================================================================
// File Locking
// =============================================================================

/**
 * Simple file lock using a .lock file.
 * Returns a release function, or throws on timeout.
 *
 * The lock file contains the PID and timestamp. Stale locks (>30s) are
 * automatically removed on the next acquire attempt.
 *
 * The wait is always bounded: `timeoutMs` defaults to `DEFAULT_LOCK_TIMEOUT_MS`
 * so a caller with no deadline can never wait indefinitely. Callers running
 * under an outer budget derive `timeoutMs` from what remains of it — see
 * `deriveLockBudgetMs` in `tool-budgets.ts`. Retry/backoff is owned by the
 * shared `boundedRetry` primitive above.
 */
export async function acquireFileLock(
  filePath: string,
  timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
): Promise<() => Promise<void>> {
  const lockPath = `${filePath}.lock`;
  const budgetMs = Math.max(0, timeoutMs);

  const result = await boundedRetry<() => Promise<void>>({
    budgetMs,
    baseMs: LOCK_INITIAL_WAIT_MS,
    capMs: LOCK_MAX_WAIT_MS,
    attempt: async () => {
      try {
        // Try to create lock file exclusively
        await writeFile(lockPath, `${process.pid}\n${Date.now()}`, {
          flag: "wx",
        });

        return {
          ok: true,
          value: async () => {
            try {
              await unlink(lockPath);
            } catch {
              // Ignore unlock errors
            }
          },
        };
      } catch (e) {
        const error = e as NodeJS.ErrnoException;
        if (error.code !== "EEXIST") throw error;

        // Lock exists, check if stale
        try {
          const content = await readFile(lockPath, "utf-8");
          const parts = content.split("\n");
          const pid = parseInt(parts[0] ?? "", 10);
          const timestamp = parseInt(parts[1] ?? "", 10);

          if (!isNaN(timestamp) && Date.now() - timestamp > STALE_LOCK_MS) {
            // Check if PID is still alive (signal 0 = existence check)
            let processAlive = false;
            if (!isNaN(pid) && pid > 0) {
              try {
                process.kill(pid, 0);
                processAlive = true;
              } catch {
                // Process is dead
              }
            }
            if (!processAlive) {
              // Stale lock from dead process, remove it. The shared retry
              // primitive owns the subsequent bounded retry and backoff.
              try {
                await unlink(lockPath);
              } catch {
                // Another process already removed it
              }
            }
          }
        } catch {
          // Can't read lock, try again
        }

        return { ok: false };
      }
    },
  });

  if (result.ok) return result.value;
  throw new Error(`Failed to acquire lock on ${filePath} after ${budgetMs}ms`);
}
