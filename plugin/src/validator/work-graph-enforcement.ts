/**
 * D3 enforcement — mutation-time validation for work-graph edges.
 *
 * Enforces the D3 invariant: hard activation blocking at signal time only.
 * Called as a pre-flight at every edge-writing mutation ingress
 * (adv_epic_add_shell, adv_epic_promote_shell, adv_change_create).
 *
 * Combines edge validation (Phase C validateEdgeAdd) with nonterminal-prereq
 * checking (D3 — refuse creation/promotion if prereqs are nonterminal).
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase D
 */

import type { WorkNodeRef } from "../types/work-graph";
import {
  validateEdgeAdd,
  type EdgeValidationError,
} from "./work-graph-validation";

// =============================================================================
// Context
// =============================================================================

export interface D3EnforcementContext {
  /**
   * Resolve a WorkNodeRef to its terminal status.
   * - "terminal": archived/closed (prereq satisfied)
   * - "nonterminal": draft/open (prereq blocking)
   * - "unresolved": not found in scope
   */
  resolveTerminal: (
    ref: WorkNodeRef,
  ) => "terminal" | "nonterminal" | "unresolved";
  /** Get existing deps for a node key (for cycle detection). */
  getDeps: (key: string) => WorkNodeRef[];
  /** All resolvable node keys in scope. */
  resolvableNodeKeys: Set<string>;
}

// =============================================================================
// Result types
// =============================================================================

export type D3EnforcementError =
  | EdgeValidationError
  | { code: "SHELL_PREREQ_NONTERMINAL"; blocking_refs: WorkNodeRef[] }
  | { code: "DEP_PREREQ_NONTERMINAL"; blocking_refs: WorkNodeRef[] };

export type D3EnforcementResult =
  | { ok: true }
  | { ok: false; error: D3EnforcementError };

// =============================================================================
// Enforcers
// =============================================================================

/**
 * D3 enforcement for shell creation with blocked_by edges.
 *
 * Checks (in order):
 * 1. Edge validation (self/dup/unresolved/cycle) via validateEdgeAdd
 * 2. Nonterminal prereq check — ALL blocked_by targets must be terminal
 *
 * Used by adv_epic_add_shell.
 */
export function enforceD3ForShellAdd(
  sourceRef: WorkNodeRef,
  blockedBy: WorkNodeRef[],
  ctx: D3EnforcementContext,
): D3EnforcementResult {
  // Step 1: Edge validation.
  if (blockedBy.length > 0) {
    const edgeError = validateEdgeAdd(
      sourceRef,
      blockedBy,
      ctx.resolvableNodeKeys,
      ctx.getDeps,
    );
    if (edgeError) {
      return { ok: false, error: edgeError };
    }
  }

  // Step 2: Nonterminal prereq check.
  const blocking = checkNonterminalPrereqs(blockedBy, ctx);
  if (blocking.length > 0) {
    return {
      ok: false,
      error: {
        code: "SHELL_PREREQ_NONTERMINAL",
        blocking_refs: blocking,
      },
    };
  }

  return { ok: true };
}

/**
 * D3 enforcement for shell promotion.
 *
 * Checks: nonterminal prereq check — ALL blocked_by targets must be terminal
 * before the shell can be promoted to a change. Does NOT re-validate edges
 * (they were validated at shell-add time; D3 invariant).
 *
 * Used by adv_epic_promote_shell.
 */
export function enforceD3ForShellPromote(
  blockedBy: WorkNodeRef[],
  ctx: D3EnforcementContext,
): D3EnforcementResult {
  const blocking = checkNonterminalPrereqs(blockedBy, ctx);
  if (blocking.length > 0) {
    return {
      ok: false,
      error: {
        code: "SHELL_PREREQ_NONTERMINAL",
        blocking_refs: blocking,
      },
    };
  }

  return { ok: true };
}

/**
 * D3 enforcement for change creation with same_project_dependencies.
 *
 * Checks (in order):
 * 1. Edge validation (self/dup/unresolved/cycle) via validateEdgeAdd
 * 2. Nonterminal prereq check — ALL same_project_dependencies must be terminal
 *
 * Used by adv_change_create.
 *
 * AC5 invariant: enforcement is CREATE-time only. Once a change is active,
 * it passes gates normally even if a prereq's status changes.
 */
export function enforceD3ForChangeCreate(
  sourceRef: WorkNodeRef,
  sameProjectDeps: WorkNodeRef[],
  ctx: D3EnforcementContext,
): D3EnforcementResult {
  // Step 1: Edge validation.
  if (sameProjectDeps.length > 0) {
    const edgeError = validateEdgeAdd(
      sourceRef,
      sameProjectDeps,
      ctx.resolvableNodeKeys,
      ctx.getDeps,
    );
    if (edgeError) {
      return { ok: false, error: edgeError };
    }
  }

  // Step 2: Nonterminal prereq check.
  const blocking = checkNonterminalPrereqs(sameProjectDeps, ctx);
  if (blocking.length > 0) {
    return {
      ok: false,
      error: {
        code: "DEP_PREREQ_NONTERMINAL",
        blocking_refs: blocking,
      },
    };
  }

  return { ok: true };
}

// =============================================================================
// Private helpers
// =============================================================================

/**
 * Check if any prereq is nonterminal. Returns the list of blocking refs.
 */
function checkNonterminalPrereqs(
  prereqs: WorkNodeRef[],
  ctx: D3EnforcementContext,
): WorkNodeRef[] {
  const blocking: WorkNodeRef[] = [];
  for (const prereq of prereqs) {
    const status = ctx.resolveTerminal(prereq);
    if (status === "nonterminal" || status === "unresolved") {
      blocking.push(prereq);
    }
  }
  return blocking;
}
