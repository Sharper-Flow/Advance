/**
 * rq-creationRequestHash01 — Canonical creation-request hash and idempotency
 * decision for adv_change_create (tk-74c358188ffb, design D2 / AC4 / AC11).
 *
 * ## Why this exists
 *
 * `changeId` is derived deterministically from `summary` via
 * `generateChangeId`. That makes (projectId, changeId) the natural business
 * key — but two create calls can collapse to the same change ID even when
 * the user intent differs (capability, origin, parent linkage, etc.).
 *
 * The hash establishes the "same business key + same request" idempotency
 * invariant:
 *
 *   - same key + same hash  → idempotent match (retry / post-commit timeout)
 *   - same key + diff hash  → typed conflict (refuses before mutation)
 *
 * This closes the post-commit-timeout duplicate-creation defect class: a
 * workflow start that succeeds on the server but times out client-side no
 * longer silently masks the original request as "already started → reuse
 * handle". The retry now reconciles against the existing workflow's
 * `creation_request_hash` and either confirms idempotency or refuses.
 *
 * ## Canonicalization rules
 *
 * The hash covers only STABLE identity-bearing fields. Volatile fields are
 * stripped so a legitimate retry produces the same hash:
 *
 *   - `summary`            — always (it's the changeId seed)
 *   - `capability`         — always (free-text; different capabilities are
 *                            different requests even if summaries match)
 *   - `origin`             — full (kind, issue_number, source_artifact are
 *                            stable upstream linkage)
 *   - `fast_follow_of`     — `parent_change_id` only (linked_at is volatile)
 *   - `cross_project_origin` — `source_project`, `source_path`,
 *                            `source_change_id` (linked_at is volatile)
 *   - `epic_membership_seed` — `epic_id`, `entry_id`, `order`, `title`
 *                            (linked_at, epic_project_id are volatile/derived)
 *   - `scope_repos`        — full (repo identity is stable)
 *   - `same_project_dependencies` — full (edge identity is stable)
 *
 * Artifact content (proposal/agreement/design/...) is deliberately NOT
 * hashed — it has its own content-hash in workflow `state.documents`, and
 * including it here would make legitimate retry idempotency impossible if
 * a user tweaks a proposal between attempts.
 */
import { createHash } from "crypto";

/**
 * Stable input shape for hash computation. Volatile sub-fields are typed
 * as `unknown` and stripped by {@link canonicalize}.
 */
export interface CreationRequestHashInput {
  summary: string;
  capability?: string;
  origin?: unknown;
  fast_follow_of?: unknown;
  cross_project_origin?: unknown;
  scope_repos?: unknown;
  epic_membership_seed?: unknown;
  same_project_dependencies?: unknown;
}

/**
 * Stable canonicalization of `fast_follow_of` — drop `linked_at`.
 * Shape: `{ parent_change_id, linked_at }`.
 */
function canonicalFastFollowOf(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const v = value as { parent_change_id?: unknown };
  if (typeof v.parent_change_id !== "string") return null;
  return { parent_change_id: v.parent_change_id };
}

/**
 * Stable canonicalization of `cross_project_origin` — drop `linked_at`.
 */
function canonicalCrossProjectOrigin(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const v = value as {
    source_project?: unknown;
    source_path?: unknown;
    source_change_id?: unknown;
  };
  return {
    source_project:
      typeof v.source_project === "string" ? v.source_project : null,
    source_path: typeof v.source_path === "string" ? v.source_path : null,
    source_change_id:
      typeof v.source_change_id === "string" ? v.source_change_id : null,
  };
}

/**
 * Stable canonicalization of create-time `epic_membership` seed — drop
 * `linked_at` and `epic_project_id` (target-store-derived, not caller-supplied).
 */
function canonicalEpicMembershipSeed(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const v = value as {
    epic_id?: unknown;
    entry_id?: unknown;
    order?: unknown;
    title?: unknown;
  };
  return {
    epic_id: typeof v.epic_id === "string" ? v.epic_id : null,
    entry_id: typeof v.entry_id === "string" ? v.entry_id : null,
    order: typeof v.order === "number" ? v.order : null,
    title: typeof v.title === "string" ? v.title : null,
  };
}

