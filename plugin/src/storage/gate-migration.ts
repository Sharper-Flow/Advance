/**
 * Gate Migration
 *
 * Transforms old 6-gate model (research, prep, implementation, review, harden, signoff)
 * to new 7-gate model (proposal, discovery, design, planning, execution, acceptance, release).
 *
 * Migration is transparent — triggered on first gate access for old changes.
 */

import { GATE_DEFS, isGateSatisfied } from "../types";
import type { GateCompletion, Gates } from "../types";

type GateCollection = Partial<Record<string, GateCompletion>>;

/**
 * Old-to-new gate mapping.
 *
 * Each old gate maps to exactly one new gate.
 * signoff is absorbed into acceptance (if review is already mapped there, signoff
 * supplements it — if signoff was done, acceptance is also done).
 *
 * New gates without old counterparts (proposal, design) are handled separately.
 */
const GATE_MAP: Record<string, string> = {
  research: "discovery",
  prep: "planning",
  implementation: "execution",
  review: "acceptance",
  harden: "release",
  // signoff is absorbed — see migrateGates logic
};

/** Old gate IDs that indicate a pre-migration format */
const OLD_GATE_IDS = new Set([
  "research",
  "prep",
  "implementation",
  "review",
  "harden",
  "signoff",
]);

/** New gate IDs that indicate a post-migration format */
const NEW_GATE_IDS = new Set(GATE_DEFS.map((g) => g.id));

/** New gates that have no direct old counterpart (inserted as legacy/pending) */
const NEW_ONLY_GATES = ["proposal", "design"];

/**
 * Check if a gates object needs migration (has old-format gate IDs).
 */
export function needsGateMigration(
  gates: GateCollection | undefined | null,
): boolean {
  if (!gates) return false;
  const keys = Object.keys(gates);
  // If any old gate ID is present AND no new gate ID is present → needs migration
  const hasOldKeys = keys.some((k) => OLD_GATE_IDS.has(k));
  const hasNewKeys = keys.some((k) => NEW_GATE_IDS.has(k));
  return hasOldKeys && !hasNewKeys;
}

/**
 * Migrate old 6-gate format to new 7-gate format.
 *
 * Returns a new gates object with new gate IDs.
 * Preserves status, timestamps, and completed_by from old gates.
 * Adds migrated_from field for audit trail.
 */
export function migrateGates(oldGates: GateCollection): Gates {
  const now = new Date().toISOString();
  const result: Record<string, GateCompletion> = {};

  // Determine if the old change had any work done (to decide if new-only gates should be legacy)
  const anyOldGateSatisfied = Object.values(oldGates).some(
    (gate): gate is GateCompletion =>
      gate !== undefined && isGateSatisfied(gate),
  );

  // Step 1: Map old gates to new gates via GATE_MAP
  for (const [oldId, newId] of Object.entries(GATE_MAP)) {
    const oldGate = oldGates[oldId];
    if (!oldGate) continue;

    if (isGateSatisfied(oldGate)) {
      result[newId] = {
        status: oldGate.status,
        completed_at: oldGate.completed_at,
        completed_by: oldGate.completed_by,
        migrated_from: oldId,
      };
    } else {
      result[newId] = { status: "pending" };
    }
  }

  // Step 2: Handle signoff absorption into acceptance
  // If signoff was done AND review wasn't, acceptance should get signoff's data
  // If both were done, acceptance already has review's data (higher priority)
  const signoff = oldGates.signoff;
  if (
    signoff &&
    isGateSatisfied(signoff) &&
    !result.acceptance?.migrated_from
  ) {
    result.acceptance = {
      status: signoff.status,
      completed_at: signoff.completed_at,
      completed_by: signoff.completed_by,
      migrated_from: "signoff",
    };
  } else if (signoff && isGateSatisfied(signoff) && result.acceptance) {
    result.acceptance = {
      ...result.acceptance,
      absorbed_completions: [
        ...(result.acceptance.absorbed_completions ?? []),
        {
          gate_id: "signoff",
          status: signoff.status,
          completed_at: signoff.completed_at,
          completed_by: signoff.completed_by,
        },
      ],
    };
  }

  // Step 3: Insert new-only gates (proposal, design)
  for (const newId of NEW_ONLY_GATES) {
    if (anyOldGateSatisfied) {
      // Change predates these stages — mark as legacy
      result[newId] = {
        status: "legacy",
        completed_at: now,
        completed_by: "gate-migration",
        migrated_from: "none",
      };
    } else {
      // All old gates were pending — new gates start pending too
      result[newId] = { status: "pending" };
    }
  }

  // Step 4: Assemble in canonical order (derived from GATE_DEFS)
  const ordered = Object.fromEntries(
    GATE_DEFS.map((g) => [
      g.id,
      result[g.id] ?? { status: "pending" as const },
    ]),
  );

  return ordered as Gates;
}
