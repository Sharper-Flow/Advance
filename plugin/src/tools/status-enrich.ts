/**
 * status-enrich
 *
 * Extracted from status.ts — pure move, no behavior change.
 */

import { basename } from "path";
import type { Store } from "../storage/store";
import { mapWithConcurrency } from "../utils/concurrency";
import {
  createDefaultGates,
  GATE_ORDER,
  isGateSatisfied,
  type Change,
  type GateId,
  type ChangeRecency,
} from "../types";
import { getCommandsByGate } from "../manifest";
import { type WorkflowDirective } from "../utils/workflow-directive";
import {
  buildChangeContextSnapshot,
  buildChangeContextTicker,
} from "../utils/context-snapshot";
import { readArtifact } from "./change/artifacts";
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { buildExternalDependencyStatus } from "./external-dependency-status";
import { resolveResumeFreshness } from "../storage/resume-freshness-resolver";
import { RESUME_FRESHNESS_TRIGGER_MINUTES } from "../storage/resume-freshness-resolver";
import {
  statusRecommendationToString,
  type StatusRecommendationItem,
} from "./status-recommendations";
import {
  buildResumeProjection,
  type ChangeNodeInput,
  type EpicNodeInput,
  type EpicEntryInput,
} from "../projection/resume-projection";
import type { WorkNodeRef } from "../types/work-graph";

export interface StatusSummaryOmissions {
  recentChanges: number;
  recommendations: number;
}

export interface StatusRecommendationCarrier {
  recommendations: string[];
  recommendation_items?: StatusRecommendationItem[];
}

export type RecommendationTarget = string[] | StatusRecommendationCarrier;

export function recommendationArray(target: RecommendationTarget): string[] {
  return Array.isArray(target) ? target : target.recommendations;
}

export function pushStatusRecommendation(
  target: RecommendationTarget,
  item: StatusRecommendationItem,
): void {
  recommendationArray(target).push(statusRecommendationToString(item));
  if (!Array.isArray(target)) {
    target.recommendation_items = [
      ...(target.recommendation_items ?? []),
      item,
    ];
  }
}
// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a `next_gate` status recommendation from the authoritative workflow
 * directive. The directive's `action` owns the gate + command; the manifest is
 * only a fallback for actions that carry a gate but no command (blocked /
 * approval). Returns null for archived directives (no forward gate) or when no
 * actionable gate is present.
 *
 * This is the single next-action projection shared with gate status and the
 * context snapshot.
 */
export function buildNextGateRecommendationFromDirective(input: {
  directive: WorkflowDirective;
  changeId: string;
  parentContext?: string;
  minutesSinceActivity?: number;
}): StatusRecommendationItem | null {
  const { directive, changeId, parentContext, minutesSinceActivity } = input;
  const action = directive.action;

  if (action.kind === "archived") return null;
  const gateId = action.gateId as GateId | undefined;
  if (!gateId) return null;

  const command = action.command ?? getCommandsByGate(gateId)[0]?.name ?? null;

  const title = parentContext
    ? `Change \`${changeId}\` (fast-follow of \`${parentContext}\`)`
    : `Change \`${changeId}\``;
  const actionText = command
    ? `run \`/${command} ${changeId}\``
    : "review gate status";
  const message = command
    ? `${title}: next gate is \`${gateId}\` → run \`/${command} ${changeId}\``
    : `${title}: next gate is \`${gateId}\` → review gate status`;

  return {
    kind: "next_gate",
    priority: gateId === "release" ? "high" : "medium",
    changeId,
    gateId,
    title,
    detail: `next gate is \`${gateId}\``,
    action: actionText,
    source: "gate",
    minutesSinceActivity,
    message,
  };
}

/**
 * Request-local resolution context for status enrichment
 * (fixChangeListTimeouts KD4 / AC4). When `change` is present, enrichment
 * MUST reuse it — including its proposal document projection — instead of
 * issuing a duplicate per-change read. `resolvedChanges` lets
 * fast-follow parent context resolve from the same request-local map;
 * store reads remain the fallback for entries the request never resolved
 * (e.g. an archived parent outside the active candidate set).
 */
