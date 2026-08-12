/**
 * AC5/AC6/AC7 — Prompt-body to AGENT_TOOL_POLICY binding guard.
 *
 * fixSubagentReportRouting: SC2, AC5, AC6, AC7. Respects C4, DONT5.
 *
 * This test binds every shipped sub-agent prompt body to its declared
 * AGENT_TOOL_POLICY allowed set, so that prose can never silently drift
 * from policy again. The grammar is explicit and fixture-backed (DONT5).
 *
 * Grammar (documented, not heuristic):
 *
 *   1. Strip the generator-owned ADV-GENERATED frontmatter region
 *      (between `# >>> ADV-GENERATED` and `# <<< ADV-GENERATED` markers).
 *      This is tool-list configuration, not call instructions (AC8).
 *   2. Strip fenced code blocks (``` delimited). These contain
 *      illustrative payload schemas, not imperative call instructions.
 *   3. In the remainder, match identifiers `adv_[a-z0-9_]+` in
 *      backtick-quoted or bare prose positions.
 *   4. Each match passes if it is in the agent's `allowed` set (derived
 *      from AGENT_TOOL_POLICY at runtime — never hardcoded), OR occurs
 *      within an `adv_tool_invoke({name: "..."})` expression.
 *      Otherwise it is a violation.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

import {
  AGENT_TOOL_POLICY,
  SPAWNABLE_SUBAGENT_ROSTER,
} from "./tool-role-policy";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENTS_DIR = join(REPO_ROOT, ".opencode", "agents");

// ─── Grammar primitives (documented per DONT5) ─────────────────────────────

/**
 * Step 1: Strip the generator-owned ADV-GENERATED frontmatter region.
 *
 * Markers (verbatim from .opencode/agents/adv-*.md):
 *   # >>> ADV-GENERATED adv_* tools (source: AGENT_TOOL_POLICY) >>>
 *   ...
 *   # <<< ADV-GENERATED adv_* tools <<<
 *
 * Everything between these markers (inclusive) is the generated tool list —
 * configuration, not call instructions. Generator-owned (AC8, C4).
 */
function stripAdvGeneratedRegion(text: string): string {
  return text.replace(
    /^# >>> ADV-GENERATED.*$[\s\S]*?^# <<< ADV-GENERATED.*$\n?/gm,
    "",
  );
}

/**
 * Step 2: Strip fenced code blocks (``` delimited).
 *
 * Fenced blocks contain illustrative payload schemas, JSON examples, and
 * shell commands — not imperative call instructions.
 */
function stripFencedCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

function stripInvokeRoutingNote(text: string): string {
  return text.replace(/^> \*\*Invoke routing:.*$/gm, "");
}

interface AdvToolRef {
  tool: string;
  index: number;
  line: number;
}

/**
 * Step 3: Find all `adv_[a-z0-9_]+` references in text.
 *
 * Matches identifiers in backtick-quoted positions (`adv_tool_name`) and
 * bare prose positions (e.g., "call adv_tool_name with..."). The `\b`
 * word boundary prevents partial matches inside longer identifiers.
 *
 * Returns 1-based line numbers relative to the input text.
 */
function findAdvToolRefs(text: string): AdvToolRef[] {
  const refs: AdvToolRef[] = [];
  const re = /\badv_([a-z0-9_]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    refs.push({
      tool: m[0],
      index: m.index,
      line: text.slice(0, m.index).split("\n").length,
    });
  }
  return refs;
}

/**
 * Step 4a: Check whether a reference is wrapped in an
 * `adv_tool_invoke({name: "..."})` expression.
 *
 * Looks for the dispatch pattern within a 200-char window ending at the
 * reference position. The window covers the typical single-line invoke
 * expression and multi-line variations where `name:` precedes the tool
 * identifier.
 */
function isInvokeWrapped(text: string, ref: AdvToolRef): boolean {
  const windowStart = Math.max(0, ref.index - 200);
  const windowEnd = Math.min(text.length, ref.index + ref.tool.length + 30);
  const window = text.slice(windowStart, windowEnd);
  const invokePattern = new RegExp(
    `adv_tool_invoke\\s*\\(\\s*\\{\\s*name\\s*:\\s*["']${ref.tool}["']`,
  );
  return invokePattern.test(window);
}

interface Violation {
  tool: string;
  line: number;
  context: string;
}

/**
 * Apply the full AC5 grammar and return violations.
 *
 * A violation is an `adv_*` reference in prompt prose that is neither in
 * the agent's `allowed` set nor wrapped in an `adv_tool_invoke` expression.
 * Allowed set is derived from AGENT_TOOL_POLICY at runtime — never
 * hardcoded (DONT5).
 */
function findPolicyViolations(
  promptText: string,
  allowedSet: ReadonlySet<string>,
): Violation[] {
  const stripped = stripInvokeRoutingNote(
    stripFencedCodeBlocks(stripAdvGeneratedRegion(promptText)),
  );
  const refs = findAdvToolRefs(stripped);
  const violations: Violation[] = [];

  for (const ref of refs) {
    if (allowedSet.has(ref.tool)) continue;
    if (isInvokeWrapped(stripped, ref)) continue;
    const lineStart = stripped.lastIndexOf("\n", ref.index) + 1;
    const lineEnd = stripped.indexOf("\n", ref.index);
    const context = stripped
      .slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
      .trim();
    violations.push({
      tool: ref.tool,
      line: ref.line,
      context: context.slice(0, 120),
    });
  }
  return violations;
}

