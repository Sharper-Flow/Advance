import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  buildApplyContextBindingHint,
  ChangeReportScopeKeySchema,
  DesignConcernDispositionSchema,
  DesignerSubagentReportSchema,
  EngineerSubagentReportSchema,
  formatApplyContextBindingHint,
  getSubagentReportPacketAnchors,
  normalizePersistedSubagentReportState,
  type PersistedSubagentReportAgent,
  RequiredFollowUpSchema,
  ResearcherSubagentReportSchema,
  ReviewerSubagentReportSchema,
  ScannerBundleSubagentReportSchema,
  ScopedSubagentReportSchema,
  SubagentApplyContextSchema,
  SUBAGENT_REPORT_FIELD_SOURCES,
  SUBAGENT_REPORT_PACKET_ANCHORS,
  SUBAGENT_WARN_FIRST_PACKET_ANCHORS,
  SubagentAgentSchema,
  SubagentConsumerWarningSchema,
  subagentReportKey,
  TronSubagentReportSchema,
  VerificationTriageBundleSubagentReportSchema,
} from "./subagent-reports";
import { ChangeSchema } from "./changes";

const engineerReport = {
  schema_version: "1.0",
  change_id: "persistSubagentReports",
  task_id: "tk-abc123",
  scope: { kind: "task", task_id: "tk-abc123" },
  attempt: 1,
  agent: "adv-engineer",
  status: "complete",
  files_touched: ["plugin/src/types/subagent-reports.ts"],
  verification: [
    {
      command: "pnpm exec vitest run src/types/subagent-reports.test.ts",
      exit_code: 0,
      summary: "schema tests pass",
    },
  ],
  decisions: [{ what: "Use Zod strict schemas", why: "P33 boundary" }],
  blockers: [],
  scope_drift: null,
  follow_ups: [],
  required_main_agent_actions: [],
  related_scan: "none",
  workdir_used: "/tmp/worktree",
  context_update_for_adv: {
    what_ads_needs_to_know: "Schema added",
    suggested_next_action: "Run workflow tests",
  },
};

const reviewerReport = {
  schema_version: "1.0",
  change_id: "persistSubagentReports",
  task_id: "tk-review123",
  scope: { kind: "task", task_id: "tk-review123" },
  attempt: 2,
  agent: "adv-reviewer",
  phase: "review",
  verdict: "READY",
  blocking_findings: [],
  nonblocking_findings: [
    {
      id: "architecture-1",
      label: "suggestion",
      file: "plugin/src/types/subagent-reports.ts",
      line: 42,
      what: "Consider shared helper",
      why: "Keeps schemas local",
    },
  ],
  changes_made: [],
  wisdom_candidates: [
    {
      type: "pattern",
      content: "Typed reports avoid final-message loss.",
    },
  ],
  verification: {
    tests_run: ["pnpm test"],
    results: "pass",
    evidence: "exit code 0",
  },
  scope_drift: null,
  risks: [],
  required_main_agent_actions: [],
  workdir_used: "/tmp/worktree",
};

const designerReport = {
  schema_version: "1.0",
  change_id: "addAdvDesigner",
  task_id: "tk-design123",
  scope: { kind: "task", task_id: "tk-design123" },
  attempt: 1,
  agent: "adv-designer",
  status: "complete",
  files_touched: ["src/components/Button.tsx"],
  verification: [
    {
      command: "pnpm test -- src/components/Button.test.tsx",
      exit_code: 0,
      summary: "component tests pass",
    },
  ],
  decisions: [
    {
      what: "Use semantic <button> with aria-label",
      why: "Accessibility + design quality bar",
    },
  ],
  blockers: [],
  scope_drift: null,
  follow_ups: [],
  required_main_agent_actions: [],
  related_scan: "none",
  workdir_used: "/tmp/worktree",
  context_update_for_adv: {
    what_ads_needs_to_know: "Button component shipped",
    suggested_next_action: "Run /adv-review",
  },
  design_dimensions: {
    component_correctness: "pass",
    semantic_html_a11y: "pass",
    responsive_behavior: "pass",
    visual_polish: "pass",
    site_design_consistency: "pass",
    finer_details: "pass",
    notes: "Matches existing button family.",
  },
  neighboring_recommendations: [
    {
      file: "src/components/IconButton.tsx",
      what: "Unstyled IconButton on same page lacks focus-visible ring",
      why: "Adjacent UI inconsistency surfaced for HITL",
    },
  ],
};

const researcherReport = {
  schema_version: "1.0",
  change_id: "persistSubagentReports",
  scope: { kind: "change", scope_key: "researcher:temporal-docs" },
  attempt: 1,
  agent: "adv-researcher",
  topic: "Temporal report persistence",
  sources: [
    {
      label: "Temporal docs",
      locator: "https://docs.temporal.io/",
      summary: "Signal handlers must remain replay-safe.",
    },
  ],
  architecture_assessment: "Sidecar reports avoid task payload bloat.",
  validation: {
    status: "caution",
    blockers: [],
    notes: "Versioning needed for legacy key replay.",
  },
  architecture_judgement: {
    applicability: "applicable",
    confidence: "medium",
    risk: "medium",
    tradeoffs: ["Sidecar reports add another query surface to maintain."],
    alternatives_considered: [
      {
        option: "Persist raw transcript only",
        disposition: "rejected",
        rationale: "Raw transcript persistence is not queryable enough.",
      },
    ],
    recommendation: "Use typed sidecar judgement fields.",
  },
  recommendation: "Use deterministic scope keys.",
  follow_ups: ["Add replay regression test"],
  workdir_used: "/tmp/worktree",
};

const legacyResearcherReport = (() => {
  const { architecture_judgement: _judgement, ...legacy } = researcherReport;
  return legacy;
})();

const minimalValidChange = {
  id: "test-change",
  title: "Test",
  status: "draft",
  created_at: "2026-01-01T00:00:00.000Z",
  tasks: [],
  deltas: {},
};

