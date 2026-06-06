import { readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-triage.md");
const PROMPTS_PATH = join(REPO_ROOT, "skills/adv-triage/PROMPTS.md");
const ANTI_PATTERNS_PATH = join(
  REPO_ROOT,
  "skills/adv-triage/ANTI-PATTERNS.md",
);

describe("adv-triage relevance validation contract", () => {
  test("command requires relevance validation before field prompts", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    const relevanceIndex = content.indexOf("### 4b. Relevance validation");
    const fieldAssignmentIndex = content.indexOf("### 4c. Field assignments");

    expect(relevanceIndex).toBeGreaterThanOrEqual(0);
    expect(fieldAssignmentIndex).toBeGreaterThanOrEqual(0);
    expect(relevanceIndex).toBeLessThan(fieldAssignmentIndex);
    expect(content).toMatch(
      /MUST NOT prompt[^\n]*(Priority|Value)[^\n]*before relevance validation/i,
    );
  });

  test("skill prompt defines relevance outcomes before user-owned scoring", () => {
    const content = readFileSync(PROMPTS_PATH, "utf8");
    const relevanceIndex = content.indexOf("### Relevance validation");
    const fieldMatrixIndex = content.indexOf("Build matrix from open issues");

    expect(relevanceIndex).toBeGreaterThanOrEqual(0);
    expect(fieldMatrixIndex).toBeGreaterThanOrEqual(0);
    expect(relevanceIndex).toBeLessThan(fieldMatrixIndex);
    expect(content).toMatch(/`relevant`/i);
    expect(content).toMatch(/already[- ]addressed|stale/i);
    expect(content).toMatch(/duplicate\/superseded/i);
    expect(content).toMatch(/`unclear`/i);
    expect(content).toMatch(/Priority\/Value/i);
    expect(content).toMatch(/`?question`? tool/i);
  });

  test("anti-patterns forbid asking users to score stale items", () => {
    const content = readFileSync(ANTI_PATTERNS_PATH, "utf8");

    expect(content).toMatch(/stale|already[- ]addressed/i);
    expect(content).toMatch(/Priority\/Value|priorit/i);
  });
});
