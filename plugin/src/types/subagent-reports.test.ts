import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  EngineerSubagentReportSchema,
  getSubagentReportPacketAnchors,
  type PersistedSubagentReportAgent,
  ReviewerSubagentReportSchema,
  SUBAGENT_REPORT_FIELD_SOURCES,
  SUBAGENT_REPORT_PACKET_ANCHORS,
  SubagentAgentSchema,
  SupportedSubagentReportSchema,
} from "./subagent-reports";

const engineerReport = {
  schema_version: "1.0",
  change_id: "persistSubagentReports",
  task_id: "tk-abc123",
  attempt: 1,
  agent: "adv-engineer",
  scope: "Add typed report schema",
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
  attempt: 2,
  agent: "adv-reviewer",
  phase: "review",
  scope: "Review typed report ingest",
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
];

describe("Subagent report schemas", () => {
  it("parses a strict engineer report", () => {
    const parsed = EngineerSubagentReportSchema.parse(engineerReport);

    expect(parsed.agent).toBe("adv-engineer");
    expect(parsed.attempt).toBe(1);
    expect(parsed.verification[0].exit_code).toBe(0);
  });

  it("parses a strict reviewer report", () => {
    const parsed = ReviewerSubagentReportSchema.parse(reviewerReport);

    expect(parsed.agent).toBe("adv-reviewer");
    expect(parsed.verdict).toBe("READY");
    expect(parsed.verification.results).toBe("pass");
  });

  it("rejects unknown fields at the report boundary", () => {
    expect(() =>
      EngineerSubagentReportSchema.parse({
        ...engineerReport,
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

  it("rejects reserved agents from the v1 supported report union", () => {
    expect(() =>
      SupportedSubagentReportSchema.parse({
        ...engineerReport,
        agent: "adv-researcher",
      }),
    ).toThrow();
  });

  it("keeps reserved agent literals in the forward-compatible surface", () => {
    expect(SubagentAgentSchema.options).toEqual([
      "adv-engineer",
      "adv-reviewer",
      "adv-researcher",
      "adv-tron",
    ]);
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

    it("keeps engineer packet anchors aligned with ENGINEER_REPORT identity fields", () => {
      expect(getSubagentReportPacketAnchors("adv-engineer")).toEqual([
        "ATTEMPT",
        "CHANGE",
        "TASK",
        "WORKING DIRECTORY",
      ]);
    });

    it("keeps reviewer packet anchors aligned with REVIEWER_REPORT identity fields", () => {
      expect(getSubagentReportPacketAnchors("adv-reviewer")).toEqual([
        "ATTEMPT",
        "CHANGE",
        "PHASE",
        "TASK",
        "WORKING DIRECTORY",
      ]);
    });
  });
});
