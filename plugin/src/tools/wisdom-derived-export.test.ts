import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mocks = vi.hoisted(() => {
  const addProjectWisdom = vi.fn(async () => ({
    id: "pw-fallback",
    type: "convention",
    content: "Always validate inputs at boundary",
    source_change: "addFeature",
    source_task: "tk-task0001",
    promoted_at: "2026-04-20T00:00:00.000Z",
  }));
  const compactProjectWisdom = vi.fn(async () => {});
  const listProjectWisdom = vi.fn(async () => []);
  return {
    addProjectWisdom,
    compactProjectWisdom,
    listProjectWisdom,
    writeJsonlAtomic: vi.fn(async () => {}),
  };
});

vi.mock("../storage/jsonl-atomic-writer", () => ({
  writeJsonlAtomic: mocks.writeJsonlAtomic,
}));

vi.mock("../storage/project-wisdom", () => ({
  addProjectWisdom: mocks.addProjectWisdom,
  compactProjectWisdom: mocks.compactProjectWisdom,
  listProjectWisdom: mocks.listProjectWisdom,
}));

vi.mock("./change-mutation-coordinator", () => ({
  coordinateChangeMutation: vi.fn(async () => ({ kind: "verified" })),
}));

import { wisdomTools } from "./wisdom";

describe("adv_wisdom_add disk path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listProjectWisdom.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("persists wisdom through the authoritative disk mutation", async () => {
    const store = {
      paths: {
        root: "/repo",
        wisdom:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      },
      wisdom: {
        add: vi.fn(async () => ({
          id: "ws-1",
          type: "convention",
          content: "Always validate inputs at boundary",
          source_task: "tk-task0001",
          recorded_at: "2026-04-20T00:00:00.000Z",
        })),
      },
      changes: { refresh: vi.fn(async () => undefined) },
    } as any;

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "addFeature",
        type: "convention",
        content: "Always validate inputs at boundary",
        sourceTask: "tk-task0001",
        promote: false,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(store.wisdom.add).not.toHaveBeenCalled();
  });

  it("promotes wisdom through the disk path", async () => {
    mocks.addProjectWisdom.mockResolvedValueOnce({
      id: "pw-123",
      type: "convention",
      content: "Always validate inputs at boundary",
      source_change: "addFeature",
      source_task: "tk-task0001",
      promoted_at: "2026-04-20T00:00:00.000Z",
    });
    const store = {
      paths: {
        root: "/repo",
        wisdom:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      },
      wisdom: {
        add: vi.fn(async () => ({
          id: "ws-1",
          type: "convention",
          content: "Always validate inputs at boundary",
          source_task: "tk-task0001",
          recorded_at: "2026-04-20T00:00:00.000Z",
        })),
      },
      changes: {
        refresh: vi.fn(async () => undefined),
        get: vi.fn(async () => ({
          success: true,
          data: {
            id: "addFeature",
            title: "Add Feature",
            tasks: [
              { id: "tk-task0001", title: "Done", status: "done" },
              { id: "tk-task0002", title: "Pending", status: "pending" },
            ],
          },
        })),
      },
      gates: {
        get: vi.fn(async () => ({
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "pending" },
        })),
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "addFeature",
        type: "convention",
        content: "Always validate inputs at boundary",
        sourceTask: "tk-task0001",
        promote: true,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(mocks.addProjectWisdom).toHaveBeenCalledTimes(1);
  });

  it("returns error when addProjectWisdom fails during promote", async () => {
    mocks.addProjectWisdom.mockRejectedValueOnce(new Error("disk full"));
    const store = {
      paths: {
        root: "/repo",
        wisdom:
          "/home/jrede/.local/share/opencode/plugins/advance/proj123/wisdom.jsonl",
      },
      wisdom: {
        add: vi.fn(async () => ({
          id: "ws-1",
          type: "convention",
          content: "Always validate inputs at boundary",
          source_task: "tk-task0001",
          recorded_at: "2026-04-20T00:00:00.000Z",
        })),
      },
      changes: { refresh: vi.fn(async () => undefined) },
    } as any;

    const result = await wisdomTools.adv_wisdom_add.execute(
      {
        changeId: "addFeature",
        type: "convention",
        content: "Always validate inputs at boundary",
        sourceTask: "tk-task0001",
        promote: true,
      },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("disk full");
  });
});

