/**
 * Storage-owned conditional change-projection transaction tests.
 *
 * TDD sequence:
 *   1. Reproduce lost-update / silent-conflict failure modes with raw saveChange.
 *   2. Verify commitChangeProjection preserves disjoint concurrent writes,
 *      rejects conflicting same-revision writes with typed stale_revision,
 *      and proves every successful commit via in-lock readback + postcondition.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { loadChange, saveChange } from "./json";
import { commitChangeProjection } from "./change-projection-transaction";
import { ChangeSchema } from "../types";
import {
  createTempDir,
  cleanupTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import type { Change } from "../types";

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
    });
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
    expect(result.audit.recovery_reason).toBe("poisoned_history");
    expect(result.audit.recovery_evidence).toBe("TMPRL1100 on replay");
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

  it("accepts temporal authority and records mutation receipt id", async () => {
    const changeId = "temporal-authority";
    await seedChange(changesDir, makeChange(changeId));

    const result = await commitChangeProjection({
      changesDir,
      changeId,
      authority: {
        kind: "temporal",
        mutationReceiptId: "receipt-123",
      },
      mutationKind: "test:temporal-dual-write",
      mutateLatest: (latest) => ({ ...latest, title: "temporal" }),
      verify: ({ readback }) => readback.title === "temporal",
    });

    expect(result.kind).toBe("committed");
    if (result.kind !== "committed") return;
    expect(result.audit.authority_kind).toBe("temporal");
    expect(result.audit.mutation_receipt_id).toBe("receipt-123");
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
});
