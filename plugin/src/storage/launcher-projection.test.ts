import { describe, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildLauncherProjection,
  refreshLauncherAggregateAfterCommit,
  LauncherProjectionSchema,
} from "./launcher-projection";
import type { ChangeSummaryShard } from "./change-summary-shard";
import { SAMPLE_CHANGE } from "../__tests__/setup";

function summary(
  id: string,
  overrides: Partial<ChangeSummaryShard> = {},
): ChangeSummaryShard {
  return {
    schema_version: 1,
    id,
    title: `Title ${id}`,
    status: "draft",
    phase: "proposal",
    created_at: "2026-07-23T10:00:00.000Z",
    last_activity_at: "2026-07-23T10:00:00.000Z",
    task_count: 0,
    completed_tasks: 0,
    state_revision: 0,
    operation_id: "test",
    projection_revision: 0,
    ...overrides,
  };
}

function build(summaries: ChangeSummaryShard[]) {
  const readSummaries = vi.fn(async () => ({ kind: "ok" as const, summaries }));
  return {
    readSummaries,
    result: buildLauncherProjection({
      changesDir: "/unused/changes",
      summariesDir: "/unused/summaries",
      generatedAt: "2026-07-23T12:00:00.000Z",
      degradedThresholdMs: 60_000,
      readSummaries,
    }),
  };
}

