/**
 * Anti-recursion guard for the built-in Task tool.
 *
 * Prevents nested sub-agent spawning. ADV allows exactly one worker layer:
 * the orchestrating agent may spawn first-level sub-agents, but those
 * sub-agents may not spawn additional sub-agents.
 */

export const MAX_SUBAGENT_NESTING_DEPTH = 1;

/**
 * Enforces the anti-recursion policy for the Task tool.
 * @param activeSubAgents Current count of active sub-agents
 * @throws Error if a nested task call is attempted
 */
export function enforceTaskPolicy(activeSubAgents: number): void {
  if (activeSubAgents >= MAX_SUBAGENT_NESTING_DEPTH) {
    throw new Error(
      `Error: Nested task call blocked.\n` +
        `Maximum sub-agent nesting depth is ${MAX_SUBAGENT_NESTING_DEPTH} (top-level orchestrator only).\n` +
        `A sub-agent is already running (${activeSubAgents} active sub-agent(s)).\n\n` +
        `Spawning a Task tool call from within a sub-agent causes recursive context\n` +
        `that leads to empty results or interrupted responses.\n\n` +
        `To fix: complete the current sub-agent work before spawning new sub-agents,\n` +
        `or perform the analysis inline instead of delegating to a sub-agent.`,
    );
  }
}