describe("adv_wisdom_list disk path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads change-specific wisdom from the disk projection", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-wisdom-projection-"));
    const changes = join(root, "changes");
    await mkdir(changes, { recursive: true });
    const stateWisdom = [
      {
        id: "ws-1",
        type: "pattern",
        content: "Use signals",
        recorded_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "ws-2",
        type: "gotcha",
        content: "Beware edge cases",
        recorded_at: "2026-05-02T00:00:00Z",
      },
    ];
    await mkdir(join(changes, "myChange"), { recursive: true });
    await writeFile(
      join(changes, "myChange", "change.json"),
      JSON.stringify({
        id: "myChange",
        title: "My Change",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        wisdom: stateWisdom,
      }),
    );

    const store = {
      paths: { root, changes },
      wisdom: {
        list: vi.fn(async () => []),
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { changeId: "myChange", type: "pattern" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.wisdom).toHaveLength(1);
    expect(parsed.wisdom[0].type).toBe("pattern");
    expect(store.wisdom.list).not.toHaveBeenCalled();
    await rm(root, { recursive: true, force: true });
  });

  it("returns disk-projected wisdom without workflow state", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-wisdom-projection-"));
    const changes = join(root, "changes");
    await mkdir(changes, { recursive: true });
    await mkdir(join(changes, "myChange"), { recursive: true });
    await writeFile(
      join(changes, "myChange", "change.json"),
      JSON.stringify({
        id: "myChange",
        title: "My Change",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        wisdom: [
          {
            id: "ws-1",
            type: "pattern",
            content: "Use signals",
            recorded_at: "2026-05-01T00:00:00Z",
          },
        ],
      }),
    );

    const store = {
      paths: { root, changes },
      wisdom: {
        list: vi.fn(async () => [
          {
            id: "ws-1",
            type: "pattern",
            content: "Use signals",
            recorded_at: "2026-05-01T00:00:00Z",
          },
        ]),
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { changeId: "myChange" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.wisdom).toHaveLength(1);
    expect(store.wisdom.list).not.toHaveBeenCalled();
    await rm(root, { recursive: true, force: true });
  });
});

