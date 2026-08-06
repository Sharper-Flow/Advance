/** Change query behavior against disk-backed projections. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { changeTools } from "./change";
import type { Change, Store } from "../types";

function current(overrides: Partial<Change> = {}): Change {
  return {
    id: "change-1",
    title: "Change one",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    ...overrides,
  } as Change;
}

function storeFor(
  root: string,
  change: Change,
  rows: Record<string, unknown>[] = [],
): Store {
  return {
    paths: { root, changes: root, archive: join(root, "archive") },
    config: null,
    changes: {
      get: async () => ({ success: true, data: change }),
      list: async () => ({ changes: rows }),
    },
    tasks: { ready: async () => ({ ready: [], blocked: [] }) },
    specs: {},
    wisdom: {},
    gates: {},
  } as unknown as Store;
}

async function seed(root: string, change: Change): Promise<void> {
  await mkdir(join(root, change.id), { recursive: true });
  await writeFile(join(root, change.id, "change.json"), JSON.stringify(change));
}

describe("change tools — disk projection", () => {
  test("shows the persisted change identity and gates", async () => {
    const root = await createTempDir("adv-change-");
    try {
      const change = current();
      await seed(root, change);
      const parsed = JSON.parse(
        await changeTools.adv_change_show.execute(
          { changeId: change.id },
          storeFor(root, change),
        ),
      );
      expect(parsed).toMatchObject({
        id: "change-1",
        title: "Change one",
        status: "active",
      });
      expect(parsed.gates.acceptance.status).toBe("pending");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("lists rows with derived phase and recency metadata", async () => {
    const root = await createTempDir("adv-change-");
    try {
      const change = current();
      const parsed = JSON.parse(
        await changeTools.adv_change_list.execute(
          {},
          storeFor(root, change, [
            {
              id: "change-1",
              title: "Change one",
              status: "draft",
              currentGate: "acceptance",
              lifecycleState: "open",
              created_at: "2026-01-01T00:00:00Z",
              lastActivityAt: "2026-01-01T00:00:00Z",
              taskCount: 0,
              completedTasks: 0,
            },
          ] as Record<string, unknown>[]),
        ),
      );
      expect(parsed.changes).toHaveLength(1);
      expect(parsed.changes[0]).toMatchObject({
        id: "change-1",
        title: "Change one",
        phase: "acceptance",
      });
      expect(parsed.changes[0].lastActivity).toBe("2026-01-01T00:00:00Z");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("returns requested artifact content from the active disk directory", async () => {
    const root = await createTempDir("adv-change-");
    try {
      const change = current();
      await seed(root, change);
      await writeFile(join(root, change.id, "proposal.md"), "# Disk proposal");
      const parsed = JSON.parse(
        await changeTools.adv_change_show.execute(
          { changeId: change.id, include: { proposal: true } },
          storeFor(root, change),
        ),
      );
      expect(parsed._proposal).toBe("# Disk proposal");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("returns a structured error for an unknown change", async () => {
    const root = await createTempDir("adv-change-");
    try {
      const change = current();
      const parsed = JSON.parse(
        await changeTools.adv_change_show.execute({ changeId: "missing" }, {
          ...storeFor(root, change),
          changes: { get: async () => ({ success: true, data: null }) },
        } as Store),
      );
      expect(parsed.error).toContain("Change not found");
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("rejects invalid active status filter instead of returning false empty success", async () => {
    const root = await createTempDir("adv-change-");
    try {
      const parsed = JSON.parse(
        await changeTools.adv_change_list.execute(
          { status: "active" },
          storeFor(root, current()),
        ),
      );
      expect(parsed.error).toContain('status: "active" is not a valid filter');
    } finally {
      await cleanupTempDir(root);
    }
  });
});
