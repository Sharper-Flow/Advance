/**
 * change-state worktree dematerialize handler (migrateExistingAdvWorktrees AC4–AC7).
 *
 * Verifies the durable registry update backing `worktreeDematerializedSignal`:
 * - nonterminal status "unmaterialized"
 * - path and materialized cleared
 * - branch, setupReady, and ownership preserved
 * - durable receipt retained in `state.worktree_detach_receipts`
 * - idempotent per request identity
 */
import { describe, expect, it } from "vitest";

import {
  applyWorktreeDematerializedToState,
  createChangeWorkflowState,
} from "./change-state";
import { WorktreeDematerializedSignalPayloadSchema } from "../types";

const ISO = "2026-05-21T03:40:00.000Z";
const LATER = "2026-05-30T00:00:00.000Z";

function freshState() {
  return createChangeWorkflowState({
    changeId: "tk-test",
    title: "Test",
    createdAt: ISO,
  });
}

function materializedRecord(branch: string) {
  return {
    branch,
    path: "/tmp/wt/tk-test",
    changeId: "tk-test",
    status: "created" as const,
    materialized: true as const,
    createdAt: ISO,
    lastSeenAt: ISO,
    baseRef: "trunk",
    headSha: "abc1234",
    source: "tool" as const,
    sourceVersion: 1,
    setupReady: true as const,
  };
}

function validPayload() {
  return {
    branch: "change/tk-test",
    requestId: "req-1",
    branches: ["change/tk-test"],
    cutoffMs: 10 * 24 * 60 * 60 * 1000,
    preflightFacts: [
      {
        branch: "change/tk-test",
        path: "/tmp/wt/tk-test",
        eligible: true,
        branchActivityAt: ISO,
        advActivityAt: ISO,
      },
    ],
    outcome: "detached" as const,
    approvalEvidence: "user approved detach",
    dematerializedAt: LATER,
  };
}

describe("applyWorktreeDematerializedToState", () => {
  it("clears path and materialized while preserving branch, setupReady, and ownership", () => {
    const state = freshState();
    state.worktrees = {
      "change/tk-test": materializedRecord("change/tk-test"),
    };

    applyWorktreeDematerializedToState(state, validPayload());

    const record = state.worktrees?.["change/tk-test"];
    expect(record).toMatchObject({
      branch: "change/tk-test",
      changeId: "tk-test",
      status: "unmaterialized",
      materialized: false,
      setupReady: true,
      baseRef: "trunk",
      headSha: "abc1234",
      source: "tool",
      sourceVersion: 1,
    });
    expect(record?.path).toBeUndefined();
    expect(record?.status).not.toBe("deleted");
    expect(record?.status).not.toBe("setup_failed");
    expect(state.lastSignalAt).toBe(LATER);
    expect(state.worktree_detach_receipts).toHaveLength(1);
    expect(state.worktree_detach_receipts?.[0]).toMatchObject({
      requestId: "req-1",
      branch: "change/tk-test",
      outcome: "detached",
      approvalEvidence: "user approved detach",
    });
  });

  it("clears any pending delete marker instead of queuing a terminal delete", () => {
    const state = freshState();
    state.worktrees = {
      "change/tk-test": {
        ...materializedRecord("change/tk-test"),
        pendingDelete: {
          branch: "change/tk-test",
          path: "/tmp/wt/tk-test",
          reason: "stale",
          recordedAt: ISO,
          attempts: 0,
        },
      },
    };

    applyWorktreeDematerializedToState(state, validPayload());

    const record = state.worktrees?.["change/tk-test"];
    expect(record?.status).toBe("unmaterialized");
    expect(record?.pendingDelete).toBeUndefined();
    expect(record?.materialized).toBe(false);
  });

  it("is idempotent for the same request identity", () => {
    const state = freshState();
    state.worktrees = {
      "change/tk-test": materializedRecord("change/tk-test"),
    };
    const payload = validPayload();

    applyWorktreeDematerializedToState(state, payload);
    const afterFirst = structuredClone(state);
    applyWorktreeDematerializedToState(state, payload);

    expect(state).toEqual(afterFirst);
  });

  it("records a refused outcome without mutating the materialized record", () => {
    const state = freshState();
    state.worktrees = {
      "change/tk-test": materializedRecord("change/tk-test"),
    };

    applyWorktreeDematerializedToState(state, {
      ...validPayload(),
      outcome: "refused" as const,
      reason: "dirty",
    });

    expect(state.worktrees?.["change/tk-test"].status).toBe("created");
    expect(state.worktree_detach_receipts).toHaveLength(1);
    expect(state.worktree_detach_receipts?.[0].outcome).toBe("refused");
    expect(state.worktree_detach_receipts?.[0].reason).toBe("dirty");
  });

  it("records an idempotent-already-detached outcome for an unmaterialized branch", () => {
    const state = freshState();
    state.worktrees = {
      "change/tk-test": {
        ...materializedRecord("change/tk-test"),
        status: "unmaterialized" as const,
        materialized: false as const,
        path: undefined,
      },
    };

    applyWorktreeDematerializedToState(state, {
      ...validPayload(),
      outcome: "idempotent_already_detached" as const,
    });

    expect(state.worktrees?.["change/tk-test"].status).toBe("unmaterialized");
    expect(state.worktree_detach_receipts).toHaveLength(1);
  });

  describe("WorktreeDematerializedSignalPayloadSchema", () => {
    it("accepts a valid detached payload", () => {
      const result =
        WorktreeDematerializedSignalPayloadSchema.safeParse(validPayload());
      expect(result.success).toBe(true);
    });

    it("rejects missing approval evidence", () => {
      const { approvalEvidence: _, ...rest } = validPayload();
      const result = WorktreeDematerializedSignalPayloadSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("rejects a non-positive cutoff", () => {
      const result = WorktreeDematerializedSignalPayloadSchema.safeParse({
        ...validPayload(),
        cutoffMs: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects an invalid outcome", () => {
      const result = WorktreeDematerializedSignalPayloadSchema.safeParse({
        ...validPayload(),
        outcome: "deleted",
      });
      expect(result.success).toBe(false);
    });
  });
});
