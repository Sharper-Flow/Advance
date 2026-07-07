import { readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-triage.md");
const SKILL_PATH = join(REPO_ROOT, "skills/adv-triage/SKILL.md");
const PROMPTS_PATH = join(REPO_ROOT, "skills/adv-triage/PROMPTS.md");
const ANTI_PATTERNS_PATH = join(
  REPO_ROOT,
  "skills/adv-triage/ANTI-PATTERNS.md",
);

describe("adv-triage Phase 4c agent-driven bug priority", () => {
  test("command reframes Phase 4c as agent-driven priority loop", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("### 4c. Bug priority loop (agent-driven)");
    expect(content).toMatch(/idempotent.*skip.*priority:/is);
    expect(content).toMatch(/partial-apply safe.*log.*continue/is);
    expect(content).toMatch(/bounded context budget.*2 focused questions/is);
    expect(content).toMatch(/default.*medium.*context_insufficient/is);
    expect(content).toMatch(
      /rationale trailer.*issue#.*priority=.*::.*rationale/is,
    );
    expect(content).toMatch(/Never post rationale as an issue comment/i);
  });

  test("command forbids using question tool to confirm priority", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toMatch(
      /MUST NOT use `question` tool to confirm priority choice/i,
    );
    expect(content).toMatch(/only to gather context/i);
  });

  test("skill describes bounded-autonomous bug priority", () => {
    const content = readFileSync(SKILL_PATH, "utf8");

    expect(content).toMatch(/Bug priority loop/i);
    expect(content).toMatch(/agent assigns.*priority.*autonomously/i);
    expect(content).toMatch(/max 2 questions per bug|2 focused questions/i);
    expect(content).toMatch(/default.*medium.*context_insufficient/i);
    expect(content).toMatch(
      /rationale trailer.*issue#.*priority=.*::.*rationale/i,
    );
    expect(content).toMatch(/chat output only|never.*issue comment/i);
  });

  test("prompts restrict questions to bug context-gathering", () => {
    const content = readFileSync(PROMPTS_PATH, "utf8");

    expect(content).toContain("## Bug priority context-gathering");
    expect(content).toMatch(/questions gather context only/i);
    expect(content).toMatch(
      /MUST NOT ask the user to confirm or choose a priority/i,
    );
    expect(content).not.toMatch(/Feature Value options/i);
    expect(content).not.toMatch(/Autofill all features/i);
  });

  test("anti-patterns guard against user confirmation and comment posting", () => {
    const content = readFileSync(ANTI_PATTERNS_PATH, "utf8");

    expect(content).toMatch(/Ask users to confirm or choose a priority/i);
    expect(content).toMatch(/Post priority rationale as an issue comment/i);
    expect(content).toMatch(
      /Emit.*priority=.*::.*rationale.*chat output only/i,
    );
  });

  test("command no longer contains scoring phase or --rescore", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).not.toMatch(/## Phase 5: Agent Scoring/i);
    expect(content).not.toMatch(/--rescore/i);
    expect(content).not.toMatch(/WSJF/i);
    expect(content).not.toMatch(/Feature Value/i);
  });
});
