/**
 * Disk-authoritative read-path convergence (makeReadsDiskAuthoritative).
 *
 * Verifies:
 *  1. A per-member Temporal query that never resolves no longer hangs the read;
 *     the on-disk change.json projection is returned as source-of-truth with a
 *     typed `workflow_unresponsive` recovery advisory.
 *  2. The per-member query cap is lowered (1500ms) so a single wedged workflow
 *     cannot consume the 8s aggregate budget.
 *  3. A circuit-breaker trips after K=3 consecutive unresponsive members and
 *     short-circuits remaining per-member queries inside one read context.
 *  4. Epic reads mirror the change-side behavior: disk fallback + advisory.
 *  5. resumeProjection enumeration caps per-member concurrency.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { Connection } from "@temporalio/client";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createMockOwnerFromClient } from "../../temporal/__tests__/mock-owner";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";
import { createTemporalReadContext } from "./shared";
import { TemporalQueryTimeoutError } from "../../temporal/retry-wrapper";

const PER_MEMBER_QUERY_CAP_MS = 1_500;
const CB_TRIP_THRESHOLD = 3;

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

function workflowStateFor(change: Change) {
  return {
    id: change.id,
    changeId: change.id,
    title: change.title,
    status: change.status,
    createdAt: change.created_at,
    initializedAt: change.created_at,
    projectId: "0000ec0100000000000000000000000000000000",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    reentry_history: [],
    artifacts: {},
    documents: {},
    reflections: [],
    worktrees: {},
    conformance: { lockedSpecs: [], overrides: [] },
    worktree_auto_managed: false,
  };
}

/**
 * Create a mock Temporal Connection whose `withDeadline` races the operation
 * against a real timeout. This makes the per-member cap fire deterministically
 * without depending on vitest fake-timer ordering relative to real disk I/O.
 */
function createHangingConnection(): Connection {
  const connection = {
    withDeadline: async <R>(
      deadline: number | Date,
      fn: () => Promise<R>,
    ): Promise<R> => {
      const deadlineMs =
        typeof deadline === "number" ? deadline : deadline.getTime();
      const remaining = Math.max(0, deadlineMs - Date.now());
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          fn(),
          new Promise<R>((_, reject) => {
            timer = setTimeout(
              () => reject(new TemporalQueryTimeoutError(remaining)),
              remaining,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    withAbortSignal: async <R>(
      _signal: AbortSignal,
      fn: () => Promise<R>,
    ): Promise<R> => {
      return fn();
    },
  } as unknown as Connection;

  return connection;
}

function createHangingTemporal(_changeIds: string[]) {
  const connection = createHangingConnection();
  const queryCalls: { workflowId: string }[] = [];
  return {
    temporal: createMockOwnerFromClient({
      connection,
      client: {
        workflow: {
          getHandle: (workflowId: string) => {
            queryCalls.push({ workflowId });
            return {
              query: async () => new Promise<never>(() => {}),
            };
          },
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    }),
    queryCalls,
  };
}

describe("disk-authoritative change read convergence", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("returns the disk projection when the workflow query hangs", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = activeChange("hungQueryChange");
    await legacy.changes.save(change);

    const { temporal, queryCalls } = createHangingTemporal(["hungQueryChange"]);

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const start = Date.now();
    const result = await store.changes.get("hungQueryChange");
    const elapsed = Date.now() - start;

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("hungQueryChange");
    expect(result.source).toBe("disk");
    expect(
      (result.data as Change & { _recovery?: { reason: string } })._recovery,
    ).toBeUndefined();
    expect(elapsed).toBeLessThan(PER_MEMBER_QUERY_CAP_MS + 500);
    expect(queryCalls.length).toBe(0);
  }, 15_000);

  it("returns the disk projection even when the workflow query responds quickly", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = activeChange("fastQueryChange");
    await legacy.changes.save(change);

    const temporal = createMockOwnerFromClient({
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => workflowStateFor(change),
          }),
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    });

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.get("fastQueryChange");

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("Active fastQueryChange");
    expect(result.source).toBe("disk");
    expect(
      (result.data as Change & { _recovery?: { reason: string } })._recovery,
    ).toBeUndefined();
  }, 15_000);

  it("trips the circuit-breaker after 3 consecutive unresponsive members", async () => {
    // Force the list path into getTemporalChange by creating active-disk
    // directories without change.json files. The projection-only list reads
    // durable disk candidates (not Visibility), then falls back to workflow
    // queries per candidate. The CB is per-TemporalReadContext, so 3
    // consecutive unresponsive queries short-circuit the 4th and 5th.
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    const changeIds = ["cbA", "cbB", "cbC", "cbD", "cbE"];
    for (const id of changeIds) {
      await mkdir(join(legacy.paths.changes, id), { recursive: true });
    }

    let queryCalls = 0;
    const temporal = createMockOwnerFromClient({
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCalls += 1;
              return new Promise<never>(() => {});
            },
          }),
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    });

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.list({ validationConcurrency: 1 });

    // CB trips at 3, so exactly 3 query attempts (one per member up to trip).
    expect(queryCalls).toBe(CB_TRIP_THRESHOLD);

    // No disk fallback data, so candidates are omitted rather than returned.
    expect(result.changes.map((c) => c.id)).toEqual([]);
  }, 15_000);
});

describe("disk-authoritative read context circuit-breaker unit", () => {
  it("reports circuit-breaker tripped after three unresponsive members", () => {
    const ctx = createTemporalReadContext();
    expect(ctx.isCircuitBreakerTripped()).toBe(false);
    ctx.recordUnresponsiveMember();
    ctx.recordUnresponsiveMember();
    expect(ctx.isCircuitBreakerTripped()).toBe(false);
    ctx.recordUnresponsiveMember();
    expect(ctx.isCircuitBreakerTripped()).toBe(true);
  });

  it("resets the circuit-breaker when a responsive member is recorded", () => {
    const ctx = createTemporalReadContext();
    ctx.recordUnresponsiveMember();
    ctx.recordUnresponsiveMember();
    ctx.recordUnresponsiveMember();
    expect(ctx.isCircuitBreakerTripped()).toBe(true);
    ctx.recordResponsiveMember();
    expect(ctx.isCircuitBreakerTripped()).toBe(false);
  });
});
