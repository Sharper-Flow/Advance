import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-tron.md");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-tron.md");
const SKILL_PATH = join(REPO_ROOT, "skills/adv-tron/SKILL.md");
const SYNC_SCRIPT_PATH = join(REPO_ROOT, "scripts/sync-global.sh");

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

  test("sync script installs the bundled adv-tron skill globally", () => {
    const content = readFileSync(SYNC_SCRIPT_PATH, "utf8");

    expect(content).toContain('REPO_SKILLS="$REPO_ROOT/skills"');
    expect(content).toContain('GLOBAL_SKILLS="$HOME/.config/opencode/skills"');
    expect(content).toContain('for skill_dir in "$REPO_SKILLS"/adv-*/; do');
    expect(content).toContain('cp "$skill_file" "$dest_dir/SKILL.md"');
  });
});