const tronReport = {
  schema_version: "1.0",
  change_id: "persistSubagentReports",
  scope: { kind: "change", scope_key: "tron:report-flow" },
  attempt: 1,
  agent: "adv-tron",
  target: "report flow",
  evidence: [
    {
      file: "plugin/src/tools/subagent-report.ts",
      line: 377,
      summary: "Submit flow currently assumes task scope.",
    },
  ],
  findings: ["Report submit is task-centric"],
  hotspots: ["plugin/src/tools/subagent-report.ts"],
  risks: ["Taskless reports need explicit source metadata"],
  open_questions: [],
  suggested_next_commands: ["/adv-apply addHandoffReports"],
  follow_ups: [],
  workdir_used: "/tmp/worktree",
};

const tronOptimizationCandidate = {
  id: "opt-rbw-1",
  detector_id: "repeated_boundary_work",
  description:
    "Loop body calls a function that crosses a boundary on each iteration.",
  evidence: [
    {
      role: "trigger",
      file: "src/api.ts",
      line: 12,
      matchedSignal: "for.*await.*fetch",
      snippet: "for (const id of ids) { await fetch(...); }",
    },
  ],
  expected_cost_shape: {
    family: "repeated_boundary_work",
    pattern: "boundary",
    description: "Repeated boundary calls inside a loop",
  },
  false_positive_caveat:
    "The loop may be bounded or the boundary call may be required; verify before optimizing.",
  verification_needed:
    "Confirm the loop is hot and the boundary call is not required per iteration.",
  recommendation:
    "Run `/adv-optimizer src/api.ts` to synthesize a simplification proposal.",
};

const tronReportWithOptimizationCandidates = {
  ...tronReport,
  optimization_candidates: [tronOptimizationCandidate],
};

const scannerBundleReport = {
  schema_version: "1.0",
  change_id: "persistSubagentReports",
  scope: { kind: "change", scope_key: "scanner-bundle:review" },
  attempt: 1,
  agent: "adv-scanner-bundle",
  phase: "review",
  scanner_count: 3,
  dimensions: ["tests", "security", "contracts"],
  summary: "Scanner bundle synthesized by orchestrator.",
  findings: [
    {
      scanner: "contracts",
      severity: "issue",
      summary: "Schema anchors missing",
      evidence: [
        {
          label: "spec",
          locator: ".adv/specs/subagent-reports/spec.json:1",
          summary: "Spec must pin scanner bundle shape.",
        },
      ],
    },
  ],
  follow_ups: ["Inspect adjacent contract docs"],
  workdir_used: "/tmp/worktree",
};

const verificationTriageBundleReport = {
  schema_version: "1.0",
  change_id: "addVerificationTriage",
  scope: { kind: "change", scope_key: "verifier:local-verify" },
  attempt: 1,
  agent: "adv-verification-triage-bundle",
  workdir_used: "/tmp/worktree",
  phase: "local_verify",
  targets: [
    {
      kind: "command",
      command:
        "bin/oc-test targeted -- plugin/src/types/subagent-reports.test.ts",
      exit_code: 1,
      duration_ms: 1234,
    },
  ],
  status: "fail",
  error_class: "SEMANTIC",
  confidence: "high",
  evidence_basis:
    "Vitest reported a deterministic schema assertion failure in subagent-reports.test.ts.",
  findings: [
    {
      id: "schema-missing-agent",
      severity: "blocker",
      summary: "Verification triage report agent is not accepted by schema.",
      evidence: [
        {
          label: "test output",
          locator: "plugin/src/types/subagent-reports.test.ts",
          summary: "Expected adv-verification-triage-bundle to parse.",
        },
      ],
    },
  ],
  recommended_next_action: "route_adv_engineer",
  scope_risk: false,
  suggested_handoff: {
    summary: "Add verification triage bundle schema branch.",
    in_scope: ["plugin/src/types/subagent-reports.ts"],
    out_of_scope: ["adv_run_test internals"],
    done_when: [
      "Triage bundle schema parses and invalid route predicates reject.",
    ],
    verification: [
      "bin/oc-test targeted -- plugin/src/types/subagent-reports.test.ts",
    ],
  },
  required_main_agent_actions: [
    "Validate route_adv_engineer predicates before spawning remediation.",
  ],
  follow_ups: [],
};

function requiredTopLevelKeys(schema: z.ZodObject<z.ZodRawShape>): string[] {
  return Object.entries(schema.shape)
    .filter(([, fieldSchema]) => !fieldSchema.safeParse(undefined).success)
    .map(([key]) => key)
    .sort();
}

const reportSchemas: Array<{
  agent: PersistedSubagentReportAgent;
  schema: z.ZodObject<z.ZodRawShape>;
}> = [
  { agent: "adv-engineer", schema: EngineerSubagentReportSchema },
  { agent: "adv-reviewer", schema: ReviewerSubagentReportSchema },
  { agent: "adv-designer", schema: DesignerSubagentReportSchema },
  { agent: "adv-researcher", schema: ResearcherSubagentReportSchema },
  { agent: "adv-tron", schema: TronSubagentReportSchema },
  { agent: "adv-scanner-bundle", schema: ScannerBundleSubagentReportSchema },
  {
    agent: "adv-verification-triage-bundle",
    schema: VerificationTriageBundleSubagentReportSchema,
  },
];

