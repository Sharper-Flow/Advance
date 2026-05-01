import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTemporalStoreBackend } from "./store-temporal";
import type { Store } from "./store-types";
import { CHANGE_WORKFLOW_UPDATE_NAMES } from "../temporal/contracts";

vi.mock("../utils/debug-log", () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  appendDebugLog: vi.fn(),
}));

// P1.4: spy-mock the migration module so individual tests can override
// ensureChangeWorkflowStarted (via mockRejectedValueOnce /
// mockResolvedValueOnce) without breaking the default behavior that
// other tests rely on (e.g. the re-seed test which needs the real
// ensureChangeWorkflowStarted to reach bundle.client.workflow.start).
vi.mock("../temporal/migration", async () => {
  const actual = await vi.importActual<typeof import("../temporal/migration")>(
    "../temporal/migration",
  );
  return {
    ...actual,
    ensureChangeWorkflowStarted: vi.fn(actual.ensureChangeWorkflowStarted),
  };
});

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

    // P2.2: specs.list now goes through the listSpecsActivity (disk read),
    // NOT through legacy.specs.list. legacy.specs.list must remain
    // un-called even when the adapter's specs surface is exercised.
    legacy.paths.specs = "/tmp/p22-specs-uncalled" as any;
    await adapted.specs.list();
    expect(legacy.specs.list).not.toHaveBeenCalled();
  });

  // P2.2: explicit guards that legacy.status() and legacy.specs.* are NOT
  // routed through legacy by the Temporal adapter.
  describe("P2.2: legacy.status + legacy.specs.* are bypassed", () => {
    it("status() does not call legacy.status()", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "p22-status-"));
      try {
        const specsDir = join(tempRoot, "specs");
        mkdirSync(specsDir, { recursive: true });

        const changeHandle = {
          query: vi.fn(async () => null),
          executeUpdate: vi.fn(async () => null),
          signal: vi.fn(async () => {}),
        };
        const bundle = {
          client: { workflow: { getHandle: routeHandle(changeHandle) } },
        };

        const legacy = makeLegacyStore();
        legacy.paths.specs = specsDir as any;
        legacy.paths.changes = join(tempRoot, "changes") as any;

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        const result = await adapted.status();

        expect(legacy.status).not.toHaveBeenCalled();
        expect(result).toBeDefined();
        expect(result.specs).toBeDefined();
        expect(Array.isArray(result.specs.capabilities)).toBe(true);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("specs.list reads from disk (listSpecsActivity), not legacy", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "p22-specs-"));
      try {
        const specsDir = join(tempRoot, "specs");
        mkdirSync(join(specsDir, "auth"), { recursive: true });
        mkdirSync(join(specsDir, "payments"), { recursive: true });
        const fs = await import("node:fs/promises");
        await fs.writeFile(
          join(specsDir, "auth", "spec.json"),
          JSON.stringify({
            name: "auth",
            title: "Auth",
            purpose: "Authentication and session handling.",
            version: "1.0",
            updated_at: "2026-04-25T00:00:00.000Z",
            requirements: [
              {
                id: "rq-auth01",
                title: "Sign in",
                body: "Users can sign in.",
                priority: "should",
              },
            ],
          }),
        );
        await fs.writeFile(
          join(specsDir, "payments", "spec.json"),
          JSON.stringify({
            name: "payments",
            title: "Payments",
            purpose: "Payment processing.",
            version: "0.1",
            updated_at: "2026-04-25T00:00:00.000Z",
            requirements: [],
          }),
        );

        const changeHandle = {
          query: vi.fn(async () => null),
          executeUpdate: vi.fn(async () => null),
          signal: vi.fn(async () => {}),
        };
        const bundle = {
          client: { workflow: { getHandle: routeHandle(changeHandle) } },
        };
        const legacy = makeLegacyStore();
        legacy.paths.specs = specsDir as any;

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        const result = await adapted.specs.list();

        expect(legacy.specs.list).not.toHaveBeenCalled();
        expect(result.specs.map((s) => s.name).sort()).toEqual([
          "auth",
          "payments",
        ]);
        const auth = result.specs.find((s) => s.name === "auth");
        expect(auth?.requirementCount).toBe(1);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("specs.get reads from disk (showSpecActivity), not legacy.specs.get", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "p22-specs-get-"));
      try {
        const specsDir = join(tempRoot, "specs");
        mkdirSync(join(specsDir, "auth"), { recursive: true });
        const fs = await import("node:fs/promises");
        await fs.writeFile(
          join(specsDir, "auth", "spec.json"),
          JSON.stringify({
            name: "auth",
            title: "Auth",
            purpose: "Authentication.",
            version: "1.0",
            updated_at: "2026-04-25T00:00:00.000Z",
            requirements: [],
          }),
        );

        const changeHandle = {
          query: vi.fn(async () => null),
          executeUpdate: vi.fn(async () => null),
          signal: vi.fn(async () => {}),
        };
        const bundle = {
          client: { workflow: { getHandle: routeHandle(changeHandle) } },
        };
        const legacy = makeLegacyStore();
        legacy.paths.specs = specsDir as any;

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        const result = await adapted.specs.get("auth");

        expect(legacy.specs.get).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data?.name).toBe("auth");
        }
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("specs.get returns null when capability missing (no legacy fallback)", async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "p22-specs-missing-"));
      try {
        const specsDir = join(tempRoot, "specs");
        mkdirSync(specsDir, { recursive: true });

        const changeHandle = {
          query: vi.fn(async () => null),
          executeUpdate: vi.fn(async () => null),
          signal: vi.fn(async () => {}),
        };
        const bundle = {
          client: { workflow: { getHandle: routeHandle(changeHandle) } },
        };
        const legacy = makeLegacyStore();
        legacy.paths.specs = specsDir as any;

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        const result = await adapted.specs.get("nonexistent");

        expect(legacy.specs.get).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBeNull();
        }
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });
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
        created_at: "2026-04-18T00:00:00.000Z",
        lastActivityAt: "2026-04-18T00:00:00.000Z",
        taskCount: 1,
        completedTasks: 0,
      },
    ]);

    const status = await adapted.status();
    expect(status.changes.byStatus.closed).toBe(1);
    expect(status.changes.byStatus.draft).toBe(0);
    expect(status.changes.active).toBe(0);
    // P2.2: doctor recommendations were generated by corruption-recovery.ts
    // which is deleted in P2.7. The Temporal-only status path returns []
    // for recommendations.
    expect(status.recommendations).toEqual([]);

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

    // Layer C1 (rq-archiveRetirement01-followon): close() now performs a
    // disk-first safety-net write, which requires fetching current state
    // via getTemporalChange before the Temporal transition. This adds
    // one query to the close path. The post-close get() still reads from
    // the cache populated by setCachedChange — caching invariant intact.
    expect(changeHandle.query.mock.calls.length).toBeGreaterThanOrEqual(2);
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
    // Guard calls legacy.changes.get before each Temporal query attempt.
    // With one transient failure + one success = 2 guard calls.
    expect(legacy.changes.get).toHaveBeenCalledTimes(2);
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
    // Guard calls legacy once before Temporal query, then re-seed calls
    // legacy once. Total: 2 legacy reads.
    expect(legacy.changes.get).toHaveBeenCalledTimes(2);
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
      // Guard calls legacy once before Temporal query, then re-seed calls
      // legacy once. Total: 2 legacy reads.
      expect(legacy.changes.get).toHaveBeenCalledTimes(2);
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
    // Guard calls legacy before first query, re-seed reads disk, guard
    // calls legacy again before second query. Total: 3 legacy reads.
    expect(legacy.changes.get).toHaveBeenCalledTimes(3);
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

  // P1.4 — Transactional changes.create with fs.rm rollback (design.md § KD-7).
  //
  // Problem: `changes.create` currently writes disk scaffold first, then
  // starts the Temporal workflow. If the workflow start throws, the disk
  // artifacts persist as orphans that confuse subsequent tools. Fix: on
  // workflow-start failure, remove the change directory via fs.rm.
  describe("changes.create transactional rollback (P1.4)", () => {
    it("removes change dir via fs.rm when ensureChangeWorkflowStarted fails", async () => {
      const { ensureChangeWorkflowStarted } =
        await import("../temporal/migration");
      const mockEnsure = ensureChangeWorkflowStarted as ReturnType<
        typeof vi.fn
      >;
      mockEnsure.mockRejectedValueOnce(new Error("Temporal server down"));

      // Set up a real temp changes dir so fs.rm has something to remove
      const tmp = mkdtempSync(join(tmpdir(), "p1-4-rollback-"));
      const changesDir = join(tmp, "changes");
      mkdirSync(changesDir, { recursive: true });
      const changeDir = join(changesDir, "chg-rollback");
      mkdirSync(changeDir, { recursive: true });
      // Write a dummy proposal.md so we can verify it's gone after rollback
      // (simulates what legacy.changes.create would have scaffolded).
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(changeDir, "proposal.md"), "# scaffolded");

      const legacy = makeLegacyStore();
      (legacy as any).paths = { changes: changesDir };
      (legacy.changes.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { changeId: "chg-rollback", path: changeDir },
      );
      (legacy.changes.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          id: "chg-rollback",
          title: "Rollback test",
          status: "draft",
          created_at: "2026-04-24T00:00:00Z",
          tasks: [],
          wisdom: [],
          gates: {},
          reentry_history: [],
          deltas: {},
          validation: null,
          github_issues: [],
          clarify_findings: [],
          judgment_calls: [],
          batch_surfaced_at: null,
          cross_project_origin: null,
        },
      });

      const bundle = {
        client: {
          workflow: { getHandle: routeHandle({}), start: vi.fn() },
        },
      };
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      expect(existsSync(changeDir)).toBe(true);

      await expect(adapted.changes.create("Rollback test")).rejects.toThrow(
        /Temporal server down/,
      );

      // Acceptance: change dir must be gone after rollback
      expect(existsSync(changeDir)).toBe(false);

      rmSync(tmp, { recursive: true, force: true });
    });

    it("re-throws the original Temporal error (not the rollback error)", async () => {
      const { ensureChangeWorkflowStarted } =
        await import("../temporal/migration");
      const mockEnsure = ensureChangeWorkflowStarted as ReturnType<
        typeof vi.fn
      >;
      const originalError = new Error("Original workflow start failure");
      mockEnsure.mockRejectedValueOnce(originalError);

      // Point changes dir at a path that doesn't exist → fs.rm with
      // `force: true` still succeeds (no-op), so the original error wins.
      // If `force: false` were used, fs.rm would throw ENOENT and mask the
      // original — this test guards against that regression.
      const legacy = makeLegacyStore();
      (legacy as any).paths = { changes: "/tmp/does-not-exist-p14" };
      (legacy.changes.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { changeId: "chg-foo", path: "/tmp/does-not-exist-p14/chg-foo" },
      );
      (legacy.changes.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          id: "chg-foo",
          title: "Test",
          status: "draft",
          created_at: "2026-04-24T00:00:00Z",
          tasks: [],
          wisdom: [],
          gates: {},
          reentry_history: [],
          deltas: {},
          validation: null,
          github_issues: [],
          clarify_findings: [],
          judgment_calls: [],
          batch_surfaced_at: null,
          cross_project_origin: null,
        },
      });

      const bundle = {
        client: {
          workflow: { getHandle: routeHandle({}), start: vi.fn() },
        },
      };
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await expect(adapted.changes.create("Test")).rejects.toBe(originalError);
    });

    it("succeeds normally when ensureChangeWorkflowStarted resolves", async () => {
      const { ensureChangeWorkflowStarted } =
        await import("../temporal/migration");
      const mockEnsure = ensureChangeWorkflowStarted as ReturnType<
        typeof vi.fn
      >;
      mockEnsure.mockResolvedValueOnce(undefined);

      const tmp = mkdtempSync(join(tmpdir(), "p1-4-success-"));
      const changesDir = join(tmp, "changes");
      mkdirSync(changesDir, { recursive: true });
      const changeDir = join(changesDir, "chg-success");
      mkdirSync(changeDir, { recursive: true });

      const legacy = makeLegacyStore();
      (legacy as any).paths = { changes: changesDir };
      (legacy.changes.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { changeId: "chg-success", path: changeDir },
      );
      (legacy.changes.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          id: "chg-success",
          title: "Success",
          status: "draft",
          created_at: "2026-04-24T00:00:00Z",
          tasks: [],
          wisdom: [],
          gates: {},
          reentry_history: [],
          deltas: {},
          validation: null,
          github_issues: [],
          clarify_findings: [],
          judgment_calls: [],
          batch_surfaced_at: null,
          cross_project_origin: null,
        },
      });

      const bundle = {
        client: {
          workflow: { getHandle: routeHandle({}), start: vi.fn() },
        },
      };
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      const result = await adapted.changes.create("Success");
      expect(result.changeId).toBe("chg-success");
      // Directory should still exist — no rollback fired
      expect(existsSync(changeDir)).toBe(true);

      rmSync(tmp, { recursive: true, force: true });
    });
  });

  describe("changes.list visibility-disk union (P2.4 follow-up)", () => {
    /**
     * Helper: build a bundle whose `workflow.list` returns a fixed set of
     * workflow IDs, and whose `getHandle` routes per-change queries to a
     * map keyed by changeId. Mirrors how the real Temporal client behaves.
     */
    function buildBundleWithVisibility(opts: {
      visibilityIds: string[];
      changeStates: Record<string, any>;
      projectId: string;
      capturedListCalls?: { query: string }[];
    }) {
      const projectHandle = makeProjectHandle();
      const handlesByChangeId: Record<string, any> = {};
      for (const [changeId, state] of Object.entries(opts.changeStates)) {
        handlesByChangeId[changeId] = {
          query: vi.fn(async (queryDef: any) => {
            const name = queryDef?.name ?? queryDef;
            if (name === "adv.change.state") return state;
            return null;
          }),
          executeUpdate: vi.fn(async () => null),
          signal: vi.fn(async () => {}),
        };
      }
      const getHandle = vi.fn((workflowId: string) => {
        if (workflowId.startsWith("adv/project/")) return projectHandle;
        const prefix = `adv/change/${opts.projectId}/`;
        if (workflowId.startsWith(prefix)) {
          const changeId = workflowId.slice(prefix.length);
          if (handlesByChangeId[changeId]) return handlesByChangeId[changeId];
        }
        // Unknown workflow — simulate WorkflowNotFoundError surface.
        return {
          query: vi.fn(async () => {
            throw Object.assign(new Error("workflow not found"), {
              name: "WorkflowNotFoundError",
            });
          }),
          executeUpdate: vi.fn(async () => null),
          signal: vi.fn(async () => {}),
        };
      });
      return {
        client: {
          workflow: {
            getHandle,
            list: vi.fn(({ query }: { query: string }) => {
              opts.capturedListCalls?.push({ query });
              const ids = opts.visibilityIds.map((changeId) => ({
                workflowId: `adv/change/${opts.projectId}/${changeId}`,
              }));
              return {
                async *[Symbol.asyncIterator]() {
                  for (const wf of ids) yield wf;
                },
              };
            }),
            start: vi.fn(),
          },
        },
      };
    }

    function makeChangeState(opts: {
      id: string;
      status: string;
      title?: string;
    }) {
      return {
        projectId: "proj1",
        changeId: opts.id,
        title: opts.title ?? `Change ${opts.id}`,
        initializedAt: "2026-04-18T00:00:00.000Z",
        id: opts.id,
        status: opts.status,
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
      };
    }

    it("includeArchived:true requests archived statuses from visibility (not the default subset)", async () => {
      // Bug A: when caller asks for archived/closed via filter, the
      // visibility query must include those statuses too — otherwise
      // post-filter has nothing to surface.
      const capturedListCalls: { query: string }[] = [];
      const bundle = buildBundleWithVisibility({
        projectId: "proj1",
        visibilityIds: ["chg-archived"],
        changeStates: {
          "chg-archived": makeChangeState({
            id: "chg-archived",
            status: "archived",
          }),
        },
        capturedListCalls,
      });

      const legacy = makeLegacyStore();
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      const result = await adapted.changes.list({ includeArchived: true });

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]?.id).toBe("chg-archived");
      expect(result.changes[0]?.status).toBe("archived");

      // Confirm visibility query was widened. Either it omits the status
      // filter entirely (no AdvChangeStatus clause) or it includes
      // "archived" in the IN list.
      const lastQuery =
        capturedListCalls[capturedListCalls.length - 1]?.query ?? "";
      const omitsStatusFilter = !lastQuery.includes("AdvChangeStatus");
      const includesArchivedStatus =
        /AdvChangeStatus\s+IN\s*\([^)]*"archived"/.test(lastQuery);
      expect(omitsStatusFilter || includesArchivedStatus).toBe(true);
    });

    it("includeClosed:true requests closed statuses from visibility (not the default subset)", async () => {
      // Bug A (mirror): same as above for closed.
      const capturedListCalls: { query: string }[] = [];
      const bundle = buildBundleWithVisibility({
        projectId: "proj1",
        visibilityIds: ["chg-closed"],
        changeStates: {
          "chg-closed": makeChangeState({
            id: "chg-closed",
            status: "closed",
          }),
        },
        capturedListCalls,
      });

      const legacy = makeLegacyStore();
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      const result = await adapted.changes.list({ includeClosed: true });

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]?.id).toBe("chg-closed");
      expect(result.changes[0]?.status).toBe("closed");

      const lastQuery =
        capturedListCalls[capturedListCalls.length - 1]?.query ?? "";
      const omitsStatusFilter = !lastQuery.includes("AdvChangeStatus");
      const includesClosedStatus =
        /AdvChangeStatus\s+IN\s*\([^)]*"closed"/.test(lastQuery);
      expect(omitsStatusFilter || includesClosedStatus).toBe(true);
    });

    it("default list (no include flags) excludes closed even when present on disk", async () => {
      // Sanity: the existing default-view contract is preserved. The fix
      // must not start surfacing closed changes by accident.
      const tmp = mkdtempSync(join(tmpdir(), "adv-list-default-"));
      try {
        // Seed disk with a closed change that is NOT in visibility.
        const changesDir = join(tmp, "changes");
        const closedDir = join(changesDir, "chg-disk-closed");
        mkdirSync(closedDir, { recursive: true });
        const fs = await import("node:fs/promises");
        await fs.writeFile(
          join(closedDir, "change.json"),
          JSON.stringify({
            id: "chg-disk-closed",
            title: "Disk-only closed",
            status: "closed",
            created_at: "2026-04-18T00:00:00.000Z",
            tasks: [],
            deltas: {},
            wisdom: [],
            gates: {},
          }),
        );

        const bundle = buildBundleWithVisibility({
          projectId: "proj1",
          visibilityIds: [], // visibility returns nothing
          changeStates: {},
        });

        const legacy = makeLegacyStore();
        legacy.paths.changes = changesDir as any;
        legacy.changes.get = vi.fn(async (id: string) => {
          if (id === "chg-disk-closed") {
            return {
              success: true,
              data: {
                id: "chg-disk-closed",
                title: "Disk-only closed",
                status: "closed",
                created_at: "2026-04-18T00:00:00.000Z",
                tasks: [],
                deltas: {},
                wisdom: [],
                gates: {},
              },
            } as any;
          }
          return { success: false } as any;
        });

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        // No include flags — closed must be excluded even if disk has it.
        const result = await adapted.changes.list({});
        expect(
          result.changes.find((c) => c.id === "chg-disk-closed"),
        ).toBeUndefined();
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("draft changes present on disk but missing from visibility surface in the list", async () => {
      // Bug B: orphaned-but-on-disk drafts must still appear, otherwise
      // active work disappears after a worker restart that lost the
      // workflow registration. Disk is the durable source of truth.
      const tmp = mkdtempSync(join(tmpdir(), "adv-list-orphan-"));
      try {
        const changesDir = join(tmp, "changes");
        const orphanDir = join(changesDir, "chg-orphan-draft");
        mkdirSync(orphanDir, { recursive: true });
        const fs = await import("node:fs/promises");
        const orphanData = {
          id: "chg-orphan-draft",
          title: "Orphan draft",
          status: "draft",
          created_at: "2026-04-18T00:00:00.000Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
        };
        await fs.writeFile(
          join(orphanDir, "change.json"),
          JSON.stringify(orphanData),
        );

        // Visibility returns ONLY the registered change; orphan is missing.
        const bundle = buildBundleWithVisibility({
          projectId: "proj1",
          visibilityIds: ["chg-registered"],
          changeStates: {
            "chg-registered": makeChangeState({
              id: "chg-registered",
              status: "draft",
            }),
          },
        });

        const legacy = makeLegacyStore();
        legacy.paths.changes = changesDir as any;
        legacy.changes.get = vi.fn(async (id: string) => {
          if (id === "chg-orphan-draft") {
            return { success: true, data: orphanData } as any;
          }
          return { success: false } as any;
        });

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        const result = await adapted.changes.list({});
        const ids = result.changes.map((c) => c.id).sort();
        // Both must surface: visibility-registered + disk-orphan.
        expect(ids).toEqual(["chg-orphan-draft", "chg-registered"]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("disk dual-write durability (task-loss bug fix)", () => {
    /**
     * Regression test for the task-loss bug surfaced in change
     * `inlineApprovalGateTransition`. Tasks created via Temporal Updates
     * were never persisted to `change.json` on disk. When the workflow was
     * terminated/evicted between sessions, `reseedChangeFromDisk` seeded
     * a fresh workflow from the empty disk snapshot, losing all tasks.
     *
     * Fix: every Temporal mutation that touches change state must
     * dual-write to disk via `legacy.changes.save(change)` so the disk
     * snapshot stays current and reseeds preserve work.
     */
    it("persists state to disk after tasks.add", async () => {
      const legacy = makeLegacyStore();
      const persistedChanges: any[] = [];
      legacy.changes.save = vi.fn(async (change: any) => {
        persistedChanges.push(change);
      });

      const taskAdded = {
        id: "tk-new",
        title: "new task",
        status: "pending",
        priority: 0,
        created_at: "2026-04-26T00:00:00.000Z",
        tdd_phase: "none",
      };
      const stateAfterAdd = {
        projectId: "proj1",
        changeId: "chg1",
        title: "Change 1",
        initializedAt: "2026-04-26T00:00:00.000Z",
        id: "chg1",
        status: "draft",
        createdAt: "2026-04-26T00:00:00.000Z",
        tasks: [taskAdded],
        wisdom: [],
        gates: {
          proposal: { status: "done" },
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

      const changeHandle = {
        query: vi.fn(async () => stateAfterAdd),
        executeUpdate: vi.fn(async () => taskAdded),
        signal: vi.fn(async () => {}),
      };

      const bundle = {
        client: { workflow: { getHandle: routeHandle(changeHandle) } },
      };
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await adapted.tasks.add("chg1", "new task");
      await new Promise((resolve) => setImmediate(resolve));

      expect(legacy.changes.save).toHaveBeenCalled();
      const persisted = persistedChanges[persistedChanges.length - 1];
      expect(persisted.id).toBe("chg1");
      expect(persisted.tasks).toEqual([taskAdded]);
    });

    it("persists state to disk after gates.complete", async () => {
      const legacy = makeLegacyStore();
      const persistedChanges: any[] = [];
      legacy.changes.save = vi.fn(async (change: any) => {
        persistedChanges.push(change);
      });

      const stateAfterGate = {
        projectId: "proj1",
        changeId: "chg1",
        title: "Change 1",
        initializedAt: "2026-04-26T00:00:00.000Z",
        id: "chg1",
        status: "draft",
        createdAt: "2026-04-26T00:00:00.000Z",
        tasks: [],
        wisdom: [],
        gates: {
          proposal: {
            status: "done",
            completed_at: "2026-04-26T00:00:01.000Z",
            completed_by: "agent",
          },
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

      const changeHandle = {
        query: vi.fn(async () => stateAfterGate),
        executeUpdate: vi.fn(async () => stateAfterGate),
        signal: vi.fn(async () => {}),
      };

      const bundle = {
        client: { workflow: { getHandle: routeHandle(changeHandle) } },
      };
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await adapted.gates.complete("chg1", "proposal");
      await new Promise((resolve) => setImmediate(resolve));

      expect(legacy.changes.save).toHaveBeenCalled();
      const persisted = persistedChanges[persistedChanges.length - 1];
      expect(persisted.gates.proposal.status).toBe("done");
    });

    it("persists state to disk after tasks.update", async () => {
      const legacy = makeLegacyStore();
      legacy.changes.save = vi.fn(async () => {});

      const taskUpdated = {
        id: "tk-1",
        title: "task",
        status: "done",
        priority: 0,
        created_at: "2026-04-26T00:00:00.000Z",
        tdd_phase: "none",
      };
      const stateAfterUpdate = {
        projectId: "proj1",
        changeId: "chg1",
        title: "Change 1",
        initializedAt: "2026-04-26T00:00:00.000Z",
        id: "chg1",
        status: "draft",
        createdAt: "2026-04-26T00:00:00.000Z",
        tasks: [taskUpdated],
        wisdom: [],
        gates: {
          proposal: { status: "done" },
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

      const changeHandle = {
        query: vi.fn(async () => stateAfterUpdate),
        executeUpdate: vi.fn(async () => taskUpdated),
        signal: vi.fn(async () => {}),
      };

      legacy.tasks.show = vi.fn(async () => ({
        task: taskUpdated as any,
        changeId: "chg1",
      }));

      const bundle = {
        client: { workflow: { getHandle: routeHandle(changeHandle) } },
      };
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await adapted.tasks.update("tk-1", "done" as any);
      await new Promise((resolve) => setImmediate(resolve));

      expect(legacy.changes.save).toHaveBeenCalled();
    });

    it("does not throw if disk save fails (best-effort dual-write)", async () => {
      const legacy = makeLegacyStore();
      legacy.changes.save = vi.fn(async () => {
        throw new Error("EACCES: read-only filesystem");
      });

      const stateAfterAdd = {
        projectId: "proj1",
        changeId: "chg1",
        title: "Change 1",
        initializedAt: "2026-04-26T00:00:00.000Z",
        id: "chg1",
        status: "draft",
        createdAt: "2026-04-26T00:00:00.000Z",
        tasks: [
          {
            id: "tk-new",
            title: "new task",
            status: "pending",
            priority: 0,
            created_at: "2026-04-26T00:00:00.000Z",
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

      const changeHandle = {
        query: vi.fn(async () => stateAfterAdd),
        executeUpdate: vi.fn(async () => stateAfterAdd.tasks[0]),
        signal: vi.fn(async () => {}),
      };

      const bundle = {
        client: { workflow: { getHandle: routeHandle(changeHandle) } },
      };
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await expect(
        adapted.tasks.add("chg1", "new task"),
      ).resolves.toBeDefined();
    });
  });

  describe("archive bookkeeping: save() invalidates Memo", () => {
    /**
     * Regression test for the zombie-bookkeeping bug: `adv_change_archive`
     * sets `status: "archived"` and calls `store.changes.save()`, but the
     * Memo (ChangeSummaryMemo) was never invalidated. The fast path in
     * `listResolvedChanges` returns stale entries from Memo, showing
     * archived changes as still active (zombie records).
     *
     * Fix: `save()` must call `invalidateChange()` to clear the stale Memo
     * entry before updating the overlay cache.
     */
    it("save() with status=archived removes change from list results", async () => {
      const legacy = makeLegacyStore();
      legacy.changes.create = vi.fn(async () => ({
        changeId: "chg-archive-zombie",
        path: "/tmp/chg-archive-zombie",
      }));
      legacy.changes.get = vi.fn(async (id: string) => {
        if (id === "chg-archive-zombie") {
          return {
            success: true,
            data: {
              id: "chg-archive-zombie",
              title: "Zombie Test",
              status: "archived",
              created_at: "2026-04-27T00:00:00.000Z",
              tasks: [],
              deltas: {},
              wisdom: [],
              gates: {},
            },
          };
        }
        return { success: false };
      });

      const createdState = {
        projectId: "proj1",
        changeId: "chg-archive-zombie",
        title: "Zombie Test",
        initializedAt: "2026-04-27T00:00:00.000Z",
        id: "chg-archive-zombie",
        status: "draft",
        createdAt: "2026-04-27T00:00:00.000Z",
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

      const startedState = { ...createdState };
      const archivedState = { ...createdState, status: "archived" };

      const changeHandle = {
        query: vi.fn(async () => createdState),
        executeUpdate: vi.fn(async () => archivedState),
        signal: vi.fn(async () => {}),
        result: vi.fn(async () => startedState),
      };

      const bundle = {
        client: {
          workflow: {
            getHandle: routeHandle(changeHandle),
            start: vi.fn(async () => ({
              workflowId: "adv/change/chg-archive-zombie",
            })),
          },
        },
      };

      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      // Step 1: Create + get change — populates Memo via setCachedChange
      // (create seeds disk, get queries Temporal and populates Memo)
      await adapted.changes.create({
        summary: "Zombie Test",
        projectId: "proj1",
      });
      await adapted.changes.get("chg-archive-zombie");

      // Step 2: Verify change appears in list (Memo has it as draft)
      const listBefore = await adapted.changes.list();
      const idsBefore = listBefore.changes.map((c: any) => c.id);
      expect(idsBefore).toContain("chg-archive-zombie");

      // Step 3: Simulate archive — save with status=archived
      await adapted.changes.save({
        id: "chg-archive-zombie",
        title: "Zombie Test",
        status: "archived",
        created_at: "2026-04-27T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {},
      } as any);

      // Step 4: List should NOT contain the archived change
      const listAfter = await adapted.changes.list();
      const idsAfter = listAfter.changes.map((c: any) => c.id);
      expect(idsAfter).not.toContain("chg-archive-zombie");
    });

    it("save() with status=archived uses Temporal archive transition and avoids active-dir disk save", async () => {
      const legacy = makeLegacyStore();
      const archivedState = {
        projectId: "proj1",
        changeId: "chg-archive-transition",
        title: "Archive Transition Test",
        initializedAt: "2026-04-27T00:00:00.000Z",
        id: "chg-archive-transition",
        status: "archived",
        createdAt: "2026-04-27T00:00:00.000Z",
        tasks: [],
        wisdom: [],
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "done" },
        },
        reentry_history: [],
        artifacts: {},
      };
      const draftState = { ...archivedState, status: "active" };

      const changeHandle = {
        query: vi.fn(async () => draftState),
        executeUpdate: vi.fn(async (def: any) => {
          expect(def?.name ?? def).toBe(
            CHANGE_WORKFLOW_UPDATE_NAMES.archiveChange,
          );
          return archivedState;
        }),
        signal: vi.fn(async () => {}),
      };
      const projectHandle = makeProjectHandle();
      const bundle = {
        client: {
          workflow: { getHandle: routeHandle(changeHandle, projectHandle) },
        },
      };

      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await adapted.changes.save({
        id: "chg-archive-transition",
        title: "Archive Transition Test",
        status: "archived",
        created_at: "2026-04-27T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {},
      } as any);

      expect(changeHandle.executeUpdate).toHaveBeenCalledOnce();
      expect(legacy.changes.save).not.toHaveBeenCalled();
      expect(projectHandle.signal).toHaveBeenCalled();
      const signalPayload = (projectHandle.signal as any).mock.calls.at(
        -1,
      )?.[1];
      expect(signalPayload.status).toBe("archived");
    });

    it("does not dual-write archived workflow state back into active change dirs", async () => {
      const legacy = makeLegacyStore();
      const archivedState = {
        projectId: "proj1",
        changeId: "chg-archived-dual-write",
        title: "Archived Dual Write Test",
        initializedAt: "2026-04-27T00:00:00.000Z",
        id: "chg-archived-dual-write",
        status: "archived",
        createdAt: "2026-04-27T00:00:00.000Z",
        tasks: [],
        wisdom: [
          {
            id: "ws-1",
            type: "pattern",
            content: "archive state must not dual-write",
            recorded_at: "2026-04-27T00:00:00.000Z",
          },
        ],
        gates: {},
        reentry_history: [],
        artifacts: {},
      };

      const changeHandle = {
        query: vi.fn(async () => archivedState),
        executeUpdate: vi.fn(async () => archivedState),
        signal: vi.fn(async () => {}),
      };
      const bundle = {
        client: {
          workflow: { getHandle: routeHandle(changeHandle) },
        },
      };

      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await adapted.wisdom.add(
        "chg-archived-dual-write",
        "pattern",
        "archive state must not dual-write",
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(legacy.changes.save).not.toHaveBeenCalled();
    });
  });

  describe("Layer C1: close() safety-net disk write", () => {
    /**
     * Regression test for the disk-stale closed-zombie class.
     * Pre-fix, close() updated the in-memory overlay only — disk
     * change.json retained `status: "draft"`. On process restart,
     * `listResolvedChanges` disk fallback returned the stale draft
     * as a zombie. Unlike archived (which has a durable bundle),
     * closed changes have NO archive bundle, so Layer A1 cannot
     * detect them. Fix: write disk first with closed status before
     * the Temporal transition.
     */
    function makeCloseTestState(id: string, status = "draft") {
      return {
        projectId: "proj1",
        changeId: id,
        title: `Close ${id}`,
        initializedAt: "2026-04-27T00:00:00.000Z",
        id,
        status,
        createdAt: "2026-04-27T00:00:00.000Z",
        tasks: [],
        wisdom: [],
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "done" },
        },
        reentry_history: [],
        artifacts: {},
      };
    }

    const sampleClosure = {
      reason: "superseded" as const,
      approved_by_user: true as const,
      approved_at: "2026-04-30T00:00:00.000Z",
      approval_evidence: "user approved via test",
    };

    it("close() writes disk change.json with status=closed before Temporal transition", async () => {
      const draftState = makeCloseTestState("chg-close-disk", "draft");
      const closedState = { ...draftState, status: "closed" };
      const callOrder: string[] = [];

      const changeHandle = {
        query: vi.fn(async () => draftState),
        executeUpdate: vi.fn(async () => {
          callOrder.push("temporal");
          return closedState;
        }),
        signal: vi.fn(async () => {}),
      };
      const bundle = {
        client: { workflow: { getHandle: routeHandle(changeHandle) } },
      };

      const legacy = makeLegacyStore();
      legacy.changes.save = vi.fn(async () => {
        callOrder.push("disk");
      });

      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await adapted.changes.close("chg-close-disk", sampleClosure);

      expect(legacy.changes.save).toHaveBeenCalled();
      const savedArg = (legacy.changes.save as any).mock.calls.at(-1)?.[0];
      expect(savedArg.status).toBe("closed");
      expect(savedArg.closure).toEqual(sampleClosure);
      // Disk-first ordering: disk write happens before Temporal transition
      expect(callOrder.indexOf("disk")).toBeLessThan(
        callOrder.indexOf("temporal"),
      );
    });

    it("close() aborts before Temporal transition when disk write throws", async () => {
      const draftState = makeCloseTestState("chg-close-fail", "draft");
      const changeHandle = {
        query: vi.fn(async () => draftState),
        executeUpdate: vi.fn(async () => draftState),
        signal: vi.fn(async () => {}),
      };
      const bundle = {
        client: { workflow: { getHandle: routeHandle(changeHandle) } },
      };

      const legacy = makeLegacyStore();
      legacy.changes.save = vi.fn(async () => {
        throw new Error("disk full");
      });

      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await expect(
        adapted.changes.close("chg-close-fail", sampleClosure),
      ).rejects.toThrow(/disk full/);
      // Temporal transition MUST NOT have run after disk failure (no half-state)
      expect(changeHandle.executeUpdate).not.toHaveBeenCalled();
    });

    it("close() restores the disk snapshot when Temporal transition fails after disk write", async () => {
      const draftState = makeCloseTestState("chg-close-temporal-fail", "draft");
      const changeHandle = {
        query: vi.fn(async () => draftState),
        executeUpdate: vi.fn(async () => {
          throw new Error("Temporal close failed");
        }),
        signal: vi.fn(async () => {}),
      };
      const bundle = {
        client: { workflow: { getHandle: routeHandle(changeHandle) } },
      };

      const legacy = makeLegacyStore();

      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      await expect(
        adapted.changes.close("chg-close-temporal-fail", sampleClosure),
      ).rejects.toThrow(/Temporal close failed/);

      const savedStatuses = (legacy.changes.save as any).mock.calls.map(
        (call: any) => call[0].status,
      );
      expect(savedStatuses).toEqual(["closed", "draft"]);
    });

    it("closeBatch() writes disk change.json with status=closed for every successful id", async () => {
      const ids = ["chg-batch-a", "chg-batch-b", "chg-batch-c"];
      const states: Record<string, any> = {};
      for (const id of ids) states[id] = makeCloseTestState(id, "draft");

      const handlesByChangeId: Record<string, any> = {};
      for (const id of ids) {
        handlesByChangeId[id] = {
          query: vi.fn(async () => states[id]),
          executeUpdate: vi.fn(async () => ({
            ...states[id],
            status: "closed",
          })),
          signal: vi.fn(async () => {}),
        };
      }
      const projectHandle = makeProjectHandle();
      const getHandle = vi.fn((workflowId: string) => {
        if (workflowId.startsWith("adv/project/")) return projectHandle;
        const prefix = "adv/change/proj1/";
        if (workflowId.startsWith(prefix)) {
          const id = workflowId.slice(prefix.length);
          if (handlesByChangeId[id]) return handlesByChangeId[id];
        }
        throw Object.assign(new Error("workflow not found"), {
          name: "WorkflowNotFoundError",
        });
      });
      const bundle = { client: { workflow: { getHandle } } };

      const legacy = makeLegacyStore();
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      const result = await adapted.changes.closeBatch(ids, sampleClosure);
      expect(result.success).toBe(true);
      expect(result.closed).toBe(3);
      expect((legacy.changes.save as any).mock.calls.length).toBe(3);
      const savedStatuses = (legacy.changes.save as any).mock.calls.map(
        (c: any) => c[0].status,
      );
      expect(savedStatuses).toEqual(["closed", "closed", "closed"]);
    });

    it("closeBatch() partial failure: one id's disk write throws, batch continues for others", async () => {
      const ids = ["chg-batch-ok-1", "chg-batch-fail", "chg-batch-ok-2"];
      const states: Record<string, any> = {};
      for (const id of ids) states[id] = makeCloseTestState(id, "draft");

      const handlesByChangeId: Record<string, any> = {};
      for (const id of ids) {
        handlesByChangeId[id] = {
          query: vi.fn(async () => states[id]),
          executeUpdate: vi.fn(async () => ({
            ...states[id],
            status: "closed",
          })),
          signal: vi.fn(async () => {}),
        };
      }
      const projectHandle = makeProjectHandle();
      const getHandle = vi.fn((workflowId: string) => {
        if (workflowId.startsWith("adv/project/")) return projectHandle;
        const prefix = "adv/change/proj1/";
        if (workflowId.startsWith(prefix)) {
          const id = workflowId.slice(prefix.length);
          if (handlesByChangeId[id]) return handlesByChangeId[id];
        }
        throw Object.assign(new Error("workflow not found"), {
          name: "WorkflowNotFoundError",
        });
      });
      const bundle = { client: { workflow: { getHandle } } };

      const legacy = makeLegacyStore();
      legacy.changes.save = vi.fn(async (change: any) => {
        if (change.id === "chg-batch-fail") {
          throw new Error("disk full for chg-batch-fail");
        }
      });

      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      const result = await adapted.changes.closeBatch(ids, sampleClosure);
      expect(result.success).toBe(false); // not all succeeded
      expect(result.closed).toBe(2);
      const failResult = result.results.find(
        (r) => r.changeId === "chg-batch-fail",
      );
      expect(failResult?.success).toBe(false);
      expect(failResult?.error).toMatch(/disk full/);
      // The Temporal transition for the failed id must NOT have run
      expect(
        handlesByChangeId["chg-batch-fail"].executeUpdate,
      ).not.toHaveBeenCalled();
      // The other ids' Temporal transitions DID run
      expect(
        handlesByChangeId["chg-batch-ok-1"].executeUpdate,
      ).toHaveBeenCalled();
      expect(
        handlesByChangeId["chg-batch-ok-2"].executeUpdate,
      ).toHaveBeenCalled();
    });

    it("closeBatch() restores one id's disk snapshot when its Temporal transition fails", async () => {
      const ids = [
        "chg-batch-ok-1",
        "chg-batch-temporal-fail",
        "chg-batch-ok-2",
      ];
      const states: Record<string, any> = {};
      for (const id of ids) states[id] = makeCloseTestState(id, "draft");

      const handlesByChangeId: Record<string, any> = {};
      for (const id of ids) {
        handlesByChangeId[id] = {
          query: vi.fn(async () => states[id]),
          executeUpdate: vi.fn(async () => {
            if (id === "chg-batch-temporal-fail") {
              throw new Error("Temporal close failed for batch id");
            }
            return { ...states[id], status: "closed" };
          }),
          signal: vi.fn(async () => {}),
        };
      }
      const projectHandle = makeProjectHandle();
      const getHandle = vi.fn((workflowId: string) => {
        if (workflowId.startsWith("adv/project/")) return projectHandle;
        const prefix = "adv/change/proj1/";
        if (workflowId.startsWith(prefix)) {
          const id = workflowId.slice(prefix.length);
          if (handlesByChangeId[id]) return handlesByChangeId[id];
        }
        throw Object.assign(new Error("workflow not found"), {
          name: "WorkflowNotFoundError",
        });
      });
      const bundle = { client: { workflow: { getHandle } } };

      const legacy = makeLegacyStore();
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      const result = await adapted.changes.closeBatch(ids, sampleClosure);
      expect(result.success).toBe(false);
      expect(result.closed).toBe(2);
      const failResult = result.results.find(
        (r) => r.changeId === "chg-batch-temporal-fail",
      );
      expect(failResult?.success).toBe(false);
      expect(failResult?.error).toMatch(/Temporal close failed/);

      const savesForFailedId = (legacy.changes.save as any).mock.calls
        .map((call: any) => call[0])
        .filter((change: any) => change.id === "chg-batch-temporal-fail");
      expect(savesForFailedId.map((change: any) => change.status)).toEqual([
        "closed",
        "draft",
      ]);
    });

    it("close() is idempotent — re-closing an already-closed change is safe", async () => {
      const closedState = makeCloseTestState("chg-close-idem", "closed");
      const changeHandle = {
        query: vi.fn(async () => closedState),
        executeUpdate: vi.fn(async () => closedState),
        signal: vi.fn(async () => {}),
      };
      const bundle = {
        client: { workflow: { getHandle: routeHandle(changeHandle) } },
      };

      const legacy = makeLegacyStore();

      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      // Should not throw
      await adapted.changes.close("chg-close-idem", sampleClosure);
      // Disk write still happens (idempotent — same closed status written again)
      expect(legacy.changes.save).toHaveBeenCalled();
    });
  });

  describe("Cross-cutting restart-simulation regression (AC #1/#2/#5/#6)", () => {
    /**
     * Integration tests proving the archive- and close-class zombie
     * defenses survive a simulated process restart. "Restart" is
     * simulated by creating a fresh store backend instance — this
     * clears Memo, overlay cache, and source-version map, forcing the
     * slow path that exercises disk fallback + bundle override (Layer
     * A1) and the disk-first close write (Layer C1).
     *
     * Covers acceptance criteria:
     *   AC #1 — archived NOT in default lists despite stale source dir
     *   AC #2 — closed NOT in default lists despite stale source dir
     *   AC #5 — listResolvedChanges disk-fallback overrides via bundle
     *   AC #6 — closed status reflected in disk fallback
     */
    function buildRestartBundle() {
      const projectHandle = makeProjectHandle();
      const getHandle = vi.fn((workflowId: string) => {
        if (workflowId.startsWith("adv/project/")) return projectHandle;
        return {
          query: vi.fn(async () => {
            throw Object.assign(new Error("workflow not found"), {
              name: "WorkflowNotFoundError",
            });
          }),
          executeUpdate: vi.fn(async () => null),
          signal: vi.fn(async () => {}),
        };
      });
      return {
        client: {
          workflow: {
            getHandle,
            list: vi.fn(() => ({
              async *[Symbol.asyncIterator]() {},
            })),
            start: vi.fn(),
          },
        },
      };
    }

    it("archive-class zombie: simulated restart → list excludes zombie even when source dir persists with stale draft", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "adv-restart-archive-"));
      try {
        const changesDir = join(tmp, "changes");
        const archiveDir = join(tmp, "archive");
        const fs = await import("node:fs/promises");

        const zombieDir = join(changesDir, "chg-restart-archived");
        mkdirSync(zombieDir, { recursive: true });
        const staleDraft = {
          id: "chg-restart-archived",
          title: "Restart-survived archived zombie",
          status: "draft",
          created_at: "2026-04-18T00:00:00.000Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
        };
        await fs.writeFile(
          join(zombieDir, "change.json"),
          JSON.stringify(staleDraft),
        );

        const bundleDir = join(archiveDir, "chg-restart-archived");
        mkdirSync(bundleDir, { recursive: true });
        await fs.writeFile(
          join(bundleDir, "change.json"),
          JSON.stringify({ ...staleDraft, status: "archived" }),
        );

        // Fresh adapter (simulates new process) — Memo + overlay empty
        const legacy = makeLegacyStore();
        legacy.paths.changes = changesDir as any;
        legacy.paths.archive = archiveDir as any;
        legacy.changes.get = vi.fn(async (id: string) => {
          if (id === "chg-restart-archived") {
            return { success: true, data: staleDraft } as any;
          }
          return { success: false } as any;
        });

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: buildRestartBundle() as any,
          projectId: "proj1",
        });

        const list = await adapted.changes.list({});
        expect(
          list.changes.find((c) => c.id === "chg-restart-archived"),
        ).toBeUndefined();
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("closed-class: close() persists status to disk so a simulated restart sees correct closed status", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "adv-restart-closed-"));
      try {
        const changesDir = join(tmp, "changes");
        const fs = await import("node:fs/promises");
        mkdirSync(changesDir, { recursive: true });

        // Step 1: simulate a session where close() runs.
        // The disk-first write must persist status=closed.
        const closeDir = join(changesDir, "chg-restart-closed");
        mkdirSync(closeDir, { recursive: true });
        const draftData = {
          id: "chg-restart-closed",
          title: "Restart-survived close",
          status: "draft",
          created_at: "2026-04-18T00:00:00.000Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
        };
        await fs.writeFile(
          join(closeDir, "change.json"),
          JSON.stringify(draftData),
        );

        const sessionOneState = {
          projectId: "proj1",
          changeId: "chg-restart-closed",
          title: "Restart-survived close",
          initializedAt: "2026-04-18T00:00:00.000Z",
          id: "chg-restart-closed",
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
        };

        const sessionOneHandle = {
          query: vi.fn(async () => sessionOneState),
          executeUpdate: vi.fn(async () => ({
            ...sessionOneState,
            status: "closed",
          })),
          signal: vi.fn(async () => {}),
        };

        // Capture what close() writes to disk
        let lastWrittenChange: any = null;
        const sessionOneLegacy = makeLegacyStore();
        sessionOneLegacy.paths.changes = changesDir as any;
        sessionOneLegacy.changes.save = vi.fn(async (change: any) => {
          lastWrittenChange = change;
          await fs.writeFile(
            join(closeDir, "change.json"),
            JSON.stringify(change),
          );
        });

        const sessionOne = createTemporalStoreBackend({
          legacy: sessionOneLegacy,
          temporal: {
            client: {
              workflow: { getHandle: routeHandle(sessionOneHandle) },
            },
          } as any,
          projectId: "proj1",
        });

        await sessionOne.changes.close("chg-restart-closed", {
          reason: "superseded",
          approved_by_user: true,
          approved_at: "2026-04-18T00:01:00.000Z",
          approval_evidence: "test",
        });

        // Verify disk write persisted closed status
        expect(lastWrittenChange?.status).toBe("closed");

        // Step 2: simulate restart — fresh adapter + workflow-not-found
        // disk-fallback reads the persisted closed status from disk.
        const sessionTwoLegacy = makeLegacyStore();
        sessionTwoLegacy.paths.changes = changesDir as any;
        sessionTwoLegacy.changes.get = vi.fn(async (id: string) => {
          if (id === "chg-restart-closed") {
            const raw = await fs.readFile(
              join(closeDir, "change.json"),
              "utf8",
            );
            return { success: true, data: JSON.parse(raw) } as any;
          }
          return { success: false } as any;
        });

        const sessionTwo = createTemporalStoreBackend({
          legacy: sessionTwoLegacy,
          temporal: buildRestartBundle() as any,
          projectId: "proj1",
        });

        // Default list (no includeClosed) — must exclude the closed change
        const defaultList = await sessionTwo.changes.list({});
        expect(
          defaultList.changes.find((c) => c.id === "chg-restart-closed"),
        ).toBeUndefined();

        // includeClosed: true — surfaces with closed status
        const withClosed = await sessionTwo.changes.list({
          includeClosed: true,
        });
        const found = withClosed.changes.find(
          (c) => c.id === "chg-restart-closed",
        );
        expect(found?.status).toBe("closed");
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("idempotent re-archive: save(archived) called twice does not write to disk (preserves rq-archiveRetirement01.2)", async () => {
      // Note: the original "save() with status=archived ... avoids
      // active-dir disk save" test already verifies single-call
      // behavior. This test extends it to multiple successive calls
      // (the re-archive path) to prove idempotency with respect to
      // disk artifacts.
      const archivedState = {
        projectId: "proj1",
        changeId: "chg-reArchive",
        title: "Re-archive idempotency",
        initializedAt: "2026-04-27T00:00:00.000Z",
        id: "chg-reArchive",
        status: "archived",
        createdAt: "2026-04-27T00:00:00.000Z",
        tasks: [],
        wisdom: [],
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "done" },
        },
        reentry_history: [],
        artifacts: {},
      };

      const changeHandle = {
        query: vi.fn(async () => archivedState),
        executeUpdate: vi.fn(async () => archivedState),
        signal: vi.fn(async () => {}),
      };
      const projectHandle = makeProjectHandle();
      const bundle = {
        client: {
          workflow: { getHandle: routeHandle(changeHandle, projectHandle) },
        },
      };

      const legacy = makeLegacyStore();
      const adapted = createTemporalStoreBackend({
        legacy,
        temporal: bundle as any,
        projectId: "proj1",
      });

      const archivedPayload = {
        id: "chg-reArchive",
        title: "Re-archive idempotency",
        status: "archived" as const,
        created_at: "2026-04-27T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {},
      };

      await adapted.changes.save(archivedPayload as any);
      await adapted.changes.save(archivedPayload as any);
      await adapted.changes.save(archivedPayload as any);

      // rq-archiveRetirement01.2 — disk MUST NOT be written for archived,
      // regardless of how many times save() is called.
      expect(legacy.changes.save).not.toHaveBeenCalled();
    });
  });

  describe("Layer A1: defensive listing via archive bundle existence", () => {
    /**
     * Regression test for the disk-stale archived-zombie class.
     * When `removeChangeDir` cleanup fails (or a process crashes between
     * archive transition and source cleanup), `changes/<id>/change.json`
     * persists on disk with stale `status: "draft"`. On process restart,
     * `listResolvedChanges` falls back to disk via `legacy.changes.get`
     * and would otherwise return the stale draft as a zombie.
     *
     * Layer A1: when the disk-fallback returns non-terminal status BUT
     * `archive/<id>/change.json` exists (durable bundle), override the
     * loaded status to "archived" so default lists exclude it.
     *
     * Spec: rq-archiveRetirement01.1 — "Default active change lists do
     * not include the archived change."
     */
    function buildEmptyVisibilityBundle() {
      const projectHandle = makeProjectHandle();
      const getHandle = vi.fn((workflowId: string) => {
        if (workflowId.startsWith("adv/project/")) return projectHandle;
        return {
          query: vi.fn(async () => {
            throw Object.assign(new Error("workflow not found"), {
              name: "WorkflowNotFoundError",
            });
          }),
          executeUpdate: vi.fn(async () => null),
          signal: vi.fn(async () => {}),
        };
      });
      return {
        client: {
          workflow: {
            getHandle,
            list: vi.fn(() => ({
              async *[Symbol.asyncIterator]() {},
            })),
            start: vi.fn(),
          },
        },
      };
    }

    it("disk-fallback overrides stale draft status to archived when archive bundle exists", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "adv-layer-a1-"));
      try {
        const changesDir = join(tmp, "changes");
        const archiveDir = join(tmp, "archive");
        const fs = await import("node:fs/promises");

        const zombieSourceDir = join(changesDir, "chg-zombie");
        mkdirSync(zombieSourceDir, { recursive: true });
        const staleData = {
          id: "chg-zombie",
          title: "Zombie shadow",
          status: "draft",
          created_at: "2026-04-18T00:00:00.000Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
        };
        await fs.writeFile(
          join(zombieSourceDir, "change.json"),
          JSON.stringify(staleData),
        );

        const bundleDir = join(archiveDir, "chg-zombie");
        mkdirSync(bundleDir, { recursive: true });
        await fs.writeFile(
          join(bundleDir, "change.json"),
          JSON.stringify({ ...staleData, status: "archived" }),
        );

        const bundle = buildEmptyVisibilityBundle();

        const legacy = makeLegacyStore();
        legacy.paths.changes = changesDir as any;
        legacy.paths.archive = archiveDir as any;
        legacy.changes.get = vi.fn(async (id: string) => {
          if (id === "chg-zombie") {
            return { success: true, data: staleData } as any;
          }
          return { success: false } as any;
        });

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        const defaultList = await adapted.changes.list({});
        expect(
          defaultList.changes.find((c) => c.id === "chg-zombie"),
        ).toBeUndefined();

        const withArchived = await adapted.changes.list({
          includeArchived: true,
        });
        const found = withArchived.changes.find((c) => c.id === "chg-zombie");
        expect(found?.status).toBe("archived");
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("disk-fallback preserves draft status when no archive bundle exists (negative case)", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "adv-layer-a1-neg-"));
      try {
        const changesDir = join(tmp, "changes");
        const archiveDir = join(tmp, "archive");
        const fs = await import("node:fs/promises");

        const draftDir = join(changesDir, "chg-active");
        mkdirSync(draftDir, { recursive: true });
        mkdirSync(archiveDir, { recursive: true });
        const draftData = {
          id: "chg-active",
          title: "Active draft",
          status: "draft",
          created_at: "2026-04-18T00:00:00.000Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
        };
        await fs.writeFile(
          join(draftDir, "change.json"),
          JSON.stringify(draftData),
        );

        const bundle = buildEmptyVisibilityBundle();

        const legacy = makeLegacyStore();
        legacy.paths.changes = changesDir as any;
        legacy.paths.archive = archiveDir as any;
        legacy.changes.get = vi.fn(async (id: string) => {
          if (id === "chg-active") {
            return { success: true, data: draftData } as any;
          }
          return { success: false } as any;
        });

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        const result = await adapted.changes.list({});
        const found = result.changes.find((c) => c.id === "chg-active");
        expect(found).toBeDefined();
        expect(found?.status).toBe("draft");
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("multiple zombies in one list call are all classified correctly (cache scenario)", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "adv-layer-a1-multi-"));
      try {
        const changesDir = join(tmp, "changes");
        const archiveDir = join(tmp, "archive");
        const fs = await import("node:fs/promises");

        const zombieIds = ["chg-zombie-1", "chg-zombie-2", "chg-zombie-3"];
        for (const id of zombieIds) {
          const sourceDir = join(changesDir, id);
          mkdirSync(sourceDir, { recursive: true });
          const data = {
            id,
            title: `Zombie ${id}`,
            status: "draft",
            created_at: "2026-04-18T00:00:00.000Z",
            tasks: [],
            deltas: {},
            wisdom: [],
            gates: {},
          };
          await fs.writeFile(
            join(sourceDir, "change.json"),
            JSON.stringify(data),
          );
          const bundleDir = join(archiveDir, id);
          mkdirSync(bundleDir, { recursive: true });
          await fs.writeFile(
            join(bundleDir, "change.json"),
            JSON.stringify({ ...data, status: "archived" }),
          );
        }

        const bundle = buildEmptyVisibilityBundle();

        const legacy = makeLegacyStore();
        legacy.paths.changes = changesDir as any;
        legacy.paths.archive = archiveDir as any;
        legacy.changes.get = vi.fn(async (id: string) => {
          if (zombieIds.includes(id)) {
            return {
              success: true,
              data: {
                id,
                title: `Zombie ${id}`,
                status: "draft",
                created_at: "2026-04-18T00:00:00.000Z",
                tasks: [],
                deltas: {},
                wisdom: [],
                gates: {},
              },
            } as any;
          }
          return { success: false } as any;
        });

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        const defaultList = await adapted.changes.list({});
        for (const id of zombieIds) {
          expect(defaultList.changes.find((c) => c.id === id)).toBeUndefined();
        }

        const withArchived = await adapted.changes.list({
          includeArchived: true,
        });
        for (const id of zombieIds) {
          const found = withArchived.changes.find((c) => c.id === id);
          expect(found?.status).toBe("archived");
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    /**
     * Regression test for the legacy-archive-index bug.
     *
     * After fixStaleDraftShadowsArchiving (2026-05-01), newly-archived changes
     * are correctly removed from the active `changes/<id>/` source dir per
     * rq-archiveRetirement01.1. But `listResolvedChanges` did not list the
     * `archive/` directory when the caller requested terminal statuses, so
     * archive-only IDs (no shadow on disk, no Temporal workflow) were
     * invisible to `adv_change_list({ status: "archived" })` and to the
     * `includeArchived: true` filter.
     *
     * Reproduction: a project with archive bundles but no source-dir shadow
     * and no Temporal-workflow record should still surface those archives.
     *
     * Spec: rq-archiveRetirement01.1 — archived changes must be discoverable
     * via the archive bundle as the durable terminal record.
     */
    it("discovers archive-only changes when caller requests terminal statuses", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "adv-archive-only-"));
      try {
        const changesDir = join(tmp, "changes");
        const archiveDir = join(tmp, "archive");
        const fs = await import("node:fs/promises");

        // Active changes dir is empty (no shadow). Archive dir has 3 bundles.
        mkdirSync(changesDir, { recursive: true });
        mkdirSync(archiveDir, { recursive: true });

        const archivedIds = ["chg-a", "chg-b", "chg-c"];
        for (const id of archivedIds) {
          const bundleDir = join(archiveDir, id);
          mkdirSync(bundleDir, { recursive: true });
          await fs.writeFile(
            join(bundleDir, "change.json"),
            JSON.stringify({
              id,
              title: `Archived change ${id}`,
              status: "archived",
              created_at: "2026-04-18T00:00:00.000Z",
              tasks: [],
              deltas: {},
              wisdom: [],
              gates: {},
            }),
          );
        }

        const bundle = buildEmptyVisibilityBundle();

        const legacy = makeLegacyStore();
        legacy.paths.changes = changesDir as any;
        legacy.paths.archive = archiveDir as any;
        // No source-dir shadow → legacy.changes.get returns failure for
        // every id.
        legacy.changes.get = vi.fn(async () => ({ success: false }) as any);

        const adapted = createTemporalStoreBackend({
          legacy,
          temporal: bundle as any,
          projectId: "proj1",
        });

        const withArchived = await adapted.changes.list({
          includeArchived: true,
        });

        for (const id of archivedIds) {
          const found = withArchived.changes.find((c) => c.id === id);
          expect(
            found,
            `archive-only id ${id} missing from listing`,
          ).toBeDefined();
          expect(found?.status).toBe("archived");
        }

        // Default list (no includeArchived) must NOT include them.
        const defaultList = await adapted.changes.list({});
        for (const id of archivedIds) {
          expect(defaultList.changes.find((c) => c.id === id)).toBeUndefined();
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
