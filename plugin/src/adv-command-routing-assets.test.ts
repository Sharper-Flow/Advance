import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const OVERLAY_DIR = join(REPO_ROOT, ".opencode/overlays");

const AGENT_DIR = join(REPO_ROOT, ".opencode/agents");

describe("ADV orchestrator agent", () => {
  test("adv.md exists with required frontmatter", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toMatch(/mode:\s*primary/);
    expect(frontmatter).toMatch(/task:\s*true/);
    expect(frontmatter).toMatch(/temperature:\s*0\.2/);
  });

  test("adv.md is a pure ADV orchestrator with no generic workflow", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    expect(content).not.toMatch(/generic workflow/i);
    expect(content).not.toMatch(/non-adv/i);
    expect(content).not.toContain("Orca");
    expect(content).not.toContain("orca");
  });

  test("adv.md uses correct 7-gate model", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    for (const gate of [
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
    ]) {
      expect(content, `missing gate: ${gate}`).toContain(gate);
    }
  });

  test("adv.md respects collaborative workflow", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    expect(content).toMatch(/clarif/i);
    expect(content).toMatch(/question/i);
    expect(content).toMatch(/user.*approv|user.*confirm|user.*judgment/i);
  });

  test("adv.md declares ADV MCP tools in frontmatter", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    // One tool from each ADV category must be present
    const requiredTools = [
      "adv_change_show",
      "adv_task_update",
      "adv_gate_complete",
      "adv_wisdom_add",
      "adv_agenda_list",
      "adv_spec",
      "adv_run_test",
      "worktree_create",
    ];
    for (const tool of requiredTools) {
      expect(frontmatter, `missing tool: ${tool}`).toContain(tool);
    }
  });

  test("adv.md includes ADV State Access Policy", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    expect(content).toContain("ADV State Access Policy");
    expect(content).toContain("adv_change_show");
    expect(content).toContain("NEVER");
  });

  test("orca.md does not exist in repo agents", () => {
    const files = readdirSync(AGENT_DIR);
    expect(files).not.toContain("orca.md");
  });

  test("orca.overlay.md does not exist in repo overlays", () => {
    const files = readdirSync(OVERLAY_DIR);
    expect(files).not.toContain("orca.overlay.md");
  });
});

describe("ADV command routing assets", () => {
  test("top-level ADV commands do not declare agent frontmatter routing", () => {
    const commandFiles = readdirSync(COMMAND_DIR).filter(
      (name) => name.startsWith("adv-") && name.endsWith(".md"),
    );

    expect(commandFiles.length).toBeGreaterThan(0);

    for (const file of commandFiles) {
      const content = readFileSync(join(COMMAND_DIR, file), "utf8");
      const frontmatter = content.split("---")[1] ?? "";
      expect(
        frontmatter,
        `${file} should not route through agent frontmatter`,
      ).not.toMatch(/^agent:\s+/m);
    }
  });

  test("adv-apply.md contains Delegation Routing section", () => {
    const content = readFileSync(join(COMMAND_DIR, "adv-apply.md"), "utf8");
    expect(content).toContain("Delegation Routing");
    expect(content).toContain("delegation_hint");
    expect(content).toContain("Apply Context Packet");
    expect(content).toContain("delegate_allowed");
    expect(content).toContain("inline_required");
  });

  test("adv-review.md uses structured context packet (not one-liner)", () => {
    const content = readFileSync(join(COMMAND_DIR, "adv-review.md"), "utf8");
    expect(content).toContain("Review Context Packet");
    expect(content).toContain("TASK EVIDENCE SUMMARY");
    expect(content).toContain("ACCEPTANCE CRITERIA");
    expect(content).not.toMatch(
      /^CHANGE CONTEXT: \{change-id\} \| \{objective-first-60-chars\}/m,
    );
  });

  test("adv-harden.md uses structured context packet (not one-liner)", () => {
    const content = readFileSync(join(COMMAND_DIR, "adv-harden.md"), "utf8");
    expect(content).toContain("Harden Context Packet");
    expect(content).toContain("TASK EVIDENCE SUMMARY");
    expect(content).toContain("ACCEPTANCE CRITERIA");
    expect(content).not.toMatch(
      /^CHANGE CONTEXT: \{change-id\} \| \{objective-first-60-chars\}/m,
    );
  });

  test("adv-review.md and adv-harden.md contain re-verification phase", () => {
    const review = readFileSync(join(COMMAND_DIR, "adv-review.md"), "utf8");
    const harden = readFileSync(join(COMMAND_DIR, "adv-harden.md"), "utf8");
    expect(review).toContain("Re-Verification");
    expect(review).toContain("PRIOR FINDINGS");
    expect(harden).toContain("Re-Verification");
    expect(harden).toContain("PRIOR FINDINGS");
  });

  test("ADV_INSTRUCTIONS.md does not list adv-apply as Inline-only", () => {
    const content = readFileSync(
      join(REPO_ROOT, "ADV_INSTRUCTIONS.md"),
      "utf8",
    );
    const inlineOnlyLine = content
      .split("\n")
      .find((line) => line.startsWith("Inline-only:"));
    expect(inlineOnlyLine).toBeDefined();
    expect(inlineOnlyLine).not.toContain("/adv-apply");
  });

  test("ADV_INSTRUCTIONS.md contains Delegation Routing and Context Packet Standards", () => {
    const content = readFileSync(
      join(REPO_ROOT, "ADV_INSTRUCTIONS.md"),
      "utf8",
    );
    expect(content).toContain("### Delegation Routing");
    expect(content).toContain("### Context Packet Standards");
    expect(content).toContain("### Post-Remediation Re-Verification");
    expect(content).toContain("strategy_label");
  });

  test("shared-agent overlay source files exist for all managed global agents", () => {
    const expected = ["adv", "general", "build", "plan", "scout", "refine"];

    for (const name of expected) {
      const file = join(OVERLAY_DIR, `${name}.overlay.md`);
      const content = readFileSync(file, "utf8");

      expect(content).toContain(`ADV_SYNC:START ${name}`);
      expect(content).toContain(`ADV_SYNC:END ${name}`);
      expect(content).toContain("NEVER invoke `/adv-*`");
      expect(content).toContain("must not spawn additional sub-agents");
    }
  });
});
