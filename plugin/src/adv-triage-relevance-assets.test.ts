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
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/backlog-coordination/spec.json");

describe("adv-triage relevance validation contract", () => {
  test("command requires relevance validation before bug priority assignment", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    const relevanceIndex = content.indexOf("### 4b. Relevance validation");
    const priorityLoopIndex = content.indexOf(
      "### 4c. Bug priority loop (agent-driven)",
    );

    expect(relevanceIndex).toBeGreaterThanOrEqual(0);
    expect(priorityLoopIndex).toBeGreaterThanOrEqual(0);
    expect(relevanceIndex).toBeLessThan(priorityLoopIndex);
    expect(content).toMatch(
      /MUST NOT apply bug priority labels before relevance validation/i,
    );
  });

  test("skill prompt defines relevance outcomes before bug priority context-gathering", () => {
    const content = readFileSync(PROMPTS_PATH, "utf8");
    const relevanceIndex = content.indexOf("### Relevance validation");
    const loopBodyIndex = content.indexOf(
      "up to 2 focused context-gathering questions",
    );

    expect(relevanceIndex).toBeGreaterThanOrEqual(0);
    expect(loopBodyIndex).toBeGreaterThanOrEqual(0);
    expect(relevanceIndex).toBeLessThan(loopBodyIndex);
    expect(content).toMatch(/`relevant`/i);
    expect(content).toMatch(/already[- ]addressed|stale/i);
    expect(content).toMatch(/duplicate\/superseded/i);
    expect(content).toMatch(/`unclear`/i);
    expect(content).toMatch(/bug priority/i);
    expect(content).toMatch(/`?question`? tool/i);
  });

  test("anti-patterns forbid asking users to assign priority to stale items", () => {
    const content = readFileSync(ANTI_PATTERNS_PATH, "utf8");

    expect(content).toMatch(/stale|already[- ]addressed/i);
    expect(content).toMatch(/assign priority|priority/i);
  });

  test("command requires source cleanup before issue creation and bug priority assignment", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    const matchIndex = content.indexOf("## Phase 3: Match + Identify Gaps");
    const cleanupIndex = content.indexOf(
      "## Phase 3.5: Source Cleanup Validation",
    );
    const issueCreationIndex = content.indexOf("### 4a. Confirm new issues");
    const priorityLoopIndex = content.indexOf(
      "### 4c. Bug priority loop (agent-driven)",
    );
    const noWorkSkipIndex = content.indexOf("No new issues, no label gaps.");

    expect(matchIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBeGreaterThanOrEqual(0);
    expect(issueCreationIndex).toBeGreaterThanOrEqual(0);
    expect(priorityLoopIndex).toBeGreaterThanOrEqual(0);
    expect(noWorkSkipIndex).toBeGreaterThanOrEqual(0);
    expect(matchIndex).toBeLessThan(cleanupIndex);
    expect(cleanupIndex).toBeLessThan(issueCreationIndex);
    expect(cleanupIndex).toBeLessThan(priorityLoopIndex);
    expect(cleanupIndex).toBeLessThan(noWorkSkipIndex);
    expect(content).toMatch(
      /MUST NOT (create|open)[^\n]*issue[^\n]*cleanup validation/i,
    );
    expect(content).toMatch(
      /MUST NOT apply bug priority labels before cleanup validation/i,
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
    expect(prompts).toMatch(/GitHub duplicate handling/i);
    expect(prompts).toMatch(/ADV changes/i);
    expect(prompts).not.toMatch(/adv_agenda_/i);
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

  test("backlog coordination spec anchors cleanup-before-priority law", () => {
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string; body: string; scenarios?: unknown[] }>;
    };

    const requirement = spec.requirements.find(
      (item) => item.id === "rq-backlogCoord09",
    );

    expect(requirement).toBeDefined();
    expect(requirement?.body).toMatch(/cleanup validation/i);
    expect(requirement?.body).toMatch(/before new issue creation/i);
    expect(requirement?.body).toMatch(/before.*bug priority/i);
    expect(requirement?.body).toMatch(/heuristics.*advisory/i);
    expect(requirement?.scenarios?.length).toBeGreaterThanOrEqual(3);
  });
});
