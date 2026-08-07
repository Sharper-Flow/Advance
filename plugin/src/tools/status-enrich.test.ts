import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import type { Store } from "../storage/store";
import { createDefaultGates, type Change, type ChangeRecency } from "../types";
import type { WorkflowDirective } from "../utils/workflow-directive";
import {
  applyCandidateEnrichmentPatches,
  appendResumeFreshnessRecommendation,
  appendResumeProjectionRecommendations,
  buildCandidateEnrichmentPatch,
  buildNextGateRecommendationFromDirective,
  enrichRecentChangeStatus,
  filterRecentChangesForProductScope,
  getFastFollowParentContext,
  type CandidateEnrichmentPatch,
  type StatusRecommendationCarrier,
} from "./status-enrich";
import type { StatusRecommendationItem } from "./status-recommendations";

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

// =============================================================================
// Request-local resolved document reuse (fixChangeListTimeouts, task 3 / AC4)
// =============================================================================

function resolvedChange(id: string, overrides: Partial<Change> = {}): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Change ${id}`,
    status: "active",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
    documents: { proposal: `# Proposal for ${id}\n\nDo the thing.` },
    ...overrides,
  };
}

function recency(id: string): ChangeRecency {
  return {
    id,
    title: `Change ${id}`,
    status: "active",
    completedTasks: 0,
    taskCount: 0,
    lastActivityAt: new Date().toISOString(),
    minutesSinceActivity: 5,
  };
}

function mockStore(tempDir: string) {
  const get = vi.fn().mockResolvedValue({ success: false });
  const store = {
    changes: { get },
    paths: { root: tempDir, changes: `${tempDir}/.adv/changes` },
  } as unknown as Store;
  return { store, get };
}

describe("enrichRecentChangeStatus resolved-document reuse (AC4)", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    tempDir = undefined;
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("reuses the request-local document and proposal without a second store read", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    const status: StatusRecommendationCarrier = { recommendations: [] };
    const doc = resolvedChange("change-a");
    const rc = recency("change-a");

    await enrichRecentChangeStatus(rc, status, store, "off", false, {
      change: doc,
    });

    // AC4 regression: no duplicate per-change disk read. A resolved document
    // supplies both enrichment and proposal content, so neither the change
    // read nor artifact fallback should fire.
    expect(get).not.toHaveBeenCalled();
    expect(rc._contextSnapshot).toBeDefined();
  });

  it("resolves fast-follow parent context from the request-local map without a store read", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    const status: StatusRecommendationCarrier = { recommendations: [] };
    const parent = resolvedChange("parent-change", { status: "archived" });
    const child = resolvedChange("child-change", {
      fast_follow_of: {
        parent_change_id: "parent-change",
        relationship: "follows_release",
      },
    });
    const resolvedChanges = new Map<string, Change>([
      ["parent-change", parent],
      ["child-change", child],
    ]);
    const rc = recency("child-change");

    await enrichRecentChangeStatus(rc, status, store, "off", false, {
      change: child,
      resolvedChanges,
    });

    expect(get).not.toHaveBeenCalled();
    expect(rc.parent_change_id).toBe("parent-change");
    const nextGate = status.recommendation_items?.find(
      (item) => item.kind === "next_gate",
    );
    expect(nextGate?.title).toContain("Hot change `child-change`");
  });

  it("falls back to store reads only when no resolved document is provided", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    const doc = resolvedChange("change-b", { documents: undefined });
    get.mockResolvedValue({ success: true, data: doc });
    const status: StatusRecommendationCarrier = { recommendations: [] };
    const rc = recency("change-b");

    await enrichRecentChangeStatus(rc, status, store, "off", false);

    // Legacy path: one read hydrates the change, then disk artifact fallback
    // uses the already-hydrated document when available.
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenNthCalledWith(1, "change-b");
    expect(rc._contextSnapshot).toBeDefined();
  });
});

