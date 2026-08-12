/**
 * Opaque session ID generator (T16 / KD-11 / AC-8).
 *
 * Returns an opaque session ID of the form `sess_<8 alphanumeric>`.
 *
 * Privacy-defensive future-proofing rationale (T3 user decision):
 * - Opaque IDs hide internal structure (PIDs, paths, timestamps) from
 *   peer-facing surfaces (`adv_change_show` sessions include, `adv_status` peer table).
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

/**
 * Runtime holder for the current process's session ID.
 *
 * Set once per plugin-init lifecycle by the host (plugin-init.ts) or
 * initialized by the host process.
 * Kept here — co-located with `generateSessionId` — so callers in any layer
 * can read it without importing plugin-init.ts (which would create an
 * import cycle, since plugin-init imports the storage layer).
 *
 * Spec anchors: rq-isolSessionTaskQueue01 (per-session task-queue routing),
 * rq-multiSessionCoordination01.
 */
let currentSessionId: string | undefined;

/** Set the runtime session ID. Called once per process at init. */
export function setCurrentSessionId(id: string | undefined): void {
  currentSessionId = id;
}

/**
 * Get the runtime session ID for this process, if set.
 *
 * Returns undefined before plugin-init has run (or in tests that don't
 * initialize the plugin). Callers that need a session-scoped value should
 * treat undefined as "fall back to project-scoped behavior" (KD-10).
 */
export function getCurrentSessionId(): string | undefined {
  return currentSessionId;
}
