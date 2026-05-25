import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  ChangeReportScopeKeySchema,
  EngineerSubagentReportSchema,
  getSubagentReportPacketAnchors,
  type PersistedSubagentReportAgent,
  ResearcherSubagentReportSchema,
  ReviewerSubagentReportSchema,
  ScannerBundleSubagentReportSchema,
  ScopedSubagentReportSchema,
  SUBAGENT_REPORT_FIELD_SOURCES,
  SUBAGENT_REPORT_PACKET_ANCHORS,
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
  follow_ups: [],
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
  });

  it("keeps optimized handoff agent literals in the supported surface", () => {
    expect(SubagentAgentSchema.options).toEqual([
      "adv-engineer",
      "adv-reviewer",
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
    expect(() => ChangeReportScopeKeySchema.parse("freeform")).toThrow();
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
  });
});
