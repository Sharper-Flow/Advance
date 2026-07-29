import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-verifier.md");

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
  const match = frontmatter.match(
    new RegExp(
      `^\\s{2}${toolName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}:\\s*(true|false)\\s*$`,
      "m",
    ),
  );
  return match ? match[1] === "true" : null;
}

describe("adv-verifier agent asset", () => {
  test("ships hidden repo-owned adv-verifier subagent definition", () => {
    expect(existsSync(AGENT_PATH)).toBe(true);
    const { frontmatter } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    expect(frontmatter).toContain("mode: subagent");
    expect(frontmatter).toContain("hidden: true");
  });

  test("allows read and command execution while blocking edits, nesting, questions, todos, and ADV mutations", () => {
    const { frontmatter } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    for (const tool of [
      "read",
      "glob",
      "grep",
      "lgrep_search_text",
      "lgrep_search_semantic",
      "lgrep_search_symbols",
      "bash",
      // Tier 1 ADV tools only (slimMutationToolSurface)
      "adv_change_show",
      "adv_task_list",
      "adv_task_show",
      "adv_gate_status",
      "adv_tool_invoke",
    ]) {
      expect(getToolGrant(frontmatter, tool), `${tool} should be allowed`).toBe(
        true,
      );
    }

    for (const tool of [
      "write",
      "edit",
      "morph_edit",
      "apply_patch",
      "task",
      "question",
      "todowrite",
      // Tier 2/3 ADV tools — invoke-only (Tier 1 task_update/gate_complete/archive ARE granted)
      "adv_subagent_report_submit",
      "adv_change_create",
      "adv_change_update",
      "adv_task_add",
      "adv_task_cancel",
      "adv_worktree_create",
      "adv_worktree_delete",
    ]) {
      expect(
        getToolGrant(frontmatter, tool),
        `${tool} should not be granted`,
      ).not.toBe(true);
    }
  });

  test("pins verification packet anchors and authority-free boundaries", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    for (const anchor of [
      "WORKING DIRECTORY",
      "CHANGE",
      "SCOPE KEY",
      "PHASE",
      "ATTEMPT",
      "TASK_SCOPE",
      "IN_SCOPE",
      "OUT_OF_SCOPE",
      "DONE_WHEN",
      "STOP_WHEN",
      "VERIFICATION",
      "COMMANDS",
      "Do not edit files",
      "Do not complete gates",
      "Do not spawn",
      "final acceptance",
      "final release",
    ]) {
      expect(body, `missing body anchor ${anchor}`).toContain(anchor);
    }

    // Pin the POLICY, not the call syntax. `adv_subagent_report_submit` is now
    // dispatched through the Tier-3 `adv_tool_invoke` wrapper, so a literal
    // "Do not call adv_subagent_report_submit" anchor breaks on a routing
    // change even though the prohibition is fully intact. Assert a prohibition
    // that names the tool, tolerant of the wrapper.
    expect(body, "missing report-submission prohibition").toMatch(
      /do not call[^.\n]*adv_subagent_report_submit/i,
    );
  });

  test("fails soft on a defective packet instead of discarding the work", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    // A missing anchor previously stopped the lane outright: it returned
    // inconclusive/ask_user having run ZERO commands, so a correctly-scoped
    // verification was thrown away over an orchestrator-owned label. Anchors
    // are orchestrator-owned, so a packet defect is an internal defect.
    expect(body, "must not discard completed work").toMatch(
      /never discard completed verification work/i,
    );
    expect(body, "must report the defect rather than ask the user").toContain(
      "## PACKET DEFECT",
    );
    expect(body, "must not escalate orchestrator-owned identity").toMatch(
      /do not call `question` for packet identity values/i,
    );

    // WORKING DIRECTORY is the ONLY anchor that may hard-block: without it
    // there is nowhere safe to run commands.
    expect(body, "WORKING DIRECTORY must remain a hard prerequisite").toMatch(
      /`WORKING DIRECTORY` is the only hard prerequisite/i,
    );
    // PHASE must degrade to the mode that can run unaided, not block.
    expect(body, "PHASE must default rather than block").toMatch(
      /if `PHASE` is absent, assume `local_verify`/i,
    );
    // Pure identity labels must never block verification.
    expect(body, "identity labels must not block").toMatch(
      /`CHANGE`, `SCOPE KEY`, or `ATTEMPT` are absent, proceed anyway/i,
    );
  });

  test("preserves orchestrator-submitted verification bundle result identity", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    expect(body).toContain("adv-verification-triage-bundle");
    expect(body).toContain('"agent": "adv-verification-triage-bundle"');
    expect(body).not.toContain('"agent": "adv-verifier"');
  });

  test("requires bin/oc-test preference, chosen-command rationale, and bounded output", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    expect(body).toMatch(/bin\/oc-test\s+targeted/i);
    expect(body).toMatch(/bin\/oc-test\s+smoke/i);
    expect(body).toMatch(/bin\/oc-test\s+full/i);
    expect(body).toMatch(
      /native commands.*no wrapper|no wrapper.*native commands/i,
    );
    expect(body).toMatch(/chosen command/i);
    expect(body).toMatch(/rationale/i);
    expect(body).toMatch(/bounded output/i);
  });

  test("pins failure taxonomy, route predicates, and one-rerun transient policy", () => {
    const { body } = splitFrontmatter(readFileSync(AGENT_PATH, "utf8"));

    for (const anchor of [
      "SEMANTIC",
      "TRANSIENT",
      "ENVIRONMENTAL",
      "FATAL",
      "UNKNOWN",
      "route_adv_engineer",
      "scope_risk",
      "confidence",
      "suggested_handoff",
      "exactly one rerun",
      "no flaky",
      "no transient",
    ]) {
      expect(body, `missing body anchor ${anchor}`).toContain(anchor);
    }
  });
});
