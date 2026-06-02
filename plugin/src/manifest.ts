/**
 * ADV Command Manifest
 *
 * Type-safe workflow manifest defining all ADV commands with their
 * phase, gate affinity, prerequisites, and successors.
 *
 * Used by command tooling for command metadata and workflow sequencing.
 * TypeScript constant — compile-time checked, zero parse overhead.
 */

import type { GateId } from "./types";

// =============================================================================
// Types
// =============================================================================

export type Phase =
  | "core"
  | "pre-implementation"
  | "implementation"
  | "post-implementation"
  | "advanced"
  | "utility";

/** Defines what a command is allowed to create, read, modify, and which gate it owns. */
export interface CommandScope {
  /** ADV artifacts this command creates (e.g., 'change', 'tasks') */
  creates: string[];
  /** ADV artifacts this command reads */
  reads: string[];
  /** ADV artifacts this command modifies */
  modifies: string[];
  /** Gate(s) this command is authorized to complete */
  gates: GateId[];
}

export interface CommandDef {
  /** Command name (without /) */
  name: string;
  /** Short description */
  description: string;
  /** Workflow phase */
  phase: Phase;
  /** Which gate this command affects (if any) */
  gate?: GateId;
  /** Whether the command requires a change ID argument */
  requiresChangeId: boolean;
  /** Commands that should be completed before this one */
  prerequisites: string[];
  /** Commands to recommend after this one completes */
  successors: string[];
  /** Boundary scope: what this command creates, reads, modifies, and which gates it owns */
  scope?: CommandScope;
  /**
   * HITL phase goal — canonical description of this command's objective (workflow commands only).
   * Agents should self-check: "Am I still working toward this phase's goal?"
   */
  phaseGoal?: string;
  /**
   * Hint for $ARGUMENTS parsing — describes expected arguments.
   * Required when requiresChangeId is true.
   */
  args_hint?: string;
}

// =============================================================================
// Manifest
// =============================================================================

