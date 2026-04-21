/**
 * ADV Command Manifest
 *
 * Type-safe workflow manifest defining all ADV commands with their
 * phase, gate affinity, prerequisites, and successors.
 *
 * Used by adv-status for context-aware next-step recommendations.
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
}

// =============================================================================
// Manifest
// =============================================================================

export const COMMAND_MANIFEST: Record<string, CommandDef> = {
  // ---- Core Workflow ----
  "adv-status": {
    name: "adv-status",
    description:
      "Show project overview: specs, active changes, and next-step recommendations",
    phase: "core",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal", "adv-apply"],
  },
  "adv-proposal": {
    name: "adv-proposal",
    description:
      "Extract problem statement, success criteria, and constraints without creating tasks",
    phase: "core",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-clarify", "adv-research"],
    scope: {
      creates: ["change", "proposal"],
      reads: ["specs"],
      modifies: [],
      gates: [],
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
  },

  // ---- Pre-Implementation (Discovery + Design + Planning) ----
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
    successors: ["adv-review", "adv-harden"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["tasks", "codebase"],
      gates: ["execution"],
    },
    phaseGoal:
      "Execute the approved plan autonomously. Add discovered tasks within scope. Escalate only on failure.",
  },
  "adv-task": {
    name: "adv-task",
    description:
      "Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off",
    phase: "implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-review", "adv-harden"],
    scope: {
      creates: ["change", "proposal", "tasks"],
      reads: ["specs", "codebase"],
      modifies: [],
      gates: ["discovery", "planning"],
    },
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
    description:
      "Scan for AI slop patterns including defensive and nested code",
    phase: "post-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-harden"],
  },

  // ---- Advanced ----
  "adv-refactor": {
    name: "adv-refactor",
    description: "Refresh a stale proposal to reflect current codebase state",
    phase: "advanced",
    requiresChangeId: true,
    prerequisites: ["adv-proposal"],
    successors: ["adv-prep"],
  },
  "adv-coordinate": {
    name: "adv-coordinate",
    description: "Detect and resolve conflicts across multiple active changes",
    phase: "advanced",
    requiresChangeId: false,
    prerequisites: [],
    successors: [],
  },

  // ---- Utility ----
  "adv-improve": {
    name: "adv-improve",
    description:
      "Suggest targeted improvements to existing specs or implementation",
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