describe("getFastFollowParentContext request-local map", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("uses the map entry when present", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    const resolvedChanges = new Map<string, Change>([
      ["parent-change", resolvedChange("parent-change", { status: "closed" })],
    ]);

    const context = await getFastFollowParentContext(
      store,
      "parent-change",
      resolvedChanges,
    );

    expect(get).not.toHaveBeenCalled();
    expect(context).toBe("parent-change (closed)");
  });

  it("falls back to store.changes.get only for an absent map entry", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    get.mockResolvedValue({
      success: true,
      data: resolvedChange("parent-change", { status: "archived" }),
    });
    const resolvedChanges = new Map<string, Change>();

    const context = await getFastFollowParentContext(
      store,
      "parent-change",
      resolvedChanges,
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(context).toBe("parent-change (archived)");
  });
});

describe("filterRecentChangesForProductScope request-local map", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  function productStore(tempDir: string) {
    const get = vi.fn().mockResolvedValue({ success: false });
    const store = {
      changes: { get },
      paths: { root: tempDir, changes: `${tempDir}/.adv/changes` },
      productContext: {
        currentRoot: tempDir,
        currentRepoId: "repo-1",
        repoProjectId: "rp-1",
        productId: "product-1",
        productProjectId: "pp-1",
        primaryRoot: tempDir,
        primaryRepoId: "repo-1",
        repos: {},
        mode: "primary",
        missingPrimaryPolicy: "block",
      },
    } as unknown as Store;
    return { store, get };
  }

  it("filters from map entries without per-change store reads", async () => {
    tempDir = await createTempDir();
    const { store, get } = productStore(tempDir);
    const inScope = resolvedChange("in-scope", {
      scope_repos: [
        {
          repo_id: "repo-1",
          repo_project_id: "rp-1",
          role: "primary",
          required: true,
        },
      ],
    });
    const outOfScope = resolvedChange("out-of-scope", {
      scope_repos: [
        {
          repo_id: "repo-2",
          repo_project_id: "rp-2",
          role: "secondary",
          required: false,
        },
      ],
    });
    const resolvedChanges = new Map<string, Change>([
      ["in-scope", inScope],
      ["out-of-scope", outOfScope],
    ]);

    const filtered = await filterRecentChangesForProductScope(
      [recency("in-scope"), recency("out-of-scope")],
      store,
      "repo",
      resolvedChanges,
    );

    expect(get).not.toHaveBeenCalled();
    expect(filtered.map((rc) => rc.id)).toEqual(["in-scope"]);
  });

  it("falls back to store.changes.get only for entries absent from the map", async () => {
    tempDir = await createTempDir();
    const { store, get } = productStore(tempDir);
    get.mockResolvedValue({
      success: true,
      data: resolvedChange("unresolved", { scope_repos: [] }),
    });
    const resolvedChanges = new Map<string, Change>([
      [
        "in-scope",
        resolvedChange("in-scope", {
          scope_repos: [
            {
              repo_id: "repo-1",
              repo_project_id: "rp-1",
              role: "primary",
              required: true,
            },
          ],
        }),
      ],
    ]);

    const filtered = await filterRecentChangesForProductScope(
      [recency("in-scope"), recency("unresolved")],
      store,
      "repo",
      resolvedChanges,
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("unresolved");
    expect(filtered.map((rc) => rc.id).sort()).toEqual([
      "in-scope",
      "unresolved",
    ]);
  });
});

// =============================================================================
// Request-owned immutable candidate enrichment patches
// (fixHealthViewTimeouts SC5 / AC7 / AC9 / AC10)
// =============================================================================

