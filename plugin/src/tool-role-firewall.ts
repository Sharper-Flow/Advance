/**
 * Runtime role firewall for ADV tools.
 *
 * Enforces the fail-closed, session-derived rule from Decision 3: a tool in
 * the blockable set (complement of the sub-agent union allowlist) is allowed
 * only from the root orchestrator session. Sub-agent sessions and
 * role-unresolved sessions are blocked with a typed, stable error.
 *
 * Role is derived ONLY from SDK session ancestry. A root session has no
 * parentID and is the orchestrator; descendants are sub-agent sessions. No
 * caller-supplied argument can elevate a sub-agent session (AC7).
 */

import { ADV_TOOL_NAMES } from "./tool-registry";
import {
  blockableFromSubAgentSession,
  subAgentUnionAllowlist,
} from "./tool-role-policy";
import { resolveRootSessionId } from "./utils/session-principal";
export { resolveRootSessionId } from "./utils/session-principal";

export const ROLE_FIREWALL_BLOCK_CODE = "ROLE_FIREWALL_BLOCK" as const;

export class RoleFirewallError extends Error {
  readonly code = ROLE_FIREWALL_BLOCK_CODE;
  readonly tool: string;
  readonly reason: string;
  readonly resolution: "sub_agent" | "unresolved_role";

  constructor(
    tool: string,
    reason: string,
    resolution: "sub_agent" | "unresolved_role",
  ) {
    super(`Role firewall: ${reason}`);
    this.name = "RoleFirewallError";
    this.tool = tool;
    this.reason = reason;
    this.resolution = resolution;
  }
}

function isValidToolNameArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    new Set(value).size === value.length &&
    value.every(
      (tool) => typeof tool === "string" && ADV_TOOL_NAMES.includes(tool),
    )
  );
}

function matchesPolicyBlockableSet(blockable: readonly string[]): boolean {
  const union = subAgentUnionAllowlist();
  if (!isValidToolNameArray(union)) return false;

  const allowed = new Set(union);
  const expected = new Set(ADV_TOOL_NAMES.filter((tool) => !allowed.has(tool)));
  return (
    expected.size === blockable.length &&
    blockable.every((tool) => expected.has(tool))
  );
}

/**
 * Resolve the runtime blockable set.
 *
 * Decision 5 / Option A: runtime derivation failure fails closed. If the
 * blockable set cannot be computed from AGENT_TOOL_POLICY, fall back to
 * treating the union floor as the only sub-agent-allowed set and blocking
 * every other ADV tool from non-main sessions. If even the union floor cannot
 * be derived, block every ADV tool.
 */
export function resolveBlockableSet(): {
  blockable: Set<string>;
  usedFallback: boolean;
} {
  try {
    const blockable = blockableFromSubAgentSession();
    if (
      isValidToolNameArray(blockable) &&
      matchesPolicyBlockableSet(blockable)
    ) {
      return { blockable: new Set(blockable), usedFallback: false };
    }
  } catch {
    // fall through to fallback
  }

  try {
    const union = subAgentUnionAllowlist();
    if (isValidToolNameArray(union)) {
      const allowed = new Set(union);
      return {
        blockable: new Set(ADV_TOOL_NAMES.filter((tool) => !allowed.has(tool))),
        usedFallback: true,
      };
    }
  } catch {
    // fall through to last-resort fallback
  }

  return { blockable: new Set(ADV_TOOL_NAMES), usedFallback: true };
}

export interface RoleFirewallCheckInput {
  toolName: string;
  callerSessionID?: string;
  mainSessionId?: string | null;
  /** Optional: injected by tests to bypass derivation and assert fallback behavior. */
  _blockableSet?: Set<string>;
}

export async function roleFirewallCheckWithSessionAncestry(input: {
  toolName: string;
  callerSessionID?: string;
  client?: import("./utils/session-principal").SessionAncestryClient;
  cache?: Map<string, string>;
}): Promise<void> {
  if (!input.toolName.startsWith("adv_")) return;

  const blockable = resolveBlockableSet().blockable;
  if (!blockable.has(input.toolName)) return;

  const mainSessionId = await resolveRootSessionId(input);
  roleFirewallCheck({
    toolName: input.toolName,
    callerSessionID: input.callerSessionID,
    mainSessionId,
    _blockableSet: blockable,
  });
}

/**
 * Fail-closed predicate for the tool.execute.before hook.
 *
 * - No-op for non-adv_* tools, union-floor tools, and confirmed root-session calls.
 * - Throws RoleFirewallError for blockable tools when the caller is not the root
 *   session or when the root session cannot be resolved.
 */
export function roleFirewallCheck(input: RoleFirewallCheckInput): void {
  const { toolName, callerSessionID, mainSessionId } = input;

  if (!toolName.startsWith("adv_")) return;

  const blockable = input._blockableSet ?? resolveBlockableSet().blockable;
  if (!blockable.has(toolName)) return;

  if (mainSessionId != null && callerSessionID === mainSessionId) return;

  if (mainSessionId == null) {
    throw new RoleFirewallError(
      toolName,
      `Tool ${toolName} is blocked because the root session has not been resolved.`,
      "unresolved_role",
    );
  }

  if (callerSessionID == null) {
    throw new RoleFirewallError(
      toolName,
      `Tool ${toolName} is blocked because the caller session ID is missing.`,
      "unresolved_role",
    );
  }

  throw new RoleFirewallError(
    toolName,
    `Tool ${toolName} is blocked from sub-agent sessions; it is reserved for the SDK-derived orchestrator root session.`,
    "sub_agent",
  );
}
