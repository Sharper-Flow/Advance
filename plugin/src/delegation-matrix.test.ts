/**
 * Delegation Matrix Coverage Tests
 *
 * Validates the delegation-defaults spec's machine-readable matrix:
 * - All 9 workflow steps present with valid modes
 * - Gate affinities and delegated sub-steps are structurally represented
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
import { SUBAGENT_WARN_FIRST_PACKET_ANCHORS } from "./types";
import { applyDeltasToSpec } from "./archive/delta";
import type { Delta, Spec } from "./types";

const REPO_ROOT = resolve(__dirname, "../..");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/delegation-defaults/spec.json");
const PROVIDER_EVAL_PROMPT_PATH = join(
  REPO_ROOT,
  "scripts/provider-eval-prompts/gpt.yaml",
);
const DOCS_SPEC_PATH = join(REPO_ROOT, "docs/specs/delegation-defaults.md");

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

const VALID_SUBSTEP_MODES = ["subagent_primary", "delegate_allowed"] as const;
type DelegatedSubstepMode = (typeof VALID_SUBSTEP_MODES)[number];

const EXPECTED_GATE_AFFINITY: Record<WorkflowStep, string> = {
  proposal: "proposal",
  discovery: "discovery",
  design: "design",
  prep: "planning",
  apply: "execution",
  review: "acceptance",
  harden: "release",
  archive: "release",
  reflect: "post-release",
};

// rq-delDefaults03: forbidden agent names
const PHANTOM_AGENTS = ["librarian", "mechanic", "prioritizer"];
const PRIMARY_AGENTS = ["adv", "plan", "build"];

// Known global agents (built into OpenCode, not in .opencode/agents/).
const GLOBAL_AGENTS = new Set(["explore", "general"]);

const KNOWN_SPAWNABLE_SUBAGENTS = [
  "adv-engineer",
  "adv-reviewer",
  "adv-designer",
  "adv-researcher",
  "adv-tron",
  "adv-verifier",
  "adv-visual-review",
  "explore",
  "general",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Canonical matrix loaded from the delegation-defaults spec.
interface MatrixRow {
  step: WorkflowStep;
  gateAffinity: string;
  mode: DelegationMode;
  allowedAgents: string[];
  inlineBoundaries: string[];
  delegatedSubsteps?: DelegatedSubstep[];
}

interface DelegatedSubstep {
  name: string;
  mode: DelegatedSubstepMode;
  allowedAgents: string[];
  packetContracts?: PacketContract[];
}

interface PacketContract {
  agent: string;
  reportTransport: string;
  requiredPacketAnchors: string[];
  warnPacketAnchors?: string[];
}

interface DelegationMatrixEntry {
  step: string;
  gate_affinity: string;
  mode: string;
  allowed_subagents: string[];
  inline_boundaries: string[];
  delegated_substeps?: {
    name: string;
    mode: string;
    allowed_subagents: string[];
    packet_contracts?: {
      agent: string;
      report_transport: string;
      required_packet_anchors: string[];
      warn_packet_anchors?: string[];
    }[];
  }[];
}

interface SpecRequirement {
  id: string;
  body: string;
  scenarios?: { then?: string[] }[];
}

interface DelegationDefaultsSpec {
  delegation_matrix?: DelegationMatrixEntry[];
  requirements?: SpecRequirement[];
}

const RESTORE_DEL_DEFAULTS10_ARCHIVE_DELTA: Extract<
  Delta,
  { operation: "modify" }
> = {
  id: "dl-RestoreDel10",
  operation: "modify",
  target_id: "rq-delDefaults10",
  changes: {
    title: "Engineer-First Frontend Dispatch with Designer Follow-up",
    body: "For delegated code tasks with metadata.frontend set to true, ADV MUST route initial implementation to adv-engineer. After successful same-task, same-cycle engineer evidence, ADV MUST dispatch adv-designer as a bounded UI/UX follow-up with engineer-report provenance. When risk signals force inline implementation, ADV MUST dispatch the same designer follow-up with bounded inline provenance. An explicit metadata.delegation_hint remains an override only among valid initial implementation routes and MUST NOT select adv-designer first for classified frontend work. adv-designer remains apply-phase only and MUST NOT own review or harden; adv-reviewer retains review and harden ownership.",
    tags: ["delegation", "frontend", "engineer-first", "designer-follow-up"],
    scenarios: [
      {
        id: "rq-delDefaults10.1",
        title: "Classified frontend task starts with engineer",
        given: [
          "A code task has metadata.frontend set to true",
          "No step-4 risk signal forces inline implementation",
        ],
        when: "ADV selects an initial implementation lane",
        then: [
          "ADV dispatches adv-engineer before adv-designer",
          "ADV does not dispatch adv-designer as the initial implementation lane",
        ],
      },
      {
        id: "rq-delDefaults10.2",
        title: "Matching implementation receipt drives designer follow-up",
        given: [
          "A code task has metadata.frontend set to true",
          "A same-task same-cycle adv-engineer report completed with passing verification and no blockers, or a classified inline implementation has bounded provenance",
        ],
        when: "Initial implementation completes",
        then: [
          "ADV dispatches a matching-cycle adv-designer follow-up",
          "Designer provenance references the engineer report or inline receipt",
          "Missing, stale, or mismatched provenance is rejected",
        ],
      },
      {
        id: "rq-delDefaults10.3",
        title: "Reviewer retains review and harden ownership",
        given: ["A change includes frontend scope"],
        when: "The change reaches review or harden",
        then: [
          "adv-designer does not own review or harden",
          "adv-reviewer retains review and harden ownership",
        ],
      },
    ],
  },
};

/**
 * rq-delDefaults10 modify delta (AC4/SC3): names the apply_context JSON
 * shape that binds the active implementation cycle in a designer/engineer
 * report. Additive only — augments the body and scenario rq-delDefaults10.2
 * "then" without removing any existing semantic requirement (DDC3). Mirrors
 * the recorded change delta authored during the change workflow.
 */