describe("buildCandidateEnrichmentPatch request-owned immutable patches", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("returns a patch without mutating the input candidate or recommendations", async () => {
    tempDir = await createTempDir();
    const { store } = mockStore(tempDir);
    const rc = recency("change-a");
    const rcBefore = { ...rc };
    const status: StatusRecommendationCarrier = { recommendations: [] };
    const recsBefore = status.recommendations;

    const patch = await buildCandidateEnrichmentPatch({
      rc,
      store,
      clarifyMode: "off",
      isPrimary: false,
      resolved: { change: resolvedChange("change-a") },
      cutoffAt: Date.now() + 10_000,
      rank: 0,
    });

    expect(rc).toEqual(rcBefore);
    expect(status.recommendations).toBe(recsBefore);
    expect(patch).toMatchObject({
      changeId: "change-a",
      rank: 0,
      candidate: expect.any(Object),
      recommendations: expect.any(Array),
      outcome: expect.any(Object),
    });
  });

  it("reuses the resolved document and proposal without store or artifact reads", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    const rc = recency("change-a");

    const patch = await buildCandidateEnrichmentPatch({
      rc,
      store,
      clarifyMode: "off",
      isPrimary: true,
      resolved: { change: resolvedChange("change-a") },
      cutoffAt: Date.now() + 10_000,
      rank: 0,
    });

    expect(get).not.toHaveBeenCalled();
    expect(patch.candidate._contextSnapshot).toBeDefined();
    expect(patch.recommendations.length).toBeGreaterThan(0);
    expect(patch.recommendations.some((r) => r.kind === "next_gate")).toBe(
      true,
    );
    expect(patch.outcome.kind).toBe("ok");
  });

  it("shares cutoff with parent/dependency reads and resolves parent context from the map", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    const parent = resolvedChange("parent-change", { status: "archived" });
    const child = resolvedChange("child-change", {
      fast_follow_of: {
        parent_change_id: "parent-change",
        relationship: "follows_release",
      },
    });
    const resolvedChanges = new Map<string, Change>([
      ["parent-change", parent],
      ["child-change", child],
    ]);
    const rc = recency("child-change");

    const patch = await buildCandidateEnrichmentPatch({
      rc,
      store,
      clarifyMode: "off",
      isPrimary: false,
      resolved: { change: child, resolvedChanges },
      cutoffAt: Date.now() + 10_000,
      rank: 0,
    });

    expect(get).not.toHaveBeenCalled();
    expect(patch.candidate.parent_change_id).toBe("parent-change");
    const nextGate = patch.recommendations.find((r) => r.kind === "next_gate");
    expect(nextGate?.title).toContain("Hot change `child-change`");
    expect(patch.outcome.kind).toBe("ok");
  });

  it("does not launch store or artifact reads after cutoff", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    const rc = recency("change-b");

    const patch = await buildCandidateEnrichmentPatch({
      rc,
      store,
      clarifyMode: "off",
      isPrimary: false,
      // No resolved change, so the legacy path would read the store.
      cutoffAt: Date.now() - 1,
      rank: 0,
    });

    expect(get).not.toHaveBeenCalled();
    expect(patch.candidate).toEqual({});
    expect(patch.recommendations).toEqual([]);
    expect(patch.outcome.kind).toBe("not_admitted");
    expect(patch.outcome.evidence).toMatch(/cutoff|deadline|not_admitted/i);
  });

  it("returns a timeout/not-admitted patch that cannot mutate the candidate", async () => {
    tempDir = await createTempDir();
    const { store } = mockStore(tempDir);
    const rc = recency("change-c");
    const rcBefore = { ...rc };
    const status: StatusRecommendationCarrier = { recommendations: [] };
    const recsBefore = status.recommendations;

    const patch = await buildCandidateEnrichmentPatch({
      rc,
      store,
      clarifyMode: "off",
      isPrimary: false,
      cutoffAt: Date.now() - 1,
      rank: 0,
    });

    expect(rc).toEqual(rcBefore);
    expect(status.recommendations).toBe(recsBefore);
    expect(["timeout", "not_admitted"]).toContain(patch.outcome.kind);
    expect(patch.candidate).toEqual({});
    expect(patch.recommendations).toEqual([]);
  });

  it("emits a candidate outcome compatible with the _health_execution source schema", async () => {
    tempDir = await createTempDir();
    const { store } = mockStore(tempDir);
    const rc = recency("change-d");

    const patch = await buildCandidateEnrichmentPatch({
      rc,
      store,
      clarifyMode: "off",
      isPrimary: false,
      resolved: { change: resolvedChange("change-d") },
      cutoffAt: Date.now() + 10_000,
      rank: 0,
    });

    expect(patch.outcome).toHaveProperty("kind");
    expect([
      "ok",
      "stale",
      "timeout",
      "error",
      "unavailable",
      "not_admitted",
    ]).toContain(patch.outcome.kind);
    expect(patch.outcome).toHaveProperty("elapsedMs");
    expect(typeof patch.outcome.elapsedMs).toBe("number");
    if (patch.outcome.evidence) {
      expect(typeof patch.outcome.evidence).toBe("string");
    }
  });

  it("keeps candidate evidence bounded, stable, and privacy-safe", async () => {
    tempDir = await createTempDir();
    const { store } = mockStore(tempDir);
    const rc = recency("change-e");

    const patch = await buildCandidateEnrichmentPatch({
      rc,
      store,
      clarifyMode: "off",
      isPrimary: false,
      cutoffAt: Date.now() - 1,
      rank: 0,
    });

    const evidence = patch.outcome.evidence ?? "";
    expect(evidence.length).toBeLessThanOrEqual(200);
    expect(evidence).not.toContain(tempDir);
    expect(evidence).not.toMatch(/\/.*\/.*/); // no absolute paths
    expect(evidence).toMatch(/cutoff|deadline|not_admitted/i);
  });
});

