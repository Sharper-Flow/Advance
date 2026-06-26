import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-tron.md");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-tron.md");
const SKILL_PATH = join(REPO_ROOT, "skills/adv-tron/SKILL.md");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");

const ROUTING_COMMANDS = [
  "adv-optimizer",
  "adv-slop-scan",
  "adv-arch-scan",
  "adv-proposal",
  "adv-task",
  "adv-tron",
] as const;

function readTronAssets(): Record<"command" | "agent" | "skill", string> {
  return {
    command: readFileSync(COMMAND_PATH, "utf8"),
    agent: readFileSync(AGENT_PATH, "utf8"),
    skill: readFileSync(SKILL_PATH, "utf8"),
  };
}

function splitFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("File does not have a YAML frontmatter block");
  return { frontmatter: match[1], body: match[2] };
}

function expectAllTronSurfacesToContain(
  assets: Record<"command" | "agent" | "skill", string>,
  fragments: string[],
) {
  for (const [surface, content] of Object.entries(assets)) {
    for (const fragment of fragments) {
      expect(content, `${surface} missing ${fragment}`).toContain(fragment);
    }
  }
}

describe("adv-tron assets", () => {
  test("ships command, agent, and skill definitions", () => {
    expect(existsSync(COMMAND_PATH)).toBe(true);
    expect(existsSync(AGENT_PATH)).toBe(true);
    expect(existsSync(SKILL_PATH)).toBe(true);
  });

  test("uses current lgrep index tool names in the adv-tron agent", () => {
    const content = readFileSync(AGENT_PATH, "utf8");

    expect(content).toContain("lgrep_index_symbols_folder: true");
    expect(content).toContain("lgrep_index_symbols_repo: true");
    expect(content).not.toContain("lgrep_index_folder: true");
    expect(content).not.toContain("lgrep_index_repo: true");
  });

  test("documents a skill-load fallback in the command prompt", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("If the skill is unavailable");
  });

  test("pins baseline context and bounded scan guidance across tron surfaces", () => {
    const assets = readTronAssets();

    expectAllTronSurfacesToContain(assets, [
      "Analysis Startup Sequence",
      "WORKING DIRECTORY",
      "adv_project_context",
      "active ADV state",
      "repo tree/outline",
      "coverage gaps",
      "Broad Scan",
      "Scoped Scan",
      "structure map",
      "hotspot/risk scan",
      "dependency/usage trace",
      "active-change/spec overlap",
    ]);
  });

  test("pins follow-up routing and combo guidance across tron surfaces", () => {
    const assets = readTronAssets();

    expectAllTronSurfacesToContain(assets, [
      "Follow-up Routing Matrix",
      "trigger criteria",
      "Combination routing examples",
      "Unsupported signals",
      "coverage gaps/open questions",
    ]);

    for (const command of ROUTING_COMMANDS) {
      expect(
        existsSync(join(REPO_ROOT, ".opencode/command", `${command}.md`)),
      ).toBe(true);
      expectAllTronSurfacesToContain(assets, [`/${command}`]);
    }

    expectAllTronSurfacesToContain(assets, [
      "/adv-slop-scan <target> then /adv-optimizer <target>",
      "/adv-arch-scan <target> then /adv-slop-scan <target>",
    ]);
  });

  test("pins tron degraded-execution and mutation boundaries", () => {
    const assets = readTronAssets();
    const { frontmatter } = splitFrontmatter(assets.agent);

    expectAllTronSurfacesToContain(assets, [
      "Degraded Execution",
      "lgrep",
      "fallback",
      "degraded coverage",
      "must not invoke `/adv-*`",
      "must not create agenda/change/task state",
      "must not edit files",
      "adv_subagent_report_submit",
    ]);

    for (const deniedTool of [
      "write",
      "edit",
      "bash",
      "task",
      "adv_change_create",
      "adv_task_add",
      "adv_gate_complete",
      "context7_*",
      "exa_*",
      "webfetch",
      "searchcode_*",
    ]) {
      const escaped = deniedTool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(frontmatter).toMatch(
        new RegExp(`^\\s+${escaped}:\\s*false\\s*$`, "m"),
      );
    }

    expect(frontmatter).toMatch(/^\s+adv_subagent_report_submit:\s*true\s*$/m);
  });

  test("deploy script installs the bundled adv-tron skill globally", () => {
    const content = readFileSync(DEPLOY_SCRIPT_PATH, "utf8");

    expect(content).toContain('REPO_SKILLS="$ASSET_ROOT/skills"');
    expect(content).toContain('GLOBAL_SKILLS="$HOME/.config/opencode/skills"');
    expect(content).toContain('for skill_dir in "$REPO_SKILLS"/adv-*/; do');
    // ADR-002: whole-directory sync (cp -R) preserves sibling docs + subdirs
    expect(content).toContain('(cd "$skill_dir" && cp -R . "$dest_dir/")');
  });
});