// ─── AC6: Grammar fixtures — proven, not trusted ───────────────────────────

describe("AC5 grammar fixtures (AC6)", () => {
  // Minimal allowed set mirroring Tier 1: adv_tool_invoke is always granted.
  // Other adv_* tools in fixtures are NOT in this set to exercise the guard.
  const fixtureAllowed = new Set(["adv_tool_invoke"]);

  test("true positive: bare imperative direct call is flagged", () => {
    const text =
      "Call `adv_subagent_report_submit` with `{ report: ENGINEER_REPORT }`.";
    const violations = findPolicyViolations(text, fixtureAllowed);
    expect(violations).toHaveLength(1);
    expect(violations[0].tool).toBe("adv_subagent_report_submit");
  });

  test("code-fence occurrence is NOT flagged (illustrative schema)", () => {
    const text = [
      "Before the call:",
      "```json",
      '{ "test_run_id": "{same-task adv_run_test runId}" }',
      "```",
      "After the call.",
    ].join("\n");
    const violations = findPolicyViolations(text, fixtureAllowed);
    expect(violations).toEqual([]);
  });

  test("adv_tool_invoke-wrapped reference is NOT flagged", () => {
    const text =
      'Dispatch via `adv_tool_invoke({name: "adv_subagent_report_submit", args: { report: ENGINEER_REPORT }})`.';
    const violations = findPolicyViolations(text, fixtureAllowed);
    expect(violations).toEqual([]);
  });
});

// ─── AC7: Pre-rewrite red-run evidence (pinned fixture) ────────────────────
//
// Representative excerpts from shipped agent prompt bodies BEFORE the
// fixSubagentReportRouting rewrite. These are the exact violation patterns
// the guard was designed to catch. Pinned so the red case remains
// reproducible after the prompt rewrite merges (AC7, C6, DONT6).
//
// Evidence captured on branch change/fixSubagentReportRouting at commit
// 21ea749f (guard added, prompts not yet rewritten). The full test suite
// at that commit reports 8 lanes with violations totaling 39+ direct-call
// references. These excerpts are representative samples from that set.

describe("AC7 pre-rewrite evidence (pinned fixture)", () => {
  const engineerAllowed = new Set<string>();

  const preRewriteExcerpts: Array<{
    lane: string;
    source: string;
    excerpt: string;
    expectedTool: string;
  }> = [
    {
      lane: "adv-engineer",
      source: ".opencode/agents/adv-engineer.md L162 (§ Exit Protocol)",
      excerpt:
        "3. **Submit ENGINEER_REPORT** — call `adv_subagent_report_submit` with the structured JSON payload below",
      expectedTool: "adv_subagent_report_submit",
    },
    {
      lane: "adv-engineer",
      source: ".opencode/agents/adv-engineer.md L276 (§ Submission Rules)",
      excerpt:
        "Before final response, call `adv_subagent_report_submit` with `{ report: ENGINEER_REPORT }`.",
      expectedTool: "adv_subagent_report_submit",
    },
    {
      lane: "adv-verifier",
      source:
        ".opencode/agents/adv-verifier.md (§ Submission — representative)",
      excerpt:
        "Submit your findings by calling `adv_subagent_report_submit` with the Verification Triage Result.",
      expectedTool: "adv_subagent_report_submit",
    },
    {
      lane: "adv-reviewer",
      source:
        ".opencode/agents/adv-reviewer.md (§ Submission — representative)",
      excerpt:
        "Record evidence via `adv_run_test` and bind the runId to your report.",
      expectedTool: "adv_run_test",
    },
  ];

  for (const { lane, source, excerpt, expectedTool } of preRewriteExcerpts) {
    test(`${lane} pre-rewrite excerpt (${source}) flags ${expectedTool}`, () => {
      const violations = findPolicyViolations(excerpt, engineerAllowed);
      expect(
        violations.length,
        `Expected ${expectedTool} to be flagged in: "${excerpt}"`,
      ).toBeGreaterThan(0);
      expect(violations.some((v) => v.tool === expectedTool)).toBe(true);
    });
  }
});

// ─── AC5: Prompt-body binding to AGENT_TOOL_POLICY ─────────────────────────

describe("AC5 prompt-body policy binding", () => {
  test("SPAWNABLE_SUBAGENT_ROSTER covers exactly 8 lanes", () => {
    expect(SPAWNABLE_SUBAGENT_ROSTER).toHaveLength(8);
  });

  for (const agent of SPAWNABLE_SUBAGENT_ROSTER) {
    const policy = AGENT_TOOL_POLICY.find((p) => p.agent === agent);

    test(`${agent}: every adv_* reference is allowed or invoke-wrapped`, () => {
      expect(
        policy,
        `No AGENT_TOOL_POLICY entry for agent "${agent}"`,
      ).toBeDefined();

      const promptPath = join(AGENTS_DIR, `${agent}.md`);
      const body = readFileSync(promptPath, "utf8");
      const allowed = new Set(policy!.allowed);
      const violations = findPolicyViolations(body, allowed);

      if (violations.length > 0) {
        const formatted = violations
          .map((v) => `  L${v.line}: ${v.tool} — ${v.context}`)
          .join("\n");
        throw new Error(
          `${agent}: ${violations.length} prompt-body violation(s) — ` +
            `direct-call refs must be rewritten to adv_tool_invoke:\n${formatted}`,
        );
      }
    });
  }
});
