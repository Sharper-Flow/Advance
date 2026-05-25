/**
 * adv-reviewer Agent Asset Tests
 *
 * Pins `.opencode/agents/adv-reviewer.md` shape so the bundled-global reviewer
 * cannot silently drift away from its design contract:
 *
 *   - mode: subagent, hidden: true
 *   - repo/code/docs/test write capability (mirrors adv-engineer)
 *   - NO nested delegation (task: false)
 *   - NO ADV orchestration mutations (gates/tasks/changes/worktree/agenda)
 *   - REVIEWER_REPORT schema with scope_drift + required_main_agent_actions
 *     escalation contract (design Decision 3a)
 *
 * Realizes design Decisions 1, 3, 3a, and 4. Pins agreement AC4, AC5, AC6,
 * and constraints C5 + DONT2.
 */

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import {
  getSubagentReportPacketAnchors,
  ReviewerSubagentReportSchema,
} from "./types";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-reviewer.md");
const REVIEW_COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-review.md");
const HARDEN_COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-harden.md");

/**
 * Split a frontmatter+markdown file into { frontmatter, body }.
 * Frontmatter is the content between the first two `---` delimiter lines.
 */
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

/**
 * Extract a top-level scalar value from YAML frontmatter.
 * Matches lines like `mode: subagent` or `hidden: true`.
 * Returns null if not present.
 */
