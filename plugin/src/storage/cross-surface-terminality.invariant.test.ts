import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { createDefaultGates, type Change } from "../types";
import { renderTerminalHistory } from "../archive/terminal-history";
import { buildLauncherProjection } from "./launcher-projection";
import { createDiskStore } from "./store-disk";

const CHANGE_ID = "crossSurfaceArchivedChange";

function gates(status: "done" | "pending") {
  return Object.fromEntries(
    Object.entries(createDefaultGates()).map(([gate, value]) => [
      gate,
      { ...value, status },
    ]),
  ) as Change["gates"];
}

function change(id: string, status: "draft" | "archived"): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `${status === "archived" ? "Archived" : "Stale"} ${id}`,
    status,
    created_at: "2026-08-05T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: gates(status === "archived" ? "done" : "pending"),
    reentry_history: [],
    wisdom: [],
  };
}

async function writeArchiveBundle(root: string, id: string): Promise<void> {
  const bundle = join(root, ".adv", "archive", `2026-08-05-${id}`);
  await mkdir(bundle, { recursive: true });
  await writeFile(
    join(bundle, "change.json"),
    JSON.stringify(change(id, "archived"), null, 2),
  );
}

describe("archived terminality across disk-owned surfaces", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("keeps list, get, archive history, and launcher projection terminal", async () => {
    tempDir = await createTempDir("terminality-");
    const store = await createDiskStore(tempDir);
    await writeArchiveBundle(tempDir, CHANGE_ID);

    const list = await store.changes.list({ includeArchived: true });
    const loaded = await store.changes.get(CHANGE_ID);
    const history = await renderTerminalHistory({
      archivePath: store.paths.archive,
      includeArchived: true,
    });
    const launcher = await buildLauncherProjection({
      changesDir: store.paths.changes,
      summariesDir: store.paths.summariesDir,
      archiveDir: store.paths.archive,
      generatedAt: "2026-08-05T00:01:00.000Z",
      degradedThresholdMs: 60_000,
    });

    expect(list.changes.find((item) => item.id === CHANGE_ID)?.status).toBe(
      "archived",
    );
    expect(loaded.success && loaded.data?.status).toBe("archived");
    expect(history.changes.find((item) => item.id === CHANGE_ID)?.status).toBe(
      "archived",
    );
    const launcherRow = launcher.changes.find((item) => item.id === CHANGE_ID);
    expect(
      launcherRow === undefined ||
        launcherRow.status === "archived" ||
        launcherRow.status === "closed",
    ).toBe(true);
  });

  it("never emits a non-terminal row when archive candidates are malformed", async () => {
    tempDir = await createTempDir("terminality-malformed-");
    const store = await createDiskStore(tempDir);
    const archiveDir = join(store.paths.archive, "broken");
    await mkdir(archiveDir, { recursive: true });
    await writeFile(join(archiveDir, "change.json"), '{"broken":true}\n');

    const result = await renderTerminalHistory({
      archivePath: store.paths.archive,
      includeArchived: true,
    });

    expect(
      result.changes.every(
        (item) => item.status === "archived" || item.status === "closed",
      ),
    ).toBe(true);
    expect(result.hydrationStats.omitted).toBeGreaterThan(0);
  });
});
