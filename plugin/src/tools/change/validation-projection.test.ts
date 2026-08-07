/**
 * Bounded validation inventory projection (fixValidationInputTimeout, task 1).
 *
 * Verifies:
 *  1. `loadValidationInventory` returns a complete typed conflict inventory
 *     using capability data already present on the Store list row.
 *  2. No per-peer `store.changes.get` hydration is performed — one-pass only.
 *  3. Output entry order matches the stable input ordering by id.
 *  4. Store enumeration failure produces a blocked inventory.
 *  5. Store incomplete metadata (deadline/bound/warnings/hydrationStats) is
 *     propagated to non-conclusive state and blocks a clean conclusion.
 *  6. A peer without exposed capabilities marks the inventory degraded and
 *     blocks a clean conclusion, without triggering a second Store read.
 *  7. Late-settled list promises cannot mutate the returned inventory.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Store } from "../../storage/store-types";
import type { ChangeListResponse } from "../../types";
import { createReadDeadline } from "./validation-projection";
import { loadValidationInventory } from "./validation-projection";

interface MockPeer {
  id: string;
  title: string;
  status: string;
  capabilities?: string[];
  epic_membership?: { epic_id: string; title: string; entry_id: string };
}

function createMockStore(
  peers: MockPeer[],
  options: {
    listError?: Error;
    listDelayMs?: number;
    listWarnings?: ChangeListResponse["warnings"];
    listHydrationStats?: ChangeListResponse["hydrationStats"];
  } = {},
): Store & { getCallCount: () => number; listCallCount: () => number } {
  let getCalls = 0;
  let listCalls = 0;

  const changes = {
    list: vi.fn(async () => {
      listCalls++;
      if (options.listError) throw options.listError;
      if (options.listDelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.listDelayMs),
        );
      }
      return {
        changes: peers.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          currentGate: "proposal" as const,
          lifecycleState: "open" as const,
          created_at: "2026-01-01T00:00:00Z",
          lastActivityAt: "2026-01-01T00:00:00Z",
          taskCount: 0,
          completedTasks: 0,
          capabilities: p.capabilities,
          epic_membership: p.epic_membership,
        })),
        ...(options.listWarnings ? { warnings: options.listWarnings } : {}),
        ...(options.listHydrationStats
          ? { hydrationStats: options.listHydrationStats }
          : {}),
      };
    }),
    get: vi.fn(async (id: string) => {
      getCalls++;
      return { success: false, error: `unexpected get: ${id}` };
    }),
    create: vi.fn(),
    save: vi.fn(),
    close: vi.fn(),
    closeBatch: vi.fn(),
    refresh: vi.fn(),
  };

  const store = {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
      archive: "/tmp/test/.adv/archive",
    },
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {
      list: vi.fn(async () => ({ specs: [] })),
      get: vi.fn(async () => ({ success: true, data: null })),
      search: vi.fn(async () => []),
      save: vi.fn(),
    },
    changes,
    tasks: { ready: vi.fn(async () => ({ ready: [], blocked: [] })) },
    wisdom: {},
    gates: { get: vi.fn(), complete: vi.fn(), reopenFrom: vi.fn() },
    status: vi.fn(),
    epics: {},
  } as unknown as Store & {
    getCallCount: () => number;
    listCallCount: () => number;
  };

  store.getCallCount = () => getCalls;
  store.listCallCount = () => listCalls;

  return store;
}

describe("loadValidationInventory", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns complete inventory from one-pass list capabilities", async () => {
    const peers: MockPeer[] = [
      {
        id: "own-change",
        title: "Own Change",
        status: "active",
        capabilities: ["cap-own"],
      },
      {
        id: "peer-a",
        title: "Peer A",
        status: "active",
        capabilities: ["cap-a"],
      },
      {
        id: "peer-b",
        title: "Peer B",
        status: "active",
        capabilities: ["cap-b"],
      },
    ];
    const store = createMockStore(peers);

    const inventory = await loadValidationInventory(store, "own-change");

    expect(inventory.completeness).toBe("complete");
    expect(inventory.canConcludeClean).toBe(true);
    expect(inventory.warnings).toHaveLength(0);
    expect(inventory.entries).toHaveLength(3);
    expect(store.listCallCount()).toBe(1);
    expect(store.changes.list).toHaveBeenCalledWith({
      includeArchived: true,
      includeClosed: true,
      validationConcurrency: 4,
    });
    expect(store.getCallCount()).toBe(0);
    const ownEntry = inventory.entries.find((e) => e.isOwnChange);
    expect(ownEntry?.id).toBe("own-change");
    const activePeers = inventory.entries.filter(
      (e) => !e.isOwnChange && !e.isArchived,
    );
    expect(activePeers[0].capabilities).toEqual(["cap-a"]);
    expect(activePeers[1].capabilities).toEqual(["cap-b"]);
  });

  test("preserves stable input ordering by id", async () => {
    const peers: MockPeer[] = [
      { id: "own-change", title: "Own Change", status: "active" },
      { id: "zebra", title: "Zebra", status: "active" },
      { id: "alpha", title: "Alpha", status: "active" },
      { id: "mike", title: "Mike", status: "active" },
    ];
    const store = createMockStore(peers);

    const inventory = await loadValidationInventory(store, "own-change");

    const ids = inventory.entries.map((e) => e.id);
    expect(ids).toEqual(["alpha", "mike", "own-change", "zebra"]);
    expect(store.getCallCount()).toBe(0);
  });

  test("marks blocked inventory when store enumeration fails", async () => {
    const store = createMockStore([], {
      listError: new Error("Temporal visibility unavailable"),
    });

    const inventory = await loadValidationInventory(store, "own-change");

    expect(inventory.completeness).toBe("blocked");
    expect(inventory.canConcludeClean).toBe(false);
    expect(inventory.warnings.some((w) => w.includes("unreachable"))).toBe(
      true,
    );
    expect(inventory.entries).toHaveLength(0);
  });

  test("marks non-conclusive when Store list reports deadline exceeded", async () => {
    const peers: MockPeer[] = [
      {
        id: "peer-a",
        title: "Peer A",
        status: "active",
        capabilities: ["cap-a"],
      },
    ];
    const store = createMockStore(peers, {
      listHydrationStats: { deadlineExceeded: true },
    });

    const inventory = await loadValidationInventory(store, "own-change");

    expect(inventory.completeness).toBe("non-conclusive");
    expect(inventory.canConcludeClean).toBe(false);
    expect(
      inventory.warnings.some(
        (w) => w.includes("incomplete") || w.includes("deadline"),
      ),
    ).toBe(true);
    expect(store.getCallCount()).toBe(0);
  });

  test("marks non-conclusive when Store list reports bounded omissions", async () => {
    const peers: MockPeer[] = [
      {
        id: "peer-a",
        title: "Peer A",
        status: "active",
        capabilities: ["cap-a"],
      },
    ];
    const store = createMockStore(peers, {
      listHydrationStats: { boundedOmitted: 3 },
    });

    const inventory = await loadValidationInventory(store, "own-change");

    expect(inventory.completeness).toBe("non-conclusive");
    expect(inventory.canConcludeClean).toBe(false);
    expect(store.getCallCount()).toBe(0);
  });

  test("marks non-conclusive when Store list carries source-deadline warning", async () => {
    const peers: MockPeer[] = [
      {
        id: "peer-a",
        title: "Peer A",
        status: "active",
        capabilities: ["cap-a"],
      },
    ];
    const store = createMockStore(peers, {
      listWarnings: [
        {
          code: "SOURCE_DEADLINE_EXCEEDED" as const,
          source: "workflow_query",
          message: "deadline exceeded",
        },
      ],
    });

    const inventory = await loadValidationInventory(store, "own-change");

    expect(inventory.completeness).toBe("non-conclusive");
    expect(inventory.canConcludeClean).toBe(false);
    expect(store.getCallCount()).toBe(0);
  });

  test("keeps complete inventory when active peer has empty capabilities array", async () => {
    const peers: MockPeer[] = [
      {
        id: "peer-a",
        title: "Peer A",
        status: "active",
        capabilities: ["cap-a"],
      },
      {
        id: "peer-empty",
        title: "Peer Empty",
        status: "active",
        capabilities: [],
      },
    ];
    const store = createMockStore(peers);

    const inventory = await loadValidationInventory(store, "own-change");

    expect(inventory.completeness).toBe("complete");
    expect(inventory.canConcludeClean).toBe(true);
    expect(inventory.warnings).toHaveLength(0);
    expect(store.getCallCount()).toBe(0);
    const emptyPeer = inventory.entries.find((e) => e.id === "peer-empty");
    expect(emptyPeer?.capabilities).toEqual([]);
  });

  test("marks degraded when active peer has omitted capabilities", async () => {
    const peers: MockPeer[] = [
      {
        id: "peer-a",
        title: "Peer A",
        status: "active",
        capabilities: ["cap-a"],
      },
      {
        id: "peer-bad",
        title: "Peer Bad",
        status: "active",
      },
    ];
    const store = createMockStore(peers);

    const inventory = await loadValidationInventory(store, "own-change");

    expect(inventory.completeness).toBe("degraded");
    expect(inventory.canConcludeClean).toBe(false);
    expect(inventory.warnings.some((w) => w.includes("peer-bad"))).toBe(true);
    // No fallback read attempted.
    expect(store.getCallCount()).toBe(0);
    const goodPeer = inventory.entries.find((e) => e.id === "peer-a");
    expect(goodPeer?.capabilities).toEqual(["cap-a"]);
    const badPeer = inventory.entries.find((e) => e.id === "peer-bad");
    expect(badPeer?.capabilities).toBeUndefined();
  });

  test("deadline expiry during enumeration produces blocked inventory", async () => {
    vi.useFakeTimers();
    const store = createMockStore([], { listDelayMs: 200 });
    const deadline = createReadDeadline(100);

    const pending = loadValidationInventory(store, "own-change", { deadline });
    await vi.advanceTimersByTimeAsync(150);
    const inventory = await pending;

    expect(inventory.completeness).toBe("blocked");
    expect(inventory.canConcludeClean).toBe(false);
    expect(store.getCallCount()).toBe(0);
  });

  test("late-settled list promise cannot mutate the returned inventory", async () => {
    vi.useFakeTimers();
    const peers: MockPeer[] = [
      {
        id: "peer-a",
        title: "Peer A",
        status: "active",
        capabilities: ["cap-a"],
      },
    ];
    const store = createMockStore(peers, { listDelayMs: 500 });
    const deadline = createReadDeadline(50);

    const pending = loadValidationInventory(store, "own-change", { deadline });
    await vi.advanceTimersByTimeAsync(100);
    const inventory = await pending;

    expect(inventory.completeness).toBe("blocked");
    expect(inventory.entries).toHaveLength(0);
    expect(inventory.canConcludeClean).toBe(false);

    // Advance further to let the late list promise settle; result must not change.
    await vi.advanceTimersByTimeAsync(1000);
    expect(inventory.entries).toHaveLength(0);
  });

  test("legacy list path exposes stable authorityDiagnostics with unestablished counts", async () => {
    const peers: MockPeer[] = [
      {
        id: "peer-a",
        title: "Peer A",
        status: "active",
        capabilities: ["cap-a"],
      },
    ];
    const store = createMockStore(peers);

    const inventory = await loadValidationInventory(store, "own-change");

    expect(inventory.authorityDiagnostics).toMatchObject({
      source: "disk-change-list",
      activeCandidateCount: 1,
      omittedCount: 0,
      shadowCount: null,
    });
    expect(typeof inventory.authorityDiagnostics!.elapsedMs).toBe("number");
  });

  test("blocked legacy list exposes stable authorityDiagnostics with null counts", async () => {
    const store = createMockStore([], {
      listError: new Error("Temporal visibility unavailable"),
    });

    const inventory = await loadValidationInventory(store, "own-change");

    expect(inventory.completeness).toBe("blocked");
    expect(inventory.authorityDiagnostics).toMatchObject({
      source: "disk-change-list",
      activeCandidateCount: null,
      omittedCount: null,
      shadowCount: null,
    });
    expect(typeof inventory.authorityDiagnostics!.elapsedMs).toBe("number");
  });
});
