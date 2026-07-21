/**
 * Resume Freshness resolver types.
 *
 * Foundational type definitions for the resume-freshness advisory emitted
 * at ADV Step 2 Load State when a resumed change's `lastActivityAgeMinutes`
 * exceeds the trigger band (default 60 minutes).
 *
 * Design: D1 (new module under `plugin/src/storage/`). Pure types only —
 * sub-resolver implementations live alongside in this module (added by
 * downstream tasks T2/T3/T4/T5).
 *
 * Contract references: AC2 (stable codes), C5 (pure helper extraction —
 * `intersectFileLists` lives in `plugin/src/utils/file-intersection.ts`,
 * not here), C7 (typed codes, no LLM labels).
 */

/**
 * Taxonomy label inherited verbatim from `/adv-coordinate` Phase 2-3
 * (`.opencode/command/adv-coordinate.md:101-108`). No new label space.
 *
 * - `repo_backed_fact`   — HIGH-confidence finding backed by repo evidence (commits, file overlap)
 * - `adv_backed_fact`    — HIGH-confidence finding backed by ADV state (active/archived changes)
 * - `judgment_call`      — MEDIUM-confidence finding; overlap exists but evidence is partial
 * - `freshness_limited`  — could not reach a conclusion; missing/stale evidence or budget exceeded
 */
export type ResumeFreshnessLabel =
  | "repo_backed_fact"
  | "adv_backed_fact"
  | "judgment_call"
  | "freshness_limited";

/**
 * Stable, machine-classifiable finding codes emitted by the resume-freshness
 * advisory. Greppable, testable, disjoint from other ADV code namespaces
 * (`archive:`, `cleanup:`, etc.) via the `resume:` prefix.
 *
 * - `resume:sibling_overlap`    — active sibling change touches same capability/paths
 * - `resume:archived_duplicate` — archive shipped since `lastActivityAt` overlaps scope
 * - `resume:codebase_drift`     — commits to task-referenced files since `lastActivityAt`
 * - `resume:freshness_limited`  — could not reach a conclusion (budget/evidence failure)
 */
export type ResumeFreshnessCode =
  | "resume:sibling_overlap"
  | "resume:archived_duplicate"
  | "resume:codebase_drift"
  | "resume:freshness_limited";

/**
 * Single advisory finding. Summary is human-readable; evidence fields are
 * machine-consumable and bounded (cap on counts enforced by resolver).
 */
export interface ResumeFreshnessFinding {
  code: ResumeFreshnessCode;
  label: ResumeFreshnessLabel;
  summary: string;
  /** Change IDs cited as evidence (siblings, archived duplicates). */
  evidenceChangeIds?: string[];
  /** File paths cited as evidence (overlapping paths, drifted paths). */
  evidencePaths?: string[];
}

/**
 * Resolver input. `lastActivityAgeMinutes` is already computed by
 * `plugin/src/tools/change.ts:831-849` for `adv_change_list` output —
 * resolver reuses, never recomputes.
 */
export interface ResumeFreshnessInput {
  lastActivityAgeMinutes: number;
  lastActivityAt: string;
}

/**
 * Resolver result.
 *
 * - `findings` may be empty even when `skipped` is false (stale change with no overlaps/drift).
 * - `skipped: true` means the trigger guard short-circuited (`lastActivityAgeMinutes <= 60`); no sub-resolver ran.
 * - `budgetExceededMs` is set iff the resolver exceeded its 8s wall-clock budget (DDC1).
 */
export interface ResumeFreshnessResult {
  findings: ResumeFreshnessFinding[];
  skipped: boolean;
  budgetExceededMs?: number;
}

/**
 * Compile-time exhaustiveness check helper. Use in switch statements over
 * `ResumeFreshnessCode` to ensure all codes are handled.
 */
export function assertExhaustiveCode(code: ResumeFreshnessCode): never {
  throw new Error(`Unhandled ResumeFreshnessCode: ${code}`);
}

/**
 * Compile-time exhaustiveness check helper for `ResumeFreshnessLabel`.
 */
export function assertExhaustiveLabel(label: ResumeFreshnessLabel): never {
  throw new Error(`Unhandled ResumeFreshnessLabel: ${label}`);
}