function getScalar(frontmatter: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = frontmatter.match(re);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Extract the boolean value of a tool grant under the `tools:` block.
 * Returns:
 *   - true / false if the key is present
 *   - null if the key is not present at all
 *
 * Wildcard grants like `context7_*: true` are matched by their literal key.
 */
function getToolGrant(frontmatter: string, toolName: string): boolean | null {
  // Escape regex special chars in tool name (e.g. `*` -> `\*`)
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

function expectPacketAnchors(
  packet: string,
  anchors: string[],
  label: string,
): void {
  for (const anchor of anchors) {
    expect(packet, `${label} missing ${anchor}`).toContain(`${anchor}:`);
  }
}

// Tool boundary per design Decision 1.
//
// ALLOWED — repo writes, code intelligence, web research, ADV reads, evidence,
// wisdom emission. Mirrors adv-engineer with no orchestration mutators added.
const REQUIRED_ALLOWED_TOOLS = [
  // Repo writes
  "read",
  "write",
  "edit",
  "morph_edit",
  "patch",
  "bash",
  "glob",
  "grep",
  "todowrite",
  "question",
  // Local code intelligence (representative — full lgrep set follows adv-engineer)
  "lgrep_search_semantic",
  "lgrep_search_symbols",
  "lgrep_search_text",
  "lgrep_get_file_outline",
  // Web research wildcards
  "context7_*",
  "exa_*",
  "searchcode_*",
  "webfetch",
  // ADV reads
  "adv_spec",
  "adv_status",
  "adv_project_context",
  "adv_change_show",
  "adv_change_list",
  "adv_task_show",
  "adv_task_list",
  "adv_task_ready",
  "adv_wisdom_list",
  "adv_gate_status",
  "adv_snapshot_health",
  // Evidence + wisdom emission
  "adv_run_test",
  "adv_wisdom_add",
  "adv_subagent_report_submit",
];

// BLOCKED — anything that would give the reviewer ADV orchestration authority,
// nested delegation, or worktree control.
const REQUIRED_BLOCKED_TOOLS = [
  // Nested delegation
  "task",
  // Change mutations
  "adv_change_create",
  "adv_change_update",
  "adv_change_archive",
  "adv_change_reenter",
  "adv_change_close",
  "adv_change_update_issues",
  "adv_change_validate",
  // Task mutations
  "adv_task_add",
  "adv_task_update",
  "adv_task_cancel",
  "adv_task_reclassify_tdd",
  "adv_task_checkpoint",
  // Gate mutation
  "adv_gate_complete",
  // Agenda mutations
  "adv_agenda_add",
  "adv_agenda_start",
  "adv_agenda_complete",
  "adv_agenda_cancel",
  "adv_agenda_prioritize",
  // Investment / temporal
  "adv_investment_report",
  "adv_temporal_worker_restart",
  // Worktree mutations
  "adv_worktree_create",
  "adv_worktree_delete",
  "adv_worktree_cleanup",
];

// Body anchor strings — pin the system prompt's required sections.
const REQUIRED_BODY_ANCHORS = [
  "REVIEWER_REPORT",
  "scope_drift",
  "required_main_agent_actions",
  "no nested delegation",
  "no ADV orchestration mutations",
  "WORKING DIRECTORY",
  "workdir_used",
  "stop_and_report",
];

describe("adv-reviewer agent asset", () => {
  test("agent file exists at .opencode/agents/adv-reviewer.md", () => {
    expect(existsSync(AGENT_PATH)).toBe(true);
  });

  test("agent file has valid YAML frontmatter", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(() => splitFrontmatter(content)).not.toThrow();
  });

  test("frontmatter declares mode: subagent and hidden: true", () => {
    const { frontmatter } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    expect(getScalar(frontmatter, "mode")).toBe("subagent");
    expect(getScalar(frontmatter, "hidden")).toBe("true");
  });

  test("frontmatter has non-empty description", () => {
    const { frontmatter } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    const desc = getScalar(frontmatter, "description");
    expect(desc).not.toBeNull();
    expect(desc!.length).toBeGreaterThan(20);
  });

  test("frontmatter sets temperature to a low value", () => {
    const { frontmatter } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    const temp = getScalar(frontmatter, "temperature");
    expect(temp).not.toBeNull();
    const num = Number(temp);
    expect(Number.isFinite(num)).toBe(true);
    expect(num).toBeLessThanOrEqual(0.3);
  });

  describe("tool allowlist — required ALLOWED tools", () => {
    for (const toolName of REQUIRED_ALLOWED_TOOLS) {
      test(`${toolName} is granted (true)`, () => {
        const { frontmatter } = splitFrontmatter(
          readFileSync(AGENT_PATH, "utf8"),
        );
        const grant = getToolGrant(frontmatter, toolName);
        expect(grant).toBe(true);
      });
    }
  });

  describe("tool allowlist — required BLOCKED tools", () => {
    for (const toolName of REQUIRED_BLOCKED_TOOLS) {
      test(`${toolName} is explicitly blocked (false)`, () => {
        const { frontmatter } = splitFrontmatter(
          readFileSync(AGENT_PATH, "utf8"),
        );
        const grant = getToolGrant(frontmatter, toolName);
        expect(grant).toBe(false);
      });
    }
  });

  describe("system prompt body anchors", () => {
    for (const anchor of REQUIRED_BODY_ANCHORS) {
      test(`body contains "${anchor}"`, () => {
        const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
        expect(body).toContain(anchor);
      });
    }
  });

  test("REVIEWER_REPORT schema mentions all required fields", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    // Per design Decision 3 schema.
    const requiredFields = [
      '"agent"',
      '"attempt"',
      '"phase"',
      '"verdict"',
      '"blocking_findings"',
      '"nonblocking_findings"',
      '"changes_made"',
      '"wisdom_candidates"',
      '"verification"',
      '"scope_drift"',
      '"risks"',
      '"required_main_agent_actions"',
      '"workdir_used"',
    ];
    for (const field of requiredFields) {
      expect(body).toContain(field);
    }
  });

  test("body forbids nested delegation explicitly", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    // The "× NEVER spawn additional sub-agents" guard from adv-engineer
    // pattern — pin equivalent wording.
    expect(body).toMatch(/NEVER\s+spawn\s+additional\s+sub-agents/i);
  });

  test("body forbids /adv-* slash command invocation", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    expect(body).toMatch(/NEVER\s+invoke\s+`?\/adv-\*?/i);
  });

  test("body does not advertise prep pre-flight routing", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    expect(body).not.toMatch(/prep\s+pre-flight/i);
    expect(body).not.toMatch(/phase[`"\s:]+prep/i);
  });

  test("body cites scope-discovery-protocol.md for escalation", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    expect(body).toContain("docs/scope-discovery-protocol.md");
  });

  test("REVIEWER_REPORT examples parse through Zod schema", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    const blocks = [...body.matchAll(/```json\s*\n([\s\S]*?)```/g)].map(
      (match) => match[1].trim(),
    );
    const reportBlocks = blocks
      .map((block) => JSON.parse(block) as Record<string, unknown>)
      .filter(
        (parsed) =>
          parsed.agent === "adv-reviewer" &&
          typeof parsed.change_id === "string" &&
          !parsed.change_id.includes("{"),
      );

    expect(reportBlocks.length).toBeGreaterThanOrEqual(2);
    for (const report of reportBlocks) {
      expect(() => ReviewerSubagentReportSchema.parse(report)).not.toThrow();
    }
  });

  test("REVIEWER_REPORT transport is tool-call based, not sentinel based", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));
    expect(body).toContain("adv_subagent_report_submit");
    expect(body).not.toContain("REVIEWER_REPORT:");
    expect(body).not.toContain("END_REVIEWER_REPORT");
  });

  test("review and harden scanner context packets stay explore-only", () => {
    const review = readFileSync(REVIEW_COMMAND_PATH, "utf8");
    const harden = readFileSync(HARDEN_COMMAND_PATH, "utf8");

    const scannerPackets = [
      firstFencedBlock(
        sectionAfterHeading(review, "Review Scanner Context Packet"),
      ),
      firstFencedBlock(
        sectionAfterHeading(harden, "Harden Scanner Context Packet"),
      ),
    ];

    for (const packet of scannerPackets) {
      expect(packet).toContain(
        "EXPECTED OUTPUT: {dimension-specific JSON schema}",
      );
      expect(packet).not.toContain("adv_subagent_report_submit");
      expect(packet).not.toContain("ENGINEER_REPORT");
      expect(packet).not.toContain("REVIEWER_REPORT");
    }
  });

  test("review and harden reviewer remediation packets include REVIEWER_REPORT packet anchors", () => {
    const review = readFileSync(REVIEW_COMMAND_PATH, "utf8");
    const harden = readFileSync(HARDEN_COMMAND_PATH, "utf8");
    const reviewerAnchors = getSubagentReportPacketAnchors("adv-reviewer");

    expectPacketAnchors(
      firstFencedBlock(
        sectionAfterHeading(review, "Review Reviewer Remediation Packet"),
      ),
      reviewerAnchors,
      "Review Reviewer Remediation Packet",
    );
    expectPacketAnchors(
      firstFencedBlock(
        sectionAfterHeading(harden, "Harden Reviewer Remediation Packet"),
      ),
      reviewerAnchors,
      "Harden Reviewer Remediation Packet",
    );
  });

  test("review and harden engineer remediation packets include ENGINEER_REPORT packet anchors", () => {
    const review = readFileSync(REVIEW_COMMAND_PATH, "utf8");
    const harden = readFileSync(HARDEN_COMMAND_PATH, "utf8");
    const engineerAnchors = getSubagentReportPacketAnchors("adv-engineer");

    expectPacketAnchors(
      firstFencedBlock(
        sectionAfterHeading(review, "Review Engineer Remediation Packet"),
      ),
      engineerAnchors,
      "Review Engineer Remediation Packet",
    );
    expectPacketAnchors(
      firstFencedBlock(
        sectionAfterHeading(harden, "Harden Engineer Remediation Packet"),
      ),
      engineerAnchors,
      "Harden Engineer Remediation Packet",
    );
  });
});
