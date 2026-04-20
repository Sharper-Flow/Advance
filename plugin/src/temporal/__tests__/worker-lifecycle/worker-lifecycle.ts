/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { registerShutdownHandlers } from "../../../plugin-init";
import type { Store } from "../../../storage/store";
import { Worker } from "@temporalio/worker";

export async function sigtermTriggersBoundedFlush(input: {
  flushTimeoutMs: number;
}): Promise<{
  pass: boolean;
  flushTimeoutMs: number;
  flushCalls: number;
  closeCalls: number;
}> {
  let flushCalls = 0;
  let closeCalls = 0;

  const store = {
    flush: async () => {
      flushCalls++;
    },
    close: () => {
      closeCalls++;
    },
  };

  const handlers = registerShutdownHandlers(store as unknown as Store);
  const realSetTimeout = global.setTimeout;
  const realExit = process.exit;
  const realClearTimeout = global.clearTimeout;

  try {
    global.setTimeout = ((
      fn: Parameters<typeof setTimeout>[0],
      _ms?: number,
      ...args: Parameters<typeof setTimeout> extends [
        Parameters<typeof setTimeout>[0],
        number?,
        ...infer Rest,
      ]
        ? Rest
        : never
    ) =>
      realSetTimeout(
        fn,
        Math.min(input.flushTimeoutMs, 1),
        ...args,
      )) as typeof setTimeout;
    process.exit = ((_code?: number) =>
      undefined) as unknown as typeof process.exit;

    handlers.shutdownWithFlush();
    await Promise.resolve();
    await new Promise((resolve) => realSetTimeout(resolve, 2));

    return {
      pass: flushCalls === 1 && closeCalls >= 1,
      flushTimeoutMs: input.flushTimeoutMs,
      flushCalls,
      closeCalls,
    };
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
    process.exit = realExit;
    handlers.removeProcessListeners();
  }
}

export async function duplicateSignalIsIdempotent(): Promise<{
  pass: boolean;
  flushCalls: number;
  closeCalls: number;
}> {
  let flushCalls = 0;
  let closeCalls = 0;

  const store = {
    flush: async () => {
      flushCalls++;
      await Promise.resolve();
    },
    close: () => {
      closeCalls++;
    },
  };

  const handlers = registerShutdownHandlers(store as unknown as Store);
  const realExit = process.exit;
  try {
    process.exit = ((_code?: number) =>
      undefined) as unknown as typeof process.exit;

    handlers.shutdownWithFlush();
    handlers.shutdownWithFlush();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));

    return {
      pass: flushCalls === 1,
      flushCalls,
      closeCalls,
    };
  } finally {
    process.exit = realExit;
    handlers.removeProcessListeners();
  }
}

export async function restartDoesNotRedoCompletedActivities(input: {
  history: unknown;
  workflowsPath: string;
}): Promise<{ pass: boolean }> {
  await Worker.runReplayHistory(
    { workflowsPath: input.workflowsPath },
    input.history,
  );
  return { pass: true };
}
