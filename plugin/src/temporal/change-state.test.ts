import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applyTaskAddedToState,
  applyTaskCompletedToState,
  completeGateInChangeState,
  createChangeWorkflowState,
} from "./change-state";

const sourcePath = fileURLToPath(new URL("./change-state.ts", import.meta.url));

describe("change-state pure mutation helpers", () => {
  it("keeps workflow and I/O imports out of the mutation module", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).not.toContain("@temporalio/");
    expect(source).not.toContain("../storage/");
    expect(source).not.toContain("../tools/");
    expect(source).not.toContain("node:");
  });

  it("records task lifecycle mutations without task-run ledger state", () => {
    const state = createChangeWorkflowState({
      changeId: "change-state-test",
      title: "Change state test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    applyTaskAddedToState(state, {
      task: {
        id: "tk-1",
        title: "Task one",
        type: "code",
        status: "pending",
        priority: 0,
        created_at: "2026-05-06T00:00:01.000Z",
      },
      addedAt: "2026-05-06T00:00:01.000Z",
    });
    applyTaskCompletedToState(state, {
      taskId: "tk-1",
      verification: "unit verified",
      summary: "done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
      completedAt: "2026-05-06T00:00:02.000Z",
    });

    expect(state.tasks[0]).toMatchObject({
      id: "tk-1",
      status: "done",
      verification: "unit verified",
      implementation_summary: "done",
      filesTouched: ["plugin/src/temporal/change-state.ts"],
    });
    expect(state).not.toHaveProperty("taskRuns");
    expect(state.lastSignalAt).toBe("2026-05-06T00:00:02.000Z");
  });

  it("leaves sequential gate enforcement to the tool layer", () => {
    const state = createChangeWorkflowState({
      changeId: "gate-purity-test",
      title: "Gate purity test",
      createdAt: "2026-05-06T00:00:00.000Z",
    });

    completeGateInChangeState(state, "planning", {
      now: "2026-05-06T00:00:01.000Z",
      completedBy: "tool-layer-after-validation",
    });

    expect(state.gates.planning).toMatchObject({
      status: "done",
      completed_by: "tool-layer-after-validation",
    });
  });
});
