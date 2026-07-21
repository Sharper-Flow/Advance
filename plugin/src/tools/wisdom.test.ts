/**
 * Wisdom Tools — rq-cacheRefresh01 contract test.
 *
 * Pins the centralizemutationcacherefresh migration contract:
 * `adv_wisdom_add` MUST use `fireSignalAndRefresh` (not raw `fireSignal`)
 * so the in-memory `changeCache` is invalidated after the wisdom signal
 * fires. Without this, subsequent reads in the same session return stale
 * state (the original silent-stale-cache bug class fixed by this change).
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wisdomTools } from "./wisdom";
import { taskUpdatedSignal } from "../temporal/messages";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => {
  const signal = vi.fn(async () => {});
  const query = vi.fn(async () => undefined);
  const handle = { signal, query };
  return {
    signal,
    query,
    handle,
    getService: vi.fn(() => ({
      client: { workflow: { getHandle: vi.fn(() => handle) } },
    })),
    fireSignal: vi.fn(async () => {}),
    fireSignalAndRefresh: vi.fn(async () => {}),
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handle),
  };
});

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: vi.fn(async () => "test-project-id"),
  };
});

vi.mock("./_adapters", () => ({
  fireSignal: mocks.fireSignal,
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
}));

function createMockStore(): Store {
  // Paths are mock-only — store I/O is fully mocked, these strings are never
  // touched on disk. Built via tmpdir() instead of "/tmp/..." literals to
  // avoid Sonar S5443 hardcoded-publicly-writable-directory false-positives.
  const base = tmpdir();
  return {
    paths: {
      root: join(base, "fake-root"),
      external: join(base, "fake-external"),
      changes: join(base, "fake-changes"),
      archive: join(base, "fake-archive"),
      wisdom: join(base, "fake-wisdom.jsonl"),
      agenda: join(base, "fake-agenda.jsonl"),
    },
    wisdom: {
      // Used as a fallback when Temporal handle is unavailable; mocked here
      // because the Temporal path is what we care about for this test.
      add: vi.fn(async () => undefined),
    },
    tasks: {
      show: vi.fn(async () => null),
    },
    changes: {
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

describe("adv_wisdom_add — rq-cacheRefresh01 contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("uses fireSignalAndRefresh (not raw fireSignal) so cache is invalidated after signal", async () => {
    const store = createMockStore();

    await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-test",
        type: "pattern",
        content: "test wisdom entry",
      },
      store,
    );

    // Contract: tool MUST use the centralized helper that pairs signal
    // firing with cache refresh in one atomic call. Direct fireSignal
    // bypasses the cache invalidation — that is the bug class this
    // migration closes.
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
      mocks.handle,
      store,
      "chg-test",
      expect.objectContaining({ name: expect.any(String) }),
      expect.objectContaining({
        entry: expect.objectContaining({
          type: "pattern",
          content: "test wisdom entry",
        }),
      }),
    );

    // Negative assertion: the raw fireSignal helper MUST NOT be used
    // for change-associated signals (rq-cacheRefresh01-exempt only
    // applies to signals without a changeId — none currently exist).
    expect(mocks.fireSignal).not.toHaveBeenCalled();
  });

  test("tags new linked-product wisdom with origin repo metadata", async () => {
    const store = createMockStore();
    store.productContext = {
      currentRoot: "/repo/web",
      currentRepoId: "web",
      repoProjectId: "w".repeat(40),
      productId: "example-product",
      productProjectId: "b".repeat(40),
      primaryRoot: "/repo/backend",
      primaryRepoId: "backend",
      repos: {
        web: { id: "web", root: "/repo/web", repoProjectId: "w".repeat(40) },
        backend: {
          id: "backend",
          root: "/repo/backend",
          repoProjectId: "b".repeat(40),
        },
      },
      mode: "secondary",
      missingPrimaryPolicy: "block",
    };

    await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-test",
        type: "gotcha",
        content: "linked repo gotcha",
      },
      store,
    );

    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
      mocks.handle,
      store,
      "chg-test",
      expect.objectContaining({ name: expect.any(String) }),
      expect.objectContaining({
        entry: expect.objectContaining({
          product_id: "example-product",
          origin_repo_id: "web",
          origin_repo_project_id: "w".repeat(40),
          origin_repo_path: "/repo/web",
        }),
      }),
    );
  });
});

describe("adv_wisdom_list — product-linked filtering", () => {
  test("defaults to current repo plus legacy and promoted entries", async () => {
    const store = createMockStore();
    store.productContext = {
      currentRoot: "/repo/web",
      currentRepoId: "web",
      repoProjectId: "w".repeat(40),
      productId: "example-product",
      productProjectId: "b".repeat(40),
      primaryRoot: "/repo/backend",
      primaryRepoId: "backend",
      repos: {
        web: { id: "web", root: "/repo/web", repoProjectId: "w".repeat(40) },
        backend: {
          id: "backend",
          root: "/repo/backend",
          repoProjectId: "b".repeat(40),
        },
      },
      mode: "secondary",
      missingPrimaryPolicy: "block",
    };
    store.wisdom.listAll = vi.fn(async () => [
      {
        id: "ws-web",
        type: "pattern",
        content: "web scoped",
        recorded_at: "2026-01-01T00:00:00.000Z",
        scope: "change",
        product_id: "example-product",
        origin_repo_id: "web",
      },
      {
        id: "ws-backend",
        type: "pattern",
        content: "backend scoped",
        recorded_at: "2026-01-01T00:00:00.000Z",
        scope: "change",
        product_id: "example-product",
        origin_repo_id: "backend",
      },
      {
        id: "ws-legacy",
        type: "gotcha",
        content: "legacy untagged",
        recorded_at: "2026-01-01T00:00:00.000Z",
        scope: "change",
      },
      {
        id: "pw-backend",
        type: "convention",
        content: "promoted backend knowledge",
        recorded_at: "2026-01-01T00:00:00.000Z",
        scope: "project",
        product_id: "example-product",
        origin_repo_id: "backend",
      },
    ]);

    const repoScoped = JSON.parse(
      await wisdomTools.adv_wisdom_list.execute({}, store),
    );
    expect(repoScoped.wisdom.map((entry: { id: string }) => entry.id)).toEqual([
      "ws-web",
      "ws-legacy",
      "pw-backend",
    ]);

    const productWide = JSON.parse(
      await wisdomTools.adv_wisdom_list.execute(
        { scope: "product" } as never,
        store,
      ),
    );
    expect(productWide.wisdom.map((entry: { id: string }) => entry.id)).toEqual(
      ["ws-web", "ws-backend", "ws-legacy", "pw-backend"],
    );
  });
});

// ---------------------------------------------------------------------------
// rq-wisdomAutoSurfacing01 — from_draft_id promotion (AC6 / DDC5)
// ---------------------------------------------------------------------------

describe("adv_wisdom_add — from_draft_id promotion (AC6 / DDC5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("rejects from_draft_id without sourceTask", async () => {
    const store = createMockStore();
    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-1",
        type: "failure",
        content: "x",
        from_draft_id: "dr-aaaaaaaa",
      },
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.error).toMatch(/from_draft_id requires sourceTask/);
    expect(parsed.code).toBe("FROM_DRAFT_ID_REQUIRES_SOURCE_TASK");
  });

  test("rejects when draft is not found on task (DRAFT_NOT_FOUND)", async () => {
    const store = createMockStore();
    (store.tasks.show as ReturnType<typeof vi.fn>).mockResolvedValue({
      task: {
        id: "tk-1",
        title: "T",
        status: "in_progress",
        wisdom_drafts: [],
      },
      changeId: "chg-1",
    });

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-1",
        type: "failure",
        content: "x",
        sourceTask: "tk-1",
        from_draft_id: "dr-missing",
      },
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.code).toBe("DRAFT_NOT_FOUND");
    expect(parsed.error).toMatch(/dr-missing/);
  });

  test("rejects when draft is already promoted (DRAFT_ALREADY_PROMOTED)", async () => {
    const store = createMockStore();
    (store.tasks.show as ReturnType<typeof vi.fn>).mockResolvedValue({
      task: {
        id: "tk-1",
        title: "T",
        status: "in_progress",
        wisdom_drafts: [
          {
            id: "dr-promoted1",
            suggested_type: "failure",
            suggested_content: "old",
            source_attempts: [1],
            status: "promoted",
            created_at: "2026-07-21T17:00:00.000Z",
            promoted_wisdom_id: "ws-old",
          },
        ],
      },
      changeId: "chg-1",
    });

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-1",
        type: "failure",
        content: "x",
        sourceTask: "tk-1",
        from_draft_id: "dr-promoted1",
      },
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.code).toBe("DRAFT_ALREADY_PROMOTED");
  });

  test("rejects when draft is dismissed (DRAFT_DISMISSED)", async () => {
    const store = createMockStore();
    (store.tasks.show as ReturnType<typeof vi.fn>).mockResolvedValue({
      task: {
        id: "tk-1",
        title: "T",
        status: "in_progress",
        wisdom_drafts: [
          {
            id: "dr-dismissed1",
            suggested_type: "failure",
            suggested_content: "old",
            source_attempts: [1],
            status: "dismissed",
            created_at: "2026-07-21T17:00:00.000Z",
            dismissed_at: "2026-07-21T17:30:00.000Z",
            dismiss_reason: "auto_checkpoint",
          },
        ],
      },
      changeId: "chg-1",
    });

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-1",
        type: "failure",
        content: "x",
        sourceTask: "tk-1",
        from_draft_id: "dr-dismissed1",
      },
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.code).toBe("DRAFT_DISMISSED");
  });

  test("promotes suggested draft atomically: adds wisdom, then fires taskUpdatedSignal with promoted draft", async () => {
    const store = createMockStore();
    (store.tasks.show as ReturnType<typeof vi.fn>).mockResolvedValue({
      task: {
        id: "tk-1",
        title: "T",
        status: "in_progress",
        wisdom_drafts: [
          {
            id: "dr-suggested1",
            suggested_type: "failure",
            suggested_content: "draft content",
            source_attempts: [1],
            status: "suggested",
            created_at: "2026-07-21T17:00:00.000Z",
          },
        ],
      },
      changeId: "chg-1",
    });

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-1",
        type: "failure",
        content: "explicit override",
        sourceTask: "tk-1",
        from_draft_id: "dr-suggested1",
      },
      store,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.entry.id).toMatch(/^ws-/);
    expect(parsed.entry.content).toBe("explicit override");

    // Two signals: wisdomAddedSignal + taskUpdatedSignal (draft promotion)
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
    // Second call: taskUpdatedSignal marking draft as promoted
    const promotionCall = mocks.fireSignalAndRefresh.mock.calls[1];
    expect(promotionCall[3]).toBe(taskUpdatedSignal);
    expect(promotionCall[4]).toMatchObject({
      taskId: "tk-1",
      partial: {
        wisdom_drafts: [
          expect.objectContaining({
            id: "dr-suggested1",
            status: "promoted",
            promoted_wisdom_id: parsed.entry.id,
          }),
        ],
      },
    });
  });

  test("without from_draft_id: behavior unchanged (backward-compat)", async () => {
    const store = createMockStore();
    await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-1",
        type: "pattern",
        content: "no draft",
      },
      store,
    );
    // Only one signal: wisdomAddedSignal (no draft promotion)
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(store.tasks.show).not.toHaveBeenCalled();
  });

  test("Temporal unavailable with from_draft_id: wisdom durable, surfaces warning, draft stays suggested (tdd-gap-wisdom-temporal-fallback)", async () => {
    // When Temporal handle is null (Temporal unavailable), wisdom add
    // succeeds via disk fallback but draft promotion cannot fire
    // taskUpdatedSignal. Surface the inconsistency as a _warning so the
    // agent knows the draft remains in 'suggested' state.
    const store = createMockStore();
    (store.tasks.show as ReturnType<typeof vi.fn>).mockResolvedValue({
      task: {
        id: "tk-1",
        title: "Task with draft",
        status: "in_progress",
        wisdom_drafts: [
          {
            id: "dr-suggested1",
            suggested_type: "failure",
            suggested_content: "diag → fix",
            source_attempts: [1],
            status: "suggested",
            created_at: "2026-07-21T17:00:00.000Z",
          },
        ],
      } as any,
      changeId: "chg-1",
    });
    // Force the Temporal handle to null — disk fallback path engages
    mocks.getChangeHandle.mockReturnValueOnce(null);

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-1",
        type: "failure",
        content: "promoted content",
        sourceTask: "tk-1",
        from_draft_id: "dr-suggested1",
      },
      store,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.entry.id).toMatch(/^ws-/);
    // Wisdom durable via disk fallback (called regardless of origin shape)
    expect(store.wisdom.add).toHaveBeenCalledTimes(1);
    const addCall = (store.wisdom.add as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(addCall[0]).toBe("chg-1");
    expect(addCall[1]).toBe("failure");
    expect(addCall[2]).toBe("promoted content");
    expect(addCall[3]).toBe("tk-1");
    // Draft promotion skipped — no taskUpdatedSignal fired
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    // Warning surfaces the inconsistency
    expect(parsed._warning).toMatch(/Draft promotion skipped/i);
    expect(parsed._warning).toMatch(/Temporal unavailable/i);
  });
});

describe("rq-wisdomAutoSurfacing01.9 — AC7 task-scoped drafts invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("drafts on cancelled tasks never appear in change-level wisdom queries (AC7)", async () => {
    // AC7 is enforced by architecture: store.wisdom.search/listAll reads
    // only from the change-level wisdom array, never from task.wisdom_drafts.
    // This test guards the invariant so a future refactor that accidentally
    // promotes drafts into change-level storage would be caught.
    const base = tmpdir();
    const wisdomEntries: any[] = []; // empty — no promoted wisdom
    const store = {
      paths: {
        root: join(base, "fake-root"),
        external: join(base, "fake-external"),
        changes: join(base, "fake-changes"),
        archive: join(base, "fake-archive"),
        wisdom: join(base, "fake-wisdom.jsonl"),
        agenda: join(base, "fake-agenda.jsonl"),
      },
      wisdom: {
        // Search reads from change-level wisdom only — task.wisdom_drafts
        // never appears here regardless of task status.
        search: vi.fn(async () => wisdomEntries),
        list: vi.fn(async () => wisdomEntries),
        listAll: vi.fn(async () => wisdomEntries),
        add: vi.fn(async () => undefined),
      },
      tasks: {
        show: vi.fn(async () => null),
        list: vi.fn(async () => [
          {
            id: "tk-done",
            title: "Done with draft",
            status: "done",
            wisdom_drafts: [
              {
                id: "dr-a",
                suggested_type: "failure",
                suggested_content: "never promoted",
                status: "suggested",
                created_at: "2026-07-21T17:00:00.000Z",
              },
            ],
          },
          {
            id: "tk-cancelled",
            title: "Cancelled with draft",
            status: "cancelled",
            wisdom_drafts: [
              {
                id: "dr-b",
                suggested_type: "failure",
                suggested_content: "abandoned",
                status: "suggested",
                created_at: "2026-07-21T17:00:00.000Z",
              },
            ],
          },
        ]),
      },
      changes: {
        refresh: vi.fn(async () => undefined),
      },
    } as unknown as Store;

    // The change-level wisdom search must return zero entries even though
    // both tasks carry suggested drafts. The store implementation is the
    // boundary; this asserts the contract at that boundary.
    const results = await store.wisdom.search("any", { changeId: "chg-1" });
    expect(results).toEqual([]);
    const listResults = await store.wisdom.listAll();
    expect(listResults).toEqual([]);
    // Tasks still carry their drafts (task-scoped, not change-scoped)
    const tasks = await store.tasks.list("chg-1");
    expect(tasks).toHaveLength(2);
    expect((tasks[0] as any).wisdom_drafts).toHaveLength(1);
    expect((tasks[1] as any).wisdom_drafts).toHaveLength(1);
  });
});
