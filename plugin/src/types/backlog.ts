/**
 * Repo Backlog Domain Types
 *
 * In-repo JSONL store for future work items that are not yet ready for an
 * active Epic or ADV change.
 */

import { z } from "zod";

import { FutureWorkContextPacketSchema } from "./future-work";

export const CURRENT_SCHEMA_VERSION = 1;

// =============================================================================
// Backlog Item Status
// =============================================================================

export const BacklogItemStatusSchema = z.enum(["active", "archived"]);
export type BacklogItemStatus = z.infer<typeof BacklogItemStatusSchema>;

// =============================================================================
// Promotion Target
// =============================================================================

export const BacklogPromotionTargetSchema = z.object({
  kind: z.enum(["change", "epic_shell"]),
  id: z.string().min(1),
  promoted_at: z.string().min(1),
});

export type BacklogPromotionTarget = z.infer<
  typeof BacklogPromotionTargetSchema
>;

// =============================================================================
// Backlog Item
// =============================================================================

export const BacklogItemSchema = z.object({
  /** Stable backlog item ID. */
  id: z.string().min(1),
  /** Display title. */
  title: z.string().min(1),
  /** Rough success/AC hint used during promotion and planning. */
  success_hint: z.string().min(1),
  /** Item lifecycle status. */
  status: BacklogItemStatusSchema,
  /** ISO8601 timestamp when the item was created. */
  created_at: z.string().min(1),
  /** ISO8601 timestamp when the item was last updated. */
  updated_at: z.string().min(1),
  /** ISO8601 timestamp when the item was archived, if applicable. */
  archived_at: z.string().min(1).optional(),
  /** Promotion target, set when the item is promoted. */
  promoted_to: BacklogPromotionTargetSchema.optional(),
  /** Optional durable future-work context packet for promotion planning. */
  context_packet: FutureWorkContextPacketSchema.optional(),
});

export type BacklogItem = z.infer<typeof BacklogItemSchema>;

// =============================================================================
// Backlog Header
// =============================================================================

export const BacklogHeaderSchema = z.object({
  schemaVersion: z.number().int().min(0),
});

export type BacklogHeader = z.infer<typeof BacklogHeaderSchema>;

// =============================================================================
// Backlog Read Result
// =============================================================================

export interface BacklogMalformedLine {
  /** 1-based line number in the JSONL file. */
  line: number;
  /** Raw line content. */
  raw: string;
  /** Human-readable error message. */
  error: string;
}

export interface BacklogReadResult {
  header: BacklogHeader;
  items: BacklogItem[];
  /** Latest record per item id, in insertion order. */
  latestItems: BacklogItem[];
  malformed: BacklogMalformedLine[];
}

// =============================================================================
// Read Options
// =============================================================================

export interface BacklogReadOptions {
  /** Limit reads to the last N item lines for very large files. */
  tailLimit?: number;
  /** Include archived items in the result. */
  includeArchived?: boolean;
  /** Resolve latest record per item id. Default true. */
  latestOnly?: boolean;
}
