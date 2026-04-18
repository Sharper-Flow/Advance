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

type Phase =
  | "core"
  | "pre-implementation"
  | "implementation"
  | "post-implementation"
  | "advanced"
  | "utility";

/** Defines what a command is allowed to create, read, modify, and which gate it owns. */
interface CommandScope {
  /** ADV artifacts this command creates (e.g., 'change', 'tasks') */
  creates: string[];
  /** ADV artifacts this command reads */
  reads: string[];
  /** ADV artifacts this command modifies */
  modifies: string[];
  /** Gate(s) this command is authorized to complete */
  gates: GateId[];
}

interface CommandDef {
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
      "Extract problem statement and confirm with user before proceeding",
    phase: "core",
    gate: "proposal",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-clarify", "adv-discover"],
    scope: {
      creates: ["change", "proposal", "problem-statement"],
      reads: ["specs"],
      modifies: [],
      gates: ["proposal"],
    },
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
  },

  // ---- Pre-Implementation (Discovery + Design) ----
  "adv-clarify": {
    name: "adv-clarify",
    description: "Ask clarifying questions to resolve ambiguous requirements",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: ["adv-proposal"],
    successors: ["adv-discover", "adv-design"],
  },
  "adv-discover": {
    name: "adv-discover",
    description:
      "Gather context, analyze current state, and identify objectives",
    phase: "pre-implementation",
    gate: "discovery",
    requiresChangeId: true,
    prerequisites: ["adv-proposal"],
    successors: ["adv-agree"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["proposal"],
      gates: ["discovery"],
    },
  },
  "adv-agree": {
    name: "adv-agree",
    description: "Present objectives and constraints for user acceptance",
    phase: "pre-implementation",
    requiresChangeId: true,
    prerequisites: ["adv-discover"],
    successors: ["adv-design"],
    scope: {
      creates: ["agreement"],
      reads: ["proposal"],
      modifies: [],
      gates: [],
    },
  },
  "adv-design": {
    name: "adv-design",
    description:
      "Validate architecture decisions and produce implementation strategy",
    phase: "pre-implementation",
    gate: "design",
    requiresChangeId: true,
    prerequisites: ["adv-agree"],
    successors: ["adv-present"],
    scope: {
      creates: ["design"],
      reads: ["specs", "proposal", "agreement", "codebase"],
      modifies: ["proposal"],
      gates: ["design"],
    },
  },
  "adv-present": {
    name: "adv-present",
    description:
      "Present concise design overview for user review before planning",
    phase: "pre-implementation",
    requiresChangeId: true,
    prerequisites: ["adv-design"],
    successors: ["adv-prep"],
    scope: {
      creates: [],
      reads: ["design", "proposal"],
      modifies: [],
      gates: [],
    },
  },
  "adv-prep": {
    name: "adv-prep",
    description:
      "Analyze gaps and synthesize tasks from validated design decisions",
    phase: "pre-implementation",
    gate: "planning",
    requiresChangeId: true,
    prerequisites: ["adv-present"],
    successors: ["adv-apply"],
    scope: {
      creates: ["tasks"],
      reads: ["specs", "proposal", "agreement", "design", "codebase"],
      modifies: ["tasks", "proposal"],
      gates: ["planning"],
    },
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
    successors: ["adv-review"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["tasks", "codebase"],
      gates: ["execution"],
    },
  },
  "adv-task": {
    name: "adv-task",
    description:
      "Fast-track a discussed change: synthesize contract, validate, prep, and hand off",
    phase: "implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-apply"],
    scope: {
      creates: ["change", "proposal", "agreement", "design", "tasks"],
      reads: ["specs", "codebase"],
      modifies: [],
      gates: ["proposal", "discovery", "design", "planning"],
    },
  },

  // ---- Post-Implementation (Acceptance + Release) ----
  "adv-review": {
    name: "adv-review",
    description:
      "Review deliverables for correctness, security, and architecture quality",
    phase: "post-implementation",
    requiresChangeId: true,
    prerequisites: ["adv-apply"],
    successors: ["adv-accept"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["proposal"],
      gates: [],
    },
  },
  "adv-accept": {
    name: "adv-accept",
    description:
      "Present deliverable summary and acceptance criteria checklist to user",
    phase: "post-implementation",
    gate: "acceptance",
    requiresChangeId: true,
    prerequisites: ["adv-review"],
    successors: ["adv-harden"],
    scope: {
      creates: [],
      reads: ["agreement", "proposal", "tasks"],
      modifies: [],
      gates: ["acceptance"],
    },
  },
  "adv-harden": {
    name: "adv-harden",
    description:
      "Detect low-quality code, verify test coverage, clean up before release",
    phase: "post-implementation",
    requiresChangeId: true,
    prerequisites: ["adv-accept"],
    successors: ["adv-validate", "adv-archive"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["codebase"],
      gates: [],
    },
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
      "Suggest improvements and persist a competitor research pack for /adv-discover reuse",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-discover", "adv-proposal"],
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
