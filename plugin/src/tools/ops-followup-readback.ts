/**
 * Ops follow-up compact readback helpers.
 *
 * Shared projection logic for list/WIP surfaces that need to expose linked
 * ops follow-up state without pulling full artifact hydration or agenda text
 * search. The full ops_followup profile remains the source of truth and is
 * served directly by adv_change_show.
 */
import type { OpsFollowupLink, OpsFollowupProfile, OpsRun } from "../types";

export type OpsFollowupStatusSource =
  | "child_profile"
  | "unreachable"
  | "parent_snapshot";

export type OpsFollowupCompletionProof =
  | "complete"
  | "incomplete"
  | "unverified"
  | "unreachable";

/** Bounded runbook/run summary for compact readback surfaces. */
export interface CompactOpsRunAnnotation {
  id: string;
  title: string;
  status: string;
  env: string;
  action: string;
  step_count: number;
  evidence_count: number;
  updated_at?: string;
}

/** Compact inbound ops follow-up annotation for summary surfaces. */
export interface CompactOpsFollowupAnnotation {
  kind: string;
  relationship: string;
  status: string;
  evidence_count: number;
  run_count?: number;
  run_evidence_count?: number;
  runs?: CompactOpsRunAnnotation[];
}

/** Fresh child-state proof projected onto an outbound link. */
export interface CompactOpsFollowupResolutionAnnotation {
  source: OpsFollowupStatusSource;
  status: string;
  verified_at: string;
  completion_proof: OpsFollowupCompletionProof;
  error?: string;
  evidence_summary?: string;
}

/** Compact outbound ops follow-up link annotation for summary surfaces. */
export interface CompactOpsFollowupLinkAnnotation {
  id: string;
  changeId: string;
  relationship: string;
  status: string;
  status_source: OpsFollowupStatusSource;
  completion_proof: OpsFollowupCompletionProof;
  required_handoff: boolean;
  target_path?: string;
  resolution?: CompactOpsFollowupResolutionAnnotation;
}

const COMPACT_RUN_LIMIT = 3;

function compactOpsRunAnnotation(run: OpsRun): CompactOpsRunAnnotation {
  return {
    id: run.id,
    title: run.title,
    status: run.status,
    env: run.plan.env,
    action: run.plan.action,
    step_count: run.steps?.length ?? 0,
    evidence_count: run.evidence?.length ?? 0,
    ...(run.updated_at ? { updated_at: run.updated_at } : {}),
  };
}

function runEvidenceCount(profile: OpsFollowupProfile): number {
  return (profile.runs ?? []).reduce(
    (count, run) => count + (run.evidence?.length ?? 0),
    0,
  );
}

function compactRuns(profile: OpsFollowupProfile): CompactOpsRunAnnotation[] {
  return (profile.runs ?? [])
    .slice(-COMPACT_RUN_LIMIT)
    .map(compactOpsRunAnnotation);
}

export function opsFollowupCompletionProof(
  link: OpsFollowupLink,
): OpsFollowupCompletionProof {
  const resolution = link.resolution;
  if (!resolution) return "unverified";
  if (resolution.source === "unreachable") return "unreachable";
  if (resolution.status !== "complete") return "incomplete";
  return resolution.completion_signal &&
    resolution.health_verification &&
    resolution.rollback_or_cleanup_disposition
    ? "complete"
    : "incomplete";
}

export function opsFollowupStatusSource(
  link: OpsFollowupLink,
): OpsFollowupStatusSource {
  return link.resolution?.source ?? "parent_snapshot";
}

export function compactOpsFollowupAnnotation(
  profile: OpsFollowupProfile | undefined,
): CompactOpsFollowupAnnotation | undefined {
  if (!profile) return undefined;
  const runCount = profile.runs?.length ?? 0;
  const totalRunEvidence = runEvidenceCount(profile);
  return {
    kind: profile.kind,
    relationship: profile.relationship,
    status: profile.status,
    evidence_count: profile.evidence?.length ?? 0,
    ...(runCount > 0
      ? {
          run_count: runCount,
          run_evidence_count: totalRunEvidence,
          runs: compactRuns(profile),
        }
      : {}),
  };
}

export function compactOpsFollowupLinkAnnotations(
  links: OpsFollowupLink[] | undefined,
): CompactOpsFollowupLinkAnnotation[] | undefined {
  if (!links || links.length === 0) return undefined;
  return links.map((link) => {
    const completionProof = opsFollowupCompletionProof(link);
    const statusSource = opsFollowupStatusSource(link);
    return {
      id: link.id,
      changeId: link.changeId,
      relationship: link.relationship,
      status: link.status,
      status_source: statusSource,
      completion_proof: completionProof,
      required_handoff: link.required_handoff,
      ...(link.target_path ? { target_path: link.target_path } : {}),
      ...(link.resolution
        ? {
            resolution: {
              source: statusSource,
              status: link.resolution.status,
              verified_at: link.resolution.verified_at,
              completion_proof: completionProof,
              ...(link.resolution.error
                ? { error: link.resolution.error }
                : {}),
              ...(link.resolution.evidence_summary
                ? { evidence_summary: link.resolution.evidence_summary }
                : {}),
            },
          }
        : {}),
    };
  });
}
