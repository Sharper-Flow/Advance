/**
 * Ops follow-up compact readback helpers.
 *
 * Shared projection logic for list/WIP surfaces that need to expose linked
 * ops follow-up state without pulling full artifact hydration or agenda text
 * search. The full ops_followup profile remains the source of truth and is
 * served directly by adv_change_show.
 */
import type { OpsFollowupLink, OpsFollowupProfile } from "../types";

/** Compact inbound ops follow-up annotation for summary surfaces. */
export interface CompactOpsFollowupAnnotation {
  kind: string;
  relationship: string;
  status: string;
  evidence_count: number;
}

/** Compact outbound ops follow-up link annotation for summary surfaces. */
export interface CompactOpsFollowupLinkAnnotation {
  id: string;
  changeId: string;
  relationship: string;
  status: string;
  required_handoff: boolean;
  target_path?: string;
}

export function compactOpsFollowupAnnotation(
  profile: OpsFollowupProfile | undefined,
): CompactOpsFollowupAnnotation | undefined {
  if (!profile) return undefined;
  return {
    kind: profile.kind,
    relationship: profile.relationship,
    status: profile.status,
    evidence_count: profile.evidence?.length ?? 0,
  };
}

export function compactOpsFollowupLinkAnnotations(
  links: OpsFollowupLink[] | undefined,
): CompactOpsFollowupLinkAnnotation[] | undefined {
  if (!links || links.length === 0) return undefined;
  return links.map((link) => ({
    id: link.id,
    changeId: link.changeId,
    relationship: link.relationship,
    status: link.status,
    required_handoff: link.required_handoff,
    ...(link.target_path ? { target_path: link.target_path } : {}),
  }));
}
