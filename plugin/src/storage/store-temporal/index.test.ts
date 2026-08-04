import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change, type Task } from "../../types";
import { createDiskStore } from "../store-disk";
import { changeToWorkflowState } from "../../temporal/change-state";
import { createTemporalStoreBackend } from "./index";
import {
  markPoisonedWorkflowForChange,
  isPoisonedWorkflowForChange,
  clearPoisonedWorkflowCache,
} from "./poisoned-workflow-cache";
import { createMockOwnerFromClient } from "../../temporal/__tests__/mock-owner";
import { classifyTemporalReadFailure } from "./shared";

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

/**
 * Poisoned query fixture for disk-first read tests. The `start` spy is
 * present only so tests can prove it is never invoked by a routine read.
 */
async function createPoisonedPostReadStore(root: string) {
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
    projectId: "0000ec0100000000000000000000000000000000",
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
    projectId: "0000ec0100000000000000000000000000000000",
  });
}

/**
 * rq-replayFallback01.3: query throws TMPRL1100 (poisoned). The read path
 * must fall back to the durable disk projection and must never start or
 * signal the workflow.
 */
async function createPoisonedReadStore(root: string) {
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
          // start is reachable only from mutation paths; a routine read must
          // never call it.
          throw new Error("Temporal start failed: namespace handshake error");
        },
      },
    },
  };

  const store = createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "0000ec0100000000000000000000000000000000",
  });
  return { store, startCallCount: () => startCallCount };
}

/**
 * Negative-case fixture: query throws WorkflowNotFoundError (matches
 * `not_found` regex → fallback class, but reason resolves to
 * `missing_workflow`, not `poisoned_history`). The read path must fall back to
 * disk and must never start or signal the workflow.
 */
async function createMissingWorkflowReadStore(root: string) {
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
    projectId: "0000ec0100000000000000000000000000000000",
  });
}

async function createGenericQueryPoisonedReadStore(root: string) {
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
    projectId: "0000ec0100000000000000000000000000000000",
  });
  return { store, startCallCount: () => startCallCount };
}

async function createGenericQueryUnprovenStore(root: string) {
  const legacy = await createDiskStore(root);
  let startCallCount = 0;
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
          startCallCount += 1;
          throw new Error("Temporal start should not be called");
        },
      },
    },
  };

  const store = createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "0000ec0100000000000000000000000000000000",
  });
  return { store, startCallCount: () => startCallCount };
}

/**
 * query_failed guard fixture: the query fails with a fallback-class error
 * that is neither poisoned nor completed/not-found ("query type not
 * registered" — the workflow exists but cannot answer). The typed
 * `query_failed` reason must only produce a disk fallback; routine reads
 * must never start or signal the workflow.
 */
async function createUnregisteredQueryStore(root: string) {
  const legacy = await createDiskStore(root);
  let startCallCount = 0;
  const handle = {
    query: async () => {
      throw new Error("Query type 'changeStateQuery' not registered");
    },
    describe: async () => ({ searchAttributes: {} }),
  };
  const temporal = {
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => {
          startCallCount += 1;
          return handle;
        },
      },
    },
  };

  const store = createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "0000ec0100000000000000000000000000000000",
  });
  return { store, startCallCount: () => startCallCount };
}

async function createDiskOnlyChangeStore(root: string, changes: Change[]) {
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
                projectId: "0000ec0100000000000000000000000000000000",
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
                projectId: "0000ec0100000000000000000000000000000000",
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
    projectId: "0000ec0100000000000000000000000000000000",
  });
  return {
    store,
    startInputs: () => startInputs,
    queryCount: (changeId: string) => queryCounts.get(changeId) ?? 0,
  };
}

async function createHangingQueryStore(root: string, changeId: string) {
  const legacy = await createDiskStore(root);
  await legacy.changes.save(activeChange(changeId));
  let queryCount = 0;
  const handle = {
    query: async () => {
      queryCount += 1;
      return new Promise(() => {
        // Intentionally never resolves — proves the poisoned cache short-
        // circuits the query path before any timeout budget is consumed.
      });
    },
  };
  const temporal = createMockOwnerFromClient({
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => handle,
      },
    },
  });
  const store = createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "0000ec0100000000000000000000000000000000",
  });
  return { store, queryCount: () => queryCount };
}

