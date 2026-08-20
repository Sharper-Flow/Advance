/**
 * Status Tool Tests
 *
 * Test adv_status lineage and recommendation behavior.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import {
  statusTools,
  _healthSnapshotCache,
  _statusProbeCaches,
  resetStatusHealthForTest,
} from "./status";
import { _healthRequestProbeCaches } from "./status-health-plan";
import {
  createTestProject,
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { createDiskStore } from "../storage/store";
import type { Store } from "../storage/store";
import { GATE_ORDER, createDefaultGates } from "../types";
import {
  initializeToolSchemaTelemetry,
  resetToolSchemaTelemetry,
} from "../utils/tool-schema-telemetry";
import {
  recordStepFinishTokens,
  resetCacheTokenTelemetry,
} from "../utils/cache-token-telemetry";
import { z } from "zod";
import {
  clearPendingDelete,
  incrementPendingDeleteAttempts,
  initStateDb as initWorktreeStateDb,
  recordPendingDeleteFailure,
  setPendingDelete,
} from "./worktree/state";

const {
  mockScanOpenCodeSessionDebt,
  mockGetWorktreeCensus,
  mockScanSnapshotHealth,
} = vi.hoisted(() => ({
  mockScanOpenCodeSessionDebt: vi.fn(),
  mockGetWorktreeCensus: vi.fn(),
  mockScanSnapshotHealth: vi.fn(),
}));

const {
  mockDetectArchivedMergedBranches,
  mockDetectDefaultBranch,
  mockGetCheckedOutChangeBranches,
  mockResolveRepoRoot,
} = vi.hoisted(() => ({
  mockDetectArchivedMergedBranches: vi.fn(),
  mockDetectDefaultBranch: vi.fn(),
  mockGetCheckedOutChangeBranches: vi.fn(),
  mockResolveRepoRoot: vi.fn(),
}));

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: mockGetWorktreeCensus,
}));

vi.mock("../utils/opencode-session-debt", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../utils/opencode-session-debt")>();
  return {
    ...actual,
    scanOpenCodeSessionDebt: mockScanOpenCodeSessionDebt,
  };
});

vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: mockScanSnapshotHealth,
}));

vi.mock("./archive-helpers/git-finalize", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./archive-helpers/git-finalize")>();
  return {
    ...actual,
    detectArchivedMergedBranches: mockDetectArchivedMergedBranches,
    detectDefaultBranch: mockDetectDefaultBranch,
    getCheckedOutChangeBranches: mockGetCheckedOutChangeBranches,
    resolveRepoRoot: mockResolveRepoRoot,
  };
});

const mockGetLaneProjections = vi.hoisted(() => vi.fn());
vi.mock("../utils/tool-lane-projection", () => ({
  getLaneProjections: mockGetLaneProjections,
  resetLaneProjectionsCache: () => {},
}));

describe("Status Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    mockScanOpenCodeSessionDebt.mockReset();
    mockGetWorktreeCensus.mockReset();
    mockGetWorktreeCensus.mockResolvedValue({
      total: 0,
      stale: [],
      records: [],
      warnings: [],
    });
    resetStatusHealthForTest();
    _healthRequestProbeCaches.clear();
    mockScanSnapshotHealth.mockReset();
    mockScanSnapshotHealth.mockResolvedValue({
      schema_version: 1,
      scan_duration_ms: 0,
      scope: "project",
      project_id: "unknown",
      summary: {
        projects_scanned: 0,
        bare_repos_scanned: 0,
        critical: 0,
        warnings: 0,
        info: 0,
      },
      findings: [],
    });
    mockScanOpenCodeSessionDebt.mockResolvedValue({
      available: false,
      db_path: "/missing/opencode.db",
      checked_at: "2026-05-02T02:30:00.000Z",
      reason: "not found",
      threshold_ms: 300_000,
      total_blank: 0,
      repairable_stale: [],
      live_in_flight: [],
      idle_active_session: [],
      orphan_ghost: [],
      ignored_with_parts: [],
    });
    mockDetectArchivedMergedBranches.mockReset();
    mockDetectArchivedMergedBranches.mockReturnValue({
      status: "ok",
      branches: [],
    });
    mockDetectDefaultBranch.mockReset();
    mockDetectDefaultBranch.mockReturnValue({
      branch: "main",
      source: "local-main",
    });
    mockResolveRepoRoot.mockReset();
    tempDir = await createTempDir();
    mockResolveRepoRoot.mockReturnValue(tempDir);
    mockGetCheckedOutChangeBranches.mockReset();
    mockGetCheckedOutChangeBranches.mockReturnValue({
      status: "ok",
      branches: new Set<string>(),
      worktreePaths: {},
    });
    mockGetLaneProjections.mockReset();
    mockGetLaneProjections.mockResolvedValue({
      "adv-ci-waiter": {
        availability: "unavailable" as const,
        enabled_tools: 0,
        schema_bytes: 0,
        approx_tokens_4char_rule: 0,
        conversion_errors: 0,
      },
      "adv-engineer": {
        availability: "unavailable" as const,
        enabled_tools: 0,
        schema_bytes: 0,
        approx_tokens_4char_rule: 0,
        conversion_errors: 0,
      },
    });
    await createTestProject(tempDir);
    store = await createDiskStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
    resetToolSchemaTelemetry();
    resetCacheTokenTelemetry();
    vi.useRealTimers();
  });

  describe("adv_status", () => {
    test("shows retained terminal cleanup blocker counts without exact paths", async () => {
      const access = await initWorktreeStateDb(tempDir);
      const retainedPath = join(tempDir, "status-retained");
      await mkdir(retainedPath, { recursive: true });
      await setPendingDelete(
        access,
        "change/status-retained",
        retainedPath,
        "worktree is still in use by a running process",
      );
      for (let i = 0; i < 5; i++) {
        await incrementPendingDeleteAttempts(access, "change/status-retained");
      }
      // Record the typed blocker so production classification is deterministic:
      // classifyPendingDelete returns lastErrorClass first, then falls back to
      // the reason string. Without this, the shared drain could classify the
      // fixture as worktree_not_found depending on runtime state.
      await recordPendingDeleteFailure(
        access,
        "change/status-retained",
        "WORKTREE_IN_USE",
        "worktree_in_use",
      );

      try {
        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.terminal_cleanup_retained).toMatchObject({
          total: 1,
          classes: { worktree_in_use: 1 },
        });
        expect(JSON.stringify(parsed.terminal_cleanup_retained)).not.toContain(
          retainedPath,
        );
      } finally {
        await clearPendingDelete(access, "change/status-retained");
      }
    });

    test("shows ↳ prefix for fast-follow changes in formatted output", async () => {
      // Create parent and child changes
      const { changeTools } = await import("./change");
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.formatted.activeSection).toContain("↳ childFollowUp");
    });

    test("recent fast-follow change remains visibly linked in status output", async () => {
      const { changeTools } = await import("./change");
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.formatted.activeSection).toContain("↳ childFollowUp");
    });

    test("active changes include compact Epic annotation", async () => {
      const { changeTools } = await import("./change");
      // Seed attach requires the Epic and entry to exist (D1 contract:
      // epic_id/entry_id select an existing entry; parent_epic_id creates one).
      await store.epics.create(
        "addAuthEpic",
        "Add OAuth",
        "OAuth rollout narrative.",
      );
      await store.epics.linkChange("addAuthEpic", {
        entryId: "en-001",
        changeId: "en-001-placeholder",
        title: "Add OAuth",
      });
      await changeTools.adv_change_create.execute(
        {
          summary: "Epic member change",
          epic_id: "addAuthEpic",
          entry_id: "en-001",
          epic_order: 0,
          epic_title: "Add OAuth",
        },
        store,
      );

      const result = await statusTools.adv_status.execute(
        { view: "changes" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.formatted.activeSection).toContain("addAuthEpic");
      const recent = parsed.changes.recent as Array<{ epic?: { id: string } }>;
      expect(recent[0]?.epic?.id).toBe("addAuthEpic");
    });

    test("stale pre-execution change keeps one canonical next-gate action", async () => {
      const gates = createDefaultGates();
      for (const gateId of ["proposal", "discovery", "design"] as const) {
        gates[gateId] = {
          status: "done",
          completed_at: "2026-01-01T00:00:00.000Z",
          completed_by: "test-user",
        };
      }
      await store.changes.save({
        id: "stalePlanningChange",
        title: "Stale Planning Change",
        status: "draft",
        created_at: "2026-01-01T00:00:00.000Z",
        tasks: [],
        deltas: {},
        gates,
      } as never);

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput<{ recommendations: string[] }>(result);
      const recs = parsed.recommendations.filter((r) =>
        r.includes("stalePlanningChange"),
      );

      expect(recs).toEqual(
        expect.arrayContaining([
          expect.stringContaining("resume from listed `planning` gate action"),
        ]),
      );
      expect(recs.join("\n")).not.toContain("/adv-apply stalePlanningChange");
    });

    test("stale execution-ready change does not duplicate its gate recommendation", async () => {
      const gates = createDefaultGates();
      for (const gateId of [
        "proposal",
        "discovery",
        "design",
        "planning",
      ] as const) {
        gates[gateId] = {
          status: "done",
          completed_at: "2026-01-01T00:00:00.000Z",
          completed_by: "test-user",
        };
      }
      await store.changes.save({
        id: "staleApplyChange",
        title: "Stale Apply Change",
        status: "draft",
        created_at: "2026-01-01T00:00:00.000Z",
        tasks: [],
        deltas: {},
        gates,
      } as never);

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput<{ recommendations: string[] }>(result);
      const text = parsed.recommendations
        .filter((r) => r.includes("staleApplyChange"))
        .join("\n");

      expect(text).toContain("resume from listed `execution` gate action");
      expect(
        text.match(/resume from listed `execution` gate action/g) ?? [],
      ).toHaveLength(1);
    });

    test("product-linked status defaults to current repo scoped changes", async () => {
      store.productContext = {
        currentRoot: tempDir,
        currentRepoId: "web",
        repoProjectId: "w".repeat(40),
        productId: "example-product",
        productProjectId: "b".repeat(40),
        primaryRoot: "/repo/backend",
        primaryRepoId: "backend",
        repos: {
          web: { id: "web", root: tempDir, repoProjectId: "w".repeat(40) },
          backend: {
            id: "backend",
            root: "/repo/backend",
            repoProjectId: "b".repeat(40),
          },
        },
        mode: "secondary",
        missingPrimaryPolicy: "block",
      };
      await store.changes.save({
        id: "webScoped",
        title: "Web scoped",
        status: "draft",
        created_at: "2026-05-10T00:00:00.000Z",
        tasks: [],
        deltas: {},
        scope_repos: [{ repo_id: "web", required: true }],
      } as never);
      await store.changes.save({
        id: "backendScoped",
        title: "Backend scoped",
        status: "draft",
        created_at: "2026-05-10T00:00:01.000Z",
        tasks: [],
        deltas: {},
        scope_repos: [{ repo_id: "backend", required: true }],
      } as never);

      const repoScoped = parseToolOutput(
        await statusTools.adv_status.execute({}, store),
      );
      expect(
        repoScoped.changes.recent.map((c: { id: string }) => c.id),
      ).toContain("webScoped");
      expect(
        repoScoped.changes.recent.map((c: { id: string }) => c.id),
      ).not.toContain("backendScoped");
      expect(repoScoped.product_context).toMatchObject({
        productId: "example-product",
        currentRepoId: "web",
        scope: "repo",
      });

      const productWide = parseToolOutput(
        await statusTools.adv_status.execute({ scope: "product" }, store),
      );
      expect(
        productWide.changes.recent.map((c: { id: string }) => c.id),
      ).toEqual(expect.arrayContaining(["webScoped", "backendScoped"]));
    });

    test("hot change recommendation distinguishes current worker from peer-owned work", async () => {
      const { _test } = await import("./status");
      const recommendations: string[] = [];

      _test.appendRecencyRecommendation(
        recommendations,
        {
          id: "selfHotChange",
          title: "Self hot change",
          status: "active",
          completedTasks: 0,
          taskCount: 1,
          lastActivityAt: new Date().toISOString(),
          minutesSinceActivity: 2,
          workerSessionId: "current-session",
        } as any,
        "selfHotChange",
        "current-session",
      );

      _test.appendRecencyRecommendation(
        recommendations,
        {
          id: "peerHotChange",
          title: "Peer hot change",
          status: "active",
          completedTasks: 0,
          taskCount: 1,
          lastActivityAt: new Date().toISOString(),
          minutesSinceActivity: 2,
          workerSessionId: "peer-session",
        } as any,
        "peerHotChange",
        "current-session",
      );

      expect(recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining("selfHotChange` is hot"),
          expect.stringContaining("you are the active worker"),
          expect.stringContaining("peerHotChange` is hot"),
          expect.stringContaining("another agent"),
        ]),
      );
      expect(
        recommendations.find((r) => r.includes("selfHotChange")),
      ).not.toContain("another agent");
    });

    test("recency recommendations emit structural kinds for grouping", async () => {
      const { _test } = await import("./status");
      const status = { recommendations: [] as string[] };

      _test.appendRecencyRecommendation(
        status,
        {
          id: "staleChange",
          title: "Stale change",
          status: "active",
          completedTasks: 1,
          taskCount: 3,
          lastActivityAt: new Date().toISOString(),
          minutesSinceActivity: 240,
        } as any,
        "staleChange",
        undefined,
        "execution",
      );

      expect(status.recommendations[0]).toContain("Stale change");
      expect(status.recommendation_items).toEqual([
        expect.objectContaining({
          kind: "stale",
          source: "recency",
          priority: "medium",
          changeId: "staleChange",
          gateId: "execution",
        }),
      ]);
    });

    test("suppresses clarify recommendation when all gates complete", async () => {
      // Vague proposal that triggers ≥2 clarify-readiness findings:
      // missing Scope section plus vague/assumption-heavy content.
      const vagueProposal = `# Completed Vague Change

## Summary

Did some work.

## Notes

No success criteria, no scope section.
`;

      const allGatesDone = Object.fromEntries(
        GATE_ORDER.map((g) => [
          g,
          {
            status: "done" as const,
            completed_at: "2026-01-21T00:00:00Z",
            completed_by: "test-user",
          },
        ]),
      );

      const completedChange = {
        $schema: "https://advance.dev/schemas/change.v1.json",
        id: "completedVagueChange",
        title: "Completed Vague Change",
        status: "active",
        created_at: "2026-01-20T00:00:00Z",
        tasks: [],
        deltas: {},
        gates: allGatesDone,
      };

      await mkdir(join(tempDir, ".adv/changes/completedVagueChange"), {
        recursive: true,
      });
      await writeFile(
        join(tempDir, ".adv/changes/completedVagueChange/change.json"),
        JSON.stringify(completedChange, null, 2),
      );
      await writeFile(
        join(tempDir, ".adv/changes/completedVagueChange/proposal.md"),
        vagueProposal,
      );
      await store.sync();

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput<{ recommendations: string[] }>(result);

      const ambiguityRec = parsed.recommendations.find((r) =>
        r.includes("ambiguity finding"),
      );
      const completedAmbiguityRec = parsed.recommendations.find(
        (r) =>
          r.includes("ambiguity finding") && r.includes("completedVagueChange"),
      );

      // No clarify recommendation should fire for the fully-gated change.
      expect(completedAmbiguityRec).toBeUndefined();
      // Sanity: if any ambiguity rec exists at all, it must not be ours.
      if (ambiguityRec) {
        expect(ambiguityRec).not.toContain("completedVagueChange");
      }
    });

    test("emits clarify recommendation when at least one gate incomplete", async () => {
      // Same vague proposal, but gates pending — recommendation should fire.
      const vagueProposal = `# In-Flight Vague Change

## Summary

Vague in-flight work.
`;

      const inFlightChange = {
        $schema: "https://advance.dev/schemas/change.v1.json",
        id: "inFlightVagueChange",
        title: "In-Flight Vague Change",
        status: "active",
        created_at: "2026-01-20T00:00:00Z",
        tasks: [],
        deltas: {},
        gates: createDefaultGates(),
      };

      await mkdir(join(tempDir, ".adv/changes/inFlightVagueChange"), {
        recursive: true,
      });
      await writeFile(
        join(tempDir, ".adv/changes/inFlightVagueChange/change.json"),
        JSON.stringify(inFlightChange, null, 2),
      );
      await writeFile(
        join(tempDir, ".adv/changes/inFlightVagueChange/proposal.md"),
        vagueProposal,
      );
      await store.sync();

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput<{ recommendations: string[] }>(result);

      const ambiguityRec = parsed.recommendations.find(
        (r) =>
          r.includes("ambiguity finding") && r.includes("inFlightVagueChange"),
      );
      expect(ambiguityRec).toBeDefined();
      expect(ambiguityRec).toContain("/adv-clarify inFlightVagueChange");
    });

    test("recommendation annotates terminal parent", async () => {
      const { changeTools } = await import("./change");
      const parentResult = await changeTools.adv_change_create.execute(
        { summary: "Parent change" },
        store,
      );
      const parentParsed = parseToolOutput(parentResult);

      // Move parent to a terminal state (closed)
      await store.changes.close(parentParsed.changeId, {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "User cancelled",
        approved_at: new Date().toISOString(),
      });

      await changeTools.adv_change_create.execute(
        {
          summary: "Child follow-up",
          parent_change_id: parentParsed.changeId,
        },
        store,
      );

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(parsed.formatted.activeSection).toContain("↳ childFollowUp");
    });

    test("confines OpenCode session debt to hygiene view when stale rows exist", async () => {
      mockScanOpenCodeSessionDebt.mockResolvedValue({
        available: true,
        db_path: "/home/user/.local/share/opencode/opencode.db",
        checked_at: "2026-05-02T02:30:00.000Z",
        threshold_ms: 300_000,
        total_blank: 1,
        repairable_stale: [
          {
            id: "msg-stale",
            session_id: "ses-stale",
            created_ms: 1,
            part_count: 0,
            age_ms: 301_000,
          },
        ],
        orphan_ghost: [
          {
            id: "msg-stale",
            session_id: "ses-stale",
            created_ms: 1,
            part_count: 0,
            age_ms: 301_000,
          },
        ],
        live_in_flight: [],
        idle_active_session: [],
        ignored_with_parts: [],
      });

      const hygieneResult = await statusTools.adv_status.execute(
        { view: "hygiene" },
        store,
      );
      const hygiene = parseToolOutput(hygieneResult);

      expect(hygiene.opencode_session_debt.available).toBe(true);
      expect(hygiene.opencode_session_debt.orphan_ghost).toHaveLength(1);
      expect(hygiene.formatted.sessionDebtSection).toContain(
        "1 orphan ghost blank assistant",
      );

      const summaryResult = await statusTools.adv_status.execute(
        { view: "summary" },
        store,
      );
      const summary = parseToolOutput(summaryResult);
      expect(summary.opencode_session_debt).toBeUndefined();
      expect(
        (summary.recommendations as string[] | undefined)?.find((r: string) =>
          r.includes("OpenCode blank assistant session debt detected"),
        ),
      ).toBeUndefined();
      expect(mockScanOpenCodeSessionDebt).toHaveBeenCalledTimes(1);
      expect(summary.recommendations as string[]).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("Stale OpenCode blank assistant messages"),
        ]),
      );
      expect(summary.recommendations as string[]).not.toEqual(
        expect.arrayContaining([expect.stringContaining("before deletion")]),
      );
    });

    test("summary view does not invoke detailed-only providers or formatted sections", async () => {
      const result = await statusTools.adv_status.execute(
        { view: "summary" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.view).toBe("summary");
      expect(mockScanOpenCodeSessionDebt).not.toHaveBeenCalled();
      expect(mockScanSnapshotHealth).not.toHaveBeenCalled();
      expect(mockGetWorktreeCensus).not.toHaveBeenCalled();
      expect(parsed.opencode_session_debt).toBeUndefined();
      expect(parsed.snapshot_health).toBeUndefined();
      expect(parsed.formatted.healthSection).toBe("");
      expect(parsed.formatted.worktreeSection).toBe("");
      expect(parsed.formatted.sessionDebtSection).toBe("");
      expect(parsed.formatted.peerSessionsSection).toBe("");
    });

    test("health view includes worker role and stability feature flag defaults", async () => {
      const result = await statusTools.adv_status.execute(
        { view: "health" },
        store,
      );
      const health = parseToolOutput(result);

      expect(health.feature_flags).toMatchObject({
        worker_singleton_enforce: false,
        // rq-autoManageAdvWorktrees AC2 — default flipped to true.
        worktree_guard_enforce: true,
      });
    });

    // rq-autoManageAdvWorktrees AC2
    test("health view surfaces feature_flag_sources marking each flag default | explicit", async () => {
      const result = await statusTools.adv_status.execute(
        { view: "health" },
        store,
      );
      const health = parseToolOutput(result);

      expect(health.feature_flag_sources).toBeDefined();
      // Each key in feature_flags has a corresponding source entry that is
      // either "default" (no explicit project.json override), "explicit"
      // (set in project.json), or "invalid_fallback" (non-boolean value
      // provided and was coerced to the default). The fixture does not set
      // invalid values, so only default/explicit are expected here.
      for (const key of Object.keys(health.feature_flags)) {
        expect(["default", "explicit", "invalid_fallback"]).toContain(
          health.feature_flag_sources[key],
        );
      }
      // Both worktree_guard_enforce and worker_singleton_enforce always
      // resolve (they have withStabilityFeatureDefaults coverage), so their
      // source entries must be present.
      expect(health.feature_flag_sources.worktree_guard_enforce).toMatch(
        /^(default|explicit|invalid_fallback)$/,
      );
      expect(health.feature_flag_sources.worker_singleton_enforce).toMatch(
        /^(default|explicit|invalid_fallback)$/,
      );
    });

    test("health view surfaces auto_managed_changes census from recent changes", async () => {
      const result = await statusTools.adv_status.execute(
        { view: "health" },
        store,
      );
      const health = parseToolOutput(result);

      expect(health.auto_managed_changes).toBeDefined();
      expect(typeof health.auto_managed_changes.auto).toBe("number");
      expect(typeof health.auto_managed_changes.legacy).toBe("number");
      expect(typeof health.auto_managed_changes.unmigrated).toBe("number");
      // The empty-fixture store has no recent changes — all counts are 0.
      const total =
        health.auto_managed_changes.auto +
        health.auto_managed_changes.legacy +
        health.auto_managed_changes.unmigrated;
      expect(total).toBeGreaterThanOrEqual(0);
    });

    test("does not emit debt recommendation for live-only blank rows", async () => {
      mockScanOpenCodeSessionDebt.mockResolvedValueOnce({
        available: true,
        db_path: "/home/user/.local/share/opencode/opencode.db",
        checked_at: "2026-05-02T02:30:00.000Z",
        threshold_ms: 300_000,
        total_blank: 1,
        repairable_stale: [],
        orphan_ghost: [],
        live_in_flight: [
          {
            id: "msg-live",
            session_id: "ses-live",
            created_ms: 1,
            part_count: 0,
            age_ms: 1_000,
          },
        ],
        idle_active_session: [],
        ignored_with_parts: [],
      });

      const result = await statusTools.adv_status.execute(
        { view: "hygiene" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.opencode_session_debt.live_in_flight).toHaveLength(1);
      expect(parsed.formatted.sessionDebtSection).toContain("1 live/in-flight");
      const summaryResult = await statusTools.adv_status.execute(
        { view: "summary" },
        store,
      );
      const summary = parseToolOutput(summaryResult);
      expect(
        (summary.recommendations as string[] | undefined)?.find((r: string) =>
          r.includes("Stale OpenCode blank assistant messages"),
        ),
      ).toBeUndefined();
    });

    describe("plugin runtime diagnostics", () => {
      test("health view includes loaded plugin runtime diagnostic", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.plugin_runtime).toEqual(
          expect.objectContaining({
            loaded_module_path: expect.any(String),
            process_started_at: expect.any(String),
            reload_caveat: expect.stringContaining("Restart OpenCode"),
          }),
        );
      });

      test("health view includes plugin bundle generation freshness", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.plugin_runtime).toBeDefined();
        expect(parsed.plugin_runtime).toHaveProperty(
          "plugin_bundle_manifest_path",
        );
        expect(parsed.plugin_runtime.plugin_bundle_manifest_path).toContain(
          "plugin-bundle-manifest.json",
        );
        expect(parsed.plugin_runtime).toHaveProperty(
          "loaded_plugin_generation",
        );
        expect(parsed.plugin_runtime).toHaveProperty(
          "deployed_plugin_generation",
        );
        expect(parsed.plugin_runtime).toHaveProperty("plugin_bundle_freshness");
        expect(["current", "stale", "unknown"]).toContain(
          parsed.plugin_runtime.plugin_bundle_freshness,
        );
        expect(parsed.plugin_runtime).toHaveProperty("plugin_bundle_recovery");
      });
    });

    describe("_healthSnapshot", () => {
      beforeEach(() => {
        resetStatusHealthForTest();
        _healthRequestProbeCaches.clear();
      });

      test("includes _healthSnapshot with disk leak metrics", async () => {
        // Closed change with NO archive bundle → leaked_source_dirs
        await mkdir(join(tempDir, ".adv/changes/closedNoArchive"), {
          recursive: true,
        });
        await writeFile(
          join(tempDir, ".adv/changes/closedNoArchive/change.json"),
          JSON.stringify({
            $schema: "https://advance.dev/schemas/change.v1.json",
            id: "closedNoArchive",
            title: "Closed No Archive",
            status: "closed",
            created_at: "2026-01-20T00:00:00Z",
            tasks: [],
            deltas: {},
          }),
        );

        // Closed change WITH archive bundle → NOT leaked
        await mkdir(join(tempDir, ".adv/changes/closedWithArchive"), {
          recursive: true,
        });
        await writeFile(
          join(tempDir, ".adv/changes/closedWithArchive/change.json"),
          JSON.stringify({
            $schema: "https://advance.dev/schemas/change.v1.json",
            id: "closedWithArchive",
            title: "Closed With Archive",
            status: "closed",
            created_at: "2026-01-20T00:00:00Z",
            tasks: [],
            deltas: {},
          }),
        );
        await mkdir(
          join(tempDir, ".adv/archive/2026-01-01-closedWithArchive"),
          { recursive: true },
        );
        await writeFile(
          join(
            tempDir,
            ".adv/archive/2026-01-01-closedWithArchive/change.json",
          ),
          JSON.stringify({ id: "closedWithArchive", status: "archived" }),
        );

        // Archived change still in source dir → leaked_archived_source_dirs
        await mkdir(join(tempDir, ".adv/changes/archivedLeak"), {
          recursive: true,
        });
        await writeFile(
          join(tempDir, ".adv/changes/archivedLeak/change.json"),
          JSON.stringify({
            $schema: "https://advance.dev/schemas/change.v1.json",
            id: "archivedLeak",
            title: "Archived Leak",
            status: "archived",
            created_at: "2026-01-20T00:00:00Z",
            tasks: [],
            deltas: {},
          }),
        );

        await store.sync();

        const result = await statusTools.adv_status.execute(
          { view: "hygiene" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed._healthSnapshot).toBeDefined();
        expect(parsed._healthSnapshot.leaked_source_dirs).toBe(1); // closedNoArchive only
        expect(parsed._healthSnapshot.leaked_archived_source_dirs).toBe(1); // archivedLeak
        expect(parsed._healthSnapshot.archive_dirs).toBe(1);
        // 2 closed / 1 active (addFeature from createTestProject)
        expect(parsed._healthSnapshot.closed_to_active_ratio).toBe(2);
      });

      test("caches _healthSnapshot for 30s", async () => {
        await mkdir(join(tempDir, ".adv/changes/closedCached"), {
          recursive: true,
        });
        await writeFile(
          join(tempDir, ".adv/changes/closedCached/change.json"),
          JSON.stringify({
            $schema: "https://advance.dev/schemas/change.v1.json",
            id: "closedCached",
            title: "Closed Cached",
            status: "closed",
            created_at: "2026-01-20T00:00:00Z",
            tasks: [],
            deltas: {},
          }),
        );
        await store.sync();

        const result1 = await statusTools.adv_status.execute(
          { view: "hygiene" },
          store,
        );
        const parsed1 = parseToolOutput(result1);
        expect(parsed1._healthSnapshot.leaked_source_dirs).toBe(1);

        // Delete the source dir; without cache, second call would report 0
        await rm(join(tempDir, ".adv/changes/closedCached"), {
          recursive: true,
          force: true,
        });
        await store.sync();

        const result2 = await statusTools.adv_status.execute(
          { view: "hygiene" },
          store,
        );
        const parsed2 = parseToolOutput(result2);
        expect(parsed2._healthSnapshot.leaked_source_dirs).toBe(1);
      });

      test("appends leak recommendation when closed_to_active_ratio > 5", async () => {
        // 6 closed + 1 active (addFeature) → ratio 6:1
        for (let i = 1; i <= 6; i++) {
          await mkdir(join(tempDir, `.adv/changes/closed${i}`), {
            recursive: true,
          });
          await writeFile(
            join(tempDir, `.adv/changes/closed${i}/change.json`),
            JSON.stringify({
              $schema: "https://advance.dev/schemas/change.v1.json",
              id: `closed${i}`,
              title: `Closed ${i}`,
              status: "closed",
              created_at: "2026-01-20T00:00:00Z",
              tasks: [],
              deltas: {},
            }),
          );
        }
        await store.sync();

        const result = await statusTools.adv_status.execute(
          { view: "hygiene" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed._healthSnapshot.closed_to_active_ratio).toBe(6);
        const leakRec = parsed.recommendations.find((r: string) =>
          r.includes("Closed-change disk leak detected"),
        );
        expect(leakRec).toBeDefined();
        expect(leakRec).toContain("ratio 6:1");
        expect(leakRec).toContain("adv_cleanup");
      });
    });

    // AC5 — view enum branches
    describe("view selector (AC5)", () => {
      test("default view is 'summary' (no view arg)", async () => {
        const result = await statusTools.adv_status.execute({}, store);
        const parsed = parseToolOutput(result);
        expect(parsed.view).toBe("summary");
      });

      test("summary view returns specs, changes, and recommendations", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "summary" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.view).toBe("summary");
        expect(parsed.specs).toBeDefined();
        expect(typeof parsed.specs.count).toBe("number");
        expect(parsed.changes).toBeDefined();
        expect(parsed.changes.recent).toBeDefined();
        expect(Array.isArray(parsed.recommendations)).toBe(true);

        // Detailed health providers MUST be omitted from summary.
        expect(parsed._healthSnapshot).toBeUndefined();
        expect(parsed.opencode_session_debt).toBeUndefined();
        expect(parsed.diagnostics).toBeUndefined();
      });

      test("summary view caps recent changes before enrichment and reports omitted counts", async () => {
        const recent = Array.from({ length: 120 }, (_, index) => ({
          id: `change-${index + 1}`,
          title: `Change ${index + 1}`,
          status: "active",
          minutesSinceActivity: index + 1,
          completedTasks: 0,
          taskCount: 1,
        }));
        store.status = vi.fn(async () => ({
          specs: { count: 1, capabilities: [] },
          changes: {
            active: 120,
            byStatus: {
              draft: 0,
              pending: 0,
              active: 120,
              archived: 0,
              closed: 0,
            },
            recent,
          },
          recommendations: Array.from(
            { length: 15 },
            (_, index) => `recommendation-${index + 1}`,
          ),
          recommendation_items: Array.from({ length: 15 }, (_, index) => ({
            kind: index % 2 === 0 ? "stale" : "clarify",
            priority: index % 2 === 0 ? "medium" : "high",
            changeId: `change-${index + 1}`,
            title: `recommendation-${index + 1}`,
            detail: "high-WIP fixture",
            action: 'adv_status view:"changes"',
            source: index % 2 === 0 ? "recency" : "clarify",
          })),
        }));
        const getSpy = vi.spyOn(store.changes, "get");

        const result = await statusTools.adv_status.execute(
          { view: "summary" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.changes.recent).toHaveLength(10);
        expect(parsed.changes.omitted).toBe(110);
        expect(getSpy).toHaveBeenCalledTimes(10);
        expect(parsed.recommendations).toHaveLength(11);
        expect(parsed.recommendations[10]).toContain(
          "additional recommendation(s) omitted from summary view",
        );
        expect(parsed.recommendations_omitted).toBe(5);
        expect(parsed.recommendation_summary).toMatchObject({
          total: 15,
          omitted: expect.any(Number),
        });
        expect(parsed.recommendation_groups).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ kind: "clarify", total: 7 }),
            expect.objectContaining({ kind: "stale", total: 8 }),
          ]),
        );
      });

      test("changes view keeps full recent-change drilldown uncapped", async () => {
        const recent = Array.from({ length: 120 }, (_, index) => ({
          id: `change-${index + 1}`,
          title: `Change ${index + 1}`,
          status: "active",
          minutesSinceActivity: index + 1,
          completedTasks: 0,
          taskCount: 1,
        }));
        store.status = vi.fn(async () => ({
          specs: { count: 1, capabilities: [] },
          changes: {
            active: 120,
            byStatus: {
              draft: 0,
              pending: 0,
              active: 120,
              archived: 0,
              closed: 0,
            },
            recent,
          },
          recommendations: Array.from(
            { length: 15 },
            (_, index) => `recommendation-${index + 1}`,
          ),
        }));
        const getSpy = vi.spyOn(store.changes, "get");

        const result = await statusTools.adv_status.execute(
          { view: "changes" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.view).toBe("changes");
        expect(parsed.changes.recent).toHaveLength(120);
        expect(parsed.changes.omitted).toBeUndefined();
        expect(parsed.recommendations).toHaveLength(15);
        expect(parsed.recommendations_omitted).toBeUndefined();
        expect(getSpy).toHaveBeenCalledTimes(120);
      });

      test("health view returns diagnostics and tool-context telemetry", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.view).toBe("health");
        expect(parsed.opencode_session_debt).toBeUndefined();
        expect(parsed.diagnostics).toBeDefined();

        // T4: tool-context telemetry is surfaced in health view.
        expect(parsed.tool_context_telemetry).toBeDefined();
        expect(parsed.tool_context_telemetry.manifest).toBeDefined();
        expect(parsed.tool_context_telemetry.cache_tokens).toBeDefined();
        expect(parsed.tool_context_telemetry.limitations).toEqual(
          expect.arrayContaining([
            "Live per-request MCP tool counts are unavailable without upstream OpenCode support.",
          ]),
        );
      });

      test("health view surfaces tool_context_telemetry with manifest, cache tokens, lane projections, and limitation", async () => {
        // Seed the init-time schema manifest with a representative, measurable set.
        resetToolSchemaTelemetry();
        const manifest = initializeToolSchemaTelemetry([
          [
            "adv_status",
            { view: z.enum(["summary", "health", "changes", "hygiene"]) },
          ],
          ["adv_engineer", { taskId: z.string() }],
        ]);

        // Seed bounded numeric cache-token samples.
        resetCacheTokenTelemetry();
        recordStepFinishTokens({
          type: "step-finish",
          tokens: { input: 100, cache: { read: 10, write: 20 } },
        });
        recordStepFinishTokens({
          type: "step-finish",
          tokens: { input: 200, cache: { read: 20, write: 40 } },
        });

        // Mock the two representative lane projections: one available, one unavailable.
        mockGetLaneProjections.mockResolvedValue({
          "adv-ci-waiter": {
            availability: "available" as const,
            enabled_tools: 1,
            schema_bytes: manifest.tools.adv_status.schema_bytes,
            approx_tokens_4char_rule:
              manifest.tools.adv_status.approx_tokens_4char_rule,
            conversion_errors: 0,
          },
          "adv-engineer": {
            availability: "unavailable" as const,
            enabled_tools: 0,
            schema_bytes: 0,
            approx_tokens_4char_rule: 0,
            conversion_errors: 0,
          },
        });

        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.view).toBe("health");
        expect(parsed.tool_context_telemetry).toBeDefined();
        expect(parsed.tool_context_telemetry.manifest.total_tools).toBe(2);
        expect(parsed.tool_context_telemetry.manifest.total_schema_bytes).toBe(
          manifest.total_schema_bytes,
        );
        expect(parsed.tool_context_telemetry.cache_tokens.sample_count).toBe(2);
        expect(
          parsed.tool_context_telemetry.cache_tokens.total_input_tokens,
        ).toBe(300);
        expect(parsed.tool_context_telemetry.lane_projections).toMatchObject({
          "adv-ci-waiter": { availability: "available" },
          "adv-engineer": { availability: "unavailable" },
        });
        expect(parsed.tool_context_telemetry.limitations).toEqual(
          expect.arrayContaining([
            "Live per-request MCP tool counts are unavailable without upstream OpenCode support.",
          ]),
        );
      });

      test("changes view: returns full active changes detail", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "changes" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.view).toBe("changes");
        expect(parsed.changes).toBeDefined();
        expect(parsed.changes.recent).toBeDefined();
        // changes view also surfaces recommendations for next-step guidance.
        expect(Array.isArray(parsed.recommendations)).toBe(true);
      });

      test("hygiene view: returns _healthSnapshot + project_metadata + recommendations + session debt", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "hygiene" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.view).toBe("hygiene");
        expect(parsed._healthSnapshot).toBeDefined();
        expect(parsed.opencode_session_debt).toBeDefined();
        expect(parsed.project_metadata).toBeDefined();
        expect(Array.isArray(parsed.recommendations)).toBe(true);
      });

      test("hygiene view reports external-state artifacts as dry-run only", async () => {
        const oldXdg = process.env.XDG_DATA_HOME;
        const dataHome = join(tempDir, "xdg-data");
        const projectId = "proj-real";
        const externalRoot = join(
          dataHome,
          "opencode",
          "plugins",
          "advance",
          projectId,
        );
        const syntheticId = "0000000000000000abc123abc123abc123abc123";
        process.env.XDG_DATA_HOME = dataHome;

        let extStore: Store | null = null;
        try {
          await mkdir(join(externalRoot, ".adv"), { recursive: true });
          await mkdir(join(externalRoot, "db"), { recursive: true });
          await writeFile(join(externalRoot, "worker.lock"), "locked");
          await writeFile(
            join(externalRoot, "worker.lock.releasing"),
            "locked",
          );
          await mkdir(
            join(dataHome, "opencode", "plugins", "advance", syntheticId),
            { recursive: true },
          );
          await mkdir(join(dataHome, "opencode", "worktree", syntheticId), {
            recursive: true,
          });
          await mkdir(
            join(dataHome, "opencode", "worktree", projectId, "change"),
            { recursive: true },
          );

          extStore = await createDiskStore(tempDir, { externalRoot });

          const result = await statusTools.adv_status.execute(
            { view: "hygiene" },
            extStore,
          );
          const parsed = parseToolOutput(result);

          expect(parsed.external_state_hygiene).toMatchObject({
            dry_run_only: true,
            deletion_requires_approval: true,
            external_root: externalRoot,
            nested_adv_dir: true,
            stale_db_dir: true,
            worker_locks_excluded: true,
            synthetic_project_dirs: 0,
            synthetic_worktree_dirs: 0,
          });
          expect(
            parsed.external_state_hygiene.empty_worktree_prefix_dirs,
          ).not.toContain(
            join(dataHome, "opencode", "worktree", projectId, "change"),
          );
        } finally {
          extStore?.close();
          if (oldXdg === undefined) delete process.env.XDG_DATA_HOME;
          else process.env.XDG_DATA_HOME = oldXdg;
        }
      });

      test("health view exposes metrics counters (AC6)", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);
        expect(parsed.metrics).toBeDefined();
        expect(typeof parsed.metrics.adv_tool_calls).toBe("number");
        expect(typeof parsed.metrics.system_block_bytes).toBe("number");
        expect(typeof parsed.metrics.subagent_spawns).toBe("number");
        expect(typeof parsed.metrics.wall_time_ms).toBe("number");
        expect(parsed.metrics.adv_tool_call_count_by_name).toBeDefined();
        expect(parsed.metrics.adv_tool_durations).toBeDefined();
        expect(Array.isArray(parsed.metrics.recent_phase_durations)).toBe(true);
      });

      test("health view records named adv_status phase durations", async () => {
        const { resetMetrics } = await import("../utils/metrics");
        resetMetrics();
        await statusTools.adv_status.execute({ view: "health" }, store);
        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);
        const phases = parsed.metrics.recent_phase_durations as Array<{
          tool: string;
          phase: string;
          duration_ms: number;
        }>;
        const statusPhases = phases.filter((p) => p.tool === "adv_status");
        const phaseNames = new Set(statusPhases.map((p) => p.phase));
        expect(phaseNames.has("statusLoad")).toBe(true);
        expect(phaseNames.has("recentChangeEnrichment")).toBe(true);
        expect(phaseNames.has("formatOutput")).toBe(true);
        for (const p of statusPhases) {
          expect(typeof p.duration_ms).toBe("number");
          expect(p.duration_ms).toBeGreaterThanOrEqual(0);
        }
      });

      test("summary view does NOT expose metrics counters", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "summary" },
          store,
        );
        const parsed = parseToolOutput(result);
        expect(parsed.metrics).toBeUndefined();
      });

      test("formatted block is preserved across all views", async () => {
        for (const view of [
          "summary",
          "health",
          "changes",
          "hygiene",
        ] as const) {
          const result = await statusTools.adv_status.execute({ view }, store);
          const parsed = parseToolOutput(result);
          expect(parsed.formatted).toBeDefined();
        }
      });
    });

    describe("future_work projection (AC5)", () => {
      test("summary view surfaces Epic shells and backlog items with context_packet flags", async () => {
        const backlogPath = join(tempDir, ".adv", "backlog.jsonl");
        await mkdir(join(tempDir, ".adv"), { recursive: true });
        await writeFile(
          backlogPath,
          [
            JSON.stringify({ schemaVersion: 1 }),
            JSON.stringify({
              id: "backlog-with-packet",
              title: "Backlog with packet",
              success_hint: "do it",
              status: "active",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              context_packet: { background: "bg" },
            }),
            JSON.stringify({
              id: "backlog-without-packet",
              title: "Backlog without packet",
              success_hint: "do it",
              status: "active",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            }),
          ].join("\n") + "\n",
        );

        store.epics.list = vi.fn(async () => [
          {
            id: "epic-1",
            title: "Epic One",
            narrative: "narrative",
            entries: [
              {
                kind: "shell" as const,
                entry_id: "shell-with-packet",
                order: 0,
                title: "Shell with packet",
                success_hint: "hint",
                context_packet: { background: "bg" },
              },
              {
                kind: "shell" as const,
                entry_id: "shell-without-packet",
                order: 1,
                title: "Shell without packet",
                success_hint: "hint",
              },
              {
                kind: "change" as const,
                entry_id: "change-entry",
                order: 2,
                title: "Change entry",
                change_id: "change-1",
              },
            ],
          },
        ]);

        const result = await statusTools.adv_status.execute({}, store);
        const parsed = parseToolOutput(result);

        expect(parsed.future_work).toBeDefined();
        expect(parsed.future_work.shells).toEqual([
          {
            id: "shell-with-packet",
            title: "Shell with packet",
            has_context_packet: true,
          },
          {
            id: "shell-without-packet",
            title: "Shell without packet",
            has_context_packet: false,
          },
        ]);
        expect(parsed.future_work.backlog).toEqual([
          {
            id: "backlog-with-packet",
            title: "Backlog with packet",
            has_context_packet: true,
          },
          {
            id: "backlog-without-packet",
            title: "Backlog without packet",
            has_context_packet: false,
          },
        ]);
        // Change entries are not projected as future work.
        expect(
          parsed.future_work.shells.find(
            (s: { id: string }) => s.id === "change-entry",
          ),
        ).toBeUndefined();
      });

      test("changes view omits future_work", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "changes" },
          store,
        );
        const parsed = parseToolOutput(result);
        expect(parsed.future_work).toBeUndefined();
      });

      test("existing status keys remain unchanged when future_work is present", async () => {
        const result = await statusTools.adv_status.execute({}, store);
        const parsed = parseToolOutput(result);
        expect(parsed.view).toBe("summary");
        expect(parsed.specs).toBeDefined();
        expect(parsed.changes).toBeDefined();
        expect(Array.isArray(parsed.recommendations)).toBe(true);
        expect(parsed.formatted).toBeDefined();
      });
    });
    describe("archived branch hygiene (KD6)", () => {
      test("summary view skips archived branch hygiene inspection", async () => {
        store.changes.list = vi.fn(async () => ({
          changes: [
            {
              id: "archived-one",
              title: "Archived One",
              status: "archived" as const,
              created_at: "2026-01-01T00:00:00Z",
              lastActivityAt: "2026-01-01T00:00:00Z",
              taskCount: 0,
              completedTasks: 0,
            },
            {
              id: "archived-two",
              title: "Archived Two",
              status: "archived" as const,
              created_at: "2026-01-02T00:00:00Z",
              lastActivityAt: "2026-01-02T00:00:00Z",
              taskCount: 0,
              completedTasks: 0,
            },
          ],
        }));
        mockDetectArchivedMergedBranches.mockReturnValue({
          status: "ok",
          branches: [
            {
              changeId: "archived-one",
              branch: "change/archived-one",
              localSha: "abc123",
              mergeProof: { kind: "tree-identical", trunkCommitSha: "def456" },
            },
            {
              changeId: "archived-two",
              branch: "change/archived-two",
              localSha: "ghi789",
              mergeProof: { kind: "patch-equivalent" },
            },
          ],
        });

        const result = await statusTools.adv_status.execute(
          { view: "summary" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(store.changes.list).not.toHaveBeenCalledWith(
          expect.objectContaining({ status: "archived" }),
        );
        expect(mockDetectArchivedMergedBranches).not.toHaveBeenCalled();
        expect(parsed.archived_branch_hygiene).toBeUndefined();
        expect(
          (parsed.recommendations as string[] | undefined)?.find((r: string) =>
            /cleanup-ready:/.test(r),
          ),
        ).toBeUndefined();
      });

      test("summary view omits recommendation when no archived changes", async () => {
        store.changes.list = vi.fn(async () => ({ changes: [] }));

        const result = await statusTools.adv_status.execute(
          { view: "summary" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(
          (parsed.recommendations as string[] | undefined)?.find((r: string) =>
            /cleanup-ready:/.test(r),
          ),
        ).toBeUndefined();
        expect(mockDetectArchivedMergedBranches).not.toHaveBeenCalled();
      });

      test("hygiene view includes archived_branch_hygiene field with per-branch detail", async () => {
        store.changes.list = vi.fn(async () => ({
          changes: [
            {
              id: "archived-one",
              title: "Archived One",
              status: "archived" as const,
              created_at: "2026-01-01T00:00:00Z",
              lastActivityAt: "2026-01-01T00:00:00Z",
              taskCount: 0,
              completedTasks: 0,
            },
            {
              id: "archived-two",
              title: "Archived Two",
              status: "archived" as const,
              created_at: "2026-01-02T00:00:00Z",
              lastActivityAt: "2026-01-02T00:00:00Z",
              taskCount: 0,
              completedTasks: 0,
            },
          ],
        }));
        mockDetectArchivedMergedBranches.mockReturnValue({
          status: "ok",
          branches: [
            {
              changeId: "archived-one",
              branch: "change/archived-one",
              localSha: "abc123",
              mergeProof: { kind: "tree-identical", trunkCommitSha: "def456" },
            },
            {
              changeId: "archived-two",
              branch: "change/archived-two",
              localSha: "ghi789",
              mergeProof: { kind: "patch-equivalent" },
            },
          ],
        });

        const result = await statusTools.adv_status.execute(
          { view: "hygiene" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.archived_branch_hygiene).toBeDefined();
        expect(parsed.archived_branch_hygiene.count).toBe(2);
        expect(parsed.archived_branch_hygiene.branches).toHaveLength(2);
        expect(parsed.archived_branch_hygiene.branches[0]).toMatchObject({
          changeId: "archived-one",
          branch: "change/archived-one",
          mergeProof: { kind: "tree-identical", trunkCommitSha: "def456" },
        });
        expect(parsed.archived_branch_hygiene.branches[1]).toMatchObject({
          changeId: "archived-two",
          branch: "change/archived-two",
          mergeProof: { kind: "patch-equivalent" },
        });
        expect(parsed.recommendations).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /cleanup-ready: 2 archived-change local branch/,
            ),
          ]),
        );
      });

      test("hygiene recommendation excludes archived branches checked out in worktrees", async () => {
        store.changes.list = vi.fn(async () => ({
          changes: [
            {
              id: "archived-one",
              title: "Archived One",
              status: "archived" as const,
              created_at: "2026-01-01T00:00:00Z",
              lastActivityAt: "2026-01-01T00:00:00Z",
              taskCount: 0,
              completedTasks: 0,
            },
          ],
        }));
        mockDetectArchivedMergedBranches.mockReturnValue({
          status: "ok",
          branches: [
            {
              changeId: "archived-one",
              branch: "change/archived-one",
              localSha: "abc123",
              mergeProof: { kind: "patch-equivalent" },
            },
          ],
        });
        mockGetCheckedOutChangeBranches.mockReturnValue({
          status: "ok",
          branches: new Set(["change/archived-one"]),
          worktreePaths: { "change/archived-one": "/tmp/wt/archived-one" },
        });

        const result = await statusTools.adv_status.execute(
          { view: "hygiene" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.archived_branch_hygiene).toBeUndefined();
        expect(
          (parsed.recommendations as string[] | undefined)?.find((r: string) =>
            /cleanup-ready:/.test(r),
          ),
        ).toBeUndefined();
      });

      test("hygiene view short-circuits to no-op when no archived changes (performance)", async () => {
        store.changes.list = vi.fn(async () => ({ changes: [] }));

        const result = await statusTools.adv_status.execute(
          { view: "hygiene" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.archived_branch_hygiene).toBeUndefined();
        expect(mockDetectArchivedMergedBranches).not.toHaveBeenCalled();
      });

      test("health view does NOT call appender (orthogonal)", async () => {
        store.changes.list = vi.fn(async () => ({
          changes: [
            {
              id: "archived-one",
              title: "Archived One",
              status: "archived" as const,
              created_at: "2026-01-01T00:00:00Z",
              lastActivityAt: "2026-01-01T00:00:00Z",
              taskCount: 0,
              completedTasks: 0,
            },
          ],
        }));
        mockDetectArchivedMergedBranches.mockReturnValue({
          status: "ok",
          branches: [
            {
              changeId: "archived-one",
              branch: "change/archived-one",
              localSha: "abc123",
              mergeProof: { kind: "tree-identical", trunkCommitSha: "def456" },
            },
          ],
        });

        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(
          (parsed.recommendations as string[] | undefined)?.find((r: string) =>
            /cleanup-ready:/.test(r),
          ),
        ).toBeUndefined();
        expect(parsed.archived_branch_hygiene).toBeUndefined();
      });
    });
  });

  describe("adv_status bounded summary + request-local reuse (task 3, AC3/AC4)", () => {
    test("view:summary passes the recent bound into store.status before enrichment", async () => {
      const statusSpy = vi.spyOn(store, "status");

      const result = await statusTools.adv_status.execute(
        { view: "summary" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.view).toBe("summary");
      expect(statusSpy).toHaveBeenCalledWith({ recentLimit: 10 });
    });

    test("view:health passes the source-ranked candidate limit into store.status", async () => {
      const statusSpy = vi.spyOn(store, "status");

      const result = await statusTools.adv_status.execute(
        { view: "health" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.view).toBe("health");
      expect(statusSpy).toHaveBeenCalledWith(
        expect.objectContaining({ recentLimit: 10, sourceRanked: true }),
      );
    });

    test("full views call store.status without a recent bound", async () => {
      const statusSpy = vi.spyOn(store, "status");

      const result = await statusTools.adv_status.execute(
        { view: "changes" },
        store,
      );
      const parsed = parseToolOutput(result);

      expect(parsed.view).toBe("changes");
      expect(statusSpy).toHaveBeenCalledWith(undefined);
    });

    test("enrichment reuses request-local resolved documents with no duplicate reads", async () => {
      const makeDoc = (id: string) => ({
        $schema: "https://advance.dev/schemas/change.v1.json",
        id,
        title: `Change ${id}`,
        status: "draft" as const,
        created_at: "2026-05-07T00:00:00.000Z",
        tasks: [],
        deltas: {},
        gates: createDefaultGates(),
        reentry_history: [],
        wisdom: [],
        documents: { proposal: `# Proposal for ${id}` },
      });
      const docs = [makeDoc("change-a"), makeDoc("change-b")];
      const now = new Date().toISOString();
      store.status = vi.fn(async () => ({
        specs: { count: 0, capabilities: [] },
        changes: {
          active: 2,
          byStatus: { draft: 2, archived: 0, closed: 0 },
          recent: docs.map((doc) => ({
            id: doc.id,
            title: doc.title,
            status: doc.status,
            completedTasks: 0,
            taskCount: 0,
            lastActivityAt: now,
            minutesSinceActivity: 5,
          })),
        },
        recommendations: [],
        resolvedChanges: new Map(docs.map((doc) => [doc.id, doc])),
      })) as unknown as Store["status"];
      const getSpy = vi.spyOn(store.changes, "get");

      const result = await statusTools.adv_status.execute(
        { view: "changes" },
        store,
      );
      const parsed = parseToolOutput(result);

      // AC4 regression: both rows resolved during status resolution, so
      // enrichment must not re-read either change.
      expect(getSpy).not.toHaveBeenCalled();
      const recent = parsed.changes.recent as Array<Record<string, unknown>>;
      expect(recent).toHaveLength(2);
      for (const row of recent) {
        expect(row._contextSnapshot).toBeDefined();
      }
      // The request-local map is transport-only and must never leak into
      // the serialized tool output.
      expect(parsed.resolvedChanges).toBeUndefined();
    });

    test("typed degradation warnings surface as recommendations in every view", async () => {
      store.status = vi.fn(async () => ({
        specs: { count: 0, capabilities: [] },
        changes: {
          active: 0,
          byStatus: { draft: 0, archived: 0, closed: 0 },
          recent: [],
        },
        recommendations: [],
        warnings: [
          {
            code: "SOURCE_BOUND_EXCEEDED",
            source: "active_disk",
            message:
              "Read bound (10 candidate(s)) truncated 2 candidate(s); counts and recency are incomplete.",
            omittedCount: 2,
            omittedIds: ["change-x", "change-y"],
          },
        ],
        hydrationStats: { boundedOmitted: 2 },
      })) as unknown as Store["status"];

      const result = await statusTools.adv_status.execute(
        { view: "summary" },
        store,
      );
      const parsed = parseToolOutput(result);

      const recommendations = parsed.recommendations as string[];
      expect(
        recommendations.find((r) => /Status read incomplete/.test(r)),
      ).toBeDefined();
      expect(
        recommendations.find((r) => /truncated 2 candidate/.test(r)),
      ).toBeDefined();
    });
  });
});
