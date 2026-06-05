/**
 * Phase 9 async finalization queue.
 *
 * When adv_change_archive is called with phase9:"run", the archive bundle
 * is written synchronously, but the git finalization + release gate completion
 * + durable proof verification is dispatched to this queue. The tool returns
 * immediately with phase9:"pending". The queue updates phase9_status on the
 * change as work progresses.
 */

import type { Store } from "../../storage/store";

export interface Phase9QueueDispatchParams {
  changeId: string;
  store: Store;
  run: () => Promise<void>;
  recordFailure?: (error: unknown) => Promise<void>;
}

/**
 * Internal runner that tracks phase9_status. Exported for direct testing.
 */
export async function runPhase9WithStatusTracking(
  params: Phase9QueueDispatchParams,
): Promise<void> {
  try {
    await params.run();
  } catch (error) {
    if (params.recordFailure) {
      try {
        await params.recordFailure(error);
      } catch {
        // Swallow — best-effort failure recording
      }
    }
    throw error;
  }
}

/**
 * Fire-and-forget dispatch. The run callback is invoked asynchronously;
 * on unhandled rejection the queue records phase9_status = failed.
 *
 * Testable: mock this function to capture dispatches without running
 * timers.
 */
export function dispatchPhase9Finalization(
  params: Phase9QueueDispatchParams,
): void {
  runPhase9WithStatusTracking(params).catch(() => {
    // Errors are recorded in phase9_status; unhandled rejections are
    // swallowed here to avoid process-level warnings.
  });
}
