import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/engineer.md");
const SYNC_SCRIPT_PATH = join(REPO_ROOT, "scripts/sync-global.sh");

describe("adv-engineer assets", () => {
  test("ships engineer.md agent definition", () => {
    expect(existsSync(AGENT_PATH)).toBe(true);
  });

  test("has mode: subagent", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toMatch(/mode:\s*subagent/);
  });

  test("has task: false", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toMatch(/task:\s*false/);
  });

  test("has hidden: true", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toMatch(/hidden:\s*true/);
  });

  test("has temperature 0.1", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toMatch(/temperature:\s*0\.1/);
  });

  test("blocks ADV orchestration tools", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    const blocked = [
      "adv_gate_complete: false",
      "adv_task_update: false",
      "adv_task_add: false",
      "adv_task_cancel: false",
      "adv_task_checkpoint: false",
      "adv_change_validate: false",
      "worktree_create: false",
      "worktree_delete: false",
    ];
    for (const tool of blocked) {
      expect(frontmatter, `missing blocked tool: ${tool}`).toContain(tool);
    }
  });

  test("blocks adv_change_* tools", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toMatch(/adv_change_\w+:\s*false/);
  });

  test("blocks adv_agenda_* tools", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toMatch(/adv_agenda_\w+:\s*false/);
  });

  test("contains required contract section headings", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const required = [
      "Scope Lock",
      "Iteration Loop",
      "Prune-First Heuristic",
      "Related Issue Scanning",
      "Drift Guardrails",
      "Exit Protocol",
      "ADV State Access Policy",
      "ENGINEER_REPORT",
    ];
    for (const heading of required) {
      expect(content, `missing section: ${heading}`).toContain(heading);
    }
  });

  test("ENGINEER_REPORT schema lists all required fields", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    // Split on the heading, then look at everything after it
    const reportSection = content.split("## ENGINEER_REPORT Payload")[1] ?? "";
    const requiredFields = [
      "schema_version",
      "change_id",
      "task_id",
      "agent",
      "scope",
      "status",
      "files_touched",
      "verification",
      "decisions",
      "blockers",
      "follow_ups",
      "related_scan",
      "context_update_for_adv",
      "what_ads_needs_to_know",
      "suggested_next_action",
    ];
    for (const field of requiredFields) {
      expect(
        reportSection,
        `missing ENGINEER_REPORT field: ${field}`,
      ).toContain(field);
    }
  });

  test("sync script installs engineer.md globally", () => {
    const content = readFileSync(SYNC_SCRIPT_PATH, "utf8");
    expect(content).toContain('"$GLOBAL_AGENTS"/engineer.md');
  });
});
