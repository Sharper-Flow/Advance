/**
 * Briefing Fact Classifier Tests
 *
 * Proves that durable-fact classification is structural: every outcome maps to
 * a typed report field, and no outcome is inferred from free-text keywords.
 */

import { describe, expect, it } from "vitest";
import {
  EngineerSubagentReportSchema,
  ReviewerSubagentReportSchema,
  ScannerBundleSubagentReportSchema,
  type EngineerSubagentReport,
  type ReviewerSubagentReport,
  type ScannerBundleSubagentReport,
  type BriefingFactOutcome,
} from "../types";
import {
  classifyBriefingFacts,
  type BriefingFactClassifierInput,
} from "./briefing-fact-classifier";

function engineerReport(
  overrides: Partial<EngineerSubagentReport> = {},
): EngineerSubagentReport {
  return EngineerSubagentReportSchema.parse({
    schema_version: "1.0",
    change_id: "addBriefingPackets",
    task_id: "tk-engineer",
    attempt: 1,
    workdir_used: "/tmp/wt",
    scope: { kind: "task", task_id: "tk-engineer" },
    agent: "adv-engineer",
    status: "complete",
    files_touched: ["src/a.ts"],
    verification: [
      { command: "pnpm test", exit_code: 0, summary: "All tests pass" },
    ],
    decisions: [],
    blockers: [],
    scope_drift: null,
    follow_ups: [],
    required_follow_ups: [],
    required_main_agent_actions: [],
    related_scan: "none",
    context_update_for_adv: {
      what_ads_needs_to_know: "Renderer is ready",
      suggested_next_action: "Wire renderer into adv_change_show",
    },
    ...overrides,
  });
}

function reviewerReport(
  overrides: Partial<ReviewerSubagentReport> = {},
): ReviewerSubagentReport {
  return ReviewerSubagentReportSchema.parse({
    schema_version: "1.0",
    change_id: "addBriefingPackets",
    task_id: "tk-reviewer",
    attempt: 1,
    workdir_used: "/tmp/wt",
    scope: { kind: "task", task_id: "tk-reviewer" },
    agent: "adv-reviewer",
    phase: "review",
    verdict: "READY",
    blocking_findings: [],
    nonblocking_findings: [],
    changes_made: [],
    wisdom_candidates: [],
    verification: {
      tests_run: ["pnpm test"],
      results: "pass",
      evidence: "CI green",
    },
    scope_drift: null,
    risks: [],
    required_main_agent_actions: [],
    required_follow_ups: [],
    ...overrides,
  });
}

function scannerBundleReport(
  overrides: Partial<ScannerBundleSubagentReport> = {},
): ScannerBundleSubagentReport {
  return ScannerBundleSubagentReportSchema.parse({
    schema_version: "1.0",
    change_id: "addBriefingPackets",
    attempt: 1,
    workdir_used: "/tmp/wt",
    scope: { kind: "change", scope_key: "scanner-bundle:scan" },
    agent: "adv-scanner-bundle",
    phase: "review",
    scanner_count: 1,
    dimensions: ["security"],
    summary: "Clean scan",
    findings: [],
    follow_ups: [],
    ...overrides,
  });
}

function outcomes(
  facts: ReturnType<typeof classifyBriefingFacts>,
): BriefingFactOutcome[] {
  return facts.map((f) => f.outcome);
}

function sourceLabels(
  facts: ReturnType<typeof classifyBriefingFacts>,
): string[] {
  return facts.map((f) => f.source_label);
}

