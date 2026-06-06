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
} from "./status";
import {
  createTestProject,
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { createLegacyStore } from "../storage/store";
import type { Store } from "../storage/store";
import { GATE_ORDER, createDefaultGates } from "../types";
import {
  clearPendingDelete,
  incrementPendingDeleteAttempts,
  initStateDb as initWorktreeStateDb,
  setPendingDelete,
} from "./worktree/state";

const {
  mockScanOpenCodeSessionDebt,
  mockGetTemporalHealth,
  mockGetWorktreeCensus,
  mockScanSnapshotHealth,
} = vi.hoisted(() => ({
  mockScanOpenCodeSessionDebt: vi.fn(),
  mockGetTemporalHealth: vi.fn(),
  mockGetWorktreeCensus: vi.fn(),
  mockScanSnapshotHealth: vi.fn(),
}));

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: mockGetTemporalHealth,
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

// Mock getStslStats and isStslInitialized for search_attributes testing.
// `getService` is also mocked so the queue-serviceability path added by
// the diagnose/status serviceability work (tk-669c7976) can compute a
// "service layer not initialized" snapshot instead of throwing on the
// missing export.
vi.mock("../temporal/service", () => ({
  getStslStats: vi.fn().mockReturnValue({
    getServiceCalls: 0,
    newConnections: 0,
    reuseRate: 0,
    reconnectCount: 0,
    reconnectFailureCount: 0,
    opTelemetry: [],
    saVerification: null,
  }),
  isStslInitialized: vi.fn().mockReturnValue(false),
  getService: vi.fn().mockReturnValue(null),
}));

describe("Status Tools", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    mockScanOpenCodeSessionDebt.mockReset();
    mockGetTemporalHealth.mockReset();
    mockGetTemporalHealth.mockResolvedValue({
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: null,
      last_error: null,
      fallback_counts: {},
      stale_queues: [],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: null,
      last_worker_run_error: null,
    });
    mockGetWorktreeCensus.mockReset();
    mockGetWorktreeCensus.mockResolvedValue({
      total: 0,
      stale: [],
      records: [],
      warnings: [],
    });
    _statusProbeCaches.clear();
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
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  describe("adv_status", () => {
    test("retries once when initial status load hits poisoned-history bootstrap error", async () => {
      const originalStatus = store.status.bind(store);
      const statusSpy = vi
        .fn()
        .mockRejectedValueOnce(
          new Error(
            "[TMPRL1100] Nondeterminism error: No command scheduled for event HistoryEvent(id: 231, WorkflowExecutionUpdateAccepted)",
          ),
        )
        .mockImplementation(() => originalStatus());
      store.status = statusSpy;

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(statusSpy).toHaveBeenCalledTimes(2);
      expect(parsed.view).toBe("summary");
      expect(parsed.diagnostics?.lastErrorClass).not.toBe(
        "bootstrap_in_progress",
      );
    });

    test("recovers when first two status loads hit bootstrap errors", async () => {
      const originalStatus = store.status.bind(store);
      const bootstrapError = new Error(
        "[TMPRL1100] Nondeterminism error: No command scheduled for event HistoryEvent(id: 231, WorkflowExecutionUpdateAccepted)",
      );
      const statusSpy = vi
        .fn()
        .mockRejectedValueOnce(bootstrapError)
        .mockRejectedValueOnce(bootstrapError)
        .mockImplementation(() => originalStatus());
      store.status = statusSpy;

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(statusSpy).toHaveBeenCalledTimes(3);
      expect(parsed.view).toBe("summary");
      expect(parsed.bootstrap_retry).toMatchObject({
        recovered: true,
        lastErrorClass: "bootstrap_in_progress",
      });
      expect(parsed.recommendations).not.toContain(
        "⚠️ Temporal bootstrap in progress — status read hit replay recovery errors repeatedly; retry shortly.",
      );
    });

    test("degrades structurally when bootstrap retry hits poisoned history again", async () => {
      const bootstrapError = new Error(
        "[TMPRL1100] Nondeterminism error: No command scheduled for event HistoryEvent(id: 231, WorkflowExecutionUpdateAccepted)",
      );
      const statusSpy = vi.fn().mockRejectedValue(bootstrapError);
      store.status = statusSpy;

      const result = await statusTools.adv_status.execute({}, store);
      const parsed = parseToolOutput(result);

      expect(statusSpy).toHaveBeenCalledTimes(3);
      expect(parsed.view).toBe("summary");
      expect(parsed.changes.recent).toEqual([]);
      expect(parsed.diagnostics?.lastErrorClass).toBe("bootstrap_in_progress");
      expect(parsed.bootstrap_retry).toMatchObject({
        recovered: false,
        lastErrorClass: "bootstrap_in_progress",
      });
      expect(parsed.recommendations).toContain(
        "⚠️ Temporal bootstrap in progress — status read hit replay recovery errors repeatedly; retry shortly.",
      );
    });

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

    test("recommendation includes parent reference for fast-follow", async () => {
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

      const followRec = parsed.recommendations.find((r: string) =>
        r.includes("fast-follow"),
      );
      expect(followRec).toBeDefined();
      expect(followRec).toContain("childFollowUp");
      expect(followRec).toContain(parentParsed.changeId);
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
          expect.stringContaining("next gate is `planning`"),
        ]),
      );
      expect(recs.join("\n")).toContain("/adv-prep stalePlanningChange");
      expect(recs.join("\n")).not.toContain("/adv-apply stalePlanningChange");
    });

    test("stale execution-ready change does not duplicate apply command", async () => {
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

      expect(text).toContain("/adv-apply staleApplyChange");
      expect(text.match(/\/adv-apply staleApplyChange/g) ?? []).toHaveLength(1);
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

      const followRec = parsed.recommendations.find((r: string) =>
        r.includes("fast-follow"),
      );
      expect(followRec).toBeDefined();
      // Terminal parent (archived or closed) should be annotated with its state
      expect(followRec).toMatch(/\((archived|closed)\)/);
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

      expect(health.worker_role).toMatch(/^(host|client|degraded)$/);
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
      // either "default" (no explicit project.json override) or "explicit"
      // (set in project.json). The fixture may or may not set
      // worktree_guard_enforce explicitly — either source is valid.
      for (const key of Object.keys(health.feature_flags)) {
        expect(["default", "explicit"]).toContain(
          health.feature_flag_sources[key],
        );
      }
      // Both worktree_guard_enforce and worker_singleton_enforce always
      // resolve (they have withStabilityFeatureDefaults coverage), so their
      // source entries must be present.
      expect(health.feature_flag_sources.worktree_guard_enforce).toMatch(
        /^(default|explicit)$/,
      );
      expect(health.feature_flag_sources.worker_singleton_enforce).toMatch(
        /^(default|explicit)$/,
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

    test("health view includes probe freshness and reuses cached temporal health", async () => {
      const firstResult = await statusTools.adv_status.execute(
        { view: "health" },
        store,
      );
      const secondResult = await statusTools.adv_status.execute(
        { view: "health" },
        store,
      );
      const first = parseToolOutput(firstResult);
      const second = parseToolOutput(secondResult);

      expect(mockGetTemporalHealth).toHaveBeenCalledTimes(1);
      expect(first.temporal_health.server_alive).toBe(true);
      expect(second.temporal_health.server_alive).toBe(true);
      expect(first._freshness.temporal_health).toMatchObject({
        cached_at: expect.any(String),
        stale: false,
      });
      expect(first._freshness.worktree_census).toMatchObject({
        cached_at: expect.any(String),
        stale: false,
      });
      expect(second._freshness.temporal_health.cached_at).toBe(
        first._freshness.temporal_health.cached_at,
      );
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

    describe("search_attributes", () => {
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
            build_marker_path: expect.stringContaining("oca-build.json"),
            worker_script_path: expect.stringContaining("worker.js"),
            reload_caveat: expect.stringContaining("Restart OpenCode"),
          }),
        );
      });

      test("includes search_attributes section with saVerification from getStslStats", async () => {
        const { getStslStats, isStslInitialized } =
          await import("../temporal/service");
        const mockGetStslStats = vi.mocked(getStslStats);
        const mockIsStslInitialized = vi.mocked(isStslInitialized);
        mockIsStslInitialized.mockReturnValue(true);
        mockGetStslStats.mockReturnValue({
          getServiceCalls: 1,
          newConnections: 1,
          reuseRate: 1,
          reconnectCount: 0,
          reconnectFailureCount: 0,
          opTelemetry: [],
          saVerification: { ok: true, checkedAt: Date.now() },
        });

        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.search_attributes).toBeDefined();
        expect(parsed.search_attributes.ok).toBe(true);
      });

      test("includes recommendation when search_attributes not ok", async () => {
        const { getStslStats, isStslInitialized } =
          await import("../temporal/service");
        const mockGetStslStats = vi.mocked(getStslStats);
        const mockIsStslInitialized = vi.mocked(isStslInitialized);
        mockIsStslInitialized.mockReturnValue(true);
        mockGetStslStats.mockReturnValue({
          getServiceCalls: 1,
          newConnections: 1,
          reuseRate: 1,
          reconnectCount: 0,
          reconnectFailureCount: 0,
          opTelemetry: [],
          saVerification: { ok: false, checkedAt: Date.now() },
        });

        const healthResult = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const health = parseToolOutput(healthResult);

        expect(health.search_attributes).toBeDefined();
        expect(health.search_attributes.ok).toBe(false);

        const saRec = (health.recommendations as string[] | undefined)?.find(
          (r: string) =>
            r.includes("search attributes") ||
            r.includes("adv_temporal_register_search_attributes"),
        );
        expect(saRec).toBeDefined();
      });

      test("shows search_attributes as unknown when STSL not initialized", async () => {
        const { getStslStats, isStslInitialized } =
          await import("../temporal/service");
        const mockGetStslStats = vi.mocked(getStslStats);
        const mockIsStslInitialized = vi.mocked(isStslInitialized);
        mockIsStslInitialized.mockReturnValue(false);
        mockGetStslStats.mockReturnValue({
          getServiceCalls: 0,
          newConnections: 0,
          reuseRate: 0,
          reconnectCount: 0,
          reconnectFailureCount: 0,
          opTelemetry: [],
          saVerification: null,
        });

        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.search_attributes).toBeDefined();
        expect(parsed.search_attributes.ok).toBe(false);
      });
    });

    describe("_healthSnapshot", () => {
      beforeEach(() => {
        _healthSnapshotCache.clear();
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

      test("summary view: returns specs.count + recommendations + temporal_health_ok + worktree_count", async () => {
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
        expect(typeof parsed.temporal_health_ok).toBe("boolean");
        expect(typeof parsed.worktree_count).toBe("number");

        // Hygiene/health archaeology MUST be omitted from summary.
        expect(parsed.search_attributes).toBeUndefined();
        expect(parsed._healthSnapshot).toBeUndefined();
        expect(parsed.opencode_session_debt).toBeUndefined();
        expect(parsed.diagnostics).toBeUndefined();
      });

      test("health view: returns temporal_health + search_attributes + diagnostics", async () => {
        const result = await statusTools.adv_status.execute(
          { view: "health" },
          store,
        );
        const parsed = parseToolOutput(result);

        expect(parsed.view).toBe("health");
        expect(parsed.temporal_health).toBeDefined();
        expect(parsed.search_attributes).toBeDefined();
        expect(parsed.opencode_session_debt).toBeUndefined();
        expect(parsed.diagnostics).toBeDefined();

        // Summary-only fields are absent from health view.
        expect(parsed.temporal_health_ok).toBeUndefined();
        expect(parsed.worktree_count).toBeUndefined();
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
        // Health archaeology is absent.
        expect(parsed.search_attributes).toBeUndefined();
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
        // Temporal health detail is NOT in hygiene view.
        expect(parsed.temporal_health).toBeUndefined();
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

          extStore = await createLegacyStore(tempDir, { externalRoot });

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
            synthetic_project_dirs: 1,
            synthetic_worktree_dirs: 1,
          });
          expect(
            parsed.external_state_hygiene.empty_worktree_prefix_dirs,
          ).toContain(
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
  });
});
