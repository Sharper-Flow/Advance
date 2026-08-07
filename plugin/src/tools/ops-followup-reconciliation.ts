/**
 * Host reconciliation for ops follow-up link resolutions.
 *
 * Reads the authoritative child ops_followup profile from persisted state and
 * projects a fresh child_profile resolution onto the parent outbound link.
 * All routing and persistence happens in the host tool layer.
 */
import type {
  Change,
  OpsFollowupLink,
  OpsFollowupProfile,
  OpsFollowupResolution,
  OpsFollowupResolutionReason,
  OpsRelationship,
} from "../types";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
import {
  withTargetPathStore,
  type TargetStoreScope,
  type WithTargetPathStoreInput,
} from "./target-project";
import { getProjectId } from "../utils/project-id";
import type { Store } from "../storage/store";

const HANDOFF_RELATIONSHIPS: OpsRelationship[] = [
  "follows_release",
  "monitors",
  "cleanup_after",
];
const COMPLETE_OPS_STATUSES: OpsFollowupResolution["status"][] = ["complete"];

export interface ReconcileOpsFollowupResolutionInput {
  link: OpsFollowupLink;
  childProfile: OpsFollowupProfile;
  /** ISO timestamp used as the verified_at boundary. Defaults to now. */
  now?: string;
}

export interface ReconcileOpsFollowupResolutionResult {
  linkId: string;
  resolution: OpsFollowupResolution;
}

export interface ReconcileOpsFollowupLinksDeps {
  withTargetPathStore?: typeof withTargetPathStore;
  getProjectId?: typeof getProjectId;
  now?: () => string;
}

export interface ReconcileOpsFollowupLinksInput {
  parent: Change;
  store: Store;
  deps?: ReconcileOpsFollowupLinksDeps;
}

export interface ReconcileOpsFollowupLinksResult {
  /** Parent change re-read after any persistence. */
  parent: Change;
  /** Links for which a resolution was derived and (if changed) persisted. */
  reconciled: ReconcileOpsFollowupResolutionResult[];
  /** Links that were not required obligations and were skipped. */
  skipped: string[];
}

export interface ResolveRequiredOpsLinksInput {
  parent: Change;
  store: Store;
  deps?: ReconcileOpsFollowupLinksDeps;
}

export interface ResolveRequiredOpsLinksResult {
  /** Freshly derived authoritative resolution keyed by link id. */
  resolutionByLinkId: Map<string, OpsFollowupResolution>;
  /** Links that were not required obligations and were skipped. */
  skipped: string[];
}

export function isRequiredOpsFollowupLink(link: OpsFollowupLink): boolean {
  if (link.relationship === "blocks") return true;
  return (
    HANDOFF_RELATIONSHIPS.includes(link.relationship) && link.required_handoff
  );
}

export async function resolveRequiredOpsLinks(
  input: ResolveRequiredOpsLinksInput,
): Promise<ResolveRequiredOpsLinksResult> {
  const { parent, store } = input;
  const deps = input.deps ?? {};
  const now = deps.now ? deps.now() : new Date().toISOString();
  const resolutionByLinkId = new Map<string, OpsFollowupResolution>();
  const skipped: string[] = [];

  for (const link of parent.ops_followup_links ?? []) {
    if (!isRequiredOpsFollowupLink(link)) {
      skipped.push(link.id);
      continue;
    }

    const readResult = await readAuthoritativeChildOpsProfile({
      link,
      store,
      deps,
    });
    const resolution = readResult.ok
      ? deriveOpsFollowupResolution(link, readResult.profile, now)
      : makeUnreachableResolution(
          link,
          now,
          readResult.reason,
          readResult.error,
        );

    resolutionByLinkId.set(link.id, resolution);
  }

  return { resolutionByLinkId, skipped };
}

function cloneChange(change: Change): Change {
  return structuredClone(change);
}

export function overlayOpsResolutionsForRead(
  parent: Change,
  resolutionByLinkId: Map<string, OpsFollowupResolution>,
): Change {
  if (!parent.ops_followup_links || parent.ops_followup_links.length === 0) {
    return cloneChange(parent);
  }

  const overlaid = cloneChange(parent);
  for (const link of overlaid.ops_followup_links!) {
    const resolution = resolutionByLinkId.get(link.id);
    if (resolution !== undefined) {
      link.resolution = structuredClone(resolution);
    }
  }
  return overlaid;
}

interface ProofFields {
  completionSignal?: string;
  healthVerification?: string;
  rollbackOrCleanupDisposition?: string;
}

interface EvidenceEntry {
  recorded_at: string;
  summary?: string;
  completion_signal?: string;
  health_verification?: string;
  rollback_or_cleanup_disposition?: string;
}

function gatherEvidenceEntries(profile: OpsFollowupProfile): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [...(profile.evidence ?? [])];
  for (const run of profile.runs ?? []) {
    entries.push(...(run.evidence ?? []));
  }
  return entries.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

