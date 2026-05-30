/**
 * Skill Loading Policy Asset Tests
 *
 * Guards the command/skill load-site taxonomy: command-owned orchestration
 * must stay explicit, worker-only methodology must be classified, and active
 * skill references must not drift into phantom names.
 */

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const AGENT_DIR = join(REPO_ROOT, ".opencode/agents");
const SKILLS_DIR = join(REPO_ROOT, "skills");

type LoadSite =
  | "orchestrator-only"
  | "worker-only"
  | "split"
  | "inlined-agent-methodology";

interface SkillRefInventoryEntry {
  commandFile: string;
  skill: string;
  loadSite: LoadSite;
  fallbackRequired: boolean;
  workerAgents?: string[];
}

const DYNAMIC_SKILL_REFS = new Set(["{name}", "agent-{domain}"]);

const SKILL_REF_INVENTORY: SkillRefInventoryEntry[] = [
  {
    commandFile: "adv-arch-scan.md",
    skill: "adv-arch-detection",
    loadSite: "orchestrator-only",
    fallbackRequired: true,
  },
  {
    commandFile: "adv-audit.md",
    skill: "adv-audit",
    loadSite: "split",
    fallbackRequired: true,
    workerAgents: ["explore"],
  },
  {
    commandFile: "adv-cleanup.md",
    skill: "adv-cleanup",
    loadSite: "orchestrator-only",
    fallbackRequired: true,
  },
  {
    commandFile: "adv-clarify.md",
    skill: "adv-clarify",
    loadSite: "orchestrator-only",
    fallbackRequired: true,
  },
  {
    commandFile: "adv-comp-scan.md",
    skill: "adv-comp-research",
    loadSite: "orchestrator-only",
    fallbackRequired: true,
  },
  {
    commandFile: "adv-design.md",
    skill: "adv-opportunity-scout",
    loadSite: "split",
    fallbackRequired: true,
    workerAgents: ["adv-researcher"],
  },
  {
    commandFile: "adv-design.md",
    skill: "adv-user-intuit",
    loadSite: "orchestrator-only",
    fallbackRequired: true,
  },
  {
    commandFile: "adv-discover.md",
    skill: "adv-opportunity-scout",
    loadSite: "split",
    fallbackRequired: true,
    workerAgents: ["adv-researcher"],
  },
  {
    commandFile: "adv-harden.md",
    skill: "adv-frontend-review",
    loadSite: "worker-only",
    fallbackRequired: true,
    workerAgents: ["adv-reviewer"],
  },
  {
    commandFile: "adv-harden.md",
    skill: "adv-slop-detection",
    loadSite: "split",
    fallbackRequired: true,
    workerAgents: ["adv-reviewer", "adv-engineer", "explore"],
  },
  {
    commandFile: "adv-review.md",
    skill: "adv-frontend-review",
    loadSite: "worker-only",
    fallbackRequired: true,
    workerAgents: ["adv-reviewer"],
  },
  {
    commandFile: "adv-improve.md",
    skill: "adv-improve",
    loadSite: "orchestrator-only",
    fallbackRequired: true,
  },
  {
    commandFile: "adv-refactor.md",
    skill: "adv-refactor",
    loadSite: "split",
    fallbackRequired: true,
    workerAgents: ["explore"],
  },
  {
    commandFile: "adv-reflect.md",
    skill: "adv-reflect",
    loadSite: "orchestrator-only",
    fallbackRequired: true,
  },
  {
    commandFile: "adv-slop-scan.md",
    skill: "adv-slop-detection",
    loadSite: "split",
    fallbackRequired: true,
    workerAgents: ["explore"],
  },
  {
    commandFile: "adv-triage.md",
    skill: "adv-triage",
    loadSite: "orchestrator-only",
    fallbackRequired: true,
  },
  {
    commandFile: "adv-tron.md",
    skill: "adv-tron",
    loadSite: "inlined-agent-methodology",
    fallbackRequired: true,
    workerAgents: ["adv-tron"],
  },
];

