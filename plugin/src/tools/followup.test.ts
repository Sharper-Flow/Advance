import { beforeEach, describe, expect, test, vi } from "vitest";
import { followupTools } from "./followup";
import { parseToolOutput } from "../__tests__/setup";
import { subagentReportKey } from "../temporal/contracts";
import {
  opsFollowupSeededSignal,
  opsFollowupLinkAddedSignal,
} from "../temporal/messages";
import type { Store } from "../storage/store";
import type { Change, OpsFollowupLink, ScopedSubagentReport } from "../types";

const mocks = vi.hoisted(() => {
  const signalMock = vi.fn();
  const queryMock = vi.fn();
  const handleMock = { signal: signalMock, query: queryMock };
  const getHandleMock = vi.fn(() => handleMock);
  const temporalBundle = {
    client: { workflow: { getHandle: getHandleMock } },
  };

  const targetStore = {
    paths: { root: "/tmp/target", changes: "/tmp/target/.adv/changes" },
    changes: { create: vi.fn(), get: vi.fn() },
  } as unknown as Store;

  return {
    signalMock,
    queryMock,
    handleMock,
    getHandleMock,
    temporalBundle,
    targetStore,
    getService: vi.fn(() => temporalBundle),
    getProjectId: vi.fn(async () => "source-project-id"),
    fireSignalAndRefresh: vi.fn(async () => {}),
    getChangeHandle: vi.fn(() => handleMock),
    withTargetPathStore: vi.fn(async (_input, fn) =>
      fn({
        context: {
          root: "/tmp/target",
          projectId: "target-project-id",
          externalRoot: "/tmp/target-external",
          trusted: false,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStore,
      }),
    ),
    formatTargetProjectContext: vi.fn((context) => ({
      root: context.root,
      projectId: context.projectId,
      trusted: context.trusted,
      trustSource: context.trustSource,
      stateMode: context.stateMode,
      ...(context.warning ? { warning: context.warning } : {}),
    })),
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
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  getChangeHandle: mocks.getChangeHandle,
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
    formatTargetProjectContext: mocks.formatTargetProjectContext,
  };
});

function makeReport(overrides?: {
  required_follow_ups?: {
    text: string;
    obligation_class: string;
    severity: string;
    source_contract_id?: string;
  }[];
  agent?: string;
  scope?:
    | { kind: "task"; task_id: string }
    | { kind: "change"; scope_key: string };
}): ScopedSubagentReport {
  const taskId =
    overrides?.scope?.kind === "task" ? overrides.scope.task_id : "tk-source";
  return {
    schema_version: "1.0",
    change_id: "sourceChange",
    task_id: taskId,
    attempt: 1,
    agent: overrides?.agent ?? "adv-engineer",
    scope: overrides?.scope ?? { kind: "task", task_id: taskId },
    status: "complete",
    files_touched: [],
    verification: [{ command: "pnpm test", exit_code: 0, summary: "pass" }],
    decisions: [],
    blockers: [],
    scope_drift: null,
    follow_ups: [],
    required_main_agent_actions: [],
    related_scan: "none",
    context_update_for_adv: {
      what_ads_needs_to_know: "test",
      suggested_next_action: "test",
    },
    ...(overrides?.required_follow_ups
      ? { required_follow_ups: overrides.required_follow_ups }
      : {}),
  } as ScopedSubagentReport;
}

function reportKey(report: ScopedSubagentReport): string {
  return subagentReportKey({
    changeId: report.change_id,
    taskId:
      typeof report.scope === "string"
        ? undefined
        : report.scope.kind === "task"
          ? report.scope.task_id
          : undefined,
    scope: typeof report.scope === "string" ? undefined : report.scope,
    agent: report.agent,
    attempt: report.attempt,
  });
}

function makeStore(overrides?: { sourceChange?: Change }): Store {
  const sourceChange: Change = overrides?.sourceChange ?? {
    id: "sourceChange",
    title: "Source change",
    status: "active",
    created_at: "2026-06-20T04:00:00.000Z",
    tasks: [],
    deltas: {},
  };

  return {
    paths: { root: "/tmp/source", changes: "/tmp/source/.adv/changes" },
    config: { name: "source-project" } as never,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      get: vi.fn(async (changeId: string) =>
        changeId === sourceChange.id
          ? { success: true, data: sourceChange }
          : { success: false, error: "not found" },
      ),
      create: vi.fn(async () => ({
        changeId: "addOpsFollowup",
        path: "/tmp/source/.adv/changes/addOpsFollowup/proposal.md",
      })),
    } as unknown as Store["changes"],
    tasks: {} as Store["tasks"],
    gates: {} as Store["gates"],
    wisdom: {} as Store["wisdom"],
    agenda: {} as Store["agenda"],
  } as Store;
}

