/**
 * Narrow Tier-4 tool factory for the ADV MCP server.
 *
 * Lives in the host/server registration path (not the Tier-4 execution path).
 * It imports the global plugin tool registry and projects a map containing
 * exactly the 13 tools declared in the canonical Tier-4 catalog.
 */

import { createFullToolMap } from "../tool-registry.js";
import { TIER_4_MCP_TOOLS } from "../tool-tier4-catalog.js";
import type { CreateToolMapFn, ToolMap } from "./tools/index.js";
import { registerTool } from "../tool-registry.js";
import { epicTools } from "../tools/epic.js";
import { backlogShellTools } from "../tools/backlog-shell.js";

export const createTier4ToolMap: CreateToolMapFn = (
  store,
  directory,
  serverUrl,
  client,
) => {
  const allTools = createFullToolMap(
    store,
    directory,
    serverUrl,
    client,
  ) as ToolMap;
  const tier4Tools: ToolMap = {};

  for (const name of TIER_4_MCP_TOOLS) {
    const hostName = `adv_${name}`;
    const tool = allTools[hostName];
    if (
      !tool &&
      (name === "epic_list" ||
        name === "epic_show" ||
        name === "backlog_list" ||
        name === "backlog_show")
    ) {
      const group = name.startsWith("epic_") ? epicTools : backlogShellTools;
      const definition = group[`adv_${name}` as keyof typeof group] as {
        description: string;
        args: Record<string, import("zod").ZodTypeAny>;
        execute: (args: unknown, store: unknown) => Promise<string>;
      };
      tier4Tools[hostName] = registerTool(
        definition.description,
        definition.args,
        async (args) => definition.execute(args, store),
      ) as ToolMap[string];
      continue;
    }
    if (!tool) {
      throw new Error(
        `Tier-4 tool ${hostName} is missing from the plugin tool map`,
      );
    }
    tier4Tools[hostName] = tool;
  }

  return tier4Tools;
};