export interface StatusResolvedChangeContext {
  change?: Change;
  resolvedChanges?: ReadonlyMap<string, Change>;
}

export interface StatusEnrichmentOptions {
  /** Absolute request cutoff shared by all non-health enrichment reads. */
  cutoffAt?: number;
  signal?: AbortSignal;
}

function enrichmentWithinBudget(options?: StatusEnrichmentOptions): boolean {
  return (
    !options?.signal?.aborted &&
    (options?.cutoffAt === undefined || Date.now() < options?.cutoffAt)
  );
}

export async function getFastFollowParentContext(
  store: Store,
  parentChangeId: string,
  resolvedChanges?: ReadonlyMap<string, Change>,
): Promise<string> {
  const fromMap = resolvedChanges?.get(parentChangeId);
  if (fromMap) {
    const terminal =
      fromMap.status === "archived" || fromMap.status === "closed";
    return terminal ? `${parentChangeId} (${fromMap.status})` : parentChangeId;
  }
  const parent = await store.changes.get(parentChangeId);
  if (parent.success && parent.data) {
    const terminal =
      parent.data.status === "archived" || parent.data.status === "closed";
    return terminal
      ? `${parentChangeId} (${parent.data.status})`
      : parentChangeId;
  }
  return parentChangeId;
}
export async function enrichRecentChangeStatus(
  rc: ChangeRecency,
  status: StatusRecommendationCarrier,
  store: Store,
  clarifyMode: string,
  isPrimary: boolean,
  resolved?: StatusResolvedChangeContext,
  options?: StatusEnrichmentOptions,
): Promise<void> {
  if (!enrichmentWithinBudget(options)) return;
  const changeId = String(rc.id);
  let changeData: Change;
  let proposalText: string;
  if (resolved?.change) {
    // AC4: the request already hydrated this change record — reuse it to
    // avoid a second store.changes.get. Proposal content still goes through
    // readArtifact so it follows the authority chain (projection → disk →
    // archive bundle) regardless of which path loaded the Change record.
    changeData = resolved.change;
    proposalText =
      (await readArtifact(store, changeId, "proposal"))?.content ?? "";
  } else {
    const changeResult = await store.changes.get(changeId);
    if (!enrichmentWithinBudget(options)) {
      return;
    }
    if (!changeResult.success || !changeResult.data) return;
    changeData = changeResult.data;
    // Read the proposal from disk/archive via readArtifact; null result means
    // no proposal content — use
    // empty string for snapshot rendering (status output is read-only).
    proposalText =
      (await readArtifact(store, changeId, "proposal"))?.content ?? "";
    if (!enrichmentWithinBudget(options)) return;
  }

  const gates = changeData.gates ?? createDefaultGates();

  // Authoritative next-action projection shared with gate status and the
  // The disk projection is the sole source for the next open gate.
  const fallbackNextGate = GATE_ORDER.find(
    (gateId) => gates[gateId]?.status !== "done",
  ) as GateId | undefined;

  const snapshotInput = {
    change: changeData,
    proposalText,
    gates: gates ?? undefined,
    workdir: store.paths.root,
  };

  // Resume Freshness (D9b): compute resolver result ONLY for primary candidates
  // to bound cost (DDC8: at most once per adv_status call). Non-primary path
  // uses ticker which never invokes resolver.
  let resumeFreshnessInput:
    | {
        findings: { code: string; label: string; summary: string }[];
        skipped: boolean;
      }
    | undefined;
  if (isPrimary) {
    try {
      if (!enrichmentWithinBudget(options)) return;
      // Prefer rc.lastActivityAt (already-enriched recency field); fall back to
      // changeData.lastActivityAt. If neither present, treat as fresh (no resolver).
      const lastActivityAt =
        (rc as unknown as { lastActivityAt?: string }).lastActivityAt ??
        (changeData as unknown as { lastActivityAt?: string }).lastActivityAt;
      if (lastActivityAt) {
        const lastActivityAgeMinutes = Math.floor(
          (Date.now() - new Date(lastActivityAt).getTime()) / 60000,
        );
        if (lastActivityAgeMinutes > RESUME_FRESHNESS_TRIGGER_MINUTES) {
          const result = await resolveResumeFreshness(store, changeId, {
            lastActivityAgeMinutes,
            lastActivityAt,
          });
          if (!enrichmentWithinBudget(options)) return;
          resumeFreshnessInput = {
            findings: result.findings,
            skipped: result.skipped,
          };
          // Surface close+supersede suggestion when single HIGH-conf archived dup
          appendResumeFreshnessRecommendation(
            status,
            changeId,
            resumeFreshnessInput,
          );
        }
      }
    } catch {
      // Degrade gracefully — no Freshness line on resolver failure.
    }
  }

  Object.assign(rc, {
    parent_change_id: changeData.fast_follow_of?.parent_change_id,
    epic: changeData.epic_membership
      ? {
          id: changeData.epic_membership.epic_id,
          title: changeData.epic_membership.title,
          entry_id: changeData.epic_membership.entry_id,
        }
      : undefined,
    _contextSnapshot: isPrimary
      ? buildChangeContextSnapshot({
          ...snapshotInput,
          ...(resumeFreshnessInput
            ? { resumeFreshness: resumeFreshnessInput }
            : {}),
        })
      : buildChangeContextTicker(snapshotInput),
  });

  if (!enrichmentWithinBudget(options)) return;
  const dependencyStatus = await buildExternalDependencyStatus(
    changeData.external_dependencies,
  );
  if (!enrichmentWithinBudget(options)) return;
  if (dependencyStatus) {
    (rc as unknown as Record<string, unknown>)._externalDependencyStatus =
      dependencyStatus.summary;
  }

  const nextGate = fallbackNextGate;

  appendClarifyRecommendation(
    status,
    clarifyMode,
    changeData,
    proposalText,
    changeId,
  );
  appendRecencyRecommendation(
    status,
    rc,
    changeId,
    undefined,
    nextGate as GateId | undefined,
  );
}
export function appendClarifyRecommendation(
  recommendations: RecommendationTarget,
  clarifyMode: string,
  change: Parameters<typeof runClarifyReadinessChecks>[0],
  proposalText: string,
  changeId?: string,
): void {
  const resolvedChangeId = changeId ?? change.id;
  if (clarifyMode === "off") return;

  // Suppress clarify recommendations once every gate is satisfied — the change
  // is archive-eligible (or already archived) and ambiguity findings are no
  // longer actionable. See GH issue #14.
  const gates = change.gates;
  if (gates && GATE_ORDER.every((g) => isGateSatisfied(gates[g]))) return;

  const clarifyResult = runClarifyReadinessChecks(change, proposalText);
  if (clarifyResult.findings.length === 0) return;

  const message = `⚠️ Change \`${resolvedChangeId}\` has ${clarifyResult.findings.length} ambiguity finding(s) — run \`/adv-clarify ${resolvedChangeId}\` to resolve`;
  pushStatusRecommendation(recommendations, {
    kind: "clarify",
    priority: "high",
    changeId: resolvedChangeId,
    title: `Change \`${resolvedChangeId}\` has ambiguity finding(s)`,
    detail: `${clarifyResult.findings.length} finding(s)`,
    action: `run \`/adv-clarify ${resolvedChangeId}\``,
    source: "clarify",
    message,
  });
}

