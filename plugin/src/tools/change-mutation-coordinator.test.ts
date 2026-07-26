/**
 * Unit tests for the typed change mutation/recovery coordinator.
 *
 * TDD coverage:
 *   - healthy Temporal signal + receipt + refresh + postcondition path
 *     performs zero disk recovery writes
 *   - SDK type/name-first error normalization, plus legacy message fixtures
 *   - recovery path routes through commitChangeProjection and only returns
 *     recovered_verified after a visible postcondition
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  coordinateChangeMutation,
  resolveChangeAuthority,
  normalizeWorkflowFailure,
  type MutationIntent,
  type WorkflowHandleLike,
  type ChangeAuthority,
} from "./change-mutation-coordinator";
import { commitChangeProjection } from "../storage/change-projection-transaction";
import { ChangeSchema } from "../types";
import type { Change } from "../types";
import {
  createTempDir,
  cleanupTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../temporal/contracts";

vi.mock("../storage/change-projection-transaction", async (importOriginal) => {
  const mod =
    (await importOriginal()) as typeof import("../storage/change-projection-transaction");
  return {
    ...mod,
    commitChangeProjection: vi.fn(mod.commitChangeProjection),
  };
});

const mockedCommitChangeProjection = vi.mocked(commitChangeProjection);

function makeChange(overrides: Partial<Change> = {}): Change {
  return ChangeSchema.parse({
    ...SAMPLE_CHANGE,
    id: "coordinator-change",
    status: "draft",
    ...overrides,
  });
}

async function seedChange(changesDir: string, change: Change): Promise<void> {
  const changeDir = join(changesDir, change.id);
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    join(changeDir, "change.json"),
    JSON.stringify(change, null, 2),
    "utf-8",
  );
}

function makeIntent(
  overrides: Partial<MutationIntent<{ value: string }>> = {},
): MutationIntent<{ value: string }> {
  return {
    changeId: "coordinator-change",
    mutationKind: "test:set-value",
    sendSignal: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue({ value: "refreshed" }),
    verifyTemporal: vi.fn().mockReturnValue(true),
    mutateLatestProjection: vi.fn((latest) => ({
      ...latest,
      title: "recovered",
    })),
    verifyProjection: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

function makeHandle(
  overrides: Partial<WorkflowHandleLike> = {},
): WorkflowHandleLike {
  return {
    describe: vi.fn().mockResolvedValue({ status: { name: "RUNNING" } }),
    signal: vi.fn().mockResolvedValue(undefined),
    query: vi
      .fn()
      .mockImplementation((queryName: string, receiptId?: string) => {
        if (queryName === CHANGE_WORKFLOW_QUERY_NAMES.getMutationReceipt) {
          return Promise.resolve(receiptId ? { id: receiptId } : undefined);
        }
        return Promise.resolve(undefined);
      }),
    ...overrides,
  };
}

describe("normalizeWorkflowFailure", () => {
  it("classifies WorkflowExecutionAlreadyCompleted by SDK name as workflow_completed", () => {
    const err = new Error("already done");
    err.name = "WorkflowExecutionAlreadyCompleted";
    const failure = normalizeWorkflowFailure(err);
    expect(failure.kind).toBe("workflow_completed");
    expect(failure.evidence).toContain("WorkflowExecutionAlreadyCompleted");
  });

  it("classifies WorkflowNotFoundError by SDK name as workflow_missing", () => {
    const err = new Error("not found");
    err.name = "WorkflowNotFoundError";
    const failure = normalizeWorkflowFailure(err);
    expect(failure.kind).toBe("workflow_missing");
  });

  it("classifies ADV wrapper 'workflow not found for ID' message as workflow_missing", () => {
    const failure = normalizeWorkflowFailure(
      new Error("workflow not found for ID coordinator-change"),
    );
    expect(failure.kind).toBe("workflow_missing");
    expect(failure.evidence).toContain("workflow not found for ID");
  });

  it("classifies TMPRL1100 as poisoned_history", () => {
    const failure = normalizeWorkflowFailure(
      new Error("Nondeterminism error: TMPRL1100"),
    );
    expect(failure.kind).toBe("poisoned_history");
  });

  it("classifies Temporal query timeout as workflow_unresponsive", () => {
    const err = new Error("Temporal operation exceeded 5000ms timeout");
    err.name = "TemporalQueryTimeout";
    const failure = normalizeWorkflowFailure(err);
    expect(failure.kind).toBe("workflow_unresponsive");
  });

  it("classifies an unclassified error as query_failed or unknown", () => {
    const failure = normalizeWorkflowFailure(new Error("something unexpected"));
    expect(["query_failed", "unknown"]).toContain(failure.kind);
  });
});

describe("resolveChangeAuthority", () => {
  it("returns temporal_live for a healthy handle with no poisoned describe", async () => {
    const handle = makeHandle();
    const authority = await resolveChangeAuthority({
      changeId: "coordinator-change",
      handle,
    });
    expect(authority.kind).toBe("temporal_live");
  });

  it("returns workflow_poisoned when describe carries poisoned evidence", async () => {
    const handle = makeHandle({
      describe: vi
        .fn()
        .mockResolvedValue({ taskFailed: { cause: "TMPRL1100" } }),
    });
    const authority = await resolveChangeAuthority({
      changeId: "coordinator-change",
      handle,
    });
    expect(authority.kind).toBe("workflow_poisoned");
    if (authority.kind !== "workflow_poisoned") return;
    expect(authority.evidence.reason).toBe("poisoned_history");
  });

  it("returns workflow_missing when describe throws WorkflowNotFoundError", async () => {
    const err = new Error("not found");
    err.name = "WorkflowNotFoundError";
    const handle = makeHandle({ describe: vi.fn().mockRejectedValue(err) });
    const authority = await resolveChangeAuthority({
      changeId: "coordinator-change",
      handle,
    });
    expect(authority.kind).toBe("workflow_missing");
  });

  it.each([
    {
      label: "completed",
      name: "WorkflowExecutionAlreadyCompleted",
      expected: "workflow_completed" as const,
    },
    {
      label: "missing",
      name: "WorkflowNotFoundError",
      expected: "workflow_missing" as const,
    },
    {
      label: "TMPRL1100",
      name: "Error",
      message: "TMPRL1100",
      expected: "workflow_poisoned" as const,
    },
    {
      label: "timeout",
      name: "TemporalQueryTimeout",
      message: "timeout",
      expected: "operator_required" as const,
    },
    {
      label: "query failure",
      name: "Error",
      message: "query rejected",
      expected: "operator_required" as const,
    },
    {
      label: "unknown",
      name: "Error",
      message: "random boom",
      expected: "operator_required" as const,
    },
    {
      label: "workflow not found for ID",
      name: "Error",
      message: "workflow not found for ID x",
      expected: "workflow_missing" as const,
    },
  ])(
    "maps signal error ($label) to $expected",
    async ({ name, message, expected }) => {
      const err = new Error(message ?? "");
      err.name = name;
      const authority = await resolveChangeAuthority({ signalError: err });
      expect(authority.kind).toBe(expected);
    },
  );
});

describe("coordinateChangeMutation", () => {
  let tempDir: string;
  let changesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("mutation-coord-");
    changesDir = join(tempDir, ".adv", "changes");
    mockedCommitChangeProjection.mockClear();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("healthy path: Temporal signal + receipt + refresh + postcondition, no disk write", async () => {
    const handle = makeHandle();
    const intent = makeIntent();

    const result = await coordinateChangeMutation({
      authority: {
        kind: "temporal_live",
        handle,
        changeId: "coordinator-change",
      },
      intent,
    });

    expect(result.kind).toBe("applied_temporal");
    if (result.kind !== "applied_temporal") return;
    expect(result.value).toEqual({ value: "refreshed" });
    expect(result.mutationReceiptId).toMatch(/^mrec_/);

    expect(intent.sendSignal).toHaveBeenCalledWith(
      handle,
      expect.stringMatching(/^mrec_/),
    );
    expect(intent.refresh).toHaveBeenCalledWith(handle);
    expect(mockedCommitChangeProjection).not.toHaveBeenCalled();
  });

  it("healthy path with dual-write commits projection with temporal authority", async () => {
    const handle = makeHandle();
    const intent = makeIntent();

    await seedChange(changesDir, makeChange());

    mockedCommitChangeProjection.mockImplementationOnce(async () => ({
      kind: "committed",
      value: makeChange({ title: "recovered", projection_revision: 1 }),
      readback: makeChange({ title: "recovered", projection_revision: 1 }),
      revision: 1,
      audit: {
        mutation_kind: "test:set-value",
        authority_kind: "temporal",
        mutation_receipt_id: "mrec-dual",
        prior_revision: 0,
        new_revision: 1,
        committed_at: "2026-07-25T00:00:00.000Z",
      },
    }));

    const result = await coordinateChangeMutation({
      authority: {
        kind: "temporal_live",
        handle,
        changeId: "coordinator-change",
      },
      intent,
      changesDir,
    });

    expect(result.kind).toBe("applied_temporal");
    expect(mockedCommitChangeProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        changesDir,
        changeId: "coordinator-change",
        authority: {
          kind: "temporal",
          mutationReceiptId: expect.stringMatching(/^mrec_/),
        },
        mutationKind: "test:set-value",
      }),
    );
  });

  it("returns operator_required when Temporal postcondition fails", async () => {
    const handle = makeHandle();
    const intent = makeIntent({
      verifyTemporal: () => ({ ok: false, error: "value not updated" }),
    });

    const result = await coordinateChangeMutation({
      authority: {
        kind: "temporal_live",
        handle,
        changeId: "coordinator-change",
      },
      intent,
    });

    expect(result.kind).toBe("operator_required");
    if (result.kind !== "operator_required") return;
    expect(result.reason).toContain("value not updated");
  });

  it("recovery path: completed workflow commits projection and returns recovered_verified", async () => {
    await seedChange(changesDir, makeChange());
    const intent = makeIntent();

    const authority: ChangeAuthority = {
      kind: "workflow_completed",
      evidence: {
        reason: "missing_workflow",
        evidence: "workflow execution already completed",
      },
    };

    const result = await coordinateChangeMutation({
      authority,
      intent,
      changesDir,
    });

    expect(result.kind).toBe("recovered_verified");
    if (result.kind !== "recovered_verified") return;
    expect(result.value.title).toBe("recovered");
    expect(result.recoveryAudit.authority_kind).toBe("recovery");
    expect(result.recoveryAudit.recovery_reason).toBe("missing_workflow");
  });

  it("returns recovered_unverified when recovery commit lacks visible postcondition", async () => {
    await seedChange(changesDir, makeChange());
    const intent = makeIntent({
      verifyProjection: () => ({ ok: false, error: "postcondition invisible" }),
    });

    const authority: ChangeAuthority = {
      kind: "workflow_poisoned",
      evidence: { reason: "poisoned_history", evidence: "TMPRL1100" },
    };

    const result = await coordinateChangeMutation({
      authority,
      intent,
      changesDir,
    });

    expect(result.kind).toBe("recovered_unverified");
    if (result.kind !== "recovered_unverified") return;
    expect(result.reason).toBe("postcondition invisible");
  });

  it("returns stale_revision for a conflicting concurrent recovery mutation", async () => {
    await seedChange(changesDir, makeChange({ projection_revision: 2 }));
    const intent = makeIntent({
      mutateLatestProjection: (latest) => ({ ...latest, title: "conflict" }),
    });

    const authority: ChangeAuthority = {
      kind: "workflow_completed",
      evidence: { reason: "missing_workflow", evidence: "completed" },
    };

    const result = await coordinateChangeMutation({
      authority,
      intent,
      changesDir,
      expectedRevision: 1,
    });

    expect(result.kind).toBe("stale_revision");
    if (result.kind !== "stale_revision") return;
    expect(result.expected).toBe(1);
    expect(result.actual).toBe(2);
  });

  it("re-resolves a recoverable signal dispatch error through the recovery path", async () => {
    await seedChange(changesDir, makeChange());
    const handle = makeHandle();
    const err = new Error("workflow not found for ID coordinator-change");
    const intent = makeIntent({
      sendSignal: vi.fn().mockRejectedValue(err),
    });

    const result = await coordinateChangeMutation({
      authority: {
        kind: "temporal_live",
        handle,
        changeId: "coordinator-change",
      },
      intent,
      changesDir,
    });

    expect(result.kind).toBe("recovered_verified");
    if (result.kind !== "recovered_verified") return;
    expect(result.recoveryAudit.recovery_reason).toBe("missing_workflow");
  });

  it("requires operator when recovery authority is given without a changesDir", async () => {
    const intent = makeIntent();
    const authority: ChangeAuthority = {
      kind: "workflow_completed",
      evidence: { reason: "missing_workflow", evidence: "completed" },
    };

    const result = await coordinateChangeMutation({ authority, intent });

    expect(result.kind).toBe("operator_required");
    if (result.kind !== "operator_required") return;
    expect(result.reason).toContain("requires a changesDir");
  });
});