describe("Subagent report schemas", () => {
  it("parses strict task-scoped engineer and reviewer reports", () => {
    const parsedEngineer = EngineerSubagentReportSchema.parse(engineerReport);
    const parsedReviewer = ReviewerSubagentReportSchema.parse(reviewerReport);

    expect(parsedEngineer.scope).toEqual({
      kind: "task",
      task_id: "tk-abc123",
    });
    expect(parsedReviewer.phase).toBe("review");
  });

  it("parses change-scoped independent reviewer reports", () => {
    const { task_id: _taskId, ...changeScopedReviewerReport } = reviewerReport;
    const parsed = ScopedSubagentReportSchema.parse({
      ...changeScopedReviewerReport,
      scope: { kind: "change", scope_key: "review:acceptance" },
    });

    expect(parsed.agent).toBe("adv-reviewer");
    expect(parsed.scope).toEqual({
      kind: "change",
      scope_key: "review:acceptance",
    });
    expect("task_id" in parsed).toBe(false);
  });

  it("parses strict change-scoped optimized handoff reports", () => {
    expect(ResearcherSubagentReportSchema.parse(researcherReport).agent).toBe(
      "adv-researcher",
    );
    expect(TronSubagentReportSchema.parse(tronReport).agent).toBe("adv-tron");
    expect(
      ScannerBundleSubagentReportSchema.parse(scannerBundleReport).agent,
    ).toBe("adv-scanner-bundle");
    expect(
      VerificationTriageBundleSubagentReportSchema.parse(
        verificationTriageBundleReport,
      ).agent,
    ).toBe("adv-verification-triage-bundle");
  });

  it("parses Tron reports with static opt-scan optimization candidates", () => {
    const parsed = TronSubagentReportSchema.parse(
      tronReportWithOptimizationCandidates,
    );

    expect(parsed.optimization_candidates).toHaveLength(1);
    expect(parsed.optimization_candidates![0].detector_id).toBe(
      "repeated_boundary_work",
    );
    expect(parsed.optimization_candidates![0].expected_cost_shape.family).toBe(
      "repeated_boundary_work",
    );
    expect(parsed.optimization_candidates![0].expected_cost_shape.pattern).toBe(
      "boundary",
    );
    expect(parsed.optimization_candidates![0].evidence[0].file).toBe(
      "src/api.ts",
    );
    expect(parsed.optimization_candidates![0].recommendation).toContain(
      "/adv-optimizer",
    );
  });

  it("preserves source evidence with a null line", () => {
    const parsed = TronSubagentReportSchema.parse({
      ...tronReportWithOptimizationCandidates,
      optimization_candidates: [
        {
          ...tronOptimizationCandidate,
          evidence: [
            {
              ...tronOptimizationCandidate.evidence[0],
              line: null,
            },
          ],
        },
      ],
    });

    expect(parsed.optimization_candidates![0].evidence[0].line).toBeNull();
  });

  it("rejects Tron optimization candidates with measured runtime-impact claims", () => {
    const bad = {
      ...tronReportWithOptimizationCandidates,
      optimization_candidates: [
        {
          ...tronOptimizationCandidate,
          description: "This yields a 50% speedup and reduces latency.",
        },
      ],
    };

    expect(() => TronSubagentReportSchema.parse(bad)).toThrow(
      /cannot assert measured runtime impact/,
    );
  });

  it("rejects Tron optimization candidates carrying a measured evidence branch", () => {
    const bad = {
      ...tronReportWithOptimizationCandidates,
      optimization_candidates: [
        {
          ...tronOptimizationCandidate,
          measured: {
            provenance: "benchmark",
            baseline: 100,
            observed: 50,
            unit: "ms",
          },
        },
      ],
    };

    expect(() => TronSubagentReportSchema.parse(bad)).toThrow();
  });

  it("requires Tron optimization candidates to preserve source evidence", () => {
    const bad = {
      ...tronReportWithOptimizationCandidates,
      optimization_candidates: [
        {
          ...tronOptimizationCandidate,
          evidence: [],
        },
      ],
    };

    expect(() => TronSubagentReportSchema.parse(bad)).toThrow();
  });

  it("requires Tron optimization candidates to include cost-shape framing", () => {
    const bad = {
      ...tronReportWithOptimizationCandidates,
      optimization_candidates: [
        {
          ...tronOptimizationCandidate,
          expected_cost_shape: {
            ...tronOptimizationCandidate.expected_cost_shape,
            description: "",
          },
        },
      ],
    };

    expect(() => TronSubagentReportSchema.parse(bad)).toThrow();
  });

  it("requires Tron optimization candidates to include false-positive caveat and verification route", () => {
    const bad = {
      ...tronReportWithOptimizationCandidates,
      optimization_candidates: [
        {
          ...tronOptimizationCandidate,
          false_positive_caveat: "",
          verification_needed: "",
        },
      ],
    };

    expect(() => TronSubagentReportSchema.parse(bad)).toThrow();
  });

  it("requires Tron optimization candidates to recommend an optimizer handoff", () => {
    const bad = {
      ...tronReportWithOptimizationCandidates,
      optimization_candidates: [
        {
          ...tronOptimizationCandidate,
          recommendation: "",
        },
      ],
    };

    expect(() => TronSubagentReportSchema.parse(bad)).toThrow();
  });

  it("requires researcher architecture judgement for new ingest", () => {
    expect(() =>
      ResearcherSubagentReportSchema.parse(legacyResearcherReport),
    ).toThrow();

    const parsed = ResearcherSubagentReportSchema.parse({
      ...researcherReport,
      architecture_judgement: {
        applicability: "applicable",
        confidence: "medium",
        risk: "medium",
        tradeoffs: ["Sidecar reports add another query surface to maintain."],
        alternatives_considered: [
          {
            option: "Persist raw transcript only",
            disposition: "rejected",
            rationale: "Raw transcript persistence is not queryable enough.",
          },
        ],
        recommendation: "Use typed sidecar judgement fields.",
      },
    });

    expect(parsed.architecture_judgement).toMatchObject({
      applicability: "applicable",
      confidence: "medium",
    });
  });

  it("enforces researcher judgement consistency with validation status", () => {
    const applicableJudgement = {
      applicability: "applicable" as const,
      confidence: "medium" as const,
      risk: "medium" as const,
      tradeoffs: ["Adds schema/test maintenance."],
      alternatives_considered: [
        {
          option: "Prompt-only guidance",
          disposition: "rejected" as const,
          rationale: "Prompt-only guidance is not durable.",
        },
      ],
      recommendation: "Add typed researcher judgement.",
    };

    expect(() =>
      ResearcherSubagentReportSchema.parse({
        ...researcherReport,
        validation: { status: "pass", blockers: [], notes: "ok" },
        architecture_judgement: {
          ...applicableJudgement,
          confidence: "low",
        },
      }),
    ).toThrow();

    const designValidationReport = {
      ...researcherReport,
      scope: {
        kind: "change" as const,
        scope_key: "researcher:design-validation",
      },
      validation: {
        status: "fail" as const,
        blockers: ["Change OpenCode core instead."],
        notes: "Out-of-scope blocker.",
      },
      architecture_judgement: applicableJudgement,
    };
    // Legacy tolerance: bare-string blockers on researcher:design-validation
    // reports are preserved verbatim on read. Enforcement lives at
    // adv_subagent_report_submit (rq-subagentReports24.1) — see
    // makeLegacyDesignValidation.
    const parsedLegacy = ResearcherSubagentReportSchema.parse(
      designValidationReport,
    );
    expect(parsedLegacy.validation.blockers).toEqual([
      "Change OpenCode core instead.",
    ]);
    expect(
      ResearcherSubagentReportSchema.parse({
        ...designValidationReport,
        validation: {
          ...designValidationReport.validation,
          blockers: [
            {
              finding: "Report schema permits unscoped blockers.",
              contract_ids: ["AC13"],
              scope: "in_scope",
              in_scope_remediation: "Require typed blocker scope metadata.",
              source: {
                label: "report schema",
                locator: "plugin/src/types/subagent-reports.ts",
                summary: "Validation blockers lacked structural scope.",
              },
            },
          ],
        },
      }).validation.blockers,
    ).toHaveLength(1);

    expect(() =>
      ResearcherSubagentReportSchema.parse({
        ...researcherReport,
        validation: { status: "fail", blockers: [], notes: "Anti-pattern." },
        architecture_judgement: applicableJudgement,
      }),
    ).toThrow();

    expect(() =>
      ResearcherSubagentReportSchema.parse({
        ...researcherReport,
        scope: { kind: "change", scope_key: "researcher:design-validation" },
        architecture_judgement: {
          applicability: "not_applicable",
          confidence: "high",
          reason: "Generic docs lookup.",
          recommendation: "Continue.",
        },
      }),
    ).toThrow();
  });

  it("preserves multiple legacy string design-validation blockers through ChangeSchema.parse (AC1)", () => {
    const applicableJudgement = {
      applicability: "applicable" as const,
      confidence: "medium" as const,
      risk: "medium" as const,
      tradeoffs: ["Adds schema/test maintenance."],
      alternatives_considered: [
        {
          option: "Prompt-only guidance",
          disposition: "rejected" as const,
          rationale: "Prompt-only guidance is not durable.",
        },
      ],
      recommendation: "Add typed researcher judgement.",
    };

    const legacyReport = {
      ...researcherReport,
      scope: {
        kind: "change" as const,
        scope_key: "researcher:design-validation",
      },
      validation: {
        status: "fail" as const,
        blockers: [
          "First legacy string blocker.",
          "Second legacy string blocker.",
          "Third legacy string blocker.",
        ],
        notes: "Historical failed-attempt report.",
      },
      architecture_judgement: applicableJudgement,
    };

    const changeWithLegacyReports = {
      ...minimalValidChange,
      subagent_reports: [legacyReport],
    };

    const parsed = ChangeSchema.parse(changeWithLegacyReports);
    expect(parsed.subagent_reports).toHaveLength(1);
    expect(parsed.subagent_reports[0].validation.blockers).toEqual([
      "First legacy string blocker.",
      "Second legacy string blocker.",
      "Third legacy string blocker.",
    ]);
  });

  it("requires run IDs for typed-v1 engineer verification while reading legacy rows", () => {
    expect(EngineerSubagentReportSchema.safeParse(engineerReport).success).toBe(
      true,
    );
    expect(
      EngineerSubagentReportSchema.safeParse({
        ...engineerReport,
        evidence_binding_version: "typed-v1",
      }).success,
    ).toBe(false);
    expect(
      EngineerSubagentReportSchema.safeParse({
        ...engineerReport,
        evidence_binding_version: "typed-v1",
        verification: engineerReport.verification.map((entry) => ({
          ...entry,
          run_id: "tr_green",
        })),
      }).success,
    ).toBe(true);
  });

  it("accepts test_run_id as the canonical typed-v1 run reference for engineer and designer reports", () => {
    // rq-subagentReports25: `test_run_id` is the canonical typed-binding
    // field; `run_id` is preserved as an additive alias. Both engineer
    // and designer reports MUST accept either field on each verification
    // entry and MUST NOT require both. Reports without either field on a
    // typed-v1 row are rejected.
    const withTestRunId = (report: typeof engineerReport) => ({
      ...report,
      evidence_binding_version: "typed-v1" as const,
      verification: report.verification.map((entry) => ({
        ...entry,
        test_run_id: "tr_canonical",
      })),
    });

    expect(
      EngineerSubagentReportSchema.safeParse(withTestRunId(engineerReport))
        .success,
    ).toBe(true);
    expect(
      DesignerSubagentReportSchema.safeParse(withTestRunId(designerReport))
        .success,
    ).toBe(true);

    // Mixed: one entry uses test_run_id, another uses run_id. Both must be
    // accepted under the same typed-v1 binding.
    const mixed = {
      ...engineerReport,
      evidence_binding_version: "typed-v1" as const,
      verification: [
        {
          command: "pnpm test --filter alpha",
          exit_code: 0,
          summary: "alpha",
          test_run_id: "tr_alpha",
        },
        {
          command: "pnpm test --filter beta",
          exit_code: 0,
          summary: "beta",
          run_id: "tr_beta",
        },
      ],
    };
    expect(EngineerSubagentReportSchema.safeParse(mixed).success).toBe(true);

    // Typed-v1 with NEITHER run_id nor test_run_id on an entry is rejected.
    expect(
      EngineerSubagentReportSchema.safeParse({
        ...engineerReport,
        evidence_binding_version: "typed-v1",
      }).success,
    ).toBe(false);
  });

  it("parses verification triage bundle reports for local verify and CI checks", () => {
    const parsedLocal = VerificationTriageBundleSubagentReportSchema.parse(
      verificationTriageBundleReport,
    );
    const parsedCi = VerificationTriageBundleSubagentReportSchema.parse({
      ...verificationTriageBundleReport,
      scope: { kind: "change", scope_key: "verifier:ci-checks" },
      phase: "ci_check",
      targets: [
        {
          kind: "ci_check",
          repo: "Sharper-Flow/Advance",
          check_name: "test",
          head_sha: "0123456789abcdef0123456789abcdef01234567",
          run_url: "https://github.com/Sharper-Flow/Advance/actions/runs/1",
          conclusion: "failure",
        },
      ],
      recommended_next_action: "wait_ci",
      suggested_handoff: undefined,
      error_class: "TRANSIENT",
      confidence: "medium",
    });

    expect(parsedLocal.phase).toBe("local_verify");
    expect(parsedCi.targets[0]).toMatchObject({
      kind: "ci_check",
      head_sha: "0123456789abcdef0123456789abcdef01234567",
    });
  });

  it("parses and validates typed failure_attribution on failed verification bundles", () => {
    const withAttribution = {
      ...verificationTriageBundleReport,
      failure_attribution: {
        assertion: "expected 200 to equal 404",
        test_locator: {
          label: "test",
          locator: "src/routes/api.test.ts:42",
          summary: "GET /health returns 404",
        },
        production_locator: {
          label: "production",
          locator: "src/routes/api.ts:15",
          summary: "health handler",
        },
        branch_result: "fail",
        base_result: "pass",
        comparison_status: "compared_clean",
        failure_mode: "assertion_mismatch",
        owner_task: "tk-123",
        evidence_refs: [
          {
            label: "branch output",
            locator: "command: bin/oc-test targeted -- src/routes/api.test.ts",
            summary: "deterministic assertion failure",
          },
        ],
      },
    };
    const parsed =
      VerificationTriageBundleSubagentReportSchema.parse(withAttribution);
    expect(parsed.failure_attribution).toBeDefined();
    expect(parsed.failure_attribution?.assertion).toBe(
      "expected 200 to equal 404",
    );
    expect(parsed.failure_attribution?.failure_mode).toBe("assertion_mismatch");
    expect(parsed.failure_attribution?.comparison_status).toBe(
      "compared_clean",
    );

    // Unknown failure_attribution fields are rejected at the strict boundary.
    expect(() =>
      VerificationTriageBundleSubagentReportSchema.parse({
        ...withAttribution,
        failure_attribution: {
          ...withAttribution.failure_attribution,
          extra_field: true,
        },
      }),
    ).toThrow();

    // Missing required failure_attribution fields are rejected.
    expect(() =>
      VerificationTriageBundleSubagentReportSchema.parse({
        ...withAttribution,
        failure_attribution: {
          assertion: "expected 200 to equal 404",
          branch_result: "fail",
          base_result: "pass",
          comparison_status: "compared_clean",
          failure_mode: "assertion_mismatch",
          evidence_refs: [],
        },
      }),
    ).toThrow();
  });

  it("enforces route_adv_engineer predicates structurally", () => {
    for (const invalid of [
      { error_class: "TRANSIENT" },
      { scope_risk: true },
      { confidence: "low" },
      { suggested_handoff: undefined },
    ]) {
      expect(() =>
        VerificationTriageBundleSubagentReportSchema.parse({
          ...verificationTriageBundleReport,
          ...invalid,
        }),
      ).toThrow();
    }
  });

  it("keeps UNKNOWN routing-only inside verification triage bundles", () => {
    const parsed = VerificationTriageBundleSubagentReportSchema.parse({
      ...verificationTriageBundleReport,
      error_class: "UNKNOWN",
      confidence: "low",
      recommended_next_action: "ask_user",
      suggested_handoff: undefined,
    });

    expect(parsed.error_class).toBe("UNKNOWN");
    expect(() =>
      EngineerSubagentReportSchema.parse({
        ...engineerReport,
        error_recovery: { error_class: "UNKNOWN" },
      }),
    ).toThrow();
  });

  it("rejects unknown fields at the report boundary", () => {
    expect(() =>
      ResearcherSubagentReportSchema.parse({
        ...researcherReport,
        untyped_extra: true,
      }),
    ).toThrow();
  });

  it("rejects invalid attempt numbers", () => {
    expect(() =>
      EngineerSubagentReportSchema.parse({
        ...engineerReport,
        attempt: 0,
      }),
    ).toThrow();
  });

  it("requires engineer reports to capture scope drift and main-agent actions structurally", () => {
    const parsed = EngineerSubagentReportSchema.parse({
      ...engineerReport,
      scope_drift: {
        items: ["Found adjacent prompt contract gap"],
        details:
          "Owned schema work completed; prompt gap belongs to packet task.",
        recommendation: "finish_owned_scope_then_report",
      },
      required_main_agent_actions: ["Carry prompt gap into packet task"],
    });

    expect(parsed.scope_drift).toEqual({
      items: ["Found adjacent prompt contract gap"],
      details:
        "Owned schema work completed; prompt gap belongs to packet task.",
      recommendation: "finish_owned_scope_then_report",
    });
    expect(parsed.required_main_agent_actions).toEqual([
      "Carry prompt gap into packet task",
    ]);
    expect(() =>
      EngineerSubagentReportSchema.parse({
        ...engineerReport,
        scope_drift: undefined,
      }),
    ).toThrow();
    expect(() =>
      EngineerSubagentReportSchema.parse({
        ...engineerReport,
        required_main_agent_actions: undefined,
      }),
    ).toThrow();
  });

  it("normalizes legacy persisted task-scoped reports without weakening new ingest", () => {
    const legacy = {
      tasks: [
        {
          id: "tk-legacy",
          subagent_reports: [
            {
              ...engineerReport,
              task_id: "tk-legacy",
              scope: "legacy prose scope",
              scope_drift: undefined,
              required_main_agent_actions: undefined,
            },
          ],
        },
      ],
      subagent_reports: [
        {
          ...reviewerReport,
          task_id: "tk-legacy",
          scope_drift: undefined,
          required_main_agent_actions: undefined,
        },
        legacyResearcherReport,
      ],
    };

    const [normalized, changed] = normalizePersistedSubagentReportState(legacy);
    const normalizedState = normalized as typeof legacy;

    expect(changed).toBe(true);
    expect(normalizedState.tasks[0].subagent_reports[0]).toMatchObject({
      scope_drift: null,
      required_main_agent_actions: [],
    });
    expect(normalizedState.subagent_reports[0]).toMatchObject({
      scope_drift: null,
      required_main_agent_actions: [],
    });
    expect(normalizedState.subagent_reports[1]).toMatchObject({
      agent: "adv-researcher",
      architecture_judgement: {
        applicability: "not_applicable",
        confidence: "low",
      },
    });
    expect(() =>
      EngineerSubagentReportSchema.parse({
        ...engineerReport,
        scope_drift: undefined,
        required_main_agent_actions: undefined,
      }),
    ).toThrow();
    expect(() =>
      ResearcherSubagentReportSchema.parse(legacyResearcherReport),
    ).toThrow();
  });

  it("rejects invalid agent/scope pairings structurally", () => {
    expect(() =>
      ScopedSubagentReportSchema.parse({
        ...researcherReport,
        scope: { kind: "task", task_id: "tk-wrong" },
      }),
    ).toThrow();
    expect(() =>
      ScopedSubagentReportSchema.parse({
        ...engineerReport,
        scope: { kind: "change", scope_key: "researcher:wrong" },
      }),
    ).toThrow();
    expect(() =>
      ScopedSubagentReportSchema.parse({
        ...designerReport,
        scope: { kind: "change", scope_key: "researcher:wrong" },
      }),
    ).toThrow();
  });

  it("requires designer dimension notes when any dimension is concern", () => {
    expect(() =>
      DesignerSubagentReportSchema.parse({
        ...designerReport,
        design_dimensions: {
          ...designerReport.design_dimensions,
          visual_polish: "concern",
          notes: undefined,
        },
      }),
    ).toThrow();

    expect(() =>
      DesignerSubagentReportSchema.parse({
        ...designerReport,
        design_dimensions: {
          ...designerReport.design_dimensions,
          visual_polish: "concern",
          notes: "Spacing mismatch reported for orchestrator review.",
        },
      }),
    ).not.toThrow();
  });

  it("requires designer dimension notes when any dimension is n/a", () => {
    expect(() =>
      DesignerSubagentReportSchema.parse({
        ...designerReport,
        design_dimensions: {
          ...designerReport.design_dimensions,
          responsive_behavior: "n/a",
          notes: undefined,
        },
      }),
    ).toThrow();

    expect(() =>
      DesignerSubagentReportSchema.parse({
        ...designerReport,
        design_dimensions: {
          ...designerReport.design_dimensions,
          responsive_behavior: "n/a",
          notes:
            "Static icon-only change; no responsive layout behavior affected.",
        },
      }),
    ).not.toThrow();
  });

  it("allows compact all-pass designer dimensions without notes", () => {
    const { notes: _notes, ...allPassDimensions } =
      designerReport.design_dimensions;

    expect(() =>
      DesignerSubagentReportSchema.parse({
        ...designerReport,
        design_dimensions: allPassDimensions,
      }),
    ).not.toThrow();
  });

  it("keeps optimized handoff agent literals in the supported surface", () => {
    expect(SubagentAgentSchema.options).toEqual([
      "adv-engineer",
      "adv-reviewer",
      "adv-designer",
      "adv-researcher",
      "adv-tron",
      "adv-scanner-bundle",
      "adv-verification-triage-bundle",
      "adv-visual-review",
    ]);
  });

  it("pins structural scope key formats", () => {
    expect(ChangeReportScopeKeySchema.parse("researcher:temporal-docs")).toBe(
      "researcher:temporal-docs",
    );
    expect(ChangeReportScopeKeySchema.parse("tron:report-flow")).toBe(
      "tron:report-flow",
    );
    expect(ChangeReportScopeKeySchema.parse("scanner-bundle:harden")).toBe(
      "scanner-bundle:harden",
    );
    expect(ChangeReportScopeKeySchema.parse("review:acceptance")).toBe(
      "review:acceptance",
    );
    expect(ChangeReportScopeKeySchema.parse("harden:release")).toBe(
      "harden:release",
    );
    expect(ChangeReportScopeKeySchema.parse("verifier:local-verify")).toBe(
      "verifier:local-verify",
    );
    expect(ChangeReportScopeKeySchema.parse("visual-review:screenshot")).toBe(
      "visual-review:screenshot",
    );
    expect(() => ChangeReportScopeKeySchema.parse("freeform")).toThrow();
  });

  it("parses engineer report with required_follow_ups", () => {
    const parsed = EngineerSubagentReportSchema.parse({
      ...engineerReport,
      required_follow_ups: [
        {
          text: "Add acceptance test for required-critical defaulting",
          obligation_class: "required_critical",
          severity: "critical",
          source_contract_id: "AC1",
        },
      ],
    });

    expect(parsed.required_follow_ups).toHaveLength(1);
    expect(parsed.required_follow_ups![0].obligation_class).toBe(
      "required_critical",
    );
    expect(parsed.required_follow_ups![0].severity).toBe("critical");
  });

  it("parses reviewer report with required_follow_ups", () => {
    const parsed = ReviewerSubagentReportSchema.parse({
      ...reviewerReport,
      required_follow_ups: [
        {
          text: "Harden boundary validation before release",
          obligation_class: "required_standard",
          severity: "high",
        },
      ],
    });

    expect(parsed.required_follow_ups).toHaveLength(1);
    expect(parsed.required_follow_ups![0].obligation_class).toBe(
      "required_standard",
    );
    expect(parsed.required_follow_ups![0].severity).toBe("high");
  });

  it("defaults required_follow_up severity to high", () => {
    const followUp = RequiredFollowUpSchema.parse({
      text: "Update docs",
      obligation_class: "required_standard",
    });

    expect(followUp.severity).toBe("high");
  });

  it("preserves backward compat without required_follow_ups", () => {
    const parsedEngineer = EngineerSubagentReportSchema.parse(engineerReport);
    const parsedReviewer = ReviewerSubagentReportSchema.parse(reviewerReport);

    expect(parsedEngineer.required_follow_ups).toBeUndefined();
    expect(parsedReviewer.required_follow_ups).toBeUndefined();
  });

  describe("design-quality enforcement schema additions", () => {
    it("parses designer report with required_follow_ups", () => {
      const parsed = DesignerSubagentReportSchema.parse({
        ...designerReport,
        required_follow_ups: [
          {
            text: "Resolve site_design_consistency concern before acceptance",
            obligation_class: "required_standard",
            severity: "high",
          },
        ],
      });

      expect(parsed.required_follow_ups).toHaveLength(1);
      expect(parsed.required_follow_ups![0].obligation_class).toBe(
        "required_standard",
      );
    });

    it("preserves designer backward compat without required_follow_ups", () => {
      const parsed = DesignerSubagentReportSchema.parse(designerReport);
      expect(parsed.required_follow_ups).toBeUndefined();
    });

    it("accepts design_concern_promoted consumer warning kind", () => {
      const parsed = SubagentConsumerWarningSchema.parse({
        kind: "design_concern_promoted",
        message:
          "Promoted site_design_consistency concern to a durable obligation",
      });
      expect(parsed.kind).toBe("design_concern_promoted");
    });

    it("parses a valid design-concern disposition", () => {
      const parsed = DesignConcernDispositionSchema.parse({
        taskId: "tk-design123",
        concernKey: "dimension:site_design_consistency",
        disposition: "rejected_with_evidence",
        evidence: "Out-of-scope legacy page; tracked in fast-follow #123.",
        dispositionedAt: "2026-06-25T14:00:00.000Z",
      });
      expect(parsed.disposition).toBe("rejected_with_evidence");
      expect(parsed.concernKey).toBe("dimension:site_design_consistency");
    });

    it("rejects a design-concern disposition with empty evidence", () => {
      expect(() =>
        DesignConcernDispositionSchema.parse({
          taskId: "tk-design123",
          concernKey: "dimension:site_design_consistency",
          disposition: "fixed",
          evidence: "",
          dispositionedAt: "2026-06-25T14:00:00.000Z",
        }),
      ).toThrow();
    });

    it("rejects an unknown disposition verb (no accepted_debt)", () => {
      expect(() =>
        DesignConcernDispositionSchema.parse({
          taskId: "tk-design123",
          concernKey: "dimension:site_design_consistency",
          disposition: "accepted_debt",
          evidence: "should not be allowed",
          dispositionedAt: "2026-06-25T14:00:00.000Z",
        }),
      ).toThrow();
    });
  });

  describe("context packet anchor contract", () => {
    for (const { agent, schema } of reportSchemas) {
      it(`classifies every required ${agent} report field`, () => {
        const fieldSources = SUBAGENT_REPORT_FIELD_SOURCES[agent];

        for (const key of requiredTopLevelKeys(schema)) {
          expect(
            fieldSources,
            `${agent} missing field source for ${key}`,
          ).toHaveProperty(key);
        }
      });

      it(`maps every packet-sourced ${agent} report field to a packet anchor`, () => {
        for (const [field, source] of Object.entries(
          SUBAGENT_REPORT_FIELD_SOURCES[agent],
        )) {
          if (source !== "packet_anchor") continue;

          expect(
            SUBAGENT_REPORT_PACKET_ANCHORS,
            `${agent} packet field ${field} has no anchor label`,
          ).toHaveProperty(field);
        }
      });
    }

    it("keeps engineer packet anchors aligned with task-scoped identity fields", () => {
      expect(getSubagentReportPacketAnchors("adv-engineer")).toEqual([
        "ATTEMPT",
        "CHANGE",
        "TASK",
        "WORKING DIRECTORY",
      ]);
    });

    it("keeps designer packet anchors aligned with task-scoped identity fields", () => {
      expect(getSubagentReportPacketAnchors("adv-designer")).toEqual([
        "ATTEMPT",
        "CHANGE",
        "TASK",
        "WORKING DIRECTORY",
      ]);
    });

    it("keeps reviewer packet anchors aligned with task-scoped phase fields", () => {
      expect(getSubagentReportPacketAnchors("adv-reviewer")).toEqual([
        "ATTEMPT",
        "CHANGE",
        "PHASE",
        "TASK",
        "WORKING DIRECTORY",
      ]);
    });

    it("keeps researcher/tron packet anchors aligned with change-scoped identity fields", () => {
      for (const agent of ["adv-researcher", "adv-tron"] as const) {
        expect(getSubagentReportPacketAnchors(agent)).toEqual([
          "ATTEMPT",
          "CHANGE",
          "SCOPE KEY",
          "WORKING DIRECTORY",
        ]);
      }
    });

    it("keeps scanner bundle packet anchors aligned with phase and scope", () => {
      expect(getSubagentReportPacketAnchors("adv-scanner-bundle")).toEqual([
        "ATTEMPT",
        "CHANGE",
        "PHASE",
        "SCOPE KEY",
        "WORKING DIRECTORY",
      ]);
    });

    it("keeps verification triage bundle packet anchors aligned with phase and scope", () => {
      expect(
        getSubagentReportPacketAnchors("adv-verification-triage-bundle"),
      ).toEqual([
        "ATTEMPT",
        "CHANGE",
        "PHASE",
        "SCOPE KEY",
        "WORKING DIRECTORY",
      ]);
    });

    it("keeps new scope/done/stop/verification packet anchors warn-first and separate from strict identity", () => {
      expect(SUBAGENT_WARN_FIRST_PACKET_ANCHORS).toEqual([
        "TASK_SCOPE",
        "IN_SCOPE",
        "OUT_OF_SCOPE",
        "DONE_WHEN",
        "STOP_WHEN",
        "VERIFICATION",
      ]);

      for (const agent of SubagentAgentSchema.options) {
        expect(getSubagentReportPacketAnchors(agent)).not.toEqual(
          expect.arrayContaining([...SUBAGENT_WARN_FIRST_PACKET_ANCHORS]),
        );
      }
    });
  });
});