export function appendRecencyRecommendation(
  recommendations: RecommendationTarget,
  rc: ChangeRecency & { workerSessionId?: string },
  changeId: string,
  currentSessionId?: string,
  nextGate?: GateId,
): void {
  const minutesSinceActivity = Number(rc.minutesSinceActivity ?? 0);
  if (minutesSinceActivity >= 180) {
    const hours = Math.floor(minutesSinceActivity / 60);
    const label =
      hours >= 24 ? `${Math.floor(hours / 24)}d ago` : `${hours}h ago`;
    const message = nextGate
      ? `⏰ Stale change \`${changeId}\` (last activity ${label}, ${rc.completedTasks}/${rc.taskCount} tasks done) — resume from listed \`${nextGate}\` gate action`
      : `⏰ Stale change \`${changeId}\` (last activity ${label}, ${rc.completedTasks}/${rc.taskCount} tasks done) — review current gate status before resuming`;
    pushStatusRecommendation(recommendations, {
      kind: "stale",
      priority: "medium",
      changeId,
      gateId: nextGate,
      title: `Stale change \`${changeId}\``,
      detail: `last activity ${label}, ${rc.completedTasks}/${rc.taskCount} tasks done`,
      action: nextGate
        ? `resume from listed \`${nextGate}\` gate action`
        : "review current gate status before resuming",
      source: "recency",
      minutesSinceActivity,
      message,
    });
    return;
  }

  if (minutesSinceActivity <= 60) {
    const isSelfOwned =
      Boolean(currentSessionId) && rc.workerSessionId === currentSessionId;
    const message = isSelfOwned
      ? `🔥 Change \`${changeId}\` is hot (active ${minutesSinceActivity}m ago) — you are the active worker`
      : `🔥 Change \`${changeId}\` is hot (active ${minutesSinceActivity}m ago) — likely in-flight by another agent`;
    pushStatusRecommendation(recommendations, {
      kind: "next_gate",
      priority: "low",
      changeId,
      gateId: nextGate,
      title: `Hot change \`${changeId}\``,
      detail: `active ${minutesSinceActivity}m ago`,
      action: isSelfOwned
        ? "continue active work"
        : "coordinate with peer worker",
      source: "recency",
      minutesSinceActivity,
      message,
    });
  }
}

