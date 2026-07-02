import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";
import { saveRecoveredChangeStatus } from "../../tools/_recovery-writers";

function allDoneGates(): Change["gates"] {
  return Object.fromEntries(
    Object.entries(createDefaultGates()).map(([gate, value]) => [
      gate,
      { ...value, status: "done" as const },
    ]),
  ) as Change["gates"];
}

function activeChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status: "active",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: allDoneGates(),
    reentry_history: [],
    wisdom: [],
  };
}

function archivedChange(id: string): Change {
  return {
    ...activeChange(id),
    title: `Archived ${id}`,
    status: "archived",
  };
}

describe("status repair public read-path parity", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("agrees immediately after a disk-only status repair (AC3)", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    // Seed an active change on disk with all gates done.
    const change = activeChange("statusRepairedChange");
    await legacy.changes.save(change);

    // Temporal still reports the stale active state (poisoned/completed
    // workflow that never persisted the archive transition).
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => ({
              id: "statusRepairedChange",
              changeId: "statusRepairedChange",
              title: "Active statusRepairedChange",
              status: "active",
              createdAt: "2026-05-07T00:00:00.000Z",
              initializedAt: "2026-05-07T00:00:00.000Z",
              projectId: "project-1",
              tasks: [],
              deltas: {},
              wisdom: [],
              gates: allDoneGates(),
              reentry_history: [],
              artifacts: {},
              documents: {},
              reflections: [],
              worktrees: {},
              conformance: { lockedSpecs: [], overrides: [] },
            }),
          }),
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    };

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });

    // Warm public read paths with the stale active state. At this point the
    // archive bundle has not been written yet, so the cache/memo warms active.
    const warmGet = await store.changes.get("statusRepairedChange");
    expect(warmGet.success).toBe(true);
    expect(warmGet.data?.status).toBe("active");

    const warmList = await store.changes.listSummary!({});
    expect(
      warmList.changes.find((c) => c.id === "statusRepairedChange")?.status,
    ).toBe("active");

    // Now simulate the real shipped invariant: archive bundle is present on
    // disk, but the active source dir still carries the stale active status.
    const archiveDir = join(tempDir, ".adv", "archive", "statusRepairedChange");
    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      join(archiveDir, "change.json"),
      JSON.stringify(archivedChange("statusRepairedChange"), null, 2),
    );

    // Simulate adv_change_status_repair: disk-only status flip to archived.
    const repaired = await saveRecoveredChangeStatus({
      store,
      change: warmGet.data!,
      authorization: {
        reason: "workflow completed but status remained active",
        evidence: "WorkflowNotFoundError + operator approved",
      },
      status: "archived",
    });
    expect(repaired.status).toBe("archived");

    // AC3: immediate public read paths must agree. Query the warm-path
    // summary list first, since it is the most likely to read stale cache.
    const inFlight = await store.changes.listSummary!({});
    expect(inFlight.changes.some((c) => c.id === "statusRepairedChange")).toBe(
      false,
    );

    const show = await store.changes.get("statusRepairedChange");
    expect(show.success).toBe(true);
    expect(show.data?.status).toBe("archived");

    const archived = await store.changes.list({
      status: "archived",
      includeArchived: true,
    });
    const archivedMatches = archived.changes.filter(
      (c) => c.id === "statusRepairedChange",
    );
    expect(archivedMatches).toHaveLength(1);
    expect(archivedMatches[0]!.status).toBe("archived");
  });
});
