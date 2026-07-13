/**
 * status-enrich
 *
 * Extracted from status.ts — pure move, no behavior change.
 */

import type { Store } from "../storage/store";
import {
  createDefaultGates,
  GATE_ORDER,
  isGateSatisfied,
  type Change,
  type GateId,
  type ChangeRecency,
} from "../types";
import { getCommandsByGate } from "../manifest";
import { changeToDirectiveState } from "../temporal/change-state";
import {
  deriveDirectiveSafe,
  type WorkflowDirective,
} from "../utils/workflow-directive";
import {
  buildChangeContextSnapshot,
  buildChangeContextTicker,
} from "../utils/context-snapshot";
import { readArtifact } from "./change/artifacts";
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { buildExternalDependencyStatus } from "./external-dependency-status";
import {
  statusRecommendationToString,
  type StatusRecommendationItem,
} from "./status-recommendations";

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
 * issuing a duplicate per-change Temporal read. `resolvedChanges` lets
 * fast-follow parent context resolve from the same request-local map;
 * store reads remain the fallback for entries the request never resolved
 * (e.g. an archived parent outside the active candidate set).
 */
export interface StatusResolvedChangeContext {
  change?: Change;
  resolvedChanges?: ReadonlyMap<string, Change>;
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
): Promise<void> {
  const changeId = String(rc.id);
  let changeData: Change;
  let proposalText: string;
  if (resolved?.change) {
    // AC4: the request already hydrated this change — reuse the document
    // and its Temporal proposal projection. No second store.changes.get
    // and no readArtifact call for an already-resolved row.
    changeData = resolved.change;
    proposalText = resolved.change.documents?.proposal ?? "";
  } else {
    const changeResult = await store.changes.get(changeId);
    if (!changeResult.success || !changeResult.data) return;
    changeData = changeResult.data;
    // Temporal-first proposal read per KD-6. Falls back to disk/archive
    // via readArtifact; null result means no proposal content — use
    // empty string for snapshot rendering (status output is read-only).
    proposalText = (await readArtifact(store, changeId, "proposal")) ?? "";
  }

  const gates = changeData.gates ?? createDefaultGates();

  // Authoritative next-action projection shared with gate status and the
  // context snapshot. Derived from the disk change projection (Temporal-first
  // reads elsewhere keep this fresh); never persisted. Best effort: a
  // derivation failure must not break status enrichment — fall back to the
  // first open gate and omit the `_directive` payload on the rare error path.
  const directive = deriveDirectiveSafe(
    changeToDirectiveState({
      projectId: changeData.adv_project_id ?? "unknown",
      change: changeData,
      gates,
    }),
    Date.now(),
  );
  const fallbackNextGate = directive
    ? undefined
    : (GATE_ORDER.find((gateId) => gates[gateId]?.status !== "done") as
        | GateId
        | undefined);

  const snapshotInput = {
    change: changeData,
    proposalText,
    gates: gates ?? undefined,
    workdir: store.paths.root,
  };

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
      ? buildChangeContextSnapshot({ ...snapshotInput, directive })
      : buildChangeContextTicker(snapshotInput),
    _directive: directive,
  });

  const dependencyStatus = await buildExternalDependencyStatus(
    changeData.external_dependencies,
  );
  if (dependencyStatus) {
    (rc as unknown as Record<string, unknown>)._externalDependencyStatus =
      dependencyStatus.summary;
  }

  const nextGate = directive
    ? (directive.action.gateId as GateId | undefined)
    : fallbackNextGate;
  if (directive && nextGate) {
    const parentContext = changeData.fast_follow_of
      ? await getFastFollowParentContext(
          store,
          changeData.fast_follow_of.parent_change_id,
          resolved?.resolvedChanges,
        )
      : undefined;
    const item = buildNextGateRecommendationFromDirective({
      directive,
      changeId,
      parentContext,
      minutesSinceActivity: rc.minutesSinceActivity,
    });
    if (item) {
      pushStatusRecommendation(status, item);
    }
  }

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

export const _test = {
  appendRecencyRecommendation,
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
