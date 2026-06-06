import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change, type Task } from "../../types";
import { createDiskStore } from "../store-disk";
import { changeToWorkflowState } from "../../temporal/change-state";
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

function closedChange(id: string): Change {
  return {
    ...activeChange(id),
    title: `Closed ${id}`,
    status: "closed",
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

async function createMissingWorkflowSuccessfulReseedStore(
  root: string,
  changes: Change[],
) {
  const legacy = await createDiskStore(root);
  for (const change of changes) {
    await legacy.changes.save(change);
  }

  const byId = new Map(changes.map((change) => [change.id, change]));
  const started = new Set<string>();
  const startInputs: unknown[] = [];
  const queryCounts = new Map<string, number>();
  const resolveChangeId = (workflowId: string): string => {
    const match = changes.find(
      (change) =>
        workflowId.endsWith(`/${change.id}`) ||
        workflowId.endsWith(`-${change.id}`),
    );
    if (!match) throw new Error(`Unexpected workflow id: ${workflowId}`);
    return match.id;
  };

  const temporal = {
    client: {
      workflow: {
        getHandle: (workflowId: string) => {
          const changeId = resolveChangeId(workflowId);
          return {
            query: async () => {
              queryCounts.set(changeId, (queryCounts.get(changeId) ?? 0) + 1);
              if (!started.has(changeId)) throw workflowNotFoundError();
              return changeToWorkflowState({
                projectId: "project-1",
                change: byId.get(changeId)!,
              });
            },
          };
        },
        start: async (_workflow: unknown, options: { args: [unknown] }) => {
          const input = options.args[0] as { changeId: string };
          startInputs.push(input);
          started.add(input.changeId);
          return {
            query: async () =>
              changeToWorkflowState({
                projectId: "project-1",
                change: byId.get(input.changeId)!,
              }),
          };
        },
      },
    },
  };

  const store = createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "project-1",
  });
  return {
    store,
    startInputs: () => startInputs,
    queryCount: (changeId: string) => queryCounts.get(changeId) ?? 0,
  };
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

  it("re-seeds an active disk-only change on direct read", async () => {
    tempDir = await createTempDir();
    const active = activeChange("activeDiskOnlyRead");
    const { store, startInputs } =
      await createMissingWorkflowSuccessfulReseedStore(tempDir, [active]);

    const result = await store.changes.get("activeDiskOnlyRead");

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: "activeDiskOnlyRead",
      status: "active",
    });
    expect(startInputs()).toHaveLength(1);
    expect(startInputs()[0]).toEqual(
      expect.objectContaining({
        changeId: "activeDiskOnlyRead",
        seedState: expect.objectContaining({ status: "active" }),
      }),
    );
  });

  it("list re-seeds active disk-only changes without resurrecting terminal changes", async () => {
    tempDir = await createTempDir();
    const active = activeChange("activeDiskOnlyList");
    const archived = archivedChange("archivedDiskOnlyList");
    const closed = closedChange("closedDiskOnlyList");
    const { store, startInputs, queryCount } =
      await createMissingWorkflowSuccessfulReseedStore(tempDir, [
        active,
        archived,
        closed,
      ]);

    const list = await store.changes.list();

    expect(list.changes.map((change) => change.id)).toContain(
      "activeDiskOnlyList",
    );
    expect(list.changes.map((change) => change.id)).not.toContain(
      "archivedDiskOnlyList",
    );
    expect(list.changes.map((change) => change.id)).not.toContain(
      "closedDiskOnlyList",
    );
    expect(startInputs()).toEqual([
      expect.objectContaining({ changeId: "activeDiskOnlyList" }),
    ]);
    expect(queryCount("archivedDiskOnlyList")).toBe(1);
    expect(queryCount("closedDiskOnlyList")).toBe(1);
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

describe("listResolvedChanges memo fast path", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("does not omit active changes discoverable from disk when memo is warmed", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    const changeA = activeChange("memoChange");
    const changeB = activeChange("diskOnlyChange");
    await legacy.changes.save(changeA);
    await legacy.changes.save(changeB);

    const temporal = {
      client: {
        workflow: {
          getHandle: (workflowId: string) => {
            const changeId =
              workflowId.split("/").pop() ?? workflowId.split(":").pop() ?? "";
            if (changeId === "memoChange") {
              return {
                query: async () => ({
                  id: "memoChange",
                  changeId: "memoChange",
                  title: "Active memoChange",
                  status: "active",
                  createdAt: "2026-05-07T00:00:00.000Z",
                  initializedAt: "2026-05-07T00:00:00.000Z",
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
                }),
              };
            }
            return {
              query: async () => {
                throw workflowNotFoundError();
              },
            };
          },
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

    // Warm memo for changeA
    const getA = await store.changes.get("memoChange");
    expect(getA.success).toBe(true);

    // List should include BOTH changes
    const list = await store.changes.list();
    const ids = list.changes.map((c) => c.id);
    expect(ids).toContain("memoChange");
    expect(ids).toContain("diskOnlyChange");
  });

  it("does not flatten task counts to 0/0 when memo is warmed", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    const tasks: Task[] = [
      {
        id: "tk-1",
        title: "Task 1",
        status: "done",
        changeId: "taskedChange",
        created_at: "2026-05-07T00:00:00.000Z",
      },
      {
        id: "tk-2",
        title: "Task 2",
        status: "pending",
        changeId: "taskedChange",
        created_at: "2026-05-07T00:00:00.000Z",
      },
    ];
    const changeWithTasks = {
      ...activeChange("taskedChange"),
      tasks,
    } as Change;
    await legacy.changes.save(changeWithTasks);

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => ({
              id: "taskedChange",
              changeId: "taskedChange",
              title: "Active taskedChange",
              status: "active",
              createdAt: "2026-05-07T00:00:00.000Z",
              initializedAt: "2026-05-07T00:00:00.000Z",
              projectId: "project-1",
              tasks,
              deltas: {},
              wisdom: [],
              gates: createDefaultGates(),
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

    // Warm memo for taskedChange
    const getResult = await store.changes.get("taskedChange");
    expect(getResult.success).toBe(true);

    // List should preserve task counts
    const list = await store.changes.list();
    const listed = list.changes.find((c) => c.id === "taskedChange");
    expect(listed).toBeDefined();
    expect(listed!.taskCount).toBe(2);
    expect(listed!.completedTasks).toBe(1);
  });
});

describe("listResolvedChanges memo busting (rq-crossSessionCacheConsistency01)", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("busts stale memo and returns archived status when archive bundle exists", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    // Save an active change on disk
    const change = activeChange("staleMemoChange");
    await legacy.changes.save(change);

    // Stateful mock: first query returns active (warm memo), subsequent
    // queries return archived (simulates session B archiving the change).
    let queryCount = 0;
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCount++;
              if (queryCount === 1) {
                return {
                  id: "staleMemoChange",
                  changeId: "staleMemoChange",
                  title: "Active staleMemoChange",
                  status: "active",
                  createdAt: "2026-05-07T00:00:00.000Z",
                  initializedAt: "2026-05-07T00:00:00.000Z",
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
                };
              }
              return {
                id: "staleMemoChange",
                changeId: "staleMemoChange",
                title: "Archived staleMemoChange",
                status: "archived",
                createdAt: "2026-05-07T00:00:00.000Z",
                initializedAt: "2026-05-07T00:00:00.000Z",
                projectId: "project-1",
                tasks: [],
                deltas: {},
                wisdom: [],
                gates: Object.fromEntries(
                  Object.entries(createDefaultGates()).map(([gate, value]) => [
                    gate,
                    { ...value, status: "done" as const },
                  ]),
                ) as Change["gates"],
                reentry_history: [],
                artifacts: {},
                documents: {},
                reflections: [],
                worktrees: {},
                conformance: { lockedSpecs: [], overrides: [] },
              };
            },
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

    // Warm memo with active status
    const getResult = await store.changes.get("staleMemoChange");
    expect(getResult.success).toBe(true);
    expect(getResult.data?.status).toBe("active");

    // Simulate session B archiving the change: create archive bundle
    const archiveBundleDir = join(
      tempDir,
      ".adv",
      "archive",
      "staleMemoChange",
    );
    await mkdir(archiveBundleDir, { recursive: true });
    await writeFile(
      join(archiveBundleDir, "change.json"),
      JSON.stringify(archivedChange("staleMemoChange"), null, 2),
    );

    // Default list should now exclude the change (correctly seen as archived)
    const defaultList = await store.changes.list();
    const defaultIds = defaultList.changes.map((c) => c.id);
    expect(defaultIds).not.toContain("staleMemoChange");

    // With includeArchived, the change surfaces as archived
    const archivedList = await store.changes.list({ includeArchived: true });
    const archived = archivedList.changes.find(
      (c) => c.id === "staleMemoChange",
    );
    expect(archived).toBeDefined();
    expect(archived!.status).toBe("archived");
  });

  it("skips memo busting for entries already in terminal state", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    // Save an archived change on disk
    const change = archivedChange("terminalMemoChange");
    await legacy.changes.save(change);

    // Temporal client always throws poisoned history — forces disk fallback
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              throw poisonedHistoryError();
            },
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

    // Warm memo with archived status
    const getResult = await store.changes.get("terminalMemoChange");
    expect(getResult.success).toBe(true);
    expect(getResult.data?.status).toBe("archived");

    // Create archive bundle (should not trigger extra invalidation)
    const archiveBundleDir = join(
      tempDir,
      ".adv",
      "archive",
      "terminalMemoChange",
    );
    await mkdir(archiveBundleDir, { recursive: true });
    await writeFile(
      join(archiveBundleDir, "change.json"),
      JSON.stringify(archivedChange("terminalMemoChange"), null, 2),
    );

    // List with includeArchived should still return the change correctly
    const list = await store.changes.list({ includeArchived: true });
    const found = list.changes.find((c) => c.id === "terminalMemoChange");
    expect(found).toBeDefined();
    expect(found!.status).toBe("archived");
  });

  it("does not add excessive latency from pre-scan", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    // Save a single active change
    const change = activeChange("perfChange");
    await legacy.changes.save(change);

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => ({
              id: "perfChange",
              changeId: "perfChange",
              title: "Active perfChange",
              status: "active",
              createdAt: "2026-05-07T00:00:00.000Z",
              initializedAt: "2026-05-07T00:00:00.000Z",
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

    // Warm memo
    await store.changes.get("perfChange");

    // No archive bundle exists — pre-scan should still complete quickly
    const start = performance.now();
    const list = await store.changes.list();
    const elapsed = performance.now() - start;

    expect(list.changes.some((c) => c.id === "perfChange")).toBe(true);
    // Pre-scan + hydration for 1 change should be well under 100ms
    expect(elapsed).toBeLessThan(100);
  });
});
