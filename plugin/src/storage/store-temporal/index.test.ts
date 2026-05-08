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

function workflowNotFoundError(): Error {
  return new Error(
    "Workflow execution not found for workflowId: change-project-1-test",
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

function activeChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status: "active",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: Object.fromEntries(
      Object.entries(createDefaultGates()).map(([gate, value]) => [
        gate,
        gate === "proposal" || gate === "discovery"
          ? { ...value, status: "done" as const }
          : value,
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

/**
 * rq-replayFallback01.3: query throws TMPRL1100 (poisoned), AND `start`
 * throws a non-already-started error so re-seed itself fails. Used to
 * exercise the catch block at reseedChangeFromDisk's `try/catch` around
 * `ensureChangeWorkflowStarted` (vs the post-reseed-query catch).
 */
async function createPoisonedReseedFailureStore(root: string) {
  const legacy = await createDiskStore(root);
  let startCallCount = 0;
  const handle = {
    query: async () => {
      throw poisonedHistoryError();
    },
  };
  const temporal = {
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => {
          startCallCount += 1;
          // Non-already-started error → ensureChangeWorkflowStarted rethrows
          // → reseedChangeFromDisk's catch at the `ensureChangeWorkflowStarted`
          // try/catch fires.
          throw new Error("Temporal start failed: namespace handshake error");
        },
      },
    },
  };

  const store = await createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "project-1",
  });
  return { store, startCallCount: () => startCallCount };
}

/**
 * Negative-case fixture: query throws WorkflowNotFoundError (matches
 * `not_found` regex → fallback class, but reason resolves to
 * `missing_workflow`, not `poisoned_history`). re-seed fails. The fix
 * MUST NOT mask this — the original WorkflowNotFoundError must still
 * surface.
 */
async function createMissingWorkflowReseedFailureStore(root: string) {
  const legacy = await createDiskStore(root);
  const handle = {
    query: async () => {
      throw workflowNotFoundError();
    },
  };
  const temporal = {
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => {
          throw new Error("Temporal start failed: namespace handshake error");
        },
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

  // rq-replayFallback01.3 — non-terminal change + poisoned history + re-seed
  // itself fails. The fix in reseedChangeFromDisk's catch block returns the
  // disk projection rather than null, so callers don't see a TMPRL1100 throw.
  it("returns disk projection for non-terminal poisoned change when re-seed itself fails", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activePoisonedReseedFail"));

    const { store, startCallCount } =
      await createPoisonedReseedFailureStore(tempDir);
    const result = await store.changes.get("activePoisonedReseedFail");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("activePoisonedReseedFail");
    expect(result.data?.status).toBe("active");
    const recovered = result.data as Change & {
      _source?: string;
      _recovery?: { mode?: string; reason?: string };
    };
    expect(recovered._source).toBe("disk");
    expect(recovered._recovery?.reason).toBe("poisoned_history");
    expect(recovered._recovery?.mode).toBe("temporal_query_fallback");
    // re-seed was attempted exactly once (non-destructive: not retried)
    expect(startCallCount()).toBe(1);
  });

  it("returns recovered gates for non-terminal poisoned change with reseed failure", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = activeChange("activePoisonedReseedFailGates");
    await legacy.changes.save(change);

    const { store } = await createPoisonedReseedFailureStore(tempDir);
    const gates = await store.gates.get("activePoisonedReseedFailGates");

    expect(gates).toEqual(change.gates);
  });

  it("does NOT mask missing-workflow errors when re-seed itself fails", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activeMissingReseedFail"));

    const store = await createMissingWorkflowReseedFailureStore(tempDir);

    await expect(store.changes.get("activeMissingReseedFail")).rejects.toThrow(
      /Workflow execution not found/,
    );
  });
});
