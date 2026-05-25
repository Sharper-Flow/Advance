import { beforeEach, describe, expect, test, vi } from "vitest";
import { SubagentConsumerWarningSchema } from "../types";
import type { Change, EngineerSubagentReport } from "../types";
import type { Store } from "../storage/store-types";
import {
  subagentReportSubmittedSignal,
  taskUpdatedSignal,
} from "../temporal/messages";

const mocks = vi.hoisted(() => {
  const fireSignalAndRefresh = vi.fn(async () => undefined);
  const workflowHandle = { signal: vi.fn(), query: vi.fn() };
  const addAgendaItem = vi.fn(async (_root: string, title: string) => ({
    id: `ag-${title.length}`,
    title,
    status: "pending",
  }));
  const withTargetPathStore = vi.fn(async (_input, fn) =>
    fn({
      context: {
        root: "/target",
        projectId: "target-project",
        externalRoot: "/target-state",
        trusted: true,
        trustSource: "explicit",
        stateMode: "temporal",
      },
      store: undefined,
    }),
  );

  return {
    fireSignalAndRefresh,
    workflowHandle,
    addAgendaItem,
    withTargetPathStore,
  };
});

vi.mock("./_adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_adapters")>()),
  fireSignalAndRefresh: mocks.fireSignalAndRefresh,
  getChangeHandle: () => mocks.workflowHandle,
}));

vi.mock("../temporal/service", () => ({
  getService: () => ({ client: { workflow: { getHandle: vi.fn() } } }),
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: async () => "project-1",
}));

vi.mock("../storage/agenda", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../storage/agenda")>()),
  addAgendaItem: mocks.addAgendaItem,
}));

vi.mock("./target-project", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./target-project")>()),
  withTargetPathStore: mocks.withTargetPathStore,
}));

import { subagentReportTools } from "./subagent-report";

function parse(output: string): Record<string, any> {
  return JSON.parse(output) as Record<string, any>;
}

function engineerReport(
  overrides: Partial<EngineerSubagentReport> = {},
): EngineerSubagentReport {
  return {
    schema_version: "1.0",
    change_id: "change-1",
    task_id: "tk-1",
    attempt: 1,
    agent: "adv-engineer",
    status: "complete",
    scope: "Implement feature",
    workdir_used: "/repo",
    files_touched: ["src/a.ts"],
    verification: [{ command: "pnpm test", exit_code: 0, summary: "passed" }],
    decisions: [{ what: "Used typed tool", why: "Durable state" }],
    blockers: [],
    follow_ups: ["Add docs", "Add examples"],
    related_scan: "No same-pattern issues",
    context_update_for_adv: {
      what_ads_needs_to_know: "Report submitted",
      suggested_next_action: "Continue",
    },
    ...overrides,
  };
}

function change(overrides: Partial<Change> = {}): Change {
  return {
    id: "change-1",
    title: "Change one",
    status: "active",
    created_at: "2026-05-23T00:00:00.000Z",
    created_by: "test",
    tasks: [
      {
        id: "tk-1",
        title: "Task one",
        status: "in_progress",
        priority: 1,
        created_at: "2026-05-23T00:00:00.000Z",
      },
    ],
    deltas: {},
    wisdom: [],
    gates: {} as Change["gates"],
    ...overrides,
  } as Change;
}

