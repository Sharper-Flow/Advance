import { describe, expect, it } from "vitest";

import type { WorkflowDirective } from "../utils/workflow-directive";
import { buildNextGateRecommendationFromDirective } from "./status-enrich";

function directive(
  action: WorkflowDirective["action"],
  overrides: Partial<WorkflowDirective> = {},
): WorkflowDirective {
  return {
    changeId: "change-1",
    phase: "design",
    gateStatus: {} as WorkflowDirective["gateStatus"],
    action,
    approvalPending: false,
    blockers: [],
    canArchive: false,
    bucket: "in_flight",
    ...overrides,
  };
}

describe("buildNextGateRecommendationFromDirective", () => {
  it("derives gate + command from a continue action", () => {
    const item = buildNextGateRecommendationFromDirective({
      directive: directive({
        kind: "continue",
        gateId: "design",
        command: "adv-design",
      }),
      changeId: "change-1",
    });

    expect(item).not.toBeNull();
    expect(item?.kind).toBe("next_gate");
    expect(item?.source).toBe("gate");
    expect(item?.gateId).toBe("design");
    expect(item?.action).toContain("/adv-design change-1");
    expect(item?.message).toContain("next gate is `design`");
  });

  it("uses the directive command for a never_started action", () => {
    const item = buildNextGateRecommendationFromDirective({
      directive: directive(
        { kind: "never_started", gateId: "proposal", command: "adv-proposal" },
        { phase: "proposal" },
      ),
      changeId: "change-1",
    });

    expect(item?.gateId).toBe("proposal");
    expect(item?.action).toContain("/adv-proposal change-1");
  });

  it("falls back to the manifest command when the action carries none", () => {
    // blocked/approval actions carry a gateId but no command; the helper must
    // still produce a runnable next-gate recommendation via the manifest.
    const item = buildNextGateRecommendationFromDirective({
      directive: directive({ kind: "blocked", gateId: "execution" }),
      changeId: "change-1",
    });

    expect(item).not.toBeNull();
    expect(item?.gateId).toBe("execution");
    expect(item?.action).toMatch(/\/adv-apply change-1/);
  });

  it("returns null for archived directives (no forward gate)", () => {
    const item = buildNextGateRecommendationFromDirective({
      directive: directive({ kind: "archived" }, { phase: "archived" }),
      changeId: "change-1",
    });

    expect(item).toBeNull();
  });

  it("threads fast-follow parent context into the title", () => {
    const item = buildNextGateRecommendationFromDirective({
      directive: directive({
        kind: "continue",
        gateId: "design",
        command: "adv-design",
      }),
      changeId: "child-change",
      parentContext: "parent-change",
    });

    expect(item?.title).toContain("fast-follow of `parent-change`");
  });
});
