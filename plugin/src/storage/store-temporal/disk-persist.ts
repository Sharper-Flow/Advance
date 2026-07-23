/**
 * Disk-projection durability primitives for durable-mutation success gating.
 *
 * Background (change gateMutationSuccessDisk, Epic hardenTemporalReliability):
 * durable-mutation tools confirm the mutation in Temporal history + reducer
 * via signal→readback, but the disk projection — the SOLE readable source of
 * truth once a workflow orphans — was written fire-and-forget and its failure
 * swallowed at debug. So `success:true` could be returned while the mutation
 * was absent from every disk-first reader with no error.
 *
 * This module carries the small, structurally-testable core (P33) that turns a
 * classified disk-write outcome into an honest success/failure decision:
 *   - {@link DiskPersistOutcome} — the typed result of a projection write.
 *   - {@link assertDurablePersist} — the gate: a failed write throws.
 *   - {@link DiskProjectionPersistError} — the typed, ambiguity-carrying error.
 *
 * Scope note: this addresses the single-writer honesty side only. Concurrent-
 * session projection serialization (stale-overwrite / reseed-window races) is
 * deferred to the disk-authoritative Epic entry — see design.md.
 */

/**
 * Classified result of a single disk-projection write.
 *
 * - `persisted`: the atomic `change.json` write completed (awaited).
 * - `skipped`: intentionally not written (e.g. archived — the archive bundle
 *   is the durable snapshot); this is a success, not a failure.
 * - `failed`: the write threw. The Temporal signal was already acknowledged,
 *   so the mutation may be durable in history but is NOT on disk.
 */
export type DiskPersistOutcome =
  | { kind: "persisted" }
  | { kind: "skipped"; reason: "archived" }
  | { kind: "failed"; error: unknown };

/**
 * Typed error thrown when a durability-critical mutation's disk projection
 * write fails after its Temporal signal was already acknowledged.
 *
 * AC7 semantics: the mutation MAY be durable in Temporal history despite this
 * caller-visible failure, so the caller MUST NOT blind-retry — a blind retry
 * could double-apply. Reconcile via a fresh read instead.
 */
export class DiskProjectionPersistError extends Error {
  readonly changeId: string;
  override readonly cause: unknown;

  constructor(changeId: string, cause: unknown) {
    super(
      `Disk projection persist failed for change ${changeId}: the Temporal ` +
        `signal was acknowledged (the mutation may be durable in Temporal ` +
        `history) but the disk projection did NOT persist. Do not blind-retry ` +
        `— the mutation may already be applied; reconcile via a fresh read. ` +
        `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "DiskProjectionPersistError";
    this.changeId = changeId;
    this.cause = cause;
  }
}

/**
 * Durability gate: given a classified {@link DiskPersistOutcome}, throw a
 * {@link DiskProjectionPersistError} iff the write failed. `persisted` and
 * `skipped` are both durable-success states and never throw.
 *
 * This is the pure decision that makes `success:true` mean "durable in the
 * layer that survives orphaning" for durability-critical mutations.
 */
export function assertDurablePersist(
  changeId: string,
  outcome: DiskPersistOutcome,
): void {
  if (outcome.kind === "failed") {
    throw new DiskProjectionPersistError(changeId, outcome.error);
  }
}
