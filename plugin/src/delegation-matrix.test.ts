/**
 * Delegation Matrix Coverage Tests
 *
 * Validates the delegation-defaults spec against the design matrix:
 * - All 9 workflow steps present with valid modes
 * - Sub-agent references exist as agent files
 * - No phantom or primary agents in allowed sub-agents
 * - Cross-reference consistency with command contracts
 *
 * Realizes rq-delDefaults06 (test coverage) and provides citations for
 * rq-delDefaults01 through rq-delDefaults05.
 */

import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/delegation-defaults/spec.json");

// rq-delDefaults01: canonical 9 workflow steps
const WORKFLOW_STEPS = [
  "proposal",
  "discovery",
  "design",
  "prep",
  "apply",
  "review",
  "harden",
  "archive",
  "reflect",
] as const;
type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

// rq-delDefaults02: valid mode enum
const VALID_MODES = ["inline_required", "subagent_primary", "hybrid"] as const;
type DelegationMode = (typeof VALID_MODES)[number];

// rq-delDefaults03: forbidden agent names
const PHANTOM_AGENTS = ["librarian", "mechanic", "prioritizer"];
const PRIMARY_AGENTS = ["adv", "plan", "build", "adv-atc"];

// Known global agents (built-in to OpenCode, not in .opencode/agents/)
const GLOBAL_AGENTS = new Set(["explore", "general"]);

// Expected matrix per design D2
interface MatrixRow {
  step: WorkflowStep;
  mode: DelegationMode;
  allowedAgents: string[];
  inlineBoundaries: string[];
}

interface DelegationMatrixEntry {
  step: string;
  mode: string;
  allowed_subagents: string[];
  inline_boundaries: string[];
}

function loadDelegationMatrix(): MatrixRow[] {
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
    delegation_matrix?: DelegationMatrixEntry[];
  };

  if (!Array.isArray(spec.delegation_matrix)) {
    throw new Error(
      "delegation-defaults spec must define a machine-readable delegation_matrix array",
    );
  }

  return spec.delegation_matrix.map((entry) => ({
    step: entry.step as WorkflowStep,
    mode: entry.mode as DelegationMode,
    allowedAgents: entry.allowed_subagents,
    inlineBoundaries: entry.inline_boundaries,
  }));
}

const EXPECTED_MATRIX: MatrixRow[] = loadDelegationMatrix();

/**
 * Get agent files that exist in .opencode/agents/
 */
function getExistingAgentFiles(): Set<string> {
  const agentsDir = join(REPO_ROOT, ".opencode/agents");
  if (!existsSync(agentsDir)) return new Set();
  return new Set(
    readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, "")),
  );
}

/**
 * Check if an agent has mode: subagent in its frontmatter.
 */
function isSubagentMode(agentName: string): boolean {
  const agentPath = join(REPO_ROOT, ".opencode/agents", `${agentName}.md`);
  if (!existsSync(agentPath)) return false;
  const content = readFileSync(agentPath, "utf8");
  // Check for mode: subagent in YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return false;
  return /^mode:\s*subagent/m.test(frontmatterMatch[1]);
}

/**
 * Read a command file and check for delegation-related statements.
 */
