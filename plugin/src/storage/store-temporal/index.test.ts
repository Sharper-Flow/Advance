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

function genericWorkflowQueryError(): Error {
  return new Error("Failed to query Workflow");
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

function contractProof(): NonNullable<Change["contract"]> {
  return {
    version: 1,
    rigor: "standard",
    source: {
      artifact: "agreement",
      approvedAt: "2026-05-21T00:00:00.000Z",
    },
    items: [
      {
        id: "AC1",
        kind: "acceptance_criterion",
        text: "Contract proof is preserved.",
        sourceArtifact: "agreement",
        verificationRequired: true,
        evidencePolicy: "test",
        status: "approved",
      },
    ],
    reviewMatrix: {
      reviewedAt: "2026-05-21T01:00:00.000Z",
      rows: [
        {
          contractId: "AC1",
          kind: "acceptance_criterion",
          status: "pass",
          evidencePolicy: "test",
          evidence: "passing test",
        },
      ],
    },
    amendments: [],
  };
}

async function createPoisonedPostReseedFailureStore(root: string) {
  const legacy = await createDiskStore(root);
  let startArgs: unknown[] | undefined;
  const handle = {
    query: async () => {
      throw poisonedHistoryError();
    },
  };
  const temporal = {
    client: {
      workflow: {
        getHandle: () => handle,
        start: async (...args: unknown[]) => {
          startArgs = args;
          return handle;
        },
      },
    },
  };

  const store = createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "project-1",
  });
  return { store, startArgs: () => startArgs };
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

  const store = createTemporalStoreBackend({
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

async function createGenericQueryPoisonedReseedFailureStore(root: string) {
  const legacy = await createDiskStore(root);
  let startCallCount = 0;
  const handle = {
    query: async () => {
      throw genericWorkflowQueryError();
    },
    describe: async () => ({
      searchAttributes: {
        TemporalReportedProblems: [
          "category=WorkflowTaskFailed cause=WorkflowTaskFailedCauseNonDeterministicError",
        ],
      },
    }),
  };
  const temporal = {
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => {
          startCallCount += 1;
          throw new Error("Temporal start failed: namespace handshake error");
        },
      },
    },
  };

  const store = createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "project-1",
  });
  return { store, startCallCount: () => startCallCount };
}

async function createGenericQueryUnprovenStore(root: string) {
  const legacy = await createDiskStore(root);
  const handle = {
    query: async () => {
      throw genericWorkflowQueryError();
    },
    describe: async () => ({ searchAttributes: {} }),
  };
  const temporal = {
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => {
          throw new Error("Temporal start should not be called");
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

  it("seeds contract proof fields when recovering a poisoned non-terminal change", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = {
      ...activeChange("activePoisonedContractSeed"),
      contract: contractProof(),
      acceptanceCriteria: ["Contract proof is preserved."],
      documents: { agreement: "# Agreement" },
    } as Change;
    await legacy.changes.save(change);

    const { store, startArgs } =
      await createPoisonedPostReseedFailureStore(tempDir);
    await store.changes.get("activePoisonedContractSeed");
    const startOptions = startArgs()?.find(
      (arg): arg is { args: unknown[] } =>
        Boolean(arg) && typeof arg === "object" && "args" in arg,
    );

    expect(startOptions).toEqual(
      expect.objectContaining({
        args: [
          expect.objectContaining({
            seedState: expect.objectContaining({
              contract: change.contract,
              acceptanceCriteria: ["Contract proof is preserved."],
              documents: { agreement: "# Agreement" },
            }),
          }),
        ],
      }),
    );
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

  it("returns disk projection for generic query failure when visibility reports nondeterminism", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("genericPoisonedVisibility"));

    const { store, startCallCount } =
      await createGenericQueryPoisonedReseedFailureStore(tempDir);
    const result = await store.changes.get("genericPoisonedVisibility");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("genericPoisonedVisibility");
    const recovered = result.data as Change & {
      _source?: string;
      _recovery?: { mode?: string; reason?: string };
    };
    expect(recovered._source).toBe("disk");
    expect(recovered._recovery?.reason).toBe("poisoned_history");
    expect(recovered._recovery?.mode).toBe("temporal_query_fallback");
    expect(startCallCount()).toBe(1);
  });

  it("returns recovered gates for generic query failure when visibility reports nondeterminism", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = activeChange("genericPoisonedVisibilityGates");
    await legacy.changes.save(change);

    const { store } =
      await createGenericQueryPoisonedReseedFailureStore(tempDir);
    const gates = await store.gates.get("genericPoisonedVisibilityGates");

    expect(gates).toEqual(change.gates);
  });

  it("does NOT recover generic query failures without poisoned-history evidence", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("genericUnproven"));

    const store = await createGenericQueryUnprovenStore(tempDir);

    await expect(store.changes.get("genericUnproven")).rejects.toThrow(
      /Failed to query Workflow/,
    );
  });
});

