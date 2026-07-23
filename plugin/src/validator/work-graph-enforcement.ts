/**
 * D3 enforcement — mutation-time validation for work-graph edges.
 *
 * Enforces the D3 invariant: hard activation blocking at signal time only.
 * Called as a pre-flight at every edge-writing mutation ingress
 * (adv_epic_add_shell, adv_epic_promote_shell, adv_change_create).
 *
 * Combines edge validation (Phase C validateEdgeAdd) with activation-time
 * nonterminal-prereq checking (D3 — refuse promotion/creation of an active
 * change if prerequisites are nonterminal).
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase D
 */

import { basename } from "node:path";
import type { WorkNodeRef } from "../types/work-graph";
import type { Store } from "../storage/store-types";
import {
  validateEdgeAdd,
  nodeRefKey,
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
 * Shells may be recorded before their prerequisites complete. D3 blocking is
 * deliberately deferred to promotion, when the shell becomes an active change.
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
// Store-backed context builder
// =============================================================================

/**
 * Build a D3EnforcementContext from a Store by loading all changes + Epics.
 *
 * This is the single live-integration point between the pure enforcement
 * functions and the storage layer. It is called at mutation time (shell add,
 * shell promote, change create) so every edge write is validated against the
 * current dependency graph.
 */
export async function buildD3ContextFromStore(
  store: Store,
): Promise<D3EnforcementContext> {
  const changeList =
    typeof store.changes.list === "function"
      ? await store.changes.list({ includeArchived: true, includeClosed: true })
      : { changes: [] };
  const epicList =
    typeof store.epics.list === "function"
      ? await store.epics.list({ status: "all" })
      : [];

  const inferredProjectId = store.paths.external ?? store.paths.root ?? "";

  // Load full change records (list only gives summaries).
  const changes: {
    id: string;
    key: string;
    ref: WorkNodeRef;
    terminal: boolean;
    deps: WorkNodeRef[];
  }[] = [];
  for (const summary of changeList.changes) {
    const full = await store.changes.get(summary.id);
    const change = full.success && full.data ? full.data : null;
    if (!change) continue; // Skip changes we cannot load for validation.
    const projectId =
      change.adv_project_id ??
      (inferredProjectId ? basename(inferredProjectId) : "");
    const ref: WorkNodeRef = {
      kind: "change",
      project_id: projectId,
      change_id: change.id,
    };
    const terminal =
      change.status === "archived" ||
      change.status === "closed" ||
      change.lifecycleState === "archived" ||
      change.lifecycleState === "closed";
    changes.push({
      id: change.id,
      key: nodeRefKey(ref),
      ref,
      terminal,
      deps: change.same_project_dependencies ?? [],
    });
  }

  const epics: {
    id: string;
    entries: {
      entryId: string;
      key: string;
      ref: WorkNodeRef;
      terminal: boolean;
      deps: WorkNodeRef[];
    }[];
  }[] = [];
  for (const epic of epicList) {
    const entries: (typeof epics)[number]["entries"] = [];
    for (const entry of epic.entries ?? []) {
      const ref: WorkNodeRef = {
        kind: "epic_entry",
        epic_id: epic.id,
        entry_id: entry.entry_id,
      };
      const terminal =
        entry.kind === "change" && entry.terminal_summary?.status != null;
      const deps = entry.kind === "shell" ? (entry.blocked_by ?? []) : [];
      entries.push({
        entryId: entry.entry_id,
        key: nodeRefKey(ref),
        ref,
        terminal,
        deps,
      });
    }
    epics.push({ id: epic.id, entries });
  }

  const resolvableNodeKeys = new Set<string>();
  for (const c of changes) resolvableNodeKeys.add(c.key);
  for (const e of epics) {
    for (const entry of e.entries) resolvableNodeKeys.add(entry.key);
  }

  const allDeps = new Map<string, WorkNodeRef[]>();
  for (const c of changes) allDeps.set(c.key, c.deps);
  for (const e of epics) {
    for (const entry of e.entries) allDeps.set(entry.key, entry.deps);
  }

  const getDeps = (key: string): WorkNodeRef[] => allDeps.get(key) ?? [];

  const resolveTerminal = (
    ref: WorkNodeRef,
  ): "terminal" | "nonterminal" | "unresolved" => {
    const key = nodeRefKey(ref);
    if (!resolvableNodeKeys.has(key)) return "unresolved";

    const change = changes.find((c) => c.key === key);
    if (change) return change.terminal ? "terminal" : "nonterminal";

    for (const e of epics) {
      const entry = e.entries.find((ent) => ent.key === key);
      if (entry) return entry.terminal ? "terminal" : "nonterminal";
    }

    return "unresolved";
  };

  return {
    resolveTerminal,
    getDeps,
    resolvableNodeKeys,
  };
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
