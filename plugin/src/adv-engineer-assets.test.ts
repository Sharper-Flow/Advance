import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import {
  EngineerSubagentReportSchema,
  getSubagentReportPacketAnchors,
} from "./types";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-engineer.md");
const APPLY_COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-apply.md");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");

function sectionAfterHeading(content: string, heading: string): string {
  const marker = `#### ${heading}`;
  const start = content.indexOf(marker);
  if (start === -1) return "";

  const rest = content.slice(start + marker.length);
  const nextHeading = rest.search(/\n#{3,4} /);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function firstFencedBlock(section: string): string {
  return section.match(/```\n([\s\S]*?)```/)?.[1] ?? "";
}

describe("adv-engineer assets", () => {
  test("ships adv-engineer.md agent definition", () => {
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
      "adv_worktree_create: false",
      "adv_worktree_delete: false",
      "adv_worktree_cleanup: false",
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

  test("allows typed sub-agent report submission tool", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toContain("adv_subagent_report_submit: true");
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
      "attempt",
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

  test("deploy script installs adv-engineer.md globally", () => {
    const content = readFileSync(DEPLOY_SCRIPT_PATH, "utf8");
    expect(content).toContain('for src in "$REPO_AGENTS"/*.md; do');
    expect(content).not.toMatch(/REPO_LOCAL_ONLY=.*adv-engineer/);
    expect(content).not.toMatch(/SHARED_OVERLAY_ONLY=.*adv-engineer/);
  });

  test("ENGINEER_REPORT schema specifies adv-engineer as the literal agent field value", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## ENGINEER_REPORT Payload")[1] ?? "";
    // Literal payload value must be "adv-engineer" (post-rename convention KD16)
    expect(reportSection).toMatch(/"agent":\s*"adv-engineer"/);
    // Legacy bare-"engineer" payload value must no longer appear
    expect(reportSection).not.toMatch(/"agent":\s*"engineer"/);
  });

  // === Working Directory Lock contract drift tests ===

  test("contains Working Directory Lock section heading", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toContain("## Working Directory Lock");
  });

  test("Working Directory Lock section instructs passing workdir to every tool call", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const wdSection =
      content.split("## Working Directory Lock")[1]?.split("## ")[0] ?? "";
    const requiredTools = [
      "bash",
      "read",
      "write",
      "edit",
      "morph_edit",
      "adv_run_test",
    ];
    for (const tool of requiredTools) {
      expect(
        wdSection,
        `Working Directory Lock section missing tool: ${tool}`,
      ).toContain(tool);
    }
  });

  test("Scope Lock section mentions WORKING DIRECTORY", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const scopeSection =
      content.split("## Scope Lock")[1]?.split("## ")[0] ?? "";
    expect(scopeSection).toContain("WORKING DIRECTORY");
  });

  test("ENGINEER_REPORT schema contains workdir_used field", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## ENGINEER_REPORT Payload")[1] ?? "";
    expect(reportSection).toContain("workdir_used");
  });

  test("ENGINEER_REPORT example JSON contains workdir_used field", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## ENGINEER_REPORT Payload")[1] ?? "";
    // Find the example block (second ```json ... ```)
    const jsonBlocks = reportSection.match(/```json\s*\n([\s\S]*?)```/g);
    expect(jsonBlocks, "No JSON example blocks found").not.toBeNull();
    // The example block should be the second one
    const exampleBlock = jsonBlocks![1] ?? "";
    expect(exampleBlock).toContain("workdir_used");
  });

  test("ENGINEER_REPORT example JSON parses through Zod schema", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## ENGINEER_REPORT Payload")[1] ?? "";
    const jsonBlocks = reportSection.match(/```json\s*\n([\s\S]*?)```/g);
    expect(jsonBlocks, "No JSON example blocks found").not.toBeNull();
    const exampleBlock = (jsonBlocks![1] ?? "")
      .replace(/^```json\s*/, "")
      .replace(/```$/, "")
      .trim();

    expect(() =>
      EngineerSubagentReportSchema.parse(JSON.parse(exampleBlock)),
    ).not.toThrow();
  });

  test("ENGINEER_REPORT transport is tool-call based, not final fenced JSON", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## ENGINEER_REPORT Payload")[1] ?? "";
    expect(reportSection).toContain("adv_subagent_report_submit");
    expect(reportSection).not.toContain("final element of your final response");
  });

  test("adv-apply.md Apply Context Packet starts with WORKING DIRECTORY", () => {
    const content = readFileSync(APPLY_COMMAND_PATH, "utf8");
    // Find the Apply Context Packet section
    const packetSection =
      content.split("#### Apply Context Packet")[1]?.split("### ")[0] ?? "";
    // The first non-empty line inside the ``` block should be WORKING DIRECTORY
    const codeBlock = packetSection.match(/```\n([\s\S]*?)```/);
    expect(
      codeBlock,
      "No code block in Apply Context Packet section",
    ).not.toBeNull();
    const firstLine = codeBlock![1].trim().split("\n")[0];
    expect(firstLine).toMatch(/^WORKING DIRECTORY:/);
  });

  test("adv-apply.md Apply Context Packet includes all ENGINEER_REPORT packet anchors", () => {
    const content = readFileSync(APPLY_COMMAND_PATH, "utf8");
    const packet = firstFencedBlock(sectionAfterHeading(content, "Apply Context Packet"));

    for (const anchor of getSubagentReportPacketAnchors("adv-engineer")) {
      expect(packet, `Apply Context Packet missing ${anchor}`).toContain(
        `${anchor}:`,
      );
    }
  });
});
