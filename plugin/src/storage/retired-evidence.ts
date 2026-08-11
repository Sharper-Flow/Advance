/**
 * Single owner of the retired `evidence_kind` enum values.
 *
 * Repair of this residue class belongs to the schema-drift reconcile action
 * (`reconcile-action-schema-drift.ts`). Other modules import this set only to
 * *recognize* the residue — for classification, residue scanning, or
 * whitelisting a benign residual — never to tolerate it on a write path or to
 * run a parallel repair.
 */

export const RETIRED_EVIDENCE_VALUES: ReadonlySet<string> = new Set([
  "build_worker",
  "replay_determinism",
]);

/** True when `value` is a retired `evidence_kind` enum member. */
export function isRetiredEvidenceValue(value: unknown): value is string {
  return typeof value === "string" && RETIRED_EVIDENCE_VALUES.has(value);
}
