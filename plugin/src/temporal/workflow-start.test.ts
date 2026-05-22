import { describe, expect, test, vi } from "vitest";
import {
  ensureChangeWorkflowStarted,
  reImportChangeState,
} from "./workflow-start";
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
