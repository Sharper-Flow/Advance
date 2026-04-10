/**
 * Skill-Backed Command Assets Tests
 *
 * Verifies that commands with backing skills (adv-discover, adv-review,
 * adv-harden, adv-slop-scan) ship the expected skill files, load them in
 * their command prompts with inline fallback, and are covered by
 * sync-global.sh.
 *
 * Modeled on adv-tron-assets.test.ts — the canonical command+skill pattern.
 */

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const SYNC_SCRIPT_PATH = join(REPO_ROOT, "scripts/sync-global.sh");

// Skill-backed commands and their expected skill directory names
const SKILL_BACKED_COMMANDS = [
  {
    command: "adv-discover",
    skillDir: "adv-discover-methodology",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-discover.md"),
    skillPath: join(REPO_ROOT, "skills/adv-discover-methodology/SKILL.md"),
  },
  {
    command: "adv-review",
    skillDir: "adv-review-methodology",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-review.md"),
    skillPath: join(REPO_ROOT, "skills/adv-review-methodology/SKILL.md"),
  },
  {
    command: "adv-harden",
    skillDir: "adv-harden-methodology",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-harden.md"),
    skillPath: join(REPO_ROOT, "skills/adv-harden-methodology/SKILL.md"),
  },
  {
    command: "adv-slop-scan",
    skillDir: "adv-slop-detection",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-slop-scan.md"),
    skillPath: join(REPO_ROOT, "skills/adv-slop-detection/SKILL.md"),
  },
];

describe("skill-backed command assets", () => {
  for (const { command, skillDir, skillPath } of SKILL_BACKED_COMMANDS) {
    test(`${command} has a bundled skill at skills/${skillDir}/SKILL.md`, () => {
      expect(existsSync(skillPath)).toBe(true);
    });

    test(`${command} skill has YAML frontmatter with name, description, and keywords`, () => {
      const content = readFileSync(skillPath, "utf8");
      const frontmatter = content.split("---")[1] ?? "";

      expect(frontmatter).toMatch(/^name:\s+/m);
      expect(frontmatter).toMatch(/^description:\s+/m);
      expect(frontmatter).toMatch(/^keywords:\s+/m);
    });
  }

  for (const { command, commandPath } of SKILL_BACKED_COMMANDS) {
    test(`${command} command loads its backing skill`, () => {
      const content = readFileSync(commandPath, "utf8");

      expect(content).toMatch(/skill\("/);
    });

    test(`${command} command documents inline fallback if skill is unavailable`, () => {
      const content = readFileSync(commandPath, "utf8");

      expect(content).toMatch(
        /skill is unavailable|fallback|embedded protocol/i,
      );
    });
  }

  test("sync-global.sh glob covers adv-* skill directories", () => {
    const content = readFileSync(SYNC_SCRIPT_PATH, "utf8");

    expect(content).toContain('for skill_dir in "$REPO_SKILLS"/adv-*/; do');
  });
});

describe("command-vs-skill policy docs", () => {
  const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");
  const README_PATH = join(REPO_ROOT, "README.md");

  test("ADV_INSTRUCTIONS.md contains Command vs Skill Boundaries section", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("## Command vs Skill Boundaries");
    expect(content).toContain("adv-tron");
    expect(content).toContain("Skills × MUST NOT mutate ADV state");
    expect(content).toContain("inline fallback is required");
  });

  test("README.md mentions command + skill architecture", () => {
    const content = readFileSync(README_PATH, "utf8");

    expect(content).toContain("Command + skill architecture");
  });
});