function readCommandFile(step: string): string | null {
  const commandMap: Record<string, string> = {
    proposal: "adv-proposal.md",
    discovery: "adv-discover.md",
    design: "adv-design.md",
    prep: "adv-prep.md",
    apply: "adv-apply.md",
    review: "adv-review.md",
    harden: "adv-harden.md",
    archive: "adv-archive.md",
    reflect: "adv-reflect.md",
  };
  const filename = commandMap[step];
  if (!filename) return null;
  const path = join(REPO_ROOT, ".opencode/command", filename);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

describe("delegation matrix coverage", () => {
  const existingAgents = getExistingAgentFiles();

  // rq-delDefaults01: spec provides a machine-readable delegation matrix
  test("spec provides a machine-readable delegation matrix", () => {
    expect(EXPECTED_MATRIX.length).toBeGreaterThan(0);
    for (const row of EXPECTED_MATRIX) {
      expect(typeof row.step, "matrix row step must be a string").toBe(
        "string",
      );
      expect(
        typeof row.mode,
        `matrix row ${row.step} mode must be a string`,
      ).toBe("string");
      expect(
        Array.isArray(row.allowedAgents),
        `matrix row ${row.step} allowed_subagents must be an array`,
      ).toBe(true);
      expect(
        Array.isArray(row.inlineBoundaries),
        `matrix row ${row.step} inline_boundaries must be an array`,
      ).toBe(true);
    }
  });

  // rq-delDefaults01: all 9 steps present
  test("all 9 workflow steps have matrix entries", () => {
    const stepSet = new Set(EXPECTED_MATRIX.map((r) => r.step));
    for (const step of WORKFLOW_STEPS) {
      expect(stepSet.has(step), `Missing matrix entry for step: ${step}`).toBe(
        true,
      );
    }
    expect(EXPECTED_MATRIX.length).toBe(WORKFLOW_STEPS.length);
    expect(new Set(EXPECTED_MATRIX.map((r) => r.step)).size).toBe(
      WORKFLOW_STEPS.length,
    );
  });

  // rq-delDefaults02: valid mode per step
  test("each step has a valid delegation mode", () => {
    for (const row of EXPECTED_MATRIX) {
      expect(
        VALID_MODES.includes(row.mode),
        `Step ${row.step} has invalid mode: ${row.mode}`,
      ).toBe(true);
    }
  });

  // rq-delDefaults02: specific mode assignments match design
  test("mode assignments match design D2", () => {
    const modeMap = Object.fromEntries(
      EXPECTED_MATRIX.map((r) => [r.step, r.mode]),
    );
    expect(modeMap.proposal).toBe("inline_required");
    expect(modeMap.discovery).toBe("hybrid");
    expect(modeMap.design).toBe("hybrid");
    expect(modeMap.prep).toBe("inline_required");
    expect(modeMap.apply).toBe("hybrid");
    expect(modeMap.review).toBe("hybrid");
    expect(modeMap.harden).toBe("subagent_primary");
    expect(modeMap.archive).toBe("inline_required");
    expect(modeMap.reflect).toBe("inline_required");
  });

  // rq-delDefaults03: inline steps have no sub-agents
  test("inline_required steps have no allowed sub-agents", () => {
    for (const row of EXPECTED_MATRIX) {
      if (row.mode === "inline_required") {
        expect(
          row.allowedAgents,
          `Step ${row.step} is inline_required but has allowed agents`,
        ).toEqual([]);
      }
    }
  });

  // rq-delDefaults03: all rows name inline-only safety boundaries
  test("each step names inline-only safety boundaries", () => {
    for (const row of EXPECTED_MATRIX) {
      expect(
        row.inlineBoundaries.length,
        `Step ${row.step} must name inline-only safety boundaries`,
      ).toBeGreaterThan(0);
      if (row.mode === "inline_required") {
        expect(
          row.inlineBoundaries,
          `Step ${row.step} is inline_required and must declare full inline boundary`,
        ).toContain("full");
      }
    }
  });

  // rq-delDefaults03: hybrid/subagent steps have non-empty allowed agents
  test("hybrid and subagent_primary steps have non-empty allowed agents", () => {
    for (const row of EXPECTED_MATRIX) {
      if (row.mode !== "inline_required") {
        expect(
          row.allowedAgents.length,
          `Step ${row.step} is ${row.mode} but has no allowed agents`,
        ).toBeGreaterThan(0);
      }
    }
  });

  // rq-delDefaults03: referenced agents exist as agent files or are known global agents
  test("referenced sub-agents exist as .opencode/agents/*.md files or known global agents", () => {
    for (const row of EXPECTED_MATRIX) {
      for (const agent of row.allowedAgents) {
        const exists = existingAgents.has(agent) || GLOBAL_AGENTS.has(agent);
        expect(
          exists,
          `Agent ${agent} (referenced by step ${row.step}) does not exist as .opencode/agents/${agent}.md and is not a known global agent`,
        ).toBe(true);
      }
    }
  });

  // rq-delDefaults03: referenced agents have mode: subagent (repo-local only; global agents are inherently subagent)
  test("referenced sub-agents have mode: subagent", () => {
    for (const row of EXPECTED_MATRIX) {
      for (const agent of row.allowedAgents) {
        if (GLOBAL_AGENTS.has(agent)) continue; // Global agents are inherently subagent mode
        expect(
          isSubagentMode(agent),
          `Agent ${agent} (referenced by step ${row.step}) does not have mode: subagent`,
        ).toBe(true);
      }
    }
  });

  // rq-delDefaults03: no phantom agents in allowed lists
  test("no phantom agents in allowed sub-agents", () => {
    for (const row of EXPECTED_MATRIX) {
      for (const phantom of PHANTOM_AGENTS) {
        expect(
          row.allowedAgents.includes(phantom),
          `Phantom agent ${phantom} found in step ${row.step}`,
        ).toBe(false);
      }
    }
  });

  // rq-delDefaults03: no primary agents in allowed lists
  test("no primary agents in allowed sub-agents", () => {
    for (const row of EXPECTED_MATRIX) {
      for (const primary of PRIMARY_AGENTS) {
        expect(
          row.allowedAgents.includes(primary),
          `Primary agent ${primary} found in step ${row.step}`,
        ).toBe(false);
      }
    }
  });

  // rq-delDefaults03: specific agent assignments
  test("agent assignments match design D2", () => {
    const agentMap = Object.fromEntries(
      EXPECTED_MATRIX.map((r) => [r.step, new Set(r.allowedAgents)]),
    );
    expect(agentMap.discovery).toEqual(new Set(["adv-researcher", "explore"]));
    expect(agentMap.design).toEqual(new Set(["adv-researcher"]));
    expect(agentMap.apply).toEqual(new Set(["adv-engineer", "general"]));
    expect(agentMap.review).toEqual(new Set(["adv-reviewer", "explore"]));
    expect(agentMap.harden).toEqual(new Set(["adv-reviewer", "explore"]));
  });
});

describe("delegation matrix cross-reference", () => {
  // rq-delDefaults06: cross-reference with command contracts
  test("inline_required steps do not have command files mandating sub-agent usage", () => {
    const inlineSteps = EXPECTED_MATRIX.filter(
      (r) => r.mode === "inline_required",
    );

    for (const row of inlineSteps) {
      const content = readCommandFile(row.step);
      if (!content) continue;

      // Check for explicit sub-agent spawning instructions
      const hasExplicitSubagentSpawn =
        /subagent_type:\s*["'](?:adv-engineer|adv-reviewer|adv-researcher|explore|general|adv-tron)["']/i.test(
          content,
        );

      expect(
        hasExplicitSubagentSpawn,
        `Step ${row.step} is inline_required but command file contains explicit subagent_type spawn for a sub-agent`,
      ).toBe(false);
    }
  });

  // rq-delDefaults06: hybrid steps should not claim "no sub-agents"
  test("hybrid steps do not claim 'no sub-agents' in command files", () => {
    const hybridSteps = EXPECTED_MATRIX.filter((r) => r.mode === "hybrid");

    for (const row of hybridSteps) {
      const content = readCommandFile(row.step);
      if (!content) continue;

      const claimsNoSubagents = /no\s+sub[- ]?agents|runs\s+inline\b/i.test(
        content,
      );

      // Only fail if the claim is a definitive command-level declaration
      // (not just a mention in a broader context)
      if (claimsNoSubagents) {
        const lines = content.split("\n");
        const matchLines = lines.filter((l: string) =>
          /no\s+sub[- ]?agents|runs\s+inline\b/i.test(l),
        );
        // Allow if it's just a partial context (e.g., "by default runs inline")
        const definitive = matchLines.some(
          (l: string) =>
            /runs\s+inline\s*[-—–]\s*no\s+sub[- ]?agents/i.test(l) ||
            /^\s*\*\s*runs\s+inline/i.test(l),
        );
        expect(
          definitive,
          `Step ${row.step} is hybrid but command file definitively claims 'no sub-agents': ${matchLines[0]?.trim()}`,
        ).toBe(false);
      }
    }
  });
});