export const COMMAND_MANIFEST: Record<string, CommandDef> = {
  // ---- Core Workflow ----
  "adv-status": {
    name: "adv-status",
    description: "Show fast ADV status table",
    phase: "core",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal", "adv-apply", "adv-roadmap"],
  },
  "adv-roadmap": {
    name: "adv-roadmap",
    description: "Show prioritized backlog with active-change cross-reference",
    phase: "core",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal", "adv-triage"],
    scope: {
      creates: [],
      reads: ["roadmap-snapshot", "github-project", "changes"],
      modifies: [],
      gates: [],
    },
    args_hint:
      "[--live] [--top N] [--kind bug|feature|all] [--priority c|h|m|l]",
  },
  "adv-proposal": {
    name: "adv-proposal",
    description:
      "Extract problem statement, success criteria, and constraints without creating tasks",
    phase: "core",
    gate: "proposal",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-clarify", "adv-research"],
    scope: {
      creates: ["change", "proposal"],
      reads: ["specs"],
      modifies: [],
      gates: ["proposal"],
    },
    phaseGoal:
      "Clarify the problem, user needs, and acceptance criteria scope. Establish what and why \u2014 no how.",
  },
  "adv-validate": {
    name: "adv-validate",
    description:
      "Validate change compliance against specs; block archive on failure",
    phase: "core",
    requiresChangeId: true,
    prerequisites: ["adv-proposal"],
    successors: ["adv-archive"],
    args_hint: "<change-id> [--strict]",
  },
  "adv-archive": {
    name: "adv-archive",
    description: "Archive completed change: apply spec deltas and finalize git",
    phase: "core",
    gate: "release",
    requiresChangeId: true,
    prerequisites: ["adv-harden"],
    successors: [],
    scope: {
      creates: ["archive"],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["specs"],
      gates: ["release"],
    },
    phaseGoal:
      "Promote the change from contract to law: apply spec deltas, capture wisdom, clean up.",
    args_hint: "<change-id>",
  },

  // ---- Pre-Implementation (Ideation + Discovery + Design + Planning) ----
  "adv-idea": {
    name: "adv-idea",
    description: "Explore rough ideas before drafting a proposal",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal"],
    scope: {
      creates: [],
      reads: ["specs", "codebase"],
      modifies: [],
      gates: [],
    },
  },
  "adv-problem": {
    name: "adv-problem",
    description: "Triage issues before fixing or drafting a proposal",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal"],
    scope: {
      creates: [],
      reads: ["specs", "codebase"],
      modifies: [],
      gates: [],
    },
  },
  "adv-clarify": {
    name: "adv-clarify",
    description: "Ask clarifying questions to resolve ambiguous requirements",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: ["adv-proposal"],
    successors: ["adv-research", "adv-discover"],
  },
  "adv-research": {
    name: "adv-research",
    description:
      "Produce a defined, fully-researched proposed plan ready for user approval",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: ["adv-proposal"],
    successors: ["adv-discover", "adv-prep"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["proposal"],
      gates: [],
    },
    phaseGoal:
      "Produce a defined, fully-researched proposed plan ready for user approval. Validate the how.",
  },
  "adv-discover": {
    name: "adv-discover",
    description:
      "Gather context, analyze current state, identify objectives, and obtain user agreement",
    phase: "pre-implementation",
    gate: "discovery",
    requiresChangeId: true,
    prerequisites: ["adv-proposal"],
    successors: ["adv-design"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["proposal"],
      gates: ["discovery"],
    },
    phaseGoal:
      "Gather current-state evidence, resolve agreement, and capture objectives and acceptance criteria before design.",
    args_hint: "<change-id>",
  },
  "adv-design": {
    name: "adv-design",
    description:
      "Validate architecture decisions, produce implementation strategy, and present design for user review",
    phase: "pre-implementation",
    gate: "design",
    requiresChangeId: true,
    prerequisites: ["adv-discover"],
    successors: ["adv-prep"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["proposal"],
      gates: ["design"],
    },
    phaseGoal:
      "Convert the approved agreement into a validated implementation strategy ready for planning.",
    args_hint: "<change-id>",
  },
  "adv-prep": {
    name: "adv-prep",
    description:
      "Analyze gaps and synthesize tasks from validated research findings",
    phase: "pre-implementation",
    gate: "planning",
    requiresChangeId: true,
    prerequisites: ["adv-design"],
    successors: ["adv-apply"],
    scope: {
      creates: ["tasks"],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["tasks", "proposal"],
      gates: ["planning"],
    },
    phaseGoal:
      "Complete the flight-check: every gap closed, every dependency mapped, every task ready \u2014 ready for autonomous implementation.",
    args_hint: "<change-id>",
  },
  "adv-reflect": {
    name: "adv-reflect",
    description:
      "Produce a structured two-plane reflection report for an archived change",
    phase: "post-implementation",
    requiresChangeId: true,
    prerequisites: ["adv-archive"],
    successors: [],
    scope: {
      reads: ["specs", "proposal", "tasks"],
      creates: ["reflection"],
      modifies: [],
      gates: [],
    },
    phaseGoal:
      "Synthesize post-completion learnings into a durable reflection artifact for process improvement.",
    args_hint: "<change-id>",
  },

  // ---- Implementation ----
  "adv-apply": {
    name: "adv-apply",
    description:
      "Implement change with TDD, retry on failure, and final verification",
    phase: "implementation",
    gate: "execution",
    requiresChangeId: true,
    prerequisites: ["adv-prep"],
    successors: ["adv-apply"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["tasks", "codebase"],
      gates: ["execution"],
    },
    phaseGoal:
      "Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure.",
    args_hint: "<change-id>",
  },
  "adv-task": {
    name: "adv-task",
    description:
      "Fast-track small changes: assess spec-law impact, prep, and hand off",
    phase: "implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-apply"],
    scope: {
      creates: ["change", "proposal", "tasks"],
      reads: ["specs", "codebase"],
      modifies: ["proposal", "design"],
      gates: ["proposal", "discovery", "design", "planning"],
    },
  },
  "adv-atc": {
    name: "adv-atc",
    description:
      "Execute autonomous ROADMAP pipeline, deferring HITL to GitHub issues, stop only on safety boundaries",
    phase: "advanced",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-archive"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "roadmap", "codebase"],
      modifies: ["proposal"],
      gates: [
        "proposal",
        "discovery",
        "design",
        "planning",
        "execution",
        "acceptance",
      ],
    },
    phaseGoal:
      "Execute a full change pipeline autonomously, deferring HITL moments to GitHub issues while preserving all safety boundaries.",
  },

  // ---- Post-Implementation ----
  "adv-review": {
    name: "adv-review",
    description:
      "Review code for correctness, security, and architecture; emit REVIEW_FINDINGS",
    phase: "post-implementation",
    gate: "acceptance",
    requiresChangeId: true,
    prerequisites: ["adv-apply"],
    successors: ["adv-harden"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["proposal"],
      gates: ["acceptance"],
    },
    phaseGoal:
      "Verify implementation matches the approved plan. Auto-fix within scope. Stop on drift.",
    args_hint: "<change-id>",
  },
  "adv-harden": {
    name: "adv-harden",
    description:
      "Detect low-quality code, verify test coverage, clean up; block archive on open findings",
    phase: "post-implementation",
    requiresChangeId: true,
    prerequisites: ["adv-review"],
    successors: ["adv-validate", "adv-archive"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["codebase"],
      gates: [],
    },
    phaseGoal:
      "Verify production-readiness. Auto-fix scoped issues. Stop on drift.",
    args_hint: "<change-id>",
  },
  "adv-audit": {
    name: "adv-audit",
    description: "Detect drift between specs and current implementation",
    phase: "post-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal"],
  },
  "adv-slop-scan": {
    name: "adv-slop-scan",
    description: "Scan slop, deletion safety, and detector coverage",
    phase: "post-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-harden"],
  },

  // ---- Advanced ----
  "adv-refactor": {
    name: "adv-refactor",
    description:
      "Refresh a stale proposal or batch-refresh the oldest 30% of active changes",
    phase: "advanced",
    requiresChangeId: false,
    prerequisites: ["adv-proposal"],
    successors: ["adv-prep"],
    args_hint: "[change-id]",
  },
  "adv-cleanup": {
    name: "adv-cleanup",
    description:
      "Triage stale, abandoned, duplicate, and ready-to-archive active changes",
    phase: "advanced",
    requiresChangeId: false,
    prerequisites: [],
    successors: [],
    args_hint: "[--execute] [--bucket <name>] [--age-threshold <duration>]",
  },

  // ---- Utility ----
  "adv-improve": {
    name: "adv-improve",
    description:
      "Suggest targeted improvements to existing specs or implementation",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal", "adv-task", "adv-audit"],
  },
  "adv-arch-scan": {
    name: "adv-arch-scan",
    description:
      "Scan architecture stack packs, coverage, and heuristic fallbacks",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal"],
  },
  "adv-comp-scan": {
    name: "adv-comp-scan",
    description:
      "Scan competitor capabilities against this project for competitive intelligence",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal"],
  },
  "adv-tron": {
    name: "adv-tron",
    description:
      "Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal", "adv-task"],
  },
  "adv-triage": {
    name: "adv-triage",
    description:
      "Triage all backlog sources, score features with WSJF, regenerate ROADMAP.md",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal", "adv-task"],
    args_hint: "[--execute] [--no-commit] [--source <name>] [--rescore]",
  },
} as const satisfies Record<string, CommandDef>;

// =============================================================================
// Lookup Helpers
// =============================================================================

/**
 * Get command definition by name.
 */
export function getCommandDef(name: string): CommandDef | undefined {
  return COMMAND_MANIFEST[name];
}

/**
 * Get all commands that affect a specific gate.
 */
export function getCommandsByGate(gate: GateId): CommandDef[] {
  return Object.values(COMMAND_MANIFEST).filter((cmd) => cmd.gate === gate);
}

/**
 * Get successor command definitions for a given command.
 */
export function getSuccessors(name: string): CommandDef[] {
  const def = COMMAND_MANIFEST[name];
  if (!def) return [];
  return def.successors
    .map((s) => COMMAND_MANIFEST[s])
    .filter((d): d is CommandDef => d !== undefined);
}
