/**
 * Project Tools
 *
 * Tools for reading project-level context.
 */

import { readFile } from "fs/promises";
import { join } from "path";
import type { Store } from "../storage/store";

// =============================================================================
// Tool Definitions
// =============================================================================

export const projectTools = {
  adv_project_context: {
    description:
      "Read the project context file (project.md) containing tech stack, conventions, domain knowledge, and constraints",
    args: {},
    execute: async (_args: Record<string, never>, store: Store) => {
      const projectFile = store.config?.project_file ?? "project.md";
      const projectPath = join(store.paths.root, projectFile);

      try {
        const content = await readFile(projectPath, "utf-8");
        return JSON.stringify(
          {
            file: projectFile,
            content,
          },
          null,
          2,
        );
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return JSON.stringify({
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
