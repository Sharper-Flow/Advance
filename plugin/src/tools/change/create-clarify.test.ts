/**
 * Validation input loading (fixValidationInputTimeout, task 2).
 *
 * Verifies:
 *  1. `loadValidationContext` starts projection, specs, proposal, and Git
 *     context concurrently under one shared deadline.
 *  2. Spec hydration is bounded to max concurrency 4 and preserves order.
 *  3. The old per-peer `store.changes.get` hydration loop is removed; no peer
 *     change gets are issued.
 *  4. The returned snapshot is deep-frozen so late-settled work cannot mutate it.
 *  5. Deadline expiry forces canConcludeClean false.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import type { Store } from "../../storage/store-types";
import type { ChangeListResponse, SpecListResponse } from "../../types";
import { createReadDeadline } from "./validation-projection";
import {
  loadValidationContext,
  checkActiveDuplicateChange,
} from "./create-clarify";
import type { Spec } from "../../types";

interface MockSpec {
  name: string;
  title: string;
}

interface MockPeer {
  id: string;
  title: string;
  status: string;
  capabilities?: string[];
}

function createMockStore(
  options: {
    specs?: MockSpec[];
    peers?: MockPeer[];
    proposalContent?: string;
    listDelayMs?: number;
    listError?: Error;
    specListDelayMs?: number;
    specGetDelayMs?: number;
  } = {},
): Store & {
  specListCallCount: () => number;
  specGetCalls: () => string[];
  maxSpecGetInFlight: () => number;
  listCallCount: () => number;
  peerGetCalls: () => string[];
  proposalGetCalls: () => number;
} {
  const {
    specs = [],
    peers = [],
    proposalContent,
    listDelayMs = 0,
    listError,
    specListDelayMs = 0,
    specGetDelayMs = 0,
  } = options;

  let specListCalls = 0;
  const specGetCalls: string[] = [];
  let specGetInFlight = 0;
  let maxSpecGetInFlight = 0;
  let listCalls = 0;
  const peerGetCalls: string[] = [];
  let proposalGetCalls = 0;

  const specByName = new Map(specs.map((s) => [s.name, s]));

  const changes = {
    list: vi.fn(async () => {
      listCalls++;
      if (listError) throw listError;
      if (listDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, listDelayMs));
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
        })),
      } as ChangeListResponse;
    }),
    get: vi.fn(async (id: string) => {
      if (id === "own-change") {
        proposalGetCalls++;
        if (proposalContent !== undefined) {
          return {
            success: true,
            data: {
              id: "own-change",
              title: "Own Change",
              status: "active",
              created_at: "2026-01-01T00:00:00Z",
              tasks: [],
              deltas: {},
              documents: { proposal: proposalContent },
            },
          };
        }
        return { success: true, data: null };
      }
      peerGetCalls.push(id);
      return { success: false, error: `unexpected peer get: ${id}` };
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
      list: vi.fn(async () => {
        specListCalls++;
        if (specListDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, specListDelayMs));
        }
        return {
          specs: specs.map((s) => ({
            name: s.name,
            title: s.title,
            version: "1.0.0",
            requirementCount: 0,
          })),
        } as SpecListResponse;
      }),
      get: vi.fn(async (name: string) => {
        specGetCalls.push(name);
        specGetInFlight++;
        maxSpecGetInFlight = Math.max(maxSpecGetInFlight, specGetInFlight);
        if (specGetDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, specGetDelayMs));
        }
        specGetInFlight--;
        const spec = specByName.get(name);
        if (!spec) return { success: false, error: `not found: ${name}` };
        return {
          success: true,
          data: {
            name: spec.name,
            title: spec.title,
            version: "1.0.0",
            requirements: [],
          } as Spec,
        };
      }),
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
    specListCallCount: () => number;
    specGetCalls: () => string[];
    maxSpecGetInFlight: () => number;
    listCallCount: () => number;
    peerGetCalls: () => string[];
    proposalGetCalls: () => number;
  };

  store.specListCallCount = () => specListCalls;
  store.specGetCalls = () => specGetCalls;
  store.maxSpecGetInFlight = () => maxSpecGetInFlight;
  store.listCallCount = () => listCalls;
  store.peerGetCalls = () => peerGetCalls;
  store.proposalGetCalls = () => proposalGetCalls;

  return store;
}

function withOwnChange(peers: MockPeer[]): MockPeer[] {
  return [
    { id: "own-change", title: "Own Change", status: "active" },
    ...peers,
  ];
}

describe("loadValidationContext", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("starts specs and inventory reads concurrently", async () => {
    vi.useFakeTimers();
    const store = createMockStore({
      specs: [{ name: "cap-a", title: "Cap A" }],
      peers: withOwnChange([
        {
          id: "peer-a",
          title: "Peer A",
          status: "active",
          capabilities: ["cap-a"],
        },
      ]),
      proposalContent: "# Proposal",
      specListDelayMs: 100,
      listDelayMs: 100,
    });

    const pending = loadValidationContext(store, "own-change", "Own Change");

    // Both independent reads should be scheduled immediately.
    expect(store.specListCallCount()).toBe(1);
    expect(store.listCallCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result.specs).toHaveLength(1);
    expect(result.specs[0].name).toBe("cap-a");
    expect(result.conflictInventory.entries).toHaveLength(2);
    expect(result.conflictInventory.completeness).toBe("complete");
  });

  test("loads proposal and Git context concurrently with other branches", async () => {
    vi.useFakeTimers();
    const store = createMockStore({
      specs: [{ name: "cap-a", title: "Cap A" }],
      peers: withOwnChange([]),
      proposalContent: "# Proposal",
      specListDelayMs: 50,
      specGetDelayMs: 50,
      listDelayMs: 50,
    });
    await mkdir("/tmp/test/.adv/changes/own-change", { recursive: true });
    await writeFile(
      "/tmp/test/.adv/changes/own-change/proposal.md",
      "# Proposal",
    );

    const pending = loadValidationContext(store, "own-change", "Own Change");

    // Proposal read now uses the disk artifact path; no peer or aggregate
    // change read is needed.
    expect(store.proposalGetCalls()).toBe(0);

    await vi.advanceTimersByTimeAsync(120);
    const result = await pending;

    expect(result.proposalText).toBe("# Proposal");
    expect(result.conflictInventory.completeness).toBe("complete");
  });

  test("bounds spec-get concurrency to 4", async () => {
    vi.useFakeTimers();
    const specs: MockSpec[] = Array.from({ length: 8 }, (_, i) => ({
      name: `cap-${i}`,
      title: `Cap ${i}`,
    }));
    const store = createMockStore({
      specs,
      specListDelayMs: 0,
      specGetDelayMs: 100,
    });

    const pending = loadValidationContext(store, "own-change", "Own Change");

    await vi.advanceTimersByTimeAsync(200);
    const result = await pending;

    expect(result.specs).toHaveLength(8);
    expect(store.specGetCalls()).toHaveLength(8);
    // Input order preserved.
    expect(result.specs.map((s) => s.name)).toEqual(specs.map((s) => s.name));
    // Maximum observed concurrency never exceeded 4.
    expect(store.maxSpecGetInFlight()).toBeLessThanOrEqual(4);
  });

  test("does not issue peer change.get calls for conflict inventory", async () => {
    const store = createMockStore({
      specs: [],
      peers: withOwnChange([
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
      ]),
    });

    const result = await loadValidationContext(
      store,
      "own-change",
      "Own Change",
    );

    expect(store.peerGetCalls()).toHaveLength(0);
    expect(result.conflictInventory.entries).toHaveLength(3);
    const activePeers = result.conflictInventory.entries.filter(
      (e) => !e.isArchived && !e.isOwnChange,
    );
    expect(activePeers).toHaveLength(2);
    expect(activePeers[0].capabilities).toEqual(["cap-a"]);
    expect(activePeers[1].capabilities).toEqual(["cap-b"]);
  });

  test("returns deep-frozen snapshot immune to late background work", async () => {
    vi.useFakeTimers();
    const store = createMockStore({
      specs: [],
      peers: withOwnChange([
        {
          id: "peer-a",
          title: "Peer A",
          status: "active",
          capabilities: ["cap-a"],
        },
      ]),
      listDelayMs: 500,
    });
    const deadline = createReadDeadline(50);

    const pending = loadValidationContext(store, "own-change", "Own Change", {
      deadline,
    });
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result.conflictInventory.completeness).toBe("blocked");
    expect(result.conflictInventory.entries).toHaveLength(0);
    expect(result.conflictInventory.canConcludeClean).toBe(false);
    expect(() => {
      (result as Record<string, unknown>).specs = [];
    }).toThrow();
    expect(() => {
      result.conflictInventory.entries.push({} as never);
    }).toThrow();

    // Advance further to let the late list promise settle; result must not change.
    await vi.advanceTimersByTimeAsync(1000);
    expect(result.conflictInventory.entries).toHaveLength(0);
  });

  test("deadline expiry during spec list forces canConcludeClean false", async () => {
    vi.useFakeTimers();
    const store = createMockStore({
      specs: [{ name: "cap-a", title: "Cap A" }],
      peers: withOwnChange([]),
      specListDelayMs: 500,
    });
    const deadline = createReadDeadline(50);

    const pending = loadValidationContext(store, "own-change", "Own Change", {
      deadline,
    });
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result.conflictInventory.canConcludeClean).toBe(false);
    expect(result.specs).toHaveLength(0);
  });

  test("deadline expiry during spec get forces canConcludeClean false", async () => {
    vi.useFakeTimers();
    const store = createMockStore({
      specs: [
        { name: "cap-a", title: "Cap A" },
        { name: "cap-b", title: "Cap B" },
      ],
      peers: withOwnChange([]),
      specGetDelayMs: 500,
    });
    const deadline = createReadDeadline(50);

    const pending = loadValidationContext(store, "own-change", "Own Change", {
      deadline,
    });
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result.conflictInventory.canConcludeClean).toBe(false);
    expect(result.specs).toHaveLength(0);
  });

  test("deadline expiry during projection produces blocked inventory", async () => {
    vi.useFakeTimers();
    const store = createMockStore({
      specs: [],
      peers: withOwnChange([]),
      listDelayMs: 500,
    });
    const deadline = createReadDeadline(50);

    const pending = loadValidationContext(store, "own-change", "Own Change", {
      deadline,
    });
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result.conflictInventory.completeness).toBe("blocked");
    expect(result.conflictInventory.canConcludeClean).toBe(false);
    expect(result.specs).toHaveLength(0);
  });
});

describe("checkActiveDuplicateChange disk handling", () => {
  test("returns undefined when no active duplicate exists", async () => {
    const store = createMockStore({ peers: [] });
    const result = await checkActiveDuplicateChange(store, "Add user auth", {
      projectId: "0000ec0100000000000000000000000000000000",
    });
    expect(result).toBeUndefined();
  });

  test("blocks duplicate when the existing workflow is healthy", async () => {
    const store = createMockStore({
      peers: [{ id: "addUserAuth", title: "Add user auth", status: "active" }],
    });
    const result = await checkActiveDuplicateChange(store, "Add user auth", {
      projectId: "0000ec0100000000000000000000000000000000",
    });
    expect(result).toBeDefined();
    expect(result?.code).toBe("DUPLICATE_ACTIVE_CHANGE");
    expect(result?.force_recreate).toBeUndefined();
  });
});
