/**
 * MCP server argument sanitization (AC6 minimum).
 *
 * Rejects args that smell like cross-project mutation or approval-bypass
 * surfaces. The full DDC7 contract is implemented in task tk-0c486f2813ef;
 * this file only enforces the minimum set required by AC6.
 */

/** Arg names that must never be accepted by the MCP read surface. */
export const REJECTED_MUTATION_ARG_NAMES = [
  "project_root",
  "projectRoot",
  "target_path",
  "approvedByUser",
  "approvalEvidence",
  "approval_evidence",
  "confirmationEvidence",
] as const;

export type RejectedMutationArg = (typeof REJECTED_MUTATION_ARG_NAMES)[number];

export interface RejectedMutationArgResult {
  rejected: true;
  arg: RejectedMutationArg;
}

export interface AcceptedArgsResult {
  rejected: false;
}

export type MutationArgCheck = RejectedMutationArgResult | AcceptedArgsResult;

/**
 * Check whether any argument key matches a mutation-shaped arg name.
 * Returns the first rejected key found, or `{ rejected: false }`.
 */
export function rejectMutationShapedArgs(
  args: Record<string, unknown>,
): MutationArgCheck {
  for (const key of Object.keys(args)) {
    if (REJECTED_MUTATION_ARG_NAMES.includes(key as RejectedMutationArg)) {
      return { rejected: true, arg: key as RejectedMutationArg };
    }
  }
  return { rejected: false };
}

/**
 * Format a rejected arg as the typed MCP text response required by AC6.
 */
export function formatArgRejection(arg: string): string {
  return JSON.stringify({
    error: "ARG_REJECTED",
    code: "MUTATION_SHAPED_ARGUMENT",
    arg,
  });
}
