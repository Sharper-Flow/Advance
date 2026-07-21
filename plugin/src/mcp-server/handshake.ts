/**
 * ADV capability handshake meta-tool.
 *
 * ServerInfo is reserved for MCP `name` + `version` only (KD7). ADV-specific
 * compatibility data (Tier-4 tool inventory, contract version) is surfaced
 * through this dedicated tool so hosts can project names and negotiate
 * behavior without overloading serverInfo.
 */

/**
 * Tier-4 read surface exposed by the ADV MCP server. These are the local
 * (unprefixed) tool names returned by `tools/list` when projected by
 * OpenCode as `tools.adv.*`.
 *
 * Source: KD9 — read-oriented ADV tools. The list below is the exact
 * inventory communicated in the handshake response.
 */
export const HANDSHAKE_TIER4_TOOLS = [
  "status",
  "spec",
  "wisdom_list",
  "reflection_list",
  "project_context",
  "backlog_list",
  "backlog_show",
  "epic_list",
  "epic_show",
  "wip_state",
  "worktree_triage",
  "tool_catalog",
  "tool_describe",
] as const;

/**
 * ADV MCP handshake schema version.
 *
 * Semantic: tracks the shape of `HandshakeResult` (tier4_tools list +
 * adv_contract_version). Bump on breaking changes to the handshake payload
 * (e.g. tool removed from tier4_tools, field renamed, semantic redefined).
 * Does NOT track plugin version, SDK version, or individual tool schema
 * changes — only the handshake contract itself.
 *
 * History:
 *   1 — initial release (KD9 13-tool catalog; AMEND-3 dynamic-import pattern)
 */
export const ADV_CONTRACT_VERSION = 1;

export interface HandshakeResult {
  tier4_tools: readonly string[];
  adv_contract_version: number;
}

/**
 * Return the ADV capability handshake payload.
 */
export function handleHandshake(): HandshakeResult {
  return {
    tier4_tools: HANDSHAKE_TIER4_TOOLS,
    adv_contract_version: ADV_CONTRACT_VERSION,
  };
}
