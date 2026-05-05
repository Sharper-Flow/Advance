/**
 * Agenda Domain Types
 *
 * Lightweight task contracts (without full spec ceremony).
 * Imports Gates schema from ./gates.
 */

import { z } from "zod";
import { GatesSchema } from "./gates";

// =============================================================================
// Agenda (Lightweight Task Contracts)
// =============================================================================

/**
 * Agenda item priority levels.
 * Used for quick task ordering without formal spec process.
 */
export const AgendaPrioritySchema = z.enum([
  "critical", // Must do immediately
  "high", // Should do soon
  "medium", // Normal priority
  "low", // Nice to have
  "backlog", // Future consideration
]);

export type AgendaPriority = z.infer<typeof AgendaPrioritySchema>;

/**
 * Agenda item status.
 */
export const AgendaStatusSchema = z.enum([
  "pending", // Not started
  "active", // Currently working on
  "blocked", // Waiting on something
  "done", // Completed
  "cancelled", // Won't do
]);

export type AgendaStatus = z.infer<typeof AgendaStatusSchema>;

/**
 * Agenda item - lightweight task without full spec ceremony.
 * Stored in JSONL format for easy append-only operations.
 */
export const AgendaItemSchema = z
  .object({
    /** Unique ID (ag-{nanoid}) */
    id: z.string(),
    /** Task description */
    title: z.string(),
    /** Optional detailed description or acceptance criteria */
    description: z.string().optional(),
    /** Priority level */
    priority: AgendaPrioritySchema.default("medium"),
    /** Current status */
    status: AgendaStatusSchema.default("pending"),
    /** Category/tag for grouping (e.g., "tests", "bugfix", "refactor") */
    category: z.string().optional(),
    /** Blocked by another agenda item ID */
    blocked_by: z.string().optional(),
    /** Created timestamp */
    created_at: z.string(),
    /** Started timestamp */
    started_at: z.string().optional(),
    /** Completed timestamp */
    completed_at: z.string().optional(),
    /** Completion notes or evidence */
    completion_notes: z.string().optional(),
    /** 7-gate quality checklist (optional, backwards compatible with migration) */
    gates: GatesSchema.optional(),
    /** Linked GitHub issue URLs (optional, backwards compatible) */
    github_issues: z.array(z.string().url()).optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type AgendaItem = z.infer<typeof AgendaItemSchema>;

/**
 * Agenda file metadata stored at top of JSONL.
 */
export const AgendaMetaSchema = z
  .object({
    type: z.literal("meta"),
    version: z.string().default("1.0"),
    created_at: z.string(),
    project: z.string().optional(),
  })
  .passthrough(); // Allow extra fields for forward/backward compatibility

export type AgendaMeta = z.infer<typeof AgendaMetaSchema>;

/**
 * Priority order for sorting (lower = higher priority).
 */
export const AGENDA_PRIORITY_ORDER: Record<AgendaPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  backlog: 4,
};
