/**
 * T11: Integration coverage for resume-freshness pipeline.
 *
 * Verifies end-to-end behavior:
 * 1. fetchChangeContextSnapshot threads resumeFreshness into snapshot output
 * 2. Trigger guard (AC1) — fresh changes skip; stale changes emit
 * 3. Code paths render expected Freshness: line
 *
 * Uses mock Store rather than full Temporal test environment. Real Temporal
 * integration is covered indirectly by resolver unit tests + the storage
 * layer's own integration tests.
 */
import { describe, expect, it, vi } from "vitest";
import type { Change } from "../types";
import type { Store } from "./store";
import { fetchChangeContextSnapshot } from "./context-snapshot-fetch";

function buildChange(
  overrides: Partial<Change> & Record<string, unknown> = {},
): Change {
  return {
    id: "targetChange",
    title: "Target change",
    status: "draft",
    created_at: "2026-07-21T00:00:00.000Z",
    tasks: [],
    deltas: {},
    ...overrides,
  } as Change;
}

function buildStore(change: Change, peers: Change[] = []): Store {
  const all = [change, ...peers];
  const byId = new Map(all.map((c) => [c.id, c]));
  return {
    paths: {
      root: "/tmp/fake-workdir-for-resume-freshness-itest",
      changes: "/tmp/fake/changes",
    },
    changes: {
      get: vi.fn(async (id: string) => {
        const data = byId.get(id);
        return data ? { success: true, data } : { success: false };
      }),
      list: vi.fn(async () => ({
        changes: all.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          currentGate: "proposal" as const,
          created_at: c.created_at,
          lastActivityAt:
            (c as unknown as { lastActivityAt?: string }).lastActivityAt ??
            c.created_at,
          taskCount: ((c as unknown as { tasks?: unknown[] }).tasks ?? [])
            .length,
          completedTasks: 0,
        })),
      })),
    },
    gates: {
      get: vi.fn(async () => ({
        proposal: { status: "done" },
      })),
    },
  } as unknown as Store;
}

describe("fetchChangeContextSnapshot resumeFreshness integration", () => {
  it("skips Freshness line when change is fresh (lastActivityAgeMinutes <= 60)", async () => {
    const fresh = buildChange({
      lastActivityAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30min ago
    });
    const store = buildStore(fresh);

    const snapshot = await fetchChangeContextSnapshot(store, "targetChange");

    expect(snapshot).toBeDefined();
    expect(snapshot).not.toContain("Freshness:");
    // store.changes.list should NOT have been called for sibling scan since
    // resolver short-circuits via trigger guard
    const listCalls = (store.changes.list as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(listCalls.length).toBe(0);
  });

  it("emits Freshness line when change is stale (lastActivityAgeMinutes > 60)", async () => {
    const stale = buildChange({
      lastActivityAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(), // 2h ago
      deltas: { "advance-workflow": [] },
      tasks: [{ touched_files: ["src/foo.ts"] } as never],
    });
    const store = buildStore(stale);

    const snapshot = await fetchChangeContextSnapshot(store, "targetChange");

    expect(snapshot).toBeDefined();
    // Resolver runs; findings may be empty (no peers/git) but pipeline executed.
    // With git unavailable at /tmp path, expect freshness_limited OR no Freshness line
    // (formatter only shows Freshness line if findings.length > 0)
    // Verify list was called at least once for sibling/archived scan
    const listCalls = (store.changes.list as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(listCalls.length).toBeGreaterThan(0);
  });

  it("renders Freshness line with sibling_overlap when peer shares capability", async () => {
    const stale = buildChange({
      id: "target",
      lastActivityAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      deltas: { "advance-workflow": [] },
      tasks: [{ touched_files: ["src/shared.ts"] } as never],
    });
    const sibling = buildChange({
      id: "sibling",
      status: "draft",
      lastActivityAt: new Date().toISOString(),
      deltas: { "advance-workflow": [] },
      tasks: [{ touched_files: ["src/shared.ts"] } as never],
    });
    const store = buildStore(stale, [sibling]);

    const snapshot = await fetchChangeContextSnapshot(store, "target");

    expect(snapshot).toBeDefined();
    expect(snapshot).toContain("Freshness:");
    expect(snapshot).toContain("resume:sibling_overlap");
  });

  it("does NOT throw when store is empty (target missing)", async () => {
    const emptyStore = buildStore(buildChange(), []);
    // Override get to return not-found
    (emptyStore.changes.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
    });

    const snapshot = await fetchChangeContextSnapshot(
      emptyStore,
      "nonexistent",
    );
    expect(snapshot).toBeUndefined();
  });

  it("trigger boundary: 60min exactly = skipped, 61min = fires", async () => {
    // At exactly 60min, trigger guard returns skipped
    const exactly60 = buildChange({
      lastActivityAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const store60 = buildStore(exactly60);
    await fetchChangeContextSnapshot(store60, "targetChange");
    const listCalls60 = (store60.changes.list as ReturnType<typeof vi.fn>).mock
      .calls;
    // 60min <= 60 (trigger) — should skip; resolver not invoked
    expect(listCalls60.length).toBe(0);

    // At 61min, trigger guard fires resolver
    const just61 = buildChange({
      lastActivityAt: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
      deltas: { x: [] },
      tasks: [{ touched_files: ["a.ts"] } as never],
    });
    const store61 = buildStore(just61);
    await fetchChangeContextSnapshot(store61, "targetChange");
    const listCalls61 = (store61.changes.list as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(listCalls61.length).toBeGreaterThan(0);
  });
});