/**
 * T8: Append a one-command close+supersede recommendation when the resolver
 * found EXACTLY ONE HIGH-confidence (label `repo_backed_fact`) archived
 * duplicate. Implements AC11 + D8 (clarified wording: "one-command accept,
 * copy-paste and run"; NEVER "one-click" or implying button-click).
 *
 * Read-only — never calls adv_change_close. The user must run the snippet
 * themselves with their own approval evidence.
 *
 * Emits nothing when: zero HIGH-confidence findings, multiple HIGH-confidence
 * findings (ambiguous), or when resumeFreshness is skipped.
 */
export function appendResumeFreshnessRecommendation(
  recommendations: RecommendationTarget,
  changeId: string,
  resumeFreshness: {
    findings: Array<{
      code: string;
      label: string;
      summary: string;
      evidenceChangeIds?: string[];
    }>;
    skipped: boolean;
  },
): void {
  if (resumeFreshness.skipped) return;

  const highConfidenceArchivedDups = resumeFreshness.findings.filter(
    (f) =>
      f.code === "resume:archived_duplicate" && f.label === "repo_backed_fact",
  );

  // AC11: only fire on EXACTLY ONE HIGH-confidence finding (avoid noise when
  // ambiguous). Zero or multiple → no recommendation.
  if (highConfidenceArchivedDups.length !== 1) return;

  const finding = highConfidenceArchivedDups[0];
  const archivedDupId = finding.evidenceChangeIds?.[0];
  if (!archivedDupId) return;

  const snippet = `adv_change_close changeId: ${archivedDupId} reason: "superseded" supersededBy: ${changeId} approvedByUser: true approvalEvidence: "resume:archived_duplicate HIGH-confidence overlap detected"`;

  // D8 wording guard: NEVER use "one-click" or imply button-click auto-execution.
  // Always: "one-command accept (copy-paste and run)" + explicit
  // "ADV does not auto-execute close."
  const message = `🔍 Possible duplicate: archived \`${archivedDupId}\` may have already shipped this scope. To close it as superseded (ADV does not auto-execute close), copy and run:\n\n  ${snippet}`;

  pushStatusRecommendation(recommendations, {
    kind: "next_gate",
    priority: "high",
    changeId,
    title: `Possible duplicate: ${archivedDupId}`,
    detail: finding.summary,
    action: "review overlap; one-command accept (copy-paste and run)",
    source: "resume_freshness",
    message,
  });
}

