import { z } from "zod";

/**
 * Shared evidence-policy vocabulary used by contract items, review-matrix rows,
 * and tasks. Keeps the policy surface consistent across obligation defaulting,
 * completion proof, and acceptance review.
 */
export const ContractEvidencePolicySchema = z.enum([
  "test",
  "review",
  "static_check",
  "design_proof",
  "not_applicable",
  "source_citation",
  "source_audit",
  "rubric_review",
  "stakeholder_acceptance",
  "artifact_reference",
]);

export type ContractEvidencePolicy = z.infer<
  typeof ContractEvidencePolicySchema
>;
