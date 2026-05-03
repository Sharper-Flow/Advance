/**
 * Anti-recursion and parallelism guard for the built-in Task tool.
 *
 * Enforces two constraints:
 * 1. Nesting: sub-agents may NOT spawn further sub-agents (depth ≤ 1).
 * 2. Parallelism: top-level agents may spawn up to MAX_PARALLEL_SUBAGENTS
 *    concurrently, then must wait for completions before spawning more.
 *
 * The guard distinguishes top-level from sub-agent callers via session ID.
 * The orchestrator's main session ID is captured at plugin startup from
 * `experimental.chat.system.transform`. A spawn whose caller session matches
 * the main session is the orchestrator (primary). Any other session ID
 * originates from a sub-agent session and is blocked from nesting.
 *
 * Fail-open policy: when `mainSessionId` is null (race window before the
 * first `system.transform` hook fires on a fresh session), the spawn is
 * allowed. The window is negligible in practice and fail-closed would
 * silently break sub-agent spawning on every session start.
 *
 * The OpenCode plugin SDK does not provide `input.agent` on the
 * `tool.execute.before` hook (input shape: `{tool, sessionID, callID}`),
 * which is why session-based discrimination is used instead of agent-name
 * matching.
 */

/** Maximum nesting depth — sub-agents cannot spawn sub-agents. */
export const MAX_SUBAGENT_NESTING_DEPTH = 1;

/** Maximum concurrent sub-agents a top-level agent may spawn. */
export const MAX_PARALLEL_SUBAGENTS = 3;

/**
 * Enforces nesting and parallelism policies for the Task tool.
 *
 * @param activeSubAgents Current count of active sub-agents
 * @param callerSessionId The `sessionID` from the `tool.execute.before` hook input
 * @param mainSessionId The orchestrator's main session ID, captured from
 *   `experimental.chat.system.transform`. May be `null` during the first-turn
 *   race window before the transform hook fires (fail-open).
 * @throws Error if nesting or parallelism limits are exceeded
 */
export function enforceTaskPolicy(
  activeSubAgents: number,
  callerSessionId?: string,
  mainSessionId?: string | null,
): void {
  // Determine if the caller is the top-level (primary) orchestrator.
  //
  // - mainSessionId == null: fail-open. We have no way to distinguish
  //   primary from sub-agent yet; allow the spawn. This window only
  //   exists during the orchestrator's first turn before the
  //   system.transform hook fires.
  // - callerSessionId === mainSessionId: the call originates from the
  //   orchestrator's session.
  // - Otherwise (callerSessionId !== mainSessionId, or callerSessionId
  //   undefined while mainSessionId is set): treat as sub-agent and
  //   block nesting.
  const isPrimary =
    mainSessionId == null ||
    (callerSessionId != null && callerSessionId === mainSessionId);

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
        `Caller session "${callerSessionId ?? "unknown"}" does not match the orchestrator's main session "${mainSessionId}".\n` +
        `This indicates a sub-agent is attempting to spawn another sub-agent.\n\n` +
        `Spawning a Task tool call from within a sub-agent causes recursive context\n` +
        `that leads to empty results or interrupted responses.\n\n` +
        `To fix: complete the current sub-agent work before spawning new sub-agents,\n` +
        `or perform the analysis inline instead of delegating to a sub-agent.`,
    );
  }
}