describe("applyCandidateEnrichmentPatches ranked reduction", () => {
  it("reduces settled patches in rank order and skips timed-out/not-admitted patches", () => {
    const candidates = [recency("c-1"), recency("c-2")];
    const status: StatusRecommendationCarrier = { recommendations: [] };
    const patches: CandidateEnrichmentPatch[] = [
      {
        changeId: "c-2",
        rank: 1,
        candidate: { parent_change_id: "p-2" },
        recommendations: [
          {
            kind: "next_gate",
            priority: "medium",
            title: "c-2 rec",
            detail: "d",
            action: "a",
            source: "gate",
          } as StatusRecommendationItem,
        ],
        outcome: { kind: "ok", elapsedMs: 1 },
      },
      {
        changeId: "c-1",
        rank: 0,
        candidate: { parent_change_id: "p-1" },
        recommendations: [
          {
            kind: "next_gate",
            priority: "medium",
            title: "c-1 rec",
            detail: "d",
            action: "a",
            source: "gate",
          } as StatusRecommendationItem,
        ],
        outcome: { kind: "ok", elapsedMs: 1 },
      },
      {
        changeId: "c-3",
        rank: 2,
        candidate: { parent_change_id: "p-3" },
        recommendations: [],
        outcome: {
          kind: "not_admitted",
          elapsedMs: 1,
          evidence: "cutoff",
        },
      },
    ];

    const result = applyCandidateEnrichmentPatches({
      patches,
      candidates,
      status,
    });

    expect(result.candidates[0].parent_change_id).toBe("p-1");
    expect(result.candidates[1].parent_change_id).toBe("p-2");
    expect(result.candidates.length).toBe(2);
    expect(result.recommendations).toBe(2);
    expect(result.omittedCount).toBe(1);
    expect(result.omittedSample).toEqual(["c-3"]);
    expect(status.recommendations).toHaveLength(2);
    expect(status.recommendations[0]).toContain("c-1 rec");
  });

  it("preserves required fields and existing _freshness when applying patches", () => {
    const candidates = [
      {
        ...recency("c-1"),
        _freshness: { cached_at: "2026-01-01T00:00:00Z" },
      },
    ];
    const status: StatusRecommendationCarrier & {
      _freshness?: Record<string, unknown>;
    } = {
      recommendations: [],
      _freshness: { temporal_health: { stale: false } },
    };
    const patches: CandidateEnrichmentPatch[] = [
      {
        changeId: "c-1",
        rank: 0,
        candidate: { _contextSnapshot: { snapshot: true } },
        recommendations: [],
        outcome: { kind: "ok", elapsedMs: 1 },
      },
    ];

    const result = applyCandidateEnrichmentPatches({
      patches,
      candidates: candidates as ChangeRecency[],
      status,
    });

    expect(result.candidates[0].id).toBe("c-1");
    expect(result.candidates[0].title).toBe("Change c-1");
    expect(result.candidates[0].status).toBe("active");
    expect(result.candidates[0].minutesSinceActivity).toBe(5);
    expect(
      (result.candidates[0] as unknown as { _contextSnapshot?: unknown })
        ._contextSnapshot,
    ).toEqual({ snapshot: true });
    expect(status._freshness).toEqual({ temporal_health: { stale: false } });
  });
});