const FIX_FRONTEND_BIND_DELTA: Extract<Delta, { operation: "modify" }> = {
  id: "dl-FixFrontendBind10",
  operation: "modify",
  target_id: "rq-delDefaults10",
  changes: {
    title: "Engineer-First Frontend Dispatch with Designer Follow-up",
    body: "For delegated code tasks with metadata.frontend set to true, ADV MUST route initial implementation to adv-engineer. After successful same-task, same-cycle engineer evidence, ADV MUST dispatch adv-designer as a bounded UI/UX follow-up with engineer-report provenance. When risk signals force inline implementation, ADV MUST dispatch the same designer follow-up with bounded inline provenance. An explicit metadata.delegation_hint remains an override only among valid initial implementation routes and MUST NOT select adv-designer first for classified frontend work. The matching implementation cycle MUST be bound under report.apply_context.implementation_cycle_id with a valid implementation_provenance (kind: engineer, engineer_report, or inline); a top-level implementation_cycle_id is rejected by the strict report schema. adv-designer remains apply-phase only and MUST NOT own review or harden; adv-reviewer retains review and harden ownership.",
    tags: [
      "delegation",
      "frontend",
      "engineer-first",
      "designer-follow-up",
      "apply-context-binding",
    ],
    scenarios: [
      {
        id: "rq-delDefaults10.1",
        title: "Classified frontend task starts with engineer",
        given: [
          "A code task has metadata.frontend set to true",
          "No step-4 risk signal forces inline implementation",
        ],
        when: "ADV selects an initial implementation lane",
        then: [
          "ADV dispatches adv-engineer before adv-designer",
          "ADV does not dispatch adv-designer as the initial implementation lane",
        ],
      },
      {
        id: "rq-delDefaults10.2",
        title: "Matching implementation receipt drives designer follow-up",
        given: [
          "A code task has metadata.frontend set to true",
          "A same-task same-cycle adv-engineer report completed with passing verification and no blockers, or a classified inline implementation has bounded provenance",
        ],
        when: "Initial implementation completes",
        then: [
          "ADV dispatches a matching-cycle adv-designer follow-up",
          "Designer provenance references the engineer report or inline receipt",
          "The implementation cycle is carried under report.apply_context.implementation_cycle_id with a valid implementation_provenance (engineer, engineer_report, or inline); a top-level implementation_cycle_id is rejected",
          "Missing, stale, or mismatched provenance is rejected",
        ],
      },
      {
        id: "rq-delDefaults10.3",
        title: "Reviewer retains review and harden ownership",
        given: ["A change includes frontend scope"],
        when: "The change reaches review or harden",
        then: [
          "adv-designer does not own review or harden",
          "adv-reviewer retains review and harden ownership",
        ],
      },
    ],
  },
};

