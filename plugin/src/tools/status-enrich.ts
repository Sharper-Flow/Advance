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
  type GateId,
  type ChangeRecency,
} from "../types";
import { getCommandsByGate } from "../manifest";
import {
  buildChangeContextSnapshot,
  buildChangeContextTicker,
} from "../utils/context-snapshot";
import { readArtifact } from "./change";
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
 * Map a gate ID to a recommended slash command string.
 * Uses the manifest to find commands that trigger the given gate.
 * Falls back to a sensible default if no manifest entry exists.
 */
export function getRecommendationForGate(
  gateId: GateId,
  changeId: string,
  parentContext?: string,
): string | null {
  const cmds = getCommandsByGate(gateId);
  if (cmds.length === 0) {
    return null;
  }

  // Pick the first (primary) command for this gate
  const cmd = cmds[0];
  const label = parentContext
    ? `Change \`${changeId}\` (fast-follow of \`${parentContext}\`)`
    : `Change \`${changeId}\``;
  return `${label}: next gate is \`${gateId}\` → run \`/${cmd.name} ${changeId}\``;
}

export async function getFastFollowParentContext(
  store: Store,
  parentChangeId: string,
): Promise<string> {
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
): Promise<void> {
  const changeId = String(rc.id);
  const changeResult = await store.changes.get(changeId);
  if (!changeResult.success || !changeResult.data) return;

  const gates = changeResult.data.gates ?? createDefaultGates();
  // Temporal-first proposal read per KD-6. Falls back to disk/archive via
  // readArtifact; null result means no proposal content — use empty string
  // for snapshot rendering (status output is read-only).
  const proposalText = (await readArtifact(store, changeId, "proposal")) ?? "";

  const snapshotInput = {
    change: changeResult.data,
    proposalText,
    gates: gates ?? undefined,
    workdir: store.paths.root,
  };

  Object.assign(rc, {
    parent_change_id: changeResult.data.fast_follow_of?.parent_change_id,
    epic: changeResult.data.epic_membership
      ? {
          id: changeResult.data.epic_membership.epic_id,
          title: changeResult.data.epic_membership.title,
          entry_id: changeResult.data.epic_membership.entry_id,
        }
      : undefined,
    _contextSnapshot: isPrimary
      ? buildChangeContextSnapshot(snapshotInput)
      : buildChangeContextTicker(snapshotInput),
  });

  const dependencyStatus = await buildExternalDependencyStatus(
    changeResult.data.external_dependencies,
  );
  if (dependencyStatus) {
    (rc as unknown as Record<string, unknown>)._externalDependencyStatus =
      dependencyStatus.summary;
  }

  const nextGate = GATE_ORDER.find((gateId) => !isGateSatisfied(gates[gateId]));
  if (nextGate) {
    const parentContext = changeResult.data.fast_follow_of
      ? await getFastFollowParentContext(
          store,
          changeResult.data.fast_follow_of.parent_change_id,
        )
      : undefined;
    const rec = getRecommendationForGate(
      nextGate as GateId,
      changeId,
      parentContext,
    );
    if (rec) {
      const cmds = getCommandsByGate(nextGate as GateId);
      const cmd = cmds[0];
      pushStatusRecommendation(status, {
        kind: "next_gate",
        priority: nextGate === "release" ? "high" : "medium",
        changeId,
        gateId: nextGate as GateId,
        title: parentContext
          ? `Change \`${changeId}\` (fast-follow of \`${parentContext}\`)`
          : `Change \`${changeId}\``,
        detail: `next gate is \`${nextGate}\``,
        action: cmd ? `run \`/${cmd.name} ${changeId}\`` : "review gate status",
        source: "gate",
        minutesSinceActivity: rc.minutesSinceActivity,
        message: rec,
      });
    }
  }

  appendClarifyRecommendation(
    status,
    clarifyMode,
    changeResult.data,
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
): Promise<ChangeRecency[]> {
  const productContext = store.productContext;
  if (!productContext || productContext.mode === "single_repo") {
    return recentChanges;
  }
  if (scope === "product") return recentChanges;

  const scoped: ChangeRecency[] = [];
  for (const change of recentChanges) {
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
