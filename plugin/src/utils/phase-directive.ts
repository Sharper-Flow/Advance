/**
 * Host-only read projection for the canonical phase plan.
 *
 * This assembler is intentionally pure: it adds the authored review marker
 * without performing orchestration, signaling, or gate work.
 */

import { PHASE_DIRECTIVES } from "./phase-directive-content";
import type { PhasePlan } from "./phase-plan";

export function withPhaseDirective(plan: PhasePlan): PhasePlan {
  if (plan.kind !== "actionable" || plan.command !== "adv-review") {
    return plan;
  }

  return {
    ...plan,
    directive: PHASE_DIRECTIVES["adv-review"],
  };
}
