import { beforeEach, describe, expect, test, vi } from "vitest";
import { SubagentConsumerWarningSchema } from "../types";
import type {
  ChangeScopedReviewerSubagentReport,
  Change,
  EngineerSubagentReport,
  ResearcherSubagentReport,
  ScannerBundleSubagentReport,
} from "../types";
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
  const loadAgenda = vi.fn(async () => ({ meta: null, items: [] }));
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
    loadAgenda,
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
  loadAgenda: mocks.loadAgenda,
}));

vi.mock("./target-project", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./target-project")>()),
  withTargetPathStore: mocks.withTargetPathStore,
}));

import { subagentReportTools } from "./subagent-report";

function parse(output: string): Record<string, any> {
  return JSON.parse(output) as Record<string, any>;
}

describe("consumeDesignerDesignConcerns — rq-designQualityEvidence01 (advisory promotion)", () => {
  beforeEach(() => {
    mocks.fireSignalAndRefresh.mockClear();
    mocks.addAgendaItem.mockClear();
    mocks.loadAgenda.mockClear();
    mocks.loadAgenda.mockResolvedValue({ meta: null, items: [] });
  });

  test("promotes a design_dimensions concern to a required-obligation agenda item", async () => {
    const store = storeFor(change());
    const report = designerReport({
      dimensions: { site_design_consistency: "concern" },
      notes: "Does not match the page family.",
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      expect.stringContaining("site_design_consistency"),
      expect.objectContaining({
        category: "required-obligation",
        agendaPath: "/state/agenda.jsonl",
        description: expect.stringContaining(
          "design-concern:change-1:tk-1:dimension:site_design_consistency",
        ),
      }),
    );
    expect(output.consumerResults.designConcerns.previewCount).toBe(1);
    expect(output.consumerResults.verification.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "design_concern_promoted" }),
      ]),
    );
  });

  test("promotes each neighboring_recommendation", async () => {
    const store = storeFor(change());
    const report = designerReport({
      neighbors: [
        { what: "IconButton lacks focus ring", why: "adjacent inconsistency" },
      ],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      expect.stringContaining("IconButton lacks focus ring"),
      expect.objectContaining({
        category: "required-obligation",
        description: expect.stringContaining(
          "design-concern:change-1:tk-1:neighbor:0",
        ),
      }),
    );
  });

  test("all-pass designer report with no neighbors promotes nothing", async () => {
    const store = storeFor(change());
    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: designerReport() },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).not.toHaveBeenCalled();
    expect(output.consumerResults.designConcerns.previewCount).toBe(0);
  });

  test("dedupes against an existing agenda item with the same dedupe-key", async () => {
    mocks.loadAgenda.mockResolvedValue({
      meta: null,
      items: [
        {
          id: "ag-existing",
          title: "Resolve design concern",
          status: "pending",
          created_at: "2026-06-25T00:00:00.000Z",
          description:
            "design-concern:change-1:tk-1:dimension:site_design_consistency",
        },
      ],
    });
    const store = storeFor(change());
    const report = designerReport({
      dimensions: { site_design_consistency: "concern" },
      notes: "concern",
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).not.toHaveBeenCalled();
  });

  test("dryRun previews concerns without writing agenda items", async () => {
    const store = storeFor(change());
    const report = designerReport({
      dimensions: { visual_polish: "concern" },
      notes: "spacing",
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report, dryRun: true },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).not.toHaveBeenCalled();
    expect(output.consumerResults.designConcerns.previewCount).toBe(1);
  });
});

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
    scope: { kind: "task", task_id: "tk-1" },
    workdir_used: "/repo",
    files_touched: ["src/a.ts"],
    verification: [{ command: "pnpm test", exit_code: 0, summary: "passed" }],
    decisions: [{ what: "Used typed tool", why: "Durable state" }],
    blockers: [],
    scope_drift: null,
    follow_ups: ["Add docs", "Add examples"],
    required_main_agent_actions: [],
    related_scan: "No same-pattern issues",
    context_update_for_adv: {
      what_ads_needs_to_know: "Report submitted",
      suggested_next_action: "Continue",
    },
    ...overrides,
  };
}

