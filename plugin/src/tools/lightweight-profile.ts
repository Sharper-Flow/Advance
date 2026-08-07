/**
 * Lightweight Change Profile — host-side routing tool.
 *
 * Evaluates a lightweight change profile using the host-side collector and
 * persists the result via the existing Temporal signal. The tool is the single
 * host-side entry point that wires Git/worktree evidence collection to the
 * durable workflow state.
 */

import { z } from "zod";
import type { Store } from "../storage/store";
import type { LightweightProfilePhase } from "../types";
import {
  buildLightweightProfileEvaluationKey,
  evaluateLightweightProfile,
  type LightweightProfileResult,
} from "../types/lightweight-change-profile";
import {
  collectLightweightProfileEvidence,
  PublicRootPolicySchema,
  type PublicRootPolicy,
} from "../utils/lightweight-change-profile-evidence";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
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

export const lightweightProfileTools = {
  adv_lightweight_profile_evaluate: {
    description:
      "Evaluate a lightweight change profile at a given gate boundary. Uses the host-side collector to gather evidence and sends a lightweightProfileEvaluated signal. Deduplicates by evaluation key (requestId + phase + fingerprint).",
    args: {
      changeId: z.string().min(1).describe("Change ID to evaluate."),
      phase: z
        .enum(["initial", "execution_boundary", "acceptance_boundary"])
        .describe(
          "Evaluation phase: initial (after task graph completion), execution_boundary, or acceptance_boundary.",
        ),
      apiCompatibilityPolicy: PublicRootPolicySchema.optional().describe(
        "Optional public-root API compatibility policy. If omitted, API compatibility falls back to policy_absent.",
      ),
    },
    execute: async (
      input: {
        changeId: string;
        phase: LightweightProfilePhase;
        apiCompatibilityPolicy?: PublicRootPolicy;
      },
      store: Store,
    ) => {
      const result = await evaluateLightweightProfileAndSignal({
        store,
        changeId: input.changeId,
        phase: input.phase,
        apiCompatibilityPolicy: input.apiCompatibilityPolicy,
      });

      if (!result.success) {
        return formatToolOutput({
          error: result.error,
          changeId: input.changeId,
          phase: input.phase,
        });
      }

      return formatToolOutput({
        success: true,
        changeId: input.changeId,
        phase: input.phase,
        result: result.evaluation?.result,
        evaluationKey: result.evaluation?.evaluationKey,
        criteria: result.evaluation?.criteria,
        downgradeReason: result.evaluation?.downgradeReason,
        diagnostics: result.diagnostics,
      });
    },
  },
};