describe("buildLauncherProjection", () => {
  test("uses injected durable summaries and excludes terminal records", async () => {
    const { result, readSummaries } = build([
      summary("draft"),
      summary("archived", { status: "archived" }),
      summary("closed", { status: "closed" }),
    ]);

    const projection = await result;

    expect(readSummaries).toHaveBeenCalledOnce();
    expect(projection.changes.map((change) => change.id)).toEqual(["draft"]);
    expect(projection.active_count).toBe(1);
    expect(() => LauncherProjectionSchema.parse(projection)).not.toThrow();
  });

  test("sorts deterministically by activity then id and caps output at fifty", async () => {
    const summaries = Array.from({ length: 60 }, (_, index) =>
      summary(`change-${String(index).padStart(2, "0")}`, {
        last_activity_at: `2026-07-23T10:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );
    summaries.push(
      summary("aaa-tie", { last_activity_at: "2026-07-23T10:59:00.000Z" }),
    );

    const projection = await build(summaries).result;

    expect(projection.changes).toHaveLength(50);
    expect(projection.active_count).toBe(61);
    expect(projection.changes.slice(0, 2).map((change) => change.id)).toEqual([
      "aaa-tie",
      "change-59",
    ]);
  });

  test("calculates freshness and degradation from durable summary activity", async () => {
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-07-23T12:01:00.001Z").getTime());
    const projection = await build([
      summary("older", { last_activity_at: "2026-07-23T10:00:00.000Z" }),
      summary("latest", { last_activity_at: "2026-07-23T12:00:00.000Z" }),
    ]).result;
    now.mockRestore();

    expect(projection.freshness).toBe("2026-07-23T12:00:00.000Z");
    expect(projection.degraded).toBe(true);
  });

  test("preserves Epic membership from summary shards", async () => {
    const membership = {
      epic_id: "epic-1",
      entry_id: "entry-1",
      order: 2,
      title: "Epic entry",
      linked_at: "2026-07-23T10:00:00.000Z",
    };
    const projection = await build([
      summary("linked", { epic_membership: membership }),
    ]).result;

    expect(projection.changes[0]?.epic_membership).toEqual(membership);
  });

  test("surfaces a summary-index failure", async () => {
    await expect(
      buildLauncherProjection({
        changesDir: "/unused/changes",
        summariesDir: "/unused/summaries",
        generatedAt: "2026-07-23T12:00:00.000Z",
        degradedThresholdMs: 60_000,
        readSummaries: async () => ({
          kind: "error",
          error: "pointer corrupt",
        }),
      }),
    ).rejects.toThrow(
      "Unable to read launcher summary pointers: pointer corrupt",
    );
  });

  test("excludes summary shards without a valid canonical record", async () => {
    const root = await mkdtemp(join(tmpdir(), "launcher-classification-"));
    try {
      const changesDir = join(root, "changes");
      const summariesDir = join(root, "summaries");
      const validId = "valid-change";
      await mkdir(join(changesDir, validId), { recursive: true });
      await writeFile(
        join(changesDir, validId, "change.json"),
        JSON.stringify({ ...SAMPLE_CHANGE, id: validId, status: "active" }),
      );
      await seedSummaryPointer(summariesDir, changesDir, "missing-change");
      await seedSummaryPointer(summariesDir, changesDir, validId);
      await rm(join(changesDir, "missing-change"), {
        recursive: true,
        force: true,
      });

      const projection = await buildLauncherProjection({
        changesDir,
        summariesDir,
        generatedAt: "2026-07-23T12:00:00.000Z",
        degradedThresholdMs: 60_000,
      });

      expect(projection.changes.map((change) => change.id)).toEqual([validId]);
      expect(projection.active_count).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function seedSummaryPointer(
  summariesDir: string,
  changesDir: string,
  changeId: string,
): Promise<void> {
  const changeDir = join(summariesDir, changeId);
  const revDir = join(changeDir, "revisions");
  await mkdir(revDir, { recursive: true });
  const shardPath = join(revDir, "1.json");
  const pointerPath = join(changeDir, "current.json");
  const shard = {
    schema_version: 1,
    id: changeId,
    title: `Title ${changeId}`,
    status: "draft",
    phase: "proposal",
    created_at: "2026-07-23T10:00:00.000Z",
    last_activity_at: "2026-07-23T11:00:00.000Z",
    task_count: 0,
    completed_tasks: 0,
    state_revision: 0,
    operation_id: "test",
    projection_revision: 1,
    capabilities: [],
  };
  const pointer = {
    schema_version: 1,
    change_id: changeId,
    state_revision: 0,
    projection_revision: 1,
    operation_id: "test",
    shard_path: shardPath,
    snapshot_path: join(changesDir, changeId, "change.json"),
    committed_at: "2026-07-23T11:00:00.000Z",
  };
  await writeFile(shardPath, JSON.stringify(shard, null, 2));
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2));
  await mkdir(join(changesDir, changeId), { recursive: true });
  await writeFile(
    join(changesDir, changeId, "change.json"),
    JSON.stringify({ ...SAMPLE_CHANGE, id: changeId, status: "active" }),
  );
}

describe("refreshLauncherAggregateAfterCommit", () => {
  test("writes the aggregate from on-disk summary pointers after a commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "launcher-agg-refresh-"));
    try {
      const changesDir = join(root, "changes");
      const summariesDir = join(root, "summaries");
      await mkdir(changesDir, { recursive: true });
      await mkdir(summariesDir, { recursive: true });
      await seedSummaryPointer(summariesDir, changesDir, "change-a");
      await seedSummaryPointer(summariesDir, changesDir, "change-b");

      await refreshLauncherAggregateAfterCommit(changesDir);

      const aggregate = JSON.parse(
        await readFile(join(root, "active-launcher-state.json"), "utf8"),
      );
      expect(aggregate.schema_version).toBe(1);
      expect(aggregate.source).toBe("disk_projection");
      expect(aggregate.active_count).toBe(2);
      expect(aggregate.changes.map((c: { id: string }) => c.id).sort()).toEqual(
        ["change-a", "change-b"],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("swallows errors silently when the store is missing (best-effort)", async () => {
    // ADR 0009: a failure to write the aggregate must never propagate —
    // the per-change projection is authoritative, the aggregate is a cache.
    await expect(
      refreshLauncherAggregateAfterCommit("/nonexistent/store/changes"),
    ).resolves.toBeUndefined();
  });

  test("produces an empty-but-valid aggregate when no summaries exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "launcher-agg-empty-"));
    try {
      const changesDir = join(root, "changes");
      await mkdir(changesDir, { recursive: true });

      await refreshLauncherAggregateAfterCommit(changesDir);

      const aggregate = JSON.parse(
        await readFile(join(root, "active-launcher-state.json"), "utf8"),
      );
      expect(aggregate.schema_version).toBe(1);
      expect(aggregate.active_count).toBe(0);
      expect(aggregate.changes).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
