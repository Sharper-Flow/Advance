/**
 * Change Tools — Lifecycle Contract Tests (Signal-Driven)
 *
 * Tests for adv_change_close, adv_change_bulk_close, and adv_change_reenter
 * using signal/query surface instead of workflow updates.
 * Verifies tool-layer enforcement for cancellation/archive approval.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { changeTools, closeLinkedIssue } from "./change";
import type { Store } from "../storage/store";
import type { Change, Spec } from "../types";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";

const mocks = vi.hoisted(() => {
  const signalMock = vi.fn();
  const queryMock = vi.fn();
  const handleMock = { signal: signalMock, query: queryMock };
  const getHandleMock = vi.fn(() => handleMock);
  const temporalBundle = {
    client: { workflow: { getHandle: getHandleMock } },
  };

  return {
    signalMock,
    queryMock,
    handleMock,
    getHandleMock,
    temporalBundle,
    getService: vi.fn(() => temporalBundle),
    getProjectId: vi.fn(async () => "test-project-id"),
    fireSignal: vi.fn(async () => {}),
    fireSignalAndRefresh: vi.fn(async () => {}),
    querySignal: vi.fn(),
    getChangeHandle: vi.fn(() => handleMock),
    removeChangeDir: vi.fn(async () => {}),
    sweepClosedChangesFromDisk: vi.fn(async () => ({
      removed: [] as string[],
      failed: [] as Array<{ id: string; error: string }>,
    })),
    execGh: vi.fn(),
    readGitHubProjectConfig: vi.fn(),
    execGit: vi.fn(),
  };
});

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
}));

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

    test("requires audited recovery fields for executive-summary metadata recovery", async () => {
      const store = createMockStore();

      const result = await changeTools.adv_change_update.execute(
        {
          changeId: "test-change",
          executiveSummary: "# Executive Summary\n\nDurable proof.",
          recoveryMode: "poisoned_history",
          recoveryEvidence:
            "WorkflowExecutionAlreadyCompleted: workflow execution already completed",
        },
        store,
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toContain(
        "recoveryReason and priorApprovalEvidence",
      );
      expect(store.changes.updateArtifacts).not.toHaveBeenCalled();
    });

    test("recovers executive-summary metadata when artifact update hits completed workflow", async () => {
      const { createHash } = await import("crypto");
      const { mkdir, readFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join: pathJoin } = await import("path");
      const tempRoot = pathJoin(
        tmpdir(),
        `adv-change-update-recovery-${Date.now()}`,
      );
      const changesDir = pathJoin(tempRoot, ".adv/changes");
      const changeDir = pathJoin(changesDir, "test-change");
      await mkdir(changeDir, { recursive: true });

      try {
        const store = createMockStore();
        (store.paths as { changes: string }).changes = changesDir;
        (store.paths as { root: string }).root = tempRoot;
        vi.mocked(store.changes.updateArtifacts).mockRejectedValueOnce(
          new Error("workflow execution already completed"),
        );

        const executiveSummary = "# Executive Summary\n\nDurable proof.";
        const result = await changeTools.adv_change_update.execute(
          {
            changeId: "test-change",
            executiveSummary,
            recoveryMode: "poisoned_history",
            recoveryEvidence:
              "WorkflowExecutionAlreadyCompleted: workflow execution already completed",
            recoveryReason:
              "completed workflow accepted disk artifact but rejected metadata signal",
            priorApprovalEvidence: "Prior user acceptance approval: accept",
          },
          store,
        );

        const parsed = JSON.parse(result);
        expect(parsed._recoveryMutation).toBe(true);
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
        });
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
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
        mocks.temporalBundle.client,
        "test-project-id",
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
        mocks.temporalBundle.client,
        "test-project-id",
        "chg-1",
      );
      expect(mocks.getChangeHandle).toHaveBeenCalledWith(
        mocks.temporalBundle.client,
        "test-project-id",
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
          { id: "danglingPeer", title: "Dangling Peer", status: "draft" },
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
  });

  describe("adv_change_archive", () => {
    test("uses live gate status for archive preflight when cached gates are stale", async () => {
      const staleStoreGates: NonNullable<Change["gates"]> = {
        ...allDoneGates,
        acceptance: { status: "pending" },
        release: { status: "pending" },
      };
      const store = createMockStore({ gates: staleStoreGates });
      mocks.querySignal.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(mocks.querySignal).toHaveBeenCalledTimes(1);
      expect(parsed.error ?? "").not.toContain("incomplete gates");
      expect(parsed.incompleteGates).toBeUndefined();
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
          { id: "danglingPeer", title: "Dangling Peer", status: "draft" },
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
      mocks.querySignal.mockResolvedValueOnce(allDoneGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.validationErrors).toBeUndefined();
      expect(parsed.error ?? "").not.toContain("validation could not run");
    });

    test("allows archive when only release gate is pending (finalization completes it)", async () => {
      const liveIncompleteGates: NonNullable<Change["gates"]> = {
        ...allDoneGates,
        release: { status: "pending" },
      };
      const store = createMockStore({ gates: allDoneGates });
      mocks.querySignal.mockResolvedValueOnce(liveIncompleteGates);

      const result = await changeTools.adv_change_archive.execute(
        { changeId: "test-change", dryRun: true },
        store,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error ?? "").not.toContain("incomplete gates");
      expect(parsed.incompleteGates).toBeUndefined();
    });

    test("blocks archive when non-release gates are incomplete", async () => {
      const liveIncompleteGates: NonNullable<Change["gates"]> = {
        ...allDoneGates,
        acceptance: { status: "pending" },
      };
      const store = createMockStore({ gates: allDoneGates });
      mocks.querySignal.mockResolvedValueOnce(liveIncompleteGates);

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
      mocks.querySignal.mockResolvedValueOnce(allDoneGates);

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
      mocks.querySignal.mockResolvedValueOnce(allDoneGates);

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
        const store = createMockStore({ gates: allDoneGates });
        store.paths.root = tempDir;
        store.paths.changes = `${tempDir}/changes`;
        store.paths.archive = `${tempDir}/archive`;
        vi.mocked(store.changes.save).mockRejectedValueOnce(
          Object.assign(new Error("workflow execution already completed"), {
            name: "WorkflowNotFoundError",
          }),
        );
        mocks.querySignal.mockResolvedValueOnce(allDoneGates);

        const result = await changeTools.adv_change_archive.execute(
          {
            changeId: "test-change",
            phase9: "skip",
            recoveryMode: "poisoned_history",
            recoveryEvidence:
              "workflow execution already completed | WorkflowNotFoundError",
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

    test("does not recover completed-workflow save failure without recoveryMode", async () => {
      const tempDir = await createTempDir(
        "adv-change-archive-completed-no-recovery-",
      );
      try {
        const store = createMockStore({ gates: allDoneGates });
        store.paths.root = tempDir;
        store.paths.changes = `${tempDir}/changes`;
        store.paths.archive = `${tempDir}/archive`;
        vi.mocked(store.changes.save).mockRejectedValueOnce(
          Object.assign(new Error("workflow execution already completed"), {
            name: "WorkflowNotFoundError",
          }),
        );
        mocks.querySignal.mockResolvedValueOnce(allDoneGates);

        const result = await changeTools.adv_change_archive.execute(
          { changeId: "test-change", phase9: "skip" },
          store,
        );
        const parsed = JSON.parse(result);

        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain("workflow execution already completed");
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
        const store = createMockStore({ gates: allDoneGates });
        store.paths.root = tempDir;
        store.paths.changes = `${tempDir}/changes`;
        store.paths.archive = `${tempDir}/archive`;
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
        mocks.querySignal.mockResolvedValueOnce(allDoneGates);

        const result = await changeTools.adv_change_archive.execute(
          {
            changeId: "test-change",
            phase9: "skip",
            recoveryMode: "poisoned_history",
            recoveryEvidence: "TMPRL1100 Nondeterminism error",
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
        mocks.temporalBundle.client,
        "test-project-id",
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