export const _test = {
  appendRecencyRecommendation,
  appendResumeFreshnessRecommendation,
};
export async function filterRecentChangesForProductScope(
  recentChanges: ChangeRecency[],
  store: Store,
  scope: "repo" | "product" | undefined,
  resolvedChanges?: ReadonlyMap<string, Change>,
): Promise<ChangeRecency[]> {
  const productContext = store.productContext;
  if (!productContext || productContext.mode === "single_repo") {
    return recentChanges;
  }
  if (scope === "product") return recentChanges;

  const scoped: ChangeRecency[] = [];
  for (const change of recentChanges) {
    // Request-local map first (AC4); store read is the fallback for
    // entries the request never resolved.
    const fromMap = resolvedChanges?.get(String(change.id));
    if (fromMap) {
      if (!fromMap.scope_repos?.length) {
        scoped.push(change);
        continue;
      }
      if (
        fromMap.scope_repos.some(
          (repo) => repo.repo_id === productContext.currentRepoId,
        )
      ) {
        scoped.push(change);
      }
      continue;
    }
    const full = await store.changes.get(String(change.id));
    if (!full.success || !full.data?.scope_repos?.length) {
      scoped.push(change);
      continue;
    }
    if (
      full.data.scope_repos.some(
        (repo) => repo.repo_id === productContext.currentRepoId,
      )
    ) {
      scoped.push(change);
    }
  }
  return scoped;
}

export function buildProductContextOutput(
  store: Store,
  scope: "repo" | "product" | undefined,
): Record<string, unknown> | undefined {
  const context = store.productContext;
  if (!context || context.mode === "single_repo") return undefined;
  return {
    productId: context.productId,
    productProjectId: context.productProjectId,
    currentRepoId: context.currentRepoId,
    repoProjectId: context.repoProjectId,
    primaryRepoId: context.primaryRepoId,
    mode: context.mode,
    scope: scope ?? "repo",
    ...(context.degraded !== undefined && { degraded: context.degraded }),
    ...(context.readOnly !== undefined && { readOnly: context.readOnly }),
    ...(context.warning !== undefined && { warning: context.warning }),
  };
}
export function capRecommendations(
  status: { recommendations: string[] },
  limit: number,
  label: string,
): number {
  const omitted = Math.max(0, status.recommendations.length - limit);
  if (omitted === 0) return 0;
  status.recommendations = [
    ...status.recommendations.slice(0, limit),
    `… ${omitted} additional recommendation(s) omitted from ${label} view — use view:"changes", view:"hygiene", or view:"health" for details.`,
  ];
  return omitted;
}

// =============================================================================
// Request-owned immutable candidate enrichment patches
// (fixHealthViewTimeouts SC5 / AC7 / AC9 / AC10)
// =============================================================================

export interface CandidateEnrichmentPatch {
  /** Canonical change ID this patch belongs to. */
  changeId: string;
  /** Rank in the source-ranked candidate list; reduction is ordered by rank. */
  rank: number;
  /** Additive candidate fields (never a full replacement). */
  candidate: Record<string, unknown>;
  /** Recommendations contributed by this candidate. */
  recommendations: StatusRecommendationItem[];
  /** Outcome compatible with the _health_execution source-outcome schema. */
  outcome: {
    kind: "ok" | "stale" | "timeout" | "error" | "unavailable" | "not_admitted";
    elapsedMs: number;
    evidence?: string;
  };
}

export interface CandidateEnrichmentInput {
  rc: ChangeRecency;
  store: Store;
  clarifyMode: string;
  isPrimary: boolean;
  resolved?: StatusResolvedChangeContext;
  /** Absolute cutoff time (ms since epoch) shared by all request-local reads. */
  cutoffAt: number;
  signal?: AbortSignal;
  /** Source-ranked position used for deterministic reduction. */
  rank: number;
}