async function createPoisonedSignalStore(root: string, changeId: string) {
  const legacy = await createDiskStore(root);
  await legacy.changes.save(activeChange(changeId));
  let signalCount = 0;
  const handle = {
    query: async () => {
      throw new Error("query should not be called");
    },
    signal: async () => {
      signalCount += 1;
      throw new Error("signal should not be called");
    },
  };
  const temporal = createMockOwnerFromClient({
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => handle,
      },
    },
  });
  const store = createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "0000ec0100000000000000000000000000000000",
  });
  return { store, signalCount: () => signalCount };
}

async function createDualWriteOutcomeStore(root: string, queryResult: unknown) {
  const legacy = await createDiskStore(root);
  const changeId = "dualWriteOutcome";
  await legacy.changes.save(activeChange(changeId));
  const handle = { query: async () => queryResult };
  const temporal = createMockOwnerFromClient({
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => handle,
      },
    },
  });
  const store = createTemporalStoreBackend({
    legacy,
    temporal,
    projectId: "0000ec0100000000000000000000000000000000",
  });
  return {
    store,
    projectionPath: join(root, ".adv", "changes", changeId, "change.json"),
    changeId,
  };
}

async function createMinimalPoisonedInput(root: string) {
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
  return {
    legacy,
    temporal,
    projectId: "0000ec0100000000000000000000000000000000",
  };
}

