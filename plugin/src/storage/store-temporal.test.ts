import { describe, expect, it, vi } from "vitest";
import { createTemporalStoreBackend } from "./store-temporal";
import type { Store } from "./store-types";

vi.mock("../utils/debug-log", () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  appendDebugLog: vi.fn(),
}));

/**
 * Creates a minimal project workflow handle mock for tests.
 * Returns empty PSW state with no change_summaries.
 */
function makeProjectHandle() {
  return {
    query: vi.fn(async (queryDef: any, ..._args: any[]) => {
      const name = queryDef?.name ?? queryDef;
      if (name === "adv.project.state") {
        return {
          projectId: "proj1",
          initializedAt: "2026-04-18T00:00:00.000Z",
          agenda: [],
          project_wisdom: [],
          migration_ledger: [],
          change_summaries: {},
          source_versions: {},
        };
      }
      return null;
    }),
    executeUpdate: vi.fn(async () => null),
    signal: vi.fn(async () => {}),
  };
}

/**
 * Route helper: returns projectHandle for project workflow IDs,
 * changeHandle otherwise.
 */
function routeHandle(changeHandle: any, projectHandle = makeProjectHandle()) {
  return vi.fn((workflowId: string) => {
    if (workflowId.startsWith("adv/project/")) return projectHandle;
    return changeHandle;
  });
}

function makeLegacyStore(): Store {
  return {
    paths: {} as any,
    config: null,
    init: vi.fn(async () => {}),
    sync: vi.fn(async () => {}),
    close: vi.fn(() => {}),
    flush: vi.fn(async () => {}),
    specs: {
      list: vi.fn(async () => ({ specs: [{ name: "legacy" }] }) as any),
      get: vi.fn(async () => ({ success: true, data: null })),
      search: vi.fn(async () => []),
      save: vi.fn(async () => {}),
    },
    changes: {
      list: vi.fn(async () => ({ changes: [] }) as any),
      get: vi.fn(async () => ({ success: true, data: null })),
      create: vi.fn(async () => ({ changeId: "x", path: "p" })),
      save: vi.fn(async () => {}),
      updateArtifacts: vi.fn(async () => ({ success: true }) as any),
      close: vi.fn(async () => null),
      closeBatch: vi.fn(async () => ({
        success: true,
        closed: 0,
        results: [],
        message: "",
      })),
    },
    tasks: {
      list: vi.fn(async () => []),
      ready: vi.fn(async () => ({ ready: [], blocked: [] })),
      update: vi.fn(async () => null),
      add: vi.fn(async () => ({ id: "tk-1" }) as any),
      get: vi.fn(async () => null),
      show: vi.fn(async () => null),
      recordEvidence: vi.fn(async () => null),
      setPhase: vi.fn(async () => null),
      cancel: vi.fn(async () => null),
      reclassifyTdd: vi.fn(async () => null),
    },
    wisdom: {
      add: vi.fn(async () => ({ id: "ws-1" }) as any),
      list: vi.fn(async () => []),
      search: vi.fn(async () => []),
      listAll: vi.fn(async () => []),
    },
    gates: {
      get: vi.fn(async () => null),
      complete: vi.fn(async () => {}),
      reopenFrom: vi.fn(async () => {}),
      migrate: vi.fn(async () => {}),
    },
    status: vi.fn(async () => ({ changes: { active: 0 } }) as any),
  } as unknown as Store;
}

