/**
 * Typed disk change-mutation coordinator.
 *
 * The disk projection is the only mutation authority. Every mutation is
 * applied to the latest projection under the storage-owned per-change lock,
 * then verified from the durable readback before the result is returned.
 */

import {
  commitChangeProjection,
  type ProjectionCommitOutcome,
  type ProjectionCommitVerifyResult,
} from "../storage/change-projection-transaction";
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

  const commit = await commitChangeProjection({
    changesDir,
    changeId: intent.changeId,
    expectedRevision,
    authority: {
      kind: authority.kind ?? "mutation",
      reason: authority.reason,
      evidence: authority.evidence,
    },
    mutationKind: intent.mutationKind,
    mutateLatest: intent.mutateLatestProjection,
    verify: ({ readback }) => intent.verifyProjection(readback),
  });

  return mapCommitOutcome(commit) as MutationOutcome<T>;
}

type CommitMappedOutcome =
  | Extract<MutationOutcome<unknown>, { kind: "verified" }>
  | Extract<MutationOutcome<unknown>, { kind: "unverified" }>
  | Extract<MutationOutcome<unknown>, { kind: "stale_revision" }>
  | Extract<MutationOutcome<unknown>, { kind: "operator_required" }>;

function mapCommitOutcome(
  commit: ProjectionCommitOutcome,
): CommitMappedOutcome {
  switch (commit.kind) {
    case "committed":
      return {
        kind: "verified",
        value: commit.readback,
        revision: commit.revision,
        audit: commit.audit,
      };
    case "committed_unverified":
      return {
        kind: "unverified",
        reason: commit.postconditionError,
        audit: commit.audit,
      };
    case "stale_revision":
      return {
        kind: "stale_revision",
        expected: commit.expected,
        actual: commit.actual,
      };
    case "lock_timeout":
      return {
        kind: "operator_required",
        reason: `Projection lock timeout at ${commit.lockPath} (${commit.timeoutMs}ms).`,
      };
    case "schema_error":
      return {
        kind: "operator_required",
        reason: `Projection schema error: ${commit.error}`,
      };
    case "write_error":
      return {
        kind: "operator_required",
        reason: `Projection write error: ${commit.error}`,
      };
    case "state_regression":
      return {
        kind: "operator_required",
        reason: `Projection state regression: expected ${commit.expected}, actual ${commit.actual}.`,
      };
    case "state_revision_conflict":
      return {
        kind: "operator_required",
        reason: `Projection state revision conflict at ${commit.stateRevision}: ${commit.reason}`,
      };
    case "operation_conflict":
      return {
        kind: "operator_required",
        reason: `Projection operation conflict for ${commit.operationId}: payload hash differs.`,
      };
    case "operator_required":
      return { kind: "operator_required", reason: commit.reason };
    default:
      return {
        kind: "operator_required",
        reason: `Projection commit returned unhandled outcome kind ${(commit as { kind: string }).kind}.`,
      };
  }
}