export interface CandidateEnrichmentReductionInput {
  patches: CandidateEnrichmentPatch[];
  candidates: ChangeRecency[];
  status: StatusRecommendationCarrier;
}

function notAdmittedPatch(
  changeId: string,
  rank: number,
  start: number,
  evidence: string,
): CandidateEnrichmentPatch {
  return {
    changeId,
    rank,
    candidate: {},
    recommendations: [],
    outcome: {
      kind: "not_admitted",
      elapsedMs: Math.max(0, Date.now() - start),
      evidence,
    },
  };
}

export async function buildCandidateEnrichmentPatch(
  input: CandidateEnrichmentInput,
): Promise<CandidateEnrichmentPatch> {
  const start = Date.now();
  const {
    rc,
    store,
    clarifyMode,
    isPrimary,
    resolved,
    cutoffAt,
    signal,
    rank,
  } = input;
  const changeId = String(rc.id);

  if (signal?.aborted) {
    return notAdmittedPatch(changeId, rank, start, "request aborted");
  }
  if (Date.now() >= cutoffAt) {
    return notAdmittedPatch(changeId, rank, start, "execution cutoff");
  }

  try {
    let changeData: Change;
    let proposalText: string;

    if (resolved?.change) {
      changeData = resolved.change;
      proposalText =
        (await readArtifact(store, changeId, "proposal"))?.content ?? "";
    } else {
      const changeResult = await store.changes.get(changeId);
      if (signal?.aborted || Date.now() >= cutoffAt) {
        return notAdmittedPatch(changeId, rank, start, "execution cutoff");
      }
      if (!changeResult.success || !changeResult.data) {
        return notAdmittedPatch(changeId, rank, start, "change not found");
      }
      changeData = changeResult.data;
      proposalText =
        (await readArtifact(store, changeId, "proposal"))?.content ?? "";
      if (signal?.aborted || Date.now() >= cutoffAt) {
        return notAdmittedPatch(changeId, rank, start, "execution cutoff");
      }
    }

    const gates = changeData.gates ?? createDefaultGates();

    const fallbackNextGate = GATE_ORDER.find(
      (gateId) => gates[gateId]?.status !== "done",
    ) as GateId | undefined;

    const snapshotInput = {
      change: changeData,
      proposalText,
      gates: gates ?? undefined,
      workdir: store.paths.root,
    };

    // Resume Freshness (D9b): primary-only invocation to bound cost (DDC8).
    let candidateResumeFreshness:
      | {
          findings: { code: string; label: string; summary: string }[];
          skipped: boolean;
        }
      | undefined;
    if (isPrimary) {
      try {
        const lastActivityAt =
          (rc as unknown as { lastActivityAt?: string }).lastActivityAt ??
          (changeData as unknown as { lastActivityAt?: string }).lastActivityAt;
        if (lastActivityAt) {
          const lastActivityAgeMinutes = Math.floor(
            (Date.now() - new Date(lastActivityAt).getTime()) / 60000,
          );
          if (lastActivityAgeMinutes > RESUME_FRESHNESS_TRIGGER_MINUTES) {
            const result = await resolveResumeFreshness(store, changeId, {
              lastActivityAgeMinutes,
              lastActivityAt,
            });
            if (signal?.aborted || Date.now() >= cutoffAt) {
              return notAdmittedPatch(
                changeId,
                rank,
                start,
                "execution cutoff",
              );
            }
            candidateResumeFreshness = {
              findings: result.findings,
              skipped: result.skipped,
            };
          }
        }
      } catch {
        // Degrade gracefully.
      }
    }

    const candidate: Record<string, unknown> = {
      parent_change_id: changeData.fast_follow_of?.parent_change_id,
      epic: changeData.epic_membership
        ? {
            id: changeData.epic_membership.epic_id,
            title: changeData.epic_membership.title,
            entry_id: changeData.epic_membership.entry_id,
          }
        : undefined,
      _contextSnapshot: isPrimary
        ? buildChangeContextSnapshot({
            ...snapshotInput,
            ...(candidateResumeFreshness
              ? { resumeFreshness: candidateResumeFreshness }
              : {}),
          })
        : buildChangeContextTicker(snapshotInput),
    };

    if (signal?.aborted || Date.now() >= cutoffAt) {
      return notAdmittedPatch(changeId, rank, start, "execution cutoff");
    }

    const dependencyStatus = await buildExternalDependencyStatus(
      changeData.external_dependencies,
    );
    if (signal?.aborted || Date.now() >= cutoffAt) {
      return notAdmittedPatch(changeId, rank, start, "execution cutoff");
    }
    if (dependencyStatus) {
      candidate._externalDependencyStatus = dependencyStatus.summary;
    }

    const nextGate = fallbackNextGate;

    const localStatus: StatusRecommendationCarrier = { recommendations: [] };

    // Surface close+supersede suggestion for single HIGH-conf archived dup
    if (candidateResumeFreshness) {
      appendResumeFreshnessRecommendation(
        localStatus,
        changeId,
        candidateResumeFreshness,
      );
    }

    appendClarifyRecommendation(
      localStatus,
      clarifyMode,
      changeData,
      proposalText,
      changeId,
    );
    appendRecencyRecommendation(
      localStatus,
      rc,
      changeId,
      undefined,
      nextGate as GateId | undefined,
    );

    return {
      changeId,
      rank,
      candidate,
      recommendations: localStatus.recommendation_items ?? [],
      outcome: {
        kind: "ok",
        elapsedMs: Math.max(0, Date.now() - start),
      },
    };
  } catch (err) {
    const evidence = err instanceof Error ? err.message : String(err);
    return {
      changeId,
      rank,
      candidate: {},
      recommendations: [],
      outcome: {
        kind: "error",
        elapsedMs: Math.max(0, Date.now() - start),
        evidence: evidence.slice(0, 200),
      },
    };
  }
}