describe("createTemporalStoreBackend change projection fallback", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
    clearPoisonedWorkflowCache();
  });

  it("returns a terminal disk projection when workflow history is poisoned", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(archivedChange("poisonedDisk"));

    const store = await createPoisonedStore(tempDir);
    expect(store.hasLoadedDiskProjection?.()).toBe(false);
    const result = await store.changes.get("poisonedDisk");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("poisonedDisk");
    expect(result.data?.status).toBe("archived");
    expect((result.data as Change & { _source?: string })._source).toBe("disk");
    expect(store.hasLoadedDiskProjection?.()).toBe(true);
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

  it("returns disk projection for non-terminal poisoned change without starting a workflow", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activePoisonedFallback"));

    const { store, startCallCount } = await createPoisonedReadStore(tempDir);
    const result = await store.changes.get("activePoisonedFallback");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("activePoisonedFallback");
    // Legacy stored "active" normalizes to "draft" at the disk load path
    // (loadChange); the disk-first read returns it directly.
    expect(result.data?.status).toBe("draft");
    const recovered = result.data as Change & {
      _source?: string;
      _recovery?: { mode?: string; reason?: string };
    };
    expect(recovered._source).toBe("disk");
    expect(recovered._recovery).toBeUndefined();
    // Routine reads never start or signal workflows.
    expect(startCallCount()).toBe(0);
  });

  it("returns recovered gates for non-terminal poisoned change from disk projection", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = activeChange("activePoisonedFallbackGates");
    await legacy.changes.save(change);

    const { store } = await createPoisonedReadStore(tempDir);
    const gates = await store.gates.get("activePoisonedFallbackGates");

    expect(gates).toEqual(change.gates);
  });

  it("returns an active disk-only change on direct read without starting a workflow", async () => {
    tempDir = await createTempDir();
    const active = activeChange("activeDiskOnlyRead");
    const { store, startInputs } = await createDiskOnlyChangeStore(tempDir, [
      active,
    ]);

    const result = await store.changes.get("activeDiskOnlyRead");

    expect(result.success).toBe(true);
    // Legacy stored "active" normalizes to "draft" at the disk load path
    // (loadChange) — the disk-first read returns it directly.
    expect(result.data).toMatchObject({
      id: "activeDiskOnlyRead",
      status: "draft",
    });
    expect(startInputs()).toHaveLength(0);
  });

  it("serves active disk-only changes from disk without resurrecting any workflow", async () => {
    tempDir = await createTempDir();
    const active = activeChange("activeDiskOnlyList");
    const archived = archivedChange("archivedDiskOnlyList");
    const closed = closedChange("closedDiskOnlyList");
    const { store, startInputs, queryCount } = await createDiskOnlyChangeStore(
      tempDir,
      [active, archived, closed],
    );

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
    // bl-HiZJbUuy / disk-authoritative reads: enumeration is side-effect-free.
    // The active change is served from its durable change.json projection
    // without starting or signaling its workflow. Routine reads never mutate
    // Temporal state, so no workflow start occurs for ANY candidate during list.
    expect(startInputs()).toEqual([]);
    // All candidates (active + both terminal) resolve from disk with zero
    // workflow queries, so a poisoned/terminated workflow is never touched
    // during enumeration.
    expect(queryCount("activeDiskOnlyList")).toBe(0);
    expect(queryCount("archivedDiskOnlyList")).toBe(0);
    expect(queryCount("closedDiskOnlyList")).toBe(0);
  });

  it("preserves contract proof fields in a disk-first read", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = {
      ...activeChange("activePoisonedContractSeed"),
      contract: contractProof(),
      acceptanceCriteria: ["Contract proof is preserved."],
      documents: { agreement: "# Agreement" },
    } as Change;
    await legacy.changes.save(change);

    const { store, startArgs } = await createPoisonedPostReadStore(tempDir);
    const result = await store.changes.get("activePoisonedContractSeed");

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        id: "activePoisonedContractSeed",
        contract: change.contract,
        acceptanceCriteria: ["Contract proof is preserved."],
        documents: { agreement: "# Agreement" },
      }),
    );
    expect(startArgs()).toBeUndefined();
  });

  it("returns disk projection for an active disk-only change without querying workflow", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activeMissingFallback"));

    const store = await createMissingWorkflowReadStore(tempDir);

    const result = await store.changes.get("activeMissingFallback");
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("activeMissingFallback");
    expect(result.data?.status).toBe("draft");
    expect(result.source).toBe("disk");
  });

  it("returns disk projection for a generic query failure without querying workflow", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("genericPoisonedVisibility"));

    const { store, startCallCount } =
      await createGenericQueryPoisonedReadStore(tempDir);
    const result = await store.changes.get("genericPoisonedVisibility");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("genericPoisonedVisibility");
    const recovered = result.data as Change & {
      _source?: string;
      _recovery?: { mode?: string; reason?: string };
    };
    expect(recovered._source).toBe("disk");
    expect(recovered._recovery).toBeUndefined();
    expect(startCallCount()).toBe(0);
  });

  it("returns recovered gates for generic query failure when visibility reports nondeterminism", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = activeChange("genericPoisonedVisibilityGates");
    await legacy.changes.save(change);

    const { store } = await createGenericQueryPoisonedReadStore(tempDir);
    const gates = await store.gates.get("genericPoisonedVisibilityGates");

    expect(gates).toEqual(change.gates);
  });

  it("returns disk projection for a generic query failure without poisoned-history evidence", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("genericUnproven"));

    const { store, startCallCount } =
      await createGenericQueryUnprovenStore(tempDir);

    const result = await store.changes.get("genericUnproven");
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("genericUnproven");
    expect(result.source).toBe("disk");
    // query_failed never authorizes a workflow start from a routine read.
    expect(startCallCount()).toBe(0);
  });

  it("returns disk projection for a fallback-class query failure without starting a workflow", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("unregisteredQuery"));

    const { store, startCallCount } =
      await createUnregisteredQueryStore(tempDir);

    const result = await store.changes.get("unregisteredQuery");
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("unregisteredQuery");
    expect(result.source).toBe("disk");
    expect(startCallCount()).toBe(0);
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
                  projectId: "0000ec0100000000000000000000000000000000",
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
      projectId: "0000ec0100000000000000000000000000000000",
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
              projectId: "0000ec0100000000000000000000000000000000",
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
      projectId: "0000ec0100000000000000000000000000000000",
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

  it("lets closed disk projection dominate stale active Temporal state", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    await legacy.changes.save(closedChange("staleClosedChange"));

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => ({
              id: "staleClosedChange",
              changeId: "staleClosedChange",
              title: "Stale active staleClosedChange",
              status: "active",
              createdAt: "2026-05-07T00:00:00.000Z",
              initializedAt: "2026-05-07T00:00:00.000Z",
              projectId: "0000ec0100000000000000000000000000000000",
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
          list: async function* () {
            yield {
              workflowId: "adv/change/project-1/staleClosedChange",
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const getResult = await store.changes.get("staleClosedChange");
    expect(getResult.success).toBe(true);
    expect(getResult.data?.status).toBe("closed");

    const activeList = await store.changes.list();
    expect(activeList.changes.map((change) => change.id)).not.toContain(
      "staleClosedChange",
    );

    const closedList = await store.changes.list({ status: "closed" });
    expect(closedList.changes.map((change) => change.id)).toContain(
      "staleClosedChange",
    );
  });
});

describe("listResolvedChanges circuit breaker", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("trips after 3 unresponsive members and omits the rest", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    const changeIds = ["cbA", "cbB", "cbC", "cbD", "cbE"];
    legacy.changes.get = async () => ({
      success: false as const,
      error: "not found",
      type: "not_found" as const,
    });

    for (const id of changeIds) {
      await mkdir(join(legacy.paths.changes, id), { recursive: true });
    }

    let queryCalls = 0;
    const temporal = createMockOwnerFromClient({
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCalls += 1;
              return new Promise<never>(() => {});
            },
          }),
          start: async () => {
            throw new Error("start should not be called");
          },
        },
      },
    });

    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const start = Date.now();
    const result = await store.changes.list({ validationConcurrency: 1 });
    const elapsed = Date.now() - start;

    // CB trips at 3, so exactly 3 query attempts (one per member up to trip).
    expect(queryCalls).toBe(3);
    expect(result.changes.map((c) => c.id)).toEqual([]);
    expect(elapsed).toBeLessThan(6_000);
  }, 15_000);
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
                  projectId: "0000ec0100000000000000000000000000000000",
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
                projectId: "0000ec0100000000000000000000000000000000",
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    // Warm memo with disk-normalized status (active is normalized to draft).
    const getResult = await store.changes.get("staleMemoChange");
    expect(getResult.success).toBe(true);
    expect(getResult.data?.status).toBe("draft");

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

  it("lets archive bundle projection dominate a still-stale live workflow", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    await legacy.changes.save(activeChange("staleWorkflowChange"));

    const staleWorkflowState = {
      id: "staleWorkflowChange",
      changeId: "staleWorkflowChange",
      title: "Stale workflow change",
      status: "draft",
      createdAt: "2026-05-07T00:00:00.000Z",
      initializedAt: "2026-05-07T00:00:00.000Z",
      projectId: "0000ec0100000000000000000000000000000000",
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
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => staleWorkflowState,
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const initial = await store.changes.get("staleWorkflowChange");
    expect(initial.success).toBe(true);
    expect(initial.data?.status).toBe("draft");

    const archiveBundleDir = join(
      tempDir,
      ".adv",
      "archive",
      "2026-06-15-staleWorkflowChange",
    );
    await mkdir(archiveBundleDir, { recursive: true });
    await writeFile(
      join(archiveBundleDir, "change.json"),
      JSON.stringify(archivedChange("staleWorkflowChange"), null, 2),
    );

    const repairedGet = await store.changes.get("staleWorkflowChange");
    expect(repairedGet.success).toBe(true);
    expect(repairedGet.data?.status).toBe("archived");

    const activeList = await store.changes.list();
    expect(activeList.changes.map((c) => c.id)).not.toContain(
      "staleWorkflowChange",
    );
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
      projectId: "0000ec0100000000000000000000000000000000",
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
              projectId: "0000ec0100000000000000000000000000000000",
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
      projectId: "0000ec0100000000000000000000000000000000",
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

describe("archive-first terminal projection resolution (rq-terminalProjectionTruth01, rq-terminalAggregateRead01)", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("does not query live workflow when archive bundle exists", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("archiveDominatesGet"));

    const archiveDir = join(
      tempDir,
      ".adv",
      "archive",
      "2026-07-07-archiveDominatesGet",
    );
    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      join(archiveDir, "change.json"),
      JSON.stringify(archivedChange("archiveDominatesGet"), null, 2),
    );

    let queryCount = 0;
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCount += 1;
              return {
                id: "archiveDominatesGet",
                changeId: "archiveDominatesGet",
                title: "Stale active archiveDominatesGet",
                status: "active",
                createdAt: "2026-05-07T00:00:00.000Z",
                initializedAt: "2026-05-07T00:00:00.000Z",
                projectId: "0000ec0100000000000000000000000000000000",
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
            },
          }),
          list: async function* () {
            yield { workflowId: "adv/change/project-1/archiveDominatesGet" };
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.get("archiveDominatesGet");
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("archived");
    expect(queryCount).toBe(0);
  });

  it("serves an archived disk projection without querying a poisoned workflow when no archive bundle exists (poison read-resilience)", async () => {
    // Regression guard: an archived change.json with NO archive bundle must be
    // served from the disk terminal projection WITHOUT a live workflow query.
    // Previously loadDiskTerminalProjection only short-circuited `closed`, so an
    // archived-without-bundle change fell through to the live query and hit the
    // poisoned/terminated workflow (TMPRL1100) before the disk-fallback path
    // finally returned the same disk data — the per-candidate cost that
    // accumulated into the enumeration wedge.
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(archivedChange("archivedNoBundlePoisoned"));

    let queryCount = 0;
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCount += 1;
              throw poisonedHistoryError();
            },
          }),
          list: async function* () {
            yield {
              workflowId: "adv/change/project-1/archivedNoBundlePoisoned",
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.get("archivedNoBundlePoisoned");
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("archived");
    // The disk-terminal short-circuit must serve archived without any live
    // query — never touching the poisoned workflow history.
    expect(queryCount).toBe(0);
  });

  it("does not query live workflow for archived candidates in terminal-aware list", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("archiveDominatesList"));

    const archiveDir = join(tempDir, ".adv", "archive", "archiveDominatesList");
    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      join(archiveDir, "change.json"),
      JSON.stringify(archivedChange("archiveDominatesList"), null, 2),
    );

    let queryCount = 0;
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCount += 1;
              return {
                id: "archiveDominatesList",
                changeId: "archiveDominatesList",
                title: "Stale active archiveDominatesList",
                status: "active",
                createdAt: "2026-05-07T00:00:00.000Z",
                initializedAt: "2026-05-07T00:00:00.000Z",
                projectId: "0000ec0100000000000000000000000000000000",
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
            },
          }),
          list: async function* () {
            yield { workflowId: "adv/change/project-1/archiveDominatesList" };
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const list = await store.changes.list({ status: "archived" });
    const found = list.changes.find((c) => c.id === "archiveDominatesList");
    expect(found).toBeDefined();
    expect(found!.status).toBe("archived");
    expect(queryCount).toBe(0);

    const activeList = await store.changes.list();
    expect(activeList.changes.map((c) => c.id)).not.toContain(
      "archiveDominatesList",
    );
  });

  it("deduplicates archive directories by canonical change.json.id", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    const archiveDirA = join(tempDir, ".adv", "archive", "canonicalDedupe");
    await mkdir(archiveDirA, { recursive: true });
    await writeFile(
      join(archiveDirA, "change.json"),
      JSON.stringify(archivedChange("canonicalDedupe"), null, 2),
    );

    const archiveDirB = join(
      tempDir,
      ".adv",
      "archive",
      "2026-07-07-canonicalDedupe",
    );
    await mkdir(archiveDirB, { recursive: true });
    await writeFile(
      join(archiveDirB, "change.json"),
      JSON.stringify(archivedChange("canonicalDedupe"), null, 2),
    );

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              throw new Error("query should not be called");
            },
          }),
          list: async function* () {
            yield { workflowId: "adv/change/project-1/canonicalDedupe" };
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const list = await store.changes.list({ includeArchived: true });
    const found = list.changes.filter((c) => c.id === "canonicalDedupe");
    expect(found).toHaveLength(1);
    expect(found[0].status).toBe("archived");
  });

  it("keeps default active list on the summary fast path", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    const change = activeChange("fastPathActive");
    await legacy.changes.save(change);

    let queryCount = 0;
    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              queryCount += 1;
              return {
                id: "fastPathActive",
                changeId: "fastPathActive",
                title: "Active fastPathActive",
                status: "active",
                createdAt: "2026-05-07T00:00:00.000Z",
                initializedAt: "2026-05-07T00:00:00.000Z",
                projectId: "0000ec0100000000000000000000000000000000",
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.listSummary!({});
    const found = result.changes.find((c) => c.id === "fastPathActive");
    expect(found).toBeDefined();
    // bl-HiZJbUuy: listSummary serves the active change disk-first — canonical
    // "draft" (legacy "active" normalizes at the disk load path) with NO
    // workflow query. Active-only summary needs no terminal reconciliation.
    expect(found!.status).toBe("draft");
    expect(result.hydrationStats?.fromHydration).toBeGreaterThan(0);
    expect(queryCount).toBe(0);
  });
});

