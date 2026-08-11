/**
 * Regression Test — Bound sub-agent report contract (AC8/AC7)
 *
 * End-to-end regression asserting the silent-destruction defect is closed
 * across all three layers (boundSubAgentReportContract):
 *
 * - AC8: an over-budget lane report is either conforming after one repair
 *   pass (condensed) or an explicit preflight failure — never a silent
 *   excerpt. (Schema-rejection + condensation-acceptance.)
 * - AC7: oversized consumer content is persisted (Layer 2) or honestly
 *   full-dropped (Layer 1) — never the deceptive head-and-tail excerpt that
 *   previously deleted the findings body while preserving the framing.
 *
 * Contract refs: verifies AC8, AC7.
 */

import { describe, test, expect } from "vitest";
import {
  ResearcherSubagentReportSchema,
  RESEARCHER_FIELD_MAX,
} from "../types/subagent-reports";
import { compactToolPart, compactPromptMessages } from "../index";

const over = (n: number): string => "x".repeat(n);

// Minimal valid adv-researcher report fixture.
const validResearcher = {
  schema_version: "1.0",
  change_id: "regressionTest",
  scope: { kind: "change" as const, scope_key: "researcher:regression" },
  attempt: 1,
  agent: "adv-researcher",
  topic: "Regression fixture",
  sources: [
    {
      label: "src",
      locator: "plugin/src/index.ts",
      summary: "consumer transform",
    },
  ],
  architecture_assessment: "Conforming assessment.",
  validation: {
    status: "caution" as const,
    blockers: [],
    notes: "Notes.",
  },
  architecture_judgement: {
    applicability: "applicable" as const,
    confidence: "medium" as const,
    risk: "low" as const,
    tradeoffs: ["one tradeoff"],
    alternatives_considered: [
      { option: "alt", disposition: "rejected" as const, rationale: "no" },
    ],
    recommendation: "Proceed.",
  },
  recommendation: "Ship it.",
  follow_ups: [],
  workdir_used: "/tmp/wt",
};

describe("AC8 — over-budget lane dispatch is explicit failure or conforming-after-repair, never silent", () => {
  test("an over-budget report is rejected at the schema preflight (explicit failure)", () => {
    const overBudget = {
      ...validResearcher,
      architecture_assessment: over(RESEARCHER_FIELD_MAX + 1),
    };
    const result = ResearcherSubagentReportSchema.safeParse(overBudget);
    expect(result.success).toBe(false);
    // Explicit, named rejection — not a silent acceptance.
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toMatch(/exceeds.*bound/i);
    }
  });

  test("a condensed (under-budget) report is accepted — conforming after repair", () => {
    const condensed = {
      ...validResearcher,
      architecture_assessment: over(RESEARCHER_FIELD_MAX), // exactly at ceiling
    };
    expect(ResearcherSubagentReportSchema.safeParse(condensed).success).toBe(
      true,
    );
  });

  test("the conforming fixture is accepted (baseline, no false rejection)", () => {
    expect(
      ResearcherSubagentReportSchema.safeParse(validResearcher).success,
    ).toBe(true);
  });
});

describe("AC7 — oversized consumer content is persisted or full-dropped, never head/tail excerpt", () => {
  const THRESHOLD = 24_000;

  test("the legacy silent head/tail excerpt marker never appears for oversized tool output", () => {
    // A bash dump outside the recency window must NOT produce the old
    // `[ADV:TOOL_OUTPUT_TRUNCATED] ... first 2000 chars ... last 2000 chars`
    // pattern. It must produce the honest full-drop marker instead.
    const messages = [];
    for (let i = 0; i < 8; i++) {
      messages.push({
        info: { role: "user" },
        parts: [{ type: "tool", tool: "bash", output: over(THRESHOLD + 5000) }],
      });
    }
    compactPromptMessages(messages);

    for (let i = 0; i < 2; i++) {
      // Old messages (outside recency) were compacted.
      const out = (messages[i].parts[0] as { output: string }).output;
      expect(out).not.toContain("TOOL_OUTPUT_TRUNCATED");
      expect(out).not.toMatch(/first \d+ chars/);
      expect(out).not.toMatch(/last \d+ chars/);
      expect(out).toMatch(/\[ADV:OUTPUT_DROPPED\]/);
    }
  });

  test("oversized sub-agent (task) returns are persisted, not excerpted", () => {
    const content = over(THRESHOLD + 8000);
    const part = { type: "tool", tool: "task", output: content };
    expect(compactToolPart(part)).toBe(true);
    const out = (part as { output: string }).output;
    // Persisted marker with a path — not a head/tail excerpt.
    expect(out).toMatch(/\[ADV:FALLBACK_RESULT_PERSISTED\]/);
    expect(out).not.toContain("TOOL_OUTPUT_TRUNCATED");
    expect(out).not.toMatch(/first \d+ chars/);
    expect(out).not.toMatch(/last \d+ chars/);
  });

  test("recent oversized content is recency-protected (untouched), never excerpted", () => {
    const content = over(THRESHOLD + 3000);
    const messages = [
      { info: { role: "user" }, parts: [] },
      { info: { role: "user" }, parts: [] },
      {
        info: { role: "user" },
        parts: [{ type: "tool", tool: "bash", output: content }],
      },
    ];
    compactPromptMessages(messages);
    // Most-recent message untouched — no excerpt, no marker.
    expect((messages[2].parts[0] as { output: string }).output).toBe(content);
  });
});
