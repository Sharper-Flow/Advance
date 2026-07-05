import { describe, expect, test } from "vitest";
import type { GateCompletion } from "../types";
import { hasGateRecoveryAudit } from "./recovery-audit";

describe("recovery audit helpers", () => {
  test("recognizes current audited gate recovery shape", () => {
    expect(
      hasGateRecoveryAudit({
        status: "done",
        recovery_audit: {
          reason: "completed_workflow_release_gate_recovery",
          evidence:
            "workflow execution already completed | WorkflowNotFoundError",
          recovered_at: "2026-01-01T00:00:01Z",
        },
      } as GateCompletion),
    ).toBe(true);
  });

  test("recognizes legacy compatibility artifact evidence", () => {
    expect(
      hasGateRecoveryAudit({
        status: "done",
        artifact_evidence: {
          kind: "release",
          compatibility_reason: "poisoned history recovery",
        },
      } as GateCompletion),
    ).toBe(true);
  });

  test("does not treat ordinary completed gates as recovery-audited", () => {
    expect(
      hasGateRecoveryAudit({
        status: "done",
        completed_at: "2026-01-01T00:00:00Z",
        completed_by: "agent",
      } as GateCompletion),
    ).toBe(false);
  });
});