export function applyCandidateEnrichmentPatches(
  input: CandidateEnrichmentReductionInput,
): {
  candidates: ChangeRecency[];
  recommendations: number;
  omittedCount: number;
  omittedSample: string[];
} {
  const { patches, candidates, status } = input;
  const candidateMap = new Map(candidates.map((c) => [String(c.id), c]));
  const sortedPatches = [...patches].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.changeId.localeCompare(b.changeId);
  });

  let recommendations = 0;
  let omittedCount = 0;
  const omittedSample: string[] = [];

  for (const patch of sortedPatches) {
    if (patch.outcome.kind === "ok" || patch.outcome.kind === "stale") {
      const candidate = candidateMap.get(patch.changeId);
      if (candidate) {
        Object.assign(candidate, patch.candidate);
      }
      for (const item of patch.recommendations) {
        pushStatusRecommendation(status, item);
      }
      recommendations += patch.recommendations.length;
    } else {
      omittedCount++;
      if (omittedSample.length < 20) {
        omittedSample.push(patch.changeId);
      }
    }
  }

  return { candidates, recommendations, omittedCount, omittedSample };
}

// =============================================================================
// Resume projection recommendation integration (AC9)
// =============================================================================

export async function appendResumeProjectionRecommendations(
  store: Store,
  target: RecommendationTarget,
  opts?: { projectId?: string; limit?: number },
): Promise<void> {
  const limit = opts?.limit ?? 3;
  const projectId =
    opts?.projectId ??
    (store.paths.external ? basename(store.paths.external) : "");
  if (!projectId) return;

  try {
    const [changeList, epicList] = await Promise.all([
      store.changes.list({ includeArchived: true, includeClosed: true }),
      store.epics.list({ status: "all" }),
    ]);

    const changeInputs: ChangeNodeInput[] = (
      await mapWithConcurrency(
        changeList.changes,
        8,
        async (summary): Promise<ChangeNodeInput | null> => {
          const isTerminal =
            summary.status === "archived" || summary.status === "closed";
          if (isTerminal) {
            return {
              id: summary.id,
              title: summary.title,
              status: summary.status,
              lifecycleState: summary.lifecycleState ?? "open",
              same_project_dependencies: [],
              hasInProgressTasks: false,
              epic_membership: summary.epic_membership,
            };
          }
          const full = await store.changes.get(summary.id);
          const change = full.success && full.data ? full.data : null;
          if (!change) return null;
          return {
            id: change.id,
            title: change.title,
            status: change.status,
            lifecycleState: change.lifecycleState ?? "open",
            same_project_dependencies: change.same_project_dependencies ?? [],
            hasInProgressTasks:
              change.tasks?.some((t) => t.status === "in_progress") ?? false,
            epic_membership: change.epic_membership,
          };
        },
      )
    ).filter((c): c is ChangeNodeInput => c !== null);

    const epicInputs: EpicNodeInput[] = epicList.map((epic) => ({
      id: epic.id,
      title: epic.title,
      entries: (epic.entries ?? []).map((entry): EpicEntryInput => {
        if (entry.kind === "shell") {
          return {
            kind: "shell",
            entry_id: entry.entry_id,
            order: entry.order,
            title: entry.title,
            success_hint: entry.success_hint,
            blocked_by: entry.blocked_by ?? [],
          };
        }
        return {
          kind: "change",
          entry_id: entry.entry_id,
          order: entry.order,
          title: entry.title ?? "",
          change_id: entry.change_id ?? "",
        };
      }),
    }));

    const projection = buildResumeProjection(changeInputs, epicInputs, {
      project_id: projectId,
    });

    const title = (ref: WorkNodeRef): string => {
      if (ref.kind === "change") {
        const change = changeInputs.find((c) => c.id === ref.change_id);
        return change?.title ?? ref.change_id;
      }
      const epic = epicInputs.find((e) => e.id === ref.epic_id);
      const entry = epic?.entries.find((e) => e.entry_id === ref.entry_id);
      return entry?.title ?? ref.entry_id;
    };

    if (projection.ordered_next) {
      const next = projection.ordered_next;
      const blocked = next.lifecycle === "blocked";
      const targetEpic =
        next.target_epic_id && next.source_epic_id !== next.target_epic_id
          ? ` (blocked by ${next.target_epic_id})`
          : "";
      pushStatusRecommendation(target, {
        kind: "resume",
        priority: blocked ? "medium" : "high",
        title: blocked
          ? `Next ordered work is blocked: ${title(next.node)}`
          : `Next ordered work: ${title(next.node)}`,
        detail: `rank ${next.advisory_rank}${targetEpic}`,
        action: blocked
          ? "Resolve blockers or adjust dependencies"
          : "Start/promote this work next",
        source: "resume_projection",
        message: `Next ordered work: ${title(next.node)} (${next.lifecycle})${targetEpic}`,
      });
    }

    for (const row of projection.actionable.slice(0, limit)) {
      pushStatusRecommendation(target, {
        kind: "resume",
        priority: "medium",
        title: `Actionable: ${title(row.node)}`,
        detail: `rank ${row.advisory_rank}`,
        action: "Pick up when ready",
        source: "resume_projection",
        message: `Actionable: ${title(row.node)} (${row.lifecycle})`,
      });
    }

    for (const redirect of projection.redirects.slice(0, limit)) {
      pushStatusRecommendation(target, {
        kind: "resume",
        priority: "medium",
        title: `Cross-Epic redirect: ${title(redirect.blocked_node)}`,
        detail: `blocked by ${redirect.target_epic_id}`,
        action: `Resolve blocker in ${redirect.target_epic_id} first`,
        source: "resume_projection",
        message: `Cross-Epic redirect: ${title(redirect.blocked_node)} → ${redirect.target_epic_id}`,
      });
    }
  } catch {
    // Resume projection recommendations are advisory; failure must not break status.
  }
}
