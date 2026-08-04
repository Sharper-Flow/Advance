/**
 * adv_resume_projection tool adapter tests.
 *
 * Pins: pure-read behavior, active-first loading without broad history scans,
 * bounded parallel hydration of non-terminal changes, bounded resolution of
 * only referenced terminal dependencies, graceful degradation, and cross-Epic
 * redirect preservation.
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase E
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import type { Store } from "../storage/store";
import type { Change } from "../types";
import { resumeProjectionTools } from "./resume-projection";

const PID = "test-project";

function changeSummary(
  id: string,
  status: "draft" | "archived" | "closed" = "draft",
  opts: Partial<{
    title: string;
    lifecycleState: "open" | "archived" | "closed";
    epic_membership: NonNullable<Change["epic_membership"]>;
    same_project_dependencies: Change["same_project_dependencies"];
  }> = {},
) {
  return {
    id,
    title: opts.title ?? id,
    status,
    currentGate: "proposal",
    lifecycleState: opts.lifecycleState ?? "open",
    created_at: "2026-01-01T00:00:00Z",
    lastActivityAt: "2026-01-01T00:00:00Z",
    taskCount: 0,
    completedTasks: 0,
    epic_membership: opts.epic_membership,
    same_project_dependencies: opts.same_project_dependencies,
  };
}

function fullChange(
  id: string,
  status: "draft" | "archived" | "closed" = "draft",
  opts: Partial<{
    title: string;
    lifecycleState: "open" | "archived" | "closed";
    same_project_dependencies: Change["same_project_dependencies"];
    tasks: Change["tasks"];
    epic_membership: Change["epic_membership"];
  }> = {},
): Change {
  return {
    id,
    title: opts.title ?? id,
    status,
    lifecycleState: opts.lifecycleState ?? "open",
    created_at: "2026-01-01T00:00:00Z",
    tasks: opts.tasks ?? [],
    deltas: {},
    same_project_dependencies: opts.same_project_dependencies ?? [],
    epic_membership: opts.epic_membership,
  } as Change;
}

function createMockStore(
  overrides: Partial<{
    changesList: ReturnType<typeof changeSummary>[];
    changesGet: Record<string, Change>;
    getImpl: (id: string) => Promise<{ success: boolean; data: Change | null }>;
    epicsList: { id: string; title: string; entries?: unknown[] }[];
  }> = {},
): Store {
  const getImpl =
    overrides.getImpl ??
    (async (id: string) => {
      const data = overrides.changesGet?.[id] ?? null;
      return { success: Boolean(data), data };
    });

  return {
    paths: {
      root: "/tmp/test-project",
      changes: "/tmp/test-project/.adv/changes",
      external: "/tmp/test-project",
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      list: vi.fn(async () => ({
        changes: overrides.changesList ?? [],
      })),
      get: vi.fn(getImpl),
    } as unknown as Store["changes"],
    tasks: {
      show: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      ready: vi.fn(),
      update: vi.fn(),
      add: vi.fn(),
      cancel: vi.fn(),
      reclassifyTdd: vi.fn(),
    } as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    epics: {
      list: vi.fn(async () => overrides.epicsList ?? []),
    } as Store["epics"],
    status: vi.fn(),
  } as unknown as Store;
}

async function execute(
  store: Store,
  args: { epic_ids?: string[]; include_diagnostics?: boolean } = {},
) {
  const raw = await resumeProjectionTools.adv_resume_projection.execute(
    args,
    store,
  );
  return JSON.parse(raw as string);
}

describe("adv_resume_projection tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("empty store → well-formed empty projection", async () => {
    const store = createMockStore();
    const result = await execute(store);
    expect(result.ordered_next).toBeNull();
    expect(result.actionable).toEqual([]);
    expect(result.blocked).toEqual([]);
    expect(result.active).toEqual([]);
    expect(result.redirects).toEqual([]);
    expect(result.diagnostics.cycles).toEqual([]);
    expect(result.diagnostics.unresolved_refs).toEqual([]);
  });

  test("ordinary call does not scan archived/closed history", async () => {
    const store = createMockStore({
      changesList: [changeSummary("ready")],
      changesGet: { ready: fullChange("ready") },
    });
    await execute(store);
    expect(store.changes.list).toHaveBeenCalledTimes(1);
    const callArgs = (store.changes.list as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(callArgs?.includeArchived).toBeFalsy();
    expect(callArgs?.includeClosed).toBeFalsy();
  });

  test("terminal changes are not loaded unless referenced as dependencies", async () => {
    const store = createMockStore({
      changesList: [changeSummary("ready")],
      changesGet: {
        ready: fullChange("ready"),
        "done-a": fullChange("done-a", "archived", {
          lifecycleState: "archived",
        }),
      },
    });
    const result = await execute(store);
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].node.change_id).toBe("ready");
    expect(store.changes.get).not.toHaveBeenCalledWith("done-a");
  });

  test("only referenced terminal dependencies are fetched", async () => {
    const store = createMockStore({
      changesList: [
        changeSummary("dependent", "draft", {
          same_project_dependencies: [
            { kind: "change", project_id: PID, change_id: "prereq" },
          ],
        }),
      ],
      changesGet: {
        dependent: fullChange("dependent", "draft", {
          same_project_dependencies: [
            { kind: "change", project_id: PID, change_id: "prereq" },
          ],
        }),
        prereq: fullChange("prereq", "archived", {
          lifecycleState: "archived",
        }),
        unrelated: fullChange("unrelated", "archived", {
          lifecycleState: "archived",
        }),
      },
    });

    const result = await execute(store);
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].node.change_id).toBe("dependent");
    expect(store.changes.get).toHaveBeenCalledWith("prereq");
    expect(store.changes.get).not.toHaveBeenCalledWith("unrelated");
  });

  test("non-terminal changes are hydrated and classified", async () => {
    const store = createMockStore({
      changesList: [
        changeSummary("ready"),
        changeSummary("blocked"),
        changeSummary("active"),
      ],
      changesGet: {
        ready: fullChange("ready"),
        blocked: fullChange("blocked", "draft", {
          same_project_dependencies: [
            { kind: "change", project_id: PID, change_id: "ready" },
          ],
        }),
        active: fullChange("active", "draft", {
          tasks: [
            {
              id: "tk-1",
              status: "in_progress",
              title: "Do work",
              created_at: "2026-01-01T00:00:00Z",
            } as Change["tasks"][number],
          ],
        }),
      },
    });

    const result = await execute(store);
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].node.change_id).toBe("ready");
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].node.change_id).toBe("blocked");
    expect(result.active).toHaveLength(1);
    expect(result.active[0].node.change_id).toBe("active");
    // All three changes are unlinked. Under rq-epicAdvisoryRankReachability01
    // an unlinked change ranks from its own strongest signal, so work already
    // in progress resumes ahead of not-yet-started work. Before that
    // requirement every unlinked change tied at the old sentinel rank and this resolved by
    // array order, which was incidental rather than intended.
    expect(result.ordered_next?.node.change_id).toBe("active");
  });

  test("cross-Epic redirect is preserved after parallel hydration", async () => {
    const store = createMockStore({
      changesList: [
        changeSummary("blocker", "draft", {
          epic_membership: {
            epic_id: "epicB",
            entry_id: "en-b",
            order: 0,
          },
        }),
      ],
      changesGet: {
        blocker: fullChange("blocker", "draft", {
          epic_membership: {
            epic_id: "epicB",
            entry_id: "en-b",
            order: 0,
          },
        }),
      },
      epicsList: [
        {
          id: "epicA",
          title: "Epic A",
          entries: [
            {
              kind: "shell",
              entry_id: "sh-1",
              order: 0,
              title: "Dependent",
              blocked_by: [
                { kind: "change", project_id: PID, change_id: "blocker" },
              ],
            },
          ],
        },
        {
          id: "epicB",
          title: "Epic B",
          entries: [
            {
              kind: "change",
              entry_id: "en-b",
              order: 0,
              title: "Blocker",
              change_id: "blocker",
            },
          ],
        },
      ],
    });

    const result = await execute(store);
    expect(result.redirects).toHaveLength(1);
    expect(result.redirects[0]).toMatchObject({
      source_epic_id: "epicA",
      target_epic_id: "epicB",
      blocker_node: { kind: "change", project_id: PID, change_id: "blocker" },
      blocked_node: {
        kind: "epic_entry",
        epic_id: "epicA",
        entry_id: "sh-1",
      },
    });
  });

  test("terminal epic blocked_by refs are resolved when referenced", async () => {
    const store = createMockStore({
      changesList: [],
      changesGet: {
        "done-blocker": fullChange("done-blocker", "archived", {
          lifecycleState: "archived",
        }),
      },
      epicsList: [
        {
          id: "epicA",
          title: "Epic A",
          entries: [
            {
              kind: "shell",
              entry_id: "sh-1",
              order: 0,
              title: "Dependent shell",
              blocked_by: [
                { kind: "change", project_id: PID, change_id: "done-blocker" },
              ],
            },
          ],
        },
      ],
    });

    const result = await execute(store);
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].node).toEqual({
      kind: "epic_entry",
      epic_id: "epicA",
      entry_id: "sh-1",
    });
    expect(store.changes.get).toHaveBeenCalledWith("done-blocker");
  });

  test("graceful degradation when full get fails", async () => {
    const store = createMockStore({
      changesList: [changeSummary("fragile")],
      getImpl: async () => ({ success: false, data: null }),
    });

    const result = await execute(store);
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].node.change_id).toBe("fragile");
    expect(result.diagnostics.unresolved_refs).toEqual([]);
  });

  test("graceful degradation when full get throws", async () => {
    const store = createMockStore({
      changesList: [changeSummary("fragile")],
      getImpl: async () => {
        throw new Error("boom");
      },
    });

    const result = await execute(store);
    expect(result.actionable).toHaveLength(1);
    expect(result.actionable[0].node.change_id).toBe("fragile");
  });

  test("include_diagnostics=false clears diagnostics", async () => {
    const store = createMockStore({
      changesList: [
        changeSummary("a", "draft", {
          same_project_dependencies: [
            { kind: "change", project_id: PID, change_id: "ghost" },
          ],
        }),
      ],
      changesGet: {
        a: fullChange("a", "draft", {
          same_project_dependencies: [
            { kind: "change", project_id: PID, change_id: "ghost" },
          ],
        }),
      },
    });

    const result = await execute(store, { include_diagnostics: false });
    expect(result.diagnostics.cycles).toEqual([]);
    expect(result.diagnostics.unresolved_refs).toEqual([]);
  });

  test("hydration is bounded to RESUME_PROJECTION_GET_CONCURRENCY", async () => {
    const concurrencyLimit = 8;
    const changeCount = 24;
    const summaries = Array.from({ length: changeCount }, (_, i) =>
      changeSummary(`chg-${i}`),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    let completed = 0;
    const releaseQueue: Array<() => void> = [];

    const getImpl = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => {
        releaseQueue.push(resolve);
      });
      inFlight -= 1;
      completed += 1;
      return {
        success: true,
        data: fullChange("placeholder", "draft", {
          title: "Placeholder",
        }),
      };
    };

    const store = createMockStore({
      changesList: summaries,
      getImpl,
    });

    const execution = execute(store);

    // Let the bounded worker pool start all of its slots.
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Release all queued gets.
    while (releaseQueue.length > 0) {
      releaseQueue.shift()?.();
      // Yield so the pool can pick up the next batch.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const result = await execution;
    expect(result.actionable).toHaveLength(changeCount);
    expect(completed).toBe(changeCount);
    expect(maxInFlight).toBeLessThanOrEqual(concurrencyLimit);
  });
});
