/**
 * ADV Worktree Tools (T24 — KD-8 phase 1)
 *
 * Tool definitions for `adv_worktree_create`, `adv_worktree_delete`,
 * `adv_worktree_cleanup`, and `adv_worktree_triage`.
 *
 * These wrap the underlying worktree implementations from
 * `tools/worktree/` and format output via `formatToolOutput()`.
 */

import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";
import {
  advWorktreeCreate,
  advWorktreeResume,
  advWorktreeDelete,
  advWorktreeCleanup,
} from "./worktree";
import type { WarpDeps } from "../utils/workspace-warp";
import { triageWorktrees } from "./worktree/triage";
import { initStateDb, type WorktreeStateAccess } from "./worktree/state";

/** Simple no-op-ish logger for ADV worktree tools. */
function createLogger(): {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
} {
  return {
    debug: () => {},
    info: () => {},
    warn: (msg: string) => {
      console.warn(msg);
    },
    error: (msg: string) => {
      console.error(msg);
    },
  };
}

async function initWorktreeDb(
  projectRoot: string,
): Promise<WorktreeStateAccess> {
  return initStateDb(projectRoot);
}

export const advWorktreeTools = {
  adv_worktree_create: {
    description:
      "Create a new git worktree for isolated development. Returns the worktree path, branch, and base reference.",
    args: {
      branch: z
        .string()
        .describe("Branch name for the worktree (e.g., 'feature/dark-mode')"),
      base: z
        .string()
        .optional()
        .describe("Base branch to create from (defaults to HEAD)"),
      force: z
        .boolean()
        .optional()
        .describe("Force creation even if branch exists"),
    },
    execute: async (
      args: { branch: string; base?: string; force?: boolean },
      store: Store,
    ) => {
      const projectRoot = store.paths.root;
      const database = await initWorktreeDb(projectRoot);
      const log = createLogger();
      const result = await advWorktreeCreate(
        args.branch,
        { base: args.base, force: args.force },
        { projectRoot, database, log, store },
      );
      return formatToolOutput(result);
    },
  },

  adv_worktree_resume: {
    description:
      "Resume or materialize a branch-aware ADV worktree by change ID or branch. Reuses setup-ready worktrees, blocks setup_failed records, and returns a concrete workdir.",
    args: {
      changeId: z
        .string()
        .optional()
        .describe("ADV change ID; maps to branch change/<changeId>"),
      branch: z
        .string()
        .optional()
        .describe("Branch name to resume (e.g., change/my-change)"),
      base: z
        .string()
        .optional()
        .describe("Base branch to create from when materialization is needed"),
      force: z
        .boolean()
        .optional()
        .describe("Force creation when materialization is needed"),
    },
    execute: async (
      args: {
        changeId?: string;
        branch?: string;
        base?: string;
        force?: boolean;
      },
      store: Store,
    ) => {
      const projectRoot = store.paths.root;
      const database = await initWorktreeDb(projectRoot);
      const log = createLogger();
      const result = await advWorktreeResume(
        { changeId: args.changeId ?? "", branch: args.branch },
        { base: args.base, force: args.force },
        { projectRoot, database, log },
      );
      return formatToolOutput(result);
    },
  },

  adv_worktree_delete: {
    description:
      "Delete a git worktree by branch name. Safe: checks for uncommitted work and integration requirements before removing.",
    args: {
      branch: z.string().describe("Branch name of the worktree to delete"),
      force: z
        .boolean()
        .optional()
        .describe("Force deletion bypassing some safety checks"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview deletion without running hooks or removing files"),
    },
    execute: async (
      args: { branch: string; force?: boolean; dryRun?: boolean },
      store: Store,
      options: { serverUrl?: URL } = {},
    ) => {
      const projectRoot = store.paths.root;
      const database = await initWorktreeDb(projectRoot);
      const log = createLogger();
      const warpDeps: WarpDeps | undefined = options.serverUrl
        ? { serverUrl: options.serverUrl }
        : undefined;
      const result = await advWorktreeDelete(
        args.branch,
        { force: args.force, dryRun: args.dryRun },
        { projectRoot, database, log, store, warpDeps },
      );
      return formatToolOutput(result);
    },
  },

  adv_worktree_cleanup: {
    description:
      "Retry queued worktree deletions. Safe: skips worktrees still used as a process CWD and keeps them queued.",
    args: {
      reason: z
        .string()
        .describe("Brief explanation of why you are retrying queued cleanup"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview cleanup retries without deleting queued worktrees"),
    },
    execute: async (
      args: { reason: string; dryRun?: boolean },
      store: Store,
    ) => {
      const projectRoot = store.paths.root;
      const database = await initWorktreeDb(projectRoot);
      const log = createLogger();
      const result = await advWorktreeCleanup(args.reason, {
        projectRoot,
        database,
        log,
        dryRun: args.dryRun,
      });
      return formatToolOutput({
        success: true,
        removed: result.removed,
        retained: result.retained,
        ...(result.dryRun ? { dryRun: true } : {}),
      });
    },
  },

  adv_worktree_triage: {
    description:
      "Read-only worktree inventory + advisory recommendations. Detects stale heads, missing registry entries, and archived-not-cleaned worktrees.",
    args: {
      projectRoot: z
        .string()
        .optional()
        .describe(
          "Optional project root override (defaults to current working directory)",
        ),
    },
    execute: async (args: { projectRoot?: string }, store: Store) => {
      const repoRoot = args.projectRoot ?? store.paths.root;
      const result = await triageWorktrees(repoRoot);
      return formatToolOutput({
        success: true,
        orphans: result.orphans,
        total: result.total,
      });
    },
  },
};
