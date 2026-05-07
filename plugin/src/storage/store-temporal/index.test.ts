import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";

function poisonedHistoryError(): Error {
  return new Error(
    "[TMPRL1100] Nondeterminism error: No command scheduled for event HistoryEvent(id: 231, WorkflowExecutionUpdateAccepted)",
  );
}

function archivedChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Archived ${id}`,
    status: "archived",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: Object.fromEntries(
      Object.entries(createDefaultGates()).map(([gate, value]) => [
        gate,
        { ...value, status: "done" as const },
      ]),
    ) as Change["gates"],
    reentry_history: [],
    wisdom: [],
  };
}

async function createPoisonedStore(root: string) {
  const legacy = await createDiskStore(root);
  const handle = {
    query: async () => {
      throw poisonedHistoryError();
    },
  };
  const temporal = {
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => handle,
      },
    },
  };

  return createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "project-1",
  });
}

describe("createTemporalStoreBackend change projection fallback", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("returns a terminal disk projection when workflow history is poisoned", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(archivedChange("poisonedDisk"));

    const store = await createPoisonedStore(tempDir);
    const result = await store.changes.get("poisonedDisk");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("poisonedDisk");
    expect(result.data?.status).toBe("archived");
    expect((result.data as Change & { _source?: string })._source).toBe("disk");
  });

  it("returns an archive bundle projection when source disk snapshot is absent", async () => {
    tempDir = await createTempDir();
    const archiveDir = join(
      tempDir,
      ".adv",
      "archive",
      "2026-05-07-poisonedArchive",
    );
    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      join(archiveDir, "change.json"),
      JSON.stringify(archivedChange("poisonedArchive"), null, 2),
    );

    const store = await createPoisonedStore(tempDir);
    const result = await store.changes.get("poisonedArchive");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("poisonedArchive");
    expect(result.data?.status).toBe("archived");
    expect((result.data as Change & { _source?: string })._source).toBe(
      "archive",
    );
  });

  it("returns recovered gates when direct gate query hits poisoned history", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = archivedChange("poisonedGates");
    await legacy.changes.save(change);

    const store = await createPoisonedStore(tempDir);
    const gates = await store.gates.get("poisonedGates");

    expect(gates).toEqual(change.gates);
  });
});
