/**
 * Bounded one-pass change-list resolution (fixChangeListTimeouts, task 2).
 *
 * Verifies:
 *  1. One load per candidate — terminal classification no longer re-runs the
 *     per-candidate load chain (KD2 / design criterion 3).
 *  2. Visibility/archive source deadline → typed degradation, bounded return
 *     (AC1 / AC5 / C2 / C4).
 *  3. Archive bundle pre-scan expiry → skipped work + typed incompleteness
 *     (DONT3).
 *  4. Cold listSummary hydration misses honor the aggregate deadline with
 *     typed degradation while warm/cache rows still surface (AC1 / AC6).
 *  5. Complete path: when everything resolves within budget, no deadline
 *     degradation metadata is emitted (AC2).
 *  6. A hanging candidate query produces typed incompleteness without
 *     re-entering retry loops after expiry (design execution note 2).
 *
 * Timing tests use vi fake timers and controllable promises — never
 * wall-clock sleeps (design-derived criterion 5).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";
import { createChangeOps } from "./changes";
import { ChangeSummaryMemo } from "../store-temporal-memo";
import { TEMPORAL_READ_DEADLINE_BUDGET_MS } from "./shared";

function workflowNotFoundError(): Error {
  return new Error(
    "Workflow execution not found for workflowId: change-project-1-test",
  );
}

function archivedChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Archived ${id}`,
    status: "archived",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: Object.fromEntries(
      Object.entries(createDefaultGates()).map(([gate, value]) => [
        gate,
        { ...value, status: "done" as const },
      ]),
    ) as Change["gates"],
    reentry_history: [],
    wisdom: [],
  };
}

function closedChange(id: string): Change {
  return {
    ...archivedChange(id),
    title: `Closed ${id}`,
    status: "closed",
  };
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

function workflowStateFor(change: Change) {
  return {
    id: change.id,
    changeId: change.id,
    title: change.title,
    status: change.status,
    createdAt: change.created_at,
    initializedAt: change.created_at,
    projectId: "project-1",
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
    // Marker present so the lazy worktree_auto_managed migration hook
    // does not fire an extra owner-guard read per query.
    worktree_auto_managed: false,
  };
}

async function writeArchiveBundle(tempDir: string, change: Change) {
  const archiveDir = join(tempDir, ".adv", "archive", change.id);
  await mkdir(archiveDir, { recursive: true });
  await writeFile(
    join(archiveDir, "change.json"),
    JSON.stringify(change, null, 2),
  );
}

describe("bounded one-pass change-list resolution", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("loads each candidate exactly once for terminal lists (no duplicate classification reload)", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    // closedOne: closed disk shadow — terminal-projection path reads disk.
    await legacy.changes.save(closedChange("closedOne"));
    // activeOne: active disk shadow + live workflow.
    await legacy.changes.save(activeChange("activeOne"));

    const diskGetCalls = new Map<string, number>();
    const realGet = legacy.changes.get.bind(legacy.changes);
    legacy.changes.get = (async (changeId: string) => {
      diskGetCalls.set(changeId, (diskGetCalls.get(changeId) ?? 0) + 1);
      return realGet(changeId);
    }) as typeof legacy.changes.get;

    let queryCount = 0;
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCount += 1;
              return workflowStateFor(activeChange("activeOne"));
            },
          }),
          list: async function* () {
            yield { workflowId: "adv/change/project-1/activeOne" };
          },
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });

    const result = await store.changes.list({ includeClosed: true });
    expect(result.changes.map((c) => c.id).sort()).toEqual([
      "activeOne",
      "closedOne",
    ]);
    expect(result.warnings).toBeUndefined();

    // Regression guard: the removed second classification pass used to
    // re-run the whole load chain per candidate. closedOne went through
    // the terminal-projection disk read exactly once; activeOne once for
    // the terminal-dominance check plus once for the owner guard inside
    // the live query.
    expect(diskGetCalls.get("closedOne")).toBe(1);
    expect(diskGetCalls.get("activeOne")).toBe(2);
    expect(queryCount).toBe(1);
  });

  it("returns typed deadline degradation when the visibility source hangs", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await writeArchiveBundle(tempDir, archivedChange("archivedOne"));

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              throw workflowNotFoundError();
            },
          }),
          // Visibility enumeration hangs indefinitely.
          list: async function* () {
            await new Promise<never>(() => {});
            yield { workflowId: "unreachable" };
          },
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });

    const pending = store.changes.list({ includeArchived: true });
    await vi.advanceTimersByTimeAsync(TEMPORAL_READ_DEADLINE_BUDGET_MS + 1000);
    const result = await pending;

    // The archived row cannot be admitted once the aggregate budget is
    // exhausted — it is omitted with typed incompleteness rather than
    // hanging the tool (AC1 / AC5).
    expect(result.changes.map((c) => c.id)).not.toContain("archivedOne");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SOURCE_DEADLINE_EXCEEDED",
          source: "visibility",
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
    });
  });

  it("stops the archive pre-scan and candidate loads once the aggregate budget is exhausted", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await writeArchiveBundle(tempDir, archivedChange("archivedTwo"));

    let archiveGetCalls = 0;
    const realGet = legacy.changes.get.bind(legacy.changes);
    legacy.changes.get = (async (changeId: string) => {
      archiveGetCalls += 1;
      return realGet(changeId);
    }) as typeof legacy.changes.get;

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              throw workflowNotFoundError();
            },
          }),
          // Visibility succeeds but consumes the entire aggregate budget.
          list: async function* () {
            await vi.advanceTimersByTimeAsync(
              TEMPORAL_READ_DEADLINE_BUDGET_MS + 1,
            );
            yield { workflowId: "adv/change/project-1/archivedTwo" };
          },
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });

    const result = await store.changes.list({ includeArchived: true });

    // Budget was already gone when the pre-scan and candidate loop would
    // have started: no fallback disk reads were attempted and the result
    // is explicitly degraded (DONT3 / C2).
    expect(archiveGetCalls).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SOURCE_DEADLINE_EXCEEDED",
        }),
        expect.objectContaining({
          code: "TERMINAL_CANDIDATE_OMITTED",
          omittedCount: 1,
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
      omitted: 1,
    });
  });

  it("bounds cold listSummary hydration misses and keeps warm rows with typed degradation", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("coldOne"));
    // warmOne must be disk-enumerated to enter the candidate set; the
    // seeded changeCache then serves it without hydration.
    await legacy.changes.save(activeChange("warmOne"));

    const memo = new ChangeSummaryMemo();
    const seededCache = new Map<string, Change>();
    seededCache.set("warmOne", activeChange("warmOne"));

    const getTemporalChange = vi
      .fn()
      .mockImplementation(() => new Promise<never>(() => {}));
    const workflowClient = {
      workflow: {
        getHandle: vi.fn(),
      },
    };

    const ops = createChangeOps({
      input: {
        legacy,
        temporal: { client: workflowClient },
        projectId: "project-1",
      },
      legacy,
      invalidateChange: vi.fn(),
      updateOverlay: vi.fn(),
      emitChangeSummarySignal: vi.fn(),
      indexTasksFromState: vi.fn(),
      setCachedChange: vi.fn(),
      getTemporalChange,
      listResolvedChanges: vi.fn(),
      getTemporalWorkflowClient: () => workflowClient,
      dualWriteAfterMutation: vi.fn(),
      memo,
      changeCache: seededCache,
    } as never);

    const pending = ops.listSummary!({});
    await vi.advanceTimersByTimeAsync(TEMPORAL_READ_DEADLINE_BUDGET_MS + 1000);
    const result = await pending;

    // Warm cache row survives; the cold miss is typed degradation, not a
    // hang and not a silent omission (AC1 / AC6 / C2).
    expect(result.changes.map((c) => c.id)).toContain("warmOne");
    expect(result.changes.map((c) => c.id)).not.toContain("coldOne");
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SOURCE_DEADLINE_EXCEEDED",
        }),
      ]),
    );
  });

  it("returns complete results without deadline metadata when sources resolve within budget", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("fastActive"));
    await writeArchiveBundle(tempDir, archivedChange("fastArchived"));

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => workflowStateFor(activeChange("fastActive")),
          }),
          list: async function* () {
            yield { workflowId: "adv/change/project-1/fastActive" };
          },
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });

    const result = await store.changes.list({ includeArchived: true });
    expect(result.changes.map((c) => c.id).sort()).toEqual([
      "fastActive",
      "fastArchived",
    ]);
    expect(result.warnings).toBeUndefined();
    expect(result.hydrationStats).toMatchObject({
      terminalCandidates: 1,
      terminalFromArchive: 1,
      omitted: 0,
    });
    expect(
      (result.hydrationStats as { deadlineExceeded?: boolean })
        ?.deadlineExceeded,
    ).toBeFalsy();
  });

  it("treats a hanging candidate query as typed incompleteness without post-expiry retry loops", async () => {
    // Fake only the timeout machinery (setTimeout/Date); leave setImmediate
    // real so fs reads and async-generator enumeration drain deterministically
    // at t=0 instead of at unpredictable advanced-clock positions.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await writeArchiveBundle(tempDir, archivedChange("hungArchived"));
    // The archive bundle's change.json is unreadable, so the bundle load
    // fails and the live workflow query is the only possible source.
    await writeFile(
      join(tempDir, ".adv", "archive", "hungArchived", "change.json"),
      "not valid json",
    );

    let queryCount = 0;
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCount += 1;
              return new Promise<never>(() => {});
            },
          }),
          list: async function* () {
            yield { workflowId: "adv/change/project-1/hungArchived" };
          },
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });

    const pending = store.changes.list({ includeArchived: true });
    // Settle timer-free stages (enumeration, terminal-projection checks)
    // at t=0 by waiting until the hung query's first attempt has actually
    // started — fixture-driven synchronization instead of guessing how
    // many event-loop turns the fs chain needs. The fake clock is frozen
    // during this wait, so the aggregate deadline cannot expire here.
    for (let i = 0; i < 5000 && queryCount === 0; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(queryCount).toBe(1);
    // Attempt-1 per-attempt timeout (5s) fires.
    await vi.advanceTimersByTimeAsync(5000);
    // Backoff (250ms) elapses; if the reconnect hook settles, attempt 2
    // starts capped to the remaining budget.
    await vi.advanceTimersByTimeAsync(250);
    // Attempt-2 timeout (remaining ~2.75s) and the outer race both fire;
    // the retry wrapper refuses further work once the budget is gone.
    await vi.advanceTimersByTimeAsync(3000);
    const result = await pending;

    // The retry wrapper caps attempts and refuses new work after expiry:
    // at most 3 query attempts, then typed omission — no further loops.
    expect(queryCount).toBeGreaterThan(0);
    expect(queryCount).toBeLessThanOrEqual(3);
    expect(result.changes.map((c) => c.id)).not.toContain("hungArchived");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TERMINAL_CANDIDATE_OMITTED",
          omittedCount: 1,
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
      omitted: 1,
    });
  }, 15_000);
});
