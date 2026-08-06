/**
 * Backlog coordination regression suite for retained claim/Visibility laws.
 *
 * Each test maps explicitly to a retained Regression List item
 * from the v2 discovery findings. The mechanism resolving each RL is
 * documented inline so future regressions can be traced back to the
 * coordination contract they violate.
 *
 * Co-locates with the more focused per-feature tests:
 *   - plugin/src/temporal/visibility-claim-queries.test.ts (B1, B2 helpers)
 *   - plugin/src/temporal/search-attributes.test.ts (A1 attribute pop)
 *   - plugin/src/temporal/change-state.test.ts (A0 state.origin)
 *   - plugin/src/tools/backlog.test.ts (C1/C2 tools)
 *   - plugin/src/tools/change-claim.test.ts (C3 claim checks)
 *
 * Retired roadmap snapshot/reader behavior is covered by tombstone and
 * asset-removal tests, not by runtime snapshot fixtures.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDiskStore, type Store } from "../storage/store";
import { cleanupTempDir, createTempDir, createTestProject } from "./setup";
import { changeTools } from "../tools/change";
import { buildChangeSearchAttributes } from "../temporal/search-attributes";
import {
  buildClaimVisibilityQuery,
  buildActiveClaimsVisibilityQuery,
} from "../temporal/visibility-claim-queries";
import type { ChangeWorkflowState } from "../temporal/contracts";
import { createDefaultGates } from "../types";

// =============================================================================
// Shared fixtures
// =============================================================================

function makeState(
  overrides: Partial<ChangeWorkflowState> = {},
): ChangeWorkflowState {
  return {
    id: "regression-test",
    projectId: "proj-test",
    changeId: "regression-test",
    title: "Regression test",
    status: "active",
    initializedAt: "2026-05-11T00:00:00.000Z",
    createdAt: "2026-05-11T00:00:00.000Z",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    reentry_history: [],
    artifacts: {},
    ...overrides,
  };
}

// =============================================================================
// RL-1: Duplicate work (two sessions claim the same issue)
// Mechanism: Pre-create Visibility query in adv_change_create returns
// CLAIM_CONFLICT when an active change already holds origin.issue_number.
// =============================================================================

describe("RL-1: duplicate work prevented by pre-create claim check", () => {
  let dir: string;
  let store: Store;
  beforeEach(async () => {
    dir = await createTempDir("rl1-");
    await createTestProject(dir, { withChanges: false });
    store = await createDiskStore(dir);
    await store.init();
  });
  afterEach(async () => {
    store.close();
    await cleanupTempDir(dir);
  });

  test("second create with same origin.issue_number returns CLAIM_CONFLICT", async () => {
    const claimChecker = vi
      .fn()
      .mockResolvedValue([{ changeId: "firstClaim", status: "active" }]);

    const output = await changeTools.adv_change_create.execute(
      {
        summary: "Second attempt at #51",
        origin_kind: "triage",
        origin_issue_number: 51,
      },
      store,
      undefined,
      { claimChecker, claimRaceCheckMs: 0 },
    );

    const parsed = JSON.parse(
      typeof output === "string"
        ? output
        : (output as { content: { text: string }[] }).content[0].text,
    );
    expect(parsed.code).toBe("CLAIM_CONFLICT");
    expect(parsed.existing_change_id).toBe("firstClaim");
    expect(claimChecker).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// RL-3: Orphaned claims (agent crash leaves claim stuck)
// Mechanism: Change workflow lifecycleState IS the claim. Lifecycle transitions
// to archived/closed (auto-release) make the claim invisible to peer Visibility
// queries (filter is AdvLifecycleState = open + running execution guard).
// =============================================================================

describe("RL-3: orphaned claims auto-released by lifecycle transition", () => {
  test("Visibility query filter selects open running lifecycle", () => {
    const query = buildClaimVisibilityQuery({
      projectId: "proj-test",
      issueNumber: 51,
    });
    // Filter selects canonical open lifecycle and excludes completed executions;
    // archived/closed changes never match → claim is released by lifecycle transition.
    expect(query).toContain('AdvLifecycleState = "open"');
    expect(query).toContain('ExecutionStatus = "Running"');
    expect(query).not.toContain("AdvChangeStatus");
    expect(query).not.toContain("archived");
    expect(query).not.toContain("closed");
  });
});

// =============================================================================
// RL-4: Missing active-change annotation (some changes elided from index)
// Mechanism: buildChangeSearchAttributes populates AdvBacklogIssueNumber
// for every change with state.origin.issue_number, so the Visibility query
// returns ALL active claims (no enumeration gap).
// =============================================================================

describe("RL-4: every change with origin.issue_number indexes itself", () => {
  test("buildChangeSearchAttributes emits AdvBacklogIssueNumber on origin-bearing state", () => {
    const state = makeState({
      origin: { kind: "triage", issue_number: 42 },
    });
    const attrs = buildChangeSearchAttributes(state);
    expect(attrs.AdvBacklogIssueNumber).toEqual(["42"]);
  });

  test("buildChangeSearchAttributes omits AdvBacklogIssueNumber when origin absent", () => {
    const state = makeState({ origin: undefined });
    const attrs = buildChangeSearchAttributes(state);
    expect(attrs.AdvBacklogIssueNumber).toBeUndefined();
  });
});

// =============================================================================
// RL-7: Cross-session blindness (session A can't see session B's claims)
// Mechanism: Both sessions query the same Temporal Visibility surface;
// any active workflow's AdvBacklogIssueNumber is visible to all sessions
// in the same project (filter: AdvAffectedProjects = pid).
// =============================================================================

describe("RL-7: cross-session claim visibility via shared Visibility query", () => {
  test("Visibility query scopes by AdvAffectedProjects (shared across sessions)", () => {
    const query = buildClaimVisibilityQuery({
      projectId: "shared-project-id",
      issueNumber: 99,
    });
    // The project-scope clause is the same regardless of which session
    // fires the query — both see the same Visibility-indexed claim set.
    expect(query).toContain('AdvAffectedProjects = "shared-project-id"');
  });

  test("Bulk Visibility query also scopes by AdvAffectedProjects", () => {
    const query = buildActiveClaimsVisibilityQuery({
      projectId: "shared-project-id",
      issueNumbers: [51, 52, 60],
    });
    expect(query).toContain('AdvAffectedProjects = "shared-project-id"');
    expect(query).toContain('AdvBacklogIssueNumber IN ("51", "52", "60")');
  });
});

// =============================================================================
// Cross-RL: rq-aw-backlog01 — 7-gate lifecycle is orthogonal to coordination
// =============================================================================

describe("rq-aw-backlog01: 7-gate lifecycle unaffected by backlog coordination", () => {
  test("Gate transitions emit AdvBacklogIssueNumber when origin set", () => {
    const state = makeState({
      origin: { kind: "triage", issue_number: 42 },
      gates: {
        ...createDefaultGates(),
        proposal: { status: "done", completed_at: "2026-05-11T00:01:00.000Z" },
      },
    });
    const attrs = buildChangeSearchAttributes(state);
    expect(attrs.AdvBacklogIssueNumber).toEqual(["42"]);
    expect(attrs.AdvCurrentGate).toEqual(["discovery"]); // next pending gate
  });

  test("Gate transitions do NOT emit AdvBacklogIssueNumber when origin absent", () => {
    const state = makeState({
      origin: undefined,
      gates: {
        ...createDefaultGates(),
        proposal: { status: "done", completed_at: "2026-05-11T00:01:00.000Z" },
      },
    });
    const attrs = buildChangeSearchAttributes(state);
    expect(attrs.AdvBacklogIssueNumber).toBeUndefined();
    expect(attrs.AdvCurrentGate).toEqual(["discovery"]);
  });
});
