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
      "Propose a new change with intent, scope, and success criteria",
    phase: "core",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-clarify", "adv-research", "adv-prep"],
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
      "Validate architectural decisions via docs and web search; complete research gate",
    phase: "pre-implementation",
    gate: "research",
    requiresChangeId: true,
    prerequisites: ["adv-proposal"],
    successors: ["adv-prep"],
  },
  "adv-prep": {
    name: "adv-prep",
    description:
      "Analyze gaps and add missing scenarios, tasks, and dependencies",
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
      "Implement change with TDD, retry on failure, and final verification",
    phase: "implementation",
    gate: "implementation",
    requiresChangeId: true,
    prerequisites: ["adv-prep"],
    successors: ["adv-review", "adv-harden"],
  },
  "adv-task": {
    name: "adv-task",
    description:
      "Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off",
    phase: "implementation",
    gate: "implementation",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-review", "adv-harden"],
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
