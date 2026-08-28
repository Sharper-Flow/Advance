/**
 * Briefing Packet Types
 *
 * Generated read projections that compose existing ADV structured state into
 * bounded, lane-specific prompt slices. No live packet state is persisted.
 */

import { z } from "zod";
import {
  getSubagentReportPacketAnchors,
  type PersistedSubagentReportAgent,
  SubagentAgentSchema,
} from "./subagent-reports";

export const BRIEFING_PACKET_LANE_SCHEMA_VERSION = "1.0";
export const BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH = 200;

export const BriefingPacketLaneSchema = z.enum([
  "researcher",
  "engineer",
  "designer",
  "reviewer",
  "scanner",
  "verifier",
  "visual_review",
  "archive",
]);

export type BriefingPacketLane = z.infer<typeof BriefingPacketLaneSchema>;

export const BRIEFING_PACKET_LANE_TO_AGENT: Record<
  Exclude<BriefingPacketLane, "archive">,
  PersistedSubagentReportAgent
> = {
  researcher: "adv-researcher",
  engineer: "adv-engineer",
  designer: "adv-designer",
  reviewer: "adv-reviewer",
  scanner: "adv-scanner-bundle",
  verifier: "adv-verification-triage-bundle",
  visual_review: "adv-visual-review",
};

/**
 * Exhaustive, discriminated grant-source descriptors for every briefing lane.
 *
 * - `manifest` lanes are backed by an agent manifest key in AGENT_TOOL_POLICY.
 * - `virtual` lanes are orchestrator-submitted bundle identities (scanner /
 *   verifier) and do NOT have independent manifests.
 * - `archive` is a terminal read lane with no worker manifest grant.
 */
export interface ManifestLaneDescriptor {
  readonly kind: "manifest";
  /** Agent manifest key in AGENT_TOOL_POLICY. */
  readonly agent: string;
}

export interface VirtualLaneDescriptor {
  readonly kind: "virtual";
  /** Orchestrator-submitted bundle identity; no independent manifest. */
  readonly bundle: "adv-scanner-bundle" | "adv-verification-triage-bundle";
}

export interface ArchiveLaneDescriptor {
  readonly kind: "archive";
}

export type BriefingPacketLaneDescriptor =
  | ManifestLaneDescriptor
  | VirtualLaneDescriptor
  | ArchiveLaneDescriptor;

export const BRIEFING_PACKET_LANE_DESCRIPTORS: Readonly<
  Record<BriefingPacketLane, BriefingPacketLaneDescriptor>
> = {
  researcher: { kind: "manifest", agent: "adv-researcher" },
  engineer: { kind: "manifest", agent: "adv-engineer" },
  designer: { kind: "manifest", agent: "adv-designer" },
  reviewer: { kind: "manifest", agent: "adv-reviewer" },
  scanner: { kind: "virtual", bundle: "adv-scanner-bundle" },
  verifier: { kind: "virtual", bundle: "adv-verification-triage-bundle" },
  visual_review: { kind: "manifest", agent: "adv-visual-review" },
  archive: { kind: "archive" },
};

export const BriefingFactOutcomeSchema = z.enum([
  "transient_prompt_context",
  // retireAgendaWorkflow: replaces the retired "agenda" label. Facts carrying
  // this outcome are source-attributed report follow-up metadata; promotion
  // happens only via adv_followup_promote and
  // never by writing into an unowned queue.
  "report_follow_up",
  "wisdom_candidate",
  "spec_delta_candidate",
  "epic_terminal_note",
  "archive_only_evidence",
  "unresolved_action",
  "research_citation",
]);

export type BriefingFactOutcome = z.infer<typeof BriefingFactOutcomeSchema>;

/**
 * Bounded rendering cap for `research_citation` facts derived from a single
 * `adv-researcher` report's `sources` array. The first
 * RESEARCH_CITATION_RENDER_LIMIT sources render as durable facts in stable
 * report order; any remaining sources are summarized by exactly one
 * deterministic omission marker (source_label `sources.omitted`).
 *
 * The bound is structural, not a heuristic ranking: order is preserved and
 * no sources are dropped silently. See strengthenAgentEvidence AC4/SC3/C5/DONT4.
 */
export const RESEARCH_CITATION_RENDER_LIMIT = 3;

export const BriefingFactSchema = z
  .object({
    id: z.string().min(1),
    outcome: BriefingFactOutcomeSchema,
    source_label: z.string().min(1),
    source_ref: z.string().min(1).optional(),
    content: z.string().min(1),
    dispositioned: z.boolean().default(false),
  })
  .strict();

export type BriefingFact = z.infer<typeof BriefingFactSchema>;

export const BriefingPacketSectionKindSchema = z.enum([
  "identity_anchors",
  "scope",
  "contract",
  "tasks",
  "affected_files",
  "epic_context",
  "verification_expectations",
  "durable_facts",
  "unavailable_state",
  "archive_digest",
]);

export type BriefingPacketSectionKind = z.infer<
  typeof BriefingPacketSectionKindSchema
>;

export const BriefingPacketSectionSchema = z
  .object({
    kind: BriefingPacketSectionKindSchema,
    source_label: z.string().min(1),
    content: z.unknown(),
    unavailable_warning: z.string().optional(),
  })
  .strict();

export type BriefingPacketSection = z.infer<typeof BriefingPacketSectionSchema>;

export const BriefingPacketSchema = z
  .object({
    schema_version: z.literal(BRIEFING_PACKET_LANE_SCHEMA_VERSION),
    change_id: z.string().min(1),
    lane: BriefingPacketLaneSchema,
    generated_at: z.string().datetime().optional(),
    sections: z.array(BriefingPacketSectionSchema).max(20),
    facts: z.array(BriefingFactSchema).max(100),
    unavailable_markers: z.array(z.string().min(1)).default([]),
    session_metadata: z
      .object({
        generated_by: z
          .string()
          .min(1)
          .max(BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH)
          .optional(),
        audit_only: z.literal(true),
      })
      .optional(),
  })
  .strict();

export type BriefingPacket = z.infer<typeof BriefingPacketSchema>;

/**
 * Derive the strict identity anchors for a worker lane from the sub-agent
 * report field-source authority.
 */
export function getBriefingPacketLaneAnchors(
  lane: Exclude<BriefingPacketLane, "archive">,
): string[] {
  if (!(lane in BRIEFING_PACKET_LANE_TO_AGENT)) {
    throw new Error(`Archive lane has no worker identity anchors`);
  }
  const agent = BRIEFING_PACKET_LANE_TO_AGENT[lane];
  return getSubagentReportPacketAnchors(agent);
}

/**
 * Archive-lane anchors are deterministic and terminal-state focused. The
 * archive lane is not a persisted worker lane.
 */
export function getBriefingPacketArchiveAnchors(): string[] {
  return ["CHANGE", "STATUS", "TERMINAL_GATE_SUMMARY"];
}

// Static validation: every non-archive lane maps to a known persisted agent.
const _laneAgentTypeCheck: Record<
  Exclude<BriefingPacketLane, "archive">,
  (typeof SubagentAgentSchema.options)[number]
> = BRIEFING_PACKET_LANE_TO_AGENT;
void _laneAgentTypeCheck;
