/**
 * Shared OpenCode session principal resolver.
 *
 * Derives root/descendant identity from the SDK's immutable parentID ancestry.
 * Used by the role firewall, worktree forking, and any other caller that needs
 * to know whether a session is the orchestrator root or a descendant.
 *
 * Rules:
 *   - Maximum ancestry depth is bounded.
 *   - Missing records, malformed parents, id mismatches, cycles, depth
 *     exhaustion, and SDK failures all resolve to null (fail-closed).
 *   - An optional in-memory cache may be supplied, but correctness never
 *     depends on it.
 * rq-sessionPrincipal01: structural ancestry is the session authority boundary.
 */

export interface SessionAncestryClient {
  session: {
    get(input: { path: { id: string } }): Promise<{
      data?: { id?: string; parentID?: string | null };
    }>;
  };
}

export const MAX_SESSION_ANCESTRY_DEPTH = 10;

/**
 * Resolve a caller's root OpenCode session through the typed SDK. Missing
 * records, cycles, malformed parents, lookup failures, and over-deep ancestry
 * all resolve to null so the firewall remains fail-closed.
 */
export async function resolveRootSessionId(input: {
  callerSessionID?: string;
  client?: SessionAncestryClient;
  cache?: Map<string, string>;
}): Promise<string | null> {
  const caller = input.callerSessionID?.trim();
  if (!caller || !input.client) return null;

  const cached = input.cache?.get(caller);
  if (cached) return cached;

  const visited: string[] = [];
  const seen = new Set<string>();
  let current = caller;

  try {
    for (let depth = 0; depth < MAX_SESSION_ANCESTRY_DEPTH; depth += 1) {
      if (seen.has(current)) return null;
      seen.add(current);
      visited.push(current);

      const response = await input.client.session.get({
        path: { id: current },
      });
      const session = response.data;
      if (!session || (session.id !== undefined && session.id !== current)) {
        return null;
      }

      const parent = session.parentID;
      if (parent === null || parent === undefined || parent === "") {
        for (const sessionId of visited) input.cache?.set(sessionId, current);
        return current;
      }
      if (typeof parent !== "string" || parent.trim().length === 0) return null;
      current = parent;
    }
  } catch {
    return null;
  }

  return null;
}
