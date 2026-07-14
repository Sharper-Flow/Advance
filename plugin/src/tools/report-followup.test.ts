import { beforeEach, describe, expect, test, vi } from "vitest";
import { reportFollowupTools } from "./report-followup";
import { parseToolOutput } from "../__tests__/setup";
import {
  reportFollowUpId,
  reportKeyFromReport,
  enumerateReportFollowUps,
  resolveReportFollowUpByRef,
  ReportFollowUpRefSchema,
  subagentReportKey,
} from "../types/subagent-reports";
import { TaskSchema } from "../types/tasks";
import { FastFollowOfSchema } from "../types/changes";
import { taskAddedSignal } from "../temporal/messages";
import type { Store } from "../storage/store-types";
import type { Change, ScopedSubagentReport } from "../types";

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
        store: {} as Store,
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
  follow_ups?: string[];
  required_follow_ups?: Array<{
    text: string;
    obligation_class: string;
    severity: string;
    source_contract_id?: string;
  }>;
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
    follow_ups: overrides?.follow_ups ?? [],
    ...(overrides?.required_follow_ups
      ? { required_follow_ups: overrides.required_follow_ups }
      : {}),
    required_main_agent_actions: [],
    related_scan: "none",
    context_update_for_adv: {
      what_ads_needs_to_know: "test",
      suggested_next_action: "test",
    },
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
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
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
        changeId: "fastFollowChild",
        path: "/tmp/source/.adv/changes/fastFollowChild/proposal.md",
      })),
    } as unknown as Store["changes"],
    tasks: {} as Store["tasks"],
    gates: {} as Store["gates"],
    wisdom: {} as Store["wisdom"],
    agenda: {} as Store["agenda"],
  } as Store;
}

describe("reportFollowUpId", () => {
  test("returns deterministic ID from report key + kind + index", () => {
    const id1 = reportFollowUpId({
      report_key: "change|task:tk-1|adv-engineer|1",
      kind: "follow_ups",
      index: 0,
    });
    const id2 = reportFollowUpId({
      report_key: "change|task:tk-1|adv-engineer|1",
      kind: "follow_ups",
      index: 0,
    });
    expect(id1).toBe(id2);
    expect(id1).toContain("rfu:");
    expect(id1).toContain("follow_ups");
    expect(id1).toContain("0");
  });

  test("different indices produce different IDs", () => {
    const id0 = reportFollowUpId({
      report_key: "change|task:tk-1|adv-engineer|1",
      kind: "follow_ups",
      index: 0,
    });
    const id1 = reportFollowUpId({
      report_key: "change|task:tk-1|adv-engineer|1",
      kind: "follow_ups",
      index: 1,
    });
    expect(id0).not.toBe(id1);
  });

  test("different kinds produce different IDs", () => {
    const idOrdinary = reportFollowUpId({
      report_key: "change|task:tk-1|adv-engineer|1",
      kind: "follow_ups",
      index: 0,
    });
    const idRequired = reportFollowUpId({
      report_key: "change|task:tk-1|adv-engineer|1",
      kind: "required_follow_ups",
      index: 0,
    });
    expect(idOrdinary).not.toBe(idRequired);
  });
});

describe("reportKeyFromReport", () => {
  test("returns stable key matching subagentReportKey", () => {
    const report = makeReport();
    const key = reportKeyFromReport(report);
    expect(key).toBe(reportKey(report));
  });
});

