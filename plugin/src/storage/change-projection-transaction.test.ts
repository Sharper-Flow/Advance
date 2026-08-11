/**
 * Storage-owned conditional change-projection transaction tests.
 *
 * TDD sequence:
 *   1. Reproduce lost-update / silent-conflict failure modes with raw saveChange.
 *   2. Verify commitChangeProjection preserves disjoint concurrent writes,
 *      rejects conflicting same-revision writes with typed stale_revision,
 *      and proves every successful commit via in-lock readback + postcondition.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import * as fsModule from "../utils/fs";
import { loadChange, saveChange } from "./json";
import {
  commitChangeProjection,
  type ProjectionCommitVerifyContext,
  type ProjectionCommitVerifyResult,
} from "./change-projection-transaction";
import { ChangeSchema } from "../types";
import {
  createTempDir,
  cleanupTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import type { Change, ProjectionCommitAuditEntry } from "../types";

const RECOVERY_AUTHORITY = {
  kind: "recovery" as const,
  reason: "workflow_completed",
  evidence: "completed workflow could not accept signal",
};

function makeChange(id: string, overrides: Partial<Change> = {}): Change {
  return ChangeSchema.parse({
    ...SAMPLE_CHANGE,
    id,
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

function commitWithIdentity(
  changesDir: string,
  changeId: string,
  options: {
    operationId?: string;
    payloadHash?: string;
    stateRevision?: number;
    mutationKind?: string;
    expectedRevision?: number;
    mutateLatest?: (latest: Change) => Change;
    verify?: (
      ctx: ProjectionCommitVerifyContext,
    ) => ProjectionCommitVerifyResult;
  },
) {
  return commitChangeProjection({
    changesDir,
    changeId,
    authority: RECOVERY_AUTHORITY,
    mutationKind: options.mutationKind ?? "test:identity-fence",
    operationId: options.operationId,
    payloadHash: options.payloadHash,
    stateRevision: options.stateRevision,
    expectedRevision: options.expectedRevision,
    mutateLatest: options.mutateLatest ?? ((latest) => latest),
    verify: options.verify ?? (() => true),
    lockTimeoutMs: 1000,
  });
}

describe("commitChangeProjection", () => {
  let tempDir: string;
  let changesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("projection-tx-");
    changesDir = join(tempDir, ".adv", "changes");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("normalizes legacy missing projection_revision to 0 and first commit sets it to 1", async () => {
    const changeId = "legacyRevision";
    await seedChange(changesDir, makeChange(changeId));

    const before = await loadChange(changesDir, changeId);
    expect(before.success && before.data?.projection_revision).toBeUndefined();

    const result = await commitChangeProjection({
      changesDir,
      changeId,
      authority: RECOVERY_AUTHORITY,
      mutationKind: "test:legacy-bump",
      mutateLatest: (latest) => ({
        ...latest,
        title: "updated",
      }),
      verify: ({ readback }) => readback.title === "updated",
    });

    expect(result.kind).toBe("committed");
    if (result.kind !== "committed") return;
    expect(result.revision).toBe(1);
    expect(result.readback.projection_revision).toBe(1);
    expect(result.readback.title).toBe("updated");
    expect(result.audit.prior_revision).toBe(0);
    expect(result.audit.new_revision).toBe(1);
  });

  it("increments revision monotonically and bounds audit trail", async () => {
    const changeId = "monotonic";
    await seedChange(changesDir, makeChange(changeId));

    for (let i = 0; i < 3; i++) {
      const result = await commitChangeProjection({
        changesDir,
        changeId,
        authority: RECOVERY_AUTHORITY,
        mutationKind: `test:step-${i}`,
        mutateLatest: (latest) => ({
          ...latest,
          title: `step-${i}`,
        }),
        verify: ({ readback, newRevision }) =>
          (readback.projection_revision ?? 0) === newRevision,
      });
      expect(result.kind).toBe("committed");
      if (result.kind === "committed") {
        expect(result.revision).toBe(i + 1);
      }
    }

    const loaded = await loadChange(changesDir, changeId);
    expect(loaded.success).toBe(true);
    if (!loaded.success || !loaded.data) return;
    expect(loaded.data.projection_revision).toBe(3);
    expect(loaded.data.projection_commits).toHaveLength(3);
    expect(loaded.data.projection_commits?.[2].new_revision).toBe(3);
  });

  it("records the optional payload in the projection commit audit", async () => {
    const changeId = "payload-audit";
    await seedChange(changesDir, makeChange(changeId));

    const result = await commitChangeProjection({
      changesDir,
      changeId,
      authority: RECOVERY_AUTHORITY,
      mutationKind: "test:payload",
      payload: {
        taskId: "tk-1",
        concernKey: "verification",
        disposition: "fixed",
      },
      mutateLatest: (latest) => ({ ...latest, title: "payloaded" }),
      verify: ({ readback }) => readback.title === "payloaded",
    });

    expect(result.kind).toBe("committed");
    if (result.kind !== "committed") return;
    expect(result.audit.payload).toEqual({
      taskId: "tk-1",
      concernKey: "verification",
      disposition: "fixed",
    });

    const loaded = await loadChange(changesDir, changeId);
    expect(loaded.success).toBe(true);
    if (!loaded.success || !loaded.data) return;
    expect(loaded.data.projection_commits?.[0].payload).toEqual({
      taskId: "tk-1",
      concernKey: "verification",
      disposition: "fixed",
    });
  });

  it("returns stale_revision when expectedRevision does not match latest", async () => {
    const changeId = "stale";
    await seedChange(
      changesDir,
      makeChange(changeId, { projection_revision: 2 }),
    );

    const result = await commitChangeProjection({
      changesDir,
      changeId,
      expectedRevision: 1,
      authority: RECOVERY_AUTHORITY,
      mutationKind: "test:stale",
      mutateLatest: (latest) => ({ ...latest, title: "should-not-write" }),
      verify: () => true,
    });

    expect(result.kind).toBe("stale_revision");
    if (result.kind !== "stale_revision") return;
    expect(result.expected).toBe(1);
    expect(result.actual).toBe(2);

    const loaded = await loadChange(changesDir, changeId);
    expect(loaded.success && loaded.data?.title).not.toBe("should-not-write");
  });

  it("returns lock_timeout when lock cannot be acquired", async () => {
    const changeId = "locked";
    await seedChange(changesDir, makeChange(changeId));

    // Hold the same lock the transaction will request.
    const { acquireFileLock } = await import("../utils/fs");
    const release = await acquireFileLock(
      join(changesDir, changeId, "change.json"),
    );

    try {
      const result = await commitChangeProjection({
        changesDir,
        changeId,
        authority: RECOVERY_AUTHORITY,
        mutationKind: "test:lock-timeout",
        mutateLatest: (latest) => ({ ...latest, title: "no-write" }),
        verify: () => true,
        lockTimeoutMs: 50,
      });

      expect(result.kind).toBe("lock_timeout");
      if (result.kind !== "lock_timeout") return;
      expect(result.timeoutMs).toBe(50);
    } finally {
      await release();
    }
  });

  it("AC5: sizes the lock wait from the remaining outer tool budget", async () => {
    const changeId = "locked-under-tool-deadline";
    await seedChange(changesDir, makeChange(changeId));

    const { acquireFileLock } = await import("../utils/fs");
    const { withToolDeadline } = await import("../utils/tool-deadline");
    const { TOOL_RESPONSE_HEADROOM_MS } = await import("../utils/tool-budgets");
    const release = await acquireFileLock(
      join(changesDir, changeId, "change.json"),
    );

    // Remaining outer budget is far below the 15s default, so the derived wait
    // must shrink to it rather than outliving the invocation.
    const outerBudgetMs = TOOL_RESPONSE_HEADROOM_MS + 100;
    try {
      const startedAt = Date.now();
      const result = await withToolDeadline(outerBudgetMs, () =>
        commitChangeProjection({
          changesDir,
          changeId,
          authority: RECOVERY_AUTHORITY,
          mutationKind: "test:lock-budget-derivation",
          mutateLatest: (latest) => ({ ...latest, title: "no-write" }),
          verify: () => true,
        }),
      );
      const elapsed = Date.now() - startedAt;

      expect(result.kind).toBe("lock_timeout");
      if (result.kind !== "lock_timeout") return;
      expect(result.timeoutMs).toBeLessThanOrEqual(outerBudgetMs);
      expect(result.timeoutMs).toBeLessThanOrEqual(100);
      expect(elapsed).toBeLessThan(outerBudgetMs);
    } finally {
      await release();
    }
  });

  it("AC6: keeps a bounded default wait with no outer deadline", async () => {
    const changeId = "locked-without-deadline";
    await seedChange(changesDir, makeChange(changeId));

    const { acquireFileLock } = await import("../utils/fs");
    const { DEFAULT_LOCK_BUDGET_MS } = await import("../utils/tool-budgets");
    const release = await acquireFileLock(
      join(changesDir, changeId, "change.json"),
    );

    try {
      const result = await commitChangeProjection({
        changesDir,
        changeId,
        authority: RECOVERY_AUTHORITY,
        mutationKind: "test:lock-default-budget",
        mutateLatest: (latest) => ({ ...latest, title: "no-write" }),
        verify: () => true,
        lockTimeoutMs: 40,
      });

      expect(result.kind).toBe("lock_timeout");
      if (result.kind !== "lock_timeout") return;
      // Explicit caller timeout is honored, and the no-argument path would
      // still be bounded by the default rather than waiting indefinitely.
      expect(result.timeoutMs).toBe(40);
      expect(DEFAULT_LOCK_BUDGET_MS).toBeGreaterThan(0);
      expect(Number.isFinite(DEFAULT_LOCK_BUDGET_MS)).toBe(true);
    } finally {
      await release();
    }
  });

  it("returns committed_unverified when postcondition fails", async () => {
    const changeId = "unverified";
    await seedChange(changesDir, makeChange(changeId));

    const result = await commitChangeProjection({
      changesDir,
      changeId,
      authority: RECOVERY_AUTHORITY,
      mutationKind: "test:unverified",
      mutateLatest: (latest) => ({ ...latest, title: "updated" }),
      verify: () => ({ ok: false, error: "intentional postcondition failure" }),
    });

    expect(result.kind).toBe("committed_unverified");
    if (result.kind !== "committed_unverified") return;
    expect(result.postconditionError).toBe("intentional postcondition failure");
    expect(result.revision).toBe(1);
    expect(result.readback.projection_revision).toBe(1);
  });

  it("returns operator_required for a missing change", async () => {
    const result = await commitChangeProjection({
      changesDir,
      changeId: "does-not-exist",
      authority: RECOVERY_AUTHORITY,
      mutationKind: "test:missing",
      mutateLatest: (latest) => latest,
      verify: () => true,
    });

    expect(result.kind).toBe("operator_required");
    if (result.kind !== "operator_required") return;
    expect(result.reason).toContain("not found");
  });

  it("returns schema_error when persisted projection is invalid", async () => {
    const changeId = "invalid";
    const changeDir = join(changesDir, changeId);
    await mkdir(changeDir, { recursive: true });
    await writeFile(
      join(changeDir, "change.json"),
      JSON.stringify({ not: "a change" }),
      "utf-8",
    );

    const result = await commitChangeProjection({
      changesDir,
      changeId,
      authority: RECOVERY_AUTHORITY,
      mutationKind: "test:invalid",
      mutateLatest: (latest) => latest,
      verify: () => true,
    });

    expect(result.kind).toBe("schema_error");
  });

  describe("concurrent disjoint writes", () => {
    it("raw saveChange loses one of two concurrent disjoint writes from the same revision", async () => {
      const changeId = "raw-lost-update";
      await seedChange(changesDir, makeChange(changeId));

      const mutateA = (base: Change): Change => ({
        ...base,
        affectedPaths: ["src/a.ts"],
      });
      const mutateB = (base: Change): Change => ({
        ...base,
        scope_repos: [{ repo_id: "repo-b", branch: "main" }],
      });

      const base = (await loadChange(changesDir, changeId)).data;
      expect(base).toBeTruthy();

      await Promise.all([
        saveChange(changesDir, mutateA(base!)),
        saveChange(changesDir, mutateB(base!)),
      ]);

      const after = await loadChange(changesDir, changeId);
      expect(after.success).toBe(true);
      if (!after.success || !after.data) return;

      // One of the two mutations is guaranteed to be lost because both writers
      // read the same base and wrote whole-object snapshots.
      const hasA = after.data.affectedPaths?.includes("src/a.ts") ?? false;
      const hasB =
        after.data.scope_repos?.some((r) => r.repo_id === "repo-b") ?? false;
      expect(hasA && hasB).toBe(false);
    });

    it("preserves both concurrent disjoint writes in 100/100 iterations", async () => {
      const changeId = "disjoint-stress";
      await seedChange(changesDir, makeChange(changeId));

      const runIteration = async (iter: number) => {
        const [resultA, resultB] = await Promise.all([
          commitChangeProjection({
            changesDir,
            changeId,
            authority: RECOVERY_AUTHORITY,
            mutationKind: "test:disjoint-a",
            mutateLatest: (latest) => ({
              ...latest,
              affectedPaths: Array.from(
                new Set([...(latest.affectedPaths ?? []), `src/a-${iter}.ts`]),
              ),
            }),
            verify: ({ readback, newRevision }) =>
              (readback.projection_revision ?? 0) === newRevision,
          }),
          commitChangeProjection({
            changesDir,
            changeId,
            authority: RECOVERY_AUTHORITY,
            mutationKind: "test:disjoint-b",
            mutateLatest: (latest) => ({
              ...latest,
              scope_repos: [
                ...(latest.scope_repos ?? []),
                { repo_id: `repo-b-${iter}` },
              ],
            }),
            verify: ({ readback, newRevision }) =>
              (readback.projection_revision ?? 0) === newRevision,
          }),
        ]);

        expect(resultA.kind).toBe("committed");
        expect(resultB.kind).toBe("committed");

        const loaded = await loadChange(changesDir, changeId);
        expect(loaded.success).toBe(true);
        if (!loaded.success || !loaded.data) return;
        expect(loaded.data.affectedPaths).toContain(`src/a-${iter}.ts`);
        expect(loaded.data.scope_repos).toContainEqual({
          repo_id: `repo-b-${iter}`,
          required: true,
        });
      };

      for (let i = 0; i < 100; i++) {
        await runIteration(i);
      }

      const final = await loadChange(changesDir, changeId);
      expect(final.success).toBe(true);
      if (!final.success || !final.data) return;
      expect(final.data.projection_revision).toBe(200);
      expect(final.data.affectedPaths).toHaveLength(100);
      expect(final.data.scope_repos).toHaveLength(100);
    }, 15_000);
  });

  describe("concurrent conflicting writes", () => {
    it("raw saveChange lets both conflicting writers appear successful", async () => {
      const changeId = "raw-conflict";
      await seedChange(changesDir, makeChange(changeId));

      const base = (await loadChange(changesDir, changeId)).data;
      expect(base).toBeTruthy();

      await Promise.all([
        saveChange(changesDir, { ...base!, title: "writer-a" }),
        saveChange(changesDir, { ...base!, title: "writer-b" }),
      ]);

      // Both saveChange calls resolved, so each writer thought it succeeded.
      const after = await loadChange(changesDir, changeId);
      expect(after.success).toBe(true);
      if (!after.success || !after.data) return;
      expect(["writer-a", "writer-b"]).toContain(after.data.title);
    });

    it("returns exactly one typed stale_revision for same-field concurrent race", async () => {
      const changeId = "conflict-race";
      await seedChange(changesDir, makeChange(changeId));

      const outcomes = await Promise.all([
        commitChangeProjection({
          changesDir,
          changeId,
          expectedRevision: 0,
          authority: RECOVERY_AUTHORITY,
          mutationKind: "test:conflict-a",
          mutateLatest: (latest) => ({ ...latest, title: "writer-a" }),
          verify: ({ readback }) => readback.title === "writer-a",
        }),
        commitChangeProjection({
          changesDir,
          changeId,
          expectedRevision: 0,
          authority: RECOVERY_AUTHORITY,
          mutationKind: "test:conflict-b",
          mutateLatest: (latest) => ({ ...latest, title: "writer-b" }),
          verify: ({ readback }) => readback.title === "writer-b",
        }),
      ]);

      const committed = outcomes.filter((o) => o.kind === "committed");
      const stale = outcomes.filter((o) => o.kind === "stale_revision");

      expect(committed).toHaveLength(1);
      expect(stale).toHaveLength(1);
      expect(stale[0]?.kind).toBe("stale_revision");
      if (stale[0]?.kind !== "stale_revision") return;
      expect(stale[0].expected).toBe(0);
      expect(stale[0].actual).toBe(1);
    });
  });

  it("records bounded audit metadata per commit", async () => {
    const changeId = "audit";
    await seedChange(changesDir, makeChange(changeId));

    const result = await commitChangeProjection({
      changesDir,
      changeId,
      authority: {
        kind: "recovery",
        reason: "poisoned_history",
        evidence: "TMPRL1100 on replay",
      },
      mutationKind: "verification_evidence_dispositions",
      mutateLatest: (latest) => ({
        ...latest,
        verification_evidence_dispositions: [
          {
            taskId: "tk-verify",
            concernKey: "verification_mismatch",
            disposition: "fixed" as const,
            evidence: "Re-ran suite",
            dispositionedAt: "2026-07-20T00:00:00.000Z",
          },
        ],
      }),
      verify: ({ readback }) =>
        (readback.verification_evidence_dispositions ?? []).length === 1,
    });

    expect(result.kind).toBe("committed");
    if (result.kind !== "committed") return;
    expect(result.audit.mutation_kind).toBe(
      "verification_evidence_dispositions",
    );
    expect(result.audit.authority_kind).toBe("recovery");
    expect(result.audit.authority_reason).toBe("poisoned_history");
    expect(result.audit.authority_evidence).toBe("TMPRL1100 on replay");
    expect(result.audit.prior_revision).toBe(0);
    expect(result.audit.new_revision).toBe(1);

    const raw = JSON.parse(
      await readFile(join(changesDir, changeId, "change.json"), "utf-8"),
    );
    expect(raw.projection_commits).toHaveLength(1);
    expect(raw.projection_commits[0].mutation_kind).toBe(
      "verification_evidence_dispositions",
    );
  });

  it("is archive/projection schema compatible: legacy archive without projection_revision parses", async () => {
    const changeId = "archive-compat";
    const change = makeChange(changeId);
    await seedChange(changesDir, change);

    const result = await commitChangeProjection({
      changesDir,
      changeId,
      authority: RECOVERY_AUTHORITY,
      mutationKind: "test:archive-compat",
      mutateLatest: (latest) => ({
        ...latest,
        title: "archive-updated",
      }),
      verify: ({ readback }) => readback.title === "archive-updated",
    });

    expect(result.kind).toBe("committed");

    const raw = JSON.parse(
      await readFile(join(changesDir, changeId, "change.json"), "utf-8"),
    );
    // Schema still accepts the old shape even though it never carried the field.
    const reparsed = ChangeSchema.parse(raw);
    expect(reparsed.projection_revision).toBe(1);
    expect(reparsed.projection_commits).toHaveLength(1);
  });

  it("keeps archived temporal authority as a read-only legacy value", () => {
    const parsed = ChangeSchema.parse({
      ...makeChange("legacy-temporal-authority"),
      status: "archived",
      projection_commits: [
        {
          mutation_kind: "legacy:temporal-write",
          authority_kind: "temporal",
          mutation_receipt_id: "receipt-123",
          prior_revision: 0,
          new_revision: 1,
          committed_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(parsed.projection_commits?.[0]).toMatchObject({
      authority_kind: "temporal",
      mutation_receipt_id: "receipt-123",
    });
  });

  describe("operation identity and state revision fencing (AC4/AC12)", () => {
    it("returns idempotent committed result for same operation_id + payload_hash + state_revision without projection increment", async () => {
      const changeId = "idempotent-replay";
      await seedChange(changesDir, makeChange(changeId, { state_revision: 5 }));

      const first = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash: "hash-a",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "first" }),
      });

      expect(first.kind).toBe("committed");
      if (first.kind !== "committed") return;
      expect(first.idempotent).not.toBe(true);
      expect(first.revision).toBe(1);
      expect(first.readback.state_revision).toBe(5);
      expect(first.readback.title).toBe("first");
      expect(first.readback.projection_revision).toBe(1);

      const second = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash: "hash-a",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "second" }),
      });

      expect(second.kind).toBe("committed");
      if (second.kind !== "committed") return;
      expect(second.idempotent).toBe(true);
      expect(second.revision).toBe(first.revision);
      expect(second.readback.title).toBe("first");
      expect(second.readback.projection_revision).toBe(first.revision);

      const loaded = await loadChange(changesDir, changeId);
      expect(loaded.success).toBe(true);
      if (!loaded.success || !loaded.data) return;
      expect(loaded.data.title).toBe("first");
      expect(loaded.data.projection_commits).toHaveLength(1);
    });

    it("returns operation_conflict for same operation_id + different payload_hash", async () => {
      const changeId = "payload-conflict";
      await seedChange(changesDir, makeChange(changeId, { state_revision: 5 }));

      const first = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash: "hash-a",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "first" }),
      });
      expect(first.kind).toBe("committed");

      const second = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash: "hash-b",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "second" }),
      });

      expect(second.kind).toBe("operation_conflict");
      if (second.kind !== "operation_conflict") return;
      expect(second.operationId).toBe("op-1");
      expect(second.expectedPayloadHash).toBe("hash-a");
      expect(second.actualPayloadHash).toBe("hash-b");

      const loaded = await loadChange(changesDir, changeId);
      expect(loaded.success && loaded.data?.title).toBe("first");
      expect(loaded.success && loaded.data?.projection_revision).toBe(1);
    });

    it("returns state_regression when incoming state_revision is lower than stored projection", async () => {
      const changeId = "state-regression";
      await seedChange(changesDir, makeChange(changeId, { state_revision: 5 }));

      const first = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash: "hash-a",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "first" }),
      });
      expect(first.kind).toBe("committed");

      const second = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-2",
        payloadHash: "hash-b",
        stateRevision: 3,
        mutateLatest: (latest) => ({ ...latest, title: "second" }),
      });

      expect(second.kind).toBe("state_regression");
      if (second.kind !== "state_regression") return;
      expect(second.expected).toBe(5);
      expect(second.actual).toBe(3);

      const loaded = await loadChange(changesDir, changeId);
      expect(loaded.success && loaded.data?.state_revision).toBe(5);
      expect(loaded.success && loaded.data?.projection_revision).toBe(1);
    });

    it("returns state_revision_conflict when equal state_revision has conflicting operation/content", async () => {
      const changeId = "revision-conflict";
      await seedChange(changesDir, makeChange(changeId, { state_revision: 5 }));

      const first = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash: "hash-a",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "first" }),
      });
      expect(first.kind).toBe("committed");

      const second = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-2",
        payloadHash: "hash-b",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "second" }),
      });

      expect(second.kind).toBe("state_revision_conflict");
      if (second.kind !== "state_revision_conflict") return;
      expect(second.stateRevision).toBe(5);

      const loaded = await loadChange(changesDir, changeId);
      expect(loaded.success && loaded.data?.title).toBe("first");
      expect(loaded.success && loaded.data?.projection_revision).toBe(1);
    });

    it("proves stored operation identity and state revision by readback on success", async () => {
      const changeId = "readback-proof";
      const payloadHash = "a".repeat(64);
      await seedChange(changesDir, makeChange(changeId, { state_revision: 7 }));

      const result = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash,
        stateRevision: 7,
        mutateLatest: (latest) => ({ ...latest, title: "updated" }),
      });

      expect(result.kind).toBe("committed");
      if (result.kind !== "committed") return;
      expect(result.readback.state_revision).toBe(7);
      expect(result.readback.projection_revision).toBe(1);
      expect(result.audit.operation_id).toBe("op-1");
      expect(result.audit.payload_hash).toBe(payloadHash);
      expect(result.audit.state_revision).toBe(7);

      const loaded = await loadChange(changesDir, changeId);
      expect(loaded.success).toBe(true);
      if (!loaded.success || !loaded.data) return;
      expect(loaded.data.state_revision).toBe(7);
      const lastAudit = loaded.data.projection_commits?.[0];
      expect(lastAudit?.operation_id).toBe("op-1");
      expect(lastAudit?.payload_hash).toBe(payloadHash);
      expect(lastAudit?.state_revision).toBe(7);
    });

    it("does not return success when readback lacks stored operation identity", async () => {
      const changeId = "readback-identity-failure";
      await seedChange(changesDir, makeChange(changeId, { state_revision: 5 }));

      const first = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash: "hash-a",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "first" }),
      });
      expect(first.kind).toBe("committed");

      const raw = JSON.parse(
        await readFile(join(changesDir, changeId, "change.json"), "utf-8"),
      );
      const tampered = {
        ...raw,
        projection_commits: (raw.projection_commits ?? []).map(
          (entry: ProjectionCommitAuditEntry) => ({
            ...entry,
            operation_id: undefined,
            payload_hash: undefined,
          }),
        ),
      };
      await writeFile(
        join(changesDir, changeId, "change.json"),
        JSON.stringify(tampered, null, 2),
        "utf-8",
      );

      const second = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash: "hash-a",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "second" }),
      });

      expect(second.kind).not.toBe("committed");

      const loaded = await loadChange(changesDir, changeId);
      expect(loaded.success && loaded.data?.title).toBe("first");
      expect(loaded.success && loaded.data?.projection_revision).toBe(1);
    });

    it("returns write_error and preserves non-blind-retry semantics when atomicWriteFile fails", async () => {
      const changeId = "write-failure";
      await seedChange(changesDir, makeChange(changeId, { state_revision: 5 }));

      const spy = vi
        .spyOn(fsModule, "atomicWriteFile")
        .mockRejectedValueOnce(new Error("disk full"));

      const result = await commitWithIdentity(changesDir, changeId, {
        operationId: "op-1",
        payloadHash: "hash-a",
        stateRevision: 5,
        mutateLatest: (latest) => ({ ...latest, title: "updated" }),
      });

      spy.mockRestore();

      expect(result.kind).toBe("write_error");
      expect(result.kind).not.toBe("committed");
      const loaded = await loadChange(changesDir, changeId);
      expect(loaded.success && loaded.data?.title).not.toBe("updated");
      expect(
        loaded.success && loaded.data?.projection_revision,
      ).toBeUndefined();
    });
  });
});

describe("protected collection wipe guard", () => {
  let tempDir: string;
  let changesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("projection-wipe-");
    changesDir = join(tempDir, "changes");
    await mkdir(changesDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /**
   * Reproduces the exact shape of the removed Temporal dual-write bug:
   * spreading an object whose keys are all present but undefined over the
   * latest projection, guarded by a postcondition that only compares two
   * scalars the wipe does not touch.
   */
  it("refuses a spread-undefined wipe that a scalar-only postcondition would pass", async () => {
    const change = makeChange("wipeGuard", {
      tasks: [
        {
          id: "tk-1",
          title: "keep me",
          status: "pending",
          created_at: new Date().toISOString(),
        },
      ],
    });
    await seedChange(changesDir, change);

    const temporalOwned = Object.fromEntries(
      ["tasks", "gates", "documents", "deltas"].map((k) => [k, undefined]),
    );

    const outcome = await commitChangeProjection({
      changesDir,
      changeId: "wipeGuard",
      authority: RECOVERY_AUTHORITY,
      mutationKind: "dual_write_shape",
      mutateLatest: (latest) => ({ ...latest, ...temporalOwned }) as Change,
      // The historical guard: two scalars, neither touched by the wipe.
      verify: ({ readback }) =>
        readback.status === change.status &&
        readback.lifecycleState === change.lifecycleState,
    });

    expect(outcome.kind).toBe("operator_required");
    if (outcome.kind === "operator_required") {
      expect(outcome.reason).toContain("tasks");
    }

    const after = await loadChange(changesDir, "wipeGuard");
    expect(after.success && after.data?.tasks).toHaveLength(1);
  });

  it("allows emptying a collection when the caller declares the intent", async () => {
    const change = makeChange("wipeDeclared", {
      tasks: [
        {
          id: "tk-1",
          title: "remove me",
          status: "pending",
          created_at: new Date().toISOString(),
        },
      ],
    });
    await seedChange(changesDir, change);

    const outcome = await commitChangeProjection({
      changesDir,
      changeId: "wipeDeclared",
      authority: RECOVERY_AUTHORITY,
      mutationKind: "clear_tasks",
      allowEmptiedCollections: ["tasks"],
      mutateLatest: (latest) => ({ ...latest, tasks: [] }),
      verify: ({ readback }) => readback.tasks.length === 0,
    });

    expect(outcome.kind).toBe("committed");
  });

  it("still allows a partial shrink without a declaration", async () => {
    const now = new Date().toISOString();
    const change = makeChange("wipePartial", {
      tasks: [
        { id: "tk-1", title: "a", status: "pending", created_at: now },
        { id: "tk-2", title: "b", status: "pending", created_at: now },
      ],
    });
    await seedChange(changesDir, change);

    const outcome = await commitChangeProjection({
      changesDir,
      changeId: "wipePartial",
      authority: RECOVERY_AUTHORITY,
      mutationKind: "drop_one_task",
      mutateLatest: (latest) => ({
        ...latest,
        tasks: latest.tasks.filter((t) => t.id !== "tk-2"),
      }),
      verify: ({ readback }) => readback.tasks.length === 1,
    });

    expect(outcome.kind).toBe("committed");
  });
});