function researcherReport(
  overrides: Partial<ResearcherSubagentReport> = {},
): ResearcherSubagentReport {
  return {
    schema_version: "1.0",
    change_id: "change-1",
    attempt: 1,
    agent: "adv-researcher",
    scope: { kind: "change", scope_key: "researcher:temporal-docs" },
    workdir_used: "/repo",
    topic: "Temporal docs",
    sources: [
      {
        label: "Temporal docs",
        locator: "https://docs.temporal.io/",
        summary: "Signals persist deterministic workflow state.",
      },
    ],
    architecture_assessment: "Sidecar reports keep task reads compact.",
    validation: { status: "pass", blockers: [], notes: "ok" },
    recommendation: "Persist change-scoped report.",
    follow_ups: ["Review sidecar readback"],
    ...overrides,
  };
}

function reviewerReport(
  overrides: Partial<ChangeScopedReviewerSubagentReport> = {},
): ChangeScopedReviewerSubagentReport {
  const report: ChangeScopedReviewerSubagentReport = {
    schema_version: "1.0",
    change_id: "change-1",
    attempt: 1,
    agent: "adv-reviewer",
    scope: { kind: "change", scope_key: "review:acceptance" },
    workdir_used: "/repo",
    phase: "review",
    verdict: "READY",
    blocking_findings: [],
    nonblocking_findings: [],
    changes_made: [],
    wisdom_candidates: [],
    verification: {
      tests_run: ["pnpm test"],
      results: "pass",
      evidence: "exit code 0",
    },
    scope_drift: null,
    risks: [],
    required_main_agent_actions: [],
    ...overrides,
  };
  return report;
}

function scannerBundleReport(
  overrides: Partial<ScannerBundleSubagentReport> = {},
): ScannerBundleSubagentReport {
  return {
    schema_version: "1.0",
    change_id: "change-1",
    attempt: 1,
    agent: "adv-scanner-bundle",
    scope: { kind: "change", scope_key: "scanner-bundle:review" },
    workdir_used: "/repo",
    phase: "review",
    scanner_count: 2,
    dimensions: ["contracts", "tests"],
    summary: "Orchestrator synthesized scanner bundle.",
    findings: [],
    follow_ups: [],
    ...overrides,
  };
}