describe("terminal aggregate degraded metadata (rq-terminalAggregateRead01)", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("reports active-disk summary degradation on terminal list when summary index is unreadable", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    const archiveDir = join(
      tempDir,
      ".adv",
      "archive",
      "archiveVisibilityFail",
    );
    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      join(archiveDir, "change.json"),
      JSON.stringify(archivedChange("archiveVisibilityFail"), null, 2),
    );

    // Make the summary index unreadable so the terminal read relies on the
    // archive bundle while surfacing a durable-source degradation warning.
    await writeFile(legacy.paths.summariesDir, "not a directory");

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              throw new Error("query should not be called");
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.list({ includeArchived: true });
    const found = result.changes.find((c) => c.id === "archiveVisibilityFail");
    expect(found).toBeDefined();
    expect(found!.status).toBe("archived");

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TERMINAL_SOURCE_DEGRADED",
          source: "active_disk",
          message: expect.stringContaining("summaries"),
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      terminalCandidates: 1,
      terminalFromArchive: 1,
      terminalFromDisk: 0,
      terminalFromWorkflow: 0,
      omitted: 0,
    });
  });

  it("omits unrecoverable terminal candidates and reports structured omission", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    // Active disk directory exists but contains no change.json, so the
    // projection-only list discovers the candidate from durable disk
    // enumeration, cannot load it from disk or archive, and falls back to a
    // workflow query that also fails.
    await mkdir(join(legacy.paths.changes, "corruptArchive"), {
      recursive: true,
    });

    // Archive bundle for the same id is also corrupt.
    const archiveDir = join(tempDir, ".adv", "archive", "corruptArchive");
    await mkdir(archiveDir, { recursive: true });
    await writeFile(join(archiveDir, "change.json"), "not valid json");

    const temporal = {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              throw workflowNotFoundError();
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
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.list({ status: "archived" });
    expect(result.changes.map((c) => c.id)).not.toContain("corruptArchive");

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TERMINAL_CANDIDATE_OMITTED",
          source: "workflow_query",
          omittedCount: 1,
        }),
      ]),
    );
    expect(result.hydrationStats).toMatchObject({
      terminalCandidates: 1,
      terminalFromArchive: 0,
      terminalFromDisk: 0,
      terminalFromWorkflow: 0,
      omitted: 1,
    });
  });

  it("classifies and caches a poisoned-history error from a query failure", async () => {
    tempDir = await createTempDir();
    const input = await createMinimalPoisonedInput(tempDir);
    await classifyTemporalReadFailure(
      input,
      "cacheSeedChange",
      poisonedHistoryError(),
    );
    expect(
      isPoisonedWorkflowForChange(
        "0000ec0100000000000000000000000000000000",
        "cacheSeedChange",
      ),
    ).toBe(true);
  });

  it("returns a disk-only change with _poisoned marker and never queries Temporal", async () => {
    tempDir = await createTempDir();
    const { store, queryCount } = await createHangingQueryStore(
      tempDir,
      "poisonedShow",
    );
    markPoisonedWorkflowForChange(
      "0000ec0100000000000000000000000000000000",
      "poisonedShow",
    );

    const result = await store.changes.get("poisonedShow");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("poisonedShow");
    expect((result.data as Change & { _poisoned?: true })._poisoned).toBe(true);
    expect(queryCount()).toBe(0);
  });

  it("short-circuits post-mutation refresh when the workflow is known poisoned", async () => {
    tempDir = await createTempDir();
    const { store, queryCount } = await createHangingQueryStore(
      tempDir,
      "poisonedRefresh",
    );
    markPoisonedWorkflowForChange(
      "0000ec0100000000000000000000000000000000",
      "poisonedRefresh",
    );

    await store.changes.refresh("poisonedRefresh");

    expect(queryCount()).toBe(0);
  });

  it("skips the signal in changeCommand when the workflow is known poisoned", async () => {
    tempDir = await createTempDir();
    const { store, signalCount } = await createPoisonedSignalStore(
      tempDir,
      "poisonedSignal",
    );
    markPoisonedWorkflowForChange(
      "0000ec0100000000000000000000000000000000",
      "poisonedSignal",
    );

    await expect(
      store.gates.complete("poisonedSignal", "proposal"),
    ).rejects.toThrow(/known poisoned|signal skipped/);

    expect(signalCount()).toBe(0);
  });
});