function latestProofFields(profile: OpsFollowupProfile): ProofFields {
  const entries = gatherEvidenceEntries(profile);
  let completionSignal: string | undefined = profile.completion_signal;
  let healthVerification: string | undefined;
  let rollbackOrCleanupDisposition: string | undefined;
  for (const entry of entries) {
    if (entry.completion_signal) completionSignal = entry.completion_signal;
    if (entry.health_verification)
      healthVerification = entry.health_verification;
    if (entry.rollback_or_cleanup_disposition)
      rollbackOrCleanupDisposition = entry.rollback_or_cleanup_disposition;
  }
  return { completionSignal, healthVerification, rollbackOrCleanupDisposition };
}

function evidenceSummary(profile: OpsFollowupProfile): string | undefined {
  const entries = gatherEvidenceEntries(profile);
  if (entries.length === 0) {
    return profile.completion_signal
      ? `completed: ${profile.completion_signal}`
      : undefined;
  }
  const latest = entries[entries.length - 1];
  return latest.summary ?? profile.completion_signal ?? undefined;
}

export function deriveOpsFollowupResolution(
  _link: OpsFollowupLink,
  childProfile: OpsFollowupProfile,
  now: string,
): OpsFollowupResolution {
  const proof = latestProofFields(childProfile);
  const summary = evidenceSummary(childProfile);
  const resolution: OpsFollowupResolution = {
    status: childProfile.status,
    verified_at: now,
    source: "child_profile",
    resolution_reason: "verified",
    ...(childProfile.updated_at
      ? { child_updated_at: childProfile.updated_at }
      : {}),
    ...(proof.completionSignal
      ? { completion_signal: proof.completionSignal }
      : {}),
    ...(proof.healthVerification
      ? { health_verification: proof.healthVerification }
      : {}),
    ...(proof.rollbackOrCleanupDisposition
      ? {
          rollback_or_cleanup_disposition: proof.rollbackOrCleanupDisposition,
        }
      : {}),
    ...(summary ? { evidence_summary: summary } : {}),
  };
  return resolution;
}

type UnreachableReason =
  | "child_missing"
  | "profile_missing"
  | "target_identity_mismatch"
  | "unreachable";

function makeUnreachableResolution(
  link: OpsFollowupLink,
  now: string,
  reason: UnreachableReason,
  error: string,
): OpsFollowupResolution {
  const status = COMPLETE_OPS_STATUSES.includes(link.status)
    ? "not_started"
    : link.status;
  return {
    status,
    verified_at: now,
    source: "unreachable",
    resolution_reason: reason as OpsFollowupResolutionReason,
    error,
  };
}

type ChildReadResult =
  | { ok: true; profile: OpsFollowupProfile }
  | { ok: false; reason: UnreachableReason; error: string };

type CrossProjectReadResult =
  | { type: "mismatch"; projectId: string }
  | {
      type: "child";
      projectId: string;
      childResult: Awaited<ReturnType<Store["changes"]["get"]>>;
    };

