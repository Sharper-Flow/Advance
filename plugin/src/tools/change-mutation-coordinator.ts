/**
 * Typed disk change-mutation coordinator.
 *
 * The disk projection is the only mutation authority. Every mutation is
 * applied to the latest projection under the storage-owned per-change lock,
 * then verified from the durable readback before the result is returned.
 */

import { commitChangeProjectionWithSummary } from "../storage/change-summary-shard";
import { refreshLauncherAggregateAfterCommit } from "../storage/launcher-projection";
import type { ProjectionCommitVerifyResult } from "../storage/change-projection-transaction";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { Change, ProjectionCommitAuditEntry } from "../types";

export interface DiskMutationAuthorization {
  /**
   * Whether this is an ordinary write or a repair. Defaults to `mutation`;
   * only the recovery writers pass `recovery`, so the projection audit trail
   * can still tell the two apart.
   */
  kind?: "mutation" | "recovery";
  reason: string;
  evidence: string;
}

export type MutationOutcome<T> =
  | {
      kind: "verified";
      value: T;
      revision: number;
      audit: ProjectionCommitAuditEntry;
    }
  | {
      kind: "unverified";
      reason: string;
      audit: ProjectionCommitAuditEntry;
    }
  | { kind: "stale_revision"; expected: number; actual: number }
  | { kind: "operator_required"; reason: string };

export interface MutationIntent {
  changeId: string;
  mutationKind: string;
  /** Apply the field-local mutation to the latest locked projection. */
  mutateLatestProjection: (latest: Change) => Change;
  /** Verify the intended postcondition against the durable readback. */
  verifyProjection: (readback: Change) => ProjectionCommitVerifyResult;
  /** Repair-only parser for a schema-invalid latest projection. */
  normalizeLatestProjection?: (value: unknown) => unknown;
}

interface CoordinateOptions {
  /** Evidence retained in the projection commit audit. */
  authority: DiskMutationAuthorization;
  intent: MutationIntent;
  changesDir?: string;
  expectedRevision?: number;
}

/**
 * Execute one mutation through the disk projection transaction.
 *
 * There is intentionally no authority resolver or external-runtime branch here:
 * callers cannot select another mutation path, and a missing projection
 * directory remains a fail-closed operator-required result.
 */
export async function coordinateChangeMutation<T>(
  options: CoordinateOptions,
): Promise<MutationOutcome<T>> {
  return executeDiskPath(options);
}

async function executeDiskPath<T>({
  authority,
  intent,
  changesDir,
  expectedRevision,
}: CoordinateOptions): Promise<MutationOutcome<T>> {
  if (!changesDir) {
    return {
      kind: "operator_required",
      reason: `Disk mutation for ${intent.changeId} requires a changesDir, but none was supplied.`,
    };
  }

  const operationId = `mutation:${intent.mutationKind}:${intent.changeId}:${randomUUID()}`;
  const payloadHash = createHash("sha256")
    .update(`${operationId}:${authority.reason}:${authority.evidence}`)
    .digest("hex");
  const commit = await commitChangeProjectionWithSummary({
    paths: {
      changesDir,
      summariesDir: join(dirname(changesDir), "summaries"),
    },
    changeId: intent.changeId,
    expectedRevision,
    operationId,
    payloadHash,
    authority: {
      kind: authority.kind ?? "mutation",
      reason: authority.reason,
      evidence: authority.evidence,
    },
    mutationKind: intent.mutationKind,
    mutateLatest: intent.mutateLatestProjection,
    normalizeLatestProjection: intent.normalizeLatestProjection,
    verify: ({ readback }) => intent.verifyProjection(readback),
  });

  if (
    (commit.kind === "committed" || commit.kind === "idempotent") &&
    commit.value &&
    commit.audit &&
    commit.revision !== undefined
  ) {
    // ADR 0009 piggyback replacement: best-effort aggregate launcher
    // projection refresh after every verified per-change commit. The old
    // Temporal writeChangeProjection activity rebuilt the aggregate here;
    // with Temporal gone this restores that automatic refresh on the
    // disk-only path. Awaited (not fire-and-forget) so the write completes
    // before the caller observes the commit — eliminates a TOCTOU race
    // where the async write could outlive a test's afterEach cleanup.
    // Best-effort: refreshLauncherAggregateAfterCommit swallows all errors
    // internally, so this await never fails the commit.
    await refreshLauncherAggregateAfterCommit(changesDir);
    return {
      kind: "verified",
      value: commit.value as T,
      revision: commit.revision,
      audit: commit.audit,
    };
  }
  if (commit.kind === "error" && commit.value && commit.audit) {
    return {
      kind: "unverified",
      reason: commit.error ?? "Summary projection publication failed.",
      audit: commit.audit,
    };
  }
  if (commit.kind === "conflict") {
    return {
      kind: "operator_required",
      reason: commit.error ?? "Projection summary commit conflicted.",
    };
  }
  return {
    kind: "operator_required",
    reason: commit.error ?? "Projection summary commit failed.",
  };
}