describe("subagentReportKey", () => {
  /**
   * Pins the exact persisted-report identity format. This key is the cross-
   * sidecar dedupe identity shared by tools/change.ts, tools/subagent-report.ts,
   * tools/_recovery-writers.ts, tools/followup.ts, utils/loop-ledger.ts, and
   * temporal/change-state.ts; the format MUST stay byte-identical after the
   * helper is relocated out of temporal/contracts.ts.
   */
  it("uses the legacy changeId|taskId|agent|attempt shape when taskId is present", () => {
    expect(
      subagentReportKey({
        changeId: "fixLoopLedgerRegressions",
        taskId: "tk-abc123",
        agent: "adv-engineer",
        attempt: 2,
      }),
    ).toBe("fixLoopLedgerRegressions|tk-abc123|adv-engineer|2");
  });

  it("uses structural task scope when taskId is absent", () => {
    expect(
      subagentReportKey({
        changeId: "fixLoopLedgerRegressions",
        scope: { kind: "task", task_id: "tk-abc123" },
        agent: "adv-reviewer",
        attempt: 1,
      }),
    ).toBe("fixLoopLedgerRegressions|task:tk-abc123|adv-reviewer|1");
  });

  it("uses structural change scope when taskId is absent", () => {
    expect(
      subagentReportKey({
        changeId: "fixLoopLedgerRegressions",
        scope: { kind: "change", scope_key: "review:acceptance" },
        agent: "adv-reviewer",
        attempt: 3,
      }),
    ).toBe("fixLoopLedgerRegressions|change:review:acceptance|adv-reviewer|3");
  });

  it("falls back to unknown-scope when neither taskId nor scope is present", () => {
    expect(
      subagentReportKey({
        changeId: "fixLoopLedgerRegressions",
        agent: "adv-tron",
        attempt: 1,
      }),
    ).toBe("fixLoopLedgerRegressions|unknown-scope|adv-tron|1");
  });
});

