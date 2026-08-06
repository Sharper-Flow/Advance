/**
 * Gate-readiness adapter that consumes a `ChangeMutationCoordinator` outcome.
 *
 * Gate readiness must evaluate the verified readback returned by the
 * coordinator — never a pre-recovery cached `Change` or a query to a completed
 * or deleted workflow. This adapter converts the coordinator outcome into a
 * `GateReadinessResult` so existing readiness evaluators remain unchanged.
 *
 * Foundation-only: supports the verified disk projection returned by the
 * coordinator. Full migration of every family to the coordinator belongs to
 * Tasks 3/4.
 */

import {
  evaluateGateReadiness,
  type GateReadinessOptions,
  type GateReadinessResult,
} from "../gates/gate-readiness";
import { changeToState } from "../types/change-state-helpers";
import type { ChangeState } from "../types/change-state";
import type { GateId, GateReadinessBlocker } from "../types";
import type { MutationOutcome } from "./change-mutation-coordinator";

function makeBlocker(
  code: string,
  gateId: GateId,
  message: string,
): GateReadinessBlocker {
  return {
    code,
    gateId,
    message,
    remediation: "Resolve the blocker and retry gate completion.",
  };
}

function valueToWorkflowState(value: unknown, projectId: string): ChangeState {
  // The coordinator returns the verified disk projection (Change). Bridge it
  // to the state shape the readiness evaluator expects.
  const change = value as { id: string; title: string; created_at: string };
  return changeToState({
    projectId,
    change: change as never,
  });
}

/**
 * Evaluate gate readiness from a coordinator mutation outcome.
 *
 * - `verified` values are evaluated.
 * - `unverified`, `stale_revision`, lock failures, and
 *   `operator_required` are returned as blocking readiness results.
 */
export function evaluateGateReadinessFromMutationOutcome(
  outcome: MutationOutcome<unknown>,
  gateId: GateId,
  projectId: string,
  options?: GateReadinessOptions,
): GateReadinessResult {
  switch (outcome.kind) {
    case "verified": {
      const state = valueToWorkflowState(outcome.value, projectId);
      return evaluateGateReadiness(state, gateId, options);
    }
    case "unverified": {
      return {
        ready: false,
        blockers: [
          makeBlocker(
            "RECOVERY_UNVERIFIED",
            gateId,
            `Recovery mutation completed but its postcondition could not be verified: ${outcome.reason}`,
          ),
        ],
      };
    }
    case "stale_revision": {
      return {
        ready: false,
        blockers: [
          makeBlocker(
            "STALE_REVISION",
            gateId,
            `Projection revision stale: expected ${outcome.expected}, actual ${outcome.actual}.`,
          ),
        ],
      };
    }
    case "operator_required": {
      return {
        ready: false,
        blockers: [
          makeBlocker(
            "OPERATOR_REQUIRED",
            gateId,
            `Mutation blocked: ${outcome.reason}`,
          ),
        ],
      };
    }
  }
}
