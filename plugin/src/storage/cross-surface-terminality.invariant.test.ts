import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { createDefaultGates, type Change } from "../types";
import { createDiskStore } from "./store-disk";
import { rebuildSummaryIndex } from "./change-summary-shard";
import { buildLauncherProjection } from "./launcher-projection";
import { createTemporalStoreBackend } from "./store-temporal";
import { readChangeSnapshot } from "./store-temporal/read-model";
import { renderTerminalHistory } from "../archive/terminal-history";
import { createTemporalReadDeadline } from "../temporal/retry-wrapper";

const CHANGE_ID = "crossSurfaceArchivedChange";

let tempDir: string | undefined;

function gates(status: "done" | "pending") {
  return Object.fromEntries(
    Object.entries(createDefaultGates()).map(([gate, value]) => [
      gate,
      { ...value, status },
    ]),
  ) as Change["gates"];
}

function staleDraftChange(id = CHANGE_ID): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Stale ${id}`,
    status: "draft",
    created_at: "2026-08-05T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: gates("pending"),
    reentry_history: [],
    wisdom: [],
  };
}

function archivedChange(id = CHANGE_ID): Change {
  return {
    ...staleDraftChange(id),
    title: `Archived ${id}`,
    status: "archived",
    gates: gates("done"),
  };
}

async function writeArchiveBundle(
  root: string,
  id: string,
  directory = `2026-08-05-${id}`,
): Promise<void> {
  const bundle = join(root, ".adv", "archive", directory);
  await mkdir(bundle, { recursive: true });
  await writeFile(
    join(bundle, "change.json"),
    JSON.stringify(archivedChange(id), null, 2),
  );
}

async function createStaleArchiveFixture() {
  tempDir = await createTempDir();
  const legacy = await createDiskStore(tempDir);

  // Patch-never-fired shape: the active projection and summary shard remain
  // draft even though the durable archive bundle is already present.
  await legacy.changes.save(staleDraftChange());
  const rebuilt = await rebuildSummaryIndex({
    changesDir: legacy.paths.changes,
    summariesDir: legacy.paths.summariesDir,
  });
  expect(rebuilt.kind).toBe("ok");
  await writeArchiveBundle(tempDir, CHANGE_ID);

  const temporal = {
    client: {
      workflow: {
        getHandle: () => ({
          query: async () => {
            throw new Error("invariant fixture must not query Temporal");
          },
        }),
        start: async () => {
          throw new Error("invariant fixture must not start Temporal");
        },
      },
    },
  };

  return {
    legacy,
    store: createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    }),
  };
}

function isTerminal(status: string | undefined): boolean {
  return status === "archived" || status === "closed";
}

describe("archived terminality cross-surface invariant", () => {
  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("keeps list, listSummary, get, snapshot, and launcher projection terminal", async () => {
    const { legacy, store } = await createStaleArchiveFixture();

    const list = await store.changes.list({ includeArchived: true });
    const listSummary = await store.changes.listSummary!({
      includeArchived: true,
    });
    const get = await store.changes.get(CHANGE_ID);
    const snapshot = await readChangeSnapshot(
      legacy.paths.archive,
      `2026-08-05-${CHANGE_ID}`,
      "archive",
    );
    const launcher = await buildLauncherProjection({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
      archiveDir: legacy.paths.archive,
      generatedAt: "2026-08-05T00:01:00.000Z",
      degradedThresholdMs: 60_000,
    });

    const answers = [
      {
        surface: "list",
        status: list.changes.find((c) => c.id === CHANGE_ID)?.status,
      },
      {
        surface: "listSummary",
        status: listSummary.changes.find((c) => c.id === CHANGE_ID)?.status,
      },
      { surface: "get", status: get.success ? get.data?.status : undefined },
      {
        surface: "snapshot",
        status: snapshot.found ? snapshot.snapshot.status : undefined,
      },
      {
        surface: "launcher-projection",
        status: launcher.changes.find((c) => c.id === CHANGE_ID)?.status,
      },
    ];

    const answered = answers.filter(
      (answer): answer is typeof answer & { status: string } =>
        answer.status !== undefined,
    );
    expect(answered.length).toBeGreaterThan(1);
    for (const answer of answered) {
      expect(
        isTerminal(answer.status),
        `${answer.surface} returned ${String(answer.status)}`,
      ).toBe(true);
    }
    expect(new Set(answered.map(({ status }) => status))).toEqual(
      new Set(["archived"]),
    );
  });

  it("omits archive candidates rather than returning partial non-terminal answers after scan truncation", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await writeArchiveBundle(
      tempDir,
      "truncatedArchiveA",
      "2026-08-05-truncatedArchiveA",
    );
    await writeArchiveBundle(
      tempDir,
      "truncatedArchiveB",
      "2026-08-05-truncatedArchiveB",
    );

    const temporal = {
      client: {
        workflow: { getHandle: () => ({ query: async () => undefined }) },
      },
    };
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });
    const result = await store.changes.listSummary!({
      includeArchived: true,
      deadline: createTemporalReadDeadline(0),
    });

    expect(result.changes, JSON.stringify(result)).toEqual([]);
    expect(
      result.warnings?.some(
        (warning) =>
          warning.code === "SOURCE_DEADLINE_EXCEEDED" ||
          warning.code === "TERMINAL_CANDIDATE_OMITTED" ||
          warning.code === "TERMINAL_SOURCE_DEGRADED",
      ),
      JSON.stringify(result),
    ).toBe(true);
    expect(result.changes.every((change) => isTerminal(change.status))).toBe(
      true,
    );
  });

  it("terminal-history scan also refuses truncated archive candidates", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await writeArchiveBundle(
      tempDir,
      "historyTruncatedA",
      "2026-08-05-historyTruncatedA",
    );
    await writeArchiveBundle(
      tempDir,
      "historyTruncatedB",
      "2026-08-05-historyTruncatedB",
    );

    const result = await renderTerminalHistory({
      archivePath: legacy.paths.archive,
      includeArchived: true,
      deadline: createTemporalReadDeadline(0),
    });

    expect(result.changes.every((change) => isTerminal(change.status))).toBe(
      true,
    );
    expect(result.hydrationStats.deadlineExceeded).toBe(true);
    expect(result.hydrationStats.omitted).toBeGreaterThanOrEqual(0);
  });
});
