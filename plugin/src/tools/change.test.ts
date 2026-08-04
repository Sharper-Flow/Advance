/**
 * Change Tools — Lifecycle Contract Tests (Signal-Driven)
 *
 * Tests for adv_change_close, adv_change_bulk_close, and adv_change_reenter
 * using signal/query surface instead of workflow updates.
 * Verifies tool-layer enforcement for cancellation/archive approval.
 */

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS,
  changeTools,
  closeLinkedIssue,
} from "./change";
import type { Store } from "../storage/store";
import type {
  Change,
  OpsFollowupLink,
  OpsFollowupProfile,
  OpsFollowupResolution,
  Spec,
} from "../types";
import { derivePhasePlanSafe, parsePhasePlan } from "../utils/phase-plan";
import { sha256Hex } from "../utils/command-payload-hash";
import { withPhaseDirective } from "../utils/phase-directive";
import { PHASE_DIRECTIVES } from "../utils/phase-directive-content";
import {
  PARITY_ROWS,
  toolChangeFor,
} from "../__tests__/phase-plan-parity-matrix";
import { changeToDirectiveState } from "../temporal/change-state";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import * as gitFinalize from "./archive-helpers/git-finalize";
import * as worktree from "./worktree";
import { gateTools } from "./gate";
import { overlayOpsResolutionsForRead } from "./ops-followup-reconciliation";
import * as pluginBundleManifest from "../plugin-bundle-manifest";

const PROJECT_ID = "0".repeat(40);
const TARGET_PROJECT_ID = "0".repeat(39) + "1";

const mocks = vi.hoisted(() => {
  const signalMock = vi.fn();
  const queryMock = vi.fn();
  const handleMock = { signal: signalMock, query: queryMock };
  const getHandleMock = vi.fn(() => handleMock);
  const temporalBundle = {
    client: { workflow: { getHandle: getHandleMock } },
  };
  const targetStore = {
    paths: {
      root: "/tmp/target",
      changes: "/tmp/target/.adv/changes",
      archive: "/tmp/target/.adv/archive",
    },
    config: null,
    changes: {
      get: vi.fn(),
      save: vi.fn(),
      refresh: vi.fn(async () => undefined),
      list: vi.fn(async () => ({ changes: [] })),
      updateArtifacts: vi.fn(),
    },
    tasks: { ready: vi.fn(async () => ({ ready: [], blocked: [] })) },
    gates: {
      get: vi.fn(async () => ({
        proposal: { status: "done" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      })),
    },
    specs: {
      list: vi.fn(async () => ({ specs: [] })),
      get: vi.fn(async () => ({ success: false, error: "not found" })),
    },
    close: vi.fn(),
  };

  const withTargetPathStore = vi.fn(async (_input: unknown, fn: unknown) => {
    const callback = fn as (scope: {
      context: unknown;
      store: unknown;
    }) => Promise<unknown>;
    return callback({
      context: {
        root: "/tmp/target",
        projectId: TARGET_PROJECT_ID,
        externalRoot: "/tmp/target-external",
        trusted: false,
        trustSource: "explicit",
        stateMode: "temporal",
      },
      store: targetStore,
    });
  });
  const withOptionalTargetPathStore = vi.fn(
    async ({ store }: { store: unknown }, fn: unknown) => {
      const callback = fn as (store: unknown) => Promise<unknown>;
      return callback(store);
    },
  );

  return {
    signalMock,
    queryMock,
    handleMock,
    targetStore,
    getHandleMock,
    temporalBundle,
    getService: vi.fn(() => temporalBundle),
    getProjectId: vi.fn(async () => PROJECT_ID),
    fireSignal: vi.fn(async () => {}),
    fireSignalAndRefresh: vi.fn(async () => {}),
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handleMock),
    removeChangeDir: vi.fn(async () => {}),
    saveRecoveredChangeStatus: vi.fn(async ({ change, status }) => ({
      ...change,
      status,
    })),
    markPoisonedWorkflowForChange: vi.fn(),
    isPoisonedWorkflowForChange: vi.fn(() => false),
    clearPoisonedWorkflowCache: vi.fn(),
    sweepClosedChangesFromDisk: vi.fn(async () => ({
      removed: [] as string[],
      failed: [] as Array<{ id: string; error: string }>,
    })),
    execGh: vi.fn(),
    readGitHubProjectConfig: vi.fn(),
    execGit: vi.fn(),
    withTargetPathStore,
    withOptionalTargetPathStore,
    formatTargetProjectContext: vi.fn(
      (context: {
        root: string;
        projectId: string;
        trusted: boolean;
        trustSource: string;
        stateMode: string;
      }) => ({
        root: context.root,
        projectId: context.projectId,
        trusted: context.trusted,
        trustSource: context.trustSource,
        stateMode: context.stateMode,
      }),
    ),
  };
});

vi.mock("../storage/store-temporal/poisoned-workflow-cache", () => ({
  markPoisonedWorkflowForChange: mocks.markPoisonedWorkflowForChange,
  isPoisonedWorkflowForChange: mocks.isPoisonedWorkflowForChange,
  clearPoisonedWorkflowCache: mocks.clearPoisonedWorkflowCache,
  buildPoisonedWorkflowKey: vi.fn(
    (projectId: string, changeId: string) =>
      `poisoned-key-${projectId}-${changeId}`,
  ),
}));

vi.mock("../temporal/service", () => ({
  getService: mocks.getService,
}));

vi.mock("../utils/project-id", async () => {
  const actual = await vi.importActual<typeof import("../utils/project-id")>(
    "../utils/project-id",
  );
  return {
    ...actual,
    getProjectId: mocks.getProjectId,
  };
});

vi.mock("./_adapters", () => ({
  fireSignal: mocks.fireSignal,
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  querySignal: mocks.querySignal,
  getChangeHandle: mocks.getChangeHandle,
  waitForGateCompletion: async (handle: unknown, gateId: unknown) =>
    mocks.querySignal(handle, undefined, gateId),
}));

vi.mock("./target-project", async () => {
  const { z } = await import("zod");
  return {
    targetPathSchema: z.object({
      target_path: z.string().optional(),
      target_confirmed: z.literal(true).optional(),
      confirmationEvidence: z.string().optional(),
    }),
    withTargetPathStore: mocks.withTargetPathStore,
    withOptionalTargetPathStore: mocks.withOptionalTargetPathStore,
    formatTargetProjectContext: mocks.formatTargetProjectContext,
    resolveTargetAwareMutationCwd: vi.fn(
      ({ store, target_path }: { store: Store; target_path?: string }) =>
        target_path ? store.paths.root : process.cwd(),
    ),
    appendTargetProjectContextOutput: vi.fn(
      (
        output: string,
        context: {
          root: string;
          projectId: string;
          trusted: boolean;
          trustSource: string;
          stateMode: string;
        },
      ) => {
        const parsed = JSON.parse(output);
        parsed._projectContext = {
          root: context.root,
          projectId: context.projectId,
          trusted: context.trusted,
          trustSource: context.trustSource,
          stateMode: context.stateMode,
        };
        return JSON.stringify(parsed);
      },
    ),
  };
});

vi.mock("../storage/json", async () => {
  const actual =
    await vi.importActual<typeof import("../storage/json")>("../storage/json");
  return {
    ...actual,
    removeChangeDir: mocks.removeChangeDir,
  };
});

vi.mock("../storage/disk-sweep", () => ({
  sweepClosedChangesFromDisk: mocks.sweepClosedChangesFromDisk,
}));

vi.mock("./_recovery-writers", async () => {
  const actual = await vi.importActual<typeof import("./_recovery-writers")>(
    "./_recovery-writers",
  );
  return {
    ...actual,
    saveRecoveredChangeStatus: mocks.saveRecoveredChangeStatus,
  };
});

vi.mock("../integrations/gh-cli", () => ({
  execGh: mocks.execGh,
}));

vi.mock("../storage/github-project-config", () => ({
  readGitHubProjectConfig: mocks.readGitHubProjectConfig,
}));

vi.mock("../utils/git.js", async () => {
  const actual =
    await vi.importActual<typeof import("../utils/git.js")>("../utils/git.js");
  return {
    ...actual,
    execGit: mocks.execGit,
  };
});

vi.mock("../plugin-bundle-manifest", async () => {
  const actual = await vi.importActual<
    typeof import("../plugin-bundle-manifest")
  >("../plugin-bundle-manifest");
  return {
    ...actual,
    getPluginBundleDistDir: vi.fn(() => "/test/plugin/dist"),
    getPluginBundleReleasePreflightError: vi.fn(async () => null),
  };
});

function runGit(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

async function prepareLocalReleaseProof(
  repoRoot: string,
  changeId = "test-change",
): Promise<void> {
  const origin = `${repoRoot}.origin.git`;
  await mkdir(origin, { recursive: true });
  runGit(repoRoot, ["init", "-b", "main"]);
  runGit(repoRoot, ["config", "user.name", "ADV Test"]);
  runGit(repoRoot, ["config", "user.email", "adv-test@example.com"]);
  runGit(origin, ["init", "--bare", "-b", "main"]);
  runGit(repoRoot, ["remote", "add", "origin", origin]);
  await writeFile(`${repoRoot}/README.md`, "release proof fixture\n");
  runGit(repoRoot, ["add", "README.md"]);
  runGit(repoRoot, ["commit", "-m", "chore: release proof fixture"]);
  runGit(repoRoot, ["push", "-u", "origin", "main"]);

  // Create a change branch, commit work, merge it back to main, and push so
  // origin/main contains the change and release proof is reachable.
  runGit(repoRoot, ["checkout", "-b", `change/${changeId}`]);
  await writeFile(`${repoRoot}/change.txt`, "change content\n");
  runGit(repoRoot, ["add", "change.txt"]);
  runGit(repoRoot, ["commit", "-m", "feat: change work"]);
  runGit(repoRoot, ["checkout", "main"]);
  runGit(repoRoot, [
    "merge",
    "--no-ff",
    "-m",
    `Archive ${changeId}`,
    `change/${changeId}`,
  ]);
  runGit(repoRoot, ["push", "origin", "main"]);
}

function createMockStore(
  changeOverrides: Partial<Change> = {},
  specs: Spec[] = [],
): Store {
  const change: Change = {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "done" },
      release: { status: "pending" },
    } as Change["gates"],
    ...changeOverrides,
  };

  return {
    paths: {
      root: "/tmp/test",
      changes: "/tmp/test/.adv/changes",
      archive: "/tmp/test/.adv/archive",
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {
      list: vi.fn(async () => ({
        specs: specs.map((spec) => ({ name: spec.name, title: spec.title })),
      })),
      get: vi.fn(async (name: string) => {
        const spec = specs.find((candidate) => candidate.name === name);
        return spec
          ? { success: true, data: spec }
          : { success: false, error: `Spec not found: ${name}` };
      }),
    } as unknown as Store["specs"],
    changes: {
      list: vi.fn(async () => ({
        changes: [
          { id: "test-change", title: "Test Change", status: "active" },
        ],
      })),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      updateArtifacts: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
    } as Store["changes"],
    tasks: {
      ready: vi.fn(async () => ({ ready: [], blocked: [] })),
    } as unknown as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => change.gates),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    },
    status: vi.fn(),
    epics: {
      create: vi.fn(),
      get: vi.fn(async () => ({ success: true, data: null })),
      list: vi.fn(async () => []),
      update: vi.fn(),
      addShell: vi.fn(),
      promoteShell: vi.fn(),
      linkChange: vi.fn(),
      unlinkChange: vi.fn(),
      reorder: vi.fn(),
    },
  } as unknown as Store;
}

const existingSpec: Spec = {
  name: "existing-capability",
  title: "Existing Capability",
  purpose: "Test fixture spec",
  version: "1.0.0",
  updated_at: "2026-01-01T00:00:00Z",
  requirements: [
    {
      id: "rq-existing1",
      title: "Existing requirement",
      body: "Existing requirement body",
      priority: "must",
      scenarios: [
        {
          id: "rq-existing1.1",
          title: "Existing scenario",
          given: ["Existing state"],
          when: "Validated",
          then: ["It passes"],
        },
      ],
    },
  ],
};

const allDoneGates: NonNullable<Change["gates"]> = {
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "done" },
  execution: { status: "done" },
  acceptance: { status: "done" },
  release: { status: "done" },
};

