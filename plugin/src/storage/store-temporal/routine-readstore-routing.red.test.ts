/**
 * RED coverage for routine active-change reads. These reads must consume the
 * durable read-model projection; a workflow handle is deliberately poisoned so
 * any accidental Temporal hydration is visible as a query-count failure.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { rebuildSummaryIndex } from "../change-summary-shard";
import { createTemporalStoreBackend } from "./index";

const CHANGE_ID = "read-model-routine";
const TASK_ID = "tk-read-model";

function projection(): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id: CHANGE_ID,
    title: "Read-model routine projection",
    status: "active",
    created_at: "2026-07-27T00:00:00.000Z",
    state_revision: 7,
    projection_revision: 7,
    tasks: [
      {
        id: TASK_ID,
        title: "Read from projection",
        status: "pending",
        priority: 0,
        deps: [],
        created_at: "2026-07-27T00:00:00.000Z",
        metadata: { lane: "engineer" },
      },
    ],
    deltas: {},
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [
      {
        id: "ws-read-model",
        type: "pattern",
        content: "Routine reads use the projection.",
        recorded_at: "2026-07-27T00:00:00.000Z",
      },
    ],
  };
}

function poisonedTemporal() {
  let queryCalls = 0;
  let visibilityCalls = 0;
  return {
    temporal: {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCalls += 1;
              throw new Error("routine read must not hydrate from workflow");
            },
          }),
          list: async () => {
            visibilityCalls += 1;
            throw new Error(
              "routine read must not enumerate Temporal Visibility",
            );
          },
          start: async () => {
            throw new Error("routine read must not start a workflow");
          },
        },
      },
    },
    queryCalls: () => queryCalls,
    visibilityCalls: () => visibilityCalls,
  };
}

describe("routine reads route through the disk ReadStore projection (RED)", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  async function createStoreWithProjection() {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(projection());
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });
    const poisoned = poisonedTemporal();
    return {
      store: createTemporalStoreBackend({
        legacy,
        temporal: poisoned.temporal,
        projectId: "routine-read-project",
      }),
      ...poisoned,
    };
  }

  it("changes.get returns the active full projection with read-model provenance and no query", async () => {
    const { store, queryCalls } = await createStoreWithProjection();
    const result = await store.changes.get(CHANGE_ID).catch((error) => error);

    expect(queryCalls()).toBe(0);
    expect(result).toMatchObject({
      success: true,
      source: "disk",
      data: {
        id: CHANGE_ID,
        state_revision: 7,
        projection_revision: 7,
      },
    });
  });

  it("changes.listSummary reads immutable summary pointers for default and filtered pages without Visibility or hydration", async () => {
    const { store, queryCalls, visibilityCalls } =
      await createStoreWithProjection();

    const result = await store.changes.listSummary!({
      status: "draft",
      limit: 1,
      offset: 0,
    });

    expect(queryCalls()).toBe(0);
    expect(visibilityCalls()).toBe(0);
    expect(result.hydrationStats).toMatchObject({
      fromHydration: 0,
      fromMemo: 1,
    });
    expect(result.changes).toEqual([
      expect.objectContaining({
        id: CHANGE_ID,
        status: "draft",
        lastActivityAt: "2026-07-27T00:00:00.000Z",
      }),
    ]);
  });

  it("changes.list reads immutable summary pointers without Visibility or hydration", async () => {
    const { store, queryCalls, visibilityCalls } =
      await createStoreWithProjection();

    const result = await store.changes.list({});

    expect(queryCalls()).toBe(0);
    expect(visibilityCalls()).toBe(0);
    expect(result.changes).toEqual([
      expect.objectContaining({
        id: CHANGE_ID,
        status: "draft",
        capabilities: [],
      }),
    ]);
  });

  it("gates.get reads gates from the projection with no query", async () => {
    const { store, queryCalls } = await createStoreWithProjection();
    const result = await store.gates.get(CHANGE_ID).catch((error) => error);

    expect(queryCalls()).toBe(0);
    expect(result).toEqual(createDefaultGates());
  });

  it("tasks.list, ready, get, and show preserve projection behavior with no query", async () => {
    const { store, queryCalls } = await createStoreWithProjection();
    const results = await Promise.all([
      store.tasks
        .list(CHANGE_ID, "pending", "metadata:lane=engineer")
        .catch((error) => error),
      store.tasks.ready(CHANGE_ID).catch((error) => error),
      store.tasks.get(TASK_ID).catch((error) => error),
      store.tasks.show(TASK_ID).catch((error) => error),
    ]);

    expect(queryCalls()).toBe(0);
    expect(results[0]).toEqual([expect.objectContaining({ id: TASK_ID })]);
    expect(results[1]).toMatchObject({
      ready: [expect.objectContaining({ id: TASK_ID })],
    });
    expect(results[2]).toMatchObject({ id: TASK_ID });
    expect(results[3]).toMatchObject({
      task: { id: TASK_ID },
      changeId: CHANGE_ID,
    });
  });

  it("preserves disk task-filter parity for metadata key and value filters", async () => {
    const { store, queryCalls } = await createStoreWithProjection();

    await expect(
      store.tasks.list(CHANGE_ID, undefined, "has_metadata_key:lane"),
    ).resolves.toEqual([expect.objectContaining({ id: TASK_ID })]);
    await expect(
      store.tasks.list(CHANGE_ID, undefined, "metadata:lane=reviewer"),
    ).resolves.toEqual([]);
    expect(queryCalls()).toBe(0);
  });

  it("wisdom.list reads the projection with no query", async () => {
    const { store, queryCalls } = await createStoreWithProjection();
    const result = await store.wisdom.list(CHANGE_ID).catch((error) => error);

    expect(queryCalls()).toBe(0);
    expect(result).toEqual([expect.objectContaining({ id: "ws-read-model" })]);
  });

  it("reports a missing projection as read-model not_found without workflow hydration", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const poisoned = poisonedTemporal();
    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisoned.temporal,
      projectId: "routine-read-project",
    });
    const result = await store.changes
      .get("missing-read-model")
      .catch((error) => error);

    expect(poisoned.queryCalls()).toBe(0);
    expect(result).toMatchObject({
      success: false,
      error: "not_found",
      source: "disk",
    });
  });

  it("reports malformed projections as degraded/corrupt without workflow hydration", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const corruptId = "corrupt-read-model";
    const changeDir = join(legacy.paths.changes, corruptId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, "change.json"), "{ not valid json");
    const poisoned = poisonedTemporal();
    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisoned.temporal,
      projectId: "routine-read-project",
    });
    const result = await store.changes.get(corruptId).catch((error) => error);

    expect(poisoned.queryCalls()).toBe(0);
    expect(result).toMatchObject({
      success: false,
      source: "disk",
      degraded: expect.objectContaining({
        reason: expect.stringMatching(/corrupt/i),
      }),
    });
  });

  it("keeps only routine adapter method bodies off direct workflow queries", async () => {
    const [gates, tasks, wisdom] = await Promise.all(
      ["gates.ts", "tasks.ts", "wisdom.ts"].map((file) =>
        readFile(new URL(`./${file}`, import.meta.url), "utf8"),
      ),
    );
    const routineBodies = [
      gates.match(/get: async[\s\S]*?(?=\n\s*complete: async)/)?.[0],
      tasks.match(/list: async[\s\S]*?(?=\n\s*update: async)/)?.[0],
      tasks.match(/get: async[\s\S]*?(?=\n\s*show: async)/)?.[0],
      tasks.match(/show: async[\s\S]*?(?=\n\s*cancel: async)/)?.[0],
      wisdom.match(/list: async[\s\S]*?(?=\n\s*},\n\s*};)/)?.[0],
    ];

    expect(routineBodies).not.toContain(undefined);
    for (const body of routineBodies) {
      expect(body).not.toMatch(/\.query\(/);
    }
  });
});
