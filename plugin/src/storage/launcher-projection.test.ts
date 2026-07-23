import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import {
  buildLauncherProjection,
  LauncherProjectionSchema,
  LauncherChangeSummarySchema,
} from "./launcher-projection";

async function writeChangeProjection(
  changesDir: string,
  changeId: string,
  state: Record<string, unknown>,
) {
  await writeFile(
    join(changesDir, `${changeId}.json`),
    JSON.stringify(
      {
        schemaVersion: 2,
        projectId: "test-project",
        changeId,
        projectedAt: new Date().toISOString(),
        state,
      },
      null,
      2,
    ),
  );
}

async function writeArchiveBundle(
  archiveDir: string,
  bundleDirName: string,
  canonicalId: string,
) {
  const dir = join(archiveDir, bundleDirName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "change.json"),
    JSON.stringify({ id: canonicalId }, null, 2),
  );
}

function makeState(overrides: {
  id: string;
  title?: string;
  status?: string;
  createdAt?: string;
  lastSignalAt?: string;
  tasks?: Array<{ status: string }>;
  gates?: Record<string, { status: string }>;
  epic_membership?: {
    epic_id: string;
    entry_id: string;
    order: number;
    title: string;
  };
}): Record<string, unknown> {
  const {
    id,
    title = `Title ${id}`,
    status = "draft",
    createdAt = "2026-07-23T10:00:00.000Z",
    lastSignalAt,
    tasks = [],
    gates = {
      proposal: { status: "pending" },
      discovery: { status: "pending" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    epic_membership,
  } = overrides;
  const state: Record<string, unknown> = {
    id,
    title,
    status,
    createdAt,
    tasks,
    gates,
  };
  if (lastSignalAt !== undefined) state.lastSignalAt = lastSignalAt;
  if (epic_membership !== undefined) state.epic_membership = epic_membership;
  return state;
}

describe("buildLauncherProjection", () => {
  let baseDir: string;
  let changesDir: string;
  let archiveDir: string;
  let generatedAt: string;

  beforeEach(async () => {
    baseDir = await createTempDir("launcher-projection-");
    changesDir = join(baseDir, "changes");
    archiveDir = join(baseDir, "archive");
    generatedAt = "2026-07-23T12:00:00.000Z";
  });

  afterEach(async () => {
    await cleanupTempDir(baseDir);
  });

  test("keeps draft changes and excludes archived/closed", async () => {
    await mkdir(changesDir, { recursive: true });
    await writeChangeProjection(
      changesDir,
      "draft-1",
      makeState({ id: "draft-1", status: "draft" }),
    );
    await writeChangeProjection(
      changesDir,
      "archived-1",
      makeState({ id: "archived-1", status: "archived" }),
    );
    await writeChangeProjection(
      changesDir,
      "closed-1",
      makeState({ id: "closed-1", status: "closed" }),
    );

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    expect(result.schema_version).toBe(1);
    expect(result.source).toBe("disk_projection");
    expect(result.epics_available).toBe(false);
    expect(result.active_count).toBe(1);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].id).toBe("draft-1");
    expect(result.changes[0].status).toBe("draft");
    expect(result.freshness).toBeNull();
    expect(result.degraded).toBe(false);
    expect(() => LauncherProjectionSchema.parse(result)).not.toThrow();
  });

  test("excludes archived change by canonical id even when directory name differs", async () => {
    await mkdir(changesDir, { recursive: true });
    await writeChangeProjection(
      changesDir,
      "change-foo",
      makeState({ id: "change-foo", status: "draft" }),
    );
    await writeArchiveBundle(archiveDir, "legacy-bundle-xyz", "change-foo");

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    expect(result.changes).toHaveLength(0);
    expect(result.active_count).toBe(0);
  });

  test("freshness is the max lastSignalAt across active summaries", async () => {
    await mkdir(changesDir, { recursive: true });
    await writeChangeProjection(
      changesDir,
      "a",
      makeState({
        id: "a",
        status: "draft",
        lastSignalAt: "2026-07-23T10:00:00.000Z",
      }),
    );
    await writeChangeProjection(
      changesDir,
      "b",
      makeState({
        id: "b",
        status: "draft",
        lastSignalAt: "2026-07-23T12:00:00.000Z",
      }),
    );
    await writeChangeProjection(
      changesDir,
      "c",
      makeState({
        id: "c",
        status: "draft",
        lastSignalAt: "2026-07-23T11:00:00.000Z",
      }),
    );

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    expect(result.freshness).toBe("2026-07-23T12:00:00.000Z");
    expect(result.active_count).toBe(3);
  });

  test("degraded flag reflects threshold boundary", async () => {
    await mkdir(changesDir, { recursive: true });
    const signalTime = "2026-07-23T10:00:00.000Z";
    const signalMs = new Date(signalTime).getTime();
    const thresholdMs = 60000;

    await writeChangeProjection(
      changesDir,
      "active",
      makeState({
        id: "active",
        status: "draft",
        lastSignalAt: signalTime,
      }),
    );

    const spy = vi
      .spyOn(Date, "now")
      .mockReturnValue(signalMs + thresholdMs - 1);
    const under = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: thresholdMs,
    });
    expect(under.degraded).toBe(false);
    spy.mockRestore();

    vi.spyOn(Date, "now").mockReturnValue(signalMs + thresholdMs + 1);
    const over = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: thresholdMs,
    });
    expect(over.degraded).toBe(true);
  });

  test("degraded is false when freshness is null", async () => {
    await mkdir(changesDir, { recursive: true });
    await writeChangeProjection(
      changesDir,
      "no-signal",
      makeState({ id: "no-signal", status: "draft" }),
    );

    vi.spyOn(Date, "now").mockReturnValue(Number.MAX_SAFE_INTEGER);

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 1,
    });

    expect(result.freshness).toBeNull();
    expect(result.degraded).toBe(false);
  });

  test("missing changes and archive dirs return empty projection", async () => {
    await rm(changesDir, { recursive: true, force: true });
    await rm(archiveDir, { recursive: true, force: true });

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    expect(result.active_count).toBe(0);
    expect(result.changes).toHaveLength(0);
    expect(result.freshness).toBeNull();
    expect(result.degraded).toBe(false);
    expect(result.source).toBe("disk_projection");
    expect(result.epics_available).toBe(false);
  });

  test("sorts changes by last_activity descending", async () => {
    await mkdir(changesDir, { recursive: true });
    await writeChangeProjection(
      changesDir,
      "early",
      makeState({
        id: "early",
        status: "draft",
        lastSignalAt: "2026-07-23T09:00:00.000Z",
      }),
    );
    await writeChangeProjection(
      changesDir,
      "latest",
      makeState({
        id: "latest",
        status: "draft",
        lastSignalAt: "2026-07-23T14:00:00.000Z",
      }),
    );
    await writeChangeProjection(
      changesDir,
      "mid",
      makeState({
        id: "mid",
        status: "draft",
        lastSignalAt: "2026-07-23T12:00:00.000Z",
      }),
    );

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    expect(result.changes.map((c) => c.id)).toEqual(["latest", "mid", "early"]);
  });

  test("caps changes at 50", async () => {
    await mkdir(changesDir, { recursive: true });
    for (let i = 0; i < 60; i++) {
      await writeChangeProjection(
        changesDir,
        `change-${i.toString().padStart(2, "0")}`,
        makeState({
          id: `change-${i.toString().padStart(2, "0")}`,
          status: "draft",
          createdAt: `2026-07-23T00:${String(i).padStart(2, "0")}:00.000Z`,
        }),
      );
    }

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    expect(result.changes).toHaveLength(50);
    expect(result.active_count).toBe(50);
    expect(result.changes[0].id).toBe("change-59");
  });

  test("phase is first incomplete gate or release when all done", async () => {
    await mkdir(changesDir, { recursive: true });
    await writeChangeProjection(
      changesDir,
      "design-phase",
      makeState({
        id: "design-phase",
        status: "draft",
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "pending" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
      }),
    );
    await writeChangeProjection(
      changesDir,
      "release-phase",
      makeState({
        id: "release-phase",
        status: "draft",
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "done" },
        },
      }),
    );

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    const byId = Object.fromEntries(result.changes.map((c) => [c.id, c]));
    expect(byId["design-phase"]?.phase).toBe("design");
    expect(byId["release-phase"]?.phase).toBe("release");
  });

  test("passes through epic_membership when present", async () => {
    await mkdir(changesDir, { recursive: true });
    const membership = {
      epic_id: "epic-1",
      entry_id: "entry-1",
      order: 14,
      title: "Epic Entry",
    };
    await writeChangeProjection(
      changesDir,
      "with-epic",
      makeState({
        id: "with-epic",
        status: "draft",
        epic_membership: membership,
      }),
    );

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].epic_membership).toEqual(membership);
    expect(() =>
      LauncherChangeSummarySchema.parse(result.changes[0]),
    ).not.toThrow();
  });

  test("normalizes legacy active/pending status to draft", async () => {
    await mkdir(changesDir, { recursive: true });
    await writeChangeProjection(
      changesDir,
      "legacy-active",
      makeState({ id: "legacy-active", status: "active" }),
    );
    await writeChangeProjection(
      changesDir,
      "legacy-pending",
      makeState({ id: "legacy-pending", status: "pending" }),
    );

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    expect(result.changes.map((c) => c.id).sort()).toEqual([
      "legacy-active",
      "legacy-pending",
    ]);
    expect(result.changes.every((c) => c.status === "draft")).toBe(true);
  });

  test("skips malformed projection files", async () => {
    await mkdir(changesDir, { recursive: true });
    await writeChangeProjection(
      changesDir,
      "good",
      makeState({ id: "good", status: "draft" }),
    );
    await writeFile(join(changesDir, "bad.json"), "{ not valid json");

    const result = await buildLauncherProjection({
      changesDir,
      archiveDir,
      generatedAt,
      degradedThresholdMs: 60000,
    });

    expect(result.changes.map((c) => c.id)).toEqual(["good"]);
  });
});
