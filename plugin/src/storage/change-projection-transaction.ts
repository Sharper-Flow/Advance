/**
 * Storage-Owned Conditional Change-Projection Transaction
 *
 * Central primitive for every active change-projection write. The primitive
 * — not its caller — owns the lock, latest read, expected-revision compare,
 * mutation, revision increment, atomic write, in-lock readback, and
 * mutation-specific postcondition verification.
 *
 * Temporal remains canonical for healthy workflows. Recovery writers and
 * (eventually) Temporal dual-write projection updates route through here so
 * concurrent disjoint writes survive and conflicting writes produce typed
 * evidence instead of last-writer-wins silence.
 */

import { join } from "path";
import { access } from "fs/promises";
import { acquireFileLock, atomicWriteFile } from "../utils/fs";
import { loadChange } from "./json";
import { isSyntheticValidationDraftPattern } from "../utils/synthetic-fixture-detector";
import type { Change, ProjectionCommitAuditEntry } from "../types";

export const PROJECTION_COMMIT_MAX_AUDIT_ENTRIES = 50;

export type ProjectionCommitAuthority =
  | { kind: "temporal"; mutationReceiptId: string }
  | { kind: "recovery"; reason: string; evidence: string };

export type ProjectionCommitVerifyResult =
  | boolean
  | { ok: boolean; error?: string };

export interface ProjectionCommitVerifyContext {
  latest: Change;
  readback: Change;
  priorRevision: number;
  newRevision: number;
}

export type ProjectionCommitOutcome =
  | {
      kind: "committed";
      value: Change;
      revision: number;
      readback: Change;
      audit: ProjectionCommitAuditEntry;
    }
  | {
      kind: "committed_unverified";
      value: Change;
      revision: number;
      readback: Change;
      audit: ProjectionCommitAuditEntry;
      postconditionError: string;
    }
  | { kind: "stale_revision"; expected: number; actual: number }
  | { kind: "lock_timeout"; lockPath: string; timeoutMs: number }
  | { kind: "schema_error"; error: string }
  | { kind: "write_error"; error: string }
  | { kind: "operator_required"; reason: string };

export interface CommitChangeProjectionOptions {
  changesDir: string;
  changeId: string;
  /**
   * Caller-observed revision that must still be current. When supplied and
   * the latest projection revision differs, the commit returns
   * `stale_revision` without mutating. Omitted for merge-safe disjoint
   * mutations: the primitive still re-reads latest inside the lock and applies
   * the caller's field-local mutation to that latest state.
   */
  expectedRevision?: number;
  authority: ProjectionCommitAuthority;
  mutationKind: string;
  /**
   * Pure-ish transform over the latest projection read inside the lock.
   * Callers must derive the returned Change from `latest`; spreading a
   * caller-captured snapshot is a caller bug that the transaction cannot fully
   * prevent, but the API shape makes the mistake obvious.
   */
  mutateLatest: (latest: Change) => Change;
  /**
   * Mutation-specific postcondition checked against the in-lock readback.
   * Returning `false` or `{ ok: false }` produces `committed_unverified`,
   * which downstream authority treats as a blocker.
   */
  verify: (ctx: ProjectionCommitVerifyContext) => ProjectionCommitVerifyResult;
  lockTimeoutMs?: number;
}

/**
 * Commit a conditional active-projection write for a single change.
 *
 * Invariant sequence:
 *   1. Acquire per-change projection lock.
 *   2. Read and schema-validate the latest projection inside the lock.
 *   3. Normalize missing legacy `projection_revision` to `0`.
 *   4. Compare latest revision with `expectedRevision` when supplied.
 *   5. Apply `mutateLatest` to the just-read latest projection.
 *   6. Increment revision exactly once.
 *   7. Append bounded mutation/recovery audit metadata.
 *   8. Atomically persist while holding the lock.
 *   9. Re-read while still holding the lock.
 *   10. Verify revision increment and mutation-specific postcondition.
 */