describe("change tools — signal-driven lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (
      mocks.handleMock as typeof mocks.handleMock & { describe?: unknown }
    ).describe;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("adv_change_show", () => {
    test("returns opt-in bounded loop-ledger readback without changing legacy ledger", async () => {
      const reviewerReport = {
        schema_version: "1.0",
        change_id: "test-change",
        attempt: 1,
        workdir_used: "/worktree",
        scope: { kind: "change", scope_key: "review:acceptance" },
        agent: "adv-reviewer",
        phase: "review",
        verdict: "NEEDS_WORK",
        blocking_findings: [],
        nonblocking_findings: [],
        changes_made: [],
        wisdom_candidates: [],
        verification: { tests_run: [], results: "n/a", evidence: "fixture" },
        scope_drift: null,
        risks: [],
        required_main_agent_actions: [],
      } as const;
      const store = createMockStore({
        tasks: [
          {
            id: "tk-loop",
            title: "Loop task",
            status: "done",
            priority: 0,
            created_at: "2026-01-01T00:00:00Z",
            attempts: [
              {
                attempt_number: 1,
                outcome: "succeeded",
                attempted_at: "2026-01-01T00:00:00Z",
              },
            ],
          } as Change["tasks"][number],
        ],
        subagent_reports: [reviewerReport],
        test_runs: {
          "tk-loop": [
            {
              runId: "tr-loop",
              phase: "green",
              exitCode: 0,
              classification: "passed",
              command: "pnpm exec vitest run",
              durationMs: 12,
              recordedAt: "2026-01-01T00:00:01Z",
            },
          ],
        },
      });

      const compact = JSON.parse(
        await changeTools.adv_change_show.execute(
          { changeId: "test-change", include: { loopLedger: true } },
          store,
        ),
      );
      expect(compact._loopLedger).toMatchObject({
        version: "1.0",
        summary: {
          totalEntries: 2,
          byVerdict: { pass: 1, fail: 1 },
          sourceTotals: { testRuns: 1 },
        },
      });
      expect(compact._loopLedger.details).toBeUndefined();
      expect(compact._ledger).toBeUndefined();
      expect(compact).not.toHaveProperty("test_runs");

      const detailed = JSON.parse(
        await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: {
              loopLedger: true,
              loopLedgerDetails: true,
              loopLedgerLimit: 1,
              ledger: true,
            },
          },
          store,
        ),
      );
      expect(detailed._loopLedger.details).toHaveLength(1);
      expect(detailed._loopLedger.detailsLimit).toBe(1);
      expect(detailed._ledger).toBeNull();
    });

    test("includes TodoWrite projection when readyTasks include flag is set", async () => {
      const store = createMockStore({
        tasks: [
          {
            id: "tk-current",
            title: "Current Task",
            status: "in_progress",
            priority: 0,
            created_at: "2026-01-01T00:00:00Z",
          } as Change["tasks"][number],
        ],
      });
      vi.mocked(store.tasks.ready).mockResolvedValue({
        ready: [
          {
            id: "tk-ready",
            title: "Ready Task",
            status: "pending",
            priority: 1,
            created_at: "2026-01-01T00:00:00Z",
          } as Change["tasks"][number],
        ],
        blocked: [],
      });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { readyTasks: true } },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed._todoProjection).toEqual({
        rows: [
          {
            taskId: "tk-current",
            title: "Current Task",
            status: "in_progress",
            content: "tk-current — Current Task",
          },
          {
            taskId: "tk-ready",
            title: "Ready Task",
            status: "pending",
            content: "tk-ready — Ready Task",
          },
        ],
        format: "task-id-em-dash-title",
        window: { includeCurrent: true, readyLimit: 3, omitDone: true },
      });
    });

    test("attaches typed phase-plan read projection when include.phasePlan is set", async () => {
      // Default mock gates: all done except release → actionable archive step.
      const store = createMockStore();
      // Baseline: a plain show performs its own pre-existing reads/writes
      // (e.g. clarify-findings persistence). The plan projection must add
      // zero mutations on top of that baseline (AC3/C2).
      await changeTools.adv_change_show.execute(
        { changeId: "test-change" },
        store,
      );
      const plainShowSaves = vi.mocked(store.changes.save).mock.calls.length;

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { phasePlan: true } },
        store,
      );

      const parsed = JSON.parse(result);
      // SC1/AC1/AC8: strict boundary — the projection always parses as one
      // discriminated PhasePlan variant.
      const plan = parsePhasePlan(parsed._phasePlan);
      expect(plan).toMatchObject({
        version: 1,
        kind: "actionable",
        changeId: "test-change",
        phase: "release",
        gateId: "release",
        command: "adv-archive",
        failClosed: false,
        provenance: { source: "canonical" },
      });
      // Existing response fields are preserved unchanged.
      expect(parsed.id).toBe("test-change");
      expect(parsed.title).toBe("Test Change");
      expect(Array.isArray(parsed.tasks)).toBe(true);
      expect(parsed._phasePlanError).toBeUndefined();
      // AC3/C2: the plan read performs zero additional mutations and sends
      // no workflow signals.
      const planShowSaves = vi.mocked(store.changes.save).mock.calls.length;
      expect(planShowSaves - plainShowSaves).toBe(plainShowSaves);
      expect(mocks.signalMock).not.toHaveBeenCalled();
    });

    test("attaches a complete review directive and lean-shapes its response", async () => {
      const store = createMockStore({
        acceptanceCriteria: [
          "Given delivered work, review evidence is complete.",
        ],
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        documents: { proposal: "large durable proposal" },
      });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { phasePlan: true } },
        store,
      );
      const parsed = JSON.parse(result);
      const plan = parsePhasePlan(parsed._phasePlan);

      expect(plan).toMatchObject({
        kind: "actionable",
        phase: "acceptance",
        command: "adv-review",
      });
      expect(plan).toHaveProperty("directive");
      expect(sha256Hex(plan.directive!.content)).toBe(
        plan.directive!.contentHash,
      );
      expect(plan.directive!.content).not.toContain("[truncated");
      expect(parsed).toMatchObject({
        id: "test-change",
        title: "Test Change",
        status: "active",
        gates: expect.any(Object),
        acceptanceCriteria: [
          "Given delivered work, review evidence is complete.",
        ],
        _phasePlan: expect.any(Object),
      });
      expect(parsed._omittedFields).toContain("documents");
      expect(parsed._omittedFields).toContain("deltas");
      expect(parsed._omittedFields).toContain("wisdom");
      expect(parsed._truncated).toBeUndefined();
    });

    test("preserves explicitly requested projections alongside a review directive", async () => {
      const store = createMockStore({
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        documents: { proposal: "explicitly requested proposal" },
      });

      const result = await changeTools.adv_change_show.execute(
        {
          changeId: "test-change",
          include: { phasePlan: true, proposal: true },
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._phasePlan.directive).toBeDefined();
      expect(parsed._proposal).toBe("explicitly requested proposal");
      expect(parsed._omittedFields).toContain("tasks");
      expect(parsed._omittedFields).not.toContain("_proposal");
    });

    test("bounds an oversized explicit projection without truncating the directive", async () => {
      const store = createMockStore({
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        documents: { proposal: "x".repeat(100_000) },
      });

      const result = await changeTools.adv_change_show.execute(
        {
          changeId: "test-change",
          include: { phasePlan: true, proposal: true },
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._truncated).toBe(true);
      expect(parsed.data._phasePlan.directive.content).toBe(
        PHASE_DIRECTIVES["adv-review"].content,
      );
      expect(parsed.data._proposal.length).toBeLessThan(100_000);
    });

    test("keeps degraded phase-plan reads on the normal response path", async () => {
      const store = createMockStore();
      vi.mocked(store.gates.get).mockResolvedValue({
        release: { status: "pending" },
      } as unknown as Change["gates"]);

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { phasePlan: true } },
        store,
      );
      const parsed = JSON.parse(result);
      const plan = parsePhasePlan(parsed._phasePlan);

      expect(plan.kind).toBe("degraded");
      expect(plan).not.toHaveProperty("directive");
      expect(parsed._omittedFields).toBeUndefined();
    });

    test("keeps non-review actionable phase plans on the normal response path", async () => {
      const store = createMockStore({
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "pending" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
      });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { phasePlan: true } },
        store,
      );
      const parsed = JSON.parse(result);
      const plan = parsePhasePlan(parsed._phasePlan);

      expect(plan).toMatchObject({
        kind: "actionable",
        phase: "design",
        command: "adv-design",
      });
      expect(plan).not.toHaveProperty("directive");
      expect(parsed._omittedFields).toBeUndefined();
      expect(parsed.tasks).toEqual([]);
    });

    test("omits _phasePlan when include.phasePlan is not set", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed._phasePlan).toBeUndefined();
      expect(parsed.id).toBe("test-change");
    });

    test("approval-pending change yields non-authorizing plan with no command", async () => {
      const store = createMockStore({ pendingCheckpoint: true });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { phasePlan: true } },
        store,
      );

      const parsed = JSON.parse(result);
      const plan = parsePhasePlan(parsed._phasePlan);
      expect(plan).toMatchObject({
        kind: "approval-required",
        failClosed: true,
        gateId: "release",
        provenance: { source: "canonical" },
      });
      // AC3/C2: non-authorizing variants carry no route/command.
      expect(parsed._phasePlan).not.toHaveProperty("command");
      expect(parsed._phasePlan).not.toHaveProperty("route");
    });

    test("archived change yields terminal non-authorizing plan", async () => {
      const store = createMockStore({ status: "archived" });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { phasePlan: true } },
        store,
      );

      const parsed = JSON.parse(result);
      const plan = parsePhasePlan(parsed._phasePlan);
      expect(plan).toMatchObject({
        kind: "terminal",
        phase: "archived",
        failClosed: true,
      });
      expect(parsed._phasePlan).not.toHaveProperty("command");
    });

    test("malformed gate projection degrades to typed non-authorizing plan with no route", async () => {
      // Partially hydrated projection: gates record missing entries makes the
      // derivation throw; the tool layer must adapt that into a typed
      // degraded plan (SC3/AC3) instead of inventing a next action.
      const store = createMockStore();
      vi.mocked(store.gates.get).mockResolvedValue({
        release: { status: "pending" },
      } as unknown as Change["gates"]);

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { phasePlan: true } },
        store,
      );

      const parsed = JSON.parse(result);
      const plan = parsePhasePlan(parsed._phasePlan);
      expect(plan).toMatchObject({
        kind: "degraded",
        failClosed: true,
        reason: "missing_state",
        provenance: { source: "degraded", reason: "missing_state" },
      });
      expect(parsed._phasePlan).not.toHaveProperty("command");
      expect(parsed._phasePlan).not.toHaveProperty("route");
      // Degraded reads stay non-authorizing: no workflow signals sent.
      expect(mocks.signalMock).not.toHaveBeenCalled();
    });

    test("target artifact readback routes through Temporal-backed target store", async () => {
      const store = createMockStore();
      const sourceChange = (await store.changes.get("test-change"))
        .data as Change;
      const defaultImpl = mocks.targetStore.changes.get.getMockImplementation();
      vi.mocked(mocks.targetStore.changes.get).mockResolvedValue({
        success: true,
        data: {
          ...sourceChange,
          documents: {
            design: "target-design-from-documents",
            proposal: "target-proposal-from-documents",
          },
        },
      });
      mocks.withTargetPathStore.mockClear();

      try {
        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            target_path: "/tmp/target",
            include: { design: true },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._design).toBe("target-design-from-documents");
        expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
          expect.objectContaining({
            target_path: "/tmp/target",
            stateRequirement: "temporal-required",
            mutation: false,
          }),
          expect.any(Function),
        );
        expect(parsed._projectContext).toMatchObject({ stateMode: "temporal" });
      } finally {
        mocks.targetStore.changes.get.mockReset();
        if (defaultImpl) {
          mocks.targetStore.changes.get.mockImplementation(defaultImpl);
        }
      }
    });

    test("target show without artifact include flags stays on snapshot path", async () => {
      const store = createMockStore();
      mocks.withTargetPathStore.mockClear();
      mocks.withOptionalTargetPathStore.mockClear();

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", target_path: "/tmp/target" },
        store,
      );

      expect(mocks.withTargetPathStore).not.toHaveBeenCalled();
      expect(mocks.withOptionalTargetPathStore).toHaveBeenCalled();
      const parsed = JSON.parse(result);
      expect(parsed.id).toBe("test-change");
      expect(parsed._projectContext).toBeUndefined();
    });

    test("target artifact readback fails closed when target Temporal is unreachable", async () => {
      const store = createMockStore();
      const defaultImpl = mocks.withTargetPathStore.getMockImplementation();
      mocks.withTargetPathStore.mockReset();
      mocks.withTargetPathStore.mockRejectedValueOnce(
        new Error(
          "Temporal service layer not initialized; target_path mutations require a Temporal-backed target store: /tmp/target",
        ),
      );

      try {
        await expect(
          changeTools.adv_change_show.execute(
            {
              changeId: "test-change",
              target_path: "/tmp/target",
              include: { proposal: true },
            },
            store,
          ),
        ).rejects.toThrow("Temporal service layer not initialized");
      } finally {
        mocks.withTargetPathStore.mockReset();
        if (defaultImpl) {
          mocks.withTargetPathStore.mockImplementation(defaultImpl);
        }
      }
    });

    test("returns persisted task sub-agent reports when include.subagentReports is set", async () => {
      const taskReport = {
        schema_version: "1.0",
        change_id: "test-change",
        task_id: "tk-report",
        attempt: 2,
        agent: "adv-engineer",
        status: "complete",
        scope: "Implement",
        workdir_used: "/worktree",
        files_touched: ["src/a.ts"],
        verification: [
          {
            command: "pnpm test",
            exit_code: 0,
            summary: "passed",
          },
        ],
        decisions: [],
        blockers: [],
        follow_ups: [],
        related_scan: "No related issues",
        context_update_for_adv: {
          what_ads_needs_to_know: "Report persisted",
          suggested_next_action: "Continue",
        },
      } as const;
      const store = createMockStore({
        subagent_reports: [
          taskReport,
          {
            schema_version: "1.0",
            change_id: "test-change",
            attempt: 1,
            agent: "adv-researcher",
            scope: { kind: "change", scope_key: "researcher:docs" },
            workdir_used: "/worktree",
            topic: "Docs",
            sources: [
              { label: "docs", locator: "docs/x.md", summary: "source" },
            ],
            architecture_assessment: "ok",
            validation: { status: "pass", blockers: [], notes: "ok" },
            architecture_judgement: {
              applicability: "not_applicable",
              confidence: "high",
              reason: "Docs-only research readback fixture.",
              recommendation: "continue",
            },
            recommendation: "continue",
            follow_ups: [],
          },
        ],
        tasks: [
          {
            id: "tk-report",
            title: "Reported Task",
            status: "done",
            priority: 0,
            created_at: "2026-01-01T00:00:00Z",
            subagent_reports: [taskReport],
          } as Change["tasks"][number],
        ],
      });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { subagentReports: true } },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed._subagentReports).toEqual([
        expect.objectContaining({
          change_id: "test-change",
          task_id: "tk-report",
          agent: "adv-engineer",
          attempt: 2,
        }),
        expect.objectContaining({
          change_id: "test-change",
          agent: "adv-researcher",
          attempt: 1,
        }),
      ]);
      expect(parsed._subagentReportsMeta).toEqual({
        total: 2,
        sidecar: 2,
        legacyTask: 1,
      });
      expect(parsed.tasks[0].subagent_reports).toHaveLength(1);
    });

    test("omits unreadable artifact paths from change show output and gate evidence", async () => {
      const { mkdtemp, mkdir, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-phantom-path-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      await mkdir(pathJoin(changesDir, "test-change"), { recursive: true });

      try {
        const phantomPath = pathJoin(changesDir, "test-change", "proposal.md");
        const store = createMockStore({
          artifacts: {
            proposal: {
              path: phantomPath,
              updatedAt: "2026-06-15T00:00:00.000Z",
              source: "temporal",
              readable: false,
            },
          },
          gates: {
            discovery: { status: "done" },
            design: { status: "done" },
            planning: { status: "done" },
            execution: { status: "done" },
            acceptance: { status: "done" },
            release: { status: "pending" },
            proposal: {
              status: "done",
              artifact_evidence: {
                kind: "proposal",
                path: phantomPath,
                checked_at: "2026-06-15T00:00:01.000Z",
                non_whitespace_chars: 42,
              },
            },
          } as Change["gates"],
        });
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          { changeId: "test-change" },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.artifacts.proposal).toMatchObject({
          updatedAt: "2026-06-15T00:00:00.000Z",
          source: "temporal",
          readable: false,
        });
        expect(parsed.artifacts.proposal).not.toHaveProperty("path");
        expect(parsed.gates.proposal.artifact_evidence).not.toHaveProperty(
          "path",
        );
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("omits unreadable gate evidence paths from included context snapshot readback", async () => {
      const { mkdtemp, mkdir, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(
        pathJoin(tmpdir(), "adv-snapshot-phantom-path-"),
      );
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      await mkdir(pathJoin(changesDir, "test-change"), { recursive: true });

      try {
        const phantomPath = pathJoin(changesDir, "test-change", "proposal.md");
        const store = createMockStore({
          gates: {
            discovery: { status: "done" },
            design: { status: "done" },
            planning: { status: "done" },
            execution: { status: "done" },
            acceptance: { status: "done" },
            release: { status: "pending" },
            proposal: {
              status: "done",
              artifact_evidence: {
                kind: "proposal",
                path: phantomPath,
                checked_at: "2026-06-15T00:00:01.000Z",
                non_whitespace_chars: 42,
              },
            },
          } as Change["gates"],
        });
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          { changeId: "test-change", include: { snapshot: true } },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._contextSnapshot).toEqual(expect.any(String));
        expect(parsed.gates.proposal.artifact_evidence).not.toHaveProperty(
          "path",
        );
        expect(JSON.stringify(parsed)).not.toContain(phantomPath);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("keeps top-level gates and snapshot gates consistent after gate completion", async () => {
      const pendingGates = {
        proposal: { status: "done" },
        discovery: { status: "pending" },
        design: { status: "pending" },
        planning: { status: "pending" },
        execution: { status: "pending" },
        acceptance: { status: "pending" },
        release: { status: "pending" },
      } as Change["gates"];
      const completedGates = {
        ...pendingGates,
        discovery: { status: "done" },
      } as Change["gates"];
      const store = createMockStore({ gates: pendingGates });
      let cachedGates = pendingGates;
      const getCachedChange = store.changes.get;
      store.changes.get = vi.fn(async () => {
        const result = await getCachedChange("test-change");
        return {
          ...result,
          data: result.data
            ? { ...result.data, gates: cachedGates }
            : undefined,
        };
      });
      store.gates.get = vi.fn(async () => cachedGates);
      store.changes.invalidate = vi.fn(async () => {
        cachedGates = completedGates;
      });
      mocks.querySignal
        .mockResolvedValueOnce(pendingGates)
        .mockResolvedValueOnce({ status: "done" });

      const completion = await gateTools.adv_gate_complete.execute(
        {
          changeId: "test-change",
          gateId: "discovery",
          completedBy: "adv-researcher",
        },
        store,
      );
      expect(JSON.parse(completion).success).toBe(true);
      expect(store.changes.invalidate).toHaveBeenCalledWith("test-change");

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { snapshot: true } },
        store,
      );
      const parsed = JSON.parse(result);
      for (const [gateId, gate] of Object.entries(parsed.gates)) {
        const marker = gate.status === "done" ? "✓" : "○";
        expect(parsed._contextSnapshot).toContain(`[${marker} ${gateId}]`);
      }
    });

    test("applies audited disk release recovery to included context snapshot", async () => {
      const { mkdtemp, mkdir, writeFile, rm } =
        await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join: pathJoin } = await import("node:path");
      const tempRoot = await mkdtemp(
        pathJoin(tmpdir(), "adv-snapshot-release-recovery-"),
      );
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });

      try {
        const workflowGates = {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "done" },
          release: { status: "pending" },
        } as Change["gates"];
        const recoveredDiskGates = {
          ...workflowGates,
          release: {
            status: "done",
            completed_at: "2026-01-01T00:00:00Z",
            completed_by: "adv-archive",
            recovery_audit: {
              reason: "completed_workflow_release_gate_recovery",
              evidence:
                "workflow execution already completed | WorkflowNotFoundError; Phase 9 finalization shipped; defaultBranch=trunk; repoRoot=/tmp/main; pushStatus=pushed; mergeCommitSha=abc123",
              recovered_at: "2026-01-01T00:00:01Z",
            },
          },
        } as Change["gates"];

        const store = createMockStore({ gates: recoveredDiskGates });
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;
        vi.mocked(store.gates.get).mockResolvedValue(workflowGates);

        await writeFile(
          pathJoin(changeDir, "change.json"),
          JSON.stringify(
            {
              id: "test-change",
              title: "Test Change",
              status: "archived",
              created_at: "2026-01-01T00:00:00Z",
              created_by: "test",
              tasks: [],
              deltas: {},
              wisdom: [],
              gates: recoveredDiskGates,
            },
            null,
            2,
          ),
        );

        const result = await changeTools.adv_change_show.execute(
          { changeId: "test-change", include: { snapshot: true } },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._contextSnapshot).toContain("[✓ release]");
        expect(parsed.gates.release).toMatchObject({
          status: "done",
          recovery_audit: expect.objectContaining({
            reason: "completed_workflow_release_gate_recovery",
          }),
        });
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("returns Temporal document content without exposing phantom artifact paths", async () => {
      const { mkdtemp, mkdir, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-temporal-doc-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      await mkdir(pathJoin(changesDir, "test-change"), { recursive: true });

      try {
        const phantomPath = pathJoin(changesDir, "test-change", "design.md");
        const designContent = "# Design\n\nTemporal-only design content.";
        const store = createMockStore({
          documents: { design: designContent },
          artifacts: {
            design: {
              path: phantomPath,
              updatedAt: "2026-06-15T00:00:00.000Z",
              source: "temporal",
              readable: false,
            },
          },
        });
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          { changeId: "test-change", include: { design: true } },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._design).toBe(designContent);
        expect(parsed.artifacts.design).toMatchObject({
          source: "temporal",
          readable: false,
        });
        expect(parsed.artifacts.design).not.toHaveProperty("path");
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("supports bounded artifact-only readback without exposing phantom paths", async () => {
      const { mkdtemp, mkdir, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-artifact-only-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      await mkdir(pathJoin(changesDir, "test-change"), { recursive: true });

      try {
        const phantomPath = pathJoin(changesDir, "test-change", "design.md");
        const designContent =
          "# Design\n\nOnly this artifact should be returned.";
        const store = createMockStore({
          documents: { design: designContent },
          artifacts: {
            design: {
              path: phantomPath,
              updatedAt: "2026-06-15T00:00:00.000Z",
              source: "temporal",
              readable: false,
            },
          },
        });
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: { artifactOnly: true, design: true },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed).toMatchObject({
          id: "test-change",
          title: expect.any(String),
          status: expect.any(String),
          _artifactOnly: true,
          _design: designContent,
        });
        expect(parsed.tasks).toBeUndefined();
        expect(JSON.stringify(parsed)).not.toContain(phantomPath);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("preserves readable artifact paths that exist on disk", async () => {
      const { mkdtemp, mkdir, writeFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-readable-path-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      const realPath = pathJoin(changeDir, "proposal.md");
      await writeFile(
        realPath,
        "# Proposal\n\nReadable disk artifact.",
        "utf-8",
      );

      try {
        const store = createMockStore({
          artifacts: {
            proposal: {
              path: realPath,
              updatedAt: "2026-06-15T00:00:00.000Z",
              source: "disk",
              readable: true,
            },
          },
        });
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          { changeId: "test-change" },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.artifacts.proposal.path).toBe(realPath);
        expect(parsed.artifacts.proposal.readable).toBe(true);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("serves artifact content from the durable projection when the workflow query is unserved (AC1/AC2)", async () => {
      // Regression: a change whose originating session ended leaves its
      // workflow on an unpolled task queue, so the state.documents Query is
      // never served. The content is still durable in the projection's
      // `documents` map, so readback must return it rather than reporting the
      // artifact unreadable. The change.ts subread previously refused to even
      // invoke the artifact read once the aggregate deadline was spent,
      // surfacing `_artifactsError` while the content sat on disk.
      const { mkdtemp, mkdir, writeFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-orphan-wf-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });

      const summary = "# Executive Summary\n\nDurable projection content.\n";
      await writeFile(
        pathJoin(changeDir, "change.json"),
        JSON.stringify({
          id: "test-change",
          title: "Test Change",
          status: "active",
          documents: { executiveSummary: summary },
        }),
        "utf-8",
      );

      try {
        const store = createMockStore({
          artifacts: {
            executiveSummary: {
              path: pathJoin(changeDir, "executive-summary.md"),
              updatedAt: "2026-08-01T22:21:50.378Z",
              source: "temporal",
              readable: false,
            },
          },
        });
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        // Simulate the orphaned-queue condition: every workflow query fails
        // with the same bounded-read timeout observed in production.
        const { TemporalQueryTimeoutError } =
          await import("../temporal/retry-wrapper");
        // Reproduce the production budget arithmetic: resolving the change
        // record itself consumed ~7.3s of the 8s aggregate read budget, so the
        // artifact subread found the deadline already spent. Advance a mocked
        // clock rather than actually sleeping.
        const realNow = Date.now.bind(Date);
        let clockOffsetMs = 0;
        const nowSpy = vi
          .spyOn(Date, "now")
          .mockImplementation(() => realNow() + clockOffsetMs);
        let call = 0;
        (
          store.changes as unknown as { get: (...args: unknown[]) => unknown }
        ).get = vi.fn(async () => {
          call += 1;
          // The first read resolves the change record itself (served from the
          // disk projection in production); subsequent artifact-content reads
          // are the ones that hit the unserved workflow query.
          if (call === 1) {
            clockOffsetMs += 9_000; // exceeds TEMPORAL_READ_DEADLINE_BUDGET_MS
            return {
              success: true,
              data: {
                id: "test-change",
                title: "Test Change",
                status: "active",
                tasks: [],
                deltas: {},
                wisdom: [],
                gates: {
                  proposal: { status: "done" },
                  discovery: { status: "done" },
                  design: { status: "done" },
                  planning: { status: "done" },
                  execution: { status: "done" },
                  acceptance: { status: "done" },
                  release: { status: "pending" },
                },
              },
            };
          }
          throw new TemporalQueryTimeoutError(1_500);
        });

        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: { artifactOnly: true, executiveSummary: true },
          },
          store,
        );

        const parsed = JSON.parse(result);
        nowSpy.mockRestore();
        expect(parsed._executiveSummary).toBe(summary);
        expect(parsed._artifactsError).toBeUndefined();
        expect(parsed._artifactSources?.executiveSummary).toBe(
          "active_projection",
        );
      } finally {
        vi.restoreAllMocks();
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("returns _executiveSummary content when include.executiveSummary is set and file exists", async () => {
      const { mkdtemp, mkdir, writeFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-exec-summary-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      const execSummaryContent =
        "# Executive Summary\n\n## Outcome\nApproved cleanly.\n";
      await writeFile(
        pathJoin(changeDir, "executive-summary.md"),
        execSummaryContent,
        "utf-8",
      );
      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: { executiveSummary: true },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._executiveSummary).toBe(execSummaryContent);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("omits _executiveSummary when include.executiveSummary is set but file is missing", async () => {
      const { mkdtemp, mkdir, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-exec-summary-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      // Intentionally do NOT create executive-summary.md
      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: { executiveSummary: true },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._executiveSummary).toBeUndefined();
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("returns _executiveSummary from archive bundle when active file is missing", async () => {
      const { mkdtemp, mkdir, writeFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-archive-exec-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const archiveDir = pathJoin(tempRoot, ".adv/archive");
      const changeDir = pathJoin(changesDir, "test-change");
      const bundleDir = pathJoin(archiveDir, "20260520-test-change");
      await mkdir(bundleDir, { recursive: true });
      await writeFile(
        pathJoin(bundleDir, "change.json"),
        JSON.stringify({ id: "test-change", title: "Test Change" }),
        "utf-8",
      );
      const archivedContent =
        "# Executive Summary\n\n## Outcome\nArchived cleanly.\n";
      await writeFile(
        pathJoin(bundleDir, "executive-summary.md"),
        archivedContent,
        "utf-8",
      );
      await mkdir(changeDir, { recursive: true });
      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { archive: string }).archive = archiveDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: { executiveSummary: true },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._executiveSummary).toBe(archivedContent);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("returns _acceptance content when include.acceptance is set and file exists", async () => {
      const { mkdtemp, mkdir, writeFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-acceptance-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      const acceptanceContent =
        "# Acceptance\n\n## Contract Review Matrix\n\n| ID | Kind | Requirement | Status | Evidence |\n|---|---|---|---|---|\n| SC-1 | success_criterion | pass | verified |\n";
      await writeFile(
        pathJoin(changeDir, "acceptance.md"),
        acceptanceContent,
        "utf-8",
      );
      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: { acceptance: true },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._acceptance).toBe(acceptanceContent);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("omits _acceptance when include.acceptance is set but file is missing", async () => {
      const { mkdtemp, mkdir, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(
        pathJoin(tmpdir(), "adv-acceptance-missing-"),
      );
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      // Intentionally do NOT create acceptance.md
      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: { acceptance: true },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._acceptance).toBeUndefined();
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("returns artifact content from archive for all simple include flags", async () => {
      const { mkdtemp, mkdir, writeFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-archive-flags-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const archiveDir = pathJoin(tempRoot, ".adv/archive");
      const changeDir = pathJoin(changesDir, "test-change");
      const bundleDir = pathJoin(archiveDir, "20260520-test-change");

      await mkdir(bundleDir, { recursive: true });
      await writeFile(
        pathJoin(bundleDir, "change.json"),
        JSON.stringify({ id: "test-change", title: "Test Change" }),
        "utf-8",
      );
      await mkdir(changeDir, { recursive: true });

      const artifacts: Record<string, string> = {
        "problem-statement.md": "# Problem\n\nThe problem.",
        "agreement.md": "# Agreement\n\nThe agreement.",
        "design.md": "# Design\n\nThe design.",
        "executive-summary.md": "# Executive Summary\n\nThe executive summary.",
      };
      for (const [filename, content] of Object.entries(artifacts)) {
        await writeFile(pathJoin(bundleDir, filename), content, "utf-8");
      }

      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { archive: string }).archive = archiveDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: {
              problemStatement: true,
              agreement: true,
              design: true,
              executiveSummary: true,
            },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._problemStatement).toBe(
          artifacts["problem-statement.md"],
        );
        expect(parsed._agreement).toBe(artifacts["agreement.md"]);
        expect(parsed._design).toBe(artifacts["design.md"]);
        expect(parsed._executiveSummary).toBe(
          artifacts["executive-summary.md"],
        );
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("prefers active artifact over archive bundle", async () => {
      const { mkdtemp, mkdir, writeFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = await mkdtemp(pathJoin(tmpdir(), "adv-archive-pref-"));
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const archiveDir = pathJoin(tempRoot, ".adv/archive");
      const changeDir = pathJoin(changesDir, "test-change");
      const bundleDir = pathJoin(archiveDir, "20260520-test-change");

      await mkdir(bundleDir, { recursive: true });
      await writeFile(
        pathJoin(bundleDir, "change.json"),
        JSON.stringify({ id: "test-change", title: "Test Change" }),
        "utf-8",
      );
      await mkdir(changeDir, { recursive: true });

      const activeContent = "# Active Design\n\nCurrent version.";
      const archivedContent = "# Archived Design\n\nOld version.";
      await writeFile(pathJoin(changeDir, "design.md"), activeContent, "utf-8");
      await writeFile(
        pathJoin(bundleDir, "design.md"),
        archivedContent,
        "utf-8",
      );

      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { archive: string }).archive = archiveDir;
        (store.paths as { root: string }).root = tempRoot;

        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            include: { design: true },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._design).toBe(activeContent);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("exposes inbound ops_followup profile and outbound ops_followup_links", async () => {
      const store = createMockStore({
        ops_followup: {
          kind: "cleanup",
          source: {
            source_change_id: "parent-1",
            source_kind: "required_follow_up",
          },
          relationship: "cleanup_after",
          status: "not_started",
          created_at: "2026-01-01T00:00:00Z",
          evidence: [],
        },
        ops_followup_links: [
          {
            id: "ofl-1",
            changeId: "child-1",
            relationship: "follows_release",
            status: "not_started",
            required_handoff: true,
            linked_at: "2026-01-01T00:00:00Z",
          },
        ],
      });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.ops_followup).toMatchObject({
        kind: "cleanup",
        relationship: "cleanup_after",
        status: "not_started",
      });
      expect(parsed.ops_followup_links).toHaveLength(1);
      expect(parsed.ops_followup_links[0]).toMatchObject({
        id: "ofl-1",
        changeId: "child-1",
        required_handoff: true,
      });
    });

    test("exposes compact ops annotations from full changes.list", async () => {
      const store = createMockStore();
      vi.mocked(store.changes.list).mockResolvedValue({
        changes: [
          {
            id: "ops-change",
            title: "Ops Change",
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
            lastActivityAt: "2026-01-01T01:00:00Z",
            taskCount: 1,
            completedTasks: 0,
            ops_followup: {
              kind: "migration",
              source: {
                source_change_id: "parent-2",
                source_kind: "report_follow_up",
              },
              relationship: "blocks",
              status: "running",
              created_at: "2026-01-01T00:00:00Z",
              evidence: [
                {
                  id: "ev-1",
                  recorded_at: "2026-01-01T00:00:00Z",
                  env: "prod",
                  action: "migrate",
                  status: "started",
                  summary: "started",
                },
              ],
            },
            ops_followup_links: [
              {
                id: "ofl-2",
                changeId: "child-2",
                relationship: "monitors",
                status: "partial",
                required_handoff: false,
                linked_at: "2026-01-01T00:00:00Z",
              },
            ],
          },
        ],
      });

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = JSON.parse(result);
      expect(parsed.changes).toHaveLength(1);
      const c = parsed.changes[0];
      expect(c.ops_followup).toEqual({
        kind: "migration",
        relationship: "blocks",
        status: "running",
        evidence_count: 1,
      });
      expect(c.ops_followup_links).toEqual([
        {
          id: "ofl-2",
          changeId: "child-2",
          relationship: "monitors",
          status: "partial",
          status_source: "parent_snapshot",
          completion_proof: "unverified",
          required_handoff: false,
        },
      ]);
    });

    test("exposes compact ops annotations from listSummary", async () => {
      const store = createMockStore();
      store.changes.listSummary = vi.fn().mockResolvedValue({
        changes: [
          {
            id: "summary-ops",
            title: "Summary Ops",
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
            lastActivityAt: "2026-01-01T01:00:00Z",
            taskCount: 0,
            completedTasks: 0,
            ops_followup: {
              kind: "backfill",
              source: {
                source_change_id: "parent-3",
                source_kind: "manual",
              },
              relationship: "follows_release",
              status: "complete",
              created_at: "2026-01-01T00:00:00Z",
              evidence: [],
            },
            ops_followup_links: [
              {
                id: "ofl-3",
                changeId: "child-3",
                relationship: "cleanup_after",
                status: "not_started",
                required_handoff: true,
                linked_at: "2026-01-01T00:00:00Z",
              },
            ],
          },
        ],
        hydrationStats: {
          totalIds: 1,
          fromMemo: 1,
          fromHydration: 0,
        },
      });

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = JSON.parse(result);
      const c = parsed.changes[0];
      expect(c.ops_followup).toEqual({
        kind: "backfill",
        relationship: "follows_release",
        status: "complete",
        evidence_count: 0,
      });
      expect(c.ops_followup_links).toEqual([
        {
          id: "ofl-3",
          changeId: "child-3",
          relationship: "cleanup_after",
          status: "not_started",
          status_source: "parent_snapshot",
          completion_proof: "unverified",
          required_handoff: true,
        },
      ]);
    });
    test("exposes compact Epic annotation from listSummary", async () => {
      const store = createMockStore();
      store.changes.listSummary = vi.fn().mockResolvedValue({
        changes: [
          {
            id: "summary-epic",
            title: "Summary Epic",
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
            lastActivityAt: "2026-01-01T01:00:00Z",
            taskCount: 0,
            completedTasks: 0,
            epic_membership: {
              epic_id: "addAuthEpic",
              entry_id: "en-001",
              order: 0,
              title: "Add OAuth",
              linked_at: "2026-01-01T00:00:00Z",
            },
          },
        ],
        hydrationStats: {
          totalIds: 1,
          fromMemo: 0,
          fromHydration: 1,
        },
      });

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = JSON.parse(result);
      const c = parsed.changes[0];
      expect(c.epic).toEqual({
        id: "addAuthEpic",
        title: "Add OAuth",
        entry_id: "en-001",
      });
      expect(store.epics.get).not.toHaveBeenCalled();
    });

    test("passes through terminal degraded metadata from listSummary", async () => {
      const store = createMockStore();
      store.changes.listSummary = vi.fn().mockResolvedValue({
        changes: [
          {
            id: "degraded-terminal",
            title: "Degraded Terminal",
            status: "archived",
            created_at: "2026-01-01T00:00:00Z",
            lastActivityAt: "2026-01-01T01:00:00Z",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
        warnings: [
          {
            code: "TERMINAL_SOURCE_DEGRADED",
            source: "visibility",
            message: "Visibility list failed",
          },
        ],
        hydrationStats: {
          terminalCandidates: 1,
          terminalFromArchive: 1,
          terminalFromDisk: 0,
          terminalFromWorkflow: 0,
          omitted: 0,
        },
      });

      const result = await changeTools.adv_change_list.execute(
        { includeArchived: true },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed.warnings).toEqual([
        {
          code: "TERMINAL_SOURCE_DEGRADED",
          source: "visibility",
          message: "Visibility list failed",
        },
      ]);
      expect(parsed.hydrationStats).toEqual({
        terminalCandidates: 1,
        terminalFromArchive: 1,
        terminalFromDisk: 0,
        terminalFromWorkflow: 0,
        omitted: 0,
      });
    });

    test("does not include degraded terminal metadata on default list from listSummary", async () => {
      const store = createMockStore();
      store.changes.listSummary = vi.fn().mockResolvedValue({
        changes: [
          {
            id: "active-only",
            title: "Active Only",
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
            lastActivityAt: "2026-01-01T01:00:00Z",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
      });

      const result = await changeTools.adv_change_list.execute({}, store);
      const parsed = JSON.parse(result);
      expect(parsed.warnings).toBeUndefined();
      expect(parsed.hydrationStats).toBeUndefined();
    });

    test("default active/in-flight adv_change_list excludes terminal rows from listSummary", async () => {
      const store = createMockStore();
      store.changes.listSummary = vi.fn().mockResolvedValue({
        changes: [
          {
            id: "draftA",
            title: "Draft A",
            status: "draft",
            created_at: "2026-01-01T00:00:00Z",
            lastActivityAt: "2026-01-01T01:00:00Z",
            taskCount: 0,
            completedTasks: 0,
          },
          {
            id: "archivedB",
            title: "Archived B",
            status: "archived",
            created_at: "2025-12-01T00:00:00Z",
            lastActivityAt: "2025-12-01T01:00:00Z",
            taskCount: 0,
            completedTasks: 0,
          },
          {
            id: "closedC",
            title: "Closed C",
            status: "closed",
            created_at: "2025-11-01T00:00:00Z",
            lastActivityAt: "2025-11-01T01:00:00Z",
            taskCount: 0,
            completedTasks: 0,
          },
        ],
      });
      vi.mocked(store.changes.list).mockRejectedValue(
        new Error("full changes.list should not be called for default list"),
      );

      const result = await changeTools.adv_change_list.execute(
        { status: "in-flight" },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.changes.map((c: { id: string }) => c.id)).toEqual([
        "draftA",
      ]);
      expect(store.changes.listSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          status: undefined,
          includeArchived: undefined,
          includeClosed: undefined,
        }),
      );
      expect(store.changes.list).not.toHaveBeenCalled();
      expect(parsed.warnings).toBeUndefined();
      expect(parsed.hydrationStats).toBeUndefined();
    });

    describe("adv_change_list status filter rejection", () => {
      const openChanges = [
        {
          id: "change-a",
          title: "Change A",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          lastActivityAt: "2026-01-01T01:00:00Z",
          taskCount: 0,
          completedTasks: 0,
        },
        {
          id: "change-b",
          title: "Change B",
          status: "draft",
          created_at: "2026-01-02T00:00:00Z",
          lastActivityAt: "2026-01-02T01:00:00Z",
          taskCount: 0,
          completedTasks: 0,
        },
      ];

      function makeFilteringStore() {
        const store = createMockStore();
        store.changes.listSummary = vi
          .fn()
          .mockImplementation(async (filter) => {
            let changes = [...openChanges];
            if (filter?.status) {
              changes = changes.filter((c) => c.status === filter.status);
            }
            return { changes };
          });
        return store;
      }

      test('rejects status: "active" with a hint to use in-flight', async () => {
        const store = makeFilteringStore();
        const result = await changeTools.adv_change_list.execute(
          { status: "active" },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed.error).toContain("active");
        expect(parsed.error).toContain("in-flight");
        expect(parsed.changes).toBeUndefined();
      });

      test('rejects status: "pending" with a hint to use in-flight', async () => {
        const store = makeFilteringStore();
        const result = await changeTools.adv_change_list.execute(
          { status: "pending" },
          store,
        );
        const parsed = JSON.parse(result);
        expect(parsed.error).toContain("pending");
        expect(parsed.error).toContain("in-flight");
        expect(parsed.changes).toBeUndefined();
      });

      test("draft, in-flight, and default return the same open set", async () => {
        const store = makeFilteringStore();

        const defaultResult = await changeTools.adv_change_list.execute(
          {},
          store,
        );
        const defaultParsed = JSON.parse(defaultResult);
        expect(defaultParsed.changes.map((c: { id: string }) => c.id)).toEqual([
          "change-a",
          "change-b",
        ]);

        const draftResult = await changeTools.adv_change_list.execute(
          { status: "draft" },
          store,
        );
        const draftParsed = JSON.parse(draftResult);
        expect(draftParsed.changes.map((c: { id: string }) => c.id)).toEqual([
          "change-a",
          "change-b",
        ]);

        const inFlightResult = await changeTools.adv_change_list.execute(
          { status: "in-flight" },
          store,
        );
        const inFlightParsed = JSON.parse(inFlightResult);
        expect(inFlightParsed.changes.map((c: { id: string }) => c.id)).toEqual(
          ["change-a", "change-b"],
        );
      });
    });

    describe("adv_change_list phase projection", () => {
      const phaseRow = (overrides: Record<string, unknown>) => ({
        id: "row",
        title: "Row",
        status: "draft",
        created_at: "2026-01-01T00:00:00Z",
        lastActivityAt: "2026-01-01T01:00:00Z",
        taskCount: 0,
        completedTasks: 0,
        ...overrides,
      });

      test("renders distinct phase for never-started, mid-execution, and release-complete-but-open changes", async () => {
        const store = createMockStore();
        store.changes.listSummary = vi.fn().mockResolvedValue({
          changes: [
            phaseRow({
              id: "fresh-change",
              currentGate: "proposal",
              lifecycleState: "open",
            }),
            phaseRow({
              id: "mid-change",
              currentGate: "execution",
              lifecycleState: "open",
            }),
            phaseRow({
              id: "wedged-change",
              currentGate: "done",
              lifecycleState: "open",
            }),
          ],
        });

        const result = await changeTools.adv_change_list.execute({}, store);
        const parsed = JSON.parse(result);
        expect(parsed.changes).toHaveLength(3);
        const byId = Object.fromEntries(
          parsed.changes.map((c: { id: string; phase?: string }) => [
            c.id,
            c.phase,
          ]),
        );
        // All three rows share status "draft" (the permanent-draft wedge);
        // phase is what distinguishes real progress. status is unchanged.
        for (const c of parsed.changes) expect(c.status).toBe("draft");
        expect(byId["fresh-change"]).toBe("proposal");
        expect(byId["mid-change"]).toBe("execution");
        expect(byId["wedged-change"]).toBe("released");
        expect(new Set(Object.values(byId)).size).toBe(3);
        // Gate/lifecycle hints are internal plumbing; only phase is exposed.
        for (const c of parsed.changes) {
          expect(c.currentGate).toBeUndefined();
          expect(c.lifecycleState).toBeUndefined();
        }
      });

      test("terminal lifecycle states render as their own phase", async () => {
        const store = createMockStore();
        store.changes.listSummary = vi.fn().mockResolvedValue({
          changes: [
            phaseRow({
              id: "archived-change",
              status: "archived",
              currentGate: "done",
              lifecycleState: "archived",
            }),
            phaseRow({
              id: "closed-change",
              status: "closed",
              currentGate: "proposal",
              lifecycleState: "closed",
            }),
          ],
        });

        const result = await changeTools.adv_change_list.execute(
          { includeArchived: true, includeClosed: true },
          store,
        );
        const parsed = JSON.parse(result);
        const byId = Object.fromEntries(
          parsed.changes.map((c: { id: string; phase?: string }) => [
            c.id,
            c.phase,
          ]),
        );
        expect(byId["archived-change"]).toBe("archived");
        expect(byId["closed-change"]).toBe("closed");
      });

      test("omits phase rather than fabricating progress when the store row lacks a gate hint", async () => {
        const store = createMockStore();
        store.changes.listSummary = vi.fn().mockResolvedValue({
          changes: [phaseRow({ id: "legacy-row", lifecycleState: "open" })],
        });

        const result = await changeTools.adv_change_list.execute({}, store);
        const parsed = JSON.parse(result);
        expect(parsed.changes).toHaveLength(1);
        expect(parsed.changes[0].status).toBe("draft");
        expect("phase" in parsed.changes[0]).toBe(false);
      });
    });
  });

  describe("adv_change_show — phase plan parity matrix (AC10)", () => {
    // One table-driven pass over the shared parity matrix: all seven gate
    // positions, never-started, all-gates-done, approval, readiness-blocked,
    // precise recovery, precedence collisions, archived, closed, and the
    // malformed projection (typed degraded plan, no directive).
    test.each(PARITY_ROWS)("$name", async (row) => {
      const store = createMockStore(toolChangeFor(row));

      const result = await changeTools.adv_change_show.execute(
        {
          changeId: "test-change",
          include: { phasePlan: true, snapshot: true },
        },
        store,
      );
      const parsed = JSON.parse(result);

      // The projection always parses as exactly one strict plan variant.
      const plan = parsePhasePlan(parsed._phasePlan);
      expect(plan.kind).toBe(row.expect.planKind);
      if (row.expect.planKind === "actionable") {
        expect(plan).toMatchObject({
          gateId: row.expect.planGateId,
          command: row.expect.planCommand,
          failClosed: false,
        });
      } else {
        expect(plan.failClosed).toBe(true);
        // Non-authorizing variants carry no route or command.
        expect(parsed._phasePlan).not.toHaveProperty("command");
        expect(parsed._phasePlan).not.toHaveProperty("route");
      }

      // The snapshot Next line tracks the same routing the plan reports.
      // Explicitly requested projections remain available on lean directive
      // reads, so callers never lose their requested snapshot.
      if (row.expect.snapshotNext) {
        expect(parsed._contextSnapshot).toContain(row.expect.snapshotNext);
      } else {
        expect(parsed._contextSnapshot ?? "").not.toContain("Next:");
      }

      // The tool projection equals the canonical derivation over the same
      // durable snapshot — consumers never see a second opinion.
      const change = (await store.changes.get("test-change")).data!;
      expect(parsed._phasePlan).toEqual(
        withPhaseDirective(
          derivePhasePlanSafe(
            changeToDirectiveState({
              projectId: PROJECT_ID,
              change,
              gates: row.state.gates,
            }),
            Date.now(),
          ),
        ),
      );

      // Routing-only read: no workflow signals from any matrix row.
      expect(mocks.signalMock).not.toHaveBeenCalled();
    });
  });

  describe("target_path artifact readback/update authority (AC1/AC2)", () => {
    test("target artifact readback returns every requested kind from target Temporal documents (AC1)", async () => {
      const store = createMockStore();
      const sourceChange = (await store.changes.get("test-change"))
        .data as Change;
      const getDefault = mocks.targetStore.changes.get.getMockImplementation();
      vi.mocked(mocks.targetStore.changes.get).mockResolvedValue({
        success: true,
        data: {
          ...sourceChange,
          documents: {
            proposal: "target-proposal-multi",
            design: "target-design-multi",
            agreement: "target-agreement-multi",
          },
        },
      });
      mocks.withTargetPathStore.mockClear();

      try {
        const result = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            target_path: "/tmp/target",
            include: {
              proposal: true,
              design: true,
              agreement: true,
              artifactOnly: true,
            },
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._proposal).toBe("target-proposal-multi");
        expect(parsed._design).toBe("target-design-multi");
        expect(parsed._agreement).toBe("target-agreement-multi");
        expect(parsed._projectContext).toMatchObject({ stateMode: "temporal" });
        expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
          expect.objectContaining({
            target_path: "/tmp/target",
            stateRequirement: "temporal-required",
            mutation: false,
          }),
          expect.any(Function),
        );
      } finally {
        mocks.targetStore.changes.get.mockReset();
        if (getDefault) {
          mocks.targetStore.changes.get.mockImplementation(getDefault);
        }
      }
    });

    test("target artifact update routes through Temporal-backed target store and writes the target, not local (AC2)", async () => {
      const store = createMockStore();
      const sourceChange = (await store.changes.get("test-change"))
        .data as Change;
      const getDefault = mocks.targetStore.changes.get.getMockImplementation();
      const updateDefault =
        mocks.targetStore.changes.updateArtifacts.getMockImplementation();
      vi.mocked(mocks.targetStore.changes.get).mockResolvedValue({
        success: true,
        data: sourceChange,
      });
      vi.mocked(mocks.targetStore.changes.updateArtifacts).mockResolvedValue({
        success: true,
        designPath: "/tmp/target/.adv/changes/test-change/design.md",
      });
      mocks.withTargetPathStore.mockClear();

      try {
        const result = await changeTools.adv_change_update.execute(
          {
            changeId: "test-change",
            target_path: "/tmp/target",
            design: "updated-design-content",
            target_confirmed: true,
            confirmationEvidence: "user approved target artifact update",
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.error).toBeUndefined();
        expect(parsed.designPath).toContain("design.md");
        // Structural identity pin: the artifact mutation output addresses the
        // resolved target project, not the source project.
        expect(parsed._projectContext).toMatchObject({
          root: "/tmp/target",
          projectId: TARGET_PROJECT_ID,
          stateMode: "temporal",
        });
        expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
          expect.objectContaining({
            currentProjectPath: "/tmp/test",
            target_path: "/tmp/target",
            stateRequirement: "temporal-required",
            target_confirmed: true,
            confirmationEvidence: "user approved target artifact update",
          }),
          expect.any(Function),
        );
        expect(mocks.targetStore.changes.updateArtifacts).toHaveBeenCalledWith(
          "test-change",
          { design: "updated-design-content" },
        );
        // Local store must NOT receive the artifact write.
        expect(store.changes.updateArtifacts).not.toHaveBeenCalled();
      } finally {
        mocks.targetStore.changes.get.mockReset();
        mocks.targetStore.changes.updateArtifacts.mockReset();
        if (getDefault) {
          mocks.targetStore.changes.get.mockImplementation(getDefault);
        }
        if (updateDefault) {
          mocks.targetStore.changes.updateArtifacts.mockImplementation(
            updateDefault,
          );
        }
      }
    });

    test("target artifact update is readable back from the same target store, not local disk (AC2)", async () => {
      const store = createMockStore();
      const sourceChange = (await store.changes.get("test-change"))
        .data as Change;
      const targetDocuments: Record<string, string> = {
        design: "original-target-design",
      };
      const getDefault = mocks.targetStore.changes.get.getMockImplementation();
      const updateDefault =
        mocks.targetStore.changes.updateArtifacts.getMockImplementation();
      vi.mocked(mocks.targetStore.changes.get).mockImplementation(async () => ({
        success: true,
        data: { ...sourceChange, documents: { ...targetDocuments } },
      }));
      vi.mocked(mocks.targetStore.changes.updateArtifacts).mockImplementation(
        async (_id: unknown, arts: Record<string, string>) => {
          Object.assign(targetDocuments, arts);
          return {
            success: true,
            designPath: "/tmp/target/.adv/changes/test-change/design.md",
          };
        },
      );
      mocks.withTargetPathStore.mockClear();

      try {
        await changeTools.adv_change_update.execute(
          {
            changeId: "test-change",
            target_path: "/tmp/target",
            design: "updated-via-target",
            target_confirmed: true,
            confirmationEvidence: "user approved target artifact update",
          },
          store,
        );

        const showResult = await changeTools.adv_change_show.execute(
          {
            changeId: "test-change",
            target_path: "/tmp/target",
            include: { design: true, artifactOnly: true },
          },
          store,
        );

        const parsed = JSON.parse(showResult);
        // Same-target readback reflects the update, proving target Temporal
        // documents are the authority (not local disk scaffold).
        expect(parsed._design).toBe("updated-via-target");
        expect(parsed._projectContext).toMatchObject({ stateMode: "temporal" });
        // Local store is only touched for the sourceChange seed above — never
        // as the content authority for target update or readback.
        expect(store.changes.get).toHaveBeenCalledTimes(1);
        expect(store.changes.updateArtifacts).not.toHaveBeenCalled();
      } finally {
        mocks.targetStore.changes.get.mockReset();
        mocks.targetStore.changes.updateArtifacts.mockReset();
        if (getDefault) {
          mocks.targetStore.changes.get.mockImplementation(getDefault);
        }
        if (updateDefault) {
          mocks.targetStore.changes.updateArtifacts.mockImplementation(
            updateDefault,
          );
        }
      }
    });
  });

  describe("adv_change_update", () => {
    test("rejects mixed real and blank artifact updates before storage writes", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_update.execute(
        {
          changeId: "test-change",
          proposal: "# Valid proposal update",
          design: "   ",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Blank artifact fields are not allowed");
      expect(parsed.fields).toEqual(["design"]);
      expect(parsed.hint).toContain("omit fields you do not intend to change");
      expect(store.changes.updateArtifacts).not.toHaveBeenCalled();
    });

    // rq-schemaDriftToolLayer: schema errors from store.changes.get must
    // propagate verbatim. Pre-fix the L1793 check masks them as
    // "Change '...' not found."; post-fix the check splits so schema errors
    // surface directly.
    test("propagates schema errors from changes.get verbatim instead of masking as 'Change not found'", async () => {
      const schemaErrorText =
        'Schema validation failed for change "test-change":\n  status: invalid';
      const store = createMockStore();
      vi.mocked(store.changes.get).mockResolvedValue({
        success: false,
        error: schemaErrorText,
      });

      const result = await changeTools.adv_change_update.execute(
        { changeId: "test-change", proposal: "# update" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Schema validation failed");
      expect(parsed.error).not.toContain("not found");
      expect(store.changes.updateArtifacts).not.toHaveBeenCalled();
    });

    test("allows omitted artifact fields to remain unchanged", async () => {
      const store = createMockStore();
      vi.mocked(store.changes.updateArtifacts).mockResolvedValueOnce({
        success: true,
        proposalPath: "/tmp/test/.adv/changes/test-change/proposal.md",
      });

      const result = await changeTools.adv_change_update.execute(
        {
          changeId: "test-change",
          proposal: "# Valid proposal update",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.proposalPath).toContain("proposal.md");
      expect(store.changes.updateArtifacts).toHaveBeenCalledWith(
        "test-change",
        { proposal: "# Valid proposal update" },
      );
    });

    test("recovers executive-summary metadata without readable path when file is not materialized", async () => {
      const { createHash } = await import("crypto");
      const { mkdir, readFile, rm, writeFile } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = pathJoin(
        tmpdir(),
        `adv-change-update-recovery-${Date.now()}`,
      );
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        pathJoin(changeDir, "change.json"),
        JSON.stringify({
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
        }),
        "utf-8",
      );

      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;
        vi.mocked(store.changes.updateArtifacts).mockRejectedValueOnce(
          Object.assign(new Error("workflow execution already completed"), {
            name: "WorkflowExecutionAlreadyCompleted",
          }),
        );

        const executiveSummary = "# Executive Summary\n\nDurable proof.";
        const result = await changeTools.adv_change_update.execute(
          {
            changeId: "test-change",
            executiveSummary,
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._recoveryMutation).toBe(true);
        expect(parsed.executiveSummaryReadable).toBe(false);
        expect(parsed).not.toHaveProperty("executiveSummaryPath");
        const saved = JSON.parse(
          await readFile(pathJoin(changeDir, "change.json"), "utf-8"),
        );
        expect(saved.artifacts.executiveSummary).toMatchObject({
          contentHash: createHash("sha256")
            .update(executiveSummary)
            .digest("hex"),
          readable: false,
        });
        expect(saved.artifacts.executiveSummary).not.toHaveProperty("path");
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("recovers executive-summary metadata via probe-first poisoned classification", async () => {
      const { mkdir, readFile, rm, writeFile } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = pathJoin(
        tmpdir(),
        `adv-change-update-poisoned-recovery-${Date.now()}`,
      );
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        pathJoin(changeDir, "change.json"),
        JSON.stringify({
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
        }),
        "utf-8",
      );

      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;
        (
          mocks.handleMock as typeof mocks.handleMock & {
            describe: ReturnType<typeof vi.fn>;
          }
        ).describe = vi.fn(async () => ({
          searchAttributes: {
            TemporalReportedProblems: [
              "category=WorkflowTaskFailed",
              "cause=WorkflowTaskFailedCauseNonDeterministicError",
            ],
          },
        }));

        const result = await changeTools.adv_change_update.execute(
          {
            changeId: "test-change",
            executiveSummary: "# Executive Summary\n\nRecovered from poison.",
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._recoveryMutation).toBe(true);
        expect(mocks.getChangeHandle).toHaveBeenCalledWith(
          mocks.temporalBundle,
          PROJECT_ID,
          "test-change",
        );
        // Probe-first recovery should skip the signal path entirely.
        expect(store.changes.updateArtifacts).not.toHaveBeenCalled();
        const saved = JSON.parse(
          await readFile(pathJoin(changeDir, "change.json"), "utf-8"),
        );
        expect(saved.artifacts.executiveSummary.source).toBe("recovery");
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    test("preserves recovery executive-summary path when file is materialized", async () => {
      const { createHash } = await import("crypto");
      const { mkdir, readFile, rm, writeFile } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = pathJoin(
        tmpdir(),
        `adv-change-update-recovery-readable-${Date.now()}`,
      );
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });
      await writeFile(
        pathJoin(changeDir, "change.json"),
        JSON.stringify({
          id: "test-change",
          title: "Test Change",
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {},
        }),
        "utf-8",
      );

      try {
        const executiveSummary = "# Executive Summary\n\nDurable proof.";
        await writeFile(
          pathJoin(changeDir, "executive-summary.md"),
          executiveSummary,
          "utf-8",
        );
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;
        vi.mocked(store.changes.updateArtifacts).mockRejectedValueOnce(
          Object.assign(new Error("workflow execution already completed"), {
            name: "WorkflowExecutionAlreadyCompleted",
          }),
        );

        const result = await changeTools.adv_change_update.execute(
          {
            changeId: "test-change",
            executiveSummary,
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.executiveSummaryReadable).toBe(true);
        expect(parsed.executiveSummaryPath).toBe(
          pathJoin(changeDir, "executive-summary.md"),
        );
        const saved = JSON.parse(
          await readFile(pathJoin(changeDir, "change.json"), "utf-8"),
        );
        expect(saved.artifacts.executiveSummary).toMatchObject({
          path: pathJoin(changeDir, "executive-summary.md"),
          contentHash: createHash("sha256")
            .update(executiveSummary)
            .digest("hex"),
          readable: true,
        });
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
    test("include.snapshot renders compact Epic context line without hydrating Epic", async () => {
      const store = createMockStore({
        id: "epicChild",
        title: "Epic child change",
        epic_membership: {
          epic_id: "addAuthEpic",
          entry_id: "en-001",
          order: 0,
          title: "Add OAuth",
          linked_at: "2026-06-24T00:00:00.000Z",
        },
      });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "epicChild", include: { snapshot: true } },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._contextSnapshot).toEqual(expect.any(String));
      expect(parsed._contextSnapshot).toContain("Epic:");
      expect(parsed._contextSnapshot).toContain("addAuthEpic");
      expect(parsed._contextSnapshot).toContain("Add OAuth");
      // Default hot path must not call Epic store hydration.
      expect(store.epics.get).not.toHaveBeenCalled();
    });

    test("returns generated briefing packet when include.briefingPacket is set", async () => {
      const store = createMockStore({
        origin: { kind: "discovery", source_artifact: "test-source" },
        documents: {
          proposal:
            "# Test Change\n\n## Scope\n\n- in scope item\n\n## User Outcomes\n\n- outcome one\n",
        },
        contract: {
          version: 1,
          rigor: "standard",
          source: {
            artifact: "agreement",
            approvedAt: "2026-01-01T00:00:00Z",
          },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Packet is returned",
              sourceArtifact: "agreement",
              evidencePolicy: "test",
              status: "approved",
            },
          ],
        },
        tasks: [
          {
            id: "tk-1",
            title: "Wire packet",
            status: "in_progress",
            priority: 0,
            created_at: "2026-01-01T00:00:00Z",
            touched_files: ["plugin/src/tools/change.ts"],
          } as Change["tasks"][number],
        ],
        affectedPaths: ["plugin/src/tools/change.ts"],
      });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { briefingPacket: true } },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._briefingPacket).toBeDefined();
      expect(parsed._briefingPacket.change_id).toBe("test-change");
      expect(parsed._briefingPacket.lane).toBe("engineer");
      expect(parsed._briefingPacket.schema_version).toBe("1.0");
      expect(parsed._briefingPacket.sections).toEqual(expect.any(Array));
      expect(parsed._briefingPacket.facts).toEqual([]);
      const sectionKinds = parsed._briefingPacket.sections.map(
        (s: { kind: string }) => s.kind,
      );
      expect(sectionKinds).toContain("identity_anchors");
      expect(sectionKinds).toContain("scope");
      expect(sectionKinds).toContain("contract");
      expect(sectionKinds).toContain("tasks");
      expect(sectionKinds).toContain("affected_files");
    });

    test("honors include.briefingPacketLane when generating packet", async () => {
      const store = createMockStore({
        documents: {
          proposal: "# Test Change\n\n## Scope\n\n- in scope item\n",
        },
      });
      const result = await changeTools.adv_change_show.execute(
        {
          changeId: "test-change",
          include: { briefingPacket: true, briefingPacketLane: "reviewer" },
        },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._briefingPacket).toBeDefined();
      expect(parsed._briefingPacket.lane).toBe("reviewer");
    });

    test("bounds briefing packet request metadata", async () => {
      const store = createMockStore({
        documents: {
          proposal: "# Test Change\n",
        },
      });

      const result = await changeTools.adv_change_show.execute(
        {
          changeId: "test-change",
          include: {
            briefingPacket: true,
            briefingPacketRequest: "x".repeat(500),
          },
        },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._briefingPacket.session_metadata.generated_by).toHaveLength(
        200,
      );
      expect(parsed._briefingPacket.session_metadata.generated_by).toMatch(
        /^adv_change_show:engineer:x+$/,
      );
    });

    test("preserves explicitly requested briefing failures beside a review directive", async () => {
      const store = createMockStore({
        documents: { proposal: "# Test Change\n" },
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "done" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
      });
      (store.paths as { root?: string }).root = undefined;

      const result = await changeTools.adv_change_show.execute(
        {
          changeId: "test-change",
          include: { phasePlan: true, briefingPacket: true },
        },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed._phasePlan.directive).toBeDefined();
      expect(parsed._briefingPacket).toBeUndefined();
      expect(parsed._briefingPacketError).toEqual(expect.any(String));
      expect(parsed.id).toBe("test-change");
    });

    test("includes structurally classified durable facts from persisted reports", async () => {
      const store = createMockStore({
        subagent_reports: [
          {
            schema_version: "1.0",
            change_id: "test-change",
            attempt: 1,
            workdir_used: "/tmp/test",
            scope: { kind: "change", scope_key: "review:acceptance" },
            agent: "adv-reviewer",
            phase: "review",
            verdict: "READY",
            blocking_findings: [],
            nonblocking_findings: [],
            changes_made: [],
            wisdom_candidates: [
              { type: "pattern", content: "Use generated packet slices" },
            ],
            verification: {
              tests_run: ["bin/oc-test targeted -- src/tools/change.test.ts"],
              results: "pass",
              evidence: "targeted tests passed",
            },
            scope_drift: null,
            risks: [],
            required_main_agent_actions: [],
          } as NonNullable<Change["subagent_reports"]>[number],
        ],
      });

      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change", include: { briefingPacket: true } },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._briefingPacket.facts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            outcome: "wisdom_candidate",
            source_label: "wisdom_candidates",
            content: "[pattern] Use generated packet slices",
          }),
        ]),
      );
      const durableFacts = parsed._briefingPacket.sections.find(
        (s: { kind: string }) => s.kind === "durable_facts",
      );
      expect(durableFacts).toBeDefined();
    });

    test("default adv_change_show output omits _briefingPacket", async () => {
      const store = createMockStore({
        documents: {
          proposal: "# Test Change\n",
        },
      });
      const result = await changeTools.adv_change_show.execute(
        { changeId: "test-change" },
        store,
      );
      const parsed = JSON.parse(result);
      expect(parsed._briefingPacket).toBeUndefined();
    });
  });

  describe("adv_change_create", () => {
    test("passes origin metadata into create seed instead of late-saving it", async () => {
      const store = createMockStore({ id: "createOriginSeed" });
      vi.mocked(store.changes.create).mockResolvedValueOnce({
        changeId: "createOriginSeed",
        path: "/tmp/test/.adv/changes/createOriginSeed/proposal.md",
      });
      const claimChecker = vi.fn().mockResolvedValue([]);

      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Create origin seed",
          origin_kind: "triage",
          origin_issue_number: 12,
          origin_source_artifact: "ag-12",
        },
        store,
        undefined,
        { claimChecker, claimRaceCheckMs: 0 },
      );

      const parsed = JSON.parse(result);
      expect(parsed.origin).toEqual({
        kind: "triage",
        issue_number: 12,
        source_artifact: "ag-12",
      });
      expect(store.changes.create).toHaveBeenCalledWith("Create origin seed", {
        capability: undefined,
        artifacts: {},
        initialMetadata: {
          origin: {
            kind: "triage",
            issue_number: 12,
            source_artifact: "ag-12",
          },
        },
      });
      expect(store.changes.save).not.toHaveBeenCalledWith(
        expect.objectContaining({
          origin: expect.anything(),
        }),
      );
    });
    test("seeds epic_membership into create initialMetadata", async () => {
      const store = createMockStore({ id: "epicMember" });
      vi.mocked(store.changes.create).mockResolvedValueOnce({
        changeId: "epicMember",
        path: "/tmp/test/.adv/changes/epicMember/proposal.md",
      });
      const claimChecker = vi.fn().mockResolvedValue([]);

      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Epic member change",
          epic_id: "addAuthEpic",
          entry_id: "entry-1",
          epic_order: 2,
          epic_title: "Epic Entry One",
        },
        store,
        undefined,
        { claimChecker, claimRaceCheckMs: 0 },
      );

      const parsed = JSON.parse(result);
      expect(parsed.epic_membership).toEqual({
        epic_id: "addAuthEpic",
        entry_id: "entry-1",
        order: 2,
        title: "Epic Entry One",
        linked_at: expect.any(String),
      });
      expect(store.changes.create).toHaveBeenCalledWith("Epic member change", {
        capability: undefined,
        artifacts: {},
        initialMetadata: {
          epic_membership: {
            epic_id: "addAuthEpic",
            entry_id: "entry-1",
            order: 2,
            title: "Epic Entry One",
            linked_at: expect.any(String),
          },
        },
      });
    });

    test("rejects partial create-time epic membership before create", async () => {
      const store = createMockStore({ id: "partialEpicMember" });
      const claimChecker = vi.fn().mockResolvedValue([]);

      const result = await changeTools.adv_change_create.execute(
        {
          summary: "Partial epic member",
          epic_id: "addAuthEpic",
        },
        store,
        undefined,
        { claimChecker, claimRaceCheckMs: 0 },
      );

      const parsed = JSON.parse(result);
      expect(parsed.code).toBe("INVALID_EPIC_MEMBERSHIP_SEED");
      expect(parsed.fields).toEqual(["entry_id", "epic_title"]);
      expect(store.changes.create).not.toHaveBeenCalled();
    });

    test("rejects active plain same-summary duplicate before create", async () => {
      const store = createMockStore({
        id: "fixOpenBugs",
        title: "Fix open bugs",
        status: "active",
      });
      const existing = {
        id: "fixOpenBugs",
        title: "Fix open bugs",
        status: "active",
      };
      store.changes.list = vi.fn(async (filter) => ({
        changes: filter?.status === "active" ? [existing] : [existing],
      }));
      vi.mocked(store.changes.create).mockResolvedValueOnce({
        changeId: "fixOpenBugs2",
        path: "/tmp/test/.adv/changes/fixOpenBugs2/proposal.md",
      });
      const claimChecker = vi.fn().mockResolvedValue([]);

      const result = await changeTools.adv_change_create.execute(
        { summary: "Fix open bugs" },
        store,
        undefined,
        { claimChecker, claimRaceCheckMs: 0 },
      );

      const parsed = JSON.parse(result);
      expect(parsed.code).toBe("DUPLICATE_ACTIVE_CHANGE");
      expect(parsed.existing_change_id).toBe("fixOpenBugs");
      expect(parsed.existing_change_title).toBe("Fix open bugs");
      expect(store.changes.create).not.toHaveBeenCalled();
    });

    test("does not reject duplicate summary when existing change is archived", async () => {
      const store = createMockStore({
        id: "fixOpenBugs",
        title: "Fix open bugs",
        status: "archived",
      });
      const existing = {
        id: "fixOpenBugs",
        title: "Fix open bugs",
        status: "archived",
      };
      store.changes.list = vi.fn(async (filter) => ({
        changes: filter?.status === "active" ? [] : [existing],
      }));
      vi.mocked(store.changes.create).mockResolvedValueOnce({
        changeId: "fixOpenBugs2",
        path: "/tmp/test/.adv/changes/fixOpenBugs2/proposal.md",
      });
      const claimChecker = vi.fn().mockResolvedValue([]);

      const result = await changeTools.adv_change_create.execute(
        { summary: "Fix open bugs" },
        store,
        undefined,
        { claimChecker, claimRaceCheckMs: 0 },
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
      expect(parsed.changeId).toBe("fixOpenBugs2");
      expect(store.changes.create).toHaveBeenCalled();
    });
  });

  describe("adv_change_close", () => {
    test("fires changeCancelledSignal with approval metadata", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "user confirmed cancellation",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle,
        PROJECT_ID,
        "test-change",
      );
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        approvalEvidence: "user confirmed cancellation",
        reason: "cancelled",
        cancelledBy: "agent",
      });
    });

    test("blocks close when approvalEvidence is empty", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("approvalEvidence is required");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("returns error when Temporal service is unavailable", async () => {
      mocks.getService.mockReturnValueOnce(null);
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "user confirmed",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Temporal service not available");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("returns error when change not found", async () => {
      const store = createMockStore();
      store.changes.get = vi.fn(async () => ({
        success: true,
        data: null,
      }));

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "missing-change",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "user confirmed",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("not found");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("requires supersededBy when reason is superseded", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "superseded",
          approvedByUser: true,
          approvalEvidence: "user confirmed",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("supersededBy is required");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("dryRun validates close request without firing signal or cleanup", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "cancelled",
          approvedByUser: true,
          approvalEvidence: "user confirmed cancellation",
          dryRun: true,
        } as Parameters<typeof changeTools.adv_change_close.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.message).toContain("Would close change test-change");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(mocks.removeChangeDir).not.toHaveBeenCalled();
    });

    test("does not recover close failure when signal error is unclassified", async () => {
      const store = createMockStore();
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("some transient query failure"),
      );

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user confirmed",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain(
        "Cannot safely close change: Signal failed with an unclassified query error",
      );
      expect(parsed.code).toBe("CHANGE_CLOSE_MUTATION_OPERATOR_REQUIRED");
      expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
    });

    test("recovers completed-workflow close failure with audited disk projection and keeps projection readable", async () => {
      const store = createMockStore();
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        Object.assign(new Error("workflow execution already completed"), {
          name: "WorkflowExecutionAlreadyCompleted",
        }),
      );

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user confirmed stale close",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._recoveryMutation).toBe(true);
      expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          store,
          change: expect.objectContaining({ id: "test-change" }),
          status: "closed",
          closure: expect.objectContaining({
            reason: "not_planned",
            approval_evidence: "user confirmed stale close",
          }),
          authorization: expect.objectContaining({
            reason: "missing_workflow",
            evidence:
              "WorkflowExecutionAlreadyCompleted: workflow execution already completed",
          }),
        }),
      );
      expect(mocks.removeChangeDir).not.toHaveBeenCalled();
    });

    test("recovers close via probe-first poisoned classification", async () => {
      const store = createMockStore();
      (
        mocks.handleMock as typeof mocks.handleMock & {
          describe: ReturnType<typeof vi.fn>;
        }
      ).describe = vi.fn(async () => ({
        searchAttributes: {
          TemporalReportedProblems: [
            "category=WorkflowTaskFailed",
            "cause=WorkflowTaskFailedCauseNonDeterministicError",
          ],
        },
      }));

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user confirmed poisoned close",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._recoveryMutation).toBe(true);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          store,
          change: expect.objectContaining({ id: "test-change" }),
          status: "closed",
          closure: expect.objectContaining({
            reason: "not_planned",
            approval_evidence: "user confirmed poisoned close",
          }),
          authorization: expect.objectContaining({
            reason: "poisoned_history",
            evidence: expect.stringContaining(
              "WorkflowTaskFailedCauseNonDeterministicError",
            ),
          }),
        }),
      );
      expect(mocks.removeChangeDir).not.toHaveBeenCalled();
    });

    test("poisoned_history recovery branch skips precheck describe and workflow signal and writes disk projection directly", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_close.execute(
        {
          changeId: "test-change",
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "test",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowNotFoundError: workflow execution already completed",
        } as Parameters<typeof changeTools.adv_change_close.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._recoveryMutation).toBe(true);
      expect(mocks.handleMock.describe).toBeUndefined();
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(mocks.markPoisonedWorkflowForChange).toHaveBeenCalledWith(
        PROJECT_ID,
        "test-change",
      );
      expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          store,
          change: expect.objectContaining({ id: "test-change" }),
          status: "closed",
          authorization: expect.objectContaining({
            reason: "poisoned_history",
            evidence:
              "WorkflowNotFoundError: workflow execution already completed",
          }),
        }),
      );
      expect(mocks.removeChangeDir).not.toHaveBeenCalled();
    });

    describe("target_path routing", () => {
      test("routes target close through target store with temporal-required and confirmation fields", async () => {
        const store = createMockStore();
        const sourceChange = (await store.changes.get("test-change"))
          .data as Change;
        vi.mocked(mocks.targetStore.changes.get).mockResolvedValueOnce({
          success: true,
          data: sourceChange,
        });
        mocks.withTargetPathStore.mockClear();

        const result = await changeTools.adv_change_close.execute(
          {
            changeId: "test-change",
            reason: "cancelled",
            approvedByUser: true,
            approvalEvidence: "user confirmed target cancellation",
            target_path: "/tmp/target",
            target_confirmed: true,
            confirmationEvidence: "user approved target close",
          } as Parameters<typeof changeTools.adv_change_close.execute>[0],
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        // Structural identity pin: the close output addresses the resolved
        // target project, not the source project.
        expect(parsed._projectContext).toMatchObject({
          root: "/tmp/target",
          projectId: TARGET_PROJECT_ID,
          stateMode: "temporal",
        });
        expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
          expect.objectContaining({
            target_path: "/tmp/target",
            stateRequirement: "temporal-required",
            mutation: true,
            target_confirmed: true,
            confirmationEvidence: "user approved target close",
          }),
          expect.any(Function),
        );
        expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
        // Workflow identity: the close signal addresses the resolved target
        // project's workflow, never the source project identity
        // (mocks.getProjectId returns PROJECT_ID).
        expect(mocks.getChangeHandle).toHaveBeenCalledWith(
          mocks.temporalBundle,
          TARGET_PROJECT_ID,
          "test-change",
        );
        expect(mocks.getChangeHandle).not.toHaveBeenCalledWith(
          mocks.temporalBundle,
          PROJECT_ID,
          "test-change",
        );
        const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
        expect(signalCall[1]).toBe(mocks.targetStore);
        expect(mocks.removeChangeDir).toHaveBeenCalledWith(
          mocks.targetStore.paths.changes,
          "test-change",
        );
      });

      test("dry-run target close does not signal or cleanup and stays read-only", async () => {
        const store = createMockStore();
        const sourceChange = (await store.changes.get("test-change"))
          .data as Change;
        vi.mocked(mocks.targetStore.changes.get).mockResolvedValueOnce({
          success: true,
          data: sourceChange,
        });
        mocks.withTargetPathStore.mockClear();

        const result = await changeTools.adv_change_close.execute(
          {
            changeId: "test-change",
            reason: "cancelled",
            approvedByUser: true,
            approvalEvidence: "user confirmed target cancellation",
            target_path: "/tmp/target",
            dryRun: true,
          } as Parameters<typeof changeTools.adv_change_close.execute>[0],
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.dryRun).toBe(true);
        expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
          expect.objectContaining({
            target_path: "/tmp/target",
            stateRequirement: "temporal-required",
            mutation: false,
          }),
          expect.any(Function),
        );
        expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
        expect(mocks.removeChangeDir).not.toHaveBeenCalled();
        expect(parsed._projectContext).toMatchObject({
          projectId: TARGET_PROJECT_ID,
          stateMode: "temporal",
        });
      });

      test("untrusted target close without confirmation fails before signaling", async () => {
        const store = createMockStore();
        mocks.withTargetPathStore.mockRejectedValueOnce(
          new Error(
            "Untrusted target_path mutation requires target_confirmed: true and confirmationEvidence before changing target state: /tmp/target",
          ),
        );

        const result = await changeTools.adv_change_close.execute(
          {
            changeId: "test-change",
            reason: "cancelled",
            approvedByUser: true,
            approvalEvidence: "user confirmed target cancellation",
            target_path: "/tmp/target",
          } as Parameters<typeof changeTools.adv_change_close.execute>[0],
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.error).toContain("target_confirmed");
        expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
        expect(mocks.removeChangeDir).not.toHaveBeenCalled();
      });

      test("recovery path uses target store for completed-workflow close", async () => {
        const store = createMockStore();
        const sourceChange = (await store.changes.get("test-change"))
          .data as Change;
        vi.mocked(mocks.targetStore.changes.get).mockResolvedValueOnce({
          success: true,
          data: sourceChange,
        });
        mocks.fireSignalAndRefresh.mockRejectedValueOnce(
          Object.assign(new Error("workflow execution already completed"), {
            name: "WorkflowExecutionAlreadyCompleted",
          }),
        );

        const result = await changeTools.adv_change_close.execute(
          {
            changeId: "test-change",
            reason: "not_planned",
            approvedByUser: true,
            approvalEvidence: "user confirmed stale target close",
            target_path: "/tmp/target",
            target_confirmed: true,
            confirmationEvidence: "user approved target close",
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed._recoveryMutation).toBe(true);
        expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledWith(
          expect.objectContaining({
            store: mocks.targetStore,
            change: expect.objectContaining({ id: "test-change" }),
            status: "closed",
          }),
        );
        expect(mocks.removeChangeDir).not.toHaveBeenCalled();
        expect(parsed._projectContext).toMatchObject({
          projectId: TARGET_PROJECT_ID,
        });
      });

      test("fails closed when target queue is unavailable without signaling or cleanup", async () => {
        const store = createMockStore();
        mocks.withTargetPathStore.mockRejectedValueOnce(
          new Error(
            `Target project Temporal queue is not serviceable for target_path mutation: advance-${TARGET_PROJECT_ID}; status=unavailable; blockers=server_poller_probe_unavailable; action=open or restart the target project ADV worker, then retry the target_path mutation`,
          ),
        );

        const result = await changeTools.adv_change_close.execute(
          {
            changeId: "test-change",
            reason: "cancelled",
            approvedByUser: true,
            approvalEvidence: "user confirmed target cancellation",
            target_path: "/tmp/target",
            target_confirmed: true,
            confirmationEvidence: "user approved target close",
          } as Parameters<typeof changeTools.adv_change_close.execute>[0],
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("Target project close unavailable");
        expect(parsed.error).toContain("not serviceable");
        expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
        expect(mocks.getChangeHandle).not.toHaveBeenCalled();
        expect(mocks.removeChangeDir).not.toHaveBeenCalled();
      });
    });
  });

  describe("adv_change_bulk_close", () => {
    test("fires changeCancelledSignal for each selected change", async () => {
      const store = createMockStore();
      store.changes.list = vi.fn(async () => ({
        changes: [
          { id: "chg-1", title: "Change 1", status: "draft" },
          { id: "chg-2", title: "Change 2", status: "draft" },
        ],
      }));
      store.changes.get = vi.fn(async (id: string) => ({
        success: true,
        data: {
          id,
          title: `Change ${id}`,
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          created_by: "test",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
        } as import("../types").Change,
      }));

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "explicit",
            changeIds: ["chg-1", "chg-2"],
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user approved bulk close",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.closed).toBe(2);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle,
        PROJECT_ID,
        "chg-1",
      );
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle,
        PROJECT_ID,
        "chg-2",
      );
    });

    test("reports per-id failures without aborting siblings", async () => {
      const store = createMockStore();
      store.changes.list = vi.fn(async () => ({
        changes: [
          { id: "chg-1", title: "Change 1", status: "draft" },
          { id: "chg-2", title: "Change 2", status: "draft" },
        ],
      }));
      store.changes.get = vi.fn(async (id: string) => ({
        success: true,
        data: {
          id,
          title: `Change ${id}`,
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          created_by: "test",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
        } as import("../types").Change,
      }));
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("signal rejected"),
      );

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "explicit",
            changeIds: ["chg-1", "chg-2"],
          },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user approved bulk close",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.closed).toBe(1);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0].success).toBe(false);
      expect(parsed.results[1].success).toBe(true);
    });

    test("blocks filter-based bulk close for superseded reason", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: {
            kind: "filter",
            status: "draft",
          },
          reason: "superseded",
          approvedByUser: true,
          approvalEvidence: "user approved",
          supersededBy: "chg-survivor",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("not supported");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("dryRun resolves bulk close selection without firing signals or sweeping disk", async () => {
      const store = createMockStore();
      store.changes.list = vi.fn(async () => ({
        changes: [
          { id: "chg-1", title: "Change 1", status: "draft" },
          { id: "chg-2", title: "Change 2", status: "draft" },
        ],
      }));
      store.changes.get = vi.fn(async (id: string) => ({
        success: true,
        data: {
          id,
          title: `Change ${id}`,
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          created_by: "test",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
        } as import("../types").Change,
      }));

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: { kind: "explicit", changeIds: ["chg-1", "chg-2"] },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user approved bulk close",
          dryRun: true,
        } as Parameters<typeof changeTools.adv_change_bulk_close.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.closed).toBe(0);
      expect(parsed.wouldClose).toEqual(["chg-1", "chg-2"]);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(mocks.sweepClosedChangesFromDisk).not.toHaveBeenCalled();
    });

    test("recovers completed-workflow failures per id during bulk close", async () => {
      const store = createMockStore();
      store.changes.list = vi.fn(async () => ({
        changes: [
          { id: "chg-1", title: "Change 1", status: "draft" },
          { id: "chg-2", title: "Change 2", status: "draft" },
        ],
      }));
      store.changes.get = vi.fn(async (id: string) => ({
        success: true,
        data: {
          id,
          title: `Change ${id}`,
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          created_by: "test",
          tasks: [],
          deltas: {},
          wisdom: [],
        } as import("../types").Change,
      }));
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        Object.assign(new Error("workflow execution already completed"), {
          name: "WorkflowExecutionAlreadyCompleted",
        }),
      );

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: { kind: "explicit", changeIds: ["chg-1", "chg-2"] },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user approved bulk close",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.closed).toBe(2);
      expect(parsed.results[0]).toMatchObject({
        changeId: "chg-1",
        success: true,
        recovered: true,
      });
      expect(parsed.results[1]).toMatchObject({
        changeId: "chg-2",
        success: true,
      });
      expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledTimes(1);
      expect(mocks.sweepClosedChangesFromDisk).toHaveBeenCalledWith(
        ["chg-2"],
        store.paths.changes,
      );
    });

    test("poisoned_history recovery branch skips per-change precheck and recovers all ids on signal failure", async () => {
      const store = createMockStore();
      store.changes.list = vi.fn(async () => ({
        changes: [
          { id: "chg-1", title: "Change 1", status: "draft" },
          { id: "chg-2", title: "Change 2", status: "draft" },
        ],
      }));
      store.changes.get = vi.fn(async (id: string) => ({
        success: true,
        data: {
          id,
          title: `Change ${id}`,
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          created_by: "test",
          tasks: [],
          deltas: {},
          wisdom: [],
        } as import("../types").Change,
      }));
      (
        mocks.handleMock as typeof mocks.handleMock & {
          describe: ReturnType<typeof vi.fn>;
        }
      ).describe = vi.fn(async () => {
        throw new Error("Failed to query Workflow ServiceError");
      });
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("Failed to query Workflow ServiceError"),
      );
      mocks.fireSignalAndRefresh.mockRejectedValueOnce(
        new Error("Failed to query Workflow ServiceError"),
      );

      const result = await changeTools.adv_change_bulk_close.execute(
        {
          selector: { kind: "explicit", changeIds: ["chg-1", "chg-2"] },
          reason: "not_planned",
          approvedByUser: true,
          approvalEvidence: "user approved poisoned bulk close",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowNotFoundError: workflow execution already completed",
        } as Parameters<typeof changeTools.adv_change_bulk_close.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.closed).toBe(2);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0]).toMatchObject({
        changeId: "chg-1",
        success: true,
        recovered: true,
      });
      expect(parsed.results[1]).toMatchObject({
        changeId: "chg-2",
        success: true,
        recovered: true,
      });
      expect(mocks.handleMock.describe).not.toHaveBeenCalled();
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
      expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledTimes(2);
      expect(mocks.sweepClosedChangesFromDisk).not.toHaveBeenCalled();
    });

    describe("target_path routing", () => {
      const targetDraftChange = (id: string): Change =>
        ({
          id,
          title: `Target ${id}`,
          status: "draft",
          created_at: "2026-01-01T00:00:00Z",
          created_by: "test",
          tasks: [],
          deltas: {},
          wisdom: [],
          gates: {
            proposal: { status: "pending" },
            discovery: { status: "pending" },
            design: { status: "pending" },
            planning: { status: "pending" },
            execution: { status: "pending" },
            acceptance: { status: "pending" },
            release: { status: "pending" },
          },
        }) as Change;

      beforeEach(() => {
        vi.mocked(mocks.targetStore.changes.get).mockReset();
        vi.mocked(mocks.targetStore.changes.list).mockReset();
        vi.mocked(mocks.targetStore.changes.get).mockImplementation(
          async (id: string) => ({
            success: true,
            data: targetDraftChange(id),
          }),
        );
        vi.mocked(mocks.targetStore.changes.list).mockResolvedValue({
          changes: [],
        });
        mocks.withTargetPathStore.mockClear();
        mocks.fireSignalAndRefresh.mockClear();
        mocks.sweepClosedChangesFromDisk.mockClear();
      });

      test("resolves selection from target store and uses target project ID", async () => {
        const store = createMockStore();

        const result = await changeTools.adv_change_bulk_close.execute(
          {
            selector: {
              kind: "explicit",
              changeIds: ["chg-t1", "chg-t2"],
            },
            reason: "not_planned",
            approvedByUser: true,
            approvalEvidence: "user approved target bulk close",
            target_path: "/tmp/target",
            target_confirmed: true,
            confirmationEvidence: "user approved target bulk close",
          } as Parameters<typeof changeTools.adv_change_bulk_close.execute>[0],
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        // Structural identity pin: the bulk close output addresses the
        // resolved target project, not the source project.
        expect(parsed._projectContext).toMatchObject({
          root: "/tmp/target",
          projectId: TARGET_PROJECT_ID,
          stateMode: "temporal",
        });
        expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
          expect.objectContaining({
            target_path: "/tmp/target",
            stateRequirement: "temporal-required",
            mutation: true,
            target_confirmed: true,
            confirmationEvidence: "user approved target bulk close",
          }),
          expect.any(Function),
        );
        expect(mocks.targetStore.changes.get).toHaveBeenCalledWith("chg-t1");
        expect(mocks.targetStore.changes.get).toHaveBeenCalledWith("chg-t2");
        expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
        // Workflow identity: every close signal addresses the resolved target
        // project's workflow, never the source project identity
        // (mocks.getProjectId returns PROJECT_ID).
        expect(mocks.getChangeHandle).toHaveBeenCalledWith(
          mocks.temporalBundle,
          TARGET_PROJECT_ID,
          "chg-t1",
        );
        expect(mocks.getChangeHandle).toHaveBeenCalledWith(
          mocks.temporalBundle,
          TARGET_PROJECT_ID,
          "chg-t2",
        );
        expect(mocks.getChangeHandle).not.toHaveBeenCalledWith(
          mocks.temporalBundle,
          PROJECT_ID,
          expect.anything(),
        );
        const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
        expect(signalCall[1]).toBe(mocks.targetStore);
        expect(mocks.sweepClosedChangesFromDisk).toHaveBeenCalledWith(
          ["chg-t1", "chg-t2"],
          mocks.targetStore.paths.changes,
        );
      });

      test("untrusted target bulk close fails before signaling when confirmation missing", async () => {
        const store = createMockStore();
        mocks.withTargetPathStore.mockRejectedValueOnce(
          new Error(
            "Untrusted target_path mutation requires target_confirmed: true and confirmationEvidence before changing target state: /tmp/target",
          ),
        );

        const result = await changeTools.adv_change_bulk_close.execute(
          {
            selector: {
              kind: "explicit",
              changeIds: ["chg-t1"],
            },
            reason: "not_planned",
            approvedByUser: true,
            approvalEvidence: "user approved target bulk close",
            target_path: "/tmp/target",
          } as Parameters<typeof changeTools.adv_change_bulk_close.execute>[0],
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.error).toContain("target_confirmed");
        expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
        expect(mocks.sweepClosedChangesFromDisk).not.toHaveBeenCalled();
      });

      test("dry-run performs target selection but no signal or cleanup and stays read-only", async () => {
        const store = createMockStore();

        const result = await changeTools.adv_change_bulk_close.execute(
          {
            selector: {
              kind: "explicit",
              changeIds: ["chg-t1", "chg-t2"],
            },
            reason: "not_planned",
            approvedByUser: true,
            approvalEvidence: "user approved target bulk close",
            dryRun: true,
            target_path: "/tmp/target",
          } as Parameters<typeof changeTools.adv_change_bulk_close.execute>[0],
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.dryRun).toBe(true);
        expect(parsed.wouldClose).toEqual(["chg-t1", "chg-t2"]);
        expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
          expect.objectContaining({
            target_path: "/tmp/target",
            stateRequirement: "temporal-required",
            mutation: false,
          }),
          expect.any(Function),
        );
        expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
        expect(mocks.sweepClosedChangesFromDisk).not.toHaveBeenCalled();
        expect(parsed._projectContext).toMatchObject({
          projectId: TARGET_PROJECT_ID,
          stateMode: "temporal",
        });
      });

      test("recovery path uses target store for completed-workflow close", async () => {
        const store = createMockStore();
        mocks.fireSignalAndRefresh.mockRejectedValueOnce(
          Object.assign(new Error("workflow execution already completed"), {
            name: "WorkflowExecutionAlreadyCompleted",
          }),
        );

        const result = await changeTools.adv_change_bulk_close.execute(
          {
            selector: {
              kind: "explicit",
              changeIds: ["chg-t1", "chg-t2"],
            },
            reason: "not_planned",
            approvedByUser: true,
            approvalEvidence: "user approved target bulk close",
            target_path: "/tmp/target",
            target_confirmed: true,
            confirmationEvidence: "user approved target bulk close",
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.closed).toBe(2);
        expect(parsed.results[0]).toMatchObject({
          changeId: "chg-t1",
          success: true,
          recovered: true,
        });
        expect(parsed.results[1]).toMatchObject({
          changeId: "chg-t2",
          success: true,
        });
        expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledTimes(1);
        expect(mocks.saveRecoveredChangeStatus).toHaveBeenCalledWith(
          expect.objectContaining({
            store: mocks.targetStore,
            change: expect.objectContaining({ id: "chg-t1" }),
            status: "closed",
          }),
        );
        expect(mocks.sweepClosedChangesFromDisk).toHaveBeenCalledWith(
          ["chg-t2"],
          mocks.targetStore.paths.changes,
        );
        expect(parsed._projectContext).toMatchObject({
          projectId: TARGET_PROJECT_ID,
        });
      });

      test("fails closed when target queue is unavailable without signaling or sweeping", async () => {
        const store = createMockStore();
        mocks.withTargetPathStore.mockRejectedValueOnce(
          new Error(
            `Target project Temporal queue is not serviceable for target_path mutation: advance-${TARGET_PROJECT_ID}; status=unavailable; blockers=server_poller_probe_unavailable; action=open or restart the target project ADV worker, then retry the target_path mutation`,
          ),
        );

        const result = await changeTools.adv_change_bulk_close.execute(
          {
            selector: { kind: "explicit", changeIds: ["chg-t1", "chg-t2"] },
            reason: "not_planned",
            approvedByUser: true,
            approvalEvidence: "user approved target bulk close",
            target_path: "/tmp/target",
            target_confirmed: true,
            confirmationEvidence: "user approved target bulk close",
          } as Parameters<typeof changeTools.adv_change_bulk_close.execute>[0],
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("Target project bulk close unavailable");
        expect(parsed.error).toContain("not serviceable");
        expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
        expect(mocks.getChangeHandle).not.toHaveBeenCalled();
        expect(mocks.sweepClosedChangesFromDisk).not.toHaveBeenCalled();
      });
    });
  });

  describe("adv_change_validate", () => {
    beforeEach(() => {
      vi.mocked(mocks.removeChangeDir).mockReset();
      vi.mocked(mocks.removeChangeDir).mockResolvedValue(undefined);
    });

    test("strict mode passes when validation has warnings only", async () => {
      const store = createMockStore({
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(true);
      expect(parsed.errors).toEqual([]);
      expect(parsed.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "NO_DELTAS", severity: "warning" }),
        ]),
      );
    });

    test("strictWarnings opt-in fails warnings-only validation", async () => {
      const store = createMockStore({
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true, strictWarnings: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(false);
      expect(parsed.errors).toEqual([]);
      expect(parsed.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "NO_DELTAS", severity: "warning" }),
        ]),
      );
    });

    test("strict mode fails when validation has errors", async () => {
      const store = createMockStore(
        {
          tasks: [
            { id: "tk-1", title: "Task", status: "done" },
          ] as Change["tasks"],
          deltas: {
            "existing-capability": [
              {
                id: "dl-duplicate1",
                operation: "add",
                requirement: {
                  id: "rq-existing1",
                  title: "Duplicate requirement",
                  body: "Duplicate requirement body",
                  priority: "must",
                  scenarios: [
                    {
                      id: "rq-existing1.1",
                      title: "Duplicate scenario",
                      given: ["Duplicate state"],
                      when: "Validated",
                      then: ["It fails"],
                    },
                  ],
                },
              },
            ],
          },
        },
        [existingSpec],
      );

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(false);
      expect(parsed.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "DUPLICATE_REQUIREMENT_ID",
            severity: "error",
          }),
        ]),
      );
    });

    test("strict mode does not turn a non-clean validation result into pass", async () => {
      const store = createMockStore({
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
      });
      store.changes.listConflictAuthority = vi.fn().mockResolvedValue({
        active: [],
        completeness: "incomplete",
        canConcludeClean: false,
        warnings: ["Visibility active enumeration failed"],
        source: "active-conflict-authority",
        candidateCount: 0,
        omittedCount: 0,
        authorityDiagnostics: {
          source: "active-conflict-authority",
          activeCandidateCount: null,
          omittedCount: null,
          shadowCount: null,
          elapsedMs: 1,
        },
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(false);
      expect(parsed.authorityDiagnostics).toMatchObject({
        source: "active-conflict-authority",
        activeCandidateCount: null,
      });
    });

    test("strict mode stays false with incomplete active conflict authority and exposes stable diagnostics", async () => {
      const store = createMockStore({
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
      });
      const diagnostics = {
        source: "active-conflict-authority",
        activeCandidateCount: 2,
        omittedCount: 1,
        shadowCount: 0,
        elapsedMs: 7,
      };
      store.changes.listConflictAuthority = vi.fn().mockResolvedValue({
        active: [
          {
            id: "peer-a",
            title: "Peer A",
            status: "draft",
            capabilities: ["cap-a"],
          },
        ],
        completeness: "incomplete",
        canConcludeClean: false,
        warnings: ["Visibility active enumeration failed"],
        source: "active-conflict-authority",
        candidateCount: 2,
        omittedCount: 1,
        authorityDiagnostics: diagnostics,
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(false);
      expect(
        parsed.errors.some(
          (e: { code?: string }) => e.code === "CONFLICT_INVENTORY_BLOCKED",
        ),
      ).toBe(false);
      expect(parsed.authorityDiagnostics).toEqual(diagnostics);
    });

    test("strict mode passes with complete active conflict authority and exposes stable diagnostics", async () => {
      const store = createMockStore({
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
      });
      const diagnostics = {
        source: "active-conflict-authority",
        activeCandidateCount: 1,
        omittedCount: 0,
        shadowCount: 0,
        elapsedMs: 5,
      };
      store.changes.listConflictAuthority = vi.fn().mockResolvedValue({
        active: [
          {
            id: "test-change",
            title: "Test Change",
            status: "active",
            capabilities: ["cap-a"],
          },
        ],
        completeness: "complete",
        canConcludeClean: true,
        warnings: [],
        source: "active-conflict-authority",
        candidateCount: 1,
        omittedCount: 0,
        authorityDiagnostics: diagnostics,
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(true);
      expect(parsed.errors).toEqual([]);
      expect(
        parsed.errors.some(
          (e: { code?: string }) => e.code === "CONFLICT_INVENTORY_BLOCKED",
        ),
      ).toBe(false);
      expect(parsed.authorityDiagnostics).toEqual(diagnostics);
    });

    test("non-strict mode preserves clean validation result", async () => {
      const store = createMockStore({
        title: "Implement new requirement",
        tasks: [
          {
            id: "tk-1",
            title: "Implement new requirement intent scope",
            status: "done",
            verification: "Red and green tests passed.",
          },
        ] as Change["tasks"],
        deltas: {
          "new-capability": [
            {
              id: "dl-add1",
              operation: "add",
              requirement: {
                id: "rq-new1",
                title: "New requirement",
                body: "New requirement body",
                priority: "must",
                scenarios: [
                  {
                    id: "rq-new1.1",
                    title: "New scenario",
                    given: ["New state"],
                    when: "Validated",
                    then: ["It passes"],
                  },
                ],
              },
            },
          ],
        },
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change" },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.passed).toBe(true);
      expect(parsed.errors).toEqual([]);
      expect(parsed.warnings).toEqual([]);
    });

    // Fix 5 / AC7: a dangling peer change whose Temporal workflow was evicted
    // (disk projection may survive) makes store.changes.get throw. The
    // validation-context per-peer hydration loop must skip it, not crash.
    test("tolerates a peer whose workflow query throws (multi-session orphan)", async () => {
      const store = createMockStore({
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
      });
      const target = (await store.changes.get("test-change")).data!;
      vi.mocked(store.changes.list).mockResolvedValue({
        changes: [
          { id: "test-change", title: "Test Change", status: "active" },
          {
            id: "danglingPeer",
            title: "Dangling Peer",
            status: "draft",
            capabilities: [],
          },
        ],
      } as Awaited<ReturnType<Store["changes"]["list"]>>);
      vi.mocked(store.changes.get).mockImplementation(async (id: string) => {
        if (id === "danglingPeer") {
          throw Object.assign(
            new Error("workflow not found for ID: danglingPeer"),
            { name: "WorkflowNotFoundError" },
          );
        }
        return { success: true, data: target };
      });

      const result = await changeTools.adv_change_validate.execute(
        { changeId: "test-change", strict: true },
        store,
      );

      const parsed = JSON.parse(result);
      // Must not crash on the dangling peer; validation runs for the target.
      expect(parsed.validationErrors).toBeUndefined();
      expect(parsed).toHaveProperty("passed");
      expect(parsed.passed).toBe(true);
    });

    // tk-f4a18a9705ef: strict validation must be deterministically bounded.
    // A slow/hung authoritative read must surface as an explicit typed
    // degraded response below the 10s safeExecute ceiling, never as an
    // unclassified whole-tool ToolExecutionTimeout.
    describe("bounded input load", () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      test("returns typed degraded response when the change read exceeds the budget", async () => {
        const store = createMockStore({
          tasks: [
            { id: "tk-1", title: "Task", status: "done" },
          ] as Change["tasks"],
        });
        // Simulate a slow/hung Temporal-backed read: never settles.
        vi.mocked(store.changes.get).mockImplementation(
          () => new Promise(() => {}),
        );

        vi.useFakeTimers();
        const pending = changeTools.adv_change_validate.execute(
          { changeId: "test-change", strict: true },
          store,
        );
        await vi.advanceTimersByTimeAsync(
          CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS + 50,
        );
        const result = await pending;

        const parsed = JSON.parse(result);
        expect(parsed.passed).toBe(false);
        expect(parsed.degraded).toBe(true);
        expect(parsed.error).toBe("VALIDATION_TIME_BUDGET_EXHAUSTED");
        expect(parsed.reason).toBe("time_budget_exhausted");
        expect(parsed.stage).toBe("load-inputs");
        expect(parsed.timeoutMs).toBe(CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS);
        expect(parsed.changeId).toBe("test-change");
        // Degraded evidence must not masquerade as a completed validation:
        // no verdict arrays, no checks-performed, no formatted report.
        expect(parsed.errors).toBeUndefined();
        expect(parsed.warnings).toBeUndefined();
        expect(parsed.checksPerformed).toBeUndefined();
        expect(parsed.formatted).toBeUndefined();
      });

      test("returns typed degraded response when validation context load exceeds the budget", async () => {
        const store = createMockStore({
          tasks: [
            { id: "tk-1", title: "Task", status: "done" },
          ] as Change["tasks"],
        });
        // The change read succeeds but the spec enumeration hangs.
        vi.mocked(store.specs.list).mockImplementation(
          () => new Promise(() => {}),
        );

        vi.useFakeTimers();
        const pending = changeTools.adv_change_validate.execute(
          { changeId: "test-change", strict: true },
          store,
        );
        await vi.advanceTimersByTimeAsync(
          CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS + 50,
        );
        const result = await pending;

        const parsed = JSON.parse(result);
        expect(parsed.passed).toBe(false);
        expect(parsed.degraded).toBe(true);
        expect(parsed.error).toBe("VALIDATION_TIME_BUDGET_EXHAUSTED");
        expect(parsed.checksPerformed).toBeUndefined();
        expect(parsed.formatted).toBeUndefined();
      });

      test("completes within the budget without a degraded marker", async () => {
        const store = createMockStore({
          tasks: [
            { id: "tk-1", title: "Task", status: "done" },
          ] as Change["tasks"],
        });

        const result = await changeTools.adv_change_validate.execute(
          { changeId: "test-change", strict: true },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed.passed).toBe(true);
        expect(parsed.degraded).toBeUndefined();
        expect(parsed.error).toBeUndefined();
        expect(parsed.checksPerformed).toEqual(
          expect.arrayContaining(["completeness", "conflicts"]),
        );
      });
    });
  });

  describe("adv_change_archive", () => {
    test("uses live gate status for archive preflight when cached gates are stale", async () => {
      const staleStoreGates: NonNullable<Change["gates"]> = {
        ...allDoneGates,
        acceptance: { status: "pending" },
        release: { status: "pending" },
      };
      const store = createMockStore({ gates: staleStoreGates });
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(mocks.queryMock).toHaveBeenCalledTimes(1);
      expect(parsed.error ?? "").not.toContain("incomplete gates");
      expect(parsed.incompleteGates).toBeUndefined();
    });

    test("AC4: blocks archive release preflight when loaded plugin bundle is stale", async () => {
      vi.mocked(
        pluginBundleManifest.getPluginBundleReleasePreflightError,
      ).mockResolvedValueOnce({
        error:
          "Release preflight failed: loaded plugin bundle is stale versus the deployed bundle.",
        code: "PLUGIN_BUNDLE_STALE_RELEASE_PREFLIGHT",
        remediation: "Restart OpenCode to load the current plugin bundle.",
        reason: "generation_mismatch",
        loadedGeneration: "loaded-gen",
        deployedGeneration: "deployed-gen",
      });

      const store = createMockStore({ gates: allDoneGates });
      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.code).toBe("PLUGIN_BUNDLE_STALE_RELEASE_PREFLIGHT");
      expect(parsed.error).toMatch(/loaded plugin bundle is stale/i);
      expect(parsed.remediation).toMatch(/restart/i);
      expect(parsed.loadedGeneration).toBe("loaded-gen");
      expect(parsed.deployedGeneration).toBe("deployed-gen");
      // Preflight must short-circuit before any gate/phase9 work.
      expect(mocks.queryMock).not.toHaveBeenCalled();
    });

    // Fix 5 / AC7: archive validation loads peer changes for conflict
    // detection. A dangling peer whose workflow query throws must NOT crash
    // archive with VALIDATION_CONTEXT_FAILED (the multi-session bug that
    // blocked this very change's archive).
    test("tolerates a peer whose workflow query throws during archive validation", async () => {
      const store = createMockStore({ gates: allDoneGates });
      const target = (await store.changes.get("test-change")).data!;
      vi.mocked(store.changes.list).mockResolvedValue({
        changes: [
          { id: "test-change", title: "Test Change", status: "active" },
          {
            id: "danglingPeer",
            title: "Dangling Peer",
            status: "draft",
            capabilities: [],
          },
        ],
      } as Awaited<ReturnType<Store["changes"]["list"]>>);
      vi.mocked(store.changes.get).mockImplementation(async (id: string) => {
        if (id === "danglingPeer") {
          throw Object.assign(
            new Error("workflow not found for ID: danglingPeer"),
            { name: "WorkflowNotFoundError" },
          );
        }
        return { success: true, data: target };
      });
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.validationErrors).toBeUndefined();
      expect(parsed.error ?? "").not.toContain("validation could not run");
    });

    test("blocks archive when validationResult.passed is false with no errors", async () => {
      const store = createMockStore({ gates: allDoneGates });
      store.changes.listConflictAuthority = vi.fn().mockResolvedValue({
        active: [],
        completeness: "incomplete",
        canConcludeClean: false,
        warnings: ["Visibility active enumeration failed"],
        source: "active-conflict-authority",
        candidateCount: 0,
        omittedCount: 0,
        authorityDiagnostics: {
          source: "active-conflict-authority",
          activeCandidateCount: null,
          omittedCount: null,
          shadowCount: null,
          elapsedMs: 1,
        },
      });
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Archive blocked");
      expect(parsed.validationErrors).toEqual([]);
      expect(parsed.authorityDiagnostics).toMatchObject({
        source: "active-conflict-authority",
        activeCandidateCount: null,
      });
      expect(parsed.validationWarnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "CONFLICT_INVENTORY_WARNING",
          }),
        ]),
      );
    });

    test("dryRun preflight blocks non-clean incomplete active conflict authority and exposes stable diagnostics", async () => {
      const store = createMockStore({ gates: allDoneGates });
      const diagnostics = {
        source: "active-conflict-authority",
        activeCandidateCount: 2,
        omittedCount: 1,
        shadowCount: 0,
        elapsedMs: 7,
      };
      store.changes.listConflictAuthority = vi.fn().mockResolvedValue({
        active: [
          {
            id: "peer-a",
            title: "Peer A",
            status: "draft",
            capabilities: ["cap-a"],
          },
        ],
        completeness: "incomplete",
        canConcludeClean: false,
        warnings: ["Visibility active enumeration failed"],
        source: "active-conflict-authority",
        candidateCount: 2,
        omittedCount: 1,
        authorityDiagnostics: diagnostics,
      });
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Archive blocked");
      expect(parsed.error).not.toContain("CONFLICT_INVENTORY_BLOCKED");
      expect(parsed.validationErrors).toEqual([]);
      expect(parsed.authorityDiagnostics).toEqual(diagnostics);
    });

    test("dryRun succeeds with complete active conflict authority and exposes stable diagnostics", async () => {
      const store = createMockStore({ gates: allDoneGates });
      const diagnostics = {
        source: "active-conflict-authority",
        activeCandidateCount: 1,
        omittedCount: 0,
        shadowCount: 0,
        elapsedMs: 5,
      };
      store.changes.listConflictAuthority = vi.fn().mockResolvedValue({
        active: [
          {
            id: "test-change",
            title: "Test Change",
            status: "active",
            capabilities: ["cap-a"],
          },
        ],
        completeness: "complete",
        canConcludeClean: true,
        warnings: [],
        source: "active-conflict-authority",
        candidateCount: 1,
        omittedCount: 0,
        authorityDiagnostics: diagnostics,
      });
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.error ?? "").not.toContain("Archive blocked");
      expect(parsed.error ?? "").not.toContain("CONFLICT_INVENTORY_BLOCKED");
      expect(parsed.authorityDiagnostics).toEqual(diagnostics);
    });

    test("allows archive when only release gate is pending (finalization completes it)", async () => {
      const liveIncompleteGates: NonNullable<Change["gates"]> = {
        ...allDoneGates,
        release: { status: "pending" },
      };
      const store = createMockStore({ gates: allDoneGates });
      mocks.queryMock.mockResolvedValueOnce(liveIncompleteGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error ?? "").not.toContain("incomplete gates");
      expect(parsed.incompleteGates).toBeUndefined();
    });

    test("routes target_path archive dryRun through the target store", async () => {
      const store = createMockStore({ gates: allDoneGates });
      const targetChange: Change = {
        id: "target-change",
        title: "Target Change",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "test",
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
        deltas: {},
        wisdom: [],
        gates: allDoneGates,
      };
      vi.mocked(mocks.targetStore.changes.get).mockResolvedValue({
        success: true,
        data: targetChange,
      });
      vi.mocked(mocks.targetStore.specs.list).mockResolvedValue({
        specs: [],
      });
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        {
          changeId: "target-change",
          dryRun: true,
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error ?? "").not.toContain("incomplete gates");
      expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProjectPath: "/tmp/test",
          target_path: "/tmp/target",
          stateRequirement: "temporal-required",
          mutation: false,
          target_confirmed: true,
          confirmationEvidence: "user approved target mutation",
        }),
        expect.any(Function),
      );
      expect(mocks.targetStore.changes.get).toHaveBeenCalledWith(
        "target-change",
      );
      expect(parsed._projectContext).toEqual({
        root: "/tmp/target",
        projectId: TARGET_PROJECT_ID,
        trusted: false,
        trustSource: "explicit",
        stateMode: "temporal",
      });
    });

    test("target_path archive dryRun does not require mutation trust", async () => {
      const store = createMockStore({ gates: allDoneGates });
      const targetChange: Change = {
        id: "target-change",
        title: "Target Change",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "test",
        tasks: [
          { id: "tk-1", title: "Task", status: "done" },
        ] as Change["tasks"],
        deltas: {},
        wisdom: [],
        gates: allDoneGates,
      };
      vi.mocked(mocks.targetStore.changes.get).mockResolvedValue({
        success: true,
        data: targetChange,
      });
      vi.mocked(mocks.targetStore.specs.list).mockResolvedValue({
        specs: [],
      });
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      await changeTools.adv_change_archive.execute(
        {
          changeId: "target-change",
          dryRun: true,
          target_path: "/tmp/target",
        },
        store,
      );

      expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
        expect.objectContaining({
          target_path: "/tmp/target",
          stateRequirement: "temporal-required",
          mutation: false,
        }),
        expect.any(Function),
      );
    });

    test("dryRun derives fresh child resolution and clears stale parent obligation without signals or persistence", async () => {
      const childProfile: OpsFollowupProfile = {
        kind: "migration",
        source: {
          source_change_id: "test-change",
          source_kind: "required_follow_up",
        },
        relationship: "blocks",
        status: "complete",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:01:00Z",
        completion_signal: "deploy finished",
        evidence: [],
        runs: [
          {
            id: "run-1",
            title: "Deploy run",
            status: "complete",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:01:00Z",
            plan: {
              env: "prod",
              action: "deploy",
              bounds: ["low-risk"],
              evidence_policy: "manual",
              rollback_or_cleanup_plan: "rollback to previous version",
            },
            steps: [],
            evidence: [
              {
                id: "ore-1",
                recorded_at: "2026-01-01T00:01:00Z",
                step_kind: "execute",
                env: "prod",
                status: "complete",
                summary: "Deployment completed",
                artifact: {
                  kind: "pointer",
                  uri: "s3://ops-bucket/deploy.log",
                },
                next_status: "complete",
                completion_signal: "deploy finished",
                health_verification: "smoke passed",
                rollback_or_cleanup_disposition: "no rollback needed",
              },
            ],
          },
        ],
      };
      const childChange: Change = {
        id: "child-1",
        title: "Child ops change",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "test",
        tasks: [],
        deltas: {},
        wisdom: [],
        ops_followup: childProfile,
      };
      const link: OpsFollowupLink = {
        id: "ofl-1",
        changeId: "child-1",
        relationship: "blocks",
        status: "not_started",
        required_handoff: false,
        linked_at: "2026-01-01T00:00:00Z",
      };
      const parent: Change = {
        id: "test-change",
        title: "Test Change",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "test",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: allDoneGates,
        ops_followup_links: [link],
      };
      const store = createMockStore(parent);
      const getMock = store.changes.get as ReturnType<typeof vi.fn>;
      getMock.mockImplementation(async (id: string) => {
        if (id === "test-change") return { success: true, data: parent };
        if (id === "child-1") return { success: true, data: childChange };
        return { success: true, data: null };
      });
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error ?? "").not.toContain("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(parsed.error ?? "").not.toContain(
        "unresolved required ops follow-up obligations",
      );
      expect(parsed.openOpsObligations ?? []).toEqual([]);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
    });

    function makeCompleteOpsProfile(): OpsFollowupProfile {
      return {
        kind: "migration",
        source: {
          source_change_id: "test-change",
          source_kind: "required_follow_up",
        },
        relationship: "blocks",
        status: "complete",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:01:00Z",
        completion_signal: "deploy finished",
        evidence: [],
        runs: [
          {
            id: "run-1",
            title: "Deploy run",
            status: "complete",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:01:00Z",
            plan: {
              env: "prod",
              action: "deploy",
              bounds: ["low-risk"],
              evidence_policy: "manual",
              rollback_or_cleanup_plan: "rollback to previous version",
            },
            steps: [],
            evidence: [
              {
                id: "ore-1",
                recorded_at: "2026-01-01T00:01:00Z",
                step_kind: "execute",
                env: "prod",
                run_id: "run-1",
                status: "complete",
                summary: "Deployment completed",
                artifact: {
                  kind: "pointer",
                  uri: "s3://ops-bucket/deploy.log",
                },
                next_status: "complete",
                completion_signal: "deploy finished",
                health_verification: "smoke passed",
                rollback_or_cleanup_disposition: "no rollback needed",
              },
            ],
          },
        ],
      };
    }

    function makeIncompleteOpsProfile(
      status: OpsFollowupProfile["status"] = "running",
    ): OpsFollowupProfile {
      return {
        kind: "migration",
        source: {
          source_change_id: "test-change",
          source_kind: "required_follow_up",
        },
        relationship: "blocks",
        status,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:01:00Z",
        evidence: [],
        runs: [],
      };
    }

    function makeCompleteButProofMissingProfile(): OpsFollowupProfile {
      return {
        ...makeCompleteOpsProfile(),
        runs: [],
      };
    }

    function makeOpsChild(
      changeId: string,
      profile?: OpsFollowupProfile,
    ): Change {
      return {
        id: changeId,
        title: "Ops child",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "test",
        tasks: [],
        deltas: {},
        wisdom: [],
        ...(profile ? { ops_followup: profile } : {}),
      };
    }

    function makeParentWithOpsLink(
      linkOverrides: Partial<OpsFollowupLink> = {},
    ): Change {
      return {
        id: "test-change",
        title: "Test Change",
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        created_by: "test",
        tasks: [],
        deltas: {},
        wisdom: [],
        gates: allDoneGates,
        ops_followup_links: [
          {
            id: "ofl-1",
            changeId: "child-1",
            relationship: "blocks",
            status: "not_started",
            required_handoff: false,
            linked_at: "2026-01-01T00:00:00Z",
            ...linkOverrides,
          },
        ],
      };
    }

    function configureStore(
      parent: Change,
      child: Change | null | "unreachable",
    ): Store {
      const store = createMockStore(parent);
      const getMock = store.changes.get as ReturnType<typeof vi.fn>;
      getMock.mockImplementation(async (id: string) => {
        if (id === "test-change") return { success: true, data: parent };
        if (id === "child-1") {
          if (child === "unreachable") {
            throw new Error("child workflow unreachable");
          }
          return { success: true, data: child };
        }
        return { success: true, data: null };
      });
      return store;
    }

    async function runArchive(changeId: string, dryRun: boolean, store: Store) {
      const result = await changeTools.adv_change_archive.execute(
        { changeId, dryRun },
        store,
      );
      return JSON.parse(result);
    }

    function installSignalMutation(parent: Change) {
      vi.mocked(mocks.fireSignalAndRefresh).mockImplementation(
        async (_handle, _store, _changeId, _signal, payload) => {
          const p = payload as {
            linkId: string;
            resolution: OpsFollowupResolution;
          };
          const link = parent.ops_followup_links?.find(
            (l) => l.id === p.linkId,
          );
          if (link) {
            link.resolution = p.resolution;
          }
        },
      );
    }

    function expectParentSnapshot(
      parent: Change,
      beforeParent: string,
      beforeLink: string,
      originalLink: OpsFollowupLink,
      originalResolution: OpsFollowupResolution | undefined,
    ) {
      expect(JSON.stringify(parent)).toBe(beforeParent);
      expect(parent.ops_followup_links![0]).toBe(originalLink);
      expect(JSON.stringify(parent.ops_followup_links![0])).toBe(beforeLink);
      if (originalResolution === undefined) {
        expect(parent.ops_followup_links![0].resolution).toBeUndefined();
      } else {
        expect(parent.ops_followup_links![0].resolution).toBe(
          originalResolution,
        );
      }
    }

    test("AC2/AC4 same-project: incomplete child status blocks with the same code in dry and wet", async () => {
      const parent = makeParentWithOpsLink();
      const child = makeOpsChild(
        "child-1",
        makeIncompleteOpsProfile("running"),
      );
      const store = configureStore(parent, child);
      const beforeParent = JSON.stringify(parent);
      const beforeLink = JSON.stringify(parent.ops_followup_links![0]);
      const originalLink = parent.ops_followup_links![0];
      const originalResolution = originalLink.resolution;

      const dry = await runArchive("test-change", true, store);
      expect(dry.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(dry.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
      expectParentSnapshot(
        parent,
        beforeParent,
        beforeLink,
        originalLink,
        originalResolution,
      );

      installSignalMutation(parent);
      const wet = await runArchive("test-change", false, store);
      expect(wet.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(wet.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalled();
    });

    test("AC2: complete child missing required proof fields blocks with the same code in dry and wet", async () => {
      const parent = makeParentWithOpsLink();
      const child = makeOpsChild(
        "child-1",
        makeCompleteButProofMissingProfile(),
      );
      const store = configureStore(parent, child);
      const beforeParent = JSON.stringify(parent);
      const beforeLink = JSON.stringify(parent.ops_followup_links![0]);
      const originalLink = parent.ops_followup_links![0];
      const originalResolution = originalLink.resolution;

      const dry = await runArchive("test-change", true, store);
      expect(dry.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(dry.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_COMPLETION_PROOF_INCOMPLETE",
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
      expectParentSnapshot(
        parent,
        beforeParent,
        beforeLink,
        originalLink,
        originalResolution,
      );

      installSignalMutation(parent);
      const wet = await runArchive("test-change", false, store);
      expect(wet.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(wet.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_COMPLETION_PROOF_INCOMPLETE",
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalled();
    });

    test("AC2: missing child change blocks with the same code in dry and wet", async () => {
      const parent = makeParentWithOpsLink();
      const store = configureStore(parent, null);
      const beforeParent = JSON.stringify(parent);
      const beforeLink = JSON.stringify(parent.ops_followup_links![0]);
      const originalLink = parent.ops_followup_links![0];
      const originalResolution = originalLink.resolution;

      const dry = await runArchive("test-change", true, store);
      expect(dry.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(dry.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
      expectParentSnapshot(
        parent,
        beforeParent,
        beforeLink,
        originalLink,
        originalResolution,
      );

      installSignalMutation(parent);
      const wet = await runArchive("test-change", false, store);
      expect(wet.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(wet.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalled();
    });

    test("AC2: missing child profile blocks with the same code in dry and wet", async () => {
      const parent = makeParentWithOpsLink();
      const child = makeOpsChild("child-1");
      const store = configureStore(parent, child);
      const beforeParent = JSON.stringify(parent);
      const beforeLink = JSON.stringify(parent.ops_followup_links![0]);
      const originalLink = parent.ops_followup_links![0];
      const originalResolution = originalLink.resolution;

      const dry = await runArchive("test-change", true, store);
      expect(dry.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(dry.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
      expectParentSnapshot(
        parent,
        beforeParent,
        beforeLink,
        originalLink,
        originalResolution,
      );

      installSignalMutation(parent);
      const wet = await runArchive("test-change", false, store);
      expect(wet.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(wet.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalled();
    });

    test("AC2: unreachable child change blocks with the same code in dry and wet", async () => {
      const parent = makeParentWithOpsLink();
      const store = configureStore(parent, "unreachable");
      const beforeParent = JSON.stringify(parent);
      const beforeLink = JSON.stringify(parent.ops_followup_links![0]);
      const originalLink = parent.ops_followup_links![0];
      const originalResolution = originalLink.resolution;

      const dry = await runArchive("test-change", true, store);
      expect(dry.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(dry.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
      expectParentSnapshot(
        parent,
        beforeParent,
        beforeLink,
        originalLink,
        originalResolution,
      );

      installSignalMutation(parent);
      const wet = await runArchive("test-change", false, store);
      expect(wet.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(wet.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalled();
    });

    test("AC2/AC4 same-project: target identity mismatch blocks with the same code in dry and wet", async () => {
      const parent = makeParentWithOpsLink({
        target_project_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
      const child = makeOpsChild("child-1", makeCompleteOpsProfile());
      const store = configureStore(parent, child);
      const beforeParent = JSON.stringify(parent);
      const beforeLink = JSON.stringify(parent.ops_followup_links![0]);
      const originalLink = parent.ops_followup_links![0];
      const originalResolution = originalLink.resolution;

      const dry = await runArchive("test-change", true, store);
      expect(dry.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(dry.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
      expectParentSnapshot(
        parent,
        beforeParent,
        beforeLink,
        originalLink,
        originalResolution,
      );

      installSignalMutation(parent);
      const wet = await runArchive("test-change", false, store);
      expect(wet.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(wet.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalled();
    });

    test("AC2: stale-complete/current-unreachable blocks with OPS_FOLLOWUP_STATUS_UNVERIFIED", async () => {
      const parent = makeParentWithOpsLink({
        status: "complete",
        resolution: {
          status: "complete",
          verified_at: "2026-01-01T00:00:00Z",
          source: "child_profile",
          resolution_reason: "verified",
          completion_signal: "deploy finished",
          health_verification: "smoke passed",
          rollback_or_cleanup_disposition: "no rollback needed",
          evidence_summary: "done",
        },
      });
      const store = configureStore(parent, null);
      const beforeParent = JSON.stringify(parent);
      const beforeLink = JSON.stringify(parent.ops_followup_links![0]);
      const originalLink = parent.ops_followup_links![0];
      const originalResolution = originalLink.resolution;

      const dry = await runArchive("test-change", true, store);
      expect(dry.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(dry.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
      expectParentSnapshot(
        parent,
        beforeParent,
        beforeLink,
        originalLink,
        originalResolution,
      );

      installSignalMutation(parent);
      const wet = await runArchive("test-change", false, store);
      expect(wet.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(wet.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_STATUS_UNVERIFIED",
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalled();
    });

    test("AC4 cross-project: complete child clears stale parent obligation in dry-run", async () => {
      const child = makeOpsChild("child-target", makeCompleteOpsProfile());
      vi.mocked(mocks.targetStore.changes.get).mockResolvedValue({
        success: true,
        data: child,
      });
      const parent = makeParentWithOpsLink({
        id: "ofl-target",
        changeId: "child-target",
        target_path: "/tmp/target",
        target_project_id: TARGET_PROJECT_ID,
      });
      const store = createMockStore(parent);
      const getMock = store.changes.get as ReturnType<typeof vi.fn>;
      getMock.mockImplementation(async (id: string) => {
        if (id === "test-change") return { success: true, data: parent };
        return { success: true, data: null };
      });

      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      const result = await runArchive("test-change", true, store);
      expect(result.error ?? "").not.toContain("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(result.error ?? "").not.toContain(
        "unresolved required ops follow-up obligations",
      );
      expect(result.openOpsObligations ?? []).toEqual([]);
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
    });

    test("AC4 cross-project: incomplete child blocks with the same code in dry and wet", async () => {
      const child = makeOpsChild(
        "child-target",
        makeIncompleteOpsProfile("running"),
      );
      vi.mocked(mocks.targetStore.changes.get).mockResolvedValue({
        success: true,
        data: child,
      });
      const parent = makeParentWithOpsLink({
        id: "ofl-target",
        changeId: "child-target",
        target_path: "/tmp/target",
        target_project_id: TARGET_PROJECT_ID,
      });
      const store = createMockStore(parent);
      const getMock = store.changes.get as ReturnType<typeof vi.fn>;
      getMock.mockImplementation(async (id: string) => {
        if (id === "test-change") return { success: true, data: parent };
        return { success: true, data: null };
      });
      const beforeParent = JSON.stringify(parent);
      const beforeLink = JSON.stringify(parent.ops_followup_links![0]);
      const originalLink = parent.ops_followup_links![0];
      const originalResolution = originalLink.resolution;

      const dry = await runArchive("test-change", true, store);
      expect(dry.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(dry.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(store.changes.save).not.toHaveBeenCalled();
      expectParentSnapshot(
        parent,
        beforeParent,
        beforeLink,
        originalLink,
        originalResolution,
      );

      installSignalMutation(parent);
      const wet = await runArchive("test-change", false, store);
      expect(wet.code).toBe("OPS_FOLLOWUP_ARCHIVE_BLOCKED");
      expect(wet.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalled();
    });

    test("AC3/C2: dry-run overlay is non-aliasing and mutating the returned change does not affect the input parent", () => {
      const parent = makeParentWithOpsLink();
      const resolution: OpsFollowupResolution = {
        status: "complete",
        verified_at: "2026-01-01T00:02:00Z",
        source: "child_profile",
        resolution_reason: "verified",
        completion_signal: "deploy finished",
        health_verification: "smoke passed",
        rollback_or_cleanup_disposition: "no rollback needed",
        evidence_summary: "done",
      };
      const resolutionByLinkId = new Map([["ofl-1", resolution]]);

      const overlaid = overlayOpsResolutionsForRead(parent, resolutionByLinkId);

      expect(overlaid).not.toBe(parent);
      expect(overlaid.ops_followup_links).not.toBe(parent.ops_followup_links);
      expect(overlaid.ops_followup_links![0]).not.toBe(
        parent.ops_followup_links![0],
      );
      expect(overlaid.ops_followup_links![0].resolution).toEqual(resolution);

      overlaid.ops_followup_links![0].status = "complete";
      overlaid.ops_followup_links![0].resolution!.status = "failed";

      expect(parent.ops_followup_links![0].status).toBe("not_started");
      expect(parent.ops_followup_links![0].resolution).toBeUndefined();
    });

    test("parity: dry and wet produce identical blocker codes for the same incomplete fixture", async () => {
      const parent = makeParentWithOpsLink();
      const child = makeOpsChild(
        "child-1",
        makeIncompleteOpsProfile("running"),
      );
      const store = configureStore(parent, child);

      const dry = await runArchive("test-change", true, store);
      installSignalMutation(parent);
      const wet = await runArchive("test-change", false, store);

      expect(dry.code).toBe(wet.code);
      expect(dry.readinessBlockers[0].code).toBe(wet.readinessBlockers[0].code);
      expect(dry.readinessBlockers[0].code).toBe(
        "OPS_FOLLOWUP_BLOCKS_INCOMPLETE",
      );
    });

    test("blocks archive when non-release gates are incomplete", async () => {
      const liveIncompleteGates: NonNullable<Change["gates"]> = {
        ...allDoneGates,
        acceptance: { status: "pending" },
      };
      const store = createMockStore({ gates: allDoneGates });
      mocks.queryMock.mockResolvedValueOnce(liveIncompleteGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain("incomplete gates");
      expect(parsed.incompleteGates).toEqual(["acceptance"]);
      expect(parsed.gateStateSource).toBe("live");
      expect(parsed.storeIncompleteGates).toEqual([]);
      expect(parsed.liveIncompleteGates).toEqual(["acceptance"]);
    });

    // rq-harden-archive-flow AC1/AC2
    test("refreshes the change from the workflow before reading for archive", async () => {
      const store = createMockStore({ gates: allDoneGates });
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );

      const refreshMock = store.changes.refresh as ReturnType<typeof vi.fn>;
      const getMock = store.changes.get as ReturnType<typeof vi.fn>;
      expect(refreshMock).toHaveBeenCalledWith("test-change");
      const refreshOrder = refreshMock.mock.invocationCallOrder[0];
      const firstGetOrder = getMock.mock.invocationCallOrder[0];
      expect(refreshOrder).toBeLessThan(firstGetOrder);
    });

    // rq-harden-archive-flow AC1: refresh failure must not block archive.
    test("tolerates refresh failures and falls through to store.changes.get", async () => {
      const store = createMockStore({ gates: allDoneGates });
      const refreshMock = store.changes.refresh as ReturnType<typeof vi.fn>;
      refreshMock.mockRejectedValueOnce(new Error("Failed to query Workflow"));
      mocks.queryMock.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error ?? "").not.toContain("Failed to query Workflow");
      expect(store.changes.get).toHaveBeenCalledWith("test-change");
    });

    test("recovers archived status when save fails because workflow already completed", async () => {
      const tempDir = await createTempDir(
        "adv-change-archive-completed-recovery-",
      );
      try {
        await prepareLocalReleaseProof(tempDir);
        const store = createMockStore({ gates: allDoneGates });
        store.paths.root = tempDir;
        store.paths.changes = `${tempDir}/changes`;
        store.paths.archive = `${tempDir}/archive`;
        await mkdir(`${tempDir}/changes/test-change`, { recursive: true });
        await writeFile(
          `${tempDir}/changes/test-change/change.json`,
          JSON.stringify((await store.changes.get("test-change")).data),
        );
        vi.mocked(store.changes.save).mockRejectedValueOnce(
          Object.assign(new Error("workflow execution already completed"), {
            name: "WorkflowNotFoundError",
          }),
        );
        mocks.queryMock.mockResolvedValueOnce(allDoneGates);

        const result = await changeTools.adv_change_archive.execute(
          {
            changeId: "test-change",
            phase9: "skip",
          },
          store,
        );
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(true);
        expect(parsed._recoveryMutation).toBe(true);
        expect(parsed.archivePath).toContain("test-change");
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    test("does not recover archive save failure when signal error is unclassified", async () => {
      const tempDir = await createTempDir(
        "adv-change-archive-unclassified-no-recovery-",
      );
      try {
        await prepareLocalReleaseProof(tempDir);
        const store = createMockStore({ gates: allDoneGates });
        store.paths.root = tempDir;
        store.paths.changes = `${tempDir}/changes`;
        store.paths.archive = `${tempDir}/archive`;
        vi.mocked(store.changes.save).mockRejectedValueOnce(
          new Error("some transient query failure"),
        );
        mocks.queryMock.mockResolvedValueOnce(allDoneGates);

        const result = await changeTools.adv_change_archive.execute(
          { changeId: "test-change", phase9: "skip" },
          store,
        );
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("some transient query failure");
        expect(parsed._recoveryMutation).toBeUndefined();
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    test("keeps poisoned-description archive recovery path working", async () => {
      const tempDir = await createTempDir(
        "adv-change-archive-poisoned-recovery-",
      );
      try {
        await prepareLocalReleaseProof(tempDir);
        const store = createMockStore({ gates: allDoneGates });
        store.paths.root = tempDir;
        store.paths.changes = `${tempDir}/changes`;
        store.paths.archive = `${tempDir}/archive`;
        await mkdir(`${tempDir}/changes/test-change`, { recursive: true });
        await writeFile(
          `${tempDir}/changes/test-change/change.json`,
          JSON.stringify((await store.changes.get("test-change")).data),
        );
        vi.mocked(store.changes.save).mockRejectedValueOnce(
          new Error(
            "TMPRL1100 Nondeterminism error while saving archive status",
          ),
        );
        (
          mocks.handleMock as typeof mocks.handleMock & {
            describe: ReturnType<typeof vi.fn>;
          }
        ).describe = vi.fn(async () => ({
          rawDescription: "TMPRL1100 Nondeterminism error",
        }));
        mocks.queryMock.mockResolvedValueOnce(allDoneGates);

        const result = await changeTools.adv_change_archive.execute(
          {
            changeId: "test-change",
            phase9: "skip",
          },
          store,
        );
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(true);
        expect(parsed._recoveryMutation).toBe(true);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    test("refuses poisoned archive recovery when signal error and describe disagree", async () => {
      // D4 (rq-internalMonotonicRecovery01): the signal-error classifier
      // requires describe() poison confirmation. A poisoned signal-error class
      // without describe confirmation is operator_required.
      const tempDir = await createTempDir(
        "adv-change-archive-poisoned-disagree-",
      );
      try {
        await prepareLocalReleaseProof(tempDir);
        const store = createMockStore({ gates: allDoneGates });
        store.paths.root = tempDir;
        store.paths.changes = `${tempDir}/changes`;
        store.paths.archive = `${tempDir}/archive`;
        await mkdir(`${tempDir}/changes/test-change`, { recursive: true });
        await writeFile(
          `${tempDir}/changes/test-change/change.json`,
          JSON.stringify((await store.changes.get("test-change")).data),
        );
        vi.mocked(store.changes.save).mockRejectedValueOnce(
          new Error("TMPRL1100 nondeterminism while saving archive status"),
        );
        (
          mocks.handleMock as typeof mocks.handleMock & {
            describe: ReturnType<typeof vi.fn>;
          }
        ).describe = vi.fn(async () => ({ status: "RUNNING" }));
        mocks.queryMock.mockResolvedValueOnce(allDoneGates);

        const result = await changeTools.adv_change_archive.execute(
          {
            changeId: "test-change",
            phase9: "skip",
          },
          store,
        );
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(false);
        expect(parsed._recoveryMutation).toBeUndefined();
        expect(parsed.code).toBe("ARCHIVE_MUTATION_OPERATOR_REQUIRED");
        expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    test("does not recover archive status when saveError is generic even if describe shows poisoned", async () => {
      // D4: a generic signal error (query_failed) never authorizes mutation,
      // regardless of describe() state.
      const tempDir = await createTempDir(
        "adv-change-archive-no-recovery-generic-error-",
      );
      try {
        await prepareLocalReleaseProof(tempDir);
        const store = createMockStore({ gates: allDoneGates });
        store.paths.root = tempDir;
        store.paths.changes = `${tempDir}/changes`;
        store.paths.archive = `${tempDir}/archive`;
        await mkdir(`${tempDir}/changes/test-change`, { recursive: true });
        await writeFile(
          `${tempDir}/changes/test-change/change.json`,
          JSON.stringify((await store.changes.get("test-change")).data),
        );
        vi.mocked(store.changes.save).mockRejectedValueOnce(
          new Error("Failed to query Workflow"),
        );
        (
          mocks.handleMock as typeof mocks.handleMock & {
            describe: ReturnType<typeof vi.fn>;
          }
        ).describe = vi.fn(async () => ({
          rawDescription: "TMPRL1100 Nondeterminism error",
        }));
        mocks.queryMock.mockResolvedValueOnce(allDoneGates);

        const result = await changeTools.adv_change_archive.execute(
          {
            changeId: "test-change",
            phase9: "skip",
          },
          store,
        );
        const parsed = JSON.parse(result);

        expect(parsed.success).toBeFalsy();
        expect(parsed._recoveryMutation).toBeUndefined();
        expect(mocks.saveRecoveredChangeStatus).not.toHaveBeenCalled();
        expect(parsed.error).toMatch(/Failed to query Workflow/i);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    test("is a bounded no-op when change is already archived and archive bundle exists", async () => {
      const tempDir = await createTempDir(
        "adv-change-archive-idempotent-noop-",
      );
      try {
        await prepareLocalReleaseProof(tempDir, "test-change");
        const archiveDir = `${tempDir}/.adv/archive`;
        const bundleDir = `${archiveDir}/2026-07-01-test-change`;
        await mkdir(bundleDir, { recursive: true });
        await writeFile(
          `${bundleDir}/change.json`,
          JSON.stringify({ id: "test-change", status: "archived" }),
        );

        // rq-releaseProjectionDurability01: an existing-bundle retry must not
        // succeed solely because the store release gate is marked done; the gate
        // must carry matching Phase 9 structural evidence so the no-op path is
        // evidence-authoritative, not status-authoritative.
        const releaseEvidence = `Phase 9 finalization shipped; defaultBranch=main; repoRoot=${tempDir}; pushStatus=pushed; route=direct`;
        const gates = {
          ...allDoneGates,
          release: { status: "done", approval_evidence: releaseEvidence },
        };
        const store = createMockStore({
          status: "archived",
          gates,
        });
        store.paths.root = tempDir;
        store.paths.changes = `${tempDir}/.adv/changes`;
        store.paths.archive = archiveDir;

        const finalizeSpy = vi
          .spyOn(gitFinalize, "finalizeRelease")
          .mockResolvedValue({
            status: "shipped",
            repoRoot: tempDir,
            defaultBranch: "main",
            pushStatus: "pushed",
          } as Awaited<ReturnType<typeof gitFinalize.finalizeRelease>>);
        const deleteBranchSpy = vi
          .spyOn(gitFinalize, "deleteChangeBranch")
          .mockReturnValue({ localDeleted: true, remoteDeleted: false });
        const worktreeDeleteSpy = vi
          .spyOn(worktree, "advWorktreeDelete")
          .mockResolvedValue({
            ok: false,
            error: "WORKTREE_NOT_FOUND",
            branch: "change/test-change",
          });

        const result = await changeTools.adv_change_archive.execute(
          { changeId: "test-change" },
          store,
        );
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(true);
        expect(parsed.noOp).toBe(true);
        expect(parsed.archivePath).toContain("test-change");
        expect(finalizeSpy).not.toHaveBeenCalled();
        expect(deleteBranchSpy).not.toHaveBeenCalled();
        expect(worktreeDeleteSpy).not.toHaveBeenCalled();
        expect(mocks.removeChangeDir).not.toHaveBeenCalled();
        expect(mocks.execGh).not.toHaveBeenCalled();
        expect(mocks.execGit).not.toHaveBeenCalled();
        const saveMock = store.changes.save as ReturnType<typeof vi.fn>;
        expect(saveMock).toHaveBeenCalledWith(
          expect.objectContaining({ status: "archived" }),
        );
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe("adv_change_reenter", () => {
    test("fires gateReenteredSignal for scope expansion", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "execution",
          reason: "Scope expanded",
          scopeDelta: "Add new module",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle,
        PROJECT_ID,
        "test-change",
      );
      const signalCall = mocks.fireSignalAndRefresh.mock.calls[0];
      expect(signalCall[4]).toMatchObject({
        fromGateId: "execution",
        reason: "Scope expanded",
        scopeDelta: "Add new module",
        reenteredBy: "agent",
      });
    });

    test("target_path reentry uses target project handle, target store refresh, and project context", async () => {
      const store = createMockStore();
      mocks.getProjectId.mockImplementationOnce(async (root: string) => {
        expect(root).toBe("/tmp/target");
        return TARGET_PROJECT_ID;
      });

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "discovery",
          reason: "Target scope expanded",
          scopeDelta: "Reset target gates",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "User approved target reentry",
        } as Parameters<typeof changeTools.adv_change_reenter.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed._projectContext).toMatchObject({
        root: "/tmp/target",
        projectId: TARGET_PROJECT_ID,
        stateMode: "temporal",
      });
      expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
        expect.objectContaining({
          currentProjectPath: "/tmp/test",
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "User approved target reentry",
          stateRequirement: "temporal-required",
        }),
        expect.any(Function),
      );
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle,
        TARGET_PROJECT_ID,
        "test-change",
      );
      expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
        expect.anything(),
        mocks.targetStore,
        "test-change",
        expect.anything(),
        expect.objectContaining({
          fromGateId: "discovery",
          reason: "Target scope expanded",
          scopeDelta: "Reset target gates",
        }),
      );
    });

    test("target_path reentry dryRun validates target state without signaling", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "execution",
          reason: "Preview target reentry",
          dryRun: true,
          target_path: "/tmp/target",
          target_confirmed: true,
          confirmationEvidence: "User approved target preview",
        } as Parameters<typeof changeTools.adv_change_reenter.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed._projectContext).toMatchObject({ root: "/tmp/target" });
      expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
        expect.objectContaining({
          stateRequirement: "snapshot-ok",
          mutation: false,
        }),
        expect.any(Function),
      );
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
      expect(mocks.getChangeHandle).not.toHaveBeenCalled();
    });

    test("target_path reentry rejects unconfirmed target mutation before signaling", async () => {
      mocks.withTargetPathStore.mockRejectedValueOnce(
        new Error("target confirmation required"),
      );

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "execution",
          reason: "Target scope expanded",
          target_path: "/tmp/target",
        } as Parameters<typeof changeTools.adv_change_reenter.execute>[0],
        createMockStore(),
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("target confirmation required");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("blocks reenter on archived/closed changes", async () => {
      const store = createMockStore({ status: "archived" });

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "execution",
          reason: "Scope expanded",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Cannot reenter archived");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("returns error when Temporal service is unavailable", async () => {
      mocks.getService.mockReturnValueOnce(null);
      const store = createMockStore();

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "execution",
          reason: "Scope expanded",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Temporal service not available");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });

    test("dryRun validates reenter request without firing gateReenteredSignal", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_reenter.execute(
        {
          changeId: "test-change",
          fromGate: "execution",
          reason: "Scope expanded",
          scopeDelta: "Add new module",
          dryRun: true,
        } as Parameters<typeof changeTools.adv_change_reenter.execute>[0],
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.message).toContain("Would reenter change test-change");
      expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    });
  });

  describe("closeLinkedIssue in adv_change_archive", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test("happy path: roadmap origin, issue closed successfully", async () => {
      const store = createMockStore({
        origin: { kind: "roadmap", issue_number: 42 },
        status: "active",
        gates: allDoneGates,
      });
      mocks.execGit.mockResolvedValueOnce("abc1234\n"); // short SHA
      mocks.execGh.mockResolvedValueOnce({ exitCode: 0, stderr: "" }); // comment
      mocks.execGh.mockResolvedValueOnce({ exitCode: 0, stderr: "" }); // close

      const result = await closeLinkedIssue({
        change: (await store.changes.get("test-change")).data!,
        store,
      });

      expect(result.close_eligible).toBe(true);
      expect(result.issue_closed).toEqual([42]);
      expect(result.issue_closure_error).toBeUndefined();
      expect(mocks.execGh).toHaveBeenCalledTimes(2);
      expect(mocks.execGh).toHaveBeenNthCalledWith(
        1,
        [
          "issue",
          "comment",
          "42",
          "--body",
          "Shipped via test-change (abc1234)",
        ],
        "/tmp/test",
      );
      expect(mocks.execGh).toHaveBeenNthCalledWith(
        2,
        ["issue", "close", "42", "--reason", "completed"],
        "/tmp/test",
      );
    });

    test("already-closed: gh issue close returns exit 0 on already-closed issue", async () => {
      const store = createMockStore({
        origin: { kind: "roadmap", issue_number: 42 },
        status: "active",
        gates: allDoneGates,
      });
      mocks.execGit.mockResolvedValueOnce("abc1234\n");
      mocks.execGh.mockResolvedValueOnce({ exitCode: 0, stderr: "" }); // comment
      mocks.execGh.mockResolvedValueOnce({ exitCode: 0, stderr: "" }); // close (already closed is still exit 0)

      const result = await closeLinkedIssue({
        change: (await store.changes.get("test-change")).data!,
        store,
      });

      expect(result.issue_closed).toEqual([42]);
      expect(result.issue_closure_error).toBeUndefined();
    });

    test("gh-not-found: execGh returns ghNotFound: true -> silent skip", async () => {
      const store = createMockStore({
        origin: { kind: "roadmap", issue_number: 42 },
        status: "active",
        gates: allDoneGates,
      });
      mocks.execGit.mockResolvedValueOnce("abc1234\n");
      mocks.execGh.mockResolvedValueOnce({ exitCode: 0, stderr: "" }); // comment
      mocks.execGh.mockResolvedValueOnce({
        exitCode: -1,
        stderr: "gh: command not found",
        ghNotFound: true,
      });

      const result = await closeLinkedIssue({
        change: (await store.changes.get("test-change")).data!,
        store,
      });

      expect(result.close_eligible).toBe(true);
      expect(result.issue_closed).toEqual([]);
      expect(result.issue_closure_error).toBeUndefined();
    });

    test("auth failure: execGh returns non-zero exit -> non-fatal error with manual command", async () => {
      const store = createMockStore({
        origin: { kind: "roadmap", issue_number: 42 },
        status: "active",
        gates: allDoneGates,
      });
      mocks.execGit.mockResolvedValueOnce("abc1234\n");
      mocks.execGh.mockResolvedValueOnce({ exitCode: 0, stderr: "" }); // comment
      mocks.execGh.mockResolvedValueOnce({
        exitCode: 1,
        stderr: "HTTP 401: Bad credentials",
        ghNotFound: false,
      });

      const result = await closeLinkedIssue({
        change: (await store.changes.get("test-change")).data!,
        store,
      });

      expect(result.issue_closed).toEqual([]);
      expect(result.issue_closure_error).toBeDefined();
      expect(result.issue_closure_error!.issue_number).toBe(42);
      expect(result.issue_closure_error!.exitCode).toBe(1);
      expect(result.issue_closure_error!.stderr).toContain("Bad credentials");
      expect(result.issue_closure_error!.manualCommand).toBe(
        "gh issue close 42 --reason completed",
      );
    });

    test("dryRun=true -> skip GH calls, return close_eligible", async () => {
      const store = createMockStore({
        origin: { kind: "roadmap", issue_number: 42 },
        status: "active",
        gates: allDoneGates,
      });

      const result = await closeLinkedIssue({
        change: (await store.changes.get("test-change")).data!,
        store,
        dryRun: true,
      });

      expect(result.close_eligible).toBe(true);
      expect(result.issue_closed).toEqual([]);
      expect(result.dryRun).toBe(true);
      expect(mocks.execGh).not.toHaveBeenCalled();
    });

    test("--no-close-issue -> skip entirely", async () => {
      const store = createMockStore({
        origin: { kind: "roadmap", issue_number: 42 },
        status: "active",
        gates: allDoneGates,
      });

      const result = await closeLinkedIssue({
        change: (await store.changes.get("test-change")).data!,
        store,
        noCloseIssue: true,
      });

      expect(result.close_eligible).toBe(true);
      expect(result.issue_closed).toEqual([]);
      expect(mocks.execGh).not.toHaveBeenCalled();
    });

    test("ineligible origin: discovery/adhoc origin -> no closure attempted", async () => {
      const store = createMockStore({
        origin: { kind: "discovery", issue_number: 42 },
        status: "active",
        gates: allDoneGates,
      });

      const result = await closeLinkedIssue({
        change: (await store.changes.get("test-change")).data!,
        store,
      });

      expect(result.issue_closed).toEqual([]);
      expect(result.close_eligible).toBeUndefined();
      expect(mocks.execGh).not.toHaveBeenCalled();
    });

    test("cross-repo owner: github_project config has different owner -> --repo flag used", async () => {
      const store = createMockStore({
        origin: { kind: "roadmap", issue_number: 42 },
        status: "active",
        gates: allDoneGates,
      });
      mocks.readGitHubProjectConfig.mockResolvedValueOnce({
        owner: "different-owner",
        project_number: 1,
        project_id: "proj-123",
        title: "Test Project",
        repository_filter: "other-repo",
        fields: {
          adv_type: "type",
          priority: "priority",
          value: "value",
          time_criticality: "tc",
          rroe: "rroe",
          effort: "effort",
          wsjf: "wsjf",
        },
        adv_type_options: {},
        priority_options: {},
      });
      mocks.execGit
        .mockResolvedValueOnce(
          "https://github.com/current-owner/current-repo\n",
        ) // remote get-url
        .mockResolvedValueOnce("abc1234\n"); // short SHA
      mocks.execGh.mockResolvedValueOnce({ exitCode: 0, stderr: "" }); // comment
      mocks.execGh.mockResolvedValueOnce({ exitCode: 0, stderr: "" }); // close

      const result = await closeLinkedIssue({
        change: (await store.changes.get("test-change")).data!,
        store,
      });

      expect(result.issue_closed).toEqual([42]);
      expect(mocks.execGh).toHaveBeenCalledTimes(2);
      expect(mocks.execGh).toHaveBeenNthCalledWith(
        1,
        [
          "issue",
          "comment",
          "42",
          "--body",
          "Shipped via test-change (abc1234)",
          "--repo",
          "different-owner/other-repo",
        ],
        "/tmp/test",
      );
      expect(mocks.execGh).toHaveBeenNthCalledWith(
        2,
        [
          "issue",
          "close",
          "42",
          "--reason",
          "completed",
          "--repo",
          "different-owner/other-repo",
        ],
        "/tmp/test",
      );
    });
  });
});

// rq-recoverySurfaceParity01: adv_change_forget was retired; its
// phantom-pointer clearing moved to adv_doctor (option B). Pointer-clear
// behavior is now covered by doctor.test.ts and _adapters.test.ts.
