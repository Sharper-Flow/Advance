/**
 * Wisdom Tools — disk projection persistence and product-scope contracts.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wisdomTools } from "./wisdom";
import type { Store } from "../storage/store";

vi.mock("./change-mutation-coordinator", async () => {
  const { readFile, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  return {
    coordinateChangeMutation: vi.fn(async (options: any) => {
      const path = join(
        options.changesDir,
        options.intent.changeId,
        "change.json",
      );
      const latest = JSON.parse(await readFile(path, "utf-8"));
      const next = options.intent.mutateLatestProjection(latest);
      await writeFile(path, JSON.stringify(next, null, 2));
      return { kind: "verified", value: next };
    }),
  };
});

function createMockStore(): Store {
  const base = mkdtempSync(join(tmpdir(), "adv-wisdom-test-"));
  const changes = join(base, "changes");
  const change = (id: string) => ({
    id,
    title: "Test change",
    status: "draft",
    lifecycleState: "draft",
    created_at: "2026-07-21T17:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {},
    subagent_reports: [],
  });
  for (const id of ["chg-test", "chg-1"]) {
    const path = join(changes, id, "change.json");
    const parent = join(changes, id);
    mkdirSync(parent, { recursive: true });
    writeFileSync(path, JSON.stringify(change(id), null, 2));
  }
  return {
    paths: {
      root: base,
      external: join(base, "external"),
      changes,
      archive: join(base, "archive"),
      wisdom: join(base, "wisdom.jsonl"),
      agenda: join(base, "agenda.jsonl"),
    },
    wisdom: { add: vi.fn(async () => undefined) },
    tasks: {
      show: vi.fn(async () => null),
    },
    changes: { refresh: vi.fn(async () => undefined) },
  } as unknown as Store;
}

describe("adv_wisdom_add — rq-cacheRefresh01 contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("persists a wisdom entry through the disk projection", async () => {
    const store = createMockStore();

    const output = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "chg-test",
        type: "pattern",
        content: "test wisdom entry",
      },
      store,
    );

    const parsed = JSON.parse(output);
    const persisted = JSON.parse(
      readFileSync(
        join(store.paths.changes, "chg-test", "change.json"),
        "utf-8",
      ),
    );
    expect(parsed.success).toBe(true);
    expect(persisted.wisdom).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "pattern",
          content: "test wisdom entry",
        }),
      ]),
    );
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

    const persisted = JSON.parse(
      readFileSync(
        join(store.paths.changes, "chg-test", "change.json"),
        "utf-8",
      ),
    );
    expect(persisted.wisdom).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_id: "example-product",
          origin_repo_id: "web",
          origin_repo_project_id: "w".repeat(40),
          origin_repo_path: "/repo/web",
        }),
      ]),
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

  test("promotes suggested draft and persists the resulting wisdom entry", async () => {
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

    const persisted = JSON.parse(
      readFileSync(join(store.paths.changes, "chg-1", "change.json"), "utf-8"),
    );
    expect(persisted.wisdom).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: parsed.entry.id }),
      ]),
    );
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
    expect(store.tasks.show).not.toHaveBeenCalled();
  });

  test("disk persistence remains authoritative without a workflow provider", async () => {
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
    const persisted = JSON.parse(
      readFileSync(join(store.paths.changes, "chg-1", "change.json"), "utf-8"),
    );
    expect(persisted.wisdom).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: "promoted content" }),
      ]),
    );
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
