/**
 * Anti-recursion and parallelism guard for the built-in Task tool.
 *
 * Enforces two constraints:
 * 1. Nesting: sub-agents may NOT spawn further sub-agents (depth ≤ 1).
 * 2. Parallelism: top-level agents may spawn up to MAX_PARALLEL_SUBAGENTS
 *    concurrently, then must wait for completions before spawning more.
 *
 * The guard distinguishes top-level from sub-agent callers via the agent name.
 * Primary agents (adv, build, plan, plus provider variants adv-claude/gpt/glm/kimi)
 * are allowed to spawn. All other agent names are treated as sub-agents and blocked.
 * When callerAgent is unavailable, falls back to activeSubAgents count: 0 = top-level.
 */

/** Maximum nesting depth — sub-agents cannot spawn sub-agents. */
export const MAX_SUBAGENT_NESTING_DEPTH = 1;

/** Maximum concurrent sub-agents a top-level agent may spawn. */
export const MAX_PARALLEL_SUBAGENTS = 3;

/**
 * Primary (top-level) agents allowed to spawn sub-agents.
 * Includes provider-specific ADV variants (adv-claude, adv-gpt, adv-glm, adv-kimi).
 */
const PRIMARY_AGENTS = new Set([
  "adv",
  "adv-claude",
  "adv-gpt",
  "adv-glm",
  "adv-kimi",
  "build",
  "plan",
]);

/**
 * Enforces nesting and parallelism policies for the Task tool.
 *
 * @param activeSubAgents Current count of active sub-agents
 * @param callerAgent Name of the agent attempting the task call (from OpenCode tool.execute.before input.agent)
 * @throws Error if nesting or parallelism limits are exceeded
 */
export function enforceTaskPolicy(
  activeSubAgents: number,
  callerAgent?: string,
): void {
  // Determine if the caller is a top-level (primary) agent.
  // If agent name is available, check against the primary set.
  // If unavailable, infer from active count: 0 active means no sub-agents
  // are running, so the caller must be top-level.
  const isPrimary = callerAgent
    ? PRIMARY_AGENTS.has(callerAgent)
    : activeSubAgents === 0;

  if (isPrimary) {
    // Top-level agent: enforce parallel cap
    if (activeSubAgents >= MAX_PARALLEL_SUBAGENTS) {
      throw new Error(
        `Error: Parallel sub-agent cap reached.\n` +
          `Maximum concurrent sub-agents is ${MAX_PARALLEL_SUBAGENTS} (${activeSubAgents} currently active).\n\n` +
          `To fix: wait for a sub-agent to complete before spawning new ones.\n` +
          `Batch pattern: spawn up to ${MAX_PARALLEL_SUBAGENTS}, wait for completions, then spawn the next batch.`,
      );
    }
  } else {
    // Sub-agent: block nesting entirely
    throw new Error(
      `Error: Nested task call blocked.\n` +
        `Maximum sub-agent nesting depth is ${MAX_SUBAGENT_NESTING_DEPTH} (top-level orchestrator only).\n` +
        `Agent "${callerAgent ?? "unknown"}" is a sub-agent and may not spawn further sub-agents.\n\n` +
        `Spawning a Task tool call from within a sub-agent causes recursive context\n` +
        `that leads to empty results or interrupted responses.\n\n` +
        `To fix: complete the current sub-agent work before spawning new sub-agents,\n` +
        `or perform the analysis inline instead of delegating to a sub-agent.`,
    );
  }
}
