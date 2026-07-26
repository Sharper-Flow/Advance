import type { GateCompletion } from "../../types";

/**
 * Durable proof that a change's release gate can be considered complete for
 * archive convergence. Produced by `verifyReleaseGateDurableForArchive` and
 * consumed by the archive flow to materialize a canonical `status: "done"`
 * release gate projection.
 *
 * The reachability fields (`mergeCommitSha`, `pushStatus`, `route`) are carried
 * on the proof object rather than being overloaded onto `GateCompletion`, which
 * intentionally remains a schema-supported completion record.
 */
export type ReleaseGateProof =
  | {
      accepted: true;
      ok: true;
      source: "shipped-finalization" | "store" | "disk" | "evidence-match";
      finalizationStatus: string;
      /** Route-neutral SHA that proved the release reached the default branch. */
      releasedCommitSha?: string;
      mergeCommitSha?: string;
      pushStatus?: string;
      route?: string;
      /** Best-available done gate, or undefined when only the shipped proof exists. */
      gate?: GateCompletion;
    }
  | {
      accepted: false;
      ok: false;
      error: string;
      releaseGateStatus?: GateCompletion["status"];
      readinessBlockers?: GateCompletion["readiness_blockers"];
      stuckReason?: GateCompletion["stuck_reason"];
    };

/**
 * Materialize a schema-supported `status: "done"` release gate from an accepted
 * proof. Callers use this when the proof itself has no pre-existing done gate
 * (e.g. a freshly git-verified shipped finalization with both store and disk
 * projections still pending).
 */
export function releaseGateProofToCompletion(
  proof: Extract<ReleaseGateProof, { accepted: true }>,
): GateCompletion {
  if (proof.gate) {
    return proof.gate;
  }
  const details = [
    `Phase 9 finalization ${proof.finalizationStatus}`,
    proof.releasedCommitSha
      ? `releasedCommitSha=${proof.releasedCommitSha}`
      : null,
    proof.mergeCommitSha ? `mergeCommitSha=${proof.mergeCommitSha}` : null,
    proof.pushStatus ? `pushStatus=${proof.pushStatus}` : null,
    proof.route ? `route=${proof.route}` : null,
  ].filter((d): d is string => typeof d === "string");
  return {
    status: "done",
    completed_at: new Date().toISOString(),
    completed_by: "adv-archive",
    approval_evidence: details.join("; "),
  };
}

/**
 * Backward-compatible alias for code that predates the `ReleaseGateProof` name.
 */
export type DurableReleaseGateProofResult = ReleaseGateProof;