async function readCrossProjectChild(input: {
  link: OpsFollowupLink;
  store: Store;
  withTargetPathFn: typeof withTargetPathStore;
}): Promise<ChildReadResult> {
  const { link, store, withTargetPathFn } = input;
  try {
    const result = await withTargetPathFn(
      {
        currentProjectPath: store.paths.root,
        target_path: link.target_path,
        stateRequirement: "authoritative",
        target_confirmed: true,
        confirmationEvidence: "ops follow-up reconciliation",
      } as WithTargetPathStoreInput,
      async (scope: TargetStoreScope): Promise<CrossProjectReadResult> => {
        if (
          link.target_project_id &&
          scope.context.projectId !== link.target_project_id
        ) {
          return { type: "mismatch", projectId: scope.context.projectId };
        }
        await scope.store.changes.refresh(link.changeId);
        const childResult = await scope.store.changes.get(link.changeId);
        return {
          type: "child",
          projectId: scope.context.projectId,
          childResult,
        };
      },
    );

    if (result.type === "mismatch") {
      return {
        ok: false,
        reason: "target_identity_mismatch",
        error: `target_project_id mismatch: expected ${link.target_project_id}, got ${result.projectId}`,
      };
    }

    const { childResult } = result;
    if (!childResult.success) {
      return {
        ok: false,
        reason: "child_missing",
        error: childResult.error ?? `child change not found: ${link.changeId}`,
      };
    }
    if (!childResult.data) {
      return {
        ok: false,
        reason: "child_missing",
        error: `child change not found: ${link.changeId}`,
      };
    }
    if (!childResult.data.ops_followup) {
      return {
        ok: false,
        reason: "profile_missing",
        error: `child has no ops_followup profile: ${link.changeId}`,
      };
    }
    return { ok: true, profile: childResult.data.ops_followup };
  } catch (error) {
    return {
      ok: false,
      reason: "unreachable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readSameProjectChild(input: {
  link: OpsFollowupLink;
  store: Store;
  getProjectIdFn: typeof getProjectId;
}): Promise<ChildReadResult> {
  const { link, store } = input;
  try {
    const canonicalProjectId = await input.getProjectIdFn(store.paths.root);
    if (link.target_project_id) {
      if (!canonicalProjectId) {
        return {
          ok: false,
          reason: "target_identity_mismatch",
          error: `target_project_id could not be verified: expected ${link.target_project_id}, canonical project ID unavailable`,
        };
      }
      if (link.target_project_id !== canonicalProjectId) {
        return {
          ok: false,
          reason: "target_identity_mismatch",
          error: `target_project_id mismatch: expected ${link.target_project_id}, got ${canonicalProjectId}`,
        };
      }
    }
    await store.changes.refresh(link.changeId);
    const childResult = await store.changes.get(link.changeId);
    if (!childResult.success) {
      return {
        ok: false,
        reason: "child_missing",
        error: childResult.error ?? `child change not found: ${link.changeId}`,
      };
    }
    if (!childResult.data) {
      return {
        ok: false,
        reason: "child_missing",
        error: `child change not found: ${link.changeId}`,
      };
    }
    if (!childResult.data.ops_followup) {
      return {
        ok: false,
        reason: "profile_missing",
        error: `child has no ops_followup profile: ${link.changeId}`,
      };
    }
    return { ok: true, profile: childResult.data.ops_followup };
  } catch (error) {
    return {
      ok: false,
      reason: "unreachable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readAuthoritativeChildOpsProfile(input: {
  link: OpsFollowupLink;
  store: Store;
  deps: ReconcileOpsFollowupLinksDeps;
}): Promise<ChildReadResult> {
  const { link, store } = input;
  const getProjectIdFn = input.deps.getProjectId ?? getProjectId;
  const withTargetPathFn =
    input.deps.withTargetPathStore ?? withTargetPathStore;

  if (link.target_path) {
    return readCrossProjectChild({ link, store, withTargetPathFn });
  }
  return readSameProjectChild({ link, store, getProjectIdFn });
}

function resolutionsEqual(
  a: OpsFollowupResolution | undefined,
  b: OpsFollowupResolution | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.status === b.status &&
    a.source === b.source &&
    a.child_updated_at === b.child_updated_at &&
    a.resolution_reason === b.resolution_reason &&
    a.completion_signal === b.completion_signal &&
    a.health_verification === b.health_verification &&
    a.rollback_or_cleanup_disposition === b.rollback_or_cleanup_disposition &&
    a.evidence_summary === b.evidence_summary &&
    a.error === b.error
  );
}

async function persistResolutionUpsert(input: {
  store: Store;
  changeId: string;
  linkId: string;
  resolution: OpsFollowupResolution;
  upsertedAt: string;
}): Promise<void> {
  const { store, changeId, linkId, resolution, upsertedAt } = input;
  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      reason: "reconcile ops follow-up resolution",
      evidence: `${linkId}:${upsertedAt}`,
    },
    changesDir: store.paths.changes,
    intent: {
      changeId,
      mutationKind: "ops_followup_resolution_reconciled",
      mutateLatestProjection: (latest) => ({
        ...latest,
        ops_followup_links: (latest.ops_followup_links ?? []).map((link) =>
          link.id === linkId ? { ...link, resolution } : link,
        ),
      }),
      verifyProjection: (readback) =>
        readback.ops_followup_links?.some(
          (link) =>
            link.id === linkId && resolutionsEqual(link.resolution, resolution),
        ) ?? false,
    },
  });
  if (outcome.kind !== "verified") {
    throw new Error(
      outcome.kind === "unverified" || outcome.kind === "operator_required"
        ? outcome.reason
        : `Projection revision conflict: expected ${outcome.expected}, actual ${outcome.actual}`,
    );
  }
}

export async function reconcileOpsFollowupLinks(
  input: ReconcileOpsFollowupLinksInput,
): Promise<ReconcileOpsFollowupLinksResult> {
  const { parent, store } = input;
  const deps = input.deps ?? {};
  const now = deps.now ? deps.now() : new Date().toISOString();
  const { resolutionByLinkId, skipped } = await resolveRequiredOpsLinks({
    parent,
    store,
    deps: { ...deps, now: () => now },
  });
  const reconciled: ReconcileOpsFollowupResolutionResult[] = [];

  for (const [linkId, resolution] of resolutionByLinkId) {
    const link = parent.ops_followup_links?.find((l) => l.id === linkId);
    if (!resolutionsEqual(link?.resolution, resolution)) {
      await persistResolutionUpsert({
        store,
        changeId: parent.id,
        linkId,
        resolution,
        upsertedAt: now,
      });
    }
    reconciled.push({ linkId, resolution });
  }

  const refreshed = await store.changes.get(parent.id);
  return {
    parent: refreshed.success && refreshed.data ? refreshed.data : parent,
    reconciled,
    skipped,
  };
}

/**
 * Pure derivation helper for callers that only need to compute a resolution from
 * an already-fetched child profile. Returns null for non-required links.
 */
export function reconcileOpsFollowupResolution(
  input: ReconcileOpsFollowupResolutionInput,
): OpsFollowupResolution | null {
  if (!isRequiredOpsFollowupLink(input.link)) return null;
  return deriveOpsFollowupResolution(
    input.link,
    input.childProfile,
    input.now ?? new Date().toISOString(),
  );
}
