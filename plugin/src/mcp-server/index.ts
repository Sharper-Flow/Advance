/**
 * ADV MCP stdio server entry point.
 *
 * Exposes a minimal read surface over the Model Context Protocol:
 *   - adv_handshake: capability/version meta-tool
 *   - project_context: read project.md via the plugin tool registry
 *
 * The server resolves the project id at startup, uses the plugin version as
 * its serverInfo.version, and never accepts per-call project_root overrides
 * (AC6 minimum, enforced by the security wrapper).
 */

import { readFile } from "fs/promises";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { getProjectId } from "../utils/project-id.js";
import { handleHandshake } from "./handshake.js";
import { handleProjectContext } from "./tools/project_context.js";
import { formatArgRejection, rejectMutationShapedArgs } from "./security.js";

export interface StartServerOptions {
  stdin?: Readable;
  stdout?: Writable;
  /** Optional transport override for tests. When omitted, stdio is used. */
  transport?: Transport;
}

async function loadVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf-8"),
    );
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Start the ADV MCP server on stdio (or the provided streams).
 *
 * Resolves the project id from `process.cwd()` and binds the two read tools.
 * Does not block on Temporal at startup; the project_context tool lazily
 * creates a disk-only store when invoked.
 */
export async function startServer(
  options: StartServerOptions = {},
): Promise<void> {
  const cwd = process.cwd();
  const projectId = await getProjectId(cwd);
  if (!projectId) {
    console.warn(`[adv] Could not resolve project id for ${cwd}`);
  }

  const version = await loadVersion();
  const mcp = new McpServer({ name: "adv", version });

  /** Accept any args so the security wrapper can inspect and reject them. */
  const anyArgsSchema = z.object({}).passthrough();

  mcp.registerTool(
    "adv_handshake",
    {
      description:
        "ADV capability handshake: returns the Tier-4 tool inventory and contract version.",
      inputSchema: anyArgsSchema,
    },
    async (args) => {
      const check = rejectMutationShapedArgs(args);
      if (check.rejected) {
        return {
          content: [
            {
              type: "text" as const,
              text: formatArgRejection(check.arg),
            },
          ],
        };
      }
      const result = handleHandshake();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );

  mcp.registerTool(
    "project_context",
    {
      description:
        "Read the project context file (project.md) containing tech stack, conventions, domain knowledge, and constraints.",
      inputSchema: anyArgsSchema,
    },
    async (args) => {
      const check = rejectMutationShapedArgs(args);
      if (check.rejected) {
        return {
          content: [
            {
              type: "text" as const,
              text: formatArgRejection(check.arg),
            },
          ],
        };
      }

      const text = await handleProjectContext(cwd, args);
      return {
        content: [{ type: "text" as const, text }],
      };
    },
  );

  const transport =
    options.transport ??
    new StdioServerTransport(
      options.stdin ?? process.stdin,
      options.stdout ?? process.stdout,
    );

  await mcp.server.connect(transport);
}
