/**
 * Epic Domain Types
 *
 * Epic, EpicEntry (change/shell), Epic progress summary, shell promotion
 * provenance, and optional change epic_membership projection.
 *
 * Spec citations:
 *   rq-epicEntity01 — Epic record is a typed structural container.
 *   rq-epicEntries01 — Epic roadmap supports linked changes and shell entries.
 *   rq-epicPromotion01 — Shell promotion preserves provenance.
 *   rq-epicCompactHistory01 — Terminal summary on change entries.
 *   rq-epicChangeContext01 — Change epic_membership projection.
 *   rq-epicOptionalMembership01 — Epic membership is optional.
 *   rq-epicOnePerChange01 — One Epic per change in v1.
 *   rq-epicProductScope01 — Epics can carry repo/product scope metadata.
 */

import { z } from "zod";

// =============================================================================
// Epic Status
// =============================================================================

// rq-epicEntity01: Epic lifecycle status is part of the compact progress summary.
export const EpicStatusSchema = z.enum(["active", "completed", "archived"]);
export type EpicStatus = z.infer<typeof EpicStatusSchema>;

// =============================================================================
// Epic Entry Kind
// =============================================================================

// rq-epicEntries01: entries are either linked changes or lightweight shells.
export const EpicEntryKindSchema = z.enum(["change", "shell"]);
export type EpicEntryKind = z.infer<typeof EpicEntryKindSchema>;

// =============================================================================
// Epic Scope / Product Identity
// =============================================================================

/**
 * Repo identity included in an Epic scope.
 *
 * rq-epicProductScope01 — product Epics can span multiple configured repos.
 */
export const EpicScopeRepoSchema = z.object({
  /** Product config repo ID. */
  repo_id: z.string(),
  /** ADV project ID for this repo. */
  repo_project_id: z.string(),
  /** Optional target path for reachable local/cross-project mutation. */
  path: z.string().optional(),
  /** Role in product Epic ownership/coordination. */
  role: z.enum(["primary", "secondary"]),
  /** Whether this repo is required for the Epic outcome. */
  required: z.boolean(),
});

export type EpicScopeRepo = z.infer<typeof EpicScopeRepoSchema>;

/**
 * Epic scope metadata. Optional on legacy Epics but validated when present.
 *
 * rq-epicProductScope01 — one owner Epic can contain entries from multiple repos.
 */
export const EpicScopeSchema = z.object({
  /** Repo-local Epic or product/multi-project Epic. */
  kind: z.enum(["repo", "product"]),
  /** ADV project ID that owns the Epic workflow. */
  owner_project_id: z.string(),
  /** Product config repo ID of the owner repo when known. */
  owner_repo_id: z.string().optional(),
  /** Repos covered by this Epic. */
  repos: z.array(EpicScopeRepoSchema),
});

export type EpicScope = z.infer<typeof EpicScopeSchema>;

// =============================================================================
// Shell Promotion Provenance
// =============================================================================

/**
 * Carried on a `change` entry when it was promoted from a shell row.
 * Preserves the original shell identity and intent for Epic history.
 *
 * rq-epicPromotion01 — promotion replaces the shell row and carries provenance.
 */
export const ShellPromotionProvenanceSchema = z.object({
  /** Entry ID of the shell row that was promoted. */
  shell_entry_id: z.string(),
  /** Title copied from the shell row at promotion time. */
  shell_title: z.string(),
  /** Rough success/AC hint copied from the shell row at promotion time. */
  shell_success_hint: z.string(),
  /** ISO8601 timestamp when promotion occurred. */
  promoted_at: z.string(),
  /** Identity that performed the promotion (e.g., agent or user). */
  promoted_by: z.string(),
  /** Change ID created by the promotion. */
  change_id: z.string(),
});

export type ShellPromotionProvenance = z.infer<
  typeof ShellPromotionProvenanceSchema
>;

// =============================================================================
// Epic Progress Summary
// =============================================================================

/**
 * Compact, computed status/progress snapshot for an Epic.
 * Stored as a projection so default views can render without full entry walks.
 *
 * rq-epicEntity01 — Epic record includes a compact status/progress summary.
 * rq-epicCompactHistory01 — summary drives bounded default views.
 * rq-epicNextWork01 — summary can inform next-work selection.
 */
export const EpicProgressSummarySchema = z.object({
  /** Coarse Epic lifecycle status. */
  status: EpicStatusSchema,
  /** Total number of entries (change + shell). */
  total_entries: z.number().int().min(0),
  /** Number of terminal child changes (archived/closed) or completed shells. */
  completed_entries: z.number().int().min(0),
  /** Number of entries currently in flight. */
  active_entries: z.number().int().min(0),
  /** Entry ID recommended as next work, or null when none. */
  next_entry_id: z.string().nullable(),
  /** ISO8601 timestamp when the summary was last computed. */
  updated_at: z.string(),
});

export type EpicProgressSummary = z.infer<typeof EpicProgressSummarySchema>;

// =============================================================================
// Epic Change Entry Reference
// =============================================================================

/**
 * Project-aware child change reference for repo/product Epic membership.
 *
 * rq-epicEntries01 — change entries reference one ADV change.
 * rq-epicProductScope01 — product Epic entries carry project/repo identity.
 */
export const EpicChangeRefSchema = z.object({
  /** ADV change ID. */
  change_id: z.string(),
  /** ADV project ID where the child change lives. */
  project_id: z.string(),
  /** Product config repo ID when known. */
  repo_id: z.string().optional(),
  /** Optional target path for cross-project mutation/enrichment. */
  target_path: z.string().optional(),
});

export type EpicChangeRef = z.infer<typeof EpicChangeRefSchema>;

