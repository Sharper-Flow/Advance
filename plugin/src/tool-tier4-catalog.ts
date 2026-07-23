/**
 * Neutral, SDK-free catalog of the ADV Tier-4 read surface.
 *
 * These are the local (unprefixed) tool names exposed by the ADV MCP server.
 * They are reachable from Code Mode as `tools.adv.*` and are returned in the
 * ADV handshake payload.
 *
 * Keep this module free of any `@opencode-ai/plugin` dependency so it can be
 * imported from SDK-coupled policy modules without pulling in the runtime.
 */
export const TIER_4_MCP_TOOLS = [
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

export type Tier4McpTool = (typeof TIER_4_MCP_TOOLS)[number];
