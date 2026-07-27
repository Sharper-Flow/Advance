import { describe, expect, test, vi } from "vitest";
import {
  buildLauncherProjection,
  LauncherProjectionSchema,
} from "./launcher-projection";
import type { ChangeSummaryShard } from "./change-summary-shard";

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
});