describe("adv_wisdom_list project_only branch", () => {
  // consolidateAdvToolSurface2 (tk-11d902254d63): the removed
  // adv_project_wisdom_list reader folded into adv_wisdom_list behind an
  // explicit project_only filter plus a bounded maxEntries limit. DDC6:
  // project filtering and product visibility filtering happen BEFORE the
  // bounded limit, so the limit never starves visible entries.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads project wisdom from disk when project_only is true", async () => {
    mocks.listProjectWisdom.mockResolvedValueOnce([
      {
        id: "pw-1",
        type: "convention",
        content: "Validate inputs",
        source_task: "tk-1",
        promoted_at: "2026-05-01T00:00:00Z",
      },
    ]);

    const store = {
      paths: { root: "/repo", wisdom: "/ext/wisdom.jsonl" },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { project_only: true },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.wisdom).toHaveLength(1);
    expect(parsed.wisdom[0]).toMatchObject({
      id: "pw-1",
      type: "convention",
      scope: "project",
    });
    expect(mocks.listProjectWisdom).toHaveBeenCalledTimes(1);
  });

  it("reads project wisdom from disk without workflow state", async () => {
    mocks.listProjectWisdom.mockResolvedValueOnce([
      {
        id: "pw-1",
        type: "convention",
        content: "Validate inputs",
        source_task: "tk-1",
        promoted_at: "2026-05-01T00:00:00Z",
      },
    ]);

    const store = {
      paths: { root: "/repo", wisdom: "/ext/wisdom.jsonl" },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { project_only: true },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.wisdom).toHaveLength(1);
    expect(mocks.listProjectWisdom).toHaveBeenCalledTimes(1);
  });

  it("applies type filtering inside the project_only branch", async () => {
    mocks.listProjectWisdom.mockResolvedValueOnce([
      {
        id: "pw-1",
        type: "convention",
        content: "Validate inputs",
        promoted_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "pw-2",
        type: "gotcha",
        content: "Beware edge cases",
        promoted_at: "2026-05-02T00:00:00Z",
      },
    ]);

    const store = {
      paths: { root: "/repo", wisdom: "/ext/wisdom.jsonl" },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { project_only: true, type: "gotcha" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.wisdom.map((e: { id: string }) => e.id)).toEqual(["pw-2"]);
  });

  it("applies product visibility filtering before the bounded limit (DDC6)", async () => {
    mocks.listProjectWisdom.mockResolvedValueOnce([
      {
        id: "pw-other-1",
        type: "pattern",
        content: "other product 1",
        product_id: "other-product",
        promoted_at: "2026-05-01T00:00:00Z",
      },
      {
        id: "pw-other-2",
        type: "pattern",
        content: "other product 2",
        product_id: "other-product",
        promoted_at: "2026-05-02T00:00:00Z",
      },
      {
        id: "pw-visible-1",
        type: "pattern",
        content: "visible 1",
        product_id: "example-product",
        origin_repo_id: "backend",
        promoted_at: "2026-05-03T00:00:00Z",
      },
      {
        id: "pw-visible-2",
        type: "pattern",
        content: "visible 2",
        product_id: "example-product",
        origin_repo_id: "backend",
        promoted_at: "2026-05-04T00:00:00Z",
      },
      {
        id: "pw-visible-3",
        type: "pattern",
        content: "visible 3",
        product_id: "example-product",
        origin_repo_id: "backend",
        promoted_at: "2026-05-05T00:00:00Z",
      },
    ]);

    const store = {
      paths: { root: "/repo/web", wisdom: "/ext/wisdom.jsonl" },
      productContext: {
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
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { project_only: true, maxEntries: 2 },
      store,
    );
    const parsed = JSON.parse(result);

    // A pre-filter limit (the removed reader's defect) would slice to the two
    // other-product entries and return zero visible rows.
    expect(parsed.wisdom.map((e: { id: string }) => e.id)).toEqual([
      "pw-visible-1",
      "pw-visible-2",
    ]);
    expect(parsed.count).toBe(2);
    // The bounded limit must never be pushed into the storage read.
    expect(mocks.listProjectWisdom).toHaveBeenCalledWith("/repo/web", {
      wisdomPath: "/ext/wisdom.jsonl",
    });
  });

  it("rejects project_only combined with changeId", async () => {
    const store = {
      paths: { root: "/repo", wisdom: "/ext/wisdom.jsonl" },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { project_only: true, changeId: "myChange" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("project_only");
    expect(mocks.listProjectWisdom).not.toHaveBeenCalled();
  });

  it("rejects project_only combined with query", async () => {
    const store = {
      paths: { root: "/repo", wisdom: "/ext/wisdom.jsonl" },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { project_only: true, query: "validation" },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("project_only");
    expect(mocks.listProjectWisdom).not.toHaveBeenCalled();
  });

  it("rejects maxEntries without project_only", async () => {
    const store = {
      paths: { root: "/repo", wisdom: "/ext/wisdom.jsonl" },
      wisdom: {
        listAll: vi.fn(async () => []),
      },
    } as any;

    const result = await wisdomTools.adv_wisdom_list.execute(
      { maxEntries: 5 },
      store,
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("maxEntries");
    expect(store.wisdom.listAll).not.toHaveBeenCalled();
    expect(mocks.listProjectWisdom).not.toHaveBeenCalled();
  });
});
