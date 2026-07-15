import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import type { Store } from "../storage/store";
import { createDefaultGates, type Change, type ChangeRecency } from "../types";
import type { WorkflowDirective } from "../utils/workflow-directive";
import {
  buildNextGateRecommendationFromDirective,
  enrichRecentChangeStatus,
  filterRecentChangesForProductScope,
  getFastFollowParentContext,
  type StatusRecommendationCarrier,
} from "./status-enrich";

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

    // AC4 regression: no duplicate per-change Temporal read. readArtifact's
    // first step is also store.changes.get, so zero calls proves neither
    // the enrichment get nor the artifact read fired.
    expect(get).not.toHaveBeenCalled();
    expect(rc._contextSnapshot).toBeDefined();
    expect(rc._directive).toBeDefined();
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
    expect(nextGate?.title).toContain(
      "fast-follow of `parent-change (archived)`",
    );
  });

  it("falls back to store reads only when no resolved document is provided", async () => {
    tempDir = await createTempDir();
    const { store, get } = mockStore(tempDir);
    const doc = resolvedChange("change-b", { documents: undefined });
    get.mockResolvedValue({ success: true, data: doc });
    const status: StatusRecommendationCarrier = { recommendations: [] };
    const rc = recency("change-b");

    await enrichRecentChangeStatus(rc, status, store, "off", false);

    // Legacy path preserved: one read for enrichment plus one Temporal-first
    // read inside readArtifact before its disk/archive fallbacks.
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(1, "change-b");
    expect(get).toHaveBeenNthCalledWith(2, "change-b");
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
