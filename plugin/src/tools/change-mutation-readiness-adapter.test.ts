/**
 * Tests for the gate-readiness adapter that consumes coordinator outcomes.
 *
 * Verifies that gate readiness evaluates the verified readback from the
 * coordinator and blocks on unverified/stale/operator outcomes.
 */

import { describe, it, expect } from "vitest";
import { evaluateGateReadinessFromMutationOutcome } from "./change-mutation-readiness-adapter";
import { createChangeState } from "../types/change-state-helpers";
import { ChangeSchema } from "../types";
import { createDefaultGates } from "../types/gates";
import type { Change } from "../types";
import type { MutationOutcome } from "./change-mutation-coordinator";

const PROJECT_ID = "test-project";

function passingTemporalState() {
  const state = createChangeState({
    changeId: "gate-ready-change",
    title: "Gate Ready",
    createdAt: "2026-07-25T00:00:00.000Z",
  });
  state.documents = {
    proposal:
      "This proposal has enough substance to pass the minimum size gate.",
  };
  return state;
}

function passingRecoveredChange(): Change {
  return ChangeSchema.parse({
    $schema: "https://advance.dev/schemas/change.v1.json",
    id: "gate-ready-change",
    title: "Gate Ready",
    status: "draft",
    created_at: "2026-07-25T00:00:00.000Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    gates: createDefaultGates(),
    documents: {
      proposal:
        "This proposal has enough substance to pass the minimum size gate.",
    },
  });
}

describe("evaluateGateReadinessFromMutationOutcome", () => {
  it("evaluates readiness from a verified disk readback", () => {
    const outcome: MutationOutcome<unknown> = {
      kind: "verified",
      value: passingTemporalState(),
      revision: 1,
      audit: {
        mutation_kind: "proposal",
        authority_kind: "mutation",
        authority_reason: "proposal_update",
        authority_evidence: "test",
        prior_revision: 0,
        new_revision: 1,
        committed_at: "2026-07-25T00:00:00.000Z",
      },
    };

    const result = evaluateGateReadinessFromMutationOutcome(
      outcome,
      "proposal",
      PROJECT_ID,
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("evaluates readiness from a verified recovery readback", () => {
    const outcome: MutationOutcome<unknown> = {
      kind: "verified",
      value: passingRecoveredChange(),
      revision: 1,
      audit: {
        mutation_kind: "proposal",
        authority_kind: "recovery",
        authority_reason: "missing_projection",
        authority_evidence: "completed",
        prior_revision: 0,
        new_revision: 1,
        committed_at: "2026-07-25T00:00:00.000Z",
      },
    };

    const result = evaluateGateReadinessFromMutationOutcome(
      outcome,
      "proposal",
      PROJECT_ID,
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks readiness when recovery is unverified", () => {
    const outcome: MutationOutcome<unknown> = {
      kind: "unverified",
      reason: "postcondition invisible",
      audit: {
        mutation_kind: "proposal",
        authority_kind: "recovery",
        authority_reason: "postcondition_unverified",
        authority_evidence: "disk_readback_unavailable",
        prior_revision: 0,
        new_revision: 1,
        committed_at: "2026-07-25T00:00:00.000Z",
      },
    };

    const result = evaluateGateReadinessFromMutationOutcome(
      outcome,
      "proposal",
      PROJECT_ID,
    );

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.code).toBe("RECOVERY_UNVERIFIED");
    expect(result.blockers[0]?.message).toContain(
      "postcondition could not be verified",
    );
  });

  it("blocks readiness on stale_revision", () => {
    const outcome: MutationOutcome<unknown> = {
      kind: "stale_revision",
      expected: 1,
      actual: 3,
    };

    const result = evaluateGateReadinessFromMutationOutcome(
      outcome,
      "proposal",
      PROJECT_ID,
    );

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.code).toBe("STALE_REVISION");
    expect(result.blockers[0]?.message).toContain("expected 1, actual 3");
  });

  it("blocks readiness on operator_required", () => {
    const outcome: MutationOutcome<unknown> = {
      kind: "operator_required",
      reason: "Workflow query failed",
    };

    const result = evaluateGateReadinessFromMutationOutcome(
      outcome,
      "proposal",
      PROJECT_ID,
    );

    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.code).toBe("OPERATOR_REQUIRED");
    expect(result.blockers[0]?.message).toContain("Workflow query failed");
  });
});