function loadSpec(): DelegationDefaultsSpec {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8")) as DelegationDefaultsSpec;
}

function loadDelegationMatrix(): MatrixRow[] {
  const spec = loadSpec();

  if (!Array.isArray(spec.delegation_matrix)) {
    throw new Error(
      "delegation-defaults spec must define a machine-readable delegation_matrix array",
    );
  }

  return spec.delegation_matrix.map((entry) => ({
    step: entry.step as WorkflowStep,
    gateAffinity: entry.gate_affinity,
    mode: entry.mode as DelegationMode,
    allowedAgents: entry.allowed_subagents,
    inlineBoundaries: entry.inline_boundaries,
    delegatedSubsteps: entry.delegated_substeps?.map((substep) => ({
      name: substep.name,
      mode: substep.mode as DelegatedSubstepMode,
      allowedAgents: substep.allowed_subagents,
      packetContracts: substep.packet_contracts?.map((contract) => ({
        agent: contract.agent,
        reportTransport: contract.report_transport,
        requiredPacketAnchors: contract.required_packet_anchors,
        warnPacketAnchors: contract.warn_packet_anchors,
      })),
    })),
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

function extractExplicitCommandSubagentTargets(content: string): string[] {
  const targets = new Set<string>();

  for (const agent of KNOWN_SPAWNABLE_SUBAGENTS) {
    const escaped = escapeRegExp(agent);
    const patterns = [
      new RegExp("subagent_type[\"']?\\s*:\\s*[\"']" + escaped + "[\"']", "i"),
      new RegExp("\\bspawn\\s+`?" + escaped + "`?\\b", "i"),
      new RegExp("\\bdelegate\\s+to\\s+`?" + escaped + "`?\\b", "i"),
      new RegExp("Task tool \\([^)]*" + escaped + "[^)]*\\)", "i"),
      new RegExp(
        "`" + escaped + "`\\s+(?:sub-agent|agent|validator|worker)",
        "i",
      ),
    ];

    if (patterns.some((pattern) => pattern.test(content))) {
      targets.add(agent);
    }
  }

  return [...targets].sort();
}

function expectSubstep(
  row: MatrixRow,
  name: string,
  mode: DelegatedSubstepMode,
  allowedAgents: string[],
): void {
  expect(row.delegatedSubsteps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name,
        mode,
        allowedAgents,
      }),
    ]),
  );
}