describe("enumerateReportFollowUps", () => {
  test("enumerates ordinary follow_ups with typed refs", () => {
    const report = makeReport({ follow_ups: ["Add docs", "Update examples"] });
    const items = enumerateReportFollowUps(report);
    expect(items).toHaveLength(2);
    expect(items[0].ref.kind).toBe("follow_ups");
    expect(items[0].ref.index).toBe(0);
    expect(items[0].required).toBe(false);
    expect(items[0].text).toBe("Add docs");
    expect(items[1].ref.index).toBe(1);
    expect(items[1].text).toBe("Update examples");
  });

  test("enumerates required_follow_ups with typed refs", () => {
    const report = makeReport({
      required_follow_ups: [
        {
          text: "Backfill prod",
          obligation_class: "required_standard",
          severity: "high",
          source_contract_id: "AC-1",
        },
      ],
    });
    const items = enumerateReportFollowUps(report);
    expect(items).toHaveLength(1);
    expect(items[0].ref.kind).toBe("required_follow_ups");
    expect(items[0].ref.index).toBe(0);
    expect(items[0].required).toBe(true);
    expect(items[0].text).toBe("Backfill prod");
  });

  test("enumerates both kinds together", () => {
    const report = makeReport({
      follow_ups: ["Add docs"],
      required_follow_ups: [
        {
          text: "Backfill prod",
          obligation_class: "required_standard",
          severity: "high",
        },
      ],
    });
    const items = enumerateReportFollowUps(report);
    expect(items).toHaveLength(2);
    expect(items.filter((i) => i.required)).toHaveLength(1);
    expect(items.filter((i) => !i.required)).toHaveLength(1);
  });
});

describe("resolveReportFollowUpByRef", () => {
  test("resolves ordinary follow_up by ref", () => {
    const report = makeReport({ follow_ups: ["Add docs"] });
    const key = reportKeyFromReport(report);
    const resolved = resolveReportFollowUpByRef(report, {
      report_key: key,
      kind: "follow_ups",
      index: 0,
    });
    expect(resolved).toEqual({ text: "Add docs", required: false });
  });

  test("resolves required follow_up by ref", () => {
    const report = makeReport({
      required_follow_ups: [
        {
          text: "Backfill prod",
          obligation_class: "required_standard",
          severity: "high",
        },
      ],
    });
    const key = reportKeyFromReport(report);
    const resolved = resolveReportFollowUpByRef(report, {
      report_key: key,
      kind: "required_follow_ups",
      index: 0,
    });
    expect(resolved).toEqual({ text: "Backfill prod", required: true });
  });

  test("returns undefined for out-of-bounds index", () => {
    const report = makeReport({ follow_ups: ["Add docs"] });
    const key = reportKeyFromReport(report);
    const resolved = resolveReportFollowUpByRef(report, {
      report_key: key,
      kind: "follow_ups",
      index: 99,
    });
    expect(resolved).toBeUndefined();
  });

  test("returns undefined for mismatched report key", () => {
    const report = makeReport({ follow_ups: ["Add docs"] });
    const resolved = resolveReportFollowUpByRef(report, {
      report_key: "other|report|key",
      kind: "follow_ups",
      index: 0,
    });
    expect(resolved).toBeUndefined();
  });
});

describe("ReportFollowUpRefSchema", () => {
  test("parses valid ref", () => {
    const ref = ReportFollowUpRefSchema.parse({
      report_key: "change|task:tk-1|adv-engineer|1",
      kind: "follow_ups",
      index: 0,
    });
    expect(ref.report_key).toBe("change|task:tk-1|adv-engineer|1");
    expect(ref.kind).toBe("follow_ups");
    expect(ref.index).toBe(0);
  });

  test("rejects invalid kind", () => {
    expect(() =>
      ReportFollowUpRefSchema.parse({
        report_key: "key",
        kind: "invalid",
        index: 0,
      }),
    ).toThrow();
  });

  test("rejects negative index", () => {
    expect(() =>
      ReportFollowUpRefSchema.parse({
        report_key: "key",
        kind: "follow_ups",
        index: -1,
      }),
    ).toThrow();
  });
});

describe("TaskSchema followup_ref", () => {
  test("parses task with followup_ref", () => {
    const task = TaskSchema.parse({
      id: "tk-1",
      title: "Test task",
      type: "code",
      status: "pending",
      priority: 0,
      created_at: "2026-06-20T04:00:00.000Z",
      followup_ref: {
        report_key: "change|task:tk-1|adv-engineer|1",
        kind: "follow_ups",
        index: 0,
      },
    });
    expect(task.followup_ref).toBeDefined();
    expect(task.followup_ref?.kind).toBe("follow_ups");
  });

  test("legacy task without followup_ref parses fine", () => {
    const task = TaskSchema.parse({
      id: "tk-1",
      title: "Test task",
      type: "code",
      status: "pending",
      priority: 0,
      created_at: "2026-06-20T04:00:00.000Z",
    });
    expect(task.followup_ref).toBeUndefined();
  });
});

