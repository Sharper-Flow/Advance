import { describe, expect, it } from "vitest";

import { createDefaultGates } from "../types";
import {
  applySignalRejectionToState,
  SIGNAL_REJECTION_RING_BUFFER_LIMIT,
} from "./change-state";
import type { ChangeWorkflowState } from "./contracts";

function freshState(): ChangeWorkflowState {
  return {
    changeId: "test-change",
    title: "test",
    status: "draft",
    createdAt: "2026-05-28T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    artifacts: {},
    documents: {},
  } as ChangeWorkflowState;
}

describe("signal rejection state mutation", () => {
  it("records rejection metadata without retaining raw payload", () => {
    const state = freshState();
    const payload = {
      taskId: "tk-missing",
      partial: { title: "x".repeat(1024) },
    };

    applySignalRejectionToState(state, {
      signalName: "taskUpdated",
      error: new Error("Task not found: tk-missing"),
      payload,
      rejectedAt: "2026-05-28T00:00:01.000Z",
    });

    expect(state.signal_rejections_total).toBe(1);
    expect(state.signal_rejections).toHaveLength(1);
    expect(state.signal_rejections?.[0]).toMatchObject({
      signalName: "taskUpdated",
      errorMessage: "Task not found: tk-missing",
      errorClass: "Error",
      rejectedAt: "2026-05-28T00:00:01.000Z",
    });
    expect(state.signal_rejections?.[0].payloadDigest).toEqual(
      expect.objectContaining({
        payload_size: expect.any(Number),
        payload_sample: expect.any(String),
        payload_fnv1a: expect.stringMatching(/^[0-9a-f]{8}$/),
      }),
    );
    expect(JSON.stringify(state.signal_rejections)).not.toContain(
      "x".repeat(300),
    );
    expect(state.lastSignalAt).toBe("2026-05-28T00:00:01.000Z");
  });

  it("keeps a bounded FIFO ring buffer while total count remains cumulative", () => {
    const state = freshState();

    for (let i = 0; i < SIGNAL_REJECTION_RING_BUFFER_LIMIT + 3; i++) {
      applySignalRejectionToState(state, {
        signalName: `signal-${i}`,
        error: new Error(`boom-${i}`),
        payload: { i },
        rejectedAt: `2026-05-28T00:00:${String(i).padStart(2, "0")}.000Z`,
      });
    }

    expect(state.signal_rejections_total).toBe(
      SIGNAL_REJECTION_RING_BUFFER_LIMIT + 3,
    );
    expect(state.signal_rejections).toHaveLength(
      SIGNAL_REJECTION_RING_BUFFER_LIMIT,
    );
    expect(state.signal_rejections?.[0].signalName).toBe("signal-3");
    expect(state.signal_rejections?.at(-1)?.signalName).toBe("signal-22");
  });
});
