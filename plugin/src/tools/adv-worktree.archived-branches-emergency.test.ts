import { describe, expect, test, vi } from "vitest";
import { advWorktreeTools } from "./adv-worktree";
import type { Store } from "../storage/store-types";

// rq-archivedBranchCleanupInversion01 AC4: the handler keeps a last-resort
// emergency guard around the archived_branches helper. The helper itself
// self-bounds below the effective budget and normally returns a typed partial
// result, so the guard only fires on a pathological hang. We force that here
// by mocking the helper to never resolve, then assert the handler surfaces a
// typed timedOut response (never a raw ToolExecutionTimeout).
vi.mock("./archive-helpers/archived-branch-cleanup", () => ({
  cleanupArchivedMergedBranches: vi.fn(() => new Promise(() => {})),
}));

vi.mock("./worktree", () => ({
  advWorktreeCreate: vi.fn(),
  advWorktreeResume: vi.fn(),
  advWorktreeDelete: vi.fn(),
  advWorktreeCleanup: vi.fn(),
  loadWorktreeConfig: vi.fn(),
}));
vi.mock("./worktree/state", () => ({ initStateDb: vi.fn() }));
vi.mock("./worktree/triage", () => ({ triageWorktrees: vi.fn() }));
vi.mock("../utils/workspace-warp", () => ({
  createAdvWorkspace: vi.fn(),
  deleteAdvWorkspace: vi.fn(),
  getSessionWorkspaceID: vi.fn(),
  warpFlagEnabled: vi.fn(),
  warpSession: vi.fn(),
  workspaceAndWarpAvailable: vi.fn(),
}));

function mockStore(): Store {
  return { paths: { root: "/tmp/main" }, changes: {} } as unknown as Store;
}

describe("adv_worktree_cleanup archived_branches emergency guard", () => {
  test("returns a typed timedOut result when the helper hangs past the budget", async () => {
    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
        timeoutMs: 60,
      },
      mockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.timedOut).toBe(true);
    expect(parsed.mode).toBe("archived_branches");
    expect(parsed.effectiveTimeoutMs).toBe(60);
  }, 10_000);

  // AC1 (archived_branches variant). The clamped remediation must not name
  // skipDiscovery: this mode routes to cleanupArchivedMergedBranches and never
  // forwards `discover`, so the flag is a no-op here. Naming it would recreate
  // the very defect AC1 forbids — advising an action that cannot succeed.
  test("clamped remediation names a reachable action and never skipDiscovery", async () => {
    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
        timeoutMs: 60_000,
      },
      mockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.timedOut).toBe(true);
    expect(parsed.remediation).not.toContain("larger timeoutMs");
    expect(parsed.remediation).not.toContain("skipDiscovery");
    expect(parsed.remediation).toMatch(/changeId|adv_worktree_triage/);
  }, 50_000);

  // AC2 (archived_branches variant): unclamped may still offer a larger value.
  test("unclamped remediation may still offer a larger timeoutMs", async () => {
    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
        timeoutMs: 60,
      },
      mockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.timedOut).toBe(true);
    expect(parsed.remediation).toContain("larger timeoutMs");
  }, 10_000);

  // AC3 (archived_branches variant).
  test("does not assert a poisoned workflow or refer to adv_doctor", async () => {
    const result = await advWorktreeTools.adv_worktree_cleanup.execute(
      {
        reason: "archived branch cleanup",
        mode: "archived_branches",
        dryRun: true,
        timeoutMs: 60,
      },
      mockStore(),
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).not.toMatch(/poison/i);
    expect(parsed.error).not.toContain("adv_doctor");
    expect(parsed.remediation).not.toMatch(/poison/i);
    expect(parsed.remediation).not.toContain("adv_doctor");
  }, 10_000);
});
