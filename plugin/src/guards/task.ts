/**
 * Anti-recursion guard for the built-in Task tool.
 *
 * Prevents nested sub-agent spawning: if a sub-agent is already running
 * (activeSubAgents > 0), spawning another via the Task tool creates
 * recursive context that causes empty results or interruptions.
 */

/**
 * Enforces the anti-recursion policy for the Task tool.
 * @param activeSubAgents Current count of active sub-agents
 * @throws Error if a nested task call is attempted
 */
export function enforceTaskPolicy(activeSubAgents: number): void {
  if (activeSubAgents > 0) {
    throw new Error(
      `Error: Nested task call blocked.\n` +
        `A sub-agent is already running (${activeSubAgents} active sub-agent(s)).\n\n` +
        `Spawning a Task tool call from within a sub-agent causes recursive context\n` +
        `that leads to empty results or interrupted responses.\n\n` +
        `To fix: complete the current sub-agent work before spawning new sub-agents,\n` +
        `or perform the analysis inline instead of delegating to a sub-agent.`,
    );
  }
}