describe("adv_followup_promote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("promotes a required_follow_up from a sub-agent report (same project)", async () => {
    const report = makeReport({
      required_follow_ups: [
        {
          text: "Backfill prod data",
          obligation_class: "required_standard",
          severity: "high",
          source_contract_id: "AC-1",
        },
      ],
    });
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        subagent_reports: [report],
      } as Change,
    });

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "required_follow_up",
        source_report_key: reportKey(report),
        source_contract_id: "AC-1",
        relationship: "follows_release",
        kind: "backfill",
        summary: "Backfill prod data",
        capability: "data-platform",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.child_change_id).toBe("addOpsFollowup");
    expect(parsed.source_change_id).toBe("sourceChange");
    expect(parsed.ops_followup).toMatchObject({
      kind: "backfill",
      relationship: "follows_release",
      status: "not_started",
    });
    expect(parsed.ops_followup.source).toMatchObject({
      source_change_id: "sourceChange",
      source_project_id: "source-project-id",
      source_path: "/tmp/source",
      source_kind: "required_follow_up",
      source_artifact: reportKey(report),
      source_contract_id: "AC-1",
      source_report_key: reportKey(report),
    });
    expect(parsed.link).toMatchObject({
      changeId: "addOpsFollowup",
      relationship: "follows_release",
      status: "not_started",
    });

    expect(store.changes.create).toHaveBeenCalledWith(
      "Backfill prod data",
      expect.objectContaining({ capability: "data-platform" }),
    );
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
    const [seedCall, linkCall] = mocks.fireSignalAndRefresh.mock.calls;
    expect(seedCall[3]).toBe(opsFollowupSeededSignal);
    expect(linkCall[3]).toBe(opsFollowupLinkAddedSignal);
  });

  test("detects duplicate promotions by structural source identity", async () => {
    const report = makeReport({
      required_follow_ups: [
        {
          text: "Backfill prod data",
          obligation_class: "required_standard",
          severity: "high",
          source_contract_id: "AC-1",
        },
      ],
    });
    const existingLink: OpsFollowupLink = {
      id: "ofl-existing",
      changeId: "existingChild",
      relationship: "follows_release",
      status: "not_started",
      linked_at: "2026-06-20T04:00:00.000Z",
      source_artifact: reportKey(report),
      source_contract_id: "AC-1",
    };
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        subagent_reports: [report],
        ops_followup_links: [existingLink],
      } as Change,
    });

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "required_follow_up",
        source_report_key: reportKey(report),
        source_contract_id: "AC-1",
        relationship: "follows_release",
        kind: "backfill",
        summary: "Backfill prod data",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.duplicate).toBe(true);
    expect(parsed.child_change_id).toBe("existingChild");
    expect(store.changes.create).not.toHaveBeenCalled();
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("routes cross-project promotion through a Temporal-backed target store", async () => {
    mocks.targetStore.changes.create = vi.fn(async () => ({
      changeId: "addTargetFollowup",
      path: "/tmp/target/.adv/changes/addTargetFollowup/proposal.md",
    }));

    const report = makeReport();
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        subagent_reports: [report],
      } as Change,
    });

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "report_follow_up",
        source_report_key: reportKey(report),
        relationship: "monitors",
        kind: "monitoring",
        summary: "Add monitoring",
        target_path: "/tmp/target",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.child_change_id).toBe("addTargetFollowup");
    expect(parsed.child_project_id).toBe("target-project-id");
    expect(parsed.link.target_project_id).toBe("target-project-id");
    expect(parsed.link.target_path).toBe("/tmp/target");
    expect(parsed._projectContext).toMatchObject({ stateMode: "temporal" });

    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProjectPath: "/tmp/source",
        target_path: "/tmp/target",
        stateRequirement: "temporal-required",
        target_confirmed: true,
        confirmationEvidence: "user approved target mutation",
      }),
      expect.any(Function),
    );
    expect(mocks.targetStore.changes.create).toHaveBeenCalledWith(
      "Add monitoring",
      expect.objectContaining({
        initialMetadata: {
          cross_project_origin: expect.objectContaining({
            source_project: "source-project",
            source_path: "/tmp/source",
            source_change_id: "sourceChange",
          }),
        },
      }),
    );
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
  });

  test("supports agenda fallback source", async () => {
    const store = makeStore();

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "agenda",
        source_agenda_id: "ag-123",
        relationship: "cleanup_after",
        kind: "cleanup",
        summary: "Clean up temp tables",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.ops_followup.source.source_kind).toBe("agenda");
    expect(parsed.ops_followup.source.source_agenda_id).toBe("ag-123");
    expect(parsed.ops_followup.source.source_artifact).toBe("ag-123");
  });

  test("supports manual fallback source", async () => {
    const store = makeStore();

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "manual",
        relationship: "blocks",
        kind: "deploy_config",
        summary: "Configure deploy",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.ops_followup.source.source_kind).toBe("manual");
    expect(parsed.ops_followup.source.source_artifact).toBeUndefined();
  });

  test("rejects report source when report is not found on source change", async () => {
    const store = makeStore();

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "required_follow_up",
        source_report_key: "missing-report",
        relationship: "blocks",
        kind: "migration",
        summary: "Run migration",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBeUndefined();
    expect(parsed.error).toContain("Report not found");
    expect(store.changes.create).not.toHaveBeenCalled();
  });

  test("rejects required_follow_up source when contract id does not match", async () => {
    const report = makeReport({
      required_follow_ups: [
        {
          text: "Backfill prod data",
          obligation_class: "required_standard",
          severity: "high",
          source_contract_id: "AC-1",
        },
      ],
    });
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        subagent_reports: [report],
      } as Change,
    });

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "required_follow_up",
        source_report_key: reportKey(report),
        source_contract_id: "AC-99",
        relationship: "follows_release",
        kind: "backfill",
        summary: "Backfill prod data",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.error).toContain(
      "No required_follow_up with source_contract_id 'AC-99'",
    );
    expect(store.changes.create).not.toHaveBeenCalled();
  });

  test("returns partial-link diagnostic when parent link signal fails", async () => {
    const report = makeReport();
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        subagent_reports: [report],
      } as Change,
    });

    mocks.fireSignalAndRefresh
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Temporal unreachable"));

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "report_follow_up",
        source_report_key: reportKey(report),
        relationship: "follows_release",
        kind: "backfill",
        summary: "Backfill prod data",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.partial_link).toBe(true);
    expect(parsed.code).toBe("PARTIAL_LINK");
    expect(parsed.child_change_id).toBe("addOpsFollowup");
    expect(parsed.link).toBeDefined();
    expect(parsed.repair_action).toContain("opsFollowupLinkAddedSignal");
  });

  test("dryRun returns preview without creating changes or firing signals", async () => {
    const report = makeReport();
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        subagent_reports: [report],
      } as Change,
    });

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "report_follow_up",
        source_report_key: reportKey(report),
        relationship: "follows_release",
        kind: "backfill",
        summary: "Backfill prod data",
        dryRun: true,
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.source_identity).toContain("sourceChange");
    expect(store.changes.create).not.toHaveBeenCalled();
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects missing required args", async () => {
    const store = makeStore();

    const output = await followupTools.adv_followup_promote.execute(
      {
        source_change_id: "sourceChange",
        source_kind: "manual",
        relationship: "blocks",
        kind: "migration",
        summary: "",
      },
      store,
    );
    const parsed = parseToolOutput(output);

    expect(parsed.error).toBeDefined();
    expect(store.changes.create).not.toHaveBeenCalled();
  });
});
