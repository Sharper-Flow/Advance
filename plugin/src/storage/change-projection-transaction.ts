/**
 * Storage-Owned Conditional Change-Projection Transaction
 *
 * Implements rq-recoveryProjectionTransaction01 (and sub-requirements
 * rq-recoveryProjectionTransaction01.1, .2, .3): concurrent disjoint mutations
 * survive, conflicting mutations fail with typed evidence, and success is
 * proven only after a durable readback.
 *
 * Central primitive for every active change-projection write. The primitive
 * — not its caller — owns the lock, latest read, expected-revision compare,
 * mutation, revision increment, atomic write, in-lock readback, and
 * mutation-specific postcondition verification.
 *
 * The disk projection is canonical. All recovery and mutation writers route
 * through here so concurrent disjoint writes survive and conflicting writes
 * produce typed evidence instead of last-writer-wins silence.
 */

import { join } from "path";
import { access } from "fs/promises";
import { acquireFileLock, atomicWriteFile } from "../utils/fs";
import { loadChange } from "./json";
import { readBoundedProjectionDocument } from "./change-projection-reader";
import { isSyntheticValidationDraftPattern } from "../utils/synthetic-fixture-detector";
import { deriveLockBudgetMs } from "../utils/tool-budgets";
import { getRemainingToolBudgetMs } from "../utils/tool-deadline";
import {
  ChangeSchema,
  type Change,
  type ProjectionCommitAuditEntry,
} from "../types";

export const PROJECTION_COMMIT_MAX_AUDIT_ENTRIES = 50;

/**
 * Collection-shaped fields that a mutation must never silently empty.
 *
 * History: a removed dual-write path built its payload with
 * `{...latest, ...ownedFields}`, where `Object.fromEntries` emitted a key for
 * every owned field even when the value was `undefined`. An empty
 * workflow state therefore nulled `tasks`, `gates`, `documents` and `deltas`
 * in a single write. It committed as `committed` because the caller's
 * postcondition only compared two scalars — `status` and `lifecycleState` —
 * neither of which the wipe touched.
 *
 * Caller-supplied `verify` callbacks cannot be relied on to catch this: the
 * failure is precisely that they check something beside the damage. So the
 * transaction enforces it structurally instead, and fails closed.
 */
const PROTECTED_COLLECTION_FIELDS = [
  "tasks",
  "deltas",
  "gates",
  "documents",
] as const;

type ProtectedCollectionField = (typeof PROTECTED_COLLECTION_FIELDS)[number];

function collectionSize(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") return Object.keys(value).length;
  return null;
}

/**
 * Detect a mutation that drops a populated collection to absent or empty.
 *
 * Shrinking by some entries is legitimate (cancelling a task, retracting a
 * delta), so only the collapse-to-nothing case is refused. `allowEmptied`
 * lets a caller that genuinely intends to clear a collection say so
 * explicitly, at the call site, in the audit trail.
 */
function findCollectionWipe(
  latest: Change,
  candidate: Change,
  allowEmptied: readonly ProtectedCollectionField[] = [],
): { field: ProtectedCollectionField; before: number } | null {
  for (const field of PROTECTED_COLLECTION_FIELDS) {
    if (allowEmptied.includes(field)) continue;
    const before = collectionSize((latest as Record<string, unknown>)[field]);
    if (before === null || before === 0) continue;
    const after = collectionSize((candidate as Record<string, unknown>)[field]);
    if (after === null || after === 0) {
      return { field, before };
    }
  }
  return null;
}

/**
 * Why a projection commit was authorized.
 *
 * `mutation` is the ordinary path: a tool applied a field-local change.
 * `recovery` is the repair path, and stays distinct so the audit trail can
 * still tell the two apart.
 *
 * There is deliberately no legacy authority variant here. Archived changes
 * can still carry that value in their `projection_commits`, so it stays
 * readable — see `ProjectionCommitAuditEntry` — but nothing can write it.
 */
