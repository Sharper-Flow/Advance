import type { GateCompletion } from "../types";

/**
 * Shared audited-recovery predicate for read/proof paths that must trust the
 * same compatibility and recovery_audit shapes.
 */
export function hasGateRecoveryAudit(
  gate: GateCompletion | undefined,
): boolean {
  const artifactEvidence = gate?.artifact_evidence as
    | { compatibility_reason?: unknown }
    | undefined;
  const recoveryAudit = gate?.recovery_audit as
    | { reason?: unknown; evidence?: unknown }
    | undefined;

  return (
    typeof artifactEvidence?.compatibility_reason === "string" ||
    typeof recoveryAudit?.reason === "string" ||
    typeof recoveryAudit?.evidence === "string"
  );
}