describe("apply_context binding hint", () => {
  it("buildApplyContextBindingHint returns the required path and a minimal valid example", () => {
    const hint = buildApplyContextBindingHint();
    expect(hint.path).toBe("apply_context.implementation_cycle_id");
    expect(hint.example).toContain("implementation_cycle_id");
    expect(hint.example).toContain("implementation_provenance");
    expect(
      SubagentApplyContextSchema.safeParse(JSON.parse(hint.example)).success,
    ).toBe(true);
  });

  it("formatApplyContextBindingHint renders the path and example for appending to messages", () => {
    const formatted = formatApplyContextBindingHint();
    expect(formatted).toContain("apply_context.implementation_cycle_id");
    expect(formatted).toContain("implementation_provenance");
    expect(formatted).toContain("implementation_cycle_id");
    expect(formatted).toContain("report_key");
  });
});

describe("apply_context doc↔schema drift guard (DDC2/SC1)", () => {
  it("validates the canonical adv-designer.md snippet and the binding hint example against SubagentApplyContextSchema", () => {
    const docPath = fileURLToPath(
      new URL("../../../.opencode/agents/adv-designer.md", import.meta.url),
    );
    const doc = readFileSync(docPath, "utf8");
    const section = doc.split("## Apply Context Binding")[1];
    expect(section).toBeDefined();

    const blockMatch = section!.match(/```json\s*([\s\S]*?)\s*```/);
    expect(blockMatch).toBeTruthy();

    const objectMatch = blockMatch![1].match(/\{[\s\S]*\}/);
    expect(objectMatch).toBeTruthy();

    const snippet = JSON.parse(objectMatch![0]);
    expect(SubagentApplyContextSchema.safeParse(snippet).success).toBe(true);

    const hint = buildApplyContextBindingHint();
    expect(
      SubagentApplyContextSchema.safeParse(JSON.parse(hint.example)).success,
    ).toBe(true);
  });
});