export type ProjectionCommitAuthority =
  | { kind: "mutation"; reason: string; evidence: string }
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

/**
 * Optional callback invoked while the per-change projection lock is still held,
 * after the full snapshot has been written and read back successfully.
 *
 * Used by the summary-shard wrapper to publish the immutable summary shard and
 * current pointer atomically with the full snapshot, without releasing the
 * per-change lock between the two writes.
 */
export interface ProjectionCommitAfterCommitContext {
  latest: Change;
  value: Change;
  readback: Change;
  audit: ProjectionCommitAuditEntry;
  priorRevision: number;
  newRevision: number;
}

export type ProjectionCommitAfterCommitResult =
  | void
  | undefined
  | { ok: true }
  | { ok: false; error: string };

export type ProjectionCommitAfterCommit = (
  ctx: ProjectionCommitAfterCommitContext,
) => Promise<ProjectionCommitAfterCommitResult>;

export type ProjectionCommitOutcome =
  | {
      kind: "committed";
      value: Change;
      revision: number;
      readback: Change;
      audit: ProjectionCommitAuditEntry;
      /** True when the transaction returned a prior accepted result without mutation. */
      idempotent?: boolean;
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
  | { kind: "state_regression"; expected: number; actual: number }
  | {
      kind: "state_revision_conflict";
      stateRevision: number;
      reason: string;
    }
  | {
      kind: "operation_conflict";
      operationId: string;
      expectedPayloadHash: string;
      actualPayloadHash: string;
    }
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
  /**
   * Stable caller-generated operation identity. Reused across retries and
   * recovery attempts so the transaction can return a prior success without
   * reapplying the mutation.
   */
  operationId?: string;
  /**
   * Canonical hash of the command payload. Combined with `operationId` for
   * idempotent replay detection and typed payload conflicts.
   */
  payloadHash?: string;
  /**
   * Monotonic workflow state revision being projected. A lower value than the
   * stored projection's state revision is rejected as a regression; an equal
   * value with a different operation/content is a conflict.
   */
  stateRevision?: number;
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
   * Optional repair-only parser for a projection that is not yet current
   * schema-valid. The returned value is still validated by ChangeSchema before
   * it enters the transaction; ordinary callers must leave this unset.
   */
  normalizeLatestProjection?: (value: unknown) => unknown;
  /**
   * Mutation-specific postcondition checked against the in-lock readback.
   * Returning `false` or `{ ok: false }` produces `committed_unverified`,
   * which downstream authority treats as a blocker.
   */
  verify: (ctx: ProjectionCommitVerifyContext) => ProjectionCommitVerifyResult;
  /**
   * Collections this mutation is explicitly allowed to empty.
   *
   * By default the transaction refuses to commit a mutation that collapses a
   * populated `tasks`, `deltas`, `gates` or `documents` to absent or empty,
   * because a caller postcondition that checks fields beside the damage will
   * happily report success. Declaring the field here is the only way through,
   * and it records the intent at the call site.
   */
  allowEmptiedCollections?: readonly ProtectedCollectionField[];
  /**
   * Optional follow-up work invoked while the per-change lock is still held,
   * after the snapshot has been written, read back, and verified. This lets
   * callers publish dependent durable artifacts (e.g. per-change summary
   * pointers) atomically with the full snapshot.
   */
  afterCommit?: ProjectionCommitAfterCommit;
  lockTimeoutMs?: number;
  /**
   * Optional full signal payload. Recorded in the projection commit audit so
   * recovery mutations can be re-delivered to a reachable workflow.
   */
  payload?: Record<string, unknown>;
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
    operationId,
    payloadHash,
    stateRevision,
    authority,
    mutationKind,
    mutateLatest,
    normalizeLatestProjection,
    verify,
    afterCommit,
    lockTimeoutMs,
    payload,
    allowEmptiedCollections = [],
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

  // Inside a host tool the lock wait is sized against what is left of the outer
  // tool budget, so it can never outlive it; outside one the bounded default
  // applies.
  const effectiveLockTimeoutMs = deriveLockBudgetMs(
    lockTimeoutMs,
    getRemainingToolBudgetMs(),
  );

  try {
    releaseLock = await acquireFileLock(changePath, effectiveLockTimeoutMs);
  } catch {
    return {
      kind: "lock_timeout",
      lockPath,
      timeoutMs: effectiveLockTimeoutMs,
    };
  }

  try {
    // 1. Read and schema-validate the latest projection inside the lock.
    const loaded = await loadChange(changesDir, changeId);
    let latest: Change | null = null;
    if (loaded.success) {
      latest = loaded.data;
    } else {
      if (loaded.type === "schema_error" && normalizeLatestProjection) {
        const rawRead = await readBoundedProjectionDocument(changePath);
        if (rawRead.kind !== "ok") {
          return {
            kind: "schema_error",
            error: `Cannot normalize projection for ${changeId}: ${rawRead.kind}`,
          };
        }
        try {
          latest = ChangeSchema.parse(
            normalizeLatestProjection(JSON.parse(rawRead.content) as unknown),
          );
        } catch (error) {
          return {
            kind: "schema_error",
            error: `Normalized projection for ${changeId} failed ChangeSchema validation: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else {
        if (loaded.type === "schema_error") {
          return { kind: "schema_error", error: loaded.error };
        }
        return {
          kind: "operator_required",
          reason: `Cannot commit projection for ${changeId}: ${loaded.error}`,
        };
      }
    }
    if (!latest) {
      return {
        kind: "operator_required",
        reason: `Cannot commit projection for ${changeId}: change not found.`,
      };
    }

    // 2. Normalize missing legacy projection_revision to 0.
    const priorRevision = latest.projection_revision ?? 0;

    // 3. Resolve operation identity: idempotent replay or typed conflict.
    //    Legacy callers omit operationId; they skip this fence and keep prior behavior.
    if (operationId) {
      const existingAudit = latest.projection_commits?.find(
        (entry) => entry.operation_id === operationId,
      );
      if (existingAudit) {
        const payloadMatches = payloadHash === existingAudit.payload_hash;
        const stateMatches = stateRevision === existingAudit.state_revision;
        if (payloadMatches && stateMatches) {
          return {
            kind: "committed",
            value: latest,
            revision: existingAudit.new_revision,
            readback: latest,
            audit: existingAudit,
            idempotent: true,
          };
        }
        return {
          kind: "operation_conflict",
          operationId,
          expectedPayloadHash: existingAudit.payload_hash ?? "",
          actualPayloadHash: payloadHash ?? "",
        };
      }
    }

    // 4. Compare expected revision when supplied.
    if (expectedRevision !== undefined && priorRevision !== expectedRevision) {
      return {
        kind: "stale_revision",
        expected: expectedRevision,
        actual: priorRevision,
      };
    }

    // 5. Enforce monotonic state revision and equal-state conflict fence.
    const storedStateRevision = latest.state_revision ?? 0;
    if (stateRevision !== undefined) {
      if (stateRevision < storedStateRevision) {
        return {
          kind: "state_regression",
          expected: storedStateRevision,
          actual: stateRevision,
        };
      }
      if (stateRevision === storedStateRevision && operationId) {
        const conflictingAudit = latest.projection_commits?.find(
          (entry) => entry.state_revision === stateRevision,
        );
        if (
          conflictingAudit &&
          (conflictingAudit.operation_id !== operationId ||
            (payloadHash !== undefined &&
              conflictingAudit.payload_hash !== payloadHash))
        ) {
          return {
            kind: "state_revision_conflict",
            stateRevision,
            reason: `State revision ${stateRevision} was already projected by operation ${conflictingAudit.operation_id ?? "<unknown>"} with payload hash ${conflictingAudit.payload_hash ?? "<unknown>"}.`,
          };
        }
      }
    }

    // 6. Apply caller mutation to the just-read latest projection.
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

    // 7. Increment revision exactly once and append bounded audit metadata.
    const committedAt = new Date().toISOString();
    const audit: ProjectionCommitAuditEntry = {
      mutation_kind: mutationKind,
      authority_kind: authority.kind,
      authority_reason: authority.reason,
      authority_evidence: authority.evidence,
      operation_id: operationId,
      payload_hash: payloadHash,
      state_revision: stateRevision,
      prior_revision: priorRevision,
      new_revision: newRevision,
      committed_at: committedAt,
      ...(payload !== undefined ? { payload } : {}),
    };

    // 6b. Refuse a mutation that collapses a populated collection to nothing.
    //     Fails closed: the caller's own postcondition is not trusted to
    //     notice damage adjacent to what it checks.
    const wipe = findCollectionWipe(latest, candidate, allowEmptiedCollections);
    if (wipe) {
      return {
        kind: "operator_required",
        reason: `Refusing to commit ${mutationKind} for ${changeId}: it would empty "${wipe.field}", which held ${wipe.before} entr${wipe.before === 1 ? "y" : "ies"}. If clearing it is intended, declare it via allowEmptiedCollections.`,
      };
    }

    const priorCommits = candidate.projection_commits ?? [];
    const projection_commits: ProjectionCommitAuditEntry[] = [
      ...priorCommits,
      audit,
    ].slice(-PROJECTION_COMMIT_MAX_AUDIT_ENTRIES);

    const value: Change = {
      ...candidate,
      projection_revision: newRevision,
      projection_commits,
      state_revision: stateRevision ?? latest.state_revision,
    };

    // 8. Atomically persist while holding the lock.
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

    // 9. Re-read while still holding the lock.
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

    // 10. Verify revision increment and stored operation identity/state revision as a generic readback proof.
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

    // Command success is only reportable once the accepted monotonic revision
    // is committed AND verified in the durable projection: the readback must
    // carry this exact operation identity, payload hash and state revision.
    // Anything else downgrades to committed_unverified rather than success.
    // rq-projectionCommandProof01
    if (
      operationId &&
      (readback.projection_commits?.[readback.projection_commits.length - 1]
        ?.operation_id !== operationId ||
        (payloadHash !== undefined &&
          readback.projection_commits?.[readback.projection_commits.length - 1]
            ?.payload_hash !== payloadHash) ||
        (stateRevision !== undefined &&
          readback.projection_commits?.[readback.projection_commits.length - 1]
            ?.state_revision !== stateRevision))
    ) {
      return {
        kind: "committed_unverified",
        value,
        revision: newRevision,
        readback,
        audit,
        postconditionError: `Readback audit entry does not prove committed operation identity (operationId=${operationId}, payloadHash=${payloadHash}, stateRevision=${stateRevision}).`,
      };
    }

    if (
      stateRevision !== undefined &&
      (readback.state_revision ?? 0) !== stateRevision
    ) {
      return {
        kind: "committed_unverified",
        value,
        revision: newRevision,
        readback,
        audit,
        postconditionError: `Readback state_revision ${readback.state_revision ?? 0} does not match committed state_revision ${stateRevision}.`,
      };
    }

    // 11. Verify mutation-specific postcondition.
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

    if (afterCommit) {
      const afterResult = await afterCommit({
        latest,
        value,
        readback,
        audit,
        priorRevision,
        newRevision,
      });
      if (afterResult && "ok" in afterResult && afterResult.ok === false) {
        return {
          kind: "committed_unverified",
          value,
          revision: newRevision,
          readback,
          audit,
          postconditionError:
            afterResult.error ?? "afterCommit failed after committed snapshot.",
        };
      }
    }

    return {
      kind: "committed",
      value,
      revision: newRevision,
      readback,
      audit,
      idempotent: false,
    };
  } finally {
    if (releaseLock) {
      await releaseLock();
    }
  }
}