function designerReport(
  overrides: {
    attempt?: number;
    taskId?: string;
    dimensions?: Partial<
      Record<
        | "component_correctness"
        | "semantic_html_a11y"
        | "responsive_behavior"
        | "visual_polish"
        | "site_design_consistency"
        | "finer_details",
        "pass" | "concern" | "n/a"
      >
    >;
    neighbors?: { what: string; why: string }[];
    notes?: string;
  } = {},
) {
  const taskId = overrides.taskId ?? "tk-1";
  return {
    schema_version: "1.0" as const,
    change_id: "change-1",
    task_id: taskId,
    scope: { kind: "task" as const, task_id: taskId },
    attempt: overrides.attempt ?? 1,
    agent: "adv-designer" as const,
    status: "complete" as const,
    workdir_used: "/repo",
    files_touched: ["src/components/Button.tsx"],
    verification: [{ command: "pnpm test", exit_code: 0, summary: "passed" }],
    decisions: [],
    blockers: [],
    scope_drift: null,
    follow_ups: [],
    required_main_agent_actions: [],
    related_scan: "none",
    context_update_for_adv: {
      what_ads_needs_to_know: "x",
      suggested_next_action: "y",
    },
    design_dimensions: {
      component_correctness: "pass" as const,
      semantic_html_a11y: "pass" as const,
      responsive_behavior: "pass" as const,
      visual_polish: "pass" as const,
      site_design_consistency: "pass" as const,
      finer_details: "pass" as const,
      ...overrides.dimensions,
      ...(overrides.notes ? { notes: overrides.notes } : {}),
    },
    neighboring_recommendations: (overrides.neighbors ?? []).map((n) => ({
      what: n.what,
      why: n.why,
    })),
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
    mocks.loadAgenda.mockClear();
    mocks.loadAgenda.mockResolvedValue({ meta: null, items: [] });
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
        description: expect.stringContaining(
          "change-1/task:tk-1/adv-engineer/attempt-1/task-tk-1",
        ),
        agendaPath: "/state/agenda.jsonl",
      }),
    );
    expect(mocks.fireSignalAndRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addAgendaItem.mock.invocationCallOrder[0],
    );
  });

  test("structured adv_run_test evidence satisfies engineer verification", async () => {
    const task = {
      id: "tk-1",
      title: "Task one",
      status: "in_progress",
      priority: 1,
      created_at: "2026-05-23T00:00:00.000Z",
      verification: [
        "legacy exitCode 1 for another command",
        JSON.stringify({
          evidence: {
            schema_version: "adv_run_test.v1",
            command: "pnpm test",
            exitCode: 0,
            passed: true,
            classification: "passed",
            durationMs: 12,
          },
        }),
      ].join("\n"),
    } as Change["tasks"][number];
    const store = storeFor(change({ tasks: [task] }));

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: engineerReport({ follow_ups: [] }) },
        store,
      ),
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    const warnings = signalPayload.report.consumer_warnings ?? [];

    expect(output.success).toBe(true);
    expect(warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "verification_missing" }),
      ]),
    );
    expect(warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "verification_mismatch" }),
      ]),
    );
  });

  test("structured adv_run_test evidence mismatch is command-specific", async () => {
    const task = {
      id: "tk-1",
      title: "Task one",
      status: "in_progress",
      priority: 1,
      created_at: "2026-05-23T00:00:00.000Z",
      verification: [
        JSON.stringify({
          evidence: {
            schema_version: "adv_run_test.v1",
            command: "pnpm test",
            exitCode: 1,
            passed: false,
            classification: "failed",
            durationMs: 12,
          },
        }),
        "legacy exitCode 0 for another command",
      ].join("\n"),
    } as Change["tasks"][number];
    const store = storeFor(change({ tasks: [task] }));

    await subagentReportTools.adv_subagent_report_submit.execute(
      { report: engineerReport({ follow_ups: [] }) },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };

    expect(signalPayload.report.consumer_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "verification_mismatch",
          message: expect.stringContaining("adv_run_test.v1"),
        }),
      ]),
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

  test("dedupes repeated report keys from existing sidecar reports", async () => {
    const report = researcherReport();
    const store = storeFor(
      change({
        subagent_reports: [report],
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

  test("accepts change-scoped researcher reports before signaling", async () => {
    const store = storeFor(change());
    const report = researcherReport();

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.reportId).toBe(
      "change-1|change:researcher:temporal-docs|adv-researcher|1",
    );
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
      mocks.workflowHandle,
      store,
      "change-1",
      subagentReportSubmittedSignal,
      expect.objectContaining({
        report: expect.objectContaining({ agent: "adv-researcher" }),
      }),
    );
    expect(mocks.fireSignalAndRefresh.mock.calls[0][4]).not.toHaveProperty(
      "taskId",
    );
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Review sidecar readback",
      expect.objectContaining({
        category: "subagent-followup",
        description: expect.stringContaining(
          "change-1/change:researcher:temporal-docs/adv-researcher/attempt-1",
        ),
      }),
    );
  });

  test("accepts change-scoped independent reviewer reports before signaling", async () => {
    const store = storeFor(change());
    const report = reviewerReport();

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.reportId).toBe(
      "change-1|change:review:acceptance|adv-reviewer|1",
    );
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
      mocks.workflowHandle,
      store,
      "change-1",
      subagentReportSubmittedSignal,
      expect.objectContaining({
        report: expect.objectContaining({ agent: "adv-reviewer" }),
      }),
    );
    expect(mocks.fireSignalAndRefresh.mock.calls[0][4]).not.toHaveProperty(
      "taskId",
    );
  });

  test("invalid task anchors return typed actionable diagnostics without signaling", async () => {
    const store = storeFor(change());

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        {
          report: engineerReport({
            task_id: "tk-missing",
            scope: { kind: "task", task_id: "tk-missing" },
          }),
        },
        store,
      ),
    );

    expect(output.success).toBe(false);
    expect(output.code).toBe("INVALID_TASK_ANCHOR");
    expect(output.changeId).toBe("change-1");
    expect(output.taskId).toBe("tk-missing");
    expect(output.validTaskAnchors).toEqual([
      { id: "tk-1", title: "Task one" },
    ]);
    expect(output.guidance).toEqual(
      expect.stringContaining("change-scoped reviewer"),
    );
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    expect(mocks.addAgendaItem).not.toHaveBeenCalled();
  });

  test("bounds scanner bundle follow-up agenda creation", async () => {
    const store = storeFor(change());
    const followUps = Array.from(
      { length: 12 },
      (_, index) => `Follow ${index}`,
    );

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        {
          report: scannerBundleReport({ follow_ups: followUps }),
        },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.consumerResults.followUps.previewCount).toBe(10);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(10);
    expect(output.consumerResults.verification.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "consumer_failure",
          message: expect.stringContaining("truncated from 12 to 10"),
        }),
      ]),
    );
  });

  test("required_follow_ups with obligation_class required_critical creates agenda item with priority critical", async () => {
    const store = storeFor(change());
    const report = engineerReport({
      follow_ups: [],
      required_follow_ups: [
        {
          text: "Fix security vulnerability",
          obligation_class: "required_critical",
          severity: "critical",
          source_contract_id: "contract-sec-1",
        },
      ],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Fix security vulnerability",
      expect.objectContaining({
        priority: "critical",
        category: "required-obligation",
        description: expect.stringContaining("Obligation: required_critical"),
        agendaPath: "/state/agenda.jsonl",
      }),
    );
    expect(mocks.addAgendaItem.mock.calls[0][2].description).toContain(
      "Contract: contract-sec-1",
    );
  });

  test("required_follow_ups with severity high creates agenda item with priority high", async () => {
    const store = storeFor(change());
    const report = engineerReport({
      follow_ups: [],
      required_follow_ups: [
        {
          text: "Update documentation",
          obligation_class: "required_standard",
          severity: "high",
        },
      ],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Update documentation",
      expect.objectContaining({
        priority: "high",
        category: "required-obligation",
      }),
    );
  });

  test("report without required_follow_ups creates no required agenda items", async () => {
    const store = storeFor(change());
    const report = engineerReport({ follow_ups: ["Regular follow-up"] });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Regular follow-up",
      expect.objectContaining({
        category: "subagent-followup",
      }),
    );
  });

  test("existing follow_ups still get priority medium (backward compat)", async () => {
    const store = storeFor(change());
    const report = engineerReport({
      follow_ups: ["Backward compat follow-up"],
      required_follow_ups: [],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Backward compat follow-up",
      expect.objectContaining({
        priority: "medium",
        category: "subagent-followup",
      }),
    );
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

  test("report argument schema rejects string-serialized report payloads", () => {
    const reportSchema =
      subagentReportTools.adv_subagent_report_submit.args.report;

    expect(reportSchema.safeParse(engineerReport()).success).toBe(true);
    expect(
      reportSchema.safeParse(JSON.stringify(engineerReport())).success,
    ).toBe(false);
  });

  test("rejects string-serialized reports deterministically without recording task failure", async () => {
    const store = storeFor(change());

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: JSON.stringify(engineerReport()) },
        store,
      ),
    );

    expect(output.error).toBe("Invalid sub-agent report payload");
    expect(output.code).toBe("INVALID_REPORT");
    expect(output.failureRecord).toEqual({
      recorded: false,
      reason: "report identity unavailable",
    });
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
    expect(mocks.addAgendaItem).not.toHaveBeenCalled();
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

  test("required_follow_ups with obligation_class required_critical creates agenda item with priority critical", async () => {
    const store = storeFor(change());
    const report = engineerReport({
      follow_ups: [],
      required_follow_ups: [
        {
          text: "Fix contract coverage",
          obligation_class: "required_critical",
          severity: "critical",
          source_contract_id: "contract-1",
        },
      ],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.consumerResults.requiredFollowUps.previewCount).toBe(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Fix contract coverage",
      expect.objectContaining({
        priority: "critical",
        category: "required-obligation",
        description: expect.stringContaining("Obligation: required_critical"),
      }),
    );
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Fix contract coverage",
      expect.objectContaining({
        description: expect.stringContaining("Contract: contract-1"),
      }),
    );
  });

  test("required_follow_ups with severity high creates agenda item with priority high", async () => {
    const store = storeFor(change());
    const report = engineerReport({
      follow_ups: [],
      required_follow_ups: [
        {
          text: "Update tests",
          obligation_class: "required_standard",
          severity: "high",
        },
      ],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.consumerResults.requiredFollowUps.previewCount).toBe(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Update tests",
      expect.objectContaining({
        priority: "high",
        category: "required-obligation",
      }),
    );
  });

  test("report without required_follow_ups produces no required agenda items", async () => {
    const store = storeFor(change());
    const report = engineerReport({
      follow_ups: ["Regular follow-up"],
      required_follow_ups: undefined,
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.consumerResults.requiredFollowUps.previewCount).toBe(0);
    expect(output.consumerResults.requiredFollowUps.created).toEqual([]);
    expect(mocks.addAgendaItem).toHaveBeenCalledTimes(1);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Regular follow-up",
      expect.objectContaining({
        category: "subagent-followup",
      }),
    );
  });

  test("existing follow_ups still get priority medium", async () => {
    const store = storeFor(change());
    const report = engineerReport({
      follow_ups: ["Regular follow-up"],
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.addAgendaItem).toHaveBeenCalledWith(
      "/repo",
      "Regular follow-up",
      expect.objectContaining({
        priority: "medium",
        category: "subagent-followup",
      }),
    );
  });
});
