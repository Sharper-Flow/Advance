import { beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Store } from "../storage/store";

const mocks = vi.hoisted(() => ({
  targetStore: null as Store | null,
  withOptionalTargetPathStore: vi.fn(async (_input: unknown, fn: any) =>
    fn(mocks.targetStore, {
      root: "/target/project",
      projectId: "a000000000000000000000000000000000000000".repeat(40),
      trusted: false,
      trustSource: "explicit",
      stateMode: "snapshot",
      warning:
        "Read-only untrusted target_path snapshot. Mutations require explicit target confirmation.",
    }),
  ),
  listProjectWisdom: vi.fn(async () => [
    {
      id: "pw-target",
      type: "pattern",
      content: "target project wisdom",
      source_change: "target-change",
      promoted_at: "2026-01-01T00:00:00.000Z",
    },
  ]),
  addProjectWisdom: vi.fn(),
  compactProjectWisdom: vi.fn(),
}));

vi.mock("./target-project", () => ({
  withOptionalTargetPathStore: mocks.withOptionalTargetPathStore,
}));

vi.mock("../storage/project-wisdom", () => ({
  listProjectWisdom: mocks.listProjectWisdom,
  addProjectWisdom: mocks.addProjectWisdom,
  compactProjectWisdom: mocks.compactProjectWisdom,
}));

import { wisdomTools } from "./wisdom";

describe("wisdom target_path reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.targetStore = {
      paths: { root: "/target/project", wisdom: "/target/wisdom.jsonl" },
      wisdom: {
        listAll: vi.fn(async () => [
          {
            id: "ws-target",
            type: "gotcha",
            content: "target aggregate wisdom",
            recorded_at: "2026-01-01T00:00:00.000Z",
          },
        ]),
        search: vi.fn(async () => []),
        list: vi.fn(async () => []),
      },
    } as unknown as Store;
  });

  test("project_only wisdom list reads target store and returns project context", async () => {
    const output = await wisdomTools.adv_wisdom_list.execute(
      { project_only: true, maxEntries: 5, target_path: "/target/project" },
      { paths: { root: "/source/project" } } as unknown as Store,
    );
    const parsed = JSON.parse(output);

    // DDC6: the bounded limit applies after project/visibility filtering and
    // is never pushed into the storage read.
    expect(mocks.listProjectWisdom).toHaveBeenCalledWith("/target/project", {
      wisdomPath: "/target/wisdom.jsonl",
    });
    expect(parsed.wisdom).toEqual([
      expect.objectContaining({ id: "pw-target", scope: "project" }),
    ]);
    expect(parsed._projectContext).toMatchObject({
      root: "/target/project",
      trusted: false,
    });
  });

  test("aggregate wisdom list reads target store and returns project context", async () => {
    const output = await wisdomTools.adv_wisdom_list.execute(
      { target_path: "/target/project" },
      { paths: { root: "/source/project" } } as unknown as Store,
    );
    const parsed = JSON.parse(output);

    expect(mocks.targetStore?.wisdom.listAll).toHaveBeenCalledWith({
      type: undefined,
    });
    expect(parsed.wisdom).toEqual([
      expect.objectContaining({ id: "ws-target", type: "gotcha" }),
    ]);
    expect(parsed._projectContext).toMatchObject({
      warning: expect.stringContaining("Read-only untrusted target_path"),
    });
  });

  test("change-specific target_path wisdom reads disk snapshot without Temporal lookup", async () => {
    const root = await mkdtemp(join(tmpdir(), "adv-wisdom-target-"));
    const changes = join(root, "changes");
    await mkdir(changes, { recursive: true });
    await mkdir(join(changes, "target-change"), { recursive: true });
    await writeFile(
      join(changes, "target-change", "change.json"),
      JSON.stringify({
        id: "target-change",
        title: "Target Change",
        status: "active",
        created_at: "2026-01-01T00:00:00.000Z",
        wisdom: [
          {
            id: "ws-target-change",
            type: "pattern",
            content: "target change wisdom",
            recorded_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    const list = vi.fn(async () => [
      {
        id: "ws-target-change",
        type: "pattern",
        content: "target change wisdom",
        recorded_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    mocks.targetStore = {
      paths: {
        root: "/target/project",
        changes,
        wisdom: "/target/wisdom.jsonl",
      },
      wisdom: {
        listAll: vi.fn(async () => []),
        search: vi.fn(async () => []),
        list,
      },
    } as unknown as Store;

    const output = await wisdomTools.adv_wisdom_list.execute(
      { changeId: "target-change", target_path: "/target/project" },
      { paths: { root: "/source/project" } } as unknown as Store,
    );
    const parsed = JSON.parse(output);

    expect(list).not.toHaveBeenCalled();
    expect(parsed.wisdom).toEqual([
      expect.objectContaining({ id: "ws-target-change", type: "pattern" }),
    ]);
    expect(parsed._projectContext).toMatchObject({
      stateMode: "snapshot",
      warning: expect.stringContaining("Read-only untrusted target_path"),
    });
    await rm(root, { recursive: true, force: true });
  });
});
