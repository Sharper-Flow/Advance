/**
 * Command Requirement Citation Preservation
 *
 * Durable executable-source citations for spec requirements that were
 * previously cited ONLY by `.opencode/command/adv-*.md` trace tags
 * (`<!-- rq-{id} -->` / `rq-{id}` markers). The removeCommandTraceTags
 * change strips those tags; this file preserves the citation so the
 * spec-citation invariant (plugin/src/__tests__/spec-citation-invariant.test.ts)
 * keeps passing after command-tag deletion.
 *
 * Generation: enumerated by diffing `rq-` IDs cited under
 * `.opencode/command/adv-*.md` against IDs cited under `plugin/src/`.
 * Any ID present in the former but absent from the latter is anchored here.
 *
 * Maintenance rule: if a requirement below is removed from its spec.json,
 * delete the matching `// rq-{id}` comment AND the matching entry in
 * PRESERVED_IDS. The regression test enforces the two stay in lockstep
 * with the spec.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

interface PreservedCitation {
  id: string;
  capability: string;
  title: string;
}

// advance-workflow citations (12):
//   rq-acceptanceEvidenceTiming01: Acceptance Proof Exists Before Approval Prompt
//   rq-acceptanceRecovery01: Audited Acceptance Evidence Recovery
//   rq-ambiguityScan04: clarify_enforcement disables ambiguity detection
//   rq-ambiguityScan05: Informational remediation handoff for ambiguity
//   rq-approvalConsequenceContext01: Approval Consequence Context at Final HITL Checkpoints
//   rq-hardenReadinessCarryForward01: Harden Readiness Evidence Carries Forward to Archive Sign-Off
//   rq-releaseFinalization04: Auto-Drive Non-Terminal Reporting
//   rq-remediation01: Validated In-Scope Findings Resolved In-Change
//   rq-scopeDiscoveryProtocol01: Inline-Approval Protocol for Non-Campsite Scope Discovery
//   rq-scopeFollowupSchema01: Fast-Follow Schema Contract
//   rq-scopeFollowupSurfacing01: Lineage Display in List, Show, and Status
//   rq-touchedScope01: Touched-Scope Quality Ownership
//
// delegation-defaults citations (1):
//   rq-delDefaults08: Designer Delegation Receives Visual Context
//
// adv-discover citations (15):
//   rq-disc01: Discovery Checklist Enforcement
//   rq-disc02: Phase 1.5 Skill Discovery Enforcement
//   rq-disc03: Prior Research Extension
//   rq-disc04: Conflict and Related-Work Scan
//   rq-disc05: Edge Case Investigation
//   rq-disc06: Design Question Depth
//   rq-disc07: Draft Spec Delta Shapes
//   rq-disc08: P25 Related-Pattern Scan
//   rq-disc10: Gated External-Solution Check
//   rq-disc11: Discovery-Owned Agreement Sign-Off
//   rq-disc12: Explicit Acceptance Criteria Checkpoint
//   rq-sc01: Skill Gap Detection
//   rq-sc02: Skill Assembly and Persistence
//   rq-sc03: Use-and-Notify Pattern
//
// adv-prep citations (5):
//   rq-prep-neg1: Prep Prohibited Actions
//   rq-prep-out1: Prep Is the Sole Task Creator
//   rq-prep-scope1: Prep Runs Gap Analysis and Task Synthesis
//   rq-prep-synth1: Task Synthesis from Research Output
//   rq-prepArtifactExcerpt01: Prep Approval Surfaces Source Artifact Excerpts
//
// adv-proposal citations (4):
//   rq-prop-context2: Problem Statement Agreement for adv-proposal
//   rq-prop-neg1: Proposal Prohibited Actions
//   rq-prop-out1: Proposal Produces Alignment Artifacts Only
//   rq-prop-scope1: Proposal Focuses on Problem Agreement
//
// slop-scan citations (8):
//   rq-ss001: AST-First Detection Strategy
//   rq-ss002: Configurable Detection Thresholds
//   rq-ss003: Defensive Overkill Detection
//   rq-ss004: Always-On Structured Output Fields
//   rq-ss005: Dead Code Tool Preference
//   rq-ss006: False-Positive Confidence and Actionability Control
//   rq-ss007: Low-Confidence Finding Grouping
//   rq-ss008: Context-Window Suppression
const PRESERVED_IDS: PreservedCitation[] = [
  // advance-workflow
  {
    id: "rq-acceptanceEvidenceTiming01",
    capability: "advance-workflow",
    title: "Acceptance Proof Exists Before Approval Prompt",
  },
  {
    id: "rq-acceptanceRecovery01",
    capability: "advance-workflow",
    title: "Audited Acceptance Evidence Recovery",
  },
  {
    id: "rq-ambiguityScan04",
    capability: "advance-workflow",
    title: "clarify_enforcement disables ambiguity detection",
  },
  {
    id: "rq-ambiguityScan05",
    capability: "advance-workflow",
    title: "Informational remediation handoff for ambiguity",
  },
  {
    id: "rq-approvalConsequenceContext01",
    capability: "advance-workflow",
    title: "Approval Consequence Context at Final HITL Checkpoints",
  },
  {
    id: "rq-hardenReadinessCarryForward01",
    capability: "advance-workflow",
    title: "Harden Readiness Evidence Carries Forward to Archive Sign-Off",
  },
  {
    id: "rq-releaseFinalization04",
    capability: "advance-workflow",
    title: "Auto-Drive Non-Terminal Reporting",
  },
  {
    id: "rq-remediation01",
    capability: "advance-workflow",
    title: "Validated In-Scope Findings Resolved In-Change",
  },
  {
    id: "rq-scopeDiscoveryProtocol01",
    capability: "advance-workflow",
    title: "Inline-Approval Protocol for Non-Campsite Scope Discovery",
  },
  {
    id: "rq-scopeFollowupSchema01",
    capability: "advance-workflow",
    title: "Fast-Follow Schema Contract",
  },
  {
    id: "rq-scopeFollowupSurfacing01",
    capability: "advance-workflow",
    title: "Lineage Display in List, Show, and Status",
  },
  {
    id: "rq-touchedScope01",
    capability: "advance-workflow",
    title: "Touched-Scope Quality Ownership",
  },
  // delegation-defaults
  {
    id: "rq-delDefaults08",
    capability: "delegation-defaults",
    title: "Designer Delegation Receives Visual Context",
  },
  // adv-discover
  {
    id: "rq-disc01",
    capability: "adv-discover",
    title: "Discovery Checklist Enforcement",
  },
  {
    id: "rq-disc02",
    capability: "adv-discover",
    title: "Phase 1.5 Skill Discovery Enforcement",
  },
  {
    id: "rq-disc03",
    capability: "adv-discover",
    title: "Prior Research Extension",
  },
  {
    id: "rq-disc04",
    capability: "adv-discover",
    title: "Conflict and Related-Work Scan",
  },
  {
    id: "rq-disc05",
    capability: "adv-discover",
    title: "Edge Case Investigation",
  },
  {
    id: "rq-disc06",
    capability: "adv-discover",
    title: "Design Question Depth",
  },
  {
    id: "rq-disc07",
    capability: "adv-discover",
    title: "Draft Spec Delta Shapes",
  },
  {
    id: "rq-disc08",
    capability: "adv-discover",
    title: "P25 Related-Pattern Scan",
  },
  {
    id: "rq-disc10",
    capability: "adv-discover",
    title: "Gated External-Solution Check",
  },
  {
    id: "rq-disc11",
    capability: "adv-discover",
    title: "Discovery-Owned Agreement Sign-Off",
  },
  {
    id: "rq-disc12",
    capability: "adv-discover",
    title: "Explicit Acceptance Criteria Checkpoint",
  },
  {
    id: "rq-sc01",
    capability: "adv-discover",
    title: "Skill Gap Detection",
  },
  {
    id: "rq-sc02",
    capability: "adv-discover",
    title: "Skill Assembly and Persistence",
  },
  {
    id: "rq-sc03",
    capability: "adv-discover",
    title: "Use-and-Notify Pattern",
  },
  // adv-prep
  {
    id: "rq-prep-neg1",
    capability: "adv-prep",
    title: "Prep Prohibited Actions",
  },
  {
    id: "rq-prep-out1",
    capability: "adv-prep",
    title: "Prep Is the Sole Task Creator",
  },
  {
    id: "rq-prep-scope1",
    capability: "adv-prep",
    title: "Prep Runs Gap Analysis and Task Synthesis",
  },
  {
    id: "rq-prep-synth1",
    capability: "adv-prep",
    title: "Task Synthesis from Research Output",
  },
  {
    id: "rq-prepArtifactExcerpt01",
    capability: "adv-prep",
    title: "Prep Approval Surfaces Source Artifact Excerpts",
  },
  // adv-proposal
  {
    id: "rq-prop-context2",
    capability: "adv-proposal",
    title: "Problem Statement Agreement for adv-proposal",
  },
  {
    id: "rq-prop-neg1",
    capability: "adv-proposal",
    title: "Proposal Prohibited Actions",
  },
  {
    id: "rq-prop-out1",
    capability: "adv-proposal",
    title: "Proposal Produces Alignment Artifacts Only",
  },
  {
    id: "rq-prop-scope1",
    capability: "adv-proposal",
    title: "Proposal Focuses on Problem Agreement",
  },
  // slop-scan
  {
    id: "rq-ss001",
    capability: "slop-scan",
    title: "AST-First Detection Strategy",
  },
  {
    id: "rq-ss002",
    capability: "slop-scan",
    title: "Configurable Detection Thresholds",
  },
  {
    id: "rq-ss003",
    capability: "slop-scan",
    title: "Defensive Overkill Detection",
  },
  {
    id: "rq-ss004",
    capability: "slop-scan",
    title: "Always-On Structured Output Fields",
  },
  {
    id: "rq-ss005",
    capability: "slop-scan",
    title: "Dead Code Tool Preference",
  },
  {
    id: "rq-ss006",
    capability: "slop-scan",
    title: "False-Positive Confidence and Actionability Control",
  },
  {
    id: "rq-ss007",
    capability: "slop-scan",
    title: "Low-Confidence Finding Grouping",
  },
  {
    id: "rq-ss008",
    capability: "slop-scan",
    title: "Context-Window Suppression",
  },
];

describe("command requirement citation preservation", () => {
  test("preserved count matches inventory (44 IDs)", () => {
    expect(PRESERVED_IDS).toHaveLength(44);
  });

  test("every preserved ID still exists in its capability spec.json", () => {
    const failures: string[] = [];
    for (const { id, capability, title } of PRESERVED_IDS) {
      const specPath = join(
        REPO_ROOT,
        ".adv",
        "specs",
        capability,
        "spec.json",
      );
      let spec: { requirements: Array<{ id: string; title: string }> };
      try {
        spec = JSON.parse(readFileSync(specPath, "utf8"));
      } catch (err) {
        failures.push(`${id}: cannot load ${specPath}: ${err}`);
        continue;
      }
      const req = spec.requirements.find((r) => r.id === id);
      if (!req) {
        failures.push(
          `${id} [${capability}]: not found in spec.json — remove this preserved citation`,
        );
        continue;
      }
      if (req.title !== title) {
        failures.push(
          `${id} [${capability}]: title drift — expected "${title}", got "${req.title}"`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  test("preserved IDs are unique", () => {
    const ids = PRESERVED_IDS.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
