import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createTempDir,
  cleanupTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import type { Store } from "../storage/store";

const targetStoreRef = vi.hoisted(() => ({ current: null as Store | null }));

vi.mock("./target-project", async () => {
  const actual =
    await vi.importActual<typeof import("./target-project")>(
      "./target-project",
    );
  return {
    ...actual,
    withOptionalTargetPathStore: vi.fn(
      async (
        _input: unknown,
        fn: (store: Store, projectContext?: unknown) => Promise<string>,
      ) => {
        const targetStore = targetStoreRef.current;
        if (!targetStore) throw new Error("target store was not initialized");
        return fn(targetStore, {
          root: targetStore.paths.root,
          projectId: "target-project",
          trusted: false,
          trustSource: "explicit",
          stateMode: "disk-snapshot",
          authority: "disk_snapshot_non_authoritative",
        });
      },
    ),
  };
});

import { createDiskStore } from "../storage/store-disk";
import { advChangeShowHandler } from "./change/handlers-query";
import { taskTools } from "./task";

function fixtureChange(id: string, taskCount: number): Record<string, unknown> {
  return {
    ...JSON.parse(JSON.stringify(SAMPLE_CHANGE)),
    id,
    title: id,
    tasks: Array.from({ length: taskCount }, (_, index) => ({
      id: `tk-${id}-${index}`,
      title: `Task ${index}`,
      type: "code",
      status: "pending",
      priority: index,
      created_at: "2026-08-07T00:00:00.000Z",
    })),
  };
}

async function writeCanonicalChange(
  root: string,
  id: string,
  taskCount = 0,
): Promise<void> {
  const directory = join(root, ".adv", "changes", id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "change.json"),
    JSON.stringify(fixtureChange(id, taskCount)),
  );
}

describe("target-path read bounds", () => {
  let currentRoot: string;
  let targetRoot: string;
  let currentStore: Store;

  afterEach(async () => {
    targetStoreRef.current?.close();
    currentStore?.close();
    targetStoreRef.current = null;
    await cleanupTempDir(currentRoot);
    await cleanupTempDir(targetRoot);
  });

  test("reads a 500+ projection target without startup artifact migration", async () => {
    currentRoot = await createTempDir("target-read-current-");
    targetRoot = await createTempDir("target-read-large-");
    for (let index = 0; index < 501; index++) {
      await writeCanonicalChange(
        targetRoot,
        `change-${String(index).padStart(4, "0")}`,
        index === 0 ? 12 : 0,
      );
    }

    currentStore = await createDiskStore(currentRoot);
    targetStoreRef.current = await createDiskStore(targetRoot);

    await expect(
      access(
        join(targetRoot, ".adv", "artifact-metadata-migration-complete.json"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const taskOutput = JSON.parse(
      await taskTools.adv_task_list.execute(
        {
          changeId: "change-0000",
          target_path: targetRoot,
        },
        currentStore,
      ),
    );
    expect(taskOutput.tasks).toHaveLength(12);

    const showOutput = JSON.parse(
      await advChangeShowHandler(
        {
          changeId: "change-0000",
          target_path: targetRoot,
          include: { artifactOnly: true },
        },
        currentStore,
      ),
    );
    expect(showOutput.id).toBe("change-0000");

    // rq-storeReconcileUnboundedProof01.3: explicit init() must not write the
    // artifact-metadata completion marker; convergence is reconciler-owned.
    await targetStoreRef.current.init();
    await expect(
      access(
        join(targetRoot, ".adv", "artifact-metadata-migration-complete.json"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
