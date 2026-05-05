import { describe, expect, it } from "vitest";
import {
  createDefaultGates,
  type Change,
  type GateId,
  GATE_ORDER,
} from "../types";
import { buildMigrationReplayPlan } from "./migration-replay";

const NOW = "2026-05-05T00:00:00.000Z";

function makeChange(): Change {
  return {
    id: "migrationOrderingChange",
    title: "Migration ordering change",
    status: "active",
    created_at: NOW,
    tasks: [
      {
        id: "tk-one",
        title: "Completed task",
        type: "code",
        status: "done",
        priority: 1,
        created_at: NOW,
        completed_at: "2026-05-05T00:01:00.000Z",
        implementation_summary: "Done",
        verification: "Verified",
        touched_files: ["src/example.ts"],
      },
    ],
    deltas: {},
    wisdom: [
      {
        id: "ws-one",
        type: "pattern",
        content: "Replay wisdom after gates",
        recorded_at: "2026-05-05T00:02:00.000Z",
      },
    ],
    gates: {
      ...createDefaultGates(),
      proposal: {
        status: "done",
        completed_at: "2026-05-05T00:03:00.000Z",
        completed_by: "agent",
      },
      discovery: {
        status: "in_progress",
        started_at: "2026-05-05T00:04:00.000Z",
        triggered_by: "agent",
      },
    },
  };
}

describe("migration replay ordering", () => {
  it("places marker barriers after docs, after tasks, after every gate, and after wisdom", () => {
    const plan = buildMigrationReplayPlan(makeChange(), {
      proposal: "Proposal",
      problemStatement: "Problem",
      agreement: "Agreement",
      design: "Design",
    });

    const steps = plan.map((step) => `${step.kind}:${step.name}`);
    expect(steps.slice(0, 5)).toEqual([
      "signal:proposalUpdated",
      "signal:problemStatementUpdated",
      "signal:agreementUpdated",
      "signal:designUpdated",
      "marker:docs",
    ]);

    const tasksMarkerIndex = steps.indexOf("marker:tasks");
    expect(tasksMarkerIndex).toBeGreaterThan(
      steps.indexOf("signal:taskCompleted"),
    );

    for (const gateId of GATE_ORDER as GateId[]) {
      const markerIndex = steps.indexOf(`marker:gate-${gateId}`);
      expect(markerIndex).toBeGreaterThan(-1);
      const gateSignalIndex = steps.findIndex(
        (step) => step.startsWith("signal:gate") && step.endsWith(`:${gateId}`),
      );
      if (gateSignalIndex >= 0) {
        expect(markerIndex).toBeGreaterThan(gateSignalIndex);
      }
    }

    expect(steps.indexOf("marker:wisdom")).toBeGreaterThan(
      steps.indexOf("signal:wisdomAdded"),
    );
    expect(steps.at(-1)).toBe("marker:final");
  });
});
