import { describe, expect, test, vi } from "vitest";
import {
  ensureChangeWorkflowStarted,
  ensureEpicWorkflowStarted,
  reImportChangeState,
  IncompatibleActiveSessionQueuesError,
  StartWorkflowOutcomeError,
} from "./workflow-start";
import {
  createMockOwnerFromClient,
  createMockOwner,
} from "./__tests__/mock-owner";
import {
  buildProjectTaskQueue,
  buildSessionTaskQueue,
  buildChangeWorkflowId,
} from "./client";
import {
  ChangeCreationHashConflictError,
  CREATION_HASH_CONFLICT_CODE,
} from "../storage/store-temporal/creation-hash";
import type { Change } from "../types";

const PROJECT_ID = "0".repeat(40);
const PROJ_Q = buildProjectTaskQueue(PROJECT_ID);

function ownerFrom(client: unknown) {
  return createMockOwnerFromClient(client);
}

const contract: NonNullable<Change["contract"]> = {
  version: 1,
  rigor: "standard",
  source: { artifact: "agreement", approvedAt: "2026-05-21T00:00:00.000Z" },
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

describe("ensureChangeWorkflowStarted", () => {
  test("includes AdvBacklogIssueNumber in initial search attributes when origin issue is seeded (rq-backlogCoord01)", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await ensureChangeWorkflowStarted(ownerFrom(client), {
      projectId: PROJECT_ID,
      changeId: "backlogFeature51",
      title: "Backlog feature 51",
      initializedAt: "2026-05-11T00:00:00.000Z",
      seedState: {
        origin: { kind: "roadmap", issue_number: 51 },
      },
    });

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        searchAttributes: expect.objectContaining({
          AdvBacklogIssueNumber: ["51"],
        }),
      }),
    );
  });

  test("includes AdvEpicId in initial search attributes when epic_membership is seeded (rq-epicTemporalConstraints01)", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await ensureChangeWorkflowStarted(ownerFrom(client), {
      projectId: PROJECT_ID,
      changeId: "epicChild",
      title: "Epic child",
      initializedAt: "2026-05-11T00:00:00.000Z",
      seedState: {
        epic_membership: {
          epic_id: "addAuthEpic",
          entry_id: "ent-1",
          order: 0,
          title: "Add auth",
          linked_at: "2026-05-11T00:00:00.000Z",
        },
      },
    });

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        searchAttributes: expect.objectContaining({
          AdvEpicId: ["addAuthEpic"],
        }),
      }),
    );
  });

  test("routes to session task queue when sessionId is present (rq-isolSessionTaskQueue01, KD-10)", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await ensureChangeWorkflowStarted(ownerFrom(client), {
      projectId: PROJECT_ID,
      changeId: "sessionRouted",
      title: "Session routed",
      initializedAt: "2026-07-21T00:00:00.000Z",
      sessionId: "sess_RouteTest",
    });

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        taskQueue: buildSessionTaskQueue(PROJECT_ID, "sess_RouteTest"),
      }),
    );
  });

  test("falls back to project task queue when sessionId is absent (backward compat, KD-10)", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await ensureChangeWorkflowStarted(ownerFrom(client), {
      projectId: PROJECT_ID,
      changeId: "legacyRoute",
      title: "Legacy route",
      initializedAt: "2026-07-21T00:00:00Z",
      // sessionId intentionally omitted
    });

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        taskQueue: PROJ_Q,
      }),
    );
  });

  test("KD-2 explicit singleton routes to project queue even when sessionId is present", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const list = vi.fn().mockReturnValue([]);
    const client = { workflow: { start, getHandle: vi.fn(), list } };

    await ensureChangeWorkflowStarted(
      ownerFrom(client),
      {
        projectId: PROJECT_ID,
        changeId: "singletonRoute",
        title: "Singleton route",
        initializedAt: "2026-07-21T00:00:00Z",
        sessionId: "sess_SingletonTest",
      },
      { workflowQueueMode: "project" },
    );

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        taskQueue: PROJ_Q,
      }),
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("AdvAffectedProjects"),
      }),
    );
  });

  test("KD-2 default session mode routes to session queue when sessionId is present", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await ensureChangeWorkflowStarted(
      ownerFrom(client),
      {
        projectId: PROJECT_ID,
        changeId: "sessionMode",
        title: "Session mode",
        initializedAt: "2026-07-21T00:00:00Z",
        sessionId: "sess_DefaultSession",
      },
      { workflowQueueMode: "session" },
    );

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        taskQueue: buildSessionTaskQueue(PROJECT_ID, "sess_DefaultSession"),
      }),
    );
  });

  test("KD-2 explicit singleton refuses when active session-pinned workflows exist", async () => {
    const start = vi.fn().mockResolvedValue({ query: vi.fn() });
    const list = vi.fn().mockReturnValue([
      {
        workflowId: buildChangeWorkflowId(PROJECT_ID, "existingSessionPinned"),
        taskQueue: buildSessionTaskQueue(PROJECT_ID, "sess_existing"),
        status: { name: "RUNNING" },
      },
    ]);
    const client = { workflow: { start, getHandle: vi.fn(), list } };

    await expect(
      ensureChangeWorkflowStarted(
        ownerFrom(client),
        {
          projectId: PROJECT_ID,
          changeId: "singletonBlocked",
          title: "Singleton blocked",
          initializedAt: "2026-07-21T00:00:00Z",
          sessionId: "sess_singletonBlocked",
        },
        { workflowQueueMode: "project" },
      ),
    ).rejects.toBeInstanceOf(IncompatibleActiveSessionQueuesError);

    expect(start).not.toHaveBeenCalled();
  });

  test("KD-2 explicit singleton skips safe-refusal when client lacks workflow.list", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await ensureChangeWorkflowStarted(
      ownerFrom(client),
      {
        projectId: PROJECT_ID,
        changeId: "singletonNoList",
        title: "Singleton no list",
        initializedAt: "2026-07-21T00:00:00Z",
        sessionId: "sess_singletonNoList",
      },
      { workflowQueueMode: "project" },
    );

    expect(start).toHaveBeenCalled();
  });

  describe("typed start outcome errors", () => {
    test("timeout_unavailable outcome throws StartWorkflowOutcomeError with kind timeout_unavailable", async () => {
      const owner = createMockOwner({
        startChangeWorkflow: vi.fn(async () => ({
          kind: "timeout_unavailable",
          error: new Error("deadline exceeded"),
          diagnostic: { class: "deadline", reachable: true },
        })),
      });

      await expect(
        ensureChangeWorkflowStarted(owner, {
          projectId: PROJECT_ID,
          changeId: "timeoutChange",
          title: "Timeout change",
          initializedAt: "2026-07-21T00:00:00Z",
        }),
      ).rejects.toBeInstanceOf(StartWorkflowOutcomeError);
    });

    test("outcome_unknown outcome throws StartWorkflowOutcomeError with kind outcome_unknown", async () => {
      const owner = createMockOwner({
        startChangeWorkflow: vi.fn(async () => ({
          kind: "outcome_unknown",
          error: new Error("readback ambiguous"),
          diagnostic: { class: "unknown", reachable: true },
        })),
      });

      await expect(
        ensureChangeWorkflowStarted(owner, {
          projectId: PROJECT_ID,
          changeId: "unknownChange",
          title: "Unknown change",
          initializedAt: "2026-07-21T00:00:00Z",
        }),
      ).rejects.toBeInstanceOf(StartWorkflowOutcomeError);
    });

    test("ensureEpicWorkflowStarted throws StartWorkflowOutcomeError on timeout_unavailable", async () => {
      const owner = createMockOwner({
        startEpicWorkflow: vi.fn(async () => ({
          kind: "timeout_unavailable",
          error: new Error("epic start deadline"),
          diagnostic: { class: "deadline", reachable: true },
        })),
      });

      await expect(
        ensureEpicWorkflowStarted(owner, {
          projectId: PROJECT_ID,
          epicId: "timeoutEpic",
          title: "Timeout epic",
          narrative: "",
          initializedAt: "2026-07-21T00:00:00Z",
        }),
      ).rejects.toBeInstanceOf(StartWorkflowOutcomeError);
    });
  });

  describe("creation_request_hash idempotency on already-started path (rq-creationRequestHash01, tk-74c358188ffb)", () => {
    function buildClient(existingState: { creation_request_hash?: string }) {
      const existingHandle = {
        query: vi.fn().mockResolvedValue(existingState),
      };
      // Start throws "already started" → ensureChangeWorkflowStarted must
      // fall through to getHandle().query(getStateQuery).
      const start = vi.fn().mockImplementation(() => {
        const err = new Error(
          "Workflow execution already started as 'changeId', runId 'run-1'",
        );
        err.name = "WorkflowExecutionAlreadyStarted";
        throw err;
      });
      const getHandle = vi.fn().mockReturnValue(existingHandle);
      return {
        client: { workflow: { start, getHandle } },
        existingHandle,
        start,
        getHandle,
      };
    }

    test("idempotent match: same hash returns the existing handle, does not start a new workflow", async () => {
      const hash =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const { client, existingHandle, start, getHandle } = buildClient({
        creation_request_hash: hash,
      });

      const returned = await ensureChangeWorkflowStarted(ownerFrom(client), {
        projectId: PROJECT_ID,
        changeId: "retryAfterTimeout",
        title: "Retry after timeout",
        initializedAt: "2026-07-22T00:00:00.000Z",
        creationRequestHash: hash,
      });

      expect(getHandle).toHaveBeenCalledTimes(1);
      expect(existingHandle.query).toHaveBeenCalledTimes(1);
      expect(returned).toMatchObject(existingHandle);
      // The original start attempt threw already-started; no second start.
      expect(start).toHaveBeenCalledTimes(1);
    });

    test("hash conflict: differing hash throws ChangeCreationHashConflictError before any state mutation", async () => {
      const existingHash =
        "1111111111111111111111111111111111111111111111111111111111111111";
      const computedHash =
        "2222222222222222222222222222222222222222222222222222222222222222";
      const { client } = buildClient({
        creation_request_hash: existingHash,
      });

      await expect(
        ensureChangeWorkflowStarted(ownerFrom(client), {
          projectId: PROJECT_ID,
          changeId: "sameSummaryDiffCapability",
          title: "Same summary diff capability",
          initializedAt: "2026-07-22T00:00:00.000Z",
          creationRequestHash: computedHash,
        }),
      ).rejects.toMatchObject({
        code: CREATION_HASH_CONFLICT_CODE,
        existingHash,
        computedHash,
        changeId: "sameSummaryDiffCapability",
      });

      // Also satisfies instanceof for callers that key off the typed Error.
      await expect(
        ensureChangeWorkflowStarted(ownerFrom(client), {
          projectId: PROJECT_ID,
          changeId: "sameSummaryDiffCapability",
          title: "Same summary diff capability",
          initializedAt: "2026-07-22T00:00:00.000Z",
          creationRequestHash: computedHash,
        }),
      ).rejects.toBeInstanceOf(ChangeCreationHashConflictError);
    });

    test("backward compat: existing workflow with no hash is treated as first-creation (no conflict)", async () => {
      // Legacy workflows predating this field have undefined creation_request_hash.
      // Idempotency check should not block — treat as first_creation.
      const computedHash =
        "3333333333333333333333333333333333333333333333333333333333333333";
      const { client, existingHandle } = buildClient({
        // creation_request_hash omitted
      });

      const returned = await ensureChangeWorkflowStarted(ownerFrom(client), {
        projectId: PROJECT_ID,
        changeId: "legacyWorkflowRetry",
        title: "Legacy workflow retry",
        initializedAt: "2026-07-22T00:00:00.000Z",
        creationRequestHash: computedHash,
      });

      expect(returned).toMatchObject(existingHandle);
    });

    test("omits hash check when caller does not supply creationRequestHash (backward compat)", async () => {
      const { client, existingHandle } = buildClient({
        creation_request_hash: "some-legacy-hash",
      });

      const returned = await ensureChangeWorkflowStarted(ownerFrom(client), {
        projectId: PROJECT_ID,
        changeId: "callerDidNotCompute",
        title: "Caller did not compute",
        initializedAt: "2026-07-22T00:00:00.000Z",
        // creationRequestHash intentionally omitted
      });

      // Pre-existing behavior preserved: silent reuse, no state query.
      expect(returned).toMatchObject(existingHandle);
      expect(existingHandle.query).not.toHaveBeenCalled();
    });

    test("query failure surfaces (does not silently mask as idempotent)", async () => {
      const hash =
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      const existingHandle = {
        query: vi.fn().mockRejectedValue(new Error("query timeout")),
      };
      const start = vi.fn().mockImplementation(() => {
        const err = new Error("Workflow execution already started");
        err.name = "WorkflowExecutionAlreadyStarted";
        throw err;
      });
      const getHandle = vi.fn().mockReturnValue(existingHandle);
      const client = { workflow: { start, getHandle } };

      // A query failure must not be swallowed as "idempotent match".
      // Surface so the caller / P1.4 rollback can react.
      await expect(
        ensureChangeWorkflowStarted(ownerFrom(client), {
          projectId: PROJECT_ID,
          changeId: "queryFailureSurfaces",
          title: "Query failure surfaces",
          initializedAt: "2026-07-22T00:00:00.000Z",
          creationRequestHash: hash,
        }),
      ).rejects.toThrow(/query timeout/);
    });
  });
});

