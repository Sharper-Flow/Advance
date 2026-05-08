import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-slop-scan.md");
const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");
const SLOP_SPEC_PATH = join(REPO_ROOT, ".adv/specs/slop-scan/spec.json");
const SLOP_SKILL_PATH = join(REPO_ROOT, "skills/adv-slop-detection/SKILL.md");

describe("adv-slop-scan anti-recursion assets", () => {
  test("documents single-level-only scanner delegation in command contract", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("No Nested Scanner Delegation (CRITICAL)");
    expect(content).toContain(
      "Scanner workers must NOT spawn additional sub-agents, delegates, or worker agents",
    );
    expect(content).toContain(
      "Scanner workers must NOT invoke any `/adv-*` slash commands; if ADV context is needed they must use ADV tools directly",
    );
  });

  test("documents Phase 1 confidence defaults and actionability grouping", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("### Phase 1 Confidence Defaults");
    expect(content).toContain(
      "AST-backed structural findings default to `confidence: high`",
    );
    expect(content).toContain(
      "Regex-only defensive-overkill findings default to `confidence: medium`",
    );
    expect(content).toContain(
      "Degraded fallback findings default to `confidence: low`",
    );
    expect(content).toContain(
      "Assign `actionability` and `grouping` before severity sorting",
    );
  });

  test("documents non-scannable context packet boundaries", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("### Context Boundary (Non-Scannable)");
    expect(content).toContain(
      "Context packet text is orientation only, not a finding location",
    );
    expect(content).toContain(
      "Every finding must cite a target source file and line or scoped source evidence",
    );
    expect(content).toContain(
      "Do NOT emit findings against CHANGE, AFFECTED FILES summaries, TASK EVIDENCE SUMMARY, examples, or fixture descriptions",
    );
  });

  test("documents low-confidence report grouping and JSON metadata", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("Low-confidence / non-blocking findings");
    expect(content).toContain(
      "Low-confidence findings are not blocking by default",
    );
    expect(content).toContain("grouping: 'actionable' | 'low-confidence'");
    expect(content).toContain("actionability: 'blocking' | 'non-blocking'");
  });

  test("documents P33 structural-correctness bypass detection", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SLOP_SKILL_PATH, "utf8");
    const spec = JSON.parse(readFileSync(SLOP_SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string }>;
    };

    expect(spec.requirements.map((rq) => rq.id)).toContain("rq-ss009");
    expect(command).toContain("<!-- rq-ss009 -->");
    expect(command).toContain("Structural Correctness Bypass (QUAL-012)");
    expect(command).toContain(
      "Heuristics used only for discovery/ranking/triage/advisory notes are not findings",
    );
    expect(skill).toContain("structural_correctness_bypass");
    expect(skill).toContain("<!-- rq-ss009 -->");
    expect(skill).toContain(
      "Heuristic/fuzzy/LLM decisions owning correctness boundaries",
    );
  });

  test("preserves slop scanner category wildcards", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    for (const category of [
      "HALLU-*",
      "STRUCT-*",
      "QUAL-*",
      "DOC-*",
      "DEP-*",
      "MAINT-*",
      "AI-*",
      "PERF-*",
      "TEST-*",
    ]) {
      expect(content).toContain(category);
    }
  });

  test("documents single-level scanner orchestration in shared ADV instructions", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toMatch(
      /slop-scan\s*\|\s*Sequential categories\s*\|\s*explore × 9 \(single-level only\)/,
    );
    expect(content).toContain(
      "For `/adv-slop-scan`, all `explore` scanner workers must do the scan inline and must not delegate to additional sub-agents or invoke `/adv-*` slash commands",
    );
  });
});
