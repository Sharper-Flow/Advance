/**
 * Briefing Fact Classifier Tests
 *
 * Proves that durable-fact classification is structural: every outcome maps to
 * a typed report field, and no outcome is inferred from free-text keywords.
 */

import { describe, expect, it } from "vitest";
import {
  EngineerSubagentReportSchema,
  ResearcherSubagentReportSchema,
  ReviewerSubagentReportSchema,
  ScannerBundleSubagentReportSchema,
  VerificationTriageBundleSubagentReportSchema,
  type EngineerSubagentReport,
  type ResearcherSubagentReport,
  type ReviewerSubagentReport,
  type ScannerBundleSubagentReport,
  type VerificationTriageBundleSubagentReport,
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

function researcherReport(
  overrides: Partial<ResearcherSubagentReport> = {},
): ResearcherSubagentReport {
  return ResearcherSubagentReportSchema.parse({
    schema_version: "1.0",
    change_id: "addBriefingPackets",
    attempt: 1,
    workdir_used: "/tmp/wt",
    scope: { kind: "change", scope_key: "researcher:topic" },
    agent: "adv-researcher",
    topic: "Research topic",
    sources: [
      {
        label: "Source A",
        locator: "https://example.com/a",
        summary: "Summary A",
      },
    ],
    architecture_assessment: "Assessment text",
    validation: {
      status: "pass",
      blockers: [],
      notes: "Notes",
    },
    architecture_judgement: {
      applicability: "not_applicable",
      confidence: "high",
      reason: "Topic does not require architecture judgement",
      recommendation: "Proceed",
    },
    recommendation: "Recommendation text",
    follow_ups: [],
    ...overrides,
  });
}

function verificationTriageBundleReport(
  overrides: Partial<VerificationTriageBundleSubagentReport> = {},
): VerificationTriageBundleSubagentReport {
  return VerificationTriageBundleSubagentReportSchema.parse({
    schema_version: "1.0",
    change_id: "addBriefingPackets",
    attempt: 1,
    workdir_used: "/tmp/wt",
    scope: { kind: "change", scope_key: "verifier:local-verify" },
    agent: "adv-verification-triage-bundle",
    phase: "local_verify",
    targets: [
      {
        kind: "command",
        command: "bin/oc-test targeted -- src/a.test.ts",
        exit_code: 1,
        duration_ms: 1000,
      },
    ],
    status: "fail",
    error_class: "SEMANTIC",
    confidence: "high",
    evidence_basis: "Deterministic assertion failure.",
    findings: [
      {
        id: "v-1",
        severity: "blocker",
        summary: "Assertion failed.",
        evidence: [
          {
            label: "test output",
            locator: "src/a.test.ts:10",
            summary: "fail",
          },
        ],
      },
    ],
    recommended_next_action: "route_adv_engineer",
    scope_risk: false,
    suggested_handoff: {
      summary: "Fix assertion.",
      in_scope: ["src/a.ts"],
      out_of_scope: [],
      done_when: ["Test passes."],
      verification: ["bin/oc-test targeted -- src/a.test.ts"],
    },
    required_main_agent_actions: [],
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

  it("classifies plain follow_ups as report_follow_up items", () => {
    const facts = classifyBriefingFacts({
      report: engineerReport({ follow_ups: ["Add docs", "Update examples"] }),
    });
    expect(outcomes(facts)).toContain("report_follow_up");
    const followUps = facts.filter((f) => f.outcome === "report_follow_up");
    expect(followUps.map((f) => f.content)).toEqual([
      "Add docs",
      "Update examples",
    ]);
    expect(sourceLabels(followUps).every((l) => l === "follow_ups")).toBe(true);
  });

  it("classifies required_follow_ups as report_follow_up items and preserves source_contract_id", () => {
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
    expect(fact?.outcome).toBe("report_follow_up");
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

  it("classifies scanner bundle follow_ups as report_follow_up items", () => {
    const facts = classifyBriefingFacts({
      report: scannerBundleReport({
        follow_ups: ["Schedule security re-scan"],
      }),
    });
    const fact = facts.find((f) => f.source_label === "follow_ups");
    expect(fact).toBeDefined();
    expect(fact?.outcome).toBe("report_follow_up");
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
    const followUps = facts.filter((f) => f.outcome === "report_follow_up");
    expect(followUps).toHaveLength(2);
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
    const followUps = facts.filter((f) => f.outcome === "report_follow_up");
    expect(followUps[0].id).not.toBe(followUps[1].id);
    expect(followUps[0].id).toMatch(/^follow_ups:/);
  });

  // ===========================================================================
  // AC4/SC3 — Bounded typed research citations in engineer briefing facts
  // ===========================================================================

  describe("researcher source citation (AC4/SC3)", () => {
    function sources(n: number) {
      return Array.from({ length: n }, (_, i) => ({
        label: `Source ${String.fromCharCode(65 + i)}`,
        locator: `https://example.com/${i}`,
        summary: `Summary ${String.fromCharCode(65 + i)}`,
      }));
    }

    it("renders researcher sources as research_citation facts in stable report order", () => {
      const facts = classifyBriefingFacts({
        report: researcherReport({ sources: sources(3) }),
      });
      const citations = facts.filter((f) => f.outcome === "research_citation");
      expect(citations).toHaveLength(3);
      expect(citations[0].content).toMatch(/Source A/);
      expect(citations[1].content).toMatch(/Source B/);
      expect(citations[2].content).toMatch(/Source C/);
      expect(citations.every((f) => f.source_label === "sources")).toBe(true);
    });

    it("renders a single source as one research_citation fact with no omission marker", () => {
      const facts = classifyBriefingFacts({
        report: researcherReport({ sources: sources(1) }),
      });
      const citations = facts.filter((f) => f.outcome === "research_citation");
      expect(citations).toHaveLength(1);
      expect(citations[0].content).toMatch(/Source A/);
      const omitted = facts.filter((f) => f.source_label === "sources.omitted");
      expect(omitted).toHaveLength(0);
    });

    it("renders exactly 3 research_citation facts with no omission marker at the bound", () => {
      const facts = classifyBriefingFacts({
        report: researcherReport({ sources: sources(3) }),
      });
      const citations = facts.filter((f) => f.outcome === "research_citation");
      expect(citations).toHaveLength(3);
      const omitted = facts.filter((f) => f.source_label === "sources.omitted");
      expect(omitted).toHaveLength(0);
    });

    it("renders at most 3 research_citation facts plus one deterministic omission marker above the bound", () => {
      const facts = classifyBriefingFacts({
        report: researcherReport({ sources: sources(6) }),
      });
      const citations = facts.filter(
        (f) =>
          f.outcome === "research_citation" && f.source_label === "sources",
      );
      expect(citations).toHaveLength(3);
      expect(citations[0].content).toMatch(/Source A/);
      expect(citations[1].content).toMatch(/Source B/);
      expect(citations[2].content).toMatch(/Source C/);

      const omitted = facts.filter((f) => f.source_label === "sources.omitted");
      expect(omitted).toHaveLength(1);
      expect(omitted[0].content).toMatch(/3/);
      expect(omitted[0].outcome).toBe("research_citation");
    });

    it("omission marker content is deterministic for the same source count", () => {
      const reportA = researcherReport({ sources: sources(7) });
      const reportB = researcherReport({ sources: sources(7) });
      const omittedA = classifyBriefingFacts({ report: reportA }).filter(
        (f) => f.source_label === "sources.omitted",
      );
      const omittedB = classifyBriefingFacts({ report: reportB }).filter(
        (f) => f.source_label === "sources.omitted",
      );
      expect(omittedA).toHaveLength(1);
      expect(omittedB).toHaveLength(1);
      expect(omittedA[0].content).toBe(omittedB[0].content);
    });

    it("research_citation facts do not appear as archive_only_evidence for sources", () => {
      const facts = classifyBriefingFacts({
        report: researcherReport({ sources: sources(2) }),
      });
      const sourceArchive = facts.filter(
        (f) =>
          f.outcome === "archive_only_evidence" && f.source_label === "sources",
      );
      expect(sourceArchive).toHaveLength(0);
    });

    it("adds no telemetry, ranking, or usage-tracking fields", () => {
      const facts = classifyBriefingFacts({
        report: researcherReport({ sources: sources(4) }),
      });
      const allowed = new Set([
        "content",
        "dispositioned",
        "id",
        "outcome",
        "source_label",
        "source_ref",
      ]);
      for (const fact of facts) {
        for (const key of Object.keys(fact)) {
          expect(
            allowed.has(key),
            `Unexpected key ${key} on briefing fact (telemetry/tracking forbidden by C1/DONT5)`,
          ).toBe(true);
        }
      }
    });

    it("classifies verifier failure_attribution as archive_only_evidence with locators", () => {
      const facts = classifyBriefingFacts({
        report: verificationTriageBundleReport({
          failure_attribution: {
            assertion: "expected 200 to equal 404",
            test_locator: {
              label: "test",
              locator: "src/a.test.ts:10",
              summary: "GET / returns 404",
            },
            production_locator: {
              label: "production",
              locator: "src/a.ts:5",
              summary: "route handler",
            },
            branch_result: "fail",
            base_result: "pass",
            comparison_status: "compared_clean",
            failure_mode: "assertion_mismatch",
            owner_task: "tk-a123",
            evidence_refs: [
              {
                label: "branch output",
                locator: "command: bin/oc-test targeted -- src/a.test.ts",
                summary: "deterministic assertion failure",
              },
            ],
          },
        }),
      });

      const attribution = facts.filter(
        (f) => f.source_label === "failure_attribution",
      );
      expect(attribution.length).toBeGreaterThan(0);
      expect(attribution[0].outcome).toBe("archive_only_evidence");
      expect(attribution[0].content).toContain("expected 200 to equal 404");
      expect(attribution[0].content).toContain(
        "failure_mode: assertion_mismatch",
      );
      expect(attribution[0].content).toContain("owner_task: tk-a123");

      const testLocator = facts.find(
        (f) => f.source_label === "failure_attribution.test_locator",
      );
      expect(testLocator).toBeDefined();
      expect(testLocator?.outcome).toBe("archive_only_evidence");
      expect(testLocator?.content).toContain("src/a.test.ts:10");

      const prodLocator = facts.find(
        (f) => f.source_label === "failure_attribution.production_locator",
      );
      expect(prodLocator).toBeDefined();
      expect(prodLocator?.outcome).toBe("archive_only_evidence");
      expect(prodLocator?.content).toContain("src/a.ts:5");
    });

    it("keeps architecture_assessment and recommendation in their existing outcomes", () => {
      const facts = classifyBriefingFacts({
        report: researcherReport({ sources: sources(2) }),
      });
      const assessment = facts.find(
        (f) => f.source_label === "architecture_assessment",
      );
      expect(assessment?.outcome).toBe("archive_only_evidence");
      const recommendation = facts.find(
        (f) => f.source_label === "recommendation",
      );
      expect(recommendation?.outcome).toBe("transient_prompt_context");
    });
  });
});