/**
 * Build the canonical (deterministic) JSON-serializable record that feeds
 * the hash. Keys are emitted in a fixed order; undefined fields normalize
 * to `null` so JSON.stringify is stable.
 */
function canonicalize(
  input: CreationRequestHashInput,
): Record<string, unknown> {
  return {
    summary: input.summary,
    capability: typeof input.capability === "string" ? input.capability : null,
    origin: input.origin ?? null,
    fast_follow_of: canonicalFastFollowOf(input.fast_follow_of),
    cross_project_origin: canonicalCrossProjectOrigin(
      input.cross_project_origin,
    ),
    epic_membership_seed: canonicalEpicMembershipSeed(
      input.epic_membership_seed,
    ),
    scope_repos: input.scope_repos ?? null,
    same_project_dependencies: input.same_project_dependencies ?? null,
  };
}

/**
 * Compute the canonical creation-request hash (SHA-256 hex).
 *
 * Pure: equal inputs yield equal outputs. Stable across process restarts,
 * Temporal Continue-As-New, and replay.
 */
export function computeCreationRequestHash(
  input: CreationRequestHashInput,
): string {
  const canonical = canonicalize(input);
  // Sorted keys + undefined→null already enforced by canonicalize; the
  // replacer is a defensive belt-and-suspenders against future drift.
  const json = JSON.stringify(canonical, (_k, v) =>
    v === undefined ? null : v,
  );
  return createHash("sha256").update(json).digest("hex");
}

/**
 * Typed error code for a creation hash conflict. Stable across releases so
 * callers (tool layer, tests) can branch on it without parsing prose.
 */
export const CREATION_HASH_CONFLICT_CODE = "CREATION_HASH_CONFLICT" as const;

export type CreationIdempotencyDecision =
  | { kind: "first_creation" }
  | { kind: "idempotent_match" }
  | {
      kind: "hash_conflict";
      existing_hash: string;
      computed_hash: string;
    };

/**
 * Decide how a new create call reconciles with an existing projection's
 * `creation_request_hash`.
 *
 *   - no existing hash → `first_creation` (also applies to legacy workflows
 *     pre-dating this field; they get the new hash stamped on next mutation)
 *   - equal hashes     → `idempotent_match` (caller returns existing change)
 *   - differing hashes → `hash_conflict` (caller refuses before mutation)
 *
 * Pure: depends only on its arguments.
 */
export function resolveCreationIdempotency(args: {
  existingHash?: string;
  computedHash: string;
}): CreationIdempotencyDecision {
  const existing = args.existingHash;
  if (!existing || existing.length === 0) {
    return { kind: "first_creation" };
  }
  if (existing === args.computedHash) {
    return { kind: "idempotent_match" };
  }
  return {
    kind: "hash_conflict",
    existing_hash: existing,
    computed_hash: args.computedHash,
  };
}

/**
 * Typed Error class for creation hash conflicts. Carries the stable
 * {@link CREATION_HASH_CONFLICT_CODE} so callers can branch without
 * parsing message prose. The P1.4 rollback in `store-temporal/changes.ts`
 * keys off `error instanceof ChangeCreationHashConflictError` (or the code)
 * to remove the just-written disk scaffold before re-throwing.
 */
export class ChangeCreationHashConflictError extends Error {
  readonly code = CREATION_HASH_CONFLICT_CODE;
  readonly existingHash: string;
  readonly computedHash: string;
  readonly changeId: string;

  constructor(args: {
    changeId: string;
    existingHash: string;
    computedHash: string;
  }) {
    super(
      `Creation request hash conflict for change "${args.changeId}". ` +
        `A change with the same business key already exists with a different request. ` +
        `existing_hash=${args.existingHash.slice(0, 12)}… ` +
        `computed_hash=${args.computedHash.slice(0, 12)}…`,
    );
    this.name = "ChangeCreationHashConflictError";
    this.existingHash = args.existingHash;
    this.computedHash = args.computedHash;
    this.changeId = args.changeId;
  }
}
