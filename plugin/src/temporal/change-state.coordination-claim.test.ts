/**
 * RED/GREEN tests for typed coordination claims (rq-coordinationClaim01).
 *
 * Covers:
 *   - applyCoordinationClaimSetToState replaces coordination_claim on open changes.
 *   - Malformed/empty identifiers are rejected via signal_rejection.
 *   - Claims are rejected when lifecycle is not open.
 *   - buildChangeSearchAttributes projects AdvCoordinationClaim only for open + claim.
 */

import { describe, expect, it } from "vitest";
import {
  applyCoordinationClaimSetToState,
  createChangeWorkflowState,
} from "./change-state";
import { buildChangeSearchAttributes } from "./search-attributes";
import {
  CoordinationClaimSetSignalPayloadSchema,
  type CoordinationClaimSetSignalPayload,
} from "../types";

const at = "2026-01-01T00:00:00.000Z";

function baseState() {
  const state = createChangeWorkflowState({
    changeId: "chg-coordination-claim",
    title: "Coordination claim change",
    createdAt: at,
  });
  state.projectId = "proj-1";
  state.lifecycleState = "open";
  state.state_revision = 5;
  return state;
}

function validPayload(
  overrides: Partial<CoordinationClaimSetSignalPayload> = {},
): CoordinationClaimSetSignalPayload {
  return CoordinationClaimSetSignalPayloadSchema.parse({
    claim: {
      scope_summary: "typed coordination claim plumbing",
      responsibility: "owner",
      exact_identifiers: ["tk-04de57f4f04e", "search-attributes"],
      generated_terms: ["coordination", "claim", "workflow"],
      claimed_at: at,
      claimed_by: "agent",
    },
    set_at: "2026-01-01T00:00:01.000Z",
    ...overrides,
  });
}

describe("applyCoordinationClaimSetToState", () => {
  it("replaces coordination_claim on an open lifecycle change", () => {
    const state = baseState();
    applyCoordinationClaimSetToState(state, validPayload());

    expect(state.coordination_claim).toMatchObject({
      scope_summary: "typed coordination claim plumbing",
      responsibility: "owner",
      exact_identifiers: ["tk-04de57f4f04e", "search-attributes"],
      generated_terms: ["coordination", "claim", "workflow"],
    });
    expect(state.state_revision).toBe(6);
    expect(state.lastSignalAt).toBe("2026-01-01T00:00:01.000Z");
  });

  it("normalizes exact identifiers and generated terms", () => {
    const state = baseState();
    applyCoordinationClaimSetToState(
      state,
      validPayload({
      claim: {
        scope_summary: "Plumbing",
        responsibility: "reviewer",
        exact_identifiers: ["  TK-04DE57F4F04E  ", "Search-Attributes"],
        generated_terms: ["  Coordination  ", "Claim"],
        claimed_at: at,
      },
      }),
    );

    expect(state.coordination_claim?.exact_identifiers).toEqual([
      "tk-04de57f4f04e",
      "search-attributes",
    ]);
    expect(state.coordination_claim?.generated_terms).toEqual([
      "coordination",
      "claim",
    ]);
  });

  it("deduplicates exact identifiers and generated terms after normalization", () => {
    const state = baseState();
    applyCoordinationClaimSetToState(
      state,
      validPayload({
        claim: {
          scope_summary: "Plumbing",
          responsibility: "reviewer",
          exact_identifiers: [
            "TK-04DE57F4F04E",
            "tk-04de57f4f04e",
            "TK-04DE57F4F04E",
          ],
          generated_terms: ["  Coordination  ", "coordination", "Claim"],
          claimed_at: at,
        },
        set_at: "2026-01-01T00:00:01.000Z",
      }),
    );

    expect(state.coordination_claim?.exact_identifiers).toEqual([
      "tk-04de57f4f04e",
    ]);
    expect(state.coordination_claim?.generated_terms).toEqual([
      "coordination",
      "claim",
    ]);
  });

  it("rejects empty identifiers and records signal rejection", () => {
    const state = baseState();
    applyCoordinationClaimSetToState(state, {
      claim: {
        scope_summary: "Plumbing",
        responsibility: "owner",
        exact_identifiers: [""],
        generated_terms: ["valid"],
        claimed_at: at,
      },
      set_at: "2026-01-01T00:00:01.000Z",
    } as unknown as CoordinationClaimSetSignalPayload);

    expect(state.coordination_claim).toBeUndefined();
    expect(state.signal_rejections).toHaveLength(1);
    expect(state.signal_rejections?.[0]?.signalName).toBe(
      "coordinationClaimSet",
    );
  });

  it("rejects malformed identifiers and records signal rejection", () => {
    const state = baseState();
    applyCoordinationClaimSetToState(state, {
      claim: {
        scope_summary: "Plumbing",
        responsibility: "owner",
        exact_identifiers: ["has space"],
        generated_terms: ["valid"],
        claimed_at: at,
      },
      set_at: "2026-01-01T00:00:01.000Z",
    } as unknown as CoordinationClaimSetSignalPayload);

    expect(state.coordination_claim).toBeUndefined();
    expect(state.signal_rejections).toHaveLength(1);
  });

  it("rejects claims when lifecycle is not open", () => {
    const state = baseState();
    state.lifecycleState = "archived";
    applyCoordinationClaimSetToState(state, validPayload());

    expect(state.coordination_claim).toBeUndefined();
    expect(state.signal_rejections).toHaveLength(1);
    expect(state.signal_rejections?.[0]?.signalName).toBe(
      "coordinationClaimSet",
    );
  });

  it("keeps coordination_claim undefined when never set (legacy compatibility)", () => {
    const state = baseState();
    expect(state.coordination_claim).toBeUndefined();
  });
});

describe("buildChangeSearchAttributes coordination claim projection", () => {
  it("projects AdvCoordinationClaim when lifecycle is open and claim is set", () => {
    const state = baseState();
    applyCoordinationClaimSetToState(state, validPayload());

    const attrs = buildChangeSearchAttributes(state, {
      nowMs: Date.parse("2026-01-01T00:00:02.000Z"),
    });

    expect(attrs.AdvCoordinationClaim).toEqual([
      expect.stringContaining("owner"),
    ]);
    expect(attrs.AdvCoordinationClaim?.[0]).toContain(
      "typed coordination claim plumbing",
    );
    expect(attrs.AdvCoordinationClaim?.[0]).toContain("tk-04de57f4f04e");
    expect(attrs.AdvCoordinationClaim?.[0]).toContain("coordination");
  });

  it("omits AdvCoordinationClaim when no claim is set", () => {
    const state = baseState();
    const attrs = buildChangeSearchAttributes(state);
    expect(attrs.AdvCoordinationClaim).toBeUndefined();
  });

  it("omits AdvCoordinationClaim when lifecycle is not open", () => {
    const state = baseState();
    applyCoordinationClaimSetToState(state, validPayload());
    state.lifecycleState = "closed";

    const attrs = buildChangeSearchAttributes(state);
    expect(attrs.AdvCoordinationClaim).toBeUndefined();
  });
});
