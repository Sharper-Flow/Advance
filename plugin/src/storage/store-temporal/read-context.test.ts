import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Connection } from "@temporalio/client";
import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDiskStore } from "../store-disk";
import { rebuildSummaryIndex } from "../change-summary-shard";
import { createDefaultGates, type Change } from "../../types";
import { createTemporalStoreBackend } from "./index";
import {
  createTemporalReadContext,
  runTemporalRead,
  isTemporalReadExpired,
  abortTemporalRead,
} from "./read-context";
import { TemporalQueryTimeoutError } from "../../temporal/retry-wrapper";

type DeadlineCall = {
  deadline: number | Date;
  fn: () => Promise<unknown>;
};

type AbortCall = {
  signal: AbortSignal;
  fn: () => Promise<unknown>;
};

function abortError(): Error {
  const err = new Error("AbortError: signal aborted") as Error & {
    name: string;
  };
  err.name = "AbortError";
  return err;
}

function createMockConnection(onAbort?: () => void): {
  runWithDeadline: <R>(
    deadlineAt: number,
    signal: AbortSignal,
    fn: () => Promise<R>,
  ) => Promise<R>;
  connection: Connection;
  deadlineCalls: DeadlineCall[];
  abortCalls: AbortCall[];
} {
  const deadlineCalls: DeadlineCall[] = [];
  const abortCalls: AbortCall[] = [];
  const connection = {
    withDeadline: async <R>(
      deadline: number | Date,
      fn: () => Promise<R>,
    ): Promise<R> => {
      deadlineCalls.push({ deadline, fn });
      const deadlineMs =
        typeof deadline === "number" ? deadline : deadline.getTime();
      const now = Date.now();
      if (now >= deadlineMs) {
        throw new TemporalQueryTimeoutError(Math.max(0, deadlineMs - now));
      }
      const delay = deadlineMs - now;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          fn(),
          new Promise<R>((_, reject) => {
            timer = setTimeout(
              () => reject(new TemporalQueryTimeoutError(delay)),
              delay,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    withAbortSignal: async <R>(
      signal: AbortSignal,
      fn: () => Promise<R>,
    ): Promise<R> => {
      abortCalls.push({ signal, fn });
      if (signal.aborted) {
        throw abortError();
      }
      if (onAbort) {
        // Allow tests to abort synchronously after the call is recorded but
        // before the operation begins, so we can verify cancellation.
        onAbort();
      }
      if (signal.aborted) {
        throw abortError();
      }
      return fn();
    },
  } as unknown as Connection;
  const runWithDeadline = async <R>(
    deadlineAt: number,
    signal: AbortSignal,
    fn: () => Promise<R>,
  ): Promise<R> =>
    connection.withDeadline(deadlineAt, () =>
      connection.withAbortSignal(signal, fn),
    );
  return { runWithDeadline, connection, deadlineCalls, abortCalls };
}

function activeChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status: "active",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
  };
}

describe("Temporal read context", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates one absolute deadline and one AbortController per context", () => {
    const ctx = createTemporalReadContext(1_000);
    expect(ctx.deadline.deadlineAt).toBe(Date.now() + 1_000);
    expect(ctx.abortController).toBeInstanceOf(AbortController);
    expect(ctx.createdAt).toBe(Date.now());
  });

  it("is expired when the deadline passes or the signal is aborted", () => {
    const ctx = createTemporalReadContext(1_000);
    expect(isTemporalReadExpired(ctx)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(isTemporalReadExpired(ctx)).toBe(false);
    vi.advanceTimersByTime(501);
    expect(isTemporalReadExpired(ctx)).toBe(true);

    const ctx2 = createTemporalReadContext(1_000);
    abortTemporalRead(ctx2);
    expect(isTemporalReadExpired(ctx2)).toBe(true);
  });

  it("uses the same absolute deadline and abort signal across multiple read calls", async () => {
    const { runWithDeadline, deadlineCalls, abortCalls } =
      createMockConnection();
    const ctx = createTemporalReadContext(5_000);

    const op1 = vi.fn(async () => "first");
    const op2 = vi.fn(async () => "second");
    const op3 = vi.fn(async () => "third");

    const r1 = await runTemporalRead(runWithDeadline, op1, ctx, {
      timeoutMs: 2_000,
    });
    const r2 = await runTemporalRead(runWithDeadline, op2, ctx, {
      timeoutMs: 2_000,
    });
    const r3 = await runTemporalRead(runWithDeadline, op3, ctx, {
      timeoutMs: 2_000,
    });

    expect(r1.complete).toBe(true);
    expect(r2.complete).toBe(true);
    expect(r3.complete).toBe(true);
    expect(op1).toHaveBeenCalledTimes(1);
    expect(op2).toHaveBeenCalledTimes(1);
    expect(op3).toHaveBeenCalledTimes(1);

    expect(deadlineCalls).toHaveLength(3);
    expect(abortCalls).toHaveLength(3);

    const firstDeadline = deadlineCalls[0].deadline;
    const firstSignal = abortCalls[0].signal;
    for (const call of deadlineCalls) {
      expect(call.deadline).toBe(firstDeadline);
    }
    for (const call of abortCalls) {
      expect(call.signal).toBe(firstSignal);
    }
  });

  it("returns degraded and does not execute the op when aborted before the call", async () => {
    const { runWithDeadline, abortCalls } = createMockConnection();
    const ctx = createTemporalReadContext(5_000);
    abortTemporalRead(ctx);

    const op = vi.fn(async () => "should not run");
    const result = await runTemporalRead(runWithDeadline, op, ctx, {
      timeoutMs: 2_000,
    });

    expect(op).not.toHaveBeenCalled();
    expect(result.complete).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toBeInstanceOf(TemporalQueryTimeoutError);
    expect(result.metadata.diagnostics?.workflow.class).toBe("deadline");
    expect(abortCalls).toHaveLength(0);
  });

  it("returns degraded and does not retry after the aggregate deadline expires", async () => {
    const { runWithDeadline, deadlineCalls } = createMockConnection();
    const ctx = createTemporalReadContext(1_000);
    const op = vi.fn(() => new Promise<never>(() => {}));

    const promise = runTemporalRead(runWithDeadline, op, ctx, {
      timeoutMs: 5_000,
      maxAttempts: 5,
    });
    vi.advanceTimersByTime(1_001);
    const result = await promise;

    expect(result.complete).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toBeInstanceOf(TemporalQueryTimeoutError);
    // One attempt began, the SDK deadline fired, and no further attempt was
    // admitted because the aggregate budget was exhausted.
    expect(deadlineCalls).toHaveLength(1);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("cancels the in-flight RPC via the SDK abort signal and emits no retry", async () => {
    const ctx = createTemporalReadContext(5_000);
    let abortFired = false;
    const { runWithDeadline, abortCalls } = createMockConnection(() => {
      if (!abortFired) {
        abortFired = true;
        abortTemporalRead(ctx);
      }
    });

    const op = vi.fn(async () => "should not finish");
    const result = await runTemporalRead(runWithDeadline, op, ctx, {
      timeoutMs: 2_000,
      maxAttempts: 5,
    });

    expect(result.complete).toBe(false);
    expect(result.degraded).toBe(true);
    // The abort signal was recorded and prevented the RPC from proceeding.
    expect(abortCalls).toHaveLength(1);
    expect(op).not.toHaveBeenCalled();
  });

  it("returns complete metadata on a healthy RPC", async () => {
    const { runWithDeadline } = createMockConnection();
    const ctx = createTemporalReadContext(5_000);
    const op = vi.fn(async () => ({ ok: true }));

    const result = await runTemporalRead(runWithDeadline, op, ctx, {
      timeoutMs: 2_000,
    });

    expect(result.complete).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.data).toEqual({ ok: true });
    expect(result.metadata.complete).toBe(true);
    expect(result.metadata.degraded).toBe(false);
    expect(result.error).toBeUndefined();
  });
});

describe("Temporal read context — routine reads avoid Temporal enrichment", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  async function createStoreWithMockConnection(changeIds: string[]) {
    const legacy = await createDiskStore(tempDir);
    for (const id of changeIds) {
      await legacy.changes.save(activeChange(id));
    }
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const deadlineCalls: DeadlineCall[] = [];
    const abortCalls: AbortCall[] = [];
    const connection = {
      withDeadline: async <R>(
        deadline: number | Date,
        fn: () => Promise<R>,
      ): Promise<R> => {
        deadlineCalls.push({ deadline, fn });
        const deadlineMs =
          typeof deadline === "number" ? deadline : deadline.getTime();
        const now = Date.now();
        if (now >= deadlineMs) {
          throw new TemporalQueryTimeoutError(Math.max(0, deadlineMs - now));
        }
        const delay = deadlineMs - now;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            fn(),
            new Promise<R>((_, reject) => {
              timer = setTimeout(
                () => reject(new TemporalQueryTimeoutError(delay)),
                delay,
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      },
      withAbortSignal: async <R>(
        signal: AbortSignal,
        fn: () => Promise<R>,
      ): Promise<R> => {
        abortCalls.push({ signal, fn });
        if (signal.aborted) {
          throw abortError();
        }
        return fn();
      },
    } as unknown as Connection;

    const temporal = {
      connection,
      client: {
        workflow: {
          getHandle: () => {
            throw new Error(
              "routine read must not hydrate from workflow query",
            );
          },
          list: async () => {
            throw new Error(
              "routine read must not enumerate Temporal Visibility",
            );
          },
          start: async () => {
            throw new Error("routine read must not start a workflow");
          },
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal: temporal as unknown as { client: typeof temporal.client },
      projectId: "0000ec0100000000000000000000000000000000",
    });
    return { store, connection, deadlineCalls, abortCalls };
  }

  it("change.get returns the durable projection without any Temporal query", async () => {
    tempDir = await createTempDir();
    const { store, deadlineCalls, abortCalls } =
      await createStoreWithMockConnection(["change-a"]);

    const result = await store.changes.get("change-a");

    expect(result).toMatchObject({
      success: true,
      source: "disk",
      data: expect.objectContaining({ id: "change-a" }),
    });
    expect(deadlineCalls).toHaveLength(0);
    expect(abortCalls).toHaveLength(0);
  });

  it("gate.get returns gates from the durable projection without any Temporal query", async () => {
    tempDir = await createTempDir();
    const { store, deadlineCalls, abortCalls } =
      await createStoreWithMockConnection(["change-a"]);

    const result = await store.gates.get("change-a");

    expect(result).toEqual(createDefaultGates());
    expect(deadlineCalls).toHaveLength(0);
    expect(abortCalls).toHaveLength(0);
  });

  it("status serves bounded summary from durable shards without Temporal RPCs", async () => {
    tempDir = await createTempDir();
    const { store, deadlineCalls, abortCalls } =
      await createStoreWithMockConnection(["change-a", "change-b"]);

    const status = await store.status({ recentLimit: 10 });

    expect(status.changes.recent.map((r) => r.id).sort()).toEqual([
      "change-a",
      "change-b",
    ]);
    expect(deadlineCalls).toHaveLength(0);
    expect(abortCalls).toHaveLength(0);
  });

  it("status does not grant mutation authority from a degraded read", async () => {
    tempDir = await createTempDir();
    const { store, deadlineCalls, abortCalls } =
      await createStoreWithMockConnection(["change-a"]);

    const status = await store.status();

    // The status result is a read-only projection; no Temporal RPC or
    // mutation-side effect is invoked.
    expect(status.resolvedChanges?.size ?? 0).toBe(0);
    expect(deadlineCalls).toHaveLength(0);
    expect(abortCalls).toHaveLength(0);
  });
});
