import { beforeEach, describe, expect, test, vi } from "vitest";

import { startChangeWorkflow } from "../tools/_adapters";

const mocks = vi.hoisted(() => ({
  ensureChangeWorkflowStarted: vi.fn(),
}));

vi.mock("../temporal/workflow-start", () => ({
  ensureChangeWorkflowStarted: mocks.ensureChangeWorkflowStarted,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockHandle() {
  return {
    query: vi.fn(),
    describe: vi.fn(),
    workflowId: "adv/change/0000abc000000000000000000000000000000000/chg-def",
  };
}

describe("workflow startup without Temporal readiness probes", () => {
  test("does not query or describe the workflow during startup", async () => {
    const handle = createMockHandle();
    mocks.ensureChangeWorkflowStarted.mockResolvedValue(handle);

    await startChangeWorkflow(
      {
        workflow: {
          start: vi.fn(),
          getHandle: vi.fn(() => handle),
        },
      },
      {
        projectId: "0000abc000000000000000000000000000000000",
        changeId: "chg-def",
        title: "Test Change",
        initializedAt: new Date().toISOString(),
      },
    );

    expect(handle.query).not.toHaveBeenCalled();
    expect(handle.describe).not.toHaveBeenCalled();
  });

  test("session-scoped startup also skips removed readiness probes", async () => {
    const handle = createMockHandle();
    mocks.ensureChangeWorkflowStarted.mockResolvedValue(handle);

    await startChangeWorkflow(
      {
        workflow: {
          start: vi.fn(),
          getHandle: vi.fn(() => handle),
        },
      },
      {
        projectId: "0000abc000000000000000000000000000000000",
        changeId: "chg-session",
        title: "Session Change",
        initializedAt: new Date().toISOString(),
        sessionId: "sess_test",
      },
    );

    expect(handle.query).not.toHaveBeenCalled();
    expect(handle.describe).not.toHaveBeenCalled();
  });
});
