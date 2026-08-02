/**
 * Lightweight Change Profile — workflow-state reducer tests.
 */
import { describe, expect, it } from "vitest";
import {
  applyLightweightProfileEvaluatedToState,
  applyLightweightProfileRequestedToState,
  changeSeedStateFromChange,
  createChangeWorkflowState,
} from "../temporal/change-state";
import {
  evaluateLightweightProfile,
  type LightweightChangeProfile,
} from "./lightweight-change-profile";
import type { Change } from "../types";

const timestamp = "2026-07-16T18:00:00.000Z";

function makeProfileRequest(): Omit<LightweightChangeProfile, "evaluations"> {
  return {
    request: {
      requestId: "req-1",
      baselineRevision: "base-abc",
      requestedAt: timestamp,
      requestedBy: "agent",
    },
    omissionPolicy: {
      omitDeepScans: true,
      omitGenericExternalResearch: true,
      omitOpportunityScouting: true,
      omitDefaultSpecialistDelegation: true,
    },
  };
}

function makeEvaluation() {
  return evaluateLightweightProfile({
    snapshot: {
      projectId: "0000ec0100000000000000000000000000000000",
      baselineRevision: "base-abc",
      observedRevision: "head-abc",
      fingerprint: "fp-1",
      taskCount: { total: 1, implementation: 1 },
      changedPaths: {
        count: 1,
        paths: ["a.ts"],
        renames: 0,
        deletions: 0,
        untrackedCount: 0,
        rangeStatus: "complete",
      },
      specDelta: { hasDelta: false, capabilities: [] },
      dependencyChange: { hasDependencyChange: false, manifests: [] },
      apiCompatibility: { publicSurface: "proven_private" },
      repoScope: { currentProjectOnly: true, scopeRepos: 1 },
    },
    requestId: "req-1",
    phase: "initial",
    evaluatedAt: timestamp,
  });
}

describe("lightweight profile state reducers", () => {
  it("seeds a lightweight profile request and omission policy", () => {
    const state = createChangeWorkflowState({
      changeId: "change-1",
      title: "Lightweight change",
      createdAt: timestamp,
    });

    applyLightweightProfileRequestedToState(state, {
      request: makeProfileRequest().request,
      omissionPolicy: makeProfileRequest().omissionPolicy,
      requestedAt: timestamp,
      requestedBy: "agent",
    });

    expect(state.lightweight_profile).toMatchObject(makeProfileRequest());
    expect(state.lightweight_profile?.evaluations).toHaveLength(0);
    expect(state.lastSignalAt).toBe(timestamp);
  });

  it("appends an evaluation to the profile history", () => {
    const state = createChangeWorkflowState({
      changeId: "change-1",
      title: "Lightweight change",
      createdAt: timestamp,
    });
    applyLightweightProfileRequestedToState(state, {
      request: makeProfileRequest().request,
      omissionPolicy: makeProfileRequest().omissionPolicy,
      requestedAt: timestamp,
    });

    const evaluation = makeEvaluation();
    applyLightweightProfileEvaluatedToState(state, {
      evaluation,
      evaluatedAt: timestamp,
    });

    expect(state.lightweight_profile?.evaluations).toHaveLength(1);
    expect(state.lightweight_profile?.evaluations[0].result).toBe("qualified");
    expect(state.lastSignalAt).toBe(timestamp);
  });

  it("ignores duplicate evaluations with the same stable key", () => {
    const state = createChangeWorkflowState({
      changeId: "change-1",
      title: "Lightweight change",
      createdAt: timestamp,
    });
    applyLightweightProfileRequestedToState(state, {
      request: makeProfileRequest().request,
      omissionPolicy: makeProfileRequest().omissionPolicy,
      requestedAt: timestamp,
    });

    const evaluation = makeEvaluation();
    applyLightweightProfileEvaluatedToState(state, {
      evaluation,
      evaluatedAt: timestamp,
    });
    applyLightweightProfileEvaluatedToState(state, {
      evaluation,
      evaluatedAt: "2026-07-16T18:01:00.000Z",
    });

    expect(state.lightweight_profile?.evaluations).toHaveLength(1);
  });

  it("throws when evaluating without a profile request", () => {
    const state = createChangeWorkflowState({
      changeId: "change-1",
      title: "Lightweight change",
      createdAt: timestamp,
    });

    expect(() =>
      applyLightweightProfileEvaluatedToState(state, {
        evaluation: makeEvaluation(),
        evaluatedAt: timestamp,
      }),
    ).toThrow("no profile request exists");
  });

  it("preserves lightweight profile through seed state", () => {
    const change = {
      id: "seed-profile-change",
      title: "Seeded profile",
      status: "draft" as const,
      created_at: timestamp,
      tasks: [],
      deltas: {},
      lightweight_profile: {
        ...makeProfileRequest(),
        evaluations: [makeEvaluation()],
      },
    } satisfies Change;

    const seed = changeSeedStateFromChange(change);

    expect(seed.lightweight_profile).toEqual(change.lightweight_profile);
  });
});
