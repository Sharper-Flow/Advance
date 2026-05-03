/**
 * Opaque session ID generator (T16 / KD-11 / AC-8).
 *
 * Returns an opaque session ID of the form `sess_<8 alphanumeric>`.
 *
 * Privacy-defensive future-proofing rationale (T3 user decision):
 * - Opaque IDs hide internal structure (PIDs, paths, timestamps) from
 *   peer-facing surfaces (`adv_session_list`, `adv_status` peer table).
 * - The `sess_` prefix gives the value a stable shape that callers can
 *   pattern-match against without assuming any internal structure.
 * - 8 alphanumeric characters from nanoid's URL-safe alphabet yields
 *   ~218 trillion combinations. Collision probability at solo-dev
 *   scale (single-process at a time, restart recovers) is negligible.
 *
 * Spec anchors: rq-multiSessionCoordination01, rq-worktreeRegistry01.
 */

import { nanoid } from "nanoid";

/**
 * Format: `sess_<8 alphanumeric chars from nanoid alphabet>`.
 *
 * Example: `sess_AbCdEfGh`.
 */
export function generateSessionId(): string {
  return `sess_${nanoid(8)}`;
}
