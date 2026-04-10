/**
 * Skill-Backed Command Assets Tests
 *
 * Verifies that commands with backing skills (adv-discover, adv-review,
 * adv-harden, adv-slop-scan, adv-prep, adv-apply) ship the expected skill
 * files, load them in their command prompts with inline fallback, and are
 * covered by sync-global.sh.
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
  {
    command: "adv-prep",
    skillDir: "adv-prep-methodology",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-prep.md"),
    skillPath: join(REPO_ROOT, "skills/adv-prep-methodology/SKILL.md"),
  },
  {
    command: "adv-apply",
    skillDir: "adv-apply-methodology",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-apply.md"),
    skillPath: join(REPO_ROOT, "skills/adv-apply-methodology/SKILL.md"),
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

  test("ADV_INSTRUCTIONS.md lists adv-prep and adv-apply as skill-backed commands", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("adv-prep-methodology");
    expect(content).toContain("adv-apply-methodology");
  });

  test("README.md mentions command + skill architecture", () => {
    const content = readFileSync(README_PATH, "utf8");

    expect(content).toContain("Command + skill architecture");
  });
});

describe("canonical policy sections in ADV_INSTRUCTIONS.md", () => {
  const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

  test("contains Structured Sub-Agent Prompt Protocol section", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("### Structured Sub-Agent Prompt Protocol");
    expect(content).toContain("ROLE:");
    expect(content).toContain("OUTPUT_SCHEMA:");
    expect(content).toContain("BUDGET:");
    expect(content).toContain("STOP_WHEN:");
  });

  test("contains Orchestration Token-Budget Policy section", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("### Orchestration Token-Budget Policy");
    expect(content).toContain("When to spawn");
    expect(content).toContain("Max parallel workers");
  });

  test("contains Phase Summary Pattern section", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("### Phase Summary Pattern");
    expect(content).toContain("adv_change_update");
    expect(content).toContain("compact summaries");
  });

  test("Context Freshness uses two-tier model", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("Phase start (once):");
    expect(content).toContain("Per task:");
    expect(content).toContain("adv_task_show");
    expect(content).toMatch(/Do NOT call.*adv_change_show.*before every task/i);
  });
});

describe("thin-command shape enforcement", () => {
  const LINE_CEILING = 100;

  const THIN_COMMANDS = [
    {
      command: "adv-review",
      path: join(REPO_ROOT, ".opencode/command/adv-review.md"),
      requiredPhases: [
        "Phase 0",
        "Phase 1",
        "Phase 2",
        "Phase 3",
        "REVIEW_FINDINGS",
      ],
      skillRef: "adv-review-methodology",
      // methodology that should NOT be inlined (lives in skill/checklist)
      forbiddenInline: [
        "Sub-Agent 1:",
        "Sub-Agent 2:",
        "Sub-Agent 3:",
        "Sub-Agent 4:",
        "Sub-Agent 5:",
      ],
    },
    {
      command: "adv-harden",
      path: join(REPO_ROOT, ".opencode/command/adv-harden.md"),
      requiredPhases: ["Phase 0", "Phase 1", "Phase 2", "Phase 3"],
      skillRef: "adv-harden-methodology",
      forbiddenInline: [
        "Sub-Agent 1:",
        "Sub-Agent 2:",
        "Sub-Agent 3:",
        "Sub-Agent 4:",
        "Sub-Agent 5:",
        "Sub-Agent 6:",
      ],
    },
    {
      command: "adv-slop-scan",
      path: join(REPO_ROOT, ".opencode/command/adv-slop-scan.md"),
      requiredPhases: ["Phase 0", "Phase 1", "Phase 2"],
      skillRef: "adv-slop-detection",
      forbiddenInline: ["Scanner | Category | Focus"],
    },
    {
      command: "adv-proposal",
      path: join(REPO_ROOT, ".opencode/command/adv-proposal.md"),
      requiredPhases: ["Phase 1", "Phase 2", "Command Boundary"],
      skillRef: null, // command-only, no backing skill
      forbiddenInline: ["INVEST Criteria", "Smell Detection"],
    },
    {
      command: "adv-prep",
      path: join(REPO_ROOT, ".opencode/command/adv-prep.md"),
      requiredPhases: ["Phase 0", "Phase 1", "Phase 2", "Command Boundary"],
      skillRef: "adv-prep-methodology",
      forbiddenInline: [
        "| **I**ndependent |",
        "| Subjective |",
        "| Retrofit chains |",
        "| 3-5 line change",
      ],
    },
    {
      command: "adv-apply",
      path: join(REPO_ROOT, ".opencode/command/adv-apply.md"),
      requiredPhases: ["Phase 0", "Phase 1", "Phase 2", "Phase 3"],
      skillRef: "adv-apply-methodology",
      forbiddenInline: [
        '| "Let\'s skip/defer this" |',
        '| "This might need manual work" |',
        "| 3+ files, breaking API",
      ],
    },
  ];

  for (const { command, path: cmdPath } of THIN_COMMANDS) {
    test(`${command} is ≤${LINE_CEILING} lines`, () => {
      const content = readFileSync(cmdPath, "utf8");
      const lineCount = content.split("\n").length;

      expect(lineCount).toBeLessThanOrEqual(LINE_CEILING);
    });
  }

  for (const { command, path: cmdPath, requiredPhases } of THIN_COMMANDS) {
    test(`${command} retains phase skeleton headings`, () => {
      const content = readFileSync(cmdPath, "utf8");

      for (const phase of requiredPhases) {
        expect(content).toContain(phase);
      }
    });
  }

  for (const { command, path: cmdPath, forbiddenInline } of THIN_COMMANDS) {
    test(`${command} does not duplicate methodology inline`, () => {
      const content = readFileSync(cmdPath, "utf8");

      for (const forbidden of forbiddenInline) {
        expect(content).not.toContain(forbidden);
      }
    });
  }

  for (const { command, path: cmdPath, skillRef } of THIN_COMMANDS) {
    if (skillRef) {
      test(`${command} references its backing skill (${skillRef})`, () => {
        const content = readFileSync(cmdPath, "utf8");

        expect(content).toContain(skillRef);
      });
    }
  }

  test("proposal-checklist.md exists for extracted INVEST/smell methodology", () => {
    const checklistPath = join(
      REPO_ROOT,
      "docs/checklists/proposal-checklist.md",
    );

    expect(existsSync(checklistPath)).toBe(true);
  });

  test("prep-checklist uses planning gate terminology", () => {
    const content = readFileSync(
      join(REPO_ROOT, "docs/checklists/prep-checklist.md"),
      "utf8",
    );

    expect(content).toContain("adv_gate_complete gateId: planning");
    expect(content).not.toContain("adv_gate_complete gateId: prep");
  });

  test("adv-prep checks gate prerequisites before planning work", () => {
    const content = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-prep.md"),
      "utf8",
    );

    expect(content).toContain("adv_gate_status");
    expect(content).toMatch(
      /Stop if discovery or design gates are incomplete/i,
    );
  });

  test("review and harden commands do not complete gates directly", () => {
    const reviewContent = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-review.md"),
      "utf8",
    );
    const hardenContent = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-harden.md"),
      "utf8",
    );

    expect(reviewContent).not.toContain("adv_gate_complete");
    expect(hardenContent).not.toContain("adv_gate_complete");
  });

  test("adv-apply uses two-tier context freshness (adv_task_show per task, not adv_change_show)", () => {
    const content = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-apply.md"),
      "utf8",
    );

    // Should NOT have the old pattern of calling adv_change_show before each task
    expect(content).not.toMatch(/Before EACH task[\s\S]*?adv_change_show/);
    // Should reference adv_task_show for per-task context refresh
    expect(content).toContain("adv_task_show");
  });
});
