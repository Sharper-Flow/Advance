/**
 * Tests for session-lifecycle helpers in state.ts (T21).
 *
 * Verifies that registerSession / unregisterSession / updateSessionActivity
 * call the correct workflow updates with the correct payload shape and
 * silently fall back when the project workflow is unreachable.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock project-workflow-helper so we can drive the access state machine.

vi.mock("../project-workflow-helper", () => ({
  getBoundedProjectWorkflowAccess: vi.fn(),
}));

// Note: do NOT mock ./state here — the test needs the real implementation.
// Mocking it with importOriginal causes module-resolution ordering issues
// when sibling files (e.g. branch-integration.ts) also import from state.

// Capture executeUpdate calls.
const executeUpdate = vi.fn(async () => undefined);

const mockHandle = {
  query: vi.fn(async () => ({})),
  executeUpdate,
};

vi.mock("../project-workflow-helper", () => ({
  getBoundedProjectWorkflowAccess: vi.fn(async () => ({
    mode: "workflow-backed",
    handle: mockHandle,
  })),
}));

import {
  registerSession,
  unregisterSession,
  updateSessionActivity,
  type WorktreeStateAccess,
} from "./state";
import {
  registerSessionUpdate,
  unregisterSessionUpdate,
  updateSessionActivityUpdate,
} from "../../temporal/messages";

const access: WorktreeStateAccess = {
  projectDir: "/test/project",
  projectId: "test-id",
};

describe("session lifecycle helpers (T21)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registerSession dispatches registerSessionUpdate with payload", async () => {
    const payload = {
      sessionId: "sess_AAAA1111",
      worktreePath: "/work",
      pid: 1234,
      now: "2026-05-01T00:00:00Z",
      worktreeBranch: "trunk",
    };
    await registerSession(access, payload);

    expect(executeUpdate).toHaveBeenCalledOnce();
    expect(executeUpdate).toHaveBeenCalledWith(registerSessionUpdate, {
      args: [payload],
    });
  });

  it("unregisterSession dispatches unregisterSessionUpdate with sessionId only", async () => {
    await unregisterSession(access, "sess_AAAA1111");

    expect(executeUpdate).toHaveBeenCalledOnce();
    expect(executeUpdate).toHaveBeenCalledWith(unregisterSessionUpdate, {
      args: [{ sessionId: "sess_AAAA1111" }],
    });
  });

  it("updateSessionActivity dispatches updateSessionActivityUpdate with full payload", async () => {
    const payload = {
      sessionId: "sess_AAAA1111",
      now: "2026-05-01T00:01:00Z",
      activeChangeId: "ch1",
      currentTaskId: "tk1",
      activeGate: "execution",
    };
    await updateSessionActivity(access, payload);

    expect(executeUpdate).toHaveBeenCalledOnce();
    expect(executeUpdate).toHaveBeenCalledWith(updateSessionActivityUpdate, {
      args: [payload],
    });
  });

  it("silently falls back when project workflow is not reachable", async () => {
    const helper = await import("../project-workflow-helper");
    vi.mocked(helper.getBoundedProjectWorkflowAccess).mockResolvedValueOnce({
      mode: "unavailable",
      projectId: "test-id",
      reason: "test fallback",
    });

    // Should NOT throw, should NOT call executeUpdate.
    await registerSession(access, {
      sessionId: "sess_X",
      worktreePath: "/p",
      pid: 1,
      now: "2026-05-01T00:00:00Z",
    });

    expect(executeUpdate).not.toHaveBeenCalled();
  });
});