describe("enrichRecentChangeStatus summary/hygiene compatibility regression", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("still mutates the candidate with required fields for summary and hygiene views", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    const rc = recency("change-f");
    const status: StatusRecommendationCarrier = { recommendations: [] };
    const change = resolvedChange("change-f", {
      epic_membership: {
        epic_id: "epic-1",
        title: "Epic",
        entry_id: "entry-1",
      },
    });

    await enrichRecentChangeStatus(rc, status, store, "off", false, { change });

    expect(get).not.toHaveBeenCalled();
    expect(rc._contextSnapshot).toBeDefined();
    expect(rc.parent_change_id).toBeUndefined();
    expect(
      (
        rc as unknown as {
          epic?: { id: string; title: string; entry_id: string };
        }
      ).epic,
    ).toEqual({
      id: "epic-1",
      title: "Epic",
      entry_id: "entry-1",
    });
    expect(status.recommendations.length).toBeGreaterThan(0);
  });
});

describe("appendResumeFreshnessRecommendation", () => {
  function buildTarget() {
    const target: StatusRecommendationCarrier = { recommendations: [] };
    return {
      target,
      items: () => target.recommendation_items ?? [],
    };
  }

  it("emits recommendation for single HIGH-confidence archived_duplicate", () => {
    const { target, items } = buildTarget();
    appendResumeFreshnessRecommendation(target, "currentId", {
      findings: [
        {
          code: "resume:archived_duplicate",
          label: "repo_backed_fact",
          summary: "shares 2 caps + 4 paths",
          evidenceChangeIds: ["archivedDup"],
        },
      ],
      skipped: false,
    });

    const recs = items();
    expect(recs).toHaveLength(1);
    expect(recs[0].source).toBe("resume_freshness");
    expect(recs[0].priority).toBe("high");
    expect(recs[0].message).toContain("ADV does not auto-execute");
    expect(recs[0].message).toContain("adv_change_close");
    expect(recs[0].message).toContain("supersededBy: currentId");
    expect(recs[0].message).toContain("archivedDup");
  });

  it("emits NO recommendation for multiple HIGH-confidence findings (ambiguous)", () => {
    const { target, items } = buildTarget();
    appendResumeFreshnessRecommendation(target, "currentId", {
      findings: [
        {
          code: "resume:archived_duplicate",
          label: "repo_backed_fact",
          summary: "x",
          evidenceChangeIds: ["dup1"],
        },
        {
          code: "resume:archived_duplicate",
          label: "repo_backed_fact",
          summary: "y",
          evidenceChangeIds: ["dup2"],
        },
      ],
      skipped: false,
    });

    expect(items()).toEqual([]);
  });

  it("emits NO recommendation for zero HIGH-confidence findings", () => {
    const { target, items } = buildTarget();
    appendResumeFreshnessRecommendation(target, "currentId", {
      findings: [
        {
          code: "resume:archived_duplicate",
          label: "judgment_call",
          summary: "x",
          evidenceChangeIds: ["dup1"],
        },
      ],
      skipped: false,
    });

    expect(items()).toEqual([]);
  });

  it("emits NO recommendation when skipped=true", () => {
    const { target, items } = buildTarget();
    appendResumeFreshnessRecommendation(target, "currentId", {
      findings: [],
      skipped: true,
    });

    expect(items()).toEqual([]);
  });

  it("wording guard: NEVER uses 'one-click' or 'button-click'", () => {
    const { target, items } = buildTarget();
    appendResumeFreshnessRecommendation(target, "currentId", {
      findings: [
        {
          code: "resume:archived_duplicate",
          label: "repo_backed_fact",
          summary: "x",
          evidenceChangeIds: ["dup1"],
        },
      ],
      skipped: false,
    });

    const recs = items();
    expect(recs).toHaveLength(1);
    const msg = recs[0].message ?? "";
    const action = recs[0].action ?? "";
    expect(msg).not.toMatch(/one-click/i);
    expect(msg).not.toMatch(/button-click/i);
    expect(action).not.toMatch(/one-click/i);
    expect(action).not.toMatch(/button-click/i);
  });
});

