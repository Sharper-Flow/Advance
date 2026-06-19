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
const SCHEMA_PATH = join(REPO_ROOT, "skills/adv-triage/SCHEMA.md");
const SPEC_PATH = join(
  REPO_ROOT,
  ".adv/specs/backlog-coordination/spec.json",
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

  test("command requires source cleanup before issue creation and field prompts", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    const matchIndex = content.indexOf("## Phase 3: Match + Identify Gaps");
    const cleanupIndex = content.indexOf(
      "## Phase 3.5: Source Cleanup Validation",
    );
    const issueCreationIndex = content.indexOf("### 4a. Confirm new issues");
    const fieldAssignmentIndex = content.indexOf("### 4c. Field assignments");

    expect(matchIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBeGreaterThanOrEqual(0);
    expect(issueCreationIndex).toBeGreaterThanOrEqual(0);
    expect(fieldAssignmentIndex).toBeGreaterThanOrEqual(0);
    expect(matchIndex).toBeLessThan(cleanupIndex);
    expect(cleanupIndex).toBeLessThan(issueCreationIndex);
    expect(cleanupIndex).toBeLessThan(fieldAssignmentIndex);
    expect(content).toMatch(
      /MUST NOT (create|open)[^\n]*issue[^\n]*cleanup validation/i,
    );
    expect(content).toMatch(
      /MUST NOT prompt[^\n]*(Priority|Value)[^\n]*cleanup validation/i,
    );
  });

  test("triage skill defines cleanup decision schema and approval prompt", () => {
    const schema = readFileSync(SCHEMA_PATH, "utf8");
    const prompts = readFileSync(PROMPTS_PATH, "utf8");

    expect(schema).toContain("cleanup_decisions[]");
    expect(schema).toMatch(/source.*ref.*classification.*evidence/is);
    expect(schema).toMatch(/proposed[_ ]?action|proposedAction/i);
    expect(schema).toMatch(/approval[_ ]?group|approvalGroup/i);
    expect(prompts).toMatch(/source\/reason/i);
    expect(prompts).toMatch(/should-merge/i);
    expect(prompts).toMatch(/adv_agenda_complete/i);
  });

  test("GitHub duplicate handling is capability-detected", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const prompts = readFileSync(PROMPTS_PATH, "utf8");
    const combined = `${command}\n${prompts}`;

    expect(combined).toMatch(/capability[- ]detect/i);
    expect(combined).toContain("gh issue close --help");
    expect(combined).toContain("--duplicate-of");
    expect(combined).toMatch(/Duplicate of #N/);
  });

  test("backlog coordination spec anchors cleanup-before-scoring law", () => {
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string; body: string; scenarios?: unknown[] }>;
    };

    const requirement = spec.requirements.find(
      (item) => item.id === "rq-backlogCoord09",
    );

    expect(requirement).toBeDefined();
    expect(requirement?.body).toMatch(/cleanup validation/i);
    expect(requirement?.body).toMatch(/before new issue creation/i);
    expect(requirement?.body).toMatch(/before.*(Priority|Value)/i);
    expect(requirement?.body).toMatch(/heuristics.*advisory/i);
    expect(requirement?.scenarios?.length).toBeGreaterThanOrEqual(3);
  });
});