describe("FastFollowOfSchema followup_ref", () => {
  test("parses fast-follow with followup_ref", () => {
    const ff = FastFollowOfSchema.parse({
      parent_change_id: "parent-1",
      linked_at: "2026-06-20T04:00:00.000Z",
      followup_ref: {
        report_key: "change|task:tk-1|adv-engineer|1",
        kind: "required_follow_ups",
        index: 0,
      },
    });
    expect(ff.followup_ref).toBeDefined();
    expect(ff.followup_ref?.kind).toBe("required_follow_ups");
  });

  test("legacy fast-follow without followup_ref parses fine", () => {
    const ff = FastFollowOfSchema.parse({
      parent_change_id: "parent-1",
      linked_at: "2026-06-20T04:00:00.000Z",
    });
    expect(ff.followup_ref).toBeUndefined();
  });
});

describe("adv_report_followup_promote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("pre-planning creates task with followup_ref", async () => {
    const report = makeReport({ follow_ups: ["Add docs"] });
    const key = reportKey(report);
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        subagent_reports: [report],
      } as Change,
    });

    const output =
      await reportFollowupTools.adv_report_followup_promote.execute(
        {
          source_change_id: "sourceChange",
          source_report_key: key,
          follow_up_kind: "follow_ups",
          follow_up_index: 0,
          summary: "Add documentation",
          type: "docs",
        },
        store,
      );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.routing).toBe("pre_planning_task");
    expect(parsed.followup_ref).toMatchObject({
      report_key: key,
      kind: "follow_ups",
      index: 0,
    });
    expect(parsed.task_id).toMatch(/^tk-/);
    expect(parsed.task.followup_ref).toMatchObject({
      report_key: key,
      kind: "follow_ups",
      index: 0,
    });
    expect(parsed.task.metadata.followup_ref).toBeDefined();

    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    const call = mocks.fireSignalAndRefresh.mock.calls[0];
    expect(call[3]).toBe(taskAddedSignal);
    expect(call[4].task.followup_ref).toMatchObject({
      report_key: key,
      kind: "follow_ups",
      index: 0,
    });
  });

  test("post-planning creates fast-follow child with followup_ref", async () => {
    const report = makeReport({ follow_ups: ["Add docs"] });
    const key = reportKey(report);
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        subagent_reports: [report],
      } as Change,
    });

    const output =
      await reportFollowupTools.adv_report_followup_promote.execute(
        {
          source_change_id: "sourceChange",
          source_report_key: key,
          follow_up_kind: "follow_ups",
          follow_up_index: 0,
          summary: "Add documentation",
          capability: "docs",
        },
        store,
      );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.routing).toBe("post_planning_fast_follow");
    expect(parsed.child_change_id).toBe("fastFollowChild");
    expect(parsed.followup_ref).toMatchObject({
      report_key: key,
      kind: "follow_ups",
      index: 0,
    });

    expect(store.changes.create).toHaveBeenCalledWith(
      "Add documentation",
      expect.objectContaining({
        initialMetadata: {
          fast_follow_of: expect.objectContaining({
            parent_change_id: "sourceChange",
            followup_ref: expect.objectContaining({
              report_key: key,
              kind: "follow_ups",
              index: 0,
            }),
          }),
        },
      }),
    );
  });

  test("explicit routing override forces pre-planning task", async () => {
    const report = makeReport({ follow_ups: ["Add docs"] });
    const key = reportKey(report);
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "done" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        subagent_reports: [report],
      } as Change,
    });

    const output =
      await reportFollowupTools.adv_report_followup_promote.execute(
        {
          source_change_id: "sourceChange",
          source_report_key: key,
          follow_up_kind: "follow_ups",
          follow_up_index: 0,
          summary: "Add documentation",
          routing: "pre_planning_task",
        },
        store,
      );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.routing).toBe("pre_planning_task");
    expect(parsed.task_id).toBeDefined();
  });

  test("required_follow_ups promote with required flag", async () => {
    const report = makeReport({
      required_follow_ups: [
        {
          text: "Backfill prod",
          obligation_class: "required_standard",
          severity: "high",
          source_contract_id: "AC-1",
        },
      ],
    });
    const key = reportKey(report);
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        subagent_reports: [report],
      } as Change,
    });

    const output =
      await reportFollowupTools.adv_report_followup_promote.execute(
        {
          source_change_id: "sourceChange",
          source_report_key: key,
          follow_up_kind: "required_follow_ups",
          follow_up_index: 0,
          summary: "Backfill prod data",
        },
        store,
      );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.followup_ref.kind).toBe("required_follow_ups");
  });

  test("rejects unknown report key", async () => {
    const store = makeStore();

    const output =
      await reportFollowupTools.adv_report_followup_promote.execute(
        {
          source_change_id: "sourceChange",
          source_report_key: "missing-report",
          follow_up_kind: "follow_ups",
          follow_up_index: 0,
          summary: "Add docs",
        },
        store,
      );
    const parsed = parseToolOutput(output);

    expect(parsed.error).toContain("Report not found");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects out-of-bounds follow-up index", async () => {
    const report = makeReport({ follow_ups: ["Add docs"] });
    const key = reportKey(report);
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

    const output =
      await reportFollowupTools.adv_report_followup_promote.execute(
        {
          source_change_id: "sourceChange",
          source_report_key: key,
          follow_up_kind: "follow_ups",
          follow_up_index: 99,
          summary: "Add docs",
        },
        store,
      );
    const parsed = parseToolOutput(output);

    expect(parsed.error).toContain("Follow-up not found");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("dryRun returns preview without creating", async () => {
    const report = makeReport({ follow_ups: ["Add docs"] });
    const key = reportKey(report);
    const store = makeStore({
      sourceChange: {
        id: "sourceChange",
        title: "Source change",
        status: "active",
        created_at: "2026-06-20T04:00:00.000Z",
        tasks: [],
        deltas: {},
        gates: {
          proposal: { status: "done" },
          discovery: { status: "done" },
          design: { status: "done" },
          planning: { status: "pending" },
          execution: { status: "pending" },
          acceptance: { status: "pending" },
          release: { status: "pending" },
        },
        subagent_reports: [report],
      } as Change,
    });

    const output =
      await reportFollowupTools.adv_report_followup_promote.execute(
        {
          source_change_id: "sourceChange",
          source_report_key: key,
          follow_up_kind: "follow_ups",
          follow_up_index: 0,
          summary: "Add docs",
          dryRun: true,
        },
        store,
      );
    const parsed = parseToolOutput(output);

    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.routing).toBe("pre_planning_task");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects blank summary", async () => {
    const store = makeStore();

    const output =
      await reportFollowupTools.adv_report_followup_promote.execute(
        {
          source_change_id: "sourceChange",
          source_report_key: "key",
          follow_up_kind: "follow_ups",
          follow_up_index: 0,
          summary: "",
        },
        store,
      );
    const parsed = parseToolOutput(output);

    expect(parsed.error).toContain("summary");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects target_path because fast-follow children are same-project only", async () => {
    const store = makeStore();

    const output =
      await reportFollowupTools.adv_report_followup_promote.execute(
        {
          source_change_id: "sourceChange",
          source_report_key: "key",
          follow_up_kind: "follow_ups",
          follow_up_index: 0,
          summary: "Add docs",
          target_path: "/tmp/other-project",
          target_confirmed: true,
          confirmationEvidence: "user approved",
        },
        store,
      );
    const parsed = parseToolOutput(output);

    expect(parsed.error).toBeDefined();
    expect(parsed.error).toMatch(/same-project|cross-project/i);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });
});