/**
 * rq-autoManageAdvWorktrees AC3 — lazy migration of legacy changes
 * on first read. When a change.json predating this field is loaded,
 * `getTemporalChange` fires `worktreeAutoManagedSignal` once with
 * `value: false, source: "migrate"`. The signal handler is sticky so
 * concurrent migrations from peer sessions are idempotent. Failure
 * to fire (e.g., Temporal unreachable) MUST NOT block the read.
 */
describe("createTemporalStoreBackend worktree_auto_managed lazy migration", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  function legacyChangeWithoutMarker(id: string): Change {
    return {
      $schema: "https://advance.dev/schemas/change.v1.json",
      id,
      title: `Legacy ${id}`,
      status: "active",
      created_at: "2026-05-21T00:00:00.000Z",
      tasks: [],
      deltas: {},
      gates: createDefaultGates(),
      reentry_history: [],
      wisdom: [],
    };
  }

  async function createMigrationCaptureStore(
    root: string,
    options: {
      markerInWorkflowState?: boolean;
      signalShouldFail?: boolean;
    } = {},
  ) {
    const legacy = await createDiskStore(root);
    const signalCalls: Array<{
      signal: { name?: string };
      args: unknown;
    }> = [];
    let lastHandleId: string | undefined;
    const makeHandle = (changeId: string) => ({
      query: async () => ({
        id: changeId,
        changeId,
        title: `Legacy ${changeId}`,
        status: "active",
        createdAt: "2026-05-21T00:00:00.000Z",
        initializedAt: "2026-05-21T00:00:00.000Z",
        projectId: "project-1",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: createDefaultGates(),
        reentry_history: [],
        artifacts: {},
        documents: {},
        reflections: [],
        worktrees: {},
        conformance: { lockedSpecs: [], overrides: [] },
        ...(typeof options.markerInWorkflowState === "boolean"
          ? { worktree_auto_managed: options.markerInWorkflowState }
          : {}),
      }),
      signal: async (signal: { name?: string }, args: unknown) => {
        if (options.signalShouldFail) {
          throw new Error("Temporal signal failed: connection refused");
        }
        signalCalls.push({ signal, args });
      },
    });
    const temporal = {
      client: {
        workflow: {
          getHandle: (workflowId: string) => {
            // Extract change-id suffix from the constructed workflow id
            const suffix =
              workflowId.split("/").pop() ?? workflowId.split(":").pop() ?? "";
            lastHandleId = suffix || workflowId;
            return makeHandle(lastHandleId);
          },
          start: async () => makeHandle(lastHandleId ?? "unknown"),
        },
      },
    };
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });
    return { store, signalCalls: () => signalCalls };
  }

  it("fires worktreeAutoManagedSignal best-effort when state lacks marker", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(legacyChangeWithoutMarker("legacyChangeA"));

    const { store, signalCalls } = await createMigrationCaptureStore(tempDir);
    const result = await store.changes.get("legacyChangeA");

    // Read succeeds even though the marker is missing.
    expect(result.success).toBe(true);

    // Wait several event-loop ticks for the void async fire (which awaits
    // getGuardedChangeHandle's legacy-disk-read then handle.signal) to
    // enqueue + complete. setImmediate × 50 + sleep allows the disk read.
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    const calls = signalCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toMatchObject({
      value: false,
      source: "migrate",
    });
    expect(typeof (calls[0].args as { recordedAt?: string }).recordedAt).toBe(
      "string",
    );
  });

  it("does NOT fire migration when workflow state already has marker set", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(legacyChangeWithoutMarker("alreadyMigratedB"));

    const { store, signalCalls } = await createMigrationCaptureStore(tempDir, {
      markerInWorkflowState: true,
    });
    await store.changes.get("alreadyMigratedB");
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(signalCalls()).toHaveLength(0);
  });

  it("does NOT fire migration when workflow state has marker explicitly false (legacy already-migrated)", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(legacyChangeWithoutMarker("alreadyMigratedC"));

    const { store, signalCalls } = await createMigrationCaptureStore(tempDir, {
      markerInWorkflowState: false,
    });
    await store.changes.get("alreadyMigratedC");
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(signalCalls()).toHaveLength(0);
  });

  it("read succeeds when migration signal fire fails (best-effort, non-blocking)", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(legacyChangeWithoutMarker("signalFailureD"));

    const { store } = await createMigrationCaptureStore(tempDir, {
      signalShouldFail: true,
    });
    const result = await store.changes.get("signalFailureD");

    // Failure to fire migration MUST NOT block the read.
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("signalFailureD");
  });
});
