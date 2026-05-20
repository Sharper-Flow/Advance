import type { WorkspaceAdapter, WorkspaceInfo } from "@opencode-ai/plugin";
import { isAbsolute, join, resolve } from "node:path";
import {
  assertPathInsideDirectory,
  getDataHome,
  getWorktreeHomeOverride,
} from "./project-id";

type AdvWorktreeExtra = {
  directory?: unknown;
  branch?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getAllowedWorktreeRoot = (): string =>
  getWorktreeHomeOverride() ?? join(getDataHome(), "opencode/worktree");

const validateAdvWorktreeDirectory = (directory: string): string => {
  if (!isAbsolute(directory)) {
    throw new Error("adv-worktree adapter directory must be absolute");
  }
  const normalized = resolve(directory);
  assertPathInsideDirectory(normalized, getAllowedWorktreeRoot());
  return normalized;
};

const getAdvWorktreeDirectory = (info: WorkspaceInfo): string => {
  const extra: AdvWorktreeExtra = isRecord(info.extra) ? info.extra : {};
  if (typeof extra.directory !== "string" || extra.directory.length === 0) {
    throw new Error("adv-worktree adapter requires info.extra.directory");
  }
  return validateAdvWorktreeDirectory(extra.directory);
};

/**
 * OpenCode workspace adapter for ADV-managed git worktrees.
 *
 * ADV creates and removes the git worktree itself. This adapter only teaches
 * OpenCode how to route a workspace row to that already-existing local path.
 */
export function buildAdvWorktreeAdapter(): WorkspaceAdapter {
  return {
    name: "adv-worktree",
    description: "ADV-managed git worktree (per-change isolation)",
    async configure(info) {
      return {
        ...info,
        directory: getAdvWorktreeDirectory(info),
      };
    },
    async create() {
      // Git worktree creation is owned by adv_worktree_create.
    },
    async remove() {
      // Git worktree deletion is owned by adv_worktree_delete.
    },
    async target(info) {
      if (typeof info.directory !== "string" || info.directory.length === 0) {
        throw new Error("adv-worktree adapter target requires info.directory");
      }
      return {
        type: "local",
        directory: validateAdvWorktreeDirectory(info.directory),
      };
    },
  };
}
