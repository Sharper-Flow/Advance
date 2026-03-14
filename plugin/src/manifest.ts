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
    successors: ["adv-clarify", "adv-research", "adv-prep"],
    scope: {
      creates: ["change", "proposal"],
      reads: ["specs"],
      modifies: [],
      gates: [],
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
    requiresChangeId: true,
    prerequisites: ["adv-validate"],
    successors: [],
  },

  // ---- Pre-Implementation ----
  "adv-clarify": {
    name: "adv-clarify",
    description: "Ask clarifying questions to resolve ambiguous requirements",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: ["adv-proposal"],
    successors: ["adv-research", "adv-prep"],
  },
  "adv-research": {
    name: "adv-research",
    description:
      "Validate architectural decisions and best practices without creating tasks",
    phase: "pre-implementation",
    gate: "research",
    requiresChangeId: true,
    prerequisites: ["adv-proposal"],
    successors: ["adv-prep"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["proposal"],
      gates: ["research"],
    },
  },
  "adv-prep": {
    name: "adv-prep",
    description:
      "Analyze gaps and synthesize tasks from validated research findings",
    phase: "pre-implementation",
    gate: "prep",
    requiresChangeId: true,
    prerequisites: ["adv-research"],
    successors: ["adv-apply"],
    scope: {
      creates: ["tasks"],
      reads: ["specs", "proposal", "codebase"],
      modifies: ["tasks", "proposal"],
      gates: ["prep"],
    },
  },

  // ---- Implementation ----
  "adv-apply": {
    name: "adv-apply",
    description:
      "Implement change with TDD, retry on failure, and final verification",
    phase: "implementation",
    gate: "implementation",
    requiresChangeId: true,
    prerequisites: ["adv-prep"],
    successors: ["adv-review", "adv-harden"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["tasks", "codebase"],
      gates: ["implementation"],
    },
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
      gates: ["research", "prep"],
    },
  },

  // ---- Post-Implementation ----
  "adv-review": {
    name: "adv-review",
    description:
      "Review code for correctness, security, and architecture; emit REVIEW_FINDINGS",
    phase: "post-implementation",
    gate: "review",
    requiresChangeId: true,
    prerequisites: ["adv-apply"],
    successors: ["adv-harden"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["proposal"],
      gates: ["review"],
    },
  },
  "adv-harden": {
    name: "adv-harden",
    description:
      "Detect low-quality code, verify test coverage, clean up; block archive on open findings",
    phase: "post-implementation",
    gate: "harden",
    requiresChangeId: true,
    prerequisites: ["adv-review"],
    successors: ["adv-validate", "adv-archive"],
    scope: {
      creates: [],
      reads: ["specs", "proposal", "tasks", "codebase"],
      modifies: ["codebase"],
      gates: ["harden"],
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