describe("Temporal store backend adapter", () => {
  it("overrides temporal-backed namespaces while preserving legacy specs/create", async () => {
    const wisdomEntries: any[] = [];
    const changeHandle = {
      query: vi.fn(async (queryDef: any, ..._args: any[]) => {
        const name = queryDef?.name ?? queryDef;
        if (name === "adv.change.state") {
          return {
            projectId: "proj1",
            changeId: "chg1",
            title: "Change 1",
            initializedAt: "2026-04-18T00:00:00.000Z",
            id: "chg1",
            status: "draft",
            createdAt: "2026-04-18T00:00:00.000Z",
            tasks: [
              {
                id: "tk-1",
                title: "Task 1",
                status: "pending",
                priority: 0,
                created_at: "2026-04-18T00:00:00.000Z",
                tdd_phase: "none",
              },
            ],
            wisdom: wisdomEntries,
            gates: {
              proposal: { status: "pending" },
              discovery: { status: "pending" },
              design: { status: "pending" },
              planning: { status: "pending" },
              execution: { status: "pending" },
              acceptance: { status: "pending" },
              release: { status: "pending" },
            },
            reentry_history: [],
            artifacts: {},
          };
        }
        if (name === "adv.change.tasks") return [];
        if (name === "adv.change.ready") return [];
        if (name === "adv.project.state") {
          return {
            projectId: "proj1",
            initializedAt: "2026-04-18T00:00:00.000Z",
            agenda: [],
            project_wisdom: [],
            migration_ledger: [],
          };
        }
        return null;
      }),
      executeUpdate: vi.fn(async (_def: any, options?: { args?: any[] }) => {
        const args = options?.args ?? [];
        if (args[0] === "pattern" && args[1] === "keep it deterministic") {
          wisdomEntries.push({
            id: "ws-1",
            type: "pattern",
            content: "keep it deterministic",
            source_task: undefined,
            recorded_at: "2026-04-18T00:00:01.000Z",
          });
        }
        return null;
      }),
      signal: vi.fn(async () => {}),
    };

    const bundle = {
      client: {
        workflow: {
          getHandle: routeHandle(changeHandle),
        },
      },
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: {} as any,
    };

    const legacy = makeLegacyStore();
    const adapted = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    await adapted.changes.get("chg1");
    expect(changeHandle.query).toHaveBeenCalled();

    await adapted.tasks.list("chg1");
    expect(changeHandle.query).toHaveBeenCalled();

    await adapted.tasks.add("chg1", "new task");
    expect(changeHandle.executeUpdate).toHaveBeenCalled();

    await adapted.wisdom.add("chg1", "pattern", "keep it deterministic");
    expect(changeHandle.executeUpdate).toHaveBeenCalled();

    // untouched legacy surfaces still delegate to existing backend
    await adapted.specs.list();
    expect(legacy.specs.list).toHaveBeenCalled();
  });

  it("uses temporal truth for changes.list and status even when legacy list/status are stale", async () => {
    const changeHandle = {
      query: vi.fn(async (queryDef: any) => {
        const name = queryDef?.name ?? queryDef;
        if (name === "adv.change.state") {
          return {
            projectId: "proj1",
            changeId: "chg1",
            title: "Change 1",
            initializedAt: "2026-04-18T00:00:00.000Z",
            id: "chg1",
            status: "closed",
            createdAt: "2026-04-18T00:00:00.000Z",
            tasks: [
              {
                id: "tk-1",
                title: "Task 1",
                status: "pending",
                priority: 0,
                created_at: "2026-04-18T00:00:00.000Z",
                tdd_phase: "none",
              },
            ],
            wisdom: [],
            gates: {
              proposal: { status: "pending" },
              discovery: { status: "pending" },
              design: { status: "pending" },
              planning: { status: "pending" },
              execution: { status: "pending" },
              acceptance: { status: "pending" },
              release: { status: "pending" },
            },
            reentry_history: [],
            artifacts: {},
          };
        }
        return null;
      }),
      executeUpdate: vi.fn(async () => null),
      signal: vi.fn(async () => {}),
    };

    const bundle = {
      client: {
        workflow: {
          getHandle: routeHandle(changeHandle),
        },
      },
    };

    const legacy = makeLegacyStore();
    legacy.paths.changes = "/tmp/changes" as any;
    legacy.changes.list = vi.fn(
      async () =>
        ({
          changes: [
            {
              id: "chg1",
              title: "Change 1",
              status: "draft",
              taskCount: 1,
              completedTasks: 0,
            },
          ],
        }) as any,
    );
    legacy.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "chg1",
        title: "Change 1",
        status: "draft",
        created_at: "2026-04-18T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {
          proposal: { status: "pending" },
          discovery: { status: "pending" },
          design: { status: "pending" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
      },
    }));
    legacy.status = vi.fn(
      async () =>
        ({
          specs: { count: 1, capabilities: ["legacy"] },
          changes: {
            active: 1,
            byStatus: {
              draft: 1,
              pending: 0,
              active: 0,
              archived: 0,
              closed: 0,
            },
            recent: [
              {
                id: "chg1",
                title: "Change 1",
                status: "draft",
                completedTasks: 0,
                taskCount: 1,
                lastActivityAt: "2026-04-18T00:00:00.000Z",
                minutesSinceActivity: 5,
                recency: "hot",
              },
            ],
          },
          recommendations: [
            "[doctor] Pending WAL checkpoint: 1 bytes in WAL file (advisory — close other ADV sessions, rerun /adv-status, and restart OpenCode before archive only if it persists)",
            "Change `chg1`: next gate is `proposal` → run `/adv-proposal chg1`",
          ],
        }) as any,
    );

    const adapted = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    const { listChangeDirs } = await import("./json");
    const listSpy = vi
      .spyOn(await import("./json"), "listChangeDirs")
      .mockResolvedValue(["chg1"]);

    const listed = await adapted.changes.list({ includeClosed: true });
    expect(listed.changes).toEqual([
      {
        id: "chg1",
        title: "Change 1",
        status: "closed",
        taskCount: 1,
        completedTasks: 0,
      },
    ]);

    const status = await adapted.status();
    expect(status.changes.byStatus.closed).toBe(1);
    expect(status.changes.byStatus.draft).toBe(0);
    expect(status.changes.active).toBe(0);
    expect(status.recommendations).toEqual([
      "[doctor] Pending WAL checkpoint: 1 bytes in WAL file (advisory — close other ADV sessions, rerun /adv-status, and restart OpenCode before archive only if it persists)",
    ]);

    listSpy.mockRestore();
    void listChangeDirs;
  });

  it("caches repeated changes.get calls until a mutation invalidates the cache", async () => {
    const changeHandle = {
      query: vi.fn(async () => ({
        projectId: "proj1",
        changeId: "chg-cache",
        title: "Cached Change",
        initializedAt: "2026-04-18T00:00:00.000Z",
        id: "chg-cache",
        status: "draft",
        createdAt: "2026-04-18T00:00:00.000Z",
        tasks: [],
        wisdom: [],
        gates: {
          proposal: { status: "pending" },
          discovery: { status: "pending" },
          design: { status: "pending" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        reentry_history: [],
        artifacts: {},
      })),
      executeUpdate: vi.fn(async () => null),
      signal: vi.fn(async () => {}),
    };

    const bundle = {
      client: {
        workflow: {
          getHandle: routeHandle(changeHandle),
        },
      },
    };

    const legacy = makeLegacyStore();
    const adapted = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    await adapted.changes.get("chg-cache");
    await adapted.changes.get("chg-cache");

    expect(changeHandle.query).toHaveBeenCalledTimes(1);

    await adapted.changes.close("chg-cache", {
      reason: "superseded",
      approved_by_user: true,
      approved_at: "2026-04-18T00:01:00.000Z",
      approval_evidence: "ok",
    });
    await adapted.changes.get("chg-cache");

    expect(changeHandle.query).toHaveBeenCalledTimes(2);
  });

  it("retries transient query failures before succeeding", async () => {
    const changeHandle = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:7233"))
        .mockResolvedValueOnce({
          projectId: "proj1",
          changeId: "chg-retry",
          title: "Retry Change",
          initializedAt: "2026-04-18T00:00:00.000Z",
          id: "chg-retry",
          status: "draft",
          createdAt: "2026-04-18T00:00:00.000Z",
          tasks: [],
          wisdom: [],
          gates: {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
          reentry_history: [],
          artifacts: {},
        }),
      executeUpdate: vi.fn(async () => null),
      signal: vi.fn(async () => {}),
    };

    const bundle = {
      client: {
        workflow: {
          getHandle: routeHandle(changeHandle),
        },
      },
    };

    const legacy = makeLegacyStore();
    const adapted = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    const result = await adapted.changes.get("chg-retry");

    expect(result.success).toBe(true);
    expect(changeHandle.query).toHaveBeenCalledTimes(2);
    // Transient retry path stays on Temporal only; legacy is untouched.
    expect(legacy.changes.get).not.toHaveBeenCalled();
  });

  it("on fallback error with no disk snapshot, throws original error", async () => {
    // P1.5 orphan-tolerant contract: fallback errors trigger a re-seed
    // attempt from disk. When the disk snapshot does not exist, the
    // original Temporal error is rethrown — callers still see the
    // not-found error, just after one legacy read attempt.
    const changeHandle = {
      query: vi.fn(async () => {
        throw new Error("Workflow execution not found");
      }),
      executeUpdate: vi.fn(async () => null),
      signal: vi.fn(async () => {}),
    };

    const bundle = {
      client: {
        workflow: {
          getHandle: routeHandle(changeHandle),
        },
      },
    };

    const legacy = makeLegacyStore();
    // Legacy has no snapshot for this orphan id → re-seed short-circuits,
    // original Temporal error propagates.
    legacy.changes.get = vi.fn(async () => ({
      success: false,
      error: "not found",
    }));
    const adapted = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    await expect(adapted.changes.get("chg-fallback")).rejects.toThrow(
      "Workflow execution not found",
    );

    expect(changeHandle.query).toHaveBeenCalledTimes(1);
    // Legacy was consulted once for re-seed; result was empty so we threw.
    expect(legacy.changes.get).toHaveBeenCalledTimes(1);
  });

  it.each([
    "workflow not found for ID: adv/change/proj1/chg-xyz",
    "Workflow not found",
    "NOT_FOUND",
    "some grpc not_found detail",
  ])(
    "re-seed attempt is made on Temporal not-found variant: %s",
    async (msg) => {
      const changeHandle = {
        query: vi.fn(async () => {
          throw new Error(msg);
        }),
        executeUpdate: vi.fn(async () => null),
        signal: vi.fn(async () => {}),
      };

      const bundle = {
        client: {
          workflow: {
            getHandle: routeHandle(changeHandle),
            // Re-seed tries to start the workflow; stub it out so the test
            // exercises only the error-classification → legacy-read path.
            start: vi.fn(async () => changeHandle),
          },
        },
      };

      const legacy = makeLegacyStore();
      // Legacy has no snapshot → re-seed fails, original error propagates.
      legacy.changes.get = vi.fn(async () => ({
        success: false,
        error: "not found",
      }));
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await expect(adapted.changes.get("chg-variant")).rejects.toThrow(msg);
      // Legacy consulted once for re-seed attempt.
      expect(legacy.changes.get).toHaveBeenCalledTimes(1);
    },
  );

  it("re-seeds orphan change from disk snapshot on fallback error", async () => {
    // P1.5 orphan-tolerant contract: when the Temporal workflow is
    // missing but a disk snapshot exists, ensureChangeWorkflowStarted
    // is called with the snapshot and the hydrated state is returned.
    // First query throws not-found; after re-seed the same handle
    // returns the hydrated ChangeWorkflowState.
    const hydrated = {
      projectId: "proj1",
      changeId: "chg-orphan",
      title: "Orphan Change",
      initializedAt: "2026-04-24T00:00:00.000Z",
      id: "chg-orphan",
      status: "draft",
      createdAt: "2026-04-24T00:00:00.000Z",
      tasks: [],
      wisdom: [],
      gates: {
        proposal: { status: "pending" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      },
      reentry_history: [],
      artifacts: {},
    };
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("Workflow execution not found"))
      .mockResolvedValue(hydrated);
    const changeHandle = {
      query,
      executeUpdate: vi.fn(async () => null),
      signal: vi.fn(async () => {}),
    };

    const start = vi.fn(async () => changeHandle);
    const bundle = {
      client: {
        workflow: {
          getHandle: routeHandle(changeHandle),
          start,
        },
      },
    };

    const legacy = makeLegacyStore();
    legacy.changes.get = vi.fn(async () => ({
      success: true,
      data: {
        id: "chg-orphan",
        title: "Orphan Change",
        status: "draft",
        created_at: "2026-04-24T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {
          proposal: { status: "pending" },
          discovery: { status: "pending" },
          design: { status: "pending" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
      },
    })) as any;

    const adapted = createTemporalStoreBackend({
      legacy,
      temporal: bundle as any,
      projectId: "proj1",
    });

    const result = await adapted.changes.get("chg-orphan");
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("chg-orphan");
    // Disk read happened for re-seed, workflow re-started, then re-queried.
    expect(legacy.changes.get).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
  });

  describe("closeBatch", () => {
    it("propagates Temporal errors without falling back to legacy", async () => {
      const changeHandle = {
        query: vi.fn(async () => {
          throw new Error("Workflow execution not found");
        }),
        executeUpdate: vi.fn(async () => {
          throw new Error("Workflow execution not found");
        }),
      };

      const bundle = {
        client: {
          workflow: {
            getHandle: routeHandle(changeHandle),
          },
        },
      };

      const legacy = makeLegacyStore();
      vi.spyOn(legacy.changes, "get").mockImplementation(async (id) => ({
        success: true,
        data: {
          id,
          title: "Draft",
          status: "draft",
          created_at: "2026-04-18T00:00:00.000Z",
          tasks: [],
        } as any,
      }));
      vi.spyOn(legacy.changes, "close").mockResolvedValue({
        id: "x",
        status: "closed",
      } as any);

      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await expect(
        adapted.changes.closeBatch(["chg-a", "chg-b"], {
          reason: "not_planned",
          approved_by_user: true,
          approved_at: "2026-04-21T00:00:00Z",
          approval_evidence: "ok",
        }),
      ).rejects.toThrow("Workflow execution not found");

      expect(legacy.changes.close).not.toHaveBeenCalled();
    });

    it("pre-validates and fail-alls via Temporal query when workflows exist", async () => {
      const changeHandle = {
        query: vi.fn(async () => ({
          projectId: "proj1",
          changeId: "chg-draft",
          title: "Draft",
          initializedAt: "2026-04-18T00:00:00.000Z",
          id: "chg-draft",
          status: "draft",
          createdAt: "2026-04-18T00:00:00.000Z",
          tasks: [],
          wisdom: [],
          gates: {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
          reentry_history: [],
          artifacts: {},
        })),
        executeUpdate: vi.fn(async () => null),
        signal: vi.fn(async () => {}),
      };

      const bundle = {
        client: {
          workflow: {
            getHandle: routeHandle(changeHandle),
          },
        },
      };

      const legacy = makeLegacyStore();
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      // Only one change provided, and it is draft — should succeed via Temporal
      const result = await adapted.changes.closeBatch(["chg-draft"], {
        reason: "not_planned",
        approved_by_user: true,
        approved_at: "2026-04-21T00:00:00Z",
        approval_evidence: "ok",
      });

      expect(result.success).toBe(true);
      expect(result.closed).toBe(1);
      expect(changeHandle.executeUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
