/**
 * Lightweight Change Profile — host-side routing tool.
 *
 * Evaluates a lightweight change profile using the host-side collector and
 * persists the result in the disk projection. The tool is the single host-side
 * entry point that wires Git/worktree evidence collection to durable state.
 */

import type { Store } from "../storage/store";
import type { LightweightProfilePhase } from "../types";
import {
  buildLightweightProfileEvaluationKey,
  evaluateLightweightProfile,
  type LightweightProfileResult,
} from "../types/lightweight-change-profile";
import {
  collectLightweightProfileEvidence,
  type PublicRootPolicy,
} from "../utils/lightweight-change-profile-evidence";
import { getProjectId } from "../utils/project-id";
import { coordinateChangeMutation } from "./change-mutation-coordinator";

export interface EvaluateLightweightProfileDeps {
  getProjectId: (root: string) => Promise<string | null>;
  collectLightweightProfileEvidence: typeof collectLightweightProfileEvidence;
  evaluateLightweightProfile: typeof evaluateLightweightProfile;
}

const defaultDeps: EvaluateLightweightProfileDeps = {
  getProjectId,
  collectLightweightProfileEvidence,
  evaluateLightweightProfile,
};

export async function evaluateLightweightProfileAndSignal(input: {
  store: Store;
  changeId: string;
  phase: LightweightProfilePhase;
  apiCompatibilityPolicy?: PublicRootPolicy;
  deps?: Partial<EvaluateLightweightProfileDeps>;
}): Promise<{
  success: boolean;
  error?: string;
  evaluation?: ReturnType<typeof evaluateLightweightProfile>;
  diagnostics?: string[];
}> {
  const deps = { ...defaultDeps, ...input.deps };

  const changeResult = await input.store.changes.get(input.changeId);
  if (!changeResult.success) {
    return {
      success: false,
      error: `Change ${input.changeId} not found: ${changeResult.error}`,
    };
  }
  const change = changeResult.data;
  if (!change) {
    return {
      success: false,
      error: `Change ${input.changeId} not found`,
    };
  }
  const profile = change.lightweight_profile;
  if (!profile) {
    return {
      success: false,
      error: `Change ${input.changeId} has no lightweight profile request`,
    };
  }

  const projectId = await deps.getProjectId(input.store.paths.root);
  if (!projectId) {
    return { success: false, error: "Could not resolve project ID" };
  }

  const collectorResult = await deps.collectLightweightProfileEvidence({
    workdir: input.store.paths.root,
    projectId,
    changeId: input.changeId,
    baselineRevision: profile.request.baselineRevision,
    projectPaths: input.store.paths,
    apiCompatibilityPolicy: input.apiCompatibilityPolicy,
  });

  const latest = profile.evaluations[profile.evaluations.length - 1];
  const previousResult: LightweightProfileResult | undefined = latest?.result;

  const evaluationKey = buildLightweightProfileEvaluationKey(
    profile.request.requestId,
    input.phase,
    collectorResult.snapshot.fingerprint,
  );

  // Stable idempotency: if the exact same evaluation key is already present,
  // do not re-send the signal.
  if (
    profile.evaluations.some((entry) => entry.evaluationKey === evaluationKey)
  ) {
    return {
      success: true,
      evaluation: profile.evaluations.find(
        (entry) => entry.evaluationKey === evaluationKey,
      ),
      diagnostics: collectorResult.diagnostics,
    };
  }

  const evaluatedAt = new Date().toISOString();
  const evaluation = deps.evaluateLightweightProfile({
    snapshot: collectorResult.snapshot,
    requestId: profile.request.requestId,
    phase: input.phase,
    evaluatedAt,
    previousResult,
    evaluationKey,
  });

  const outcome = await coordinateChangeMutation<typeof change>({
    authority: {
      reason: "record lightweight profile evaluation",
      evidence: evaluationKey,
    },
    changesDir: input.store.paths.changes,
    intent: {
      changeId: input.changeId,
      mutationKind: "lightweight_profile_evaluated",
      mutateLatestProjection: (latest) => ({
        ...latest,
        lightweight_profile: latest.lightweight_profile
          ? {
              ...latest.lightweight_profile,
              evaluations: [
                ...latest.lightweight_profile.evaluations,
                evaluation,
              ],
            }
          : undefined,
      }),
      verifyProjection: (readback) =>
        readback.lightweight_profile?.evaluations.some(
          (entry) => entry.evaluationKey === evaluationKey,
        ) ?? false,
    },
  });
  if (outcome.kind !== "verified") {
    return {
      success: false,
      error:
        outcome.kind === "unverified" || outcome.kind === "operator_required"
          ? outcome.reason
          : `Projection revision conflict: expected ${outcome.expected}, actual ${outcome.actual}`,
    };
  }

  return {
    success: true,
    evaluation,
    diagnostics: collectorResult.diagnostics,
  };
}

export const lightweightProfileTools = {};