describe("per-lane size bounds (AC1/SC2 — boundSubAgentReportContract)", () => {
  const over = (n: number): string => "x".repeat(n);

  it("rejects an adv-researcher report whose architecture_assessment exceeds the lane bound (12000)", () => {
    const result = ResearcherSubagentReportSchema.safeParse({
      ...researcherReport,
      architecture_assessment: over(12001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          /architecture_assessment/.test(i.path.join(".")),
        ),
      ).toBe(true);
    }
  });

  it("rejects an adv-engineer report whose context_update exceeds the lane bound (4000)", () => {
    const result = EngineerSubagentReportSchema.safeParse({
      ...engineerReport,
      context_update_for_adv: {
        ...engineerReport.context_update_for_adv,
        what_ads_needs_to_know: over(4001),
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          /what_ads_needs_to_know/.test(i.path.join(".")),
        ),
      ).toBe(true);
    }
  });

  it("rejects an adv-reviewer report whose verification.evidence exceeds the lane bound (4000)", () => {
    const result = ReviewerSubagentReportSchema.safeParse({
      ...reviewerReport,
      verification: { ...reviewerReport.verification, evidence: over(4001) },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /evidence/.test(i.path.join("."))),
      ).toBe(true);
    }
  });

  it("rejects an adv-designer report whose related_scan exceeds the lane bound (4000)", () => {
    const result = DesignerSubagentReportSchema.safeParse({
      ...designerReport,
      related_scan: over(4001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /related_scan/.test(i.path.join("."))),
      ).toBe(true);
    }
  });

  it("accepts the conforming fixtures unchanged (SC2 — no false rejection)", () => {
    expect(
      ResearcherSubagentReportSchema.safeParse(researcherReport).success,
    ).toBe(true);
    expect(EngineerSubagentReportSchema.safeParse(engineerReport).success).toBe(
      true,
    );
    expect(ReviewerSubagentReportSchema.safeParse(reviewerReport).success).toBe(
      true,
    );
    expect(DesignerSubagentReportSchema.safeParse(designerReport).success).toBe(
      true,
    );
  });

  it("accepts a researcher report at the bound ceiling (12000 chars exactly)", () => {
    const result = ResearcherSubagentReportSchema.safeParse({
      ...researcherReport,
      architecture_assessment: over(12000),
    });
    expect(result.success).toBe(true);
  });
});
