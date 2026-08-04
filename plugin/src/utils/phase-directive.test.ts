import { describe, expect, it } from "vitest";

import { PHASE_DIRECTIVES } from "./phase-directive-content";
import {
  ActionablePhasePlanSchema,
  derivePhasePlan,
  degradedPhasePlan,
  PhasePlanSchema,
  type DirectiveContext,
  type PhasePlan,
} from "./phase-plan";
import { withPhaseDirective } from "./phase-directive";

const GATE_IDS = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
] as const;

function makeContext(
  overrides: Partial<DirectiveContext> = {},
): DirectiveContext {
  return {
    changeId: "change-1",
    isArchived: false,
    firstOpenGate: "proposal",
    canArchive: false,
    noGatesStarted: true,
    approvalPending: false,
    gateStatus: Object.fromEntries(
      GATE_IDS.map((gate) => [gate, "pending"]),
    ) as DirectiveContext["gateStatus"],
    blockers: [],
    bucket: "in_flight",
    ...overrides,
  };
}

function parsedPlan(context: DirectiveContext): PhasePlan {
  return PhasePlanSchema.parse(derivePhasePlan(context));
}

function actionable(command: string): PhasePlan {
  const plan = parsedPlan(
    makeContext({ firstOpenGate: "acceptance", noGatesStarted: false }),
  );
  if (plan.kind !== "actionable") throw new Error("test setup");
  return ActionablePhasePlanSchema.parse({ ...plan, command });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe("withPhaseDirective", () => {
  it("attaches the registered directive to an actionable adv-review plan", () => {
    const plan = actionable("adv-review");

    const output = withPhaseDirective(plan);

    expect(output).not.toBe(plan);
    expect(output.kind).toBe("actionable");
    if (output.kind !== "actionable") return;
    expect(output.directive).toEqual(PHASE_DIRECTIVES["adv-review"]);
    expect(output.directive?.contentHash).toBe(
      PHASE_DIRECTIVES["adv-review"].contentHash,
    );
    expect(PhasePlanSchema.parse(output)).toEqual(output);
  });

  it.each(["adv-apply", "adv-design"])(
    "returns an actionable %s plan unchanged",
    (command) => {
      const plan = actionable(command);

      const output = withPhaseDirective(plan);

      expect(output).toBe(plan);
      expect("directive" in output).toBe(false);
    },
  );

  it.each([
    ["approval-required", parsedPlan(makeContext({ approvalPending: true }))],
    [
      "blocked",
      parsedPlan({
        ...makeContext(),
        blockers: [
          {
            code: "ARTIFACT_MISSING",
            gateId: "proposal",
            message: "artifact missing",
            remediation: "create artifact",
          },
        ],
      }),
    ],
    [
      "recovery-required",
      parsedPlan({
        ...makeContext(),
        recovery: { reason: "unknown", description: "audit required" },
      }),
    ],
    ["terminal", parsedPlan(makeContext({ isArchived: true }))],
    [
      "degraded",
      PhasePlanSchema.parse(
        degradedPhasePlan("change-1", "missing_state", "state unavailable"),
      ),
    ],
  ])("returns %s plans unchanged without a directive", (_kind, plan) => {
    const output = withPhaseDirective(plan);

    expect(output).toBe(plan);
    expect("directive" in output).toBe(false);
  });

  it("does not mutate input and is deterministic across repeated calls", () => {
    const plan = deepFreeze(actionable("adv-review"));
    const before = JSON.stringify(plan);

    const first = withPhaseDirective(plan);
    const second = withPhaseDirective(plan);

    expect(first).toEqual(second);
    expect(JSON.stringify(plan)).toBe(before);
    expect(PhasePlanSchema.parse(first)).toEqual(first);
  });
});
