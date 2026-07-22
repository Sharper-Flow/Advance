import { describe, expect, test, vi } from "vitest";
import {
  ensureChangeWorkflowStarted,
  reImportChangeState,
} from "./workflow-start";
import {
  ChangeCreationHashConflictError,
  CREATION_HASH_CONFLICT_CODE,
} from "../storage/store-temporal/creation-hash";
import type { Change } from "../types";

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

    await ensureChangeWorkflowStarted(client, {
      projectId: "pid-abc",
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

    await ensureChangeWorkflowStarted(client, {
      projectId: "pid-abc",
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

    await ensureChangeWorkflowStarted(client, {
      projectId: "pid-abc",
      changeId: "sessionRouted",
      title: "Session routed",
      initializedAt: "2026-07-21T00:00:00.000Z",
      sessionId: "sess_RouteTest",
    });

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        taskQueue: "advance-pid-abc-sess_RouteTest",
      }),
    );
  });

  test("falls back to project task queue when sessionId is absent (backward compat, KD-10)", async () => {
    const handle = { query: vi.fn() };
    const start = vi.fn().mockResolvedValue(handle);
    const client = { workflow: { start, getHandle: vi.fn() } };

    await ensureChangeWorkflowStarted(client, {
      projectId: "pid-abc",
      changeId: "legacyRoute",
      title: "Legacy route",
      initializedAt: "2026-07-21T00:00:00Z",
      // sessionId intentionally omitted
    });

    expect(start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        taskQueue: "advance-pid-abc",
      }),
    );
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

      const returned = await ensureChangeWorkflowStarted(client, {
        projectId: "pid-abc",
        changeId: "retryAfterTimeout",
        title: "Retry after timeout",
        initializedAt: "2026-07-22T00:00:00.000Z",
        creationRequestHash: hash,
      });

      expect(getHandle).toHaveBeenCalledTimes(1);
      expect(existingHandle.query).toHaveBeenCalledTimes(1);
      expect(returned).toBe(existingHandle);
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
        ensureChangeWorkflowStarted(client, {
          projectId: "pid-abc",
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
        ensureChangeWorkflowStarted(client, {
          projectId: "pid-abc",
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

      const returned = await ensureChangeWorkflowStarted(client, {
        projectId: "pid-abc",
        changeId: "legacyWorkflowRetry",
        title: "Legacy workflow retry",
        initializedAt: "2026-07-22T00:00:00.000Z",
        creationRequestHash: computedHash,
      });

      expect(returned).toBe(existingHandle);
    });

    test("omits hash check when caller does not supply creationRequestHash (backward compat)", async () => {
      const { client, existingHandle } = buildClient({
        creation_request_hash: "some-legacy-hash",
      });

      const returned = await ensureChangeWorkflowStarted(client, {
        projectId: "pid-abc",
        changeId: "callerDidNotCompute",
        title: "Caller did not compute",
        initializedAt: "2026-07-22T00:00:00.000Z",
        // creationRequestHash intentionally omitted
      });

      // Pre-existing behavior preserved: silent reuse, no state query.
      expect(returned).toBe(existingHandle);
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
        ensureChangeWorkflowStarted(client, {
          projectId: "pid-abc",
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

    await reImportChangeState(client, {
      projectId: "pid-abc",
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

    await reImportChangeState(client, {
      projectId: "pid-abc",
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

    await reImportChangeState(client, {
      projectId: "pid-abc",
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
