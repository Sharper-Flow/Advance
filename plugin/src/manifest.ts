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
}

// =============================================================================
// Manifest
// =============================================================================

export const COMMAND_MANIFEST: Record<string, CommandDef> = {
  // ---- Core Workflow ----
  "adv-status": {
    name: "adv-status",
    description: "Project overview with specs, changes, and recommendations",
    phase: "core",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal", "adv-apply", "adv-roadmap"],
  },
  "adv-proposal": {
    name: "adv-proposal",
    description: "Create new change proposal",
    phase: "core",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-clarify", "adv-research", "adv-prep"],
  },
  "adv-validate": {
    name: "adv-validate",
    description: "Validate change against specs (specs as laws)",
    phase: "core",
    requiresChangeId: true,
    prerequisites: ["adv-proposal"],
    successors: ["adv-archive"],
  },
  "adv-archive": {
    name: "adv-archive",
    description: "Archive completed change (applies deltas to specs)",
    phase: "core",
    requiresChangeId: true,
    prerequisites: ["adv-validate"],
    successors: [],
  },

  // ---- Pre-Implementation ----
  "adv-clarify": {
    name: "adv-clarify",
    description: "Socratic clarifying questions for ambiguous requirements",
    phase: "pre-implementation",
    requiresChangeId: false,
    prerequisites: ["adv-proposal"],
    successors: ["adv-research", "adv-prep"],
  },
  "adv-research": {
    name: "adv-research",
    description: "Validate architectural decisions via Context7 and web search",
    phase: "pre-implementation",
    gate: "research",
    requiresChangeId: true,
    prerequisites: ["adv-proposal"],
    successors: ["adv-prep"],
  },
  "adv-prep": {
    name: "adv-prep",
    description: "Gap analysis — add missing scenarios, tasks, dependencies",
    phase: "pre-implementation",
    gate: "prep",
    requiresChangeId: true,
    prerequisites: ["adv-research"],
    successors: ["adv-apply"],
  },

  // ---- Implementation ----
  "adv-apply": {
    name: "adv-apply",
    description:
      "Implement change with autonomous retry, TDD, and global final loop verification",
    phase: "implementation",
    gate: "implementation",
    requiresChangeId: true,
    prerequisites: ["adv-prep"],
    successors: ["adv-review", "adv-harden"],
  },
  "adv-task": {
    name: "adv-task",
    description:
      "Fast-track a pre-discussed change — synthesize chat contract, validate LBP, then autonomously research, prep, and implement",
    phase: "implementation",
    gate: "implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-review", "adv-harden"],
  },

  // ---- Post-Implementation ----
  "adv-review": {
    name: "adv-review",
    description: "Code review (correctness, security, architecture)",
    phase: "post-implementation",
    gate: "review",
    requiresChangeId: true,
    prerequisites: ["adv-apply"],
    successors: ["adv-harden"],
  },
  "adv-harden": {
    name: "adv-harden",
    description: "AI-slop detection, test coverage, doc hygiene, cleanup",
    phase: "post-implementation",
    gate: "harden",
    requiresChangeId: true,
    prerequisites: ["adv-review"],
    successors: ["adv-validate", "adv-archive"],
  },
  "adv-audit": {
    name: "adv-audit",
    description: "Spec/implementation drift detection",
    phase: "post-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal"],
  },
  "adv-slop-scan": {
    name: "adv-slop-scan",
    description: "Scan for AI-generated code quality issues (slop)",
    phase: "post-implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-harden"],
  },

  // ---- Advanced ----
  "adv-refactor": {
    name: "adv-refactor",
    description: "Refresh stale proposals with current codebase state",
    phase: "advanced",
    requiresChangeId: true,
    prerequisites: ["adv-proposal"],
    successors: ["adv-prep"],
  },
  "adv-coordinate": {
    name: "adv-coordinate",
    description: "Multi-change conflict detection and resolution",
    phase: "advanced",
    requiresChangeId: false,
    prerequisites: [],
    successors: [],
  },

  // ---- Utility ----
  "adv-roadmap": {
    name: "adv-roadmap",
    description: "Progress dashboard across all active changes",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-status"],
  },
  "adv-brainstorm": {
    name: "adv-brainstorm",
    description: "Generate ideas and explore solution space",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal", "adv-clarify"],
  },
  "adv-improve": {
    name: "adv-improve",
    description: "Suggest improvements to existing specs or implementation",
    phase: "utility",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal"],
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