function expectPacketContract(
  row: MatrixRow,
  substepName: string,
  agent: string,
  reportTransport: string,
  requiredPacketAnchors: string[],
  warnPacketAnchors: string[] = [],
): void {
  const substep = row.delegatedSubsteps?.find(
    (candidate) => candidate.name === substepName,
  );
  expect(substep, `${row.step}/${substepName} must exist`).toBeDefined();
  const contract = substep?.packetContracts?.find(
    (candidate) => candidate.agent === agent,
  );
  expect(
    contract,
    `${row.step}/${substepName} must define packet contract for ${agent}`,
  ).toBeDefined();
  expect(contract?.reportTransport).toBe(reportTransport);
  expect(contract?.requiredPacketAnchors).toEqual(requiredPacketAnchors);
  expect(contract?.warnPacketAnchors ?? []).toEqual(warnPacketAnchors);
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
      expect(
        typeof row.gateAffinity,
        `matrix row ${row.step} gate_affinity must be a string`,
      ).toBe("string");
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

  // rq-delDefaults01: each workflow step maps to one gate-affinity phase
  test("gate affinities match the seven-gate lifecycle", () => {
    const affinityMap = Object.fromEntries(
      EXPECTED_MATRIX.map((row) => [row.step, row.gateAffinity]),
    );
    expect(affinityMap).toEqual(EXPECTED_GATE_AFFINITY);
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

  // rq-delDefaults02 rq-delDefaults03: delegable steps structurally name delegated sub-steps
  test("hybrid and subagent_primary steps name delegated sub-steps", () => {
    for (const row of EXPECTED_MATRIX) {
      if (row.mode === "inline_required") {
        expect(
          row.delegatedSubsteps ?? [],
          `Step ${row.step} is inline_required and must not delegate sub-steps`,
        ).toEqual([]);
        continue;
      }

      expect(
        row.delegatedSubsteps?.length ?? 0,
        `Step ${row.step} must structurally name delegated sub-steps`,
      ).toBeGreaterThan(0);

      for (const substep of row.delegatedSubsteps ?? []) {
        expect(substep.name.length).toBeGreaterThan(0);
        expect(
          VALID_SUBSTEP_MODES.includes(substep.mode),
          `Sub-step ${row.step}/${substep.name} has invalid mode ${substep.mode}`,
        ).toBe(true);
        expect(
          substep.allowedAgents.length,
          `Sub-step ${row.step}/${substep.name} must name allowed sub-agents`,
        ).toBeGreaterThan(0);
        for (const agent of substep.allowedAgents) {
          expect(
            row.allowedAgents.includes(agent),
            `Sub-step ${row.step}/${substep.name} references ${agent} outside row allowed_subagents`,
          ).toBe(true);
        }
      }
    }
  });

  // rq-delDefaults04: discovery wide scans delegate; prep does not
  test("wide-scan delegation is explicit for discovery and absent for prep", () => {
    const rows = Object.fromEntries(
      EXPECTED_MATRIX.map((row) => [row.step, row]),
    );

    expectSubstep(
      rows.discovery,
      "Prior Research Extension",
      "subagent_primary",
      ["adv-researcher"],
    );
    expectSubstep(
      rows.discovery,
      "P25 Related-Pattern Scan",
      "subagent_primary",
      ["explore", "adv-researcher"],
    );
    expect(rows.prep.mode).toBe("inline_required");
    expect(rows.prep.allowedAgents).toEqual([]);
    expect(rows.prep.delegatedSubsteps ?? []).toEqual([]);
  });

  // rq-delDefaults03 rq-delDefaults06: conditional remediation workers are explicit
  test("review and harden remediation sub-agent routing is explicit", () => {
    const rows = Object.fromEntries(
      EXPECTED_MATRIX.map((row) => [row.step, row]),
    );

    expectSubstep(rows.review, "Review Remediation Fixes", "delegate_allowed", [
      "adv-reviewer",
      "adv-engineer",
    ]);
    expectSubstep(rows.review, "Non-Trivial Fix Research", "delegate_allowed", [
      "adv-researcher",
    ]);
    expectSubstep(
      rows.harden,
      "Hardening Remediation Fixes",
      "delegate_allowed",
      ["adv-reviewer", "adv-engineer"],
    );
  });

  // rq-delDefaults05: scanner lanes and typed worker lanes have different packet contracts
  test("delegated scanner and worker lanes pin report transport and packet anchors", () => {
    const rows = Object.fromEntries(
      EXPECTED_MATRIX.map((row) => [row.step, row]),
    );

    expectPacketContract(
      rows.apply,
      "Context-Shed Implementation",
      "adv-engineer",
      "typed_persisted_worker",
      ["WORKING DIRECTORY", "CHANGE", "TASK", "ATTEMPT"],
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
    );
    expectPacketContract(
      rows.apply,
      "Frontend Implementation",
      "adv-designer",
      "typed_persisted_worker",
      ["WORKING DIRECTORY", "CHANGE", "TASK", "ATTEMPT"],
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
    );
    expectPacketContract(
      rows.apply,
      "Verify-Only Burst",
      "adv-verifier",
      "orchestrator_submitted_verification_bundle",
      ["WORKING DIRECTORY", "CHANGE", "SCOPE KEY", "PHASE", "ATTEMPT"],
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
    );
    expectPacketContract(
      rows.review,
      "Scoped Evidence Scan",
      "explore",
      "non_persisted_scanner",
      ["WORKING DIRECTORY", "CHANGE", "ATTEMPT"],
    );
    expectPacketContract(
      rows.review,
      "Review Remediation Fixes",
      "adv-reviewer",
      "typed_persisted_worker",
      ["WORKING DIRECTORY", "CHANGE", "TASK", "PHASE", "ATTEMPT"],
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
    );
    expectPacketContract(
      rows.review,
      "Review Remediation Fixes",
      "adv-engineer",
      "typed_persisted_worker",
      ["WORKING DIRECTORY", "CHANGE", "TASK", "ATTEMPT"],
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
    );
    expectPacketContract(
      rows.harden,
      "Six-Scanner Hardening Pass",
      "explore",
      "non_persisted_scanner",
      ["WORKING DIRECTORY", "CHANGE", "ATTEMPT"],
    );
    expectPacketContract(
      rows.harden,
      "Hardening Remediation Fixes",
      "adv-reviewer",
      "typed_persisted_worker",
      ["WORKING DIRECTORY", "CHANGE", "TASK", "PHASE", "ATTEMPT"],
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
    );
    expectPacketContract(
      rows.harden,
      "Hardening Remediation Fixes",
      "adv-engineer",
      "typed_persisted_worker",
      ["WORKING DIRECTORY", "CHANGE", "TASK", "ATTEMPT"],
      [...SUBAGENT_WARN_FIRST_PACKET_ANCHORS],
    );
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
    expect(agentMap.apply).toEqual(
      new Set(["adv-engineer", "adv-designer", "adv-verifier", "general"]),
    );
    expect(agentMap.review).toEqual(
      new Set(["adv-reviewer", "adv-engineer", "adv-researcher", "explore"]),
    );
    expect(agentMap.harden).toEqual(
      new Set(["adv-reviewer", "adv-engineer", "explore"]),
    );
  });

  // rq-delDefaults05: worker reports must stay structured enough for orchestration
  test("structured worker report coverage is represented in the spec", () => {
    const spec = loadSpec();
    const requirement = spec.requirements?.find(
      (entry) => entry.id === "rq-delDefaults05",
    );
    expect(requirement, "rq-delDefaults05 must exist").toBeDefined();

    const text = [
      requirement?.body ?? "",
      ...(requirement?.scenarios ?? []).flatMap(
        (scenario) => scenario.then ?? [],
      ),
    ].join("\n");

    for (const agent of [
      "adv-engineer",
      "adv-reviewer",
      "adv-designer",
      "adv-researcher",
      "adv-tron",
    ]) {
      expect(text).toContain(agent);
    }

    for (const requiredField of [
      "evidence",
      "scope",
      "blockers",
      "next action",
    ]) {
      expect(text.toLowerCase()).toContain(requiredField);
    }
  });

  // rq-delDefaults07: frontend-capable workers must have browser verification capability.
  test("browser verification capability for frontend workers is represented in the spec", () => {
    const spec = loadSpec();
    const requirement = spec.requirements?.find(
      (entry) => entry.id === "rq-delDefaults07",
    );
    expect(requirement, "rq-delDefaults07 must exist").toBeDefined();

    const text = [
      requirement?.body ?? "",
      ...(requirement?.scenarios ?? []).flatMap(
        (scenario) => scenario.then ?? [],
      ),
    ].join("\n");

    for (const expected of [
      "adv-designer",
      "adv-reviewer",
      "playwright_*",
      "skill: true",
      'skill("playwright-mcp")',
      "not for web research",
    ]) {
      expect(text).toContain(expected);
    }
  });

  // rq-delDefaults09: bounded ready-task routing metadata projection.
  test("bounded ready-task routing metadata projection is represented in the spec", () => {
    const spec = loadSpec();
    const requirement = spec.requirements?.find(
      (entry) => entry.id === "rq-delDefaults09",
    );
    expect(requirement, "rq-delDefaults09 must exist").toBeDefined();

    const scenarioIds =
      requirement?.scenarios?.map((scenario) => scenario.id) ?? [];
    expect(scenarioIds).toEqual([
      "rq-delDefaults09.1",
      "rq-delDefaults09.2",
      "rq-delDefaults09.3",
    ]);

    const text = [
      requirement?.body ?? "",
      ...(requirement?.scenarios ?? []).flatMap(
        (scenario) => scenario.then ?? [],
      ),
    ].join("\n");

    for (const expected of [
      "adv_task_ready",
      "delegation_hint",
      "frontend",
      "formatted",
      "bounded",
      "raw ready[]",
    ]) {
      expect(text).toContain(expected);
    }
  });

  // rq-delDefaults10: engineer-first frontend dispatch with mandatory designer follow-up.
  test("engineer-first frontend dispatch is represented by the archive-time modify delta", () => {
    const currentSpec = loadSpec() as Spec;
    const application = applyDeltasToSpec(
      structuredClone(currentSpec),
      [RESTORE_DEL_DEFAULTS10_ARCHIVE_DELTA],
      currentSpec.version,
    );

    expect(application.deltaResults).toEqual([
      expect.objectContaining({
        success: true,
        deltaId: "dl-RestoreDel10",
        operation: "modify",
        targetId: "rq-delDefaults10",
      }),
    ]);

    const requirement = application.updatedSpec?.requirements.find(
      (entry) => entry.id === "rq-delDefaults10",
    );
    expect(
      requirement,
      "archive application must restore rq-delDefaults10",
    ).toBeDefined();

    expect(requirement?.body).toContain(
      "MUST route initial implementation to adv-engineer",
    );
    expect(requirement?.body).toContain("MUST NOT select adv-designer first");
    expect(requirement?.body).not.toContain(
      "MUST route initial implementation to adv-designer",
    );

    const initialLane = requirement?.scenarios?.find(
      (scenario) => scenario.id === "rq-delDefaults10.1",
    );
    expect(initialLane).toMatchObject({
      when: "ADV selects an initial implementation lane",
      then: [
        "ADV dispatches adv-engineer before adv-designer",
        "ADV does not dispatch adv-designer as the initial implementation lane",
      ],
    });
    expect(initialLane?.then).not.toContain(
      "ADV dispatches adv-designer as the initial implementation lane",
    );

    const followUp = requirement?.scenarios?.find(
      (scenario) => scenario.id === "rq-delDefaults10.2",
    );
    expect(followUp?.then).toContain(
      "ADV dispatches a matching-cycle adv-designer follow-up",
    );
  });

  // rq-delDefaults10: apply_context JSON shape is named by the modify delta (AC4/SC3).
  test("apply_context binding shape is named by the modify delta and stays additive", () => {
    const currentSpec = loadSpec() as Spec;
    const application = applyDeltasToSpec(
      structuredClone(currentSpec),
      [FIX_FRONTEND_BIND_DELTA],
      currentSpec.version,
    );

    expect(application.deltaResults).toEqual([
      expect.objectContaining({
        success: true,
        deltaId: "dl-FixFrontendBind10",
        operation: "modify",
        targetId: "rq-delDefaults10",
      }),
    ]);

    const requirement = application.updatedSpec?.requirements.find(
      (entry) => entry.id === "rq-delDefaults10",
    );
    expect(requirement, "delta must target rq-delDefaults10").toBeDefined();

    // AC4/SC3: the apply_context JSON shape is named in the body.
    expect(requirement?.body).toContain(
      "report.apply_context.implementation_cycle_id",
    );
    expect(requirement?.body).toContain("implementation_provenance");
    expect(requirement?.body).toContain("engineer_report");

    // DDC3: additive — existing engineer-first semantics preserved.
    expect(requirement?.body).toContain(
      "MUST route initial implementation to adv-engineer",
    );
    expect(requirement?.body).toContain("MUST NOT select adv-designer first");

    // Scenario .2 carries the nesting requirement (additive clause).
    const followUp = requirement?.scenarios?.find(
      (scenario) => scenario.id === "rq-delDefaults10.2",
    );
    expect(
      followUp?.then?.some((clause) =>
        clause.includes("report.apply_context.implementation_cycle_id"),
      ),
    ).toBe(true);
    expect(followUp?.then).toContain(
      "ADV dispatches a matching-cycle adv-designer follow-up",
    );

    // Scenarios .1 and .3 unchanged (additivity).
    const initialLane = requirement?.scenarios?.find(
      (scenario) => scenario.id === "rq-delDefaults10.1",
    );
    expect(initialLane?.then).toContain(
      "ADV dispatches adv-engineer before adv-designer",
    );
    const reviewer = requirement?.scenarios?.find(
      (scenario) => scenario.id === "rq-delDefaults10.3",
    );
    expect(reviewer?.then).toContain(
      "adv-reviewer retains review and harden ownership",
    );
  });

  // rq-delDefaults06: provider-eval GPT prompt anchors a delegation regression test.
  test("provider-eval GPT prompt anchors a delegation under-spawn regression test", () => {
    const content = readFileSync(PROVIDER_EVAL_PROMPT_PATH, "utf8");

    expect(content).toContain("delegation-under-spawn-01");
    expect(content).toContain("delegation_under_spawn");

    // Slice the individual prompt block so assertions are scoped to the
    // delegation regression prompt, not the whole file.
    const blockStart = content.indexOf("- id: delegation-under-spawn-01");
    expect(blockStart).toBeGreaterThanOrEqual(0);
    const nextPrompt = content.indexOf("\n  - id:", blockStart + 1);
    const block =
      nextPrompt > 0
        ? content.slice(blockStart, nextPrompt)
        : content.slice(blockStart);

    // Expected patterns must reference matrix-allowed sub-agents and the
    // delegation decision surface.
    for (const agent of [
      "adv-researcher",
      "adv-engineer",
      "explore",
      "general",
    ]) {
      expect(block).toContain(agent);
    }
    expect(block).toContain("adv_change_show");
    expect(block).toContain("adv_task_ready");

    // Forbidden patterns guard against inline fallback.
    expect(block).toMatch(/no\s+sub[- ]?agents/i);
    expect(block).toMatch(/runs\s+inline/i);

    // Provider-specific ADV runtime agents must be forbidden, not expected.
    for (const forbidden of ["adv-gpt", "adv-claude", "adv-glm", "adv-kimi"]) {
      expect(block).toMatch(
        new RegExp(
          `forbidden_patterns:[\\s\\S]*${forbidden.replace(/-/g, "\\-")}`,
        ),
      );
    }
  });

  // Spec/doc sync: changed requirements are mirrored in docs/specs.
  test("docs/specs/delegation-defaults.md mirrors changed requirements", () => {
    const doc = readFileSync(DOCS_SPEC_PATH, "utf8");
    expect(doc).toContain("rq-delDefaults09");
    expect(doc).toContain("Bounded Ready-Task Routing Metadata Projection");
    expect(doc).toContain(
      "Provider-hint delegation cues preserve matrix roster",
    );
    expect(doc).toContain("rq-delDefaults11");
    expect(doc).toContain("Diagnosis Routing Precedence");
    expect(doc).toContain("rq-delDefaults12");
    expect(doc).toContain("Bounded Empty-Worker Recovery");
  });

  // rq-delDefaults11: command asset lists diagnosis risk signals.
  test("apply command asset lists failing-test and behavioral-authority diagnosis as inline-required risk signals", () => {
    const apply = readCommandFile("apply");
    expect(apply).toBeDefined();
    expect(apply).toContain("failing-test diagnosis");
    expect(apply).toContain("behavioral-authority diagnosis");
    expect(apply).toMatch(/Risk signals:[\s\S]*inline_required/);
  });

  // rq-delDefaults12: spec names task.delegation_recovery as authority.
  test("bounded empty-worker recovery is represented in delegation-defaults spec", () => {
    const spec = loadSpec();
    const ac4 = spec.requirements?.find(
      (entry) => entry.id === "rq-delDefaults11",
    );
    const ac5 = spec.requirements?.find(
      (entry) => entry.id === "rq-delDefaults12",
    );
    expect(ac4, "rq-delDefaults11 must exist").toBeDefined();
    expect(ac5, "rq-delDefaults12 must exist").toBeDefined();

    const ac5Text = [
      ac5!.body ?? "",
      ...(ac5!.scenarios ?? []).flatMap((scenario) => scenario.then ?? []),
    ].join("\n");
    expect(ac5Text).toContain("task.delegation_recovery");
    expect(ac5Text).toContain("narrower_retry_count");
    expect(ac5Text).toContain("inline_diagnosis_evidence");
    expect(ac5Text).toContain("SEMANTIC");
    expect(ac5Text).toContain("error_recovery.attempts");
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

      // Check for explicit Task args and prose-level spawn/delegation instructions.
      const subagentAlternation = KNOWN_SPAWNABLE_SUBAGENTS.join("|");
      const hasExplicitSubagentSpawn = new RegExp(
        `(?:["']?subagent_type["']?\\s*:\\s*["'](?:${subagentAlternation})["']|\\b(?:may\\s+)?spawn\\s+\\x60?(?:${subagentAlternation})\\x60?|\\bdelegate\\s+to\\s+\\x60?(?:${subagentAlternation})\\x60?)`,
        "i",
      );
      const violatesInline = hasExplicitSubagentSpawn.test(content);

      expect(
        violatesInline,
        `Step ${row.step} is inline_required but command file contains explicit sub-agent spawn/delegation guidance`,
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

  // rq-delDefaults06: command-routed sub-agents must be present in matrix rows
  test("command files do not route to sub-agents outside each step's matrix row", () => {
    const delegableSteps = EXPECTED_MATRIX.filter(
      (row) => row.mode !== "inline_required",
    );

    for (const row of delegableSteps) {
      const content = readCommandFile(row.step);
      if (!content) continue;

      const routedAgents = extractExplicitCommandSubagentTargets(content);
      const extraAgents = routedAgents.filter(
        (agent) => !row.allowedAgents.includes(agent),
      );

      expect(
        extraAgents,
        `Step ${row.step} command routes to sub-agent(s) not declared in matrix allowed_subagents: ${extraAgents.join(", ")}`,
      ).toEqual([]);
    }
  });
});
