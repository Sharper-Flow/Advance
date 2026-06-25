import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  ChangeReportScopeKeySchema,
  DesignerSubagentReportSchema,
  EngineerSubagentReportSchema,
  getSubagentReportPacketAnchors,
  normalizePersistedSubagentReportState,
  type PersistedSubagentReportAgent,
  RequiredFollowUpSchema,
  ResearcherSubagentReportSchema,
  ReviewerSubagentReportSchema,
  ScannerBundleSubagentReportSchema,
  ScopedSubagentReportSchema,
  SUBAGENT_REPORT_FIELD_SOURCES,
  SUBAGENT_REPORT_PACKET_ANCHORS,
  SUBAGENT_WARN_FIRST_PACKET_ANCHORS,
  SubagentAgentSchema,
  TronSubagentReportSchema,
} from "./subagent-reports";

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
  recommendation: "Use deterministic scope keys.",
  follow_ups: ["Add replay regression test"],
  workdir_used: "/tmp/worktree",
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
    expect(() =>
      EngineerSubagentReportSchema.parse({
        ...engineerReport,
        scope_drift: undefined,
        required_main_agent_actions: undefined,
      }),
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
          notes: "Static icon-only change; no responsive layout behavior affected.",
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
