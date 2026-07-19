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

/**
 * Path-scoped `listChangeDirs` slowdown map (AC1 / AC5 / C2 disk-deadline
 * tests). Entries map an absolute directory path to a fake-timer delay in
 * milliseconds; when a path is present the mock waits that long before
 * delegating to the real `listChangeDirs`. Default behaviour is an
 * unmodified pass-through, so every existing test in this file keeps
 * working without opt-in.
 *
 * Using a delay LONGER than `TEMPORAL_READ_DEADLINE_BUDGET_MS` simulates
 * the slow-NFS / hung-FUSE failure mode without forcing the test itself
 * to hang when the deadline wrapper is absent (RED) — the mock still
 * resolves once fake time advances past the delay, so the post-fix
 * assertions can run.
 */
const SLOW_LIST_CHANGE_DIRS = new Map<string, number>();

/**
 * Path-scoped `loadChange` slowdown map (candidate archive-fallback
 * deadline tests). Entries map an absolute archive root path to a
 * fake-timer delay in milliseconds; when the root path matches, the mock
 * waits that long before delegating to the real `loadChange`.
 */
const SLOW_LOAD_CHANGE = new Map<string, number>();

/**
 * Call-count map for `hasArchiveBundle` (archive-fallback deadline test).
 * The first call for a given changeId returns false (so
 * `loadTerminalProjection` short-circuits and the workflow query is
 * exercised); subsequent calls return true (so `checkArchiveBundle`
 * admits the archive-only fallback path).
 */
const HAS_ARCHIVE_BUNDLE_CALLS = new Map<string, number>();

/**
 * Path-scoped single-shot start-barriers (AC5 explicit-barrier fix).
 * Each slow-read listChangeDirs mock call resolves the barrier mapped to
 * its directory path before scheduling its slow fake setTimeout, so
 * tests can `await awaitListChangeDirsStart(path)` to deterministically
 * observe the moment the mocked op is in flight. This replaces the
 * previous `runAllTimersAsync` spin-loops that guessed how many
 * event-loop turns the fs chain needed before the slow-read setTimeout
 * even existed.
 *
 * The barrier is single-shot per (test, path): a fresh barrier must be
 * registered before each test calls `awaitListChangeDirsStart`, and the
 * map is cleared in `beforeEach`/`afterEach`.
 */
const LIST_CHANGE_DIRS_START_BARRIERS = new Map<string, () => void>();

/**
 * Register a one-shot promise for the next `listChangeDirs` call against
 * `path`. The slow-read mock resolves the promise the instant it enters
 * its delay branch, releasing the awaiting test without any
 * microtask-flight-spinning.
 */
function awaitListChangeDirsStart(path: string): Promise<void> {
  return new Promise<void>((resolve) => {
    LIST_CHANGE_DIRS_START_BARRIERS.set(path, resolve);
  });
}

function clearListChangeDirsStartBarriers(): void {
  LIST_CHANGE_DIRS_START_BARRIERS.clear();
}