describe("createTemporalStoreBackend projection-only read enforcement", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("does not write a projection for a non-confirmed readback outcome", async () => {
    tempDir = await createTempDir();
    const { store, projectionPath, changeId } =
      await createDualWriteOutcomeStore(tempDir, {
        kind: "degraded",
        error: new Error("readback unavailable"),
        diagnostic: { class: "transient" },
      });
    const before = await readFile(projectionPath, "utf8");

    await store.changes.refresh(changeId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await readFile(projectionPath, "utf8")).toBe(before);
  });

  it("does not write a projection when confirmed readback has no value", async () => {
    tempDir = await createTempDir();
    const { store, projectionPath, changeId } =
      await createDualWriteOutcomeStore(tempDir, {
        kind: "complete",
        value: undefined,
      });
    const before = await readFile(projectionPath, "utf8");

    await store.changes.refresh(changeId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await readFile(projectionPath, "utf8")).toBe(before);
  });

  it("guards the dual-write projection behind confirmed readback", async () => {
    const source = await readFile(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    const body = source.match(
      /const dualWriteAfterMutation = async \([\s\S]*?\n\s{2}};\n\n\s{2}\/\*\*/,
    )?.[0];
    expect(body).toBeDefined();

    const confirmedGuard = body!.indexOf('if (typed.outcome !== "confirmed")');
    const valueGuard = body!.indexOf("if (!readbackValue)");
    const projectionWrite = body!.indexOf("voidPersist(changeId, state)");

    expect(confirmedGuard).toBeGreaterThanOrEqual(0);
    expect(valueGuard).toBeGreaterThan(confirmedGuard);
    expect(projectionWrite).toBeGreaterThan(valueGuard);
  });

  it("getTemporalChange source never starts, signals, reseeds, or writes recovery state", async () => {
    const source = await readFile(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    const body = source.match(
      /const getTemporalChange = async \([\s\S]*?\n\s{2}};\n\n\s{2}const loadDiskTerminalProjection = async \(/,
    )?.[0];
    expect(body).toBeDefined();
    const dangerous = [
      "reseedChangeFromDisk",
      "fireWorktreeAutoManagedMigrationIfNeeded",
      "worktreeAutoManagedSignal",
      "readAmbiguityLedger",
      "writeAmbiguityLedger",
      "ambiguity-ledger",
      "ambiguityLedger",
      "ensureChangeWorkflowStarted",
      "startChangeWorkflow",
      "signalChangeWorkflowGuarded",
      "fireSignal",
      "owner.signal",
      "owner.start",
      "legacy.changes.save",
      "persistStateToDisk",
      "persistAndRefreshDurable",
    ];
    for (const pattern of dangerous) {
      expect(body).not.toMatch(new RegExp(`\\b${pattern}\\b`));
    }
  });
});
