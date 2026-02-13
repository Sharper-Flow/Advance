/**
 * File System Utilities
 *
 * Shared atomic write and file locking primitives.
 * Used by json.ts, agenda.ts, and project-wisdom.ts.
 */

import { writeFile, mkdir, rename, unlink, readFile } from "fs/promises";
import { dirname } from "path";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 50;
const STALE_LOCK_MS = 30000;

// =============================================================================
// Atomic Write
// =============================================================================

/**
 * Atomically write a file by writing to a temp file first, then renaming.
 * This prevents corrupted files from interrupted writes.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, filePath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
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
 */
export async function acquireFileLock(
  filePath: string,
  timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
): Promise<() => Promise<void>> {
  const lockPath = `${filePath}.lock`;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Try to create lock file exclusively
      await writeFile(lockPath, `${process.pid}\n${Date.now()}`, {
        flag: "wx",
      });

      // Lock acquired
      return async () => {
        try {
          await unlink(lockPath);
        } catch {
          // Ignore unlock errors
        }
      };
    } catch (e) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === "EEXIST") {
        // Lock exists, check if stale
        try {
          const content = await readFile(lockPath, "utf-8");
          const parts = content.split("\n");
          const pid = parseInt(parts[0] ?? "", 10);
          const timestamp = parseInt(parts[1] ?? "", 10);

          if (isNaN(timestamp)) {
            // Malformed lock file — can't determine staleness, retry
          } else if (Date.now() - timestamp > STALE_LOCK_MS) {
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
              // Stale lock from dead process, remove it
              try {
                await unlink(lockPath);
              } catch {
                // Another process already removed it
              }
              continue;
            }
          }
        } catch {
          // Can't read lock, try again
        }

        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Failed to acquire lock on ${filePath} after ${timeoutMs}ms`);
}
