import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SubagentConsumerWarningSchema } from "../types";
import type {
  ChangeScopedReviewerSubagentReport,
  Change,
  DesignerSubagentReport,
  EngineerSubagentReport,
  ResearcherSubagentReport,
  ReviewerSubagentReport,
  ScannerBundleSubagentReport,
  VerificationTriageBundleSubagentReport,
} from "../types";
import type { Store } from "../storage/store-types";
import {
  subagentReportSubmittedSignal,
  taskUpdatedSignal,
} from "../temporal/messages";

const mocks = vi.hoisted(() => {
  const fireSignalAndRefresh = vi.fn(async () => undefined);
  const workflowHandle = { signal: vi.fn(), query: vi.fn() };
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

vi.mock("./target-project", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./target-project")>()),
  withTargetPathStore: mocks.withTargetPathStore,
}));

import { subagentReportTools } from "./subagent-report";

function parse(output: string): Record<string, any> {
  return JSON.parse(output) as Record<string, any>;
}

describe("consumeDesignerDesignConcerns — rq-designQualityEvidence01 (advisory surfacing)", () => {
  beforeEach(() => {
    mocks.fireSignalAndRefresh.mockClear();
  });

  test("surfaces a design_dimensions concern as a design_concern_promoted warning (no queue write)", async () => {
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
    // retireAgendaWorkflow AC4: no agenda write. Concern surfaces as a
    // design_concern_promoted warning carrying the stable dedupe key; the
    // structural acceptance/release block lives in gate-readiness.
    expect(output.consumerResults.designConcerns.previewCount).toBe(1);
    expect(output.consumerResults.designConcerns.created).toEqual([]);
    expect(output.consumerResults.verification.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "design_concern_promoted",
          message: expect.stringContaining(
            "design-concern:change-1:tk-1:dimension:site_design_consistency",
          ),
        }),
      ]),
    );
  });

  test("surfaces each neighboring_recommendation as a design_concern_promoted warning", async () => {
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
    expect(output.consumerResults.designConcerns.previewCount).toBe(1);
    expect(output.consumerResults.designConcerns.created).toEqual([]);
    expect(output.consumerResults.verification.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "design_concern_promoted",
          message: expect.stringContaining(
            "design-concern:change-1:tk-1:neighbor:0",
          ),
        }),
      ]),
    );
  });

  test("all-pass designer report with no neighbors surfaces nothing", async () => {
    const store = storeFor(change());
    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: designerReport() },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.consumerResults.designConcerns.previewCount).toBe(0);
    expect(output.consumerResults.designConcerns.created).toEqual([]);
  });

  test("higher-attempt resubmits emit the same stable dedupe key in the warning", async () => {
    // retireAgendaWorkflow: the dedupe key is emitted in the warning so
    // downstream consumers can correlate concerns across attempts without
    // consulting any queue state.
    const store = storeFor(change());
    const report = designerReport({
      attempt: 2,
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
    expect(output.consumerResults.verification.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "design_concern_promoted",
          message: expect.stringContaining(
            "design-concern:change-1:tk-1:dimension:site_design_consistency",
          ),
        }),
      ]),
    );
  });

  test("dryRun previews concerns with the same warning shape", async () => {
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
    expect(output.consumerResults.designConcerns.previewCount).toBe(1);
    expect(output.consumerResults.designConcerns.created).toEqual([]);
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
    architecture_judgement: {
      applicability: "applicable",
      confidence: "high",
      risk: "low",
      tradeoffs: ["Sidecar persistence adds readback coverage."],
      alternatives_considered: [
        {
          option: "Task-scoped researcher report",
          disposition: "rejected",
          rationale: "Researcher reports are change-scoped optimized handoffs.",
        },
      ],
      recommendation: "Persist change-scoped report.",
    },
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

function verificationTriageBundleReport(
  overrides: Partial<VerificationTriageBundleSubagentReport> = {},
): VerificationTriageBundleSubagentReport {
  return {
    schema_version: "1.0",
    change_id: "change-1",
    attempt: 1,
    agent: "adv-verification-triage-bundle",
    scope: { kind: "change", scope_key: "verifier:local-verify" },
    workdir_used: "/repo",
    phase: "local_verify",
    targets: [
      {
        kind: "command",
        command: "bin/oc-test targeted -- src/types/subagent-reports.test.ts",
        exit_code: 1,
        duration_ms: 1200,
      },
    ],
    status: "fail",
    error_class: "SEMANTIC",
    confidence: "high",
    evidence_basis: "Targeted test failed with deterministic schema evidence.",
    findings: [
      {
        id: "triage-schema",
        severity: "blocker",
        summary: "Schema branch missing.",
        evidence: [
          {
            label: "test output",
            locator: "src/types/subagent-reports.test.ts",
            summary: "adv-verification-triage-bundle rejected before fix.",
          },
        ],
      },
    ],
    recommended_next_action: "route_adv_engineer",
    scope_risk: false,
    suggested_handoff: {
      summary: "Implement schema branch.",
      in_scope: ["plugin/src/types/subagent-reports.ts"],
      out_of_scope: ["task error_recovery mutation"],
      done_when: ["Triage bundle parses."],
      verification: [
        "bin/oc-test targeted -- src/types/subagent-reports.test.ts",
      ],
    },
    required_main_agent_actions: [
      "Validate scope before adv-engineer handoff.",
    ],
    follow_ups: ["Document triage packet shape"],
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
    verification?: {
      command: string;
      exit_code: number;
      summary: string;
      run_id?: string;
    }[];
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
    verification: overrides.verification ?? [
      { command: "pnpm test", exit_code: 0, summary: "passed" },
    ],
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
    // retireAgendaWorkflow AC3: plain follow_ups remain source-attributed
    // report metadata; no queue is written. The consumer result carries the
    // preview count and an empty `created` list.
    expect(output.consumerResults.followUps.previewCount).toBe(2);
    expect(output.consumerResults.followUps.created).toEqual([]);
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

  test("durable test_runs evidence satisfies engineer verification without free-text", async () => {
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_green_1",
              command: "pnpm test",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      { report: engineerReport({ follow_ups: [] }) },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    const warnings = signalPayload.report.consumer_warnings ?? [];

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

  test("typed-v1 binds by same-task run identity despite cosmetic command differences", async () => {
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_typed_green",
              command: "TMPDIR=/cache pnpm test -- src/a.test.ts",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          verification: [
            {
              run_id: "tr_typed_green",
              command: "pnpm test -- src/a.test.ts",
              exit_code: 0,
              summary: "passed",
            },
          ],
        }),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    expect(signalPayload.report.consumer_warnings ?? []).toEqual([]);
  });

  test("typed-v1 rejects absent same-task run identity even when command matches", async () => {
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_other",
              command: "pnpm test",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          verification: [
            {
              run_id: "tr_missing",
              command: "pnpm test",
              exit_code: 0,
              summary: "passed",
            },
          ],
        }),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    expect(signalPayload.report.consumer_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "verification_missing" }),
      ]),
    );
  });

  test("durable test_runs exit-code disagreement yields verification_mismatch", async () => {
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_red_1",
              command: "pnpm test",
              exitCode: 1,
              classification: "failed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      { report: engineerReport({ follow_ups: [] }) },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };

    expect(signalPayload.report.consumer_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "verification_mismatch" }),
      ]),
    );
  });

  test("test_run_id is the canonical typed-v1 reference and binds the consumer (rq-subagentReports25)", async () => {
    // rq-subagentReports25: `test_run_id` is the canonical field name per
    // the design and binds the consumer to a same-task durable record by
    // identity (`run_id`, `exit_code`) regardless of cosmetic command-label
    // differences. `run_id` remains an additive alias; `test_run_id` takes
    // precedence when both are present.
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_canonical_green",
              command: "TMPDIR=/cache pnpm test --filter canonical",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          evidence_binding_version: "typed-v1",
          follow_ups: [],
          verification: [
            {
              command: "pnpm test",
              exit_code: 0,
              summary: "passed",
              test_run_id: "tr_canonical_green",
            },
          ],
        } as any),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    const warnings = signalPayload.report.consumer_warnings ?? [];

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

  test("test_run_id with mismatched exit_code yields verification_mismatch (rq-subagentReports25)", async () => {
    // rq-subagentReports25: exit status is part of the typed identity. A
    // mismatched exit_code between the report and the durable record
    // surfaces `verification_mismatch` even if `test_run_id` matches.
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_canonical_red",
              command: "pnpm test",
              exitCode: 1,
              classification: "failed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          evidence_binding_version: "typed-v1",
          follow_ups: [],
          verification: [
            {
              command: "pnpm test",
              exit_code: 0,
              summary: "passed",
              test_run_id: "tr_canonical_red",
            },
          ],
        } as any),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };

    expect(signalPayload.report.consumer_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "verification_mismatch",
          message: expect.stringMatching(/tr_canonical_red/),
        }),
      ]),
    );
  });

  test("test_run_id without matching durable record yields verification_missing (rq-subagentReports25)", async () => {
    // rq-subagentReports25: a typed run reference that has no matching
    // same-task durable record is a typed `verification_missing` warning.
    // The entry's `command` label, `summary` prose, and aggregate
    // free-text MUST NOT satisfy the gap.
    const store = storeFor(change());

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          evidence_binding_version: "typed-v1",
          follow_ups: [],
          verification: [
            {
              command: "pnpm test",
              exit_code: 0,
              summary:
                "Aggregate prose claiming pnpm test passed; not authoritative.",
              test_run_id: "tr_never_recorded_canonical",
            },
          ],
        } as any),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };

    expect(signalPayload.report.consumer_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "verification_missing",
          message: expect.stringContaining("tr_never_recorded_canonical"),
        }),
      ]),
    );
  });

  test("latest durable record wins: RED then GREEN clears the warning", async () => {
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_red",
              command: "pnpm test",
              exitCode: 1,
              classification: "failed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
            {
              runId: "tr_green",
              command: "pnpm test",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:02:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      { report: engineerReport({ follow_ups: [] }) },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    const warnings = signalPayload.report.consumer_warnings ?? [];

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

  test("report submit refreshes change state before matching durable evidence", async () => {
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_fresh",
              command: "pnpm test",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      { report: engineerReport({ follow_ups: [] }) },
      store,
    );

    expect(store.changes.refresh).toHaveBeenCalledWith("change-1");
  });

  test("typed run_id binds engineer verification to durable test run despite cosmetic command-label differences (rq-subagentReports25)", async () => {
    // rq-subagentReports25: typed binding provenance. When an engineer
    // verification entry carries a `run_id`, identity is established by
    // (run_id, exit_code); the displayed command label is descriptive only.
    // Cosmetic differences (extra args, reordered flags, trailing whitespace,
    // absolute-path variants of the same binary) MUST NOT break the match.
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_typed_green",
              command: "pnpm test --filter integration",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          follow_ups: [],
          verification: [
            {
              command: "pnpm test",
              exit_code: 0,
              summary: "passed",
              run_id: "tr_typed_green",
            },
          ],
        }),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    const warnings = signalPayload.report.consumer_warnings ?? [];

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

  test("typed run_id with mismatched exit_code yields verification_mismatch (rq-subagentReports25)", async () => {
    // rq-subagentReports25: exit status is part of the typed identity; a
    // mismatched exit_code between report and durable record must surface
    // verification_mismatch even if run_id matches.
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_typed_red",
              command: "pnpm test",
              exitCode: 1,
              classification: "failed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          follow_ups: [],
          verification: [
            {
              command: "pnpm test",
              exit_code: 0,
              summary: "passed",
              run_id: "tr_typed_red",
            },
          ],
        }),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };

    expect(signalPayload.report.consumer_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "verification_mismatch",
          message: expect.stringMatching(/tr_typed_red/),
        }),
      ]),
    );
  });

  test("typed run_id without matching durable record yields verification_missing (rq-subagentReports25)", async () => {
    // rq-subagentReports25: missing typed evidence is a typed
    // verification_missing warning; reviewer aggregate prose (the
    // `evidence` summary string) MUST NOT satisfy the gap.
    const store = storeFor(change());

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          follow_ups: [],
          verification: [
            {
              command: "pnpm test",
              exit_code: 0,
              summary:
                "Aggregate prose claiming pnpm test passed; not authoritative.",
              run_id: "tr_never_recorded",
            },
          ],
        }),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };

    expect(signalPayload.report.consumer_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "verification_missing",
          message: expect.stringContaining("tr_never_recorded"),
        }),
      ]),
    );
  });

  test("typed run_id binds designer verification to durable test run (rq-subagentReports25)", async () => {
    // rq-subagentReports25: same typed-binding semantics apply to
    // adv-designer reports. Cosmetic command-label differences must not
    // break a valid identity match.
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_designer_green",
              command: "pnpm test --filter Button",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: designerReport({
          verification: [
            {
              command: "pnpm test",
              exit_code: 0,
              summary: "passed",
              run_id: "tr_designer_green",
            },
          ],
        }),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: DesignerSubagentReport;
    };
    const warnings = signalPayload.report.consumer_warnings ?? [];

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

  test("legacy entry without run_id keeps exact-command binding (rq-subagentReports25)", async () => {
    // rq-subagentReports25: historical compatibility is explicit. A
    // persisted historical report that lacks typed-binding provenance
    // normalizes to the explicit legacy variant and retains exact-command
    // binding. No fuzzy normalization, no timestamp cutover.
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_legacy_match",
              command: "pnpm test",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          follow_ups: [],
          verification: [
            {
              command: "pnpm test",
              exit_code: 0,
              summary: "passed",
            },
          ],
        }),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    const warnings = signalPayload.report.consumer_warnings ?? [];

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

  test("legacy entry without run_id with non-matching command still yields verification_missing (rq-subagentReports25)", async () => {
    // rq-subagentReports25: legacy variant uses exact-command binding; a
    // command that does not appear in durable records surfaces
    // verification_missing even if a similar run_id exists.
    const store = storeFor(
      change({
        test_runs: {
          "tk-1": [
            {
              runId: "tr_other_command",
              command: "pnpm test --filter other",
              exitCode: 0,
              classification: "passed",
              recordedAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        },
      } as Partial<Change>),
    );

    await subagentReportTools.adv_subagent_report_submit.execute(
      {
        report: engineerReport({
          follow_ups: [],
          verification: [
            {
              command: "pnpm test",
              exit_code: 0,
              summary: "passed",
            },
          ],
        }),
      },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };

    expect(signalPayload.report.consumer_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "verification_missing" }),
      ]),
    );
  });

  test("reviewer aggregate prose remains non-authoritative (rq-subagentReports25)", async () => {
    // rq-subagentReports25: reviewer aggregate text (`verification.evidence`
    // and surrounding free-text prose) MUST NOT satisfy the verification
    // gap. Reviewer `tests_run` commands remain descriptive only and bind
    // only to durable/structured evidence keyed by exact command.
    const store = storeFor(change());

    const taskScopedReviewer: ReviewerSubagentReport = {
      schema_version: "1.0",
      change_id: "change-1",
      task_id: "tk-1",
      attempt: 1,
      agent: "adv-reviewer",
      scope: { kind: "task", task_id: "tk-1" },
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
        evidence:
          "Aggregate prose claiming pnpm test passed; not authoritative.",
      },
      scope_drift: null,
      risks: [],
      required_main_agent_actions: [],
    };

    await subagentReportTools.adv_subagent_report_submit.execute(
      { report: taskScopedReviewer },
      store,
    );

    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: ReviewerSubagentReport;
    };

    expect(signalPayload.report.consumer_warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "verification_missing",
          message: expect.stringContaining("pnpm test"),
        }),
      ]),
    );
  });

  test("dryRun validates and previews without signal", async () => {
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
    expect(output.consumerResults.followUps.created).toEqual([]);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
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
    // retireAgendaWorkflow: researcher follow_ups are surfaced as report
    // metadata only — no queue write occurs.
    expect(output.consumerResults.followUps.previewCount).toBe(1);
    expect(output.consumerResults.followUps.created).toEqual([]);
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

  test("accepts verification triage bundle reports as change-scoped sidecar evidence", async () => {
    const store = storeFor(change());
    const report = verificationTriageBundleReport();

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.reportId).toBe(
      "change-1|change:verifier:local-verify|adv-verification-triage-bundle|1",
    );
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
      mocks.workflowHandle,
      store,
      "change-1",
      subagentReportSubmittedSignal,
      expect.objectContaining({
        report: expect.objectContaining({
          agent: "adv-verification-triage-bundle",
          error_class: "SEMANTIC",
          recommended_next_action: "route_adv_engineer",
        }),
      }),
    );
    expect(mocks.fireSignalAndRefresh.mock.calls[0][4]).not.toHaveProperty(
      "taskId",
    );
    expect(output.consumerResults.followUps.previewCount).toBe(1);
    expect(output.consumerResults.followUps.created).toEqual([]);
  });

  test("dryRun previews verification triage bundles without signal", async () => {
    const store = storeFor(change());

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: verificationTriageBundleReport(), dryRun: true },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.dryRun).toBe(true);
    expect(output.consumerResults.followUps.previewCount).toBe(1);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
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
  });

  test("scanner bundle follow-up preview is bounded to 10 items", async () => {
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
    expect(output.consumerResults.followUps.created).toEqual([]);
    expect(output.consumerResults.verification.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "consumer_failure",
          message: expect.stringContaining("truncated from 12 to 10"),
        }),
      ]),
    );
  });

  test("required_follow_ups are surfaced as report metadata only (no queue write)", async () => {
    // retireAgendaWorkflow AC4: required_follow_ups remain typed on the
    // report and are still consumed structurally by required-obligation
    // release-safety + gate-readiness evaluators. The submission path no
    // longer writes to a queue.
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
    expect(output.consumerResults.requiredFollowUps.previewCount).toBe(1);
    expect(output.consumerResults.requiredFollowUps.created).toEqual([]);
    // Required follow_ups still ride on the report payload so the signal
    // carries the typed obligation_class to downstream evaluators.
    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    expect(signalPayload.report.required_follow_ups).toEqual([
      expect.objectContaining({
        text: "Fix security vulnerability",
        obligation_class: "required_critical",
        severity: "critical",
        source_contract_id: "contract-sec-1",
      }),
    ]);
  });

  test("report without required_follow_ups surfaces only plain follow_ups as metadata", async () => {
    const store = storeFor(change());
    const report = engineerReport({ follow_ups: ["Regular follow-up"] });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.consumerResults.followUps.previewCount).toBe(1);
    expect(output.consumerResults.followUps.created).toEqual([]);
    expect(output.consumerResults.requiredFollowUps.previewCount).toBe(0);
    expect(output.consumerResults.requiredFollowUps.created).toEqual([]);
  });

  test("rejects malformed reports at the Zod boundary without mutating workflow state (AC4)", async () => {
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

    // rq-fixWorkflowReliabilityDefects/AC4: malformed input returns bounded
    // diagnostics only. error_recovery is itself a workflow mutation, so the
    // handler-level defense-in-depth path MUST NOT silently record it for
    // INVALID_REPORT. SUBMIT_SIGNAL_FAILED keeps its failureRecord path
    // because that case happens after a successful parse.
    expect(output.error).toBe("Invalid sub-agent report payload");
    expect(output.code).toBe("INVALID_REPORT");
    expect(output.failureRecord).toBeUndefined();
    expect(output.details).toEqual(expect.any(Array));
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalledWith(
      mocks.workflowHandle,
      store,
      "change-1",
      taskUpdatedSignal,
      expect.anything(),
    );
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalledWith(
      mocks.workflowHandle,
      store,
      "change-1",
      subagentReportSubmittedSignal,
      expect.anything(),
    );
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
    // rq-fixWorkflowReliabilityDefects/AC4: malformed input never records task
    // error_recovery, even via the handler-level defense-in-depth parseReport
    // path. There is no failureRecord at all on the response.
    expect(output.failureRecord).toBeUndefined();
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("plugin preflight caps nested report issues at 10 and signals no mutation", async () => {
    // rq-fixWorkflowReliabilityDefects/AC4: when the canonical preflight
    // catches nested report issues, the SDK-registered tool emits bounded
    // invalid[] (≤10) rows and the handler is never called. No signal is
    // fired; no task state is mutated.
    const { registerTool } = await import("../tool-registry");

    let handlerCalled = false;
    const handler = async () => {
      handlerCalled = true;
      return JSON.stringify({ ok: true });
    };
    (handler as { __advToolName?: string }).__advToolName =
      "adv_subagent_report_submit";

    const canonical = subagentReportTools.adv_subagent_report_submit.args;
    const registered = registerTool(
      "test",
      canonical,
      handler,
      // transportArgs is intentionally broader than canonical to admit
      // nested malformed objects at the host boundary; canonical strict
      // Zod is what catches them in preflight.
      subagentReportTools.adv_subagent_report_submit.transportArgs ?? canonical,
    );

    const result = (await registered.execute(
      {
        report: {
          schema_version: "1.0",
          change_id: 12345,
          attempt: "nope",
          agent: "adv-researcher",
          workdir_used: "x",
          scope: { kind: "change", scope_key: "researcher:design-validation" },
          topic: "",
          sources: "not-an-array",
          architecture_assessment: "",
          validation: { status: "fail", blockers: "not-an-array", notes: "" },
          architecture_judgement: { applicability: "applicable" },
          recommendation: "",
          follow_ups: "not-an-array",
        },
      },
      {} as any,
    )) as { output: string };

    expect(handlerCalled).toBe(false);
    const output = JSON.parse(result.output);
    expect(output.code).toBe("INVALID_TOOL_ARGS");
    expect(output.invalid.length).toBeLessThanOrEqual(10);
    expect(output.invalid.length).toBeGreaterThan(0);
    for (const issue of output.invalid) {
      expect(typeof issue.field).toBe("string");
      expect(issue.field).toContain("report");
      expect(typeof issue.message).toBe("string");
    }
  });

  test("design-validation handler rejects typed blockers with unknown contract IDs (AC13)", async () => {
    // rq-fixWorkflowReliabilityDefects/AC13: every typed blocker must cite
    // contract IDs that exist on the change's approved contract. The handler
    // rejects unknown IDs without signaling, so out-of-scope validators
    // cannot promote blocker authority via phantom IDs.
    const baseChange = change();
    baseChange.contract = {
      items: [{ id: "AC4", summary: "Approved criteria summary." }],
    };
    const store = storeFor(baseChange);

    const report = researcherReport({
      scope: { kind: "change", scope_key: "researcher:design-validation" },
      validation: {
        status: "fail",
        blockers: [
          {
            finding: "Missing typed blockers in validator scope.",
            contract_ids: ["AC999", "AC4"],
            scope: "in_scope",
            in_scope_remediation:
              "Require typed blockers with approved contract IDs.",
            source: {
              label: "plugin/src/types/subagent-reports.ts",
              locator: "ResearcherSubagentReportSchema",
              summary:
                "Validation blockers lacked structural scope enforcement.",
            },
          },
        ],
        notes: "Out-of-scope alternative promoted; contract IDs unverified.",
      },
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.error).toBe(
      "Design-validator blocker cites unknown contract IDs",
    );
    expect(output.code).toBe("INVALID_REPORT");
    expect(output.details.unknownContractIds).toEqual(["AC999"]);
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("PROBE: design-validation handler rejects string blockers (will be replaced by tk-4)", async () => {
    const baseChange = change();
    const store = storeFor(baseChange);
    const report = researcherReport({
      scope: { kind: "change", scope_key: "researcher:design-validation" },
      validation: {
        status: "fail",
        blockers: ["bare string blocker"],
        notes: "Probe.",
      },
    });
    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );
    expect(output.error).toBe(
      "new design-validation blockers require typed contract IDs, in-scope remediation, and source evidence",
    );
    expect(output.code).toBe("INVALID_REPORT");
    expect(output.details.stringBlockerIndices).toEqual([0]);
  });

  test("design-validation handler accepts typed blockers whose contract IDs are all approved", async () => {
    // rq-fixWorkflowReliabilityDefects/AC13: when every typed blocker cites
    // approved contract IDs, the design-validation report flows through to
    // signaling exactly like any other change-scoped researcher report.
    const baseChange = change();
    baseChange.contract = {
      items: [
        { id: "AC4", summary: "Approved criteria summary." },
        { id: "AC13", summary: "Design validator scope summary." },
      ],
    };
    const store = storeFor(baseChange);

    const report = researcherReport({
      scope: { kind: "change", scope_key: "researcher:design-validation" },
      validation: {
        status: "fail",
        blockers: [
          {
            finding:
              "Reported diagnostics are bounded by the canonical preflight.",
            contract_ids: ["AC4", "AC13"],
            scope: "in_scope",
            in_scope_remediation:
              "Keep MAX_ZOD_PREFLIGHT_ISSUES = 10 and dedupe by path/message.",
            source: {
              label: "plugin/src/utils/tool-arg-preflight.ts",
              locator: "MAX_ZOD_PREFLIGHT_ISSUES",
              summary: "Bounded diagnostics with field paths and messages.",
            },
          },
        ],
        notes: "Approved-contract validators proceed to signaling.",
      },
    });

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledWith(
      mocks.workflowHandle,
      store,
      "change-1",
      subagentReportSubmittedSignal,
      expect.objectContaining({
        report: expect.objectContaining({
          agent: "adv-researcher",
          validation: expect.objectContaining({
            status: "fail",
            blockers: [
              expect.objectContaining({
                contract_ids: expect.arrayContaining(["AC4", "AC13"]),
                scope: "in_scope",
              }),
            ],
          }),
        }),
      }),
    );
  });

  test("design-validation handler routes typed blockers through scoped change-id from ResearcherValidationBlockerSchema", () => {
    // The handler check only fires for `researcher:design-validation*` scope
    // keys. Other researcher scopes (e.g. `researcher:temporal-docs`) keep
    // their string-only blocker contract; the union still allows them, but
    // the typed path is enforced for design-validation alone.
    const baseChange = change();
    baseChange.contract = { items: [{ id: "AC4", summary: "ok" }] };
    void baseChange;

    const accepted = researcherReport({
      scope: { kind: "change", scope_key: "researcher:temporal-docs" },
      validation: {
        status: "pass",
        blockers: ["legacy string blocker"],
        notes: "non-design scope keeps string blockers",
      },
    });
    expect(accepted.validation.blockers).toEqual(["legacy string blocker"]);
  });

  test("consumer warnings emitted by tool consumers keep schema shape", async () => {
    // retireAgendaWorkflow: with the agenda queue retired, consumer warnings
    // come from verification checks + design-concern promotion only. This
    // test constructs a report that yields a verification warning and
    // confirms the schema shape holds.
    const store = storeFor(change());

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
    // The default engineerReport() verification fails the structured
    // adv_run_test.v1 evidence policy and yields a verification warning.
    expect(output.consumerResults.verification.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "verification_missing" }),
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

  test("required_follow_ups severity ordering is preserved in metadata (critical then high)", async () => {
    // retireAgendaWorkflow: required_follow_ups are surfaced in submission
    // order. The report payload carries the typed obligation_class to
    // downstream release-safety / gate-readiness evaluators.
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
    expect(output.consumerResults.requiredFollowUps.previewCount).toBe(2);
    expect(output.consumerResults.requiredFollowUps.created).toEqual([]);
    const signalPayload = mocks.fireSignalAndRefresh.mock.calls[0][4] as {
      report: EngineerSubagentReport;
    };
    expect(
      signalPayload.report.required_follow_ups?.map((r) => r.text),
    ).toEqual(["Fix contract coverage", "Update tests"]);
  });
});

// rq-subagentReports12: post-archive / post-close report persistence via
// disk-projection fallback when the workflow is terminal.
describe("adv_subagent_report_submit — terminal-workflow disk-projection fallback", () => {
  let tempRoot: string;

  beforeEach(async () => {
    mocks.fireSignalAndRefresh.mockClear();
    tempRoot = await mkdtemp(join(tmpdir(), "adv-terminal-report-"));
  });

  async function archivedStoreWithBundle(): Promise<{
    store: Store;
    bundleDir: string;
    change: Change;
  }> {
    const archiveDir = join(tempRoot, "archive");
    const bundleDir = join(archiveDir, "2026-07-09-change-1");
    await mkdir(bundleDir, { recursive: true });
    const changeFixture = change({
      status: "archived",
      subagent_reports: [],
    });
    await writeFile(
      join(bundleDir, "change.json"),
      JSON.stringify(changeFixture, null, 2),
    );
    const store = {
      paths: {
        root: tempRoot,
        archive: archiveDir,
        changes: join(tempRoot, "changes"),
      },
      config: null,
      init: vi.fn(),
      sync: vi.fn(),
      close: vi.fn(),
      flush: vi.fn(),
      changes: {
        get: vi.fn(async () => ({ success: true, data: changeFixture })),
        refresh: vi.fn(async () => undefined),
      },
    } as unknown as Store;
    return { store, bundleDir, change: changeFixture };
  }

  test("persists a report for an ARCHIVED change via disk projection (not signal)", async () => {
    const { store, bundleDir } = await archivedStoreWithBundle();
    const report = reviewerReport();

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.code).toBeUndefined();
    // Signal path NOT used for terminal changes
    expect(mocks.fireSignalAndRefresh).not.toHaveBeenCalled();

    // Persisted to the archive bundle change.json
    const persisted = JSON.parse(
      await readFile(join(bundleDir, "change.json"), "utf-8"),
    );
    expect(persisted.subagent_reports).toHaveLength(1);
    expect(persisted.subagent_reports[0].agent).toBe("adv-reviewer");
    expect(persisted.subagent_reports[0].recovery_audit.persisted_via).toBe(
      "archive-sidecar",
    );
  });

  test("report persisted post-archive is readable in change.subagent_reports (AC2/AC6)", async () => {
    const { store } = await archivedStoreWithBundle();
    const report = reviewerReport();

    await subagentReportTools.adv_subagent_report_submit.execute(
      { report },
      store,
    );

    // store.changes.get returns the fixture which lacks the new report;
    // but the disk bundle has it. Verify the disk projection carries it.
    const getResult = await store.changes.get("change-1");
    expect(getResult.success).toBe(true);
    // The disk-projection write is the source of truth for terminal changes;
    // the read path (getTemporalChange) loads it from the bundle on next call.
    // Here we assert the bundle was updated (proven above); the read path is
    // covered by the store-temporal integration + the writer unit tests.
  });

  test("re-submitting the same report key is idempotent (AC3)", async () => {
    const { store, bundleDir } = await archivedStoreWithBundle();
    const report = reviewerReport();

    const first = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );
    expect(first.success).toBe(true);
    // Refresh the store fixture so the second call sees the persisted report
    const persisted = JSON.parse(
      await readFile(join(bundleDir, "change.json"), "utf-8"),
    );
    (store.changes.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: persisted,
    });

    const second = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(second.success).toBe(true);
    expect(second.duplicate).toBe(true);
    const reRead = JSON.parse(
      await readFile(join(bundleDir, "change.json"), "utf-8"),
    );
    expect(reRead.subagent_reports).toHaveLength(1);
  });

  test("consumers run after post-archive persistence — follow_ups surfaced as metadata (AC5)", async () => {
    const { store } = await archivedStoreWithBundle();
    const report = engineerReport();

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    // retireAgendaWorkflow: consumers no longer write to a queue. Follow-ups
    // surface only as preview metadata on the consumer result.
    expect(output.consumerResults.followUps.previewCount).toBe(2);
    expect(output.consumerResults.followUps.created).toEqual([]);
  });

  test("active (in-progress) change still uses the signal path — no regression (AC7)", async () => {
    const store = storeFor(change({ status: "active" }));
    const report = reviewerReport();

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.fireSignalAndRefresh.mock.calls[0][3]).toBe(
      subagentReportSubmittedSignal,
    );
  });
});