vi.mock("../json", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../json")>();
  return {
    ...actual,
    listChangeDirs: async (path: string): Promise<string[]> => {
      const delay = SLOW_LIST_CHANGE_DIRS.get(path);
      if (delay !== undefined) {
        // Release the explicit test barrier synchronously before
        // scheduling the slow fake-timer setTimeout. Without this
        // handshake the test has no deterministic signal that the
        // mocked op has started — it would have to loop
        // `runAllTimersAsync` until the chain happens to settle.
        LIST_CHANGE_DIRS_START_BARRIERS.get(path)?.();
        // Look up setTimeout at call time so vitest's fake-timer install
        // (in beforeEach) is observed; binding it at mock-factory time
        // would capture the real timer and break advanceTimersByTimeAsync.
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, delay);
        });
      }
      return actual.listChangeDirs(path);
    },
    loadChange: async (
      archivePath: string,
      changeId: string,
    ): ReturnType<typeof actual.loadChange> => {
      const delay = SLOW_LOAD_CHANGE.get(archivePath);
      if (delay !== undefined) {
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, delay);
        });
      }
      return actual.loadChange(archivePath, changeId);
    },
    hasArchiveBundle: async (
      archivePath: string,
      changeId: string,
    ): Promise<boolean> => {
      // Archive-fallback deadline test only: force the first call to
      // false so loadTerminalProjection short-circuits and the workflow
      // query is exercised. All other tests delegate unchanged.
      if (changeId === "slowArchiveFallback") {
        const count = (HAS_ARCHIVE_BUNDLE_CALLS.get(changeId) ?? 0) + 1;
        HAS_ARCHIVE_BUNDLE_CALLS.set(changeId, count);
        if (count === 1) return false;
      }
      return actual.hasArchiveBundle(archivePath, changeId);
    },
  };
});

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
    SLOW_LIST_CHANGE_DIRS.clear();
    SLOW_LOAD_CHANGE.clear();
    HAS_ARCHIVE_BUNDLE_CALLS.clear();
    clearListChangeDirsStartBarriers();
  });

  afterEach(async () => {
    SLOW_LIST_CHANGE_DIRS.clear();
    SLOW_LOAD_CHANGE.clear();
    HAS_ARCHIVE_BUNDLE_CALLS.clear();
    clearListChangeDirsStartBarriers();
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

    // Budget was already gone when the pre-scan, archive enumeration,
    // and candidate loop would have started: no fallback disk reads
    // were attempted and the result is explicitly degraded (DONT3 / C2).
    // With AC1/AC5 the archive enumeration itself is deadline-gated, so
    // the archived candidate is never even discovered — the result
    // surfaces typed per-source deadline degradation rather than a
    // candidate-level omission.
    expect(archiveGetCalls).toBe(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SOURCE_DEADLINE_EXCEEDED",
          source: "visibility",
        }),
        expect.objectContaining({
          code: "SOURCE_DEADLINE_EXCEEDED",
          source: "archive",
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
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
    // Yield to the event loop so the un-slowed disk enumeration resolves
    // via real I/O before the fake clock advances. Under
    // vi.useFakeTimers(), advanceTimersByTimeAsync fires fake timers
    // during its synchronous advance phase — without this yield, the
    // disk-race timer would reject before the fs callback fires.
    await vi.advanceTimersByTimeAsync(0);
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

  it("returns typed deadline degradation when listSummary active-disk listChangeDirs hangs (AC1/AC5)", async () => {
    // Scope of this regression test (fixChangeListTimeouts task 5): the
    // raw `listChangeDirs(legacy.paths.changes)` call in
    // `changes.ts:listSummary` was outside the aggregate deadline, so a
    // hung active-disk enumeration could outlive the 8s budget and drag
    // `adv_status` (view: "summary") with it. The fix mirrors the
    // already-deadline-wrapped pattern in `index.ts` (line 867).
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    // An active change on disk + visibility so the two sources agree on
    // one candidate; the warm-cache row is seeded below.
    await legacy.changes.save(activeChange("activeOne"));

    const memo = new ChangeSummaryMemo();
    const seededCache = new Map<string, Change>();

    let queryCount = 0;
    const getTemporalChange = vi.fn().mockImplementation(async () => {
      queryCount += 1;
      return {
        success: true as const,
        data: activeChange("activeOne"),
      };
    });
    const workflowClient = {
      workflow: {
        getHandle: vi.fn(),
        // Visibility enumerates quickly so the failure attribution is
        // specific to the active-disk source.
        list: async function* () {
          yield { workflowId: "adv/change/project-1/activeOne" };
        },
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

    // Hang the active-disk enumeration past the aggregate budget.
    // Visibility still resolves so the failure attribution is specific
    // to the active-disk source.
    SLOW_LIST_CHANGE_DIRS.set(
      legacy.paths.changes,
      TEMPORAL_READ_DEADLINE_BUDGET_MS + 2_000,
    );

    // Explicit one-shot start-barrier (AC5): the slow-read mock fires
    // `LIST_CHANGE_DIRS_START_BARRIERS.get(path)` synchronously when it
    // enters the delay branch, so the `await` below releases only once
    // the mocked op has actually scheduled its fake-timer setTimeout.
    // This replaces the runAllTimersAsync spin-loop — no more guessing
    // how many event-loop turns the fs chain needs.
    const startBarrier = awaitListChangeDirsStart(legacy.paths.changes);
    const pending = ops.listSummary!({});
    await startBarrier;
    // Advance past the aggregate budget. The deadline wrapper rejects
    // the slow read.
    await vi.advanceTimersByTimeAsync(TEMPORAL_READ_DEADLINE_BUDGET_MS + 1000);
    const result = await pending;

    // Typed source-specific deadline degradation on the active-disk
    // source — never a silent complete-looking result (C2/AC5). The
    // visibility candidate was admitted but could not be hydrated after
    // the budget was gone, so the row is omitted and hydration stops.
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SOURCE_DEADLINE_EXCEEDED",
          source: "active_disk",
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
    });
    expect(queryCount).toBe(0);
    expect(result.changes.map((c) => c.id)).not.toContain("activeOne");
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
    vi.useRealTimers();
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

    let queryStarted: (() => void) | undefined;
    const queryStartBarrier = new Promise<void>((resolve) => {
      queryStarted = resolve;
    });
    let queryCount = 0;
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCount += 1;
              queryStarted?.();
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
    // Wait until the hung query's first attempt has actually started —
    // fixture-driven one-shot barrier instead of guessing how many
    // event-loop turns the fs chain needs. The fake clock is frozen during
    // this wait, so the aggregate deadline cannot expire here.
    await queryStartBarrier;
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

  it("bounds candidate disk fallback reads after fast Temporal failure", async () => {
    // Fake only the timeout machinery; leave setImmediate real so fs reads
    // and async-generator enumeration drain deterministically.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("slowDiskFallback"));

    // Temporal query fails fast — the fallback read path is exercised.
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              throw workflowNotFoundError();
            },
          }),
          list: async function* () {
            yield { workflowId: "adv/change/project-1/slowDiskFallback" };
          },
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    };

    // Make the disk fallback read hang indefinitely. Calls come from:
    //   1. loadDiskTerminalProjection inside getTemporalChange (fast)
    //   2. getGuardedChangeHandle inside getTemporalChange (fast)
    //   3. reseedChangeFromDisk inside getTemporalChange (fast)
    //   4. loadCandidate fallback chain after fast Temporal failure (hang)
    // Without the deadline wrapper the fallback read never resolves and the
    // test times out (RED); with the wrapper the aggregate deadline rejects
    // it and the candidate becomes a typed omission (GREEN).
    let fallbackStarted: (() => void) | undefined;
    const fallbackStartBarrier = new Promise<void>((resolve) => {
      fallbackStarted = resolve;
    });
    const diskGetCalls = new Map<string, number>();
    const realGet = legacy.changes.get.bind(legacy.changes);
    legacy.changes.get = (async (changeId: string) => {
      const count = (diskGetCalls.get(changeId) ?? 0) + 1;
      diskGetCalls.set(changeId, count);
      if (count <= 3) {
        // loadDiskTerminalProjection + getGuardedChangeHandle + reseedChangeFromDisk — fast
        return realGet(changeId);
      }
      // loadCandidate fallback — hang indefinitely
      fallbackStarted?.();
      return new Promise<never>(() => {});
    }) as typeof legacy.changes.get;

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });

    const pending = store.changes.list({ includeArchived: true });
    // Wait for the fallback read to start — source enumeration, the fast
    // Temporal failure, the terminal-projection disk read, the owner-guard
    // disk read, and the reseed disk read have already happened. The fourth
    // diskGet call is the loadCandidate fallback.
    await fallbackStartBarrier;
    expect(diskGetCalls.get("slowDiskFallback")).toBe(4);
    // Advance past the budget. The deadline wrapper (if present) rejects
    // the fallback read. Without the wrapper, the read hangs and the test
    // times out (RED).
    await vi.advanceTimersByTimeAsync(TEMPORAL_READ_DEADLINE_BUDGET_MS + 1000);
    const result = await pending;

    // The disk fallback read is bounded by the aggregate deadline.
    // The candidate is omitted with typed incompleteness — never a hang.
    expect(result.changes.map((c) => c.id)).not.toContain("slowDiskFallback");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SOURCE_DEADLINE_EXCEEDED",
          source: "workflow_query",
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
    });
  }, 15_000);

  it("bounds candidate archive fallback reads after fast Temporal failure", async () => {
    // Fake only the timeout machinery; leave setImmediate real so fs reads
    // and async-generator enumeration drain deterministically.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await writeArchiveBundle(tempDir, archivedChange("slowArchiveFallback"));

    // Temporal query fails fast — the archive fallback path is exercised.
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              throw workflowNotFoundError();
            },
          }),
          list: async function* () {
            yield { workflowId: "adv/change/project-1/slowArchiveFallback" };
          },
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    };

    // No disk shadow — legacy.changes.get returns success: false so the
    // archive-only fallback (loadChange) is exercised.
    let diskGetStarted: (() => void) | undefined;
    const diskGetStartBarrier = new Promise<void>((resolve) => {
      diskGetStarted = resolve;
    });
    let diskGetCalls = 0;
    const realGet = legacy.changes.get.bind(legacy.changes);
    legacy.changes.get = (async (changeId: string) => {
      diskGetStarted?.();
      diskGetCalls += 1;
      const result = await realGet(changeId);
      if (!result.success) {
        return { success: false as const, error: "not found" };
      }
      return result;
    }) as typeof legacy.changes.get;

    // Make the archive fallback load hang past the aggregate budget.
    SLOW_LOAD_CHANGE.set(
      legacy.paths.archive,
      TEMPORAL_READ_DEADLINE_BUDGET_MS + 2_000,
    );

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });

    const pending = store.changes.list({ includeArchived: true });
    // Wait for the disk fallback read to start — source enumeration and
    // the fast Temporal failure have already happened.
    await diskGetStartBarrier;
    expect(diskGetCalls).toBe(1);
    // Advance past the budget. The deadline wrapper (if present) rejects
    // the fallback read. Without the wrapper, the read hangs and the test
    // times out (RED).
    await vi.advanceTimersByTimeAsync(TEMPORAL_READ_DEADLINE_BUDGET_MS + 1000);
    const result = await pending;

    // The archive fallback read is bounded by the aggregate deadline.
    // The candidate is omitted with typed incompleteness — never a hang.
    expect(result.changes.map((c) => c.id)).not.toContain(
      "slowArchiveFallback",
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TERMINAL_CANDIDATE_OMITTED",
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
    });
  }, 15_000);

  it("returns typed deadline degradation when active-disk listChangeDirs hangs (AC1/AC5)", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activeOne"));

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

    // Hang the active-disk enumeration past the aggregate budget.
    // Visibility still resolves so the failure attribution is specific
    // to the active-disk source.
    SLOW_LIST_CHANGE_DIRS.set(
      legacy.paths.changes,
      TEMPORAL_READ_DEADLINE_BUDGET_MS + 2_000,
    );

    // Explicit one-shot start-barrier (AC5): the slow-read mock fires
    // the barrier the instant it enters its delay branch, releasing the
    // test from scheduler-turn spinning. Then we advance past the
    // aggregate budget so the deadline wrapper rejects.
    const startBarrier = awaitListChangeDirsStart(legacy.paths.changes);
    const pending = store.changes.list({});
    await startBarrier;
    await vi.advanceTimersByTimeAsync(TEMPORAL_READ_DEADLINE_BUDGET_MS + 1000);
    const result = await pending;

    // Typed source-specific deadline degradation on the active path —
    // never a silent complete-looking result (C2/AC5).
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SOURCE_DEADLINE_EXCEEDED",
          source: "active_disk",
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
    });

    // Subsequent unbounded work is stopped: once the aggregate budget is
    // gone, no hydration queries may begin — the visibility-discovered
    // candidate is a typed deadline omission rather than a fresh load.
    expect(queryCount).toBe(0);
    expect(result.changes.map((c) => c.id)).not.toContain("activeOne");
  });

  it("returns typed deadline degradation when archive listChangeDirs hangs (AC1/AC5)", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activeOne"));
    await writeArchiveBundle(tempDir, archivedChange("archivedOne"));

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => workflowStateFor(activeChange("activeOne")),
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

    // Hang only the archive enumeration. Active-disk and visibility
    // resolve normally, isolating archive-specific deadline attribution.
    SLOW_LIST_CHANGE_DIRS.set(
      legacy.paths.archive,
      TEMPORAL_READ_DEADLINE_BUDGET_MS + 2_000,
    );

    // Explicit one-shot start-barrier (AC5): wait for the archive
    // mock to enter its delay branch — visibility and active-disk
    // enumeration resolve first, then the archive slow-read
    // setTimeout is scheduled. The barrier fires once the archive
    // mock is in flight, so we no longer loop runAllTimersAsync
    // waiting for the slow-read timer to materialize.
    const startBarrier = awaitListChangeDirsStart(legacy.paths.archive);
    const pending = store.changes.list({ includeArchived: true });
    await startBarrier;
    // Advance past the aggregate budget so the deadline wrapper
    // rejects the slow archive enumeration (GREEN). Without the
    // wrapper, the archive read hangs and the test times out
    // (RED).
    await vi.advanceTimersByTimeAsync(TEMPORAL_READ_DEADLINE_BUDGET_MS + 1000);
    const result = await pending;

    // Archive-source deadline is typed with source identity; the active
    // row that did resolve still surfaces (compatibility), but the
    // result is explicitly degraded — never a silent complete (C2/AC5).
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SOURCE_DEADLINE_EXCEEDED",
          source: "archive",
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      deadlineExceeded: true,
    });
    // The archived candidate could not be admitted once the budget was
    // gone — typed incompleteness rather than a hang or silent drop.
    expect(result.changes.map((c) => c.id)).not.toContain("archivedOne");
  });

  it("preserves compatibility: fast active-disk and archive enumeration emits no deadline degradation", async () => {
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

    // No entry in SLOW_LIST_CHANGE_DIRS — disk enumeration resolves
    // immediately. Both paths must produce a clean, complete result.
    const activeResult = await store.changes.list({});
    expect(activeResult.changes.map((c) => c.id)).toContain("fastActive");
    expect(activeResult.warnings).toBeUndefined();

    const terminalResult = await store.changes.list({
      includeArchived: true,
    });
    expect(terminalResult.changes.map((c) => c.id).sort()).toEqual([
      "fastActive",
      "fastArchived",
    ]);
    expect(terminalResult.warnings).toBeUndefined();
    expect(
      (terminalResult.hydrationStats as { deadlineExceeded?: boolean })
        ?.deadlineExceeded,
    ).toBeFalsy();
  });
});