describe("reImportChangeState", () => {
  test("preserves origin when reseeding a change workflow (rq-backlogCoord01)", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await reImportChangeState(ownerFrom(client), {
      projectId: PROJECT_ID,
      change: {
        id: "backlogFeature51",
        title: "Backlog feature 51",
        status: "draft",
        created_at: "2026-05-11T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {},
        reentry_history: [],
        origin: { kind: "roadmap", issue_number: 51 },
      } as never,
    });

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        args: [
          expect.objectContaining({
            seedState: expect.objectContaining({
              origin: { kind: "roadmap", issue_number: 51 },
            }),
          }),
        ],
      }),
    );
  });

  test("preserves epic_membership when reseeding a change workflow (rq-epicTemporalConstraints01)", async () => {
    const epicMembership = {
      epic_id: "addAuthEpic",
      entry_id: "ent-1",
      order: 0,
      title: "Add auth",
      linked_at: "2026-05-11T00:00:00.000Z",
    };
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await reImportChangeState(ownerFrom(client), {
      projectId: PROJECT_ID,
      change: {
        id: "epicChild",
        title: "Epic child",
        status: "draft",
        created_at: "2026-05-11T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {},
        reentry_history: [],
        epic_membership: epicMembership,
      } as never,
    });

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        args: [
          expect.objectContaining({
            seedState: expect.objectContaining({
              epic_membership: epicMembership,
            }),
          }),
        ],
      }),
    );
  });

  test("preserves contract proof fields when reseeding a change workflow", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await reImportChangeState(ownerFrom(client), {
      projectId: PROJECT_ID,
      change: {
        id: "contractRecovery",
        title: "Contract recovery",
        status: "draft",
        created_at: "2026-05-11T00:00:00.000Z",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: {},
        reentry_history: [],
        contract,
        acceptanceCriteria: ["Contract proof is preserved."],
        documents: { agreement: "# Agreement" },
      } as never,
    });

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        args: [
          expect.objectContaining({
            seedState: expect.objectContaining({
              contract,
              acceptanceCriteria: ["Contract proof is preserved."],
              documents: { agreement: "# Agreement" },
            }),
          }),
        ],
      }),
    );
  });
});
