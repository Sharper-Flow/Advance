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
  test("command requires relevance validation before Phase 4b field prompts", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("### 4b. Relevance validation");
    expect(content).toMatch(
      /MUST NOT prompt[^\n]*(Priority|Value)[^\n]*before relevance validation/i,
    );
  });

  test("skill prompt defines relevance outcomes before user-owned scoring", () => {
    const content = readFileSync(PROMPTS_PATH, "utf8");

    expect(content).toContain("### Relevance validation");
    expect(content).toMatch(/still relevant|already[- ]addressed|stale/i);
    expect(content).toMatch(/Priority\/Value/i);
    expect(content).toMatch(/`?question`? tool/i);
  });

  test("anti-patterns forbid asking users to score stale items", () => {
    const content = readFileSync(ANTI_PATTERNS_PATH, "utf8");

    expect(content).toMatch(/stale|already[- ]addressed/i);
    expect(content).toMatch(/Priority\/Value|priorit/i);
  });
});