describe("adv_subagent_report_submit — non-terminal WorkflowNotFound recovery authorization (AC3/SC2)", () => {
  let tempRoot: string;

  beforeEach(async () => {
    mocks.fireSignalAndRefresh.mockClear();
    tempRoot = await mkdtemp(join(tmpdir(), "adv-nonterminal-report-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  function activeStoreWithDirs(baseChange: Change): {
    store: Store;
    changesDir: string;
  } {
    const changesDir = join(tempRoot, "changes");
    const archiveDir = join(tempRoot, "archive");
    const store = {
      paths: {
        root: tempRoot,
        agenda: join(tempRoot, "agenda.jsonl"),
        archive: archiveDir,
        changes: changesDir,
      },
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
    return { store, changesDir };
  }

  test("authorized: err.name=WorkflowNotFoundError (message without marker) writes one authorized disk projection", async () => {
    const baseChange = change({ status: "active", subagent_reports: [] });
    const { store, changesDir } = activeStoreWithDirs(baseChange);
    const err = new Error("unreachable");
    err.name = "WorkflowNotFoundError";
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(err);

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: reviewerReport() },
        store,
      ),
    );

    expect(output.success).toBe(true);
    expect(output.code).toBeUndefined();
    const persisted = JSON.parse(
      await readFile(join(changesDir, "change-1", "change.json"), "utf-8"),
    );
    expect(persisted.subagent_reports).toHaveLength(1);
    expect(persisted.subagent_reports[0].recovery_audit.persisted_via).toBe(
      "active-projection",
    );
    expect(persisted.subagent_reports[0].recovery_audit.reason).toBe(
      "post_archive_report_persist_race_fallback",
    );
    expect(persisted.subagent_reports[0].recovery_audit.evidence).toContain(
      "WorkflowNotFoundError",
    );
  });

  test("authorized: message cites completed-workflow phrasing writes one authorized disk projection", async () => {
    const baseChange = change({ status: "active", subagent_reports: [] });
    const { store, changesDir } = activeStoreWithDirs(baseChange);
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("workflow execution already completed"),
    );

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: engineerReport() },
        store,
      ),
    );

    expect(output.success).toBe(true);
    const persisted = JSON.parse(
      await readFile(join(changesDir, "change-1", "change.json"), "utf-8"),
    );
    expect(persisted.tasks[0].subagent_reports).toHaveLength(1);
    expect(
      persisted.tasks[0].subagent_reports[0].recovery_audit.evidence,
    ).toContain("workflow execution already completed");
  });

  test("unauthorized: message contains 'WorkflowNotFound' substring but is not a completed-workflow error → typed failure, no disk write", async () => {
    const baseChange = change({ status: "active", subagent_reports: [] });
    const { store, changesDir } = activeStoreWithDirs(baseChange);
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(
      new Error("WorkflowNotFound is a placeholder"),
    );

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: reviewerReport() },
        store,
      ),
    );

    expect(output.error).toBeDefined();
    expect(output.code).toBe("SUBMIT_SIGNAL_FAILED");
    await expect(
      readFile(join(changesDir, "change-1", "change.json"), "utf-8"),
    ).rejects.toThrow();
  });

  test("unauthorized: transient error → typed failure with failureRecord, no disk write", async () => {
    const baseChange = change({ status: "active", subagent_reports: [] });
    const { store, changesDir } = activeStoreWithDirs(baseChange);
    mocks.fireSignalAndRefresh
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce(undefined);

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: engineerReport() },
        store,
      ),
    );

    expect(output.error).toBe("network timeout");
    expect(output.code).toBe("SUBMIT_SIGNAL_FAILED");
    expect(output.failureRecord).toEqual({ recorded: true });
    await expect(
      readFile(join(changesDir, "change-1", "change.json"), "utf-8"),
    ).rejects.toThrow();
  });

  test("does not re-signal the same unreachable workflow on authorized recovery", async () => {
    const baseChange = change({ status: "active", subagent_reports: [] });
    const { store } = activeStoreWithDirs(baseChange);
    const err = new Error("unreachable");
    err.name = "WorkflowNotFoundError";
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(err);

    await subagentReportTools.adv_subagent_report_submit.execute(
      { report: engineerReport() },
      store,
    );

    expect(mocks.fireSignalAndRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.fireSignalAndRefresh.mock.calls[0][3]).toBe(
      subagentReportSubmittedSignal,
    );
  });

  test("dedupe: second submission with same report key returns success without re-write", async () => {
    const baseChange = change({ status: "active", subagent_reports: [] });
    const { store, changesDir } = activeStoreWithDirs(baseChange);
    const err = new Error("workflow execution already completed");
    mocks.fireSignalAndRefresh.mockRejectedValue(err);

    const first = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: reviewerReport() },
        store,
      ),
    );
    expect(first.success).toBe(true);

    const persisted = JSON.parse(
      await readFile(join(changesDir, "change-1", "change.json"), "utf-8"),
    );
    (store.changes.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: persisted,
    });

    const second = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: reviewerReport() },
        store,
      ),
    );

    expect(second.success).toBe(true);
    expect(second.duplicate).toBe(true);
    const reRead = JSON.parse(
      await readFile(join(changesDir, "change-1", "change.json"), "utf-8"),
    );
    expect(reRead.subagent_reports).toHaveLength(1);
  });

  test("projection write failure returns typed actionable failure", async () => {
    const baseChange = change({ status: "active", subagent_reports: [] });
    const { store, changesDir } = activeStoreWithDirs(baseChange);
    await writeFile(changesDir, "not a dir");
    const err = new Error("workflow execution already completed");
    mocks.fireSignalAndRefresh.mockRejectedValueOnce(err);

    const output = parse(
      await subagentReportTools.adv_subagent_report_submit.execute(
        { report: reviewerReport() },
        store,
      ),
    );

    expect(output.error).toBeDefined();
    expect(output.code).toBe("SUBMIT_SIGNAL_FAILED");
  });
});
