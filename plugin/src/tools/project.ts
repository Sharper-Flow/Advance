/**
 * Project Tools
 *
 * Tools for reading project-level context.
 * Data retrieval tool - returns pure JSON.
 */

import { z } from "zod";
import { readFile } from "fs/promises";
import { join } from "path";
import type { Store } from "../storage/store-types";
import {
  readProjectMetadata,
  writeProjectMetadataEntry,
} from "../storage/project-metadata";
import { formatToolOutput } from "../utils/tool-output";

// =============================================================================
// Tool Definitions
// =============================================================================

export const projectTools = {
  adv_project_context: {
    description:
      "Read project context or read, write, and list per-project metadata entries.",
    args: {
      action: z
        .enum(["context", "read", "write", "list"])
        .default("context")
        .describe("Action: context (default), or metadata read/write/list."),
      key: z.string().optional().describe("Metadata key for read/write."),
      count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Metadata count for write."),
      summary: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe("Metadata summary for write, maximum 200 characters."),
      written_by: z
        .enum(["agent", "user", "system"])
        .optional()
        .describe("Metadata author for write; defaults to agent."),
    },
    execute: async (
      args: {
        action?: "context" | "read" | "write" | "list";
        key?: string;
        count?: number;
        summary?: string;
        written_by?: "agent" | "user" | "system";
      },
      store: Store,
    ) => {
      if (args.action && args.action !== "context") {
        if (args.action === "read") {
          if (!args.key)
            return formatToolOutput({
              error: "key is required for 'read' action",
            });
          const entries = await readProjectMetadata(
            store.paths.root,
            store.paths.projectMetadata,
          );
          return formatToolOutput({ entry: entries[args.key] ?? null });
        }
        if (args.action === "write") {
          if (!args.key)
            return formatToolOutput({
              error: "key is required for 'write' action",
            });
          if (args.count === undefined)
            return formatToolOutput({
              error: "count is required for 'write' action",
            });
          if (!args.summary)
            return formatToolOutput({
              error: "summary is required for 'write' action",
            });
          const entry = await writeProjectMetadataEntry(
            store.paths.root,
            {
              key: args.key,
              timestamp: new Date().toISOString(),
              count: args.count,
              summary: args.summary,
              written_by: args.written_by ?? "agent",
            },
            store.paths.projectMetadata,
          );
          return formatToolOutput({ entry });
        }
        const entries = await readProjectMetadata(
          store.paths.root,
          store.paths.projectMetadata,
        );
        return formatToolOutput({ entries });
      }

      const projectFile = store.config?.project_file ?? "project.md";
      const projectPath = join(store.paths.root, projectFile);

      try {
        const content = await readFile(projectPath, "utf-8");
        return formatToolOutput({
          file: projectFile,
          content,
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return formatToolOutput({
            file: projectFile,
            content: null,
            message: `No project context file found at ${projectFile}. Create one to document tech stack, conventions, and domain knowledge.`,
          });
        }
        throw err;
      }
    },
  },
};
