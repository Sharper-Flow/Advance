import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const DOC_PATH = join(REPO_ROOT, "docs/agent-tool-contracts.md");
const SKILL_PATH = join(REPO_ROOT, "skills/adv-agent-tool-contracts/SKILL.md");
const SKILL_AUTHOR_PATH = join(REPO_ROOT, "skills/adv-skill-author/SKILL.md");
const DEPLOY_LOCAL = join(REPO_ROOT, "scripts/deploy-local.sh");

function readRepoFile(path: string): string {
  return readFileSync(path, "utf8");
}

describe("agent-callable tool contract guidance assets", () => {
  test("durable doc exists with schema-packet-prompt-test checklist", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    const doc = readRepoFile(DOC_PATH);

    for (const anchor of [
      "Schema",
      "Context packet",
      "Prompt instructions",
      "Transport",
      "Tests",
      "Specs",
      "TASK",
      "PHASE",
      "ATTEMPT",
      "adv_subagent_report_submit",
      "INVALID_REPORT",
      "scanner",
      "worker",
    ]) {
      expect(doc).toContain(anchor);
    }
  });

  test("globally synced skill points agents at the contract checklist", () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
    const skill = readRepoFile(SKILL_PATH);

    expect(skill).toContain("name: adv-agent-tool-contracts");
    expect(skill).toContain("Use when creating or modifying");
    expect(skill).toContain("docs/agent-tool-contracts.md");
    for (const anchor of [
      "schema",
      "context packet",
      "prompt",
      "tests",
      "scanner",
      "worker",
    ]) {
      expect(skill.toLowerCase()).toContain(anchor);
    }
  });

  test("new guidance skill is covered by adv-* global sync", () => {
    const deploy = readRepoFile(DEPLOY_LOCAL);

    expect(SKILL_PATH).toContain("/skills/adv-");
    expect(deploy).toContain('"$REPO_SKILLS"/adv-*/');
    expect(deploy).toContain("cp -R .");
  });

  test("skill-author guidance cross-links agent-callable tool contracts", () => {
    const skillAuthor = readRepoFile(SKILL_AUTHOR_PATH);

    expect(skillAuthor).toContain("adv-agent-tool-contracts");
    expect(skillAuthor).toContain("schema/context packet/prompt/tests/specs");
  });
});
