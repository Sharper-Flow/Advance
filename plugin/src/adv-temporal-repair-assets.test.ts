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
      "adv_change_show",
      "adv_gate_status",
      "adv_change_list",
      "adv_status",
      "adv_wip_state",
      "adv_session_list",
      "adv_snapshot_health",
      "adv_temporal_diagnose",
      "adv_project_context",
      "adv_spec",
      "adv_subagent_report_submit",
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
      "adv_gate_complete",
      "adv_task_update",
      "adv_change_update",
      "adv_change_archive",
      "adv_worktree_delete",
      "adv_temporal_worker_restart",
      "adv_temporal_register_search_attributes",
    ]) {
      expect(getToolGrant(frontmatter, tool), `${tool} should be blocked`).toBe(
        false,
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
      "adv_change_forget",
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