// =============================================================================
// Resume projection recommendation integration (AC9)
// =============================================================================

describe("appendResumeProjectionRecommendations", () => {
  function mockStore(overrides: {
    changes?: Change[];
    epics?: Array<{ id: string; title: string; entries: unknown[] }>;
  }): Store {
    const changes = overrides.changes ?? [];
    const epics = overrides.epics ?? [];
    return {
      paths: { external: "/tmp/proj" },
      changes: {
        list: async () => ({
          changes: changes.map((c) => ({ ...c, recency: "hot" as const })),
        }),
        get: async (id: string) => {
          const change = changes.find((c) => c.id === id);
          return change
            ? { success: true as const, data: change, source: "test" as const }
            : {
                success: false as const,
                error: "not found",
                type: "not_found" as const,
              };
        },
      },
      epics: {
        list: async () => epics,
      },
    } as unknown as Store;
  }

  it("emits resume recommendations for an unblocked ready shell", async () => {
    const store = mockStore({
      changes: [],
      epics: [
        {
          id: "epicReady",
          title: "Ready Epic",
          entries: [
            {
              kind: "shell",
              entry_id: "shell-1",
              order: 0,
              title: "First shell",
              success_hint: "do it",
              blocked_by: [],
            },
          ],
        },
      ],
    });

    const target: StatusRecommendationCarrier = { recommendations: [] };
    await appendResumeProjectionRecommendations(store, target, {
      projectId: "proj",
    });

    expect(target.recommendations.length).toBeGreaterThan(0);
    expect(
      target.recommendation_items?.some(
        (r) => r.source === "resume_projection",
      ),
    ).toBe(true);
    expect(target.recommendation_items?.some((r) => r.kind === "resume")).toBe(
      true,
    );
  });

  it("emits a blocked resume recommendation when a shell has a nonterminal prereq", async () => {
    const store = mockStore({
      changes: [
        {
          ...resolvedChange("changeA"),
          status: "active",
          lifecycleState: "open",
          same_project_dependencies: [],
        },
      ],
      epics: [
        {
          id: "epicBlocked",
          title: "Blocked Epic",
          entries: [
            {
              kind: "shell",
              entry_id: "shell-1",
              order: 0,
              title: "Blocked shell",
              success_hint: "do it",
              blocked_by: [{ kind: "change", change_id: "changeA" }],
            },
          ],
        },
      ],
    });

    const target: StatusRecommendationCarrier = { recommendations: [] };
    await appendResumeProjectionRecommendations(store, target, {
      projectId: "proj",
    });

    const items = target.recommendation_items ?? [];
    expect(items.some((r) => r.source === "resume_projection")).toBe(true);
    expect(
      items.some(
        (r) =>
          r.source === "resume_projection" &&
          (r.title.includes("blocked") || r.title.includes("Blocked")),
      ),
    ).toBe(true);
  });

  it("fetches nonterminal changes concurrently with bounded concurrency", async () => {
    const changes = Array.from({ length: 10 }, (_, i) => ({
      ...resolvedChange(`change-${i}`),
      status: "active" as const,
      lifecycleState: "open" as const,
      same_project_dependencies: [],
    }));
    const store = mockStore({ changes });
    let inFlight = 0;
    let maxInFlight = 0;
    const originalGet = store.changes.get;
    store.changes.get = async (id: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return originalGet(id);
    };

    const target: StatusRecommendationCarrier = { recommendations: [] };
    await appendResumeProjectionRecommendations(store, target, {
      projectId: "proj",
    });

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(inFlight).toBe(0);
  });

  it("is advisory: failures do not throw", async () => {
    const store = {
      paths: { external: "/tmp/proj" },
      changes: {
        list: () => Promise.reject(new Error("store unavailable")),
      },
      epics: {
        list: async () => [],
      },
    } as unknown as Store;

    const target: StatusRecommendationCarrier = { recommendations: [] };
    await expect(
      appendResumeProjectionRecommendations(store, target, {
        projectId: "proj",
      }),
    ).resolves.toBeUndefined();
    expect(target.recommendations).toEqual([]);
  });
});
