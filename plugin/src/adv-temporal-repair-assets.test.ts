import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-temporal-repair.md");

function splitFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("missing YAML frontmatter");
  return { frontmatter: match[1], body: match[2] };
}

function getToolGrant(frontmatter: string, toolName: string): boolean | null {
  const match = frontmatter.match(
    new RegExp(
      `^\\s{2}${toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(true|false)\\s*$`,
      "m",
    ),
  );
  return match ? match[1] === "true" : null;
}

describe("adv-temporal-repair agent asset", () => {
  test("agent file exists and declares hidden subagent mode", () => {
    expect(existsSync(AGENT_PATH)).toBe(true);
    const { frontmatter } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    expect(frontmatter).toContain("mode: subagent");
    expect(frontmatter).toContain("hidden: true");
  });

  test("grants only classifier/read/report tools and blocks mutations", () => {
    const { frontmatter } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    for (const tool of [
      // Tier 1 ADV tools only (slimMutationToolSurface)
      "adv_change_show",
      "adv_gate_status",
      "adv_task_list",
      "adv_task_show",
      "adv_tool_invoke",
    ]) {
      expect(getToolGrant(frontmatter, tool), `${tool} should be allowed`).toBe(
        true,
      );
    }

    for (const tool of [
      "task",
      "bash",
      "write",
      "edit",
      "morph_edit",
      // Tier 2/3 ADV tools — invoke-only (Tier 1 gate/archive/change_show ARE granted)
      "adv_change_update",
      "adv_worktree_delete",
    ]) {
      expect(getToolGrant(frontmatter, tool), `${tool} should not be granted`).not.toBe(
        true,
      );
    }
  });

  test("pins phantom-pointer decision tree and state access rules", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    for (const anchor of [
      "no nested delegation",
      "adv_change_show",
      "adv_gate_status",
      "before declaring",
      "adv_doctor",
      "phantom",
      "current-session",
      "persistent state",
      "ADV State Access Policy",
      "NEVER",
      "artifacts.*.path",
      "readable:true",
      "adv-researcher",
      "RESEARCHER_REPORT",
    ]) {
      expect(body, `missing body anchor ${anchor}`).toContain(anchor);
    }
  });
});
