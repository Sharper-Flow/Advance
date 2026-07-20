/**
 * AC2 archive-through fixture test for ChangeSchema.
 *
 * Proves that `ChangeSchema.parse` (the read path used by archive
 * conflict-inventory) accepts a change whose subagent_reports contain a legacy
 * researcher:design-validation report with plain-string blockers. Before
 * makeLegacyDesignValidation, this shape was rejected by check-3 and blocked
 * archive load with CONFLICT_INVENTORY_BLOCKED → Schema validation failed.
 */

import { describe, expect, it } from "vitest";

import { ChangeSchema } from "./changes";

const minimalValidChange = {
  id: "fixPlaywrightSessionIsolation",
  title: "Fix Playwright session isolation",
  status: "draft" as const,
  created_at: "2026-01-01T00:00:00.000Z",
  tasks: [],
  deltas: {},
};

const researcherReport = {
  schema_version: "1.0" as const,
  change_id: "fixPlaywrightSessionIsolation",
  scope: { kind: "change" as const, scope_key: "researcher:temporal-docs" },
  attempt: 1,
  agent: "adv-researcher" as const,
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
    status: "caution" as const,
    blockers: [],
    notes: "Versioning needed for legacy key replay.",
  },
  architecture_judgement: {
    applicability: "applicable" as const,
    confidence: "medium" as const,
    risk: "medium" as const,
    tradeoffs: ["Sidecar reports add another query surface to maintain."],
    alternatives_considered: [
      {
        option: "Persist raw transcript only",
        disposition: "rejected" as const,
        rationale: "Raw transcript persistence is not queryable enough.",
      },
    ],
    recommendation: "Use typed sidecar judgement fields.",
  },
  recommendation: "Use deterministic scope keys.",
  follow_ups: ["Add replay regression test"],
  workdir_used: "/tmp/worktree",
};

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

describe("ChangeSchema archive-through fixtures", () => {
  it("ChangeSchema accepts a change with legacy string design-validation blockers matching the wedged fixPlaywrightSessionIsolation shape (AC2)", () => {
    // Reproduces the wedged shape: a change whose subagent_reports contain
    // researcher:design-validation-scoped reports with plain-string blockers
    // (the format written before typed-blocker enforcement landed).
    // Before makeLegacyDesignValidation, ChangeSchema.parse rejected this
    // shape via check-3 superRefine, blocking archive conflict-inventory
    // load with CONFLICT_INVENTORY_BLOCKED → Schema validation failed.
    const wedgedReport = {
      ...researcherReport,
      scope: {
        kind: "change" as const,
        scope_key: "researcher:design-validation",
      },
      validation: {
        status: "fail" as const,
        blockers: [
          "First historical string blocker from failed design-validation attempt.",
          "Second historical string blocker from failed design-validation attempt.",
        ],
        notes: "Historical failed-attempt report (pre-typed-blocker schema).",
      },
      architecture_judgement: applicableJudgement,
    };

    const wedgedChange = {
      ...minimalValidChange,
      // Simulate a change at acceptance-done state (all gates done) with
      // legacy string-blocker reports — the exact shape that wedged archive.
      gates: {
        proposal: { status: "done" as const },
        discovery: { status: "done" as const },
        design: { status: "done" as const },
        planning: { status: "done" as const },
        execution: { status: "done" as const },
        acceptance: { status: "done" as const },
        release: { status: "pending" as const },
      },
      subagent_reports: [wedgedReport],
    };

    // This parse previously threw: "new design-validation blockers require
    // typed contract IDs, in-scope remediation, and source evidence"
    // After makeLegacyDesignValidation, it succeeds:
    const parsed = ChangeSchema.parse(wedgedChange);
    expect(parsed.subagent_reports).toHaveLength(1);
    expect(parsed.subagent_reports[0].validation.blockers).toEqual([
      "First historical string blocker from failed design-validation attempt.",
      "Second historical string blocker from failed design-validation attempt.",
    ]);
  });
});