function storeFor(baseChange: Change): Store {
  return {
    paths: {
      root: "/repo",
      agenda: "/state/agenda.jsonl",
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    changes: {
      get: vi.fn(async () => ({ success: true, data: baseChange })),
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as Store;
}

describe("subagentReportTools", () => {
  beforeEach(() => {
    mocks.fireSignalAndRefresh.mockClear();
    mocks.addAgendaItem.mockClear();
    mocks.withTargetPathStore.mockClear();
  });

  test("adv_subagent_report_submit validates, signals, and consumes follow-ups", async () => {
    const store = storeFor(change());
    const report = engineerReport();

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.reportId).toBe("change-1|tk-1|adv-engineer|1");
    expect(output.duplicate).toBe(false);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
      mocks.workflowHandle,
      store,
      "change-1",
      subagentReportSubmittedSignal,
      expect.objectContaining({
        taskId: "tk-1",
        report: expect.objectContaining({
          agent: "adv-engineer",
          task_id: "tk-1",
          consumer_warnings: expect.arrayContaining([
            expect.objectContaining({ kind: "verification_missing" }),
          ]),
        }),
      }),
    );
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(2);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Add docs",
      expect.objectContaining({
        category: "subagent-followup",
        agendaPath: "/state/agenda.jsonl",
      }),
    );
    expect(mocks.fireSignalAndRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addAgendaItem.mock.invocationCallOrder[0],
    );
  });

  test("dryRun validates and previews without signal or agenda writes", async () => {
    const store = storeFor(change());

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: engineerReport(), dryRun: true },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.dryRun).toBe(true);
    expect(output.consumerResults.followUps.previewCount).toBe(2);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    expect(mocks.addAgendaItem).not.toHaveBeenCalled();
  });

  test("dedupes repeated report keys from existing task reports", async () => {
    const report = engineerReport();
    const store = storeFor(
      change({
        tasks: [
          {
            id: "tk-1",
            title: "Task one",
            status: "in_progress",
            priority: 1,
            created_at: "2026-05-23T00:00:00.000Z",
            subagent_reports: [report],
          },
        ],
      }),
    );

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.duplicate).toBe(true);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    expect(mocks.addAgendaItem).not.toHaveBeenCalled();
  });

  test("rejects reserved unsupported agents before signaling", async () => {
    const store = storeFor(change());

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        {
          report: {
            schema_version: "1.0",
            change_id: "change-1",
            task_id: "tk-1",
            attempt: 1,
            agent: "adv-researcher",
            scope: "Research",
            workdir_used: "/repo",
          },
        },
        store,
      ),
    );

    expect(output.error).toContain("Unsupported sub-agent report type");
    expect(output.code).toBe("UNSUPPORTED_AGENT");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("rejects malformed reports at the Zod boundary and records task error_recovery", async () => {
    const store = storeFor(change());

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        {
          report: {
            schema_version: "1.0",
            change_id: "change-1",
            task_id: "tk-1",
            attempt: 1,
            agent: "adv-engineer",
          },
        },
        store,
      ),
    );

    expect(output.error).toBe("Invalid sub-agent report payload");
    expect(output.code).toBe("INVALID_REPORT");
    expect(output.failureRecord).toEqual({ recorded: true });
    expect(output.details).toEqual(expect.any(Array));
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
      mocks.workflowHandle,
      store,
      "change-1",
      taskUpdatedSignal,
      expect.objectContaining({
        taskId: "tk-1",
        partial: {
          error_recovery: expect.objectContaining({
            last_error: "Invalid sub-agent report payload",
            error_class: "SEMANTIC",
            attempts: expect.arrayContaining([
              expect.objectContaining({
                diagnosis: "INVALID_REPORT",
                strategy_label: "adv-engineer-report-submit-failure",
              }),
            ]),
          }),
        },
      }),
    );
    expect(mocks.addAgendaItem).not.toHaveBeenCalled();
  });

  test("rejects malformed caller-supplied consumer_warnings before signaling", async () => {
    const store = storeFor(change());

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        {
          report: {
            ...engineerReport(),
            consumer_warnings: [{ kind: "not_a_warning", message: "bad" }],
          },
        },
        store,
      ),
    );

    expect(output.error).toBe("Invalid sub-agent report payload");
    expect(output.code).toBe("INVALID_REPORT");
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalledWith(
      mocks.workflowHandle,
      store,
      "change-1",
      subagentReportSubmittedSignal,
      expect.anything(),
    );
  });

  test("consumer warnings emitted by tool consumers keep schema shape", async () => {
    const store = storeFor(change());
    mocks.addAgendaItem.mockRejectedValueOnce(new Error("agenda down"));

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: engineerReport() },
        store,
      ),
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    const warnings = [
      ...(signalPayload.report.consumer_warnings ?? []),
      ...output.consumerResults.verification.warnings,
    ];

    expect(warnings.length).toBeGreaterThan(0);
    for (const warning of warnings) {
      expect(SubagentConsumerWarningSchema.safeParse(warning).success).toBe(
        true,
      );
    }
    expect(output.consumerResults.verification.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "consumer_failure",
          message: expect.stringContaining("agenda down"),
        }),
      ]),
    );
  });

  test("records task error_recovery when report persistence signal fails", async () => {
    const store = storeFor(change());
    mocks.fireSignalAndRefresh
      .mockRejectedValueOnce(new Error("Temporal signal failed"))
      .mockResolvedValueOnce(undefined);

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: engineerReport() },
        store,
      ),
    );

    expect(output.error).toBe("Temporal signal failed");
    expect(output.code).toBe("SUBMIT_SIGNAL_FAILED");
    expect(output.failureRecord).toEqual({ recorded: true });
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(2);
    expect(mocks.fireSignalAndRefresh.mock.calls[0][3]).toBe(
      subagentReportSubmittedSignal,
    );
    expect(mocks.fireSignalAndRefresh.mock.calls[1]).toEqual([
      mocks.workflowHandle,
      store,
      "change-1",
      taskUpdatedSignal,
      expect.objectContaining({
        taskId: "tk-1",
        partial: {
          error_recovery: expect.objectContaining({
            last_error: "Temporal signal failed",
            attempts: expect.arrayContaining([
              expect.objectContaining({ diagnosis: "SUBMIT_SIGNAL_FAILED" }),
            ]),
          }),
        },
      }),
    ]);
    expect(mocks.addAgendaItem).not.toHaveBeenCalled();
  });

  test("routes target_path mutations through target store", async () => {
    const targetStore = storeFor(change());
    mocks.withTargetPathStore.mockImplementationOnce(async (_input, fn) =>
      fn({
        context: {
          root: "/target",
          projectId: "target-project",
          externalRoot: "/target-state",
          trusted: true,
          trustSource: "explicit",
          stateMode: "temporal",
        },
        store: targetStore,
      }),
    );

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        {
          report: engineerReport(),
          target_path: "/target",
          target_confirmed: true,
          confirmationEvidence: "test approval",
        },
        storeFor(change()),
      ),
    );

    expect(output.success).toBe(true);
    expect(output._projectContext).toMatchObject({ root: "/target" });
    expect(mocks.withTargetPathStore).toHaveBeenCalledWith(
      expect.objectContaining({
        target_path: "/target",
        stateRequirement: "temporal-required",
      }),
      expect.any(Function),
    );
    expect(mocks.fireSignalAndRefresh.mock.calls[0][1]).toBe(targetStore);
  });
});
