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
    expect(neighborSection.toLowerCase()).toMatch(/finish owned scope|hitl|surface/);
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
});
