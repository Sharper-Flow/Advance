/**
 * Routine gate reads use the disk ReadStore projection, independent of
 * Temporal workflow health. Mutation confirmation remains covered separately.
 */
import { describe, expect, test, vi } from "vitest";
import { createGateOps } from "./gates";
import type { StoreDeps } from "./shared";
import type { Change } from "../../types";
import type { Store } from "../store-types";

function makeChange(changeId: string): Change {
  return {
    id: changeId,
    title: "t",
    status: "draft",
    gates: { discovery: { status: "done" } } as Change["gates"],
    tasks: [],
    deltas: {},
    validation: { status: "ok" },
    github_issues: [],
    lifecycleState: "open",
    created_at: "2026-01-01T00:00:00.000Z",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Change;
}

function makeDeps(change: Change | null = makeChange("c1")): StoreDeps {
  const getTemporalChange = vi.fn();

  return {
    input: {
      temporal: {
        client: {
          workflow: {
            getHandle: vi.fn(() => ({
              describe: vi.fn(async () => ({ searchAttributes: {} })),
            })),
          },
        },
      },
      projectId: "0000000000000000000000000000000000000000",
    } as unknown as StoreDeps["input"],
    legacy: {} as Store,
    changeCache: new Map(),
    changeOverlayCache: new Map(),
    memo: { invalidate: vi.fn() } as unknown as StoreDeps["memo"],
    taskChangeIndex: new Map(),
    buildSummary: vi.fn(),
    setCachedChange: vi.fn(),
    invalidateChange: vi.fn(),
    updateOverlay: vi.fn(),
    emitChangeSummarySignal: vi.fn(),
    persistStateToDisk: vi.fn(),
    persistStateToDiskDurable: vi.fn(async () => {}),
    persistAndRefreshDurable: vi.fn(async () => {}),
    dualWriteAfterMutation: vi.fn(async () => {}),
    getTemporalWorkflowClient: vi.fn(),
    resolveStateOrQuery: vi.fn(),
    indexTasksFromState: vi.fn(),
    resolveChangeId: vi.fn(),
    readChangeSnapshot: vi.fn(async () =>
      change
        ? {
            found: true as const,
            snapshot: change,
            stateRevision: 1,
            projectionRevision: 1,
            source: "disk" as const,
          }
        : {
            found: false as const,
            reason: "not_found" as const,
            source: "disk" as const,
          },
    ),
    getTemporalChange,
    listResolvedChanges: vi.fn(),
  } as unknown as StoreDeps;
}

describe("createGateOps.get — disk ReadStore", () => {
  test("returns projection gates without Temporal hydration", async () => {
    const deps = makeDeps();
    const ops = createGateOps(deps);
    const result = await ops.get("c1");
    expect(result).toMatchObject({ discovery: { status: "done" } });
    expect(deps.readChangeSnapshot).toHaveBeenCalledWith("c1");
    expect(deps.getTemporalChange).not.toHaveBeenCalled();
  });

  test("does not hydrate a missing projection", async () => {
    const deps = makeDeps(null);
    const ops = createGateOps(deps);
    const result = await ops.get("c1");
    expect(result).toBeNull();
    expect(deps.getTemporalChange).not.toHaveBeenCalled();
  });

  test("keeps the Temporal command primitive available for mutation confirmation", async () => {
    const deps = makeDeps();
    const ops = createGateOps(deps);
    expect(ops.complete).toBeTypeOf("function");
    expect(deps.getTemporalChange).not.toHaveBeenCalled();
  });
});
