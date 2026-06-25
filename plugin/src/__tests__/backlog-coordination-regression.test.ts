/**
 * Backlog coordination regression suite (AC10 / rq-backlogCoord01..07).
 *
 * Each test maps explicitly to a Regression List (RL-1 .. RL-7) item
 * from the v2 discovery findings. The mechanism resolving each RL is
 * documented inline so future regressions can be traced back to the
 * coordination contract they violate.
 *
 * Co-locates with the more focused per-feature tests:
 *   - plugin/src/temporal/visibility-claim-queries.test.ts (B1, B2 helpers)
 *   - plugin/src/temporal/search-attributes.test.ts (A1 attribute pop)
 *   - plugin/src/temporal/change-state.test.ts (A0 state.origin)
 *   - plugin/src/tools/roadmap.test.ts (D1 TTL helpers)
 *   - plugin/src/tools/backlog.test.ts (C1/C2 tools)
 *   - plugin/src/tools/change-claim.test.ts (C3 claim checks)
 *
 * This suite is the integration-level "all seven failure modes are
 * structurally prevented" verification that AC10 demands.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createLegacyStore, type Store } from "../storage/store";
import { cleanupTempDir, createTempDir, createTestProject } from "./setup";
import { changeTools } from "../tools/change";
import { backlogTools } from "../tools/backlog";
import type { RoadmapSnapshot } from "../tools/roadmap";
import {
  assessAnnotationFreshness,
  buildRefreshMetadata,
  DEFAULT_ANNOTATION_TTL_MS,
} from "../tools/roadmap";
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

const SAMPLE_SNAPSHOT: RoadmapSnapshot = {
  version: 1,
  generated_at: "2026-05-11T00:00:00.000Z",
  project: { owner: "TestOrg", number: 1, title: "ADV: Test" },
  counts: { total: 3, bugs: 1, features: 2, deferred: 0 },
  bugs: [{ number: 100, title: "Bug A", priority: "high", labels: [] }],
  features: [
    {
      number: 51,
      title: "Feature X",
      value: 8,
      time_criticality: 3,
      rroe: 13,
      effort: 3,
      wsjf: 8.0,
      labels: [],
    },
    {
      number: 52,
      title: "Feature Y",
      value: 5,
      time_criticality: 1,
      rroe: 2,
      effort: 1,
      wsjf: 8.0,
      labels: [],
    },
  ],
  deferred: [],
};

async function writeFixture(snapshot: RoadmapSnapshot): Promise<string> {
  const dir = join(
    tmpdir(),
    `adv-regression-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(join(dir, ".adv"), { recursive: true });
  await writeFile(
    join(dir, ".adv", "roadmap-snapshot.json"),
    JSON.stringify(snapshot, null, 2),
  );
  return dir;
}

function makeStoreAt(root: string): Store {
  return {
    paths: { root, changes: join(root, ".adv/changes") },
    changes: { list: vi.fn().mockResolvedValue({ changes: [] }) },
  } as unknown as Store;
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
    store = await createLegacyStore(dir);
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
        origin_kind: "roadmap",
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
// RL-2: Stale priorities (snapshot diverges from GH Project)
// Mechanism: adv_backlog_state surfaces TTL-bounded freshness; reports
// needs_refresh: true when snapshot age > ttl_ms (default 5 min).
// =============================================================================

describe("RL-2: stale priorities surface via freshness metadata", () => {
  test("snapshot beyond TTL reports needs_refresh: true", () => {
    const freshness = assessAnnotationFreshness(
      { last_refreshed: "2026-05-11T00:00:00.000Z", ttl_ms: 300_000 },
      new Date("2026-05-11T00:06:00.000Z"), // 6 min later, TTL=5min
    );
    expect(freshness.needs_refresh).toBe(true);
  });

  test("fresh snapshot reports needs_refresh: false within TTL window", () => {
    const freshness = assessAnnotationFreshness(
      { last_refreshed: "2026-05-11T00:00:00.000Z", ttl_ms: 300_000 },
      new Date("2026-05-11T00:03:00.000Z"), // 3 min later, within 5min TTL
    );
    expect(freshness.needs_refresh).toBe(false);
  });

  test("buildRefreshMetadata produces fresh metadata on refresh write", () => {
    const meta = buildRefreshMetadata({
      now: new Date("2026-05-11T00:00:00.000Z"),
    });
    expect(meta.ttl_ms).toBe(DEFAULT_ANNOTATION_TTL_MS);
    expect(meta.next_refresh_after).toBe("2026-05-11T00:05:00.000Z");
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
      origin: { kind: "roadmap", issue_number: 42 },
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
// RL-5: Snapshot drift (snapshot file vs. live state diverges silently)
// Mechanism: Active-change annotation uses Visibility, not the snapshot
// file. Visibility is the live coordination layer; snapshot is just the
// ranking/V cache. So even a stale snapshot shows accurate annotations.
// =============================================================================

describe("RL-5: annotation is decoupled from snapshot file freshness", () => {
  test("adv_backlog_state annotates from Visibility regardless of snapshot age", async () => {
    // Snapshot generated 1 hour ago — well past 5-min TTL.
    const oldSnapshot: RoadmapSnapshot = {
      ...SAMPLE_SNAPSHOT,
      last_refreshed: "2026-05-11T00:00:00.000Z",
      ttl_ms: 300_000,
    };
    const root = await writeFixture(oldSnapshot);
    try {
      const store = makeStoreAt(root);

      const result = await backlogTools.adv_backlog_state.execute(
        {},
        store,
        undefined,
        {
          activeChangesAnnotator: async (_pid, issues) => {
            const m = new Map<number, { changeId: string }>();
            // Annotator returns a live result even though snapshot is stale.
            if (issues.includes(51)) {
              m.set(51, { changeId: "liveActiveChange" });
            }
            return m;
          },
          // 1 hour later — snapshot is stale, but annotation still works.
          now: new Date("2026-05-11T01:00:00.000Z"),
        },
      );

      const parsed = JSON.parse(result);
      expect(parsed.freshness.needs_refresh).toBe(true);
      const annotated = parsed.features.find(
        (f: { number: number }) => f.number === 51,
      );
      expect(annotated.active_change.changeId).toBe("liveActiveChange");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// RL-6: Unbounded triage (must run /adv-triage to see fresh state)
// Mechanism: adv_backlog_state derives active-change annotation from
// Visibility on every call, independent of when /adv-triage last ran.
// =============================================================================

describe("RL-6: backlog state queryable without prior /adv-triage", () => {
  test("adv_backlog_state runs against legacy snapshot without TTL fields", async () => {
    // Snapshot missing the v2 TTL fields entirely (pre-cutover format).
    const legacySnapshot: RoadmapSnapshot = { ...SAMPLE_SNAPSHOT };
    const root = await writeFixture(legacySnapshot);
    try {
      const store = makeStoreAt(root);

      const result = await backlogTools.adv_backlog_state.execute(
        {},
        store,
        undefined,
        {
          activeChangesAnnotator: async () => new Map(),
          now: new Date("2026-05-11T00:00:00.000Z"),
        },
      );

      const parsed = JSON.parse(result);
      // Backward-compat: missing TTL fields → needs_refresh: true (force
      // refresh next time) — but the tool returns data, doesn't error.
      expect(parsed.freshness.needs_refresh).toBe(true);
      expect(parsed.freshness.age_ms).toBeNull();
      expect(parsed.bugs).toHaveLength(1);
      expect(parsed.features).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
      origin: { kind: "roadmap", issue_number: 42 },
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
