/**
 * MCP server argument sanitization (DDC7).
 *
 * Rejects args that smell like cross-project mutation, approval bypass,
 * recovery override, signal-style mutation, or lifecycle mutation on the
 * ADV MCP read surface. The full contract below is enforced by the security
 * wrapper around every Tier-4 tool and `adv_handshake`.
 */

/** Exact arg names that must never be accepted by the MCP read surface. */
export const REJECTED_MUTATION_ARG_NAMES = [
  "project_root",
  "projectRoot",
  "target_path",
  "targetPath",
  "target_confirmed",
  "targetConfirmed",
  "approvedByUser",
  "approvalEvidence",
  "approval_evidence",
  "confirmationEvidence",
  "recoveryMode",
  "recoveryEvidence",
  "recovery_evidence",
  "userApproved",
  "closeIssue",
  "noCloseIssue",
  "supersededBy",
  "parent_change_id",
  "parentChangeId",
] as const;

/** Argument-key prefixes that are always rejected (e.g. any signal-shaped arg). */
export const REJECTED_ARG_PREFIXES = ["signal"] as const;

/** Values for `kind` or `action` args that imply mutation and are rejected. */
export const MUTATING_KIND_ACTION_VALUES = [
  "write",
  "init",
  "lock",
  "unlock",
  "override",
  "cancel",
  "close",
  "archive",
  "purge",
] as const;

export type RejectedMutationArg = string;

export interface RejectedMutationArgResult {
  rejected: true;
  arg: RejectedMutationArg;
}

export interface AcceptedArgsResult {
  rejected: false;
}

export type MutationArgCheck = RejectedMutationArgResult | AcceptedArgsResult;

function isRejectedArgName(key: string): boolean {
  const names = REJECTED_MUTATION_ARG_NAMES as readonly string[];
  if (names.includes(key)) return true;
  for (const prefix of REJECTED_ARG_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

function isMutatingKindOrAction(key: string, value: unknown): boolean {
  const lowerKey = key.toLowerCase();
  if (lowerKey !== "kind" && lowerKey !== "action") return false;
  const lowerValue = String(value).toLowerCase();
  return (MUTATING_KIND_ACTION_VALUES as readonly string[]).includes(
    lowerValue,
  );
}

/**
 * Check whether any argument key matches a mutation-shaped arg name, starts
 * with a rejected prefix, or carries a mutating `kind`/`action` value.
 * Returns the first rejected key found, or `{ rejected: false }`.
 */
export function rejectMutationShapedArgs(
  args: Record<string, unknown>,
): MutationArgCheck {
  for (const key of Object.keys(args)) {
    if (isRejectedArgName(key)) {
      return { rejected: true, arg: key };
    }
    if (isMutatingKindOrAction(key, args[key])) {
      return { rejected: true, arg: key };
    }
  }
  return { rejected: false };
}

/**
 * Format a rejected arg as the typed MCP text response required by DDC7.
 */
export function formatArgRejection(arg: string): string {
  return JSON.stringify({
    error: "ARG_REJECTED",
    code: "MUTATION_SHAPED_ARGUMENT",
    arg,
  });
}
