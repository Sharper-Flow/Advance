import { readFile, unlink } from "node:fs/promises";
import { isProcessAlive } from "../utils/process-liveness";

export type WorkerLockProbe =
  | { status: "absent" }
  | { status: "live"; pid: number }
  | { status: "invalid"; reason: string }
  | { status: "removed"; pid: number };

/**
 * Remove a retired worker lock only after its recorded PID is proven dead.
 * Malformed and live locks remain untouched so this helper cannot steal a
 * current owner or turn uncertainty into a successful cleanup.
 */
export async function reclaimDeadWorkerLock(
  lockPath: string,
): Promise<WorkerLockProbe> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "absent" };
    }
    return {
      status: "invalid",
      reason: `worker.lock unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let pid: number;
  try {
    const parsed = JSON.parse(raw) as { pid?: unknown };
    if (
      typeof parsed.pid !== "number" ||
      !Number.isInteger(parsed.pid) ||
      parsed.pid <= 0
    ) {
      return { status: "invalid", reason: "worker.lock has no valid PID" };
    }
    pid = parsed.pid;
  } catch (error) {
    return {
      status: "invalid",
      reason: `worker.lock JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (isProcessAlive(pid)) return { status: "live", pid };

  try {
    await unlink(lockPath);
    return { status: "removed", pid };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "absent" };
    }
    return {
      status: "invalid",
      reason: `dead worker.lock cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
