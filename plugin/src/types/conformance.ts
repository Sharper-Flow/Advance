/**
 * Conformance Domain Types
 *
 * Per-spec conformance lock state, audit log, and verdict tracking.
 * rq-confSource01, rq-confLock01, rq-confVerdict01,
 * rq-confArchiveGate01, rq-confOverride01, rq-confDegradation01.
 */

import { z } from "zod";

// =============================================================================
// Conformance State
//
// Per-spec conformance lock state + conformance-root path + audit log.
// Lives in external state at:
//   ~/.local/share/opencode/plugins/advance/{project-id}/conformance.json
// Pure opt-in backfill: every spec defaults conformance_required: false.
//
// Two location modes:
//   - "subfolder" (default): .adv/specs/_conformance/ inside the main repo.
//     Easy management, branch-local versioning, no bootstrap.
//   - "sibling" (opt-in via init mode flag): {project-parent}/advance-
//     conformance-{project-id}/. Stronger physical isolation; user manages
//     a separate repo.
// =============================================================================

export const ConformanceVerdictSchema = z.enum(["PASS", "DRIFT"]);
export type ConformanceVerdict = z.infer<typeof ConformanceVerdictSchema>;

export const ConformanceRootKindSchema = z.enum(["subfolder", "sibling"]);
export type ConformanceRootKind = z.infer<typeof ConformanceRootKindSchema>;

export const ConformanceLastVerdictSchema = z
  .object({
    verdict: ConformanceVerdictSchema,
    run_id: z.string(),
    ran_at: z.string(),
  })
  .passthrough();
export type ConformanceLastVerdict = z.infer<
  typeof ConformanceLastVerdictSchema
>;

export const ConformanceOverrideSchema = z
  .object({
    user: z.string(),
    reason: z.string(),
    re_verify_deadline: z.string(),
    applied_at: z.string(),
  })
  .passthrough();
export type ConformanceOverride = z.infer<typeof ConformanceOverrideSchema>;

export const ConformanceSpecEntrySchema = z
  .object({
    conformance_required: z.boolean(),
    locked: z.boolean(),
    locked_at: z.string().optional(),
    locked_at_archive: z.string().optional(),
    last_verdict: ConformanceLastVerdictSchema.optional(),
    overrides: z.array(ConformanceOverrideSchema).default([]),
  })
  .passthrough();
export type ConformanceSpecEntry = z.infer<typeof ConformanceSpecEntrySchema>;

export const ConformanceStateSchema = z
  .object({
    version: z.literal(1),
    conformance_root: z.string(),
    conformance_root_kind: ConformanceRootKindSchema,
    specs: z.record(z.string(), ConformanceSpecEntrySchema),
  })
  .passthrough();
export type ConformanceState = z.infer<typeof ConformanceStateSchema>;

/**
 * Empty conformance state used when conformance.json is missing.
 * Pure opt-in: every spec defaults to conformance_required: false.
 *
 * Defaults to "subfolder" kind for ease of management. Init action can
 * scaffold a "sibling" external repo when the user opts in.
 */
export const EMPTY_CONFORMANCE_STATE = (
  conformanceRoot: string,
  kind: ConformanceRootKind = "subfolder",
): ConformanceState => ({
  version: 1,
  conformance_root: conformanceRoot,
  conformance_root_kind: kind,
  specs: {},
});