function commandFiles(): string[] {
  return readdirSync(COMMAND_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort();
}

function literalSkillRefs(content: string): string[] {
  return Array.from(content.matchAll(/skill\("([^"]+)"\)/g))
    .map((match) => match[1])
    .filter((skill) => !DYNAMIC_SKILL_REFS.has(skill))
    .sort();
}

function repoSkillNames(): Set<string> {
  return new Set(
    readdirSync(SKILLS_DIR)
      .filter((entry) => existsSync(join(SKILLS_DIR, entry, "SKILL.md")))
      .sort(),
  );
}

function agentFrontmatter(agent: string): string {
  const path = join(AGENT_DIR, `${agent}.md`);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").split("---")[1] ?? "";
}

function hasNearbyFallback(content: string, skill: string): boolean {
  const lines = content.split(/\r?\n/);
  const fallbackPattern =
    /fallback|unavailable|inconclusive|degradation|otherwise continue/i;

  return lines.some((line, index) => {
    if (!line.includes(`skill("${skill}")`)) return false;

    const nearbyText = lines
      .slice(Math.max(0, index - 3), Math.min(lines.length, index + 8))
      .join("\n");

    return fallbackPattern.test(nearbyText);
  });
}

describe("skill loading policy assets", () => {
  test("ADV_INSTRUCTIONS documents load-site taxonomy values", () => {
    const content = readFileSync(
      join(REPO_ROOT, "ADV_INSTRUCTIONS.md"),
      "utf8",
    );

    expect(content).toContain("Load site");
    expect(content).toContain("orchestrator-only");
    expect(content).toContain("worker-only");
    expect(content).toContain("split");
    expect(content).toContain("inlined-agent-methodology");
  });

  test("all active command skill refs are inventoried with load-site classification", () => {
    const expected = new Set(
      SKILL_REF_INVENTORY.map((entry) => `${entry.commandFile}:${entry.skill}`),
    );
    const actual = new Set<string>();

    for (const file of commandFiles()) {
      const content = readFileSync(join(COMMAND_DIR, file), "utf8");
      for (const skill of literalSkillRefs(content)) {
        actual.add(`${file}:${skill}`);
      }
    }

    expect([...actual].sort()).toEqual([...expected].sort());
    expect(SKILL_REF_INVENTORY.every((entry) => entry.loadSite)).toBe(true);
  });

  test("literal command skill refs resolve to shipped repo skills", () => {
    const shipped = repoSkillNames();
    const missing = SKILL_REF_INVENTORY.filter(
      (entry) => !shipped.has(entry.skill),
    ).map((entry) => `${entry.commandFile}:${entry.skill}`);

    expect(missing).toEqual([]);
  });

  test("skill-backed command refs include fallback or degradation path", () => {
    const missingFallback = SKILL_REF_INVENTORY.filter(
      (entry) => entry.fallbackRequired,
    )
      .filter((entry) => {
        const content = readFileSync(
          join(COMMAND_DIR, entry.commandFile),
          "utf8",
        );
        return !hasNearbyFallback(content, entry.skill);
      })
      .map((entry) => `${entry.commandFile}:${entry.skill}`);

    expect(missingFallback).toEqual([]);
  });

  test("worker load-site entries do not target agents with explicit skill denial", () => {
    const denied = SKILL_REF_INVENTORY.flatMap((entry) =>
      (entry.workerAgents ?? [])
        .filter((agent) => !["explore", "general"].includes(agent))
        .filter((agent) =>
          /^\s*skill:\s*false\s*$/m.test(agentFrontmatter(agent)),
        )
        .map((agent) => `${entry.commandFile}:${entry.skill}->${agent}`),
    );

    expect(denied).toEqual([]);
  });

  test("opportunity scout commands use split-load contract language", () => {
    const discover = readFileSync(join(COMMAND_DIR, "adv-discover.md"), "utf8");
    const design = readFileSync(join(COMMAND_DIR, "adv-design.md"), "utf8");
    const scoutSkill = readFileSync(
      join(SKILLS_DIR, "adv-opportunity-scout", "SKILL.md"),
      "utf8",
    );
    const discoverSpec = readFileSync(
      join(REPO_ROOT, ".adv/specs/adv-discover/spec.json"),
      "utf8",
    );
    const workflowSpec = readFileSync(
      join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json"),
      "utf8",
    );

    for (const command of [discover, design]) {
      expect(command).toContain("Prepare split-load contract");
      expect(command).toContain("orchestrator owns ScoutCandidate schema");
      expect(command).toContain(
        'prompt worker to load `skill("adv-opportunity-scout")`',
      );
      expect(command).toContain("If worker skill-load is unavailable");
    }

    expect(scoutSkill).toContain("Split-load pattern");
    expect(scoutSkill).toContain(
      'worker loads `skill("adv-opportunity-scout")`',
    );
    expect(discoverSpec).toContain("split-load contract");
    expect(discoverSpec).toContain("worker skill-load unavailable");
    expect(workflowSpec).toContain("split-load contract");
    expect(workflowSpec).toContain("worker context");
  });
});
