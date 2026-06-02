import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import {
  DesignerSubagentReportSchema,
  getSubagentReportPacketAnchors,
  SUBAGENT_WARN_FIRST_PACKET_ANCHORS,
} from "./types";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-designer.md");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");
const APPLY_COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-apply.md");

function splitFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("File does not have a valid YAML frontmatter block");
  }
  return { frontmatter: match[1], body: match[2] };
}

function getToolGrant(frontmatter: string, toolName: string): boolean | null {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s+${escaped}:\\s*(true|false)\\s*$`, "m");
  const match = frontmatter.match(re);
  if (!match) return null;
  return match[1] === "true";
}

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

describe("adv-designer assets", () => {
  test("ships adv-designer.md agent definition", () => {
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

  test("blocks nested delegation via task: false", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toMatch(/^\s*task:\s*false/m);
  });

  test("allows typed sub-agent report submission tool", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toContain("adv_subagent_report_submit: true");
  });

  test("allows Playwright MCP tools and skill loading", () => {
    const { frontmatter } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    expect(getToolGrant(frontmatter, "playwright_*")).toBe(true);
    expect(getToolGrant(frontmatter, "skill")).toBe(true);
  });

  test("instructs designer to load playwright-mcp skill for browser UI verification", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    expect(body).toContain('skill("playwright-mcp")');
    expect(body).toMatch(/Playwright MCP/i);
    expect(body).toMatch(/UI verification|browser-driven/i);
    expect(body).toMatch(/not\s+.*web research/i);
  });

  test("contains required contract section headings", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const required = [
      "Scope Lock",
      "Working Directory Lock",
      "Iteration Loop",
      "Prune-First Heuristic",
      "Related Issue Scanning",
      "Drift Guardrails",
      "Exit Protocol",
      "ADV State Access Policy",
      "DESIGN QUALITY BAR",
      "DESIGNER_REPORT",
      "Backend Boundary",
      "Neighboring Recommendation",
    ];
    for (const heading of required) {
      expect(content, `missing section: ${heading}`).toContain(heading);
    }
  });

  test("DESIGN QUALITY BAR enumerates the user-approved dimensions", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const required = [
      "component correctness",
      "semantic HTML",
      "accessibility",
      "responsive",
      "visual polish",
      "matching site design",
      "finer details",
    ];
    for (const dimension of required) {
      expect(
        content.toLowerCase(),
        `DESIGN QUALITY BAR missing dimension: ${dimension}`,
      ).toContain(dimension.toLowerCase());
    }
  });

  test("DESIGNER_REPORT schema lists all required fields", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## DESIGNER_REPORT Payload")[1] ?? "";
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
      "scope_drift",
      "follow_ups",
      "required_main_agent_actions",
      "related_scan",
      "context_update_for_adv",
      "what_ads_needs_to_know",
      "suggested_next_action",
      "design_dimensions",
      "neighboring_recommendations",
    ];
    for (const field of requiredFields) {
      expect(
        reportSection,
        `missing DESIGNER_REPORT field: ${field}`,
      ).toContain(field);
    }
  });

  test("deploy script installs adv-designer.md globally", () => {
    const content = readFileSync(DEPLOY_SCRIPT_PATH, "utf8");
    expect(content).toContain('for src in "$REPO_AGENTS"/*.md; do');
    expect(content).not.toMatch(/REPO_LOCAL_ONLY=.*adv-designer/);
    expect(content).not.toMatch(/SHARED_OVERLAY_ONLY=.*adv-designer/);
  });

  test("DESIGNER_REPORT schema specifies adv-designer as the literal agent field value", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## DESIGNER_REPORT Payload")[1] ?? "";
    expect(reportSection).toMatch(/"agent":\s*"adv-designer"/);
    expect(reportSection).not.toMatch(/"agent":\s*"designer"/);
  });

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

  test("Scope Lock section documents warn-first scope/done/stop/verification anchors", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const scopeSection =
      content
        .split("## Scope Lock")[1]
        ?.split("## Working Directory Lock")[0] ?? "";

    for (const anchor of SUBAGENT_WARN_FIRST_PACKET_ANCHORS) {
      expect(scopeSection, `Scope Lock missing ${anchor}`).toContain(anchor);
    }
    expect(scopeSection).toContain("warn-first");
    expect(scopeSection).toContain("finish owned scope if safe");
    expect(scopeSection).toContain("contract/security/release blockers");
  });

  test("Backend Boundary section refuses backend ownership", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const backendSection =
      content.split("## Backend Boundary")[1]?.split("## ")[0] ?? "";
    expect(backendSection).toMatch(/stop_and_report/);
    expect(backendSection).toContain("required_main_agent_actions");
    expect(backendSection.toLowerCase()).toMatch(/adv-engineer|backend/);
  });

  test("Neighboring Recommendation protocol surfaces UI inconsistencies for HITL", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const neighborSection =
      content.split("## Neighboring Recommendation")[1]?.split("## ")[0] ?? "";
    expect(neighborSection).toContain("neighboring_recommendations");
    expect(neighborSection.toLowerCase()).toMatch(
      /finish owned scope|hitl|surface/,
    );
  });

  test("DESIGNER_REPORT schema contains workdir_used field", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## DESIGNER_REPORT Payload")[1] ?? "";
    expect(reportSection).toContain("workdir_used");
  });

  test("DESIGNER_REPORT example JSON parses through Zod schema", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## DESIGNER_REPORT Payload")[1] ?? "";
    const jsonBlocks = reportSection.match(/```json\s*\n([\s\S]*?)```/g);
    expect(jsonBlocks, "No JSON example blocks found").not.toBeNull();
    const exampleBlock = (jsonBlocks![1] ?? "")
      .replace(/^```json\s*/, "")
      .replace(/```$/, "")
      .trim();

    expect(() =>
      DesignerSubagentReportSchema.parse(JSON.parse(exampleBlock)),
    ).not.toThrow();
    expect(JSON.parse(exampleBlock).scope).toEqual({
      kind: "task",
      task_id: "tk-ui-001",
    });
  });

  test("DESIGNER_REPORT prompt examples use structural scope, not legacy string scope", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## DESIGNER_REPORT Payload")[1] ?? "";
    expect(reportSection).toContain('"scope": {');
    expect(reportSection).toContain('"kind": "task"');
    expect(reportSection).toContain('"task_id"');
    expect(reportSection).not.toMatch(/"scope"\s*:\s*"/);
    expect(reportSection).toContain("compatibility-only");
  });

  test("DESIGNER_REPORT transport is tool-call based, not final fenced JSON", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const reportSection = content.split("## DESIGNER_REPORT Payload")[1] ?? "";
    expect(reportSection).toContain("adv_subagent_report_submit");
    expect(reportSection).not.toContain("final element of your final response");
  });

  test("missing ADV packet identity fields are structured defects, not user questions", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const scopeSection =
      content
        .split("## Scope Lock")[1]
        ?.split("## Working Directory Lock")[0] ?? "";
    const workdirSection =
      content
        .split("## Working Directory Lock")[1]
        ?.split("## Iteration Loop")[0] ?? "";
    const defectPolicy = `${scopeSection}\n${workdirSection}`;

    expect(defectPolicy).toContain("packet_defect");
    expect(defectPolicy).toContain("structured packet-defect failure");
    expect(defectPolicy).toContain("Do NOT call `question`");
    expect(defectPolicy).toContain("TASK");
    expect(defectPolicy).toContain("ATTEMPT");
    expect(defectPolicy).toContain("WORKING DIRECTORY");
    expect(defectPolicy).not.toMatch(/ask the orchestrator/i);
  });

  test("body forbids nested delegation, /adv-* invocation, and review/harden ownership", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toMatch(/NEVER\s+spawn\s+additional\s+sub-agents/i);
    expect(content).toMatch(/NEVER\s+invoke\s+`?\/adv-\*?/i);
    expect(content.toLowerCase()).toMatch(
      /never.*(review|harden).*owner|review.*harden.*ownership/i,
    );
  });

  test("designer packet anchors stay aligned with task-scoped identity fields", () => {
    expect(getSubagentReportPacketAnchors("adv-designer")).toEqual([
      "ATTEMPT",
      "CHANGE",
      "TASK",
      "WORKING DIRECTORY",
    ]);
  });

  test("adv-apply.md delegation routing includes Priority 1.5 metadata.frontend branch for adv-designer", () => {
    const content = readFileSync(APPLY_COMMAND_PATH, "utf8");
    expect(content).toContain("metadata.frontend");
    expect(content).toMatch(/Priority\s*1\.5/i);
    expect(content).toContain("adv-designer");
    // metadata.delegation_hint MUST remain Priority 1 (explicit user override wins)
    expect(content).toMatch(/\b1\s*\|\s*`?metadata\.delegation_hint/);
  });

  test("adv-apply.md Designer Apply Context Packet exists and starts with WORKING DIRECTORY", () => {
    const content = readFileSync(APPLY_COMMAND_PATH, "utf8");
    const packetSection = sectionAfterHeading(
      content,
      "Designer Apply Context Packet",
    );
    expect(
      packetSection,
      "missing Designer Apply Context Packet section",
    ).not.toBe("");
    const codeBlock = firstFencedBlock(packetSection);
    expect(
      codeBlock,
      "no code block in Designer Apply Context Packet",
    ).not.toBe("");
    const firstLine = codeBlock.trim().split("\n")[0];
    expect(firstLine).toMatch(/^WORKING DIRECTORY:/);
  });

  test("adv-apply.md Designer Apply Context Packet includes all DESIGNER_REPORT packet anchors", () => {
    const content = readFileSync(APPLY_COMMAND_PATH, "utf8");
    const packet = firstFencedBlock(
      sectionAfterHeading(content, "Designer Apply Context Packet"),
    );

    for (const anchor of getSubagentReportPacketAnchors("adv-designer")) {
      expect(
        packet,
        `Designer Apply Context Packet missing ${anchor}`,
      ).toContain(`${anchor}:`);
    }

    for (const anchor of SUBAGENT_WARN_FIRST_PACKET_ANCHORS) {
      expect(
        packet,
        `Designer Apply Context Packet missing ${anchor}`,
      ).toContain(`${anchor}:`);
    }
  });

  test("adv-apply.md Designer Apply Context Packet pins DESIGN QUALITY BAR, NEIGHBORING RECOMMENDATIONS, and BACKEND BOUNDARY anchors", () => {
    const content = readFileSync(APPLY_COMMAND_PATH, "utf8");
    const packet = firstFencedBlock(
      sectionAfterHeading(content, "Designer Apply Context Packet"),
    );

    expect(packet).toContain("DESIGN QUALITY BAR:");
    expect(packet).toContain("NEIGHBORING RECOMMENDATIONS:");
    expect(packet).toContain("BACKEND BOUNDARY:");
    expect(packet).toContain("DESIGNER_REPORT");
    expect(packet).toContain("adv-designer");
  });
});