describe("classifyBriefingFacts", () => {
  it("classifies context_update_for_adv as transient prompt context", () => {
    const facts = classifyBriefingFacts({ report: engineerReport() });
    expect(outcomes(facts)).toContain("transient_prompt_context");
    const fact = facts.find((f) => f.source_label === "context_update_for_adv");
    expect(fact).toBeDefined();
    expect(fact?.outcome).toBe("transient_prompt_context");
    expect(fact?.content).toMatch(/Renderer is ready/);
    expect(fact?.content).toMatch(/Wire renderer into adv_change_show/);
  });

  it("classifies plain follow_ups as agenda items", () => {
    const facts = classifyBriefingFacts({
      report: engineerReport({ follow_ups: ["Add docs", "Update examples"] }),
    });
    expect(outcomes(facts)).toContain("agenda");
    const agenda = facts.filter((f) => f.outcome === "agenda");
    expect(agenda.map((f) => f.content)).toEqual([
      "Add docs",
      "Update examples",
    ]);
    expect(sourceLabels(agenda).every((l) => l === "follow_ups")).toBe(true);
  });

  it("classifies required_follow_ups as agenda items and preserves source_contract_id", () => {
    const facts = classifyBriefingFacts({
      report: engineerReport({
        required_follow_ups: [
          {
            text: "Update AC2 wording",
            obligation_class: "required_standard",
            severity: "high",
            source_contract_id: "AC2",
          },
        ],
      }),
    });
    const fact = facts.find((f) => f.source_label === "required_follow_ups");
    expect(fact).toBeDefined();
    expect(fact?.outcome).toBe("agenda");
    expect(fact?.content).toBe("Update AC2 wording");
    expect(fact?.source_ref).toBe("AC2");
  });

  it("classifies required_main_agent_actions as unresolved actions", () => {
    const facts = classifyBriefingFacts({
      report: engineerReport({
        required_main_agent_actions: ["Review diff", "Approve contract"],
      }),
    });
    const unresolved = facts.filter(
      (f) => f.source_label === "required_main_agent_actions",
    );
    expect(unresolved.map((f) => f.content)).toEqual([
      "Review diff",
      "Approve contract",
    ]);
    expect(unresolved.every((f) => f.outcome === "unresolved_action")).toBe(
      true,
    );
  });

  it("classifies reviewer wisdom_candidates as wisdom candidates", () => {
    const facts = classifyBriefingFacts({
      report: reviewerReport({
        wisdom_candidates: [
          { type: "pattern", content: "Use zod strict objects" },
          { type: "gotcha", content: "Bun/Node runtime split" },
        ],
      }),
    });
    const wisdom = facts.filter((f) => f.outcome === "wisdom_candidate");
    expect(wisdom).toHaveLength(2);
    expect(wisdom[0].content).toMatch(/\[pattern\] Use zod strict objects/);
    expect(wisdom.every((f) => f.source_label === "wisdom_candidates")).toBe(
      true,
    );
  });

  it("classifies scanner bundle follow_ups as agenda items", () => {
    const facts = classifyBriefingFacts({
      report: scannerBundleReport({
        follow_ups: ["Schedule security re-scan"],
      }),
    });
    const fact = facts.find((f) => f.source_label === "follow_ups");
    expect(fact).toBeDefined();
    expect(fact?.outcome).toBe("agenda");
    expect(fact?.content).toBe("Schedule security re-scan");
  });

  it("classifies explicit typed facts into requested outcomes", () => {
    const facts = classifyBriefingFacts({
      report: engineerReport({ follow_ups: [] }),
      explicitFacts: [
        {
          outcome: "spec_delta_candidate",
          source_label: "engineer.explicit",
          content: "Add spec-delta candidate for briefing fact schema",
        },
      ],
    });
    const fact = facts.find((f) => f.outcome === "spec_delta_candidate");
    expect(fact).toBeDefined();
    expect(fact?.source_label).toBe("engineer.explicit");
    expect(fact?.content).toBe(
      "Add spec-delta candidate for briefing fact schema",
    );
  });

  it("classifies epic membership as an epic terminal note", () => {
    const facts = classifyBriefingFacts({
      report: engineerReport(),
      epicMembership: {
        epic_id: "epicCleanup",
        title: "Cleanup initiative",
        order: 2,
      },
    });
    const fact = facts.find((f) => f.outcome === "epic_terminal_note");
    expect(fact).toBeDefined();
    expect(fact?.source_label).toBe("epic.membership");
    expect(fact?.content).toMatch(/epicCleanup/);
    expect(fact?.content).toMatch(/Cleanup initiative/);
  });

  it("does not infer spec_delta_candidate from free-text follow-up keywords", () => {
    const facts = classifyBriefingFacts({
      report: engineerReport({
        follow_ups: [
          "Promote spec delta candidate",
          "Add briefing packet spec law",
        ],
      }),
    });
    expect(outcomes(facts)).not.toContain("spec_delta_candidate");
    const agenda = facts.filter((f) => f.outcome === "agenda");
    expect(agenda).toHaveLength(2);
  });

  it("classifies blockers and scope drift as unresolved actions", () => {
    const facts = classifyBriefingFacts({
      report: engineerReport({
        blockers: [
          { what: "Temporal workflow missing", diagnosis: "Need signal" },
        ],
        scope_drift: {
          items: ["Extra file"],
          details: "Touched out-of-scope file",
          recommendation: "stop_and_report",
        },
      }),
    });
    const unresolved = facts.filter((f) => f.outcome === "unresolved_action");
    expect(unresolved.map((f) => f.source_label)).toEqual(
      expect.arrayContaining(["blockers", "scope_drift"]),
    );
  });

  it("classifies reviewer changes_made and verification as archive-only evidence", () => {
    const facts = classifyBriefingFacts({
      report: reviewerReport({
        changes_made: [
          {
            file: "src/a.ts",
            summary: "Refactored helper",
            verification: "pnpm test passes",
          },
        ],
      }),
    });
    const archive = facts.filter((f) => f.outcome === "archive_only_evidence");
    expect(archive.map((f) => f.source_label)).toEqual(
      expect.arrayContaining(["changes_made", "verification"]),
    );
  });

  it("produces deterministic ids for the same report", () => {
    const input: BriefingFactClassifierInput = {
      report: engineerReport({
        follow_ups: ["A"],
        required_main_agent_actions: ["B"],
      }),
    };
    const a = classifyBriefingFacts(input).map((f) => f.id);
    const b = classifyBriefingFacts(input).map((f) => f.id);
    expect(a).toEqual(b);
  });

  it("assigns stable ids from source label, report ref, and index", () => {
    const facts = classifyBriefingFacts({
      report: engineerReport({ follow_ups: ["X", "Y"] }),
    });
    const agenda = facts.filter((f) => f.outcome === "agenda");
    expect(agenda[0].id).not.toBe(agenda[1].id);
    expect(agenda[0].id).toMatch(/^follow_ups:/);
  });
});