/**
 * Projection lifecycle status for child membership sync.
 *
 * rq-epicErrors01 — partial/unreachable link states are typed and recoverable.
 */
export const EpicMembershipStatusSchema = z.enum([
  "linked",
  "projection_pending",
  "projection_stale",
  "target_unreachable",
  "unlinked",
  "terminal",
]);

export type EpicMembershipStatus = z.infer<typeof EpicMembershipStatusSchema>;

// =============================================================================
// Epic Entry
// =============================================================================

// rq-epicEntries01 — change entries reference one ADV change.
// rq-epicOrderAdvisory01 — order field carries advisory sequencing only.
const EpicChangeEntrySchema = z
  .object({
    kind: z.literal("change"),
    /** Stable entry ID within this Epic. */
    entry_id: z.string(),
    /** Advisory display order within the Epic roadmap. */
    order: z.number().int().min(0),
    /** Legacy same-project ADV change ID. */
    change_id: z.string().optional(),
    /** Project-aware ADV change reference for retrofit/product membership. */
    change_ref: EpicChangeRefSchema.optional(),
    /** Display title for the linked child entry. */
    title: z.string().optional(),
    /** Child projection/link lifecycle status. */
    membership_status: EpicMembershipStatusSchema.optional(),
    /** ISO8601 timestamp when this change was linked to the Epic. */
    linked_at: z.string().optional(),
    /** Identity that linked this change to the Epic. */
    linked_by: z.string().optional(),
    /** Evidence/audit text for retrofit/move membership. */
    link_evidence: z.string().optional(),
    /** Promotion provenance when this entry was converted from a shell. */
    promotion: ShellPromotionProvenanceSchema.optional(),
    /** Compact terminal summary for archived/closed children. */
    terminal_summary: z
      .object({
        status: z.enum(["archived", "closed"]),
        completed_at: z.string(),
      })
      .optional(),
  })
  .superRefine((entry, ctx) => {
    if (!entry.change_id && !entry.change_ref) {
      ctx.addIssue({
        code: "custom",
        message: "change entries require either change_id or change_ref",
        path: ["change_id"],
      });
    }

    if (entry.change_ref) {
      for (const key of [
        "title",
        "membership_status",
        "linked_at",
        "linked_by",
        "link_evidence",
      ] as const) {
        if (!entry[key]) {
          ctx.addIssue({
            code: "custom",
            message: `change_ref entries require ${key}`,
            path: [key],
          });
        }
      }
    }
  });

// rq-epicEntries01 — shell entries carry title + success hint.
const EpicShellEntrySchema = z.object({
  kind: z.literal("shell"),
  /** Stable entry ID within this Epic. */
  entry_id: z.string(),
  /** Advisory display order within the Epic roadmap. */
  order: z.number().int().min(0),
  /** Shell title displayed in Epic roadmap. */
  title: z.string(),
  /** Rough success/AC hint used during promotion and planning. */
  success_hint: z.string(),
});

export const EpicEntrySchema = z.discriminatedUnion("kind", [
  EpicChangeEntrySchema,
  EpicShellEntrySchema,
]);

export type EpicEntry = z.infer<typeof EpicEntrySchema>;

// =============================================================================
// Epic
// =============================================================================

/**
 * rq-epicEntity01 — typed Epic record.
 * rq-epicNoJiraClone01 — schema excludes assignee/estimate/sprint/board fields.
 * rq-epicErrors01 — version field enables stale-state detection on mutation.
 */
export const EpicSchema = z
  .object({
    /** Epic ID — same naming convention as ADV changes (camelCase title). */
    id: z.string(),
    /** Human-readable Epic title. */
    title: z.string(),
    /** Narrative context describing the initiative goal. */
    narrative: z.string(),
    /** Repo/product scope metadata. Optional for legacy Epics. */
    epic_scope: EpicScopeSchema.optional(),
    /** Ordered roadmap entries (changes and shells). */
    entries: z.array(EpicEntrySchema),
    /** Compact status/progress summary. */
    progress: EpicProgressSummarySchema,
    /** ISO8601 creation timestamp. */
    created_at: z.string(),
    /** ISO8601 last-update timestamp. */
    updated_at: z.string(),
    /** Optimistic-concurrency version for promotion/reorder safety. */
    version: z.number().int().min(0),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type Epic = z.infer<typeof EpicSchema>;

// =============================================================================
// Change Epic Membership Projection
// =============================================================================

/**
 * Optional projection on a child change for fast Epic context loading and
 * Visibility lookup. Mirrors the compact lineage shape of `fast_follow_of`.
 *
 * rq-epicChangeContext01 — change surfaces show compact Epic context.
 * rq-epicOptionalMembership01 — membership is optional and additive.
 * rq-epicOnePerChange01 — v1: one Epic per change (single object, not array).
 * rq-epicTemporalConstraints01 — epic_id feeds single-value Keyword index.
 */
export const EpicMembershipSchema = z.object({
  /** Parent Epic ID. */
  epic_id: z.string(),
  /** Entry ID within the Epic. */
  entry_id: z.string(),
  /** Advisory order within the Epic roadmap. */
  order: z.number().int().min(0),
  /** Display title for the entry (change or shell title). */
  title: z.string(),
  /** ISO8601 timestamp when this change was linked to the Epic. */
  linked_at: z.string(),
  /** ADV project ID that owns the Epic workflow. */
  epic_project_id: z.string().optional(),
  /** Product config repo ID for the child change when known. */
  repo_id: z.string().optional(),
  /** Operation that created the current membership projection. */
  source: z
    .enum(["create", "promote_shell", "link_existing", "move"])
    .optional(),
});

export type EpicMembership = z.infer<typeof EpicMembershipSchema>;