export async function commitChangeProjection(
  options: CommitChangeProjectionOptions,
): Promise<ProjectionCommitOutcome> {
  const {
    changesDir,
    changeId,
    expectedRevision,
    authority,
    mutationKind,
    mutateLatest,
    verify,
    lockTimeoutMs,
  } = options;

  if (isSyntheticValidationDraftPattern(changeId)) {
    return {
      kind: "operator_required",
      reason: `Refusing to commit projection for synthetic-validation-draft changeId "${changeId}".`,
    };
  }

  const changePath = join(changesDir, changeId, "change.json");
  const lockPath = `${changePath}.lock`;

  // Fail fast with a clear authority signal when the change projection is absent.
  // This avoids misclassifying a missing-directory lock failure as a lock timeout.
  try {
    await access(changePath);
  } catch {
    return {
      kind: "operator_required",
      reason: `Cannot commit projection for ${changeId}: change not found.`,
    };
  }

  let releaseLock: (() => Promise<void>) | undefined;

  try {
    releaseLock = await acquireFileLock(changePath, lockTimeoutMs);
  } catch {
    return {
      kind: "lock_timeout",
      lockPath,
      timeoutMs: lockTimeoutMs ?? 15000,
    };
  }

  try {
    // 1. Read and schema-validate the latest projection inside the lock.
    const loaded = await loadChange(changesDir, changeId);
    if (!loaded.success) {
      if (loaded.type === "schema_error") {
        return { kind: "schema_error", error: loaded.error };
      }
      return {
        kind: "operator_required",
        reason: `Cannot commit projection for ${changeId}: ${loaded.error}`,
      };
    }

    const latest = loaded.data;
    if (!latest) {
      return {
        kind: "operator_required",
        reason: `Cannot commit projection for ${changeId}: change not found.`,
      };
    }

    // 2. Normalize missing legacy projection_revision to 0.
    const priorRevision = latest.projection_revision ?? 0;

    // 3. Compare expected revision when supplied.
    if (expectedRevision !== undefined && priorRevision !== expectedRevision) {
      return {
        kind: "stale_revision",
        expected: expectedRevision,
        actual: priorRevision,
      };
    }

    // 4. Apply caller mutation to the just-read latest projection.
    const newRevision = priorRevision + 1;
    let candidate: Change;
    try {
      candidate = mutateLatest(latest);
    } catch (error) {
      return {
        kind: "operator_required",
        reason: `Mutation failed for ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 5. Increment revision exactly once and append bounded audit metadata.
    const committedAt = new Date().toISOString();
    const audit: ProjectionCommitAuditEntry = {
      mutation_kind: mutationKind,
      authority_kind: authority.kind,
      ...(authority.kind === "temporal"
        ? { mutation_receipt_id: authority.mutationReceiptId }
        : {
            recovery_reason: authority.reason,
            recovery_evidence: authority.evidence,
          }),
      prior_revision: priorRevision,
      new_revision: newRevision,
      committed_at: committedAt,
    };

    const priorCommits = candidate.projection_commits ?? [];
    const projection_commits: ProjectionCommitAuditEntry[] = [
      ...priorCommits,
      audit,
    ].slice(-PROJECTION_COMMIT_MAX_AUDIT_ENTRIES);

    const value: Change = {
      ...candidate,
      projection_revision: newRevision,
      projection_commits,
    };

    // 6. Atomically persist while holding the lock.
    if (isSyntheticValidationDraftPattern(value.id)) {
      return {
        kind: "operator_required",
        reason: `Refusing to write change with synthetic-validation-draft ID "${value.id}".`,
      };
    }

    try {
      await atomicWriteFile(changePath, JSON.stringify(value, null, 2));
    } catch (error) {
      return {
        kind: "write_error",
        error: `Failed to write ${changePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 7. Re-read while still holding the lock.
    const readbackResult = await loadChange(changesDir, changeId);
    if (!readbackResult.success) {
      if (readbackResult.type === "schema_error") {
        return { kind: "schema_error", error: readbackResult.error };
      }
      return {
        kind: "operator_required",
        reason: `Readback failed after commit for ${changeId}: ${readbackResult.error}`,
      };
    }

    const readback = readbackResult.data;
    if (!readback) {
      return {
        kind: "operator_required",
        reason: `Readback returned no data after commit for ${changeId}.`,
      };
    }

    // 8. Verify revision increment as a generic readback proof.
    if ((readback.projection_revision ?? 0) !== newRevision) {
      return {
        kind: "committed_unverified",
        value,
        revision: newRevision,
        readback,
        audit,
        postconditionError: `Readback revision ${readback.projection_revision ?? 0} does not match committed revision ${newRevision}.`,
      };
    }

    // 9. Verify mutation-specific postcondition.
    const verifyResult = verify({
      latest,
      readback,
      priorRevision,
      newRevision,
    });

    let postconditionOk: boolean;
    let postconditionError: string | undefined;
    if (typeof verifyResult === "boolean") {
      postconditionOk = verifyResult;
      postconditionError = postconditionOk
        ? undefined
        : "Mutation-specific postcondition failed.";
    } else {
      postconditionOk = verifyResult.ok;
      postconditionError =
        verifyResult.error ?? "Mutation-specific postcondition failed.";
    }

    if (!postconditionOk) {
      return {
        kind: "committed_unverified",
        value,
        revision: newRevision,
        readback,
        audit,
        postconditionError:
          postconditionError ?? "Mutation-specific postcondition failed.",
      };
    }

    return { kind: "committed", value, revision: newRevision, readback, audit };
  } finally {
    if (releaseLock) {
      await releaseLock();
    }
  }
}
