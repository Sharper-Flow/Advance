/**
 * Project Metadata Tool
 *
 * MCP tool for reading and writing per-project metadata entries.
 * Open schema — any key, no pre-registration. Minimal metadata per entry.
 */

import { z } from "zod";
import type { Store } from "../storage/store";
import {
  readProjectMetadata,
  writeProjectMetadataEntry,
} from "../storage/project-metadata";
import { formatToolOutput } from "../utils/tool-output";
import { wrapWithBanner } from "../utils/banner";

// =============================================================================
// Tool Definitions
// =============================================================================

export const projectMetadataTools = {
  adv_project_metadata: {
    description:
      "Read, write, or list per-project metadata entries (scan results, external events, etc.)",
    args: {
      action: z
        .enum(["read", "write", "list"])
        .describe("Action to perform: read, write, or list"),
      key: z
        .string()
        .optional()
        .describe("Metadata key (required for read and write)"),
      count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Integer count (required for write)"),
      summary: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe("One-line summary, max 200 chars (required for write)"),
      written_by: z
        .enum(["agent", "user", "system"])
        .optional()
        .describe("Who wrote this entry (default: agent)"),
    },
    execute: async (
      args: {
        action: "read" | "write" | "list";
        key?: string;
        count?: number;
        summary?: string;
        written_by?: "agent" | "user" | "system";
      },
      store: Store,
    ) => {
      switch (args.action) {
        case "read": {
          if (!args.key) {
            return formatToolOutput({
              error: "key is required for 'read' action",
            });
          }
          const entries = await readProjectMetadata(
            store.paths.root,
            store.paths.projectMetadata,
          );
          const entry = entries[args.key] ?? null;
          return formatToolOutput({ entry });
        }

        case "write": {
          if (!args.key) {
            return formatToolOutput({
              error: "key is required for 'write' action",
            });
          }
          if (args.count === undefined) {
            return formatToolOutput({
              error: "count is required for 'write' action",
            });
          }
          if (!args.summary) {
            return formatToolOutput({
              error: "summary is required for 'write' action",
            });
          }

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

          return wrapWithBanner(
            { command: "adv_project_metadata", target: "write" },
            formatToolOutput({ entry }),
          );
        }

        case "list": {
          const entries = await readProjectMetadata(
            store.paths.root,
            store.paths.projectMetadata,
          );
          return formatToolOutput({ entries });
        }
      }
    },
  },
};
