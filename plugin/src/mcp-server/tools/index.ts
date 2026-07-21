/**
 * MCP Tier-4 tool dispatcher.
 *
 * Table-driven registry for the 12 read tools added in SCOUT-3. Each handler
 * delegates to the plugin's `adv_*` tool via dynamic import so the MCP server is
 * not statically coupled to the SDK-bound tool registry.
 */

import type { Store } from "../../storage/store-types.js";

export type ToolClassification =
  | "pure"
  | "needs-context"
  | "needs-temporal"
  | "needs-host-git"
  | "needs-host-probe";

/**
 * KD10 classification for every Tier-4 read tool. This table drives the
 * per-tool runtime degradation wrapper added in task tk-951c84c42397.
 */
export const TOOL_CLASSIFICATIONS = {
  status: ["needs-temporal", "needs-host-probe"],
  spec: ["needs-context"],
  wisdom_list: ["needs-context"],
  reflection_list: ["needs-context"],
  backlog_list: ["needs-context"],
  backlog_show: ["needs-context"],
  epic_list: ["needs-temporal"],
  epic_show: ["needs-temporal"],
  wip_state: ["needs-temporal"],
  worktree_triage: ["needs-host-git"],
  tool_catalog: ["pure"],
  tool_describe: ["pure"],
  project_context: ["needs-context"],
} as const satisfies Record<string, ToolClassification[]>;

export type Tier4ToolName = keyof typeof TOOL_CLASSIFICATIONS;

export const TIER4_TOOL_DESCRIPTIONS: Record<Tier4ToolName, string> = {
  status:
    "Project status overview: active changes, specs, recommendations, and optional health probes.",
  spec: "Manage and query specifications (list, show, search).",
  wisdom_list: "List or search accumulated project wisdom and learnings.",
  reflection_list: "List archived change reflections.",
  backlog_list: "List backlog items.",
  backlog_show: "Show a single backlog item.",
  epic_list: "List ADV epics.",
  epic_show: "Show a single ADV epic.",
  wip_state: "Aggregated work-in-progress state across active changes.",
  worktree_triage: "Triage ADV worktrees for the current project.",
  tool_catalog: "Catalog of all ADV tool names and metadata.",
  tool_describe: "Describe a single ADV tool by name.",
  project_context:
    "Read the project context file (project.md) containing tech stack, conventions, domain knowledge, and constraints.",
};

/**
 * Execute a Tier-4 read tool by dispatching to the plugin's registered
 * `adv_<toolName>` handler.
 *
 * The store is created per-call as a disk-only backend and closed in `finally`
 * so the MCP server never holds a Temporal connection between calls.
 */
export async function executeTier4Tool(
  cwd: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const { createToolMap } = await import("../../tool-registry.js");
  const { createDiskStore } = await import("../../storage/store-disk.js");

  const store = (await createDiskStore(cwd)) as Store;
  try {
    const tools = createToolMap(store, cwd) as Record<
      string,
      { execute?: (args: Record<string, unknown>, ctx?: unknown) => unknown }
    >;
    const hostName = `adv_${toolName}`;
    const toolDef = tools[hostName];
    if (!toolDef) {
      return JSON.stringify({
        error: "TOOL_NOT_FOUND",
        tool: toolName,
        hostName,
      });
    }

    const execute = toolDef.execute as (
      args: Record<string, unknown>,
      ctx?: unknown,
    ) => Promise<unknown>;
    const result = await execute(args);

    if (typeof result === "string") {
      return result;
    }
    if (
      result &&
      typeof result === "object" &&
      "output" in result &&
      typeof (result as { output?: unknown }).output === "string"
    ) {
      return (result as { output: string }).output;
    }
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({
      error: "TOOL_EXECUTION_ERROR",
      tool: toolName,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    store.close();
  }
}
