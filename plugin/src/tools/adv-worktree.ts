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
  loadWorktreeConfig,
} from "./worktree";
import {
  createAdvWorkspace,
  deleteAdvWorkspace,
  getSessionWorkspaceID,
  warpFlagEnabled,
  warpSession,
  workspaceAndWarpAvailable,
  type WarpDeps,
} from "../utils/workspace-warp";
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

export interface AdvWorktreeCreateRuntime {
  serverUrl?: URL;
  sessionID?: string;
}

async function resolveCreateRuntimeMode(
  projectRoot: string,
  log: ReturnType<typeof createLogger>,
  runtime?: AdvWorktreeCreateRuntime,
): Promise<
  | { mode: "legacy" }
  | { mode: "warp"; warpDeps: WarpDeps }
  | { mode: "terminal" | "spawn"; warning?: string }
  | { mode: "blocked"; output: Record<string, unknown> }
> {
  const config = await loadWorktreeConfig(projectRoot, log);
  if (config.mode !== "warp") return { mode: config.mode };

  const warningMissingServer =
    "mode:warp unavailable because the OpenCode tool context did not include serverUrl; falling back to mode:terminal.";
  if (!runtime?.serverUrl) {
    log.warn(`[worktree] ${warningMissingServer}`);
    return { mode: "terminal", warning: warningMissingServer };
  }

  const warningMissingSession =
    "mode:warp unavailable because the OpenCode tool context did not include a sessionID; falling back to mode:terminal.";
  if (!runtime.sessionID) {
    log.warn(`[worktree] ${warningMissingSession}`);
    return { mode: "terminal", warning: warningMissingSession };
  }

  const warningFlag =
    "mode:warp unavailable because OpenCode workspace sync is not enabled. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true (or OPENCODE_EXPERIMENTAL=true) and restart OpenCode to enable workspace warp; falling back to mode:terminal.";
  if (!warpFlagEnabled()) {
    log.warn(`[worktree] ${warningFlag}`);
    return { mode: "terminal", warning: warningFlag };
  }

  const warpDeps: WarpDeps = { serverUrl: runtime.serverUrl };
  let currentWorkspaceID: string | null;
  try {
    currentWorkspaceID = await getSessionWorkspaceID(
      warpDeps,
      runtime.sessionID,
    );
  } catch (error) {
    const warningSession = `mode:warp unavailable because current session lookup failed (${error}); falling back to mode:terminal.`;
    log.warn(`[worktree] ${warningSession}`);
    return { mode: "terminal", warning: warningSession };
  }
  if (currentWorkspaceID) {
    return {
      mode: "blocked",
      output: {
        ok: false,
        error: "SESSION_ALREADY_WARPED",
        sessionID: runtime.sessionID,
        workspaceID: currentWorkspaceID,
        hint: "Open a fresh OpenCode session from the trunk checkout to create a new worktree.",
      },
    };
  }

  const warningEndpoint =
    "mode:warp unavailable because /experimental/workspace is not reachable. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true and restart OpenCode, or use mode:terminal; falling back to mode:terminal.";
  if (!(await workspaceAndWarpAvailable(warpDeps))) {
    log.warn(`[worktree] ${warningEndpoint}`);
    return { mode: "terminal", warning: warningEndpoint };
  }

  return { mode: "warp", warpDeps };
}

const terminalModePayload = <T extends { path?: string }>(
  result: T,
  warning?: string,
): T & {
  mode: "terminal";
  workdir: string | undefined;
  warning?: string;
  message: string;
} => ({
  ...result,
  mode: "terminal",
  workdir: result.path,
  ...(warning ? { warning } : {}),
  message: `IMPORTANT: Terminal mode is active. You MUST use workdir="${result.path}" for ALL subsequent tool calls (bash, read, edit, glob, grep, etc). Do NOT continue operating in the original directory.`,
});

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
      runtime?: AdvWorktreeCreateRuntime,
    ) => {
      const projectRoot = store.paths.root;
      const database = await initWorktreeDb(projectRoot);
      const log = createLogger();

      const mode = await resolveCreateRuntimeMode(projectRoot, log, runtime);
      if (mode.mode === "blocked") return formatToolOutput(mode.output);

      const result = await advWorktreeCreate(
        args.branch,
        { base: args.base, force: args.force },
        { projectRoot, database, log, store },
      );

      if (!result.ok || mode.mode === "legacy") return formatToolOutput(result);

      if (mode.mode === "terminal") {
        return formatToolOutput(terminalModePayload(result, mode.warning));
      }

      if (mode.mode === "spawn") {
        return formatToolOutput({
          ...result,
          mode: "spawn",
          workdir: result.path,
          message:
            "Spawn mode is configured; use the returned worktree path for follow-up launch handling.",
        });
      }

      if (mode.mode !== "warp") return formatToolOutput(result);
      const warpDeps = mode.warpDeps;
      let workspaceID: string | undefined;
      let workspaceCleanupFailed: string | undefined;
      try {
        const created = await createAdvWorkspace(warpDeps, {
          directory: result.path,
          branch: args.branch,
        });
        workspaceID = created.workspaceID;
        await warpSession(warpDeps, {
          workspaceID,
          sessionID: runtime?.sessionID ?? "",
        });
      } catch (error) {
        if (workspaceID) {
          try {
            await deleteAdvWorkspace(warpDeps, workspaceID);
          } catch (cleanupError) {
            workspaceCleanupFailed = String(cleanupError);
            log.warn(
              `[worktree] Warp failed AND orphan workspace cleanup failed for ${workspaceID}: ${cleanupError}`,
            );
          }
        }
        const cleanupMessage = workspaceCleanupFailed
          ? `OpenCode workspace cleanup also failed (${workspaceCleanupFailed}); manual cleanup may be required`
          : "cleaned up the OpenCode workspace";
        return formatToolOutput(
          terminalModePayload(
            result,
            `mode:warp failed after creating the git worktree (${error}); ${cleanupMessage}. Falling back to mode:terminal.`,
          ),
        );
      }

      return formatToolOutput({
        ...result,
        mode: "warp",
        workspaceID,
        message:
          "Session warped to workspace. Subsequent tool calls operate with the worktree as the project root — no per-tool workdir override needed.",
      });
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
        { projectRoot, database, log, store },
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
      options: { serverUrl?: URL } = {},
    ) => {
      const projectRoot = store.paths.root;
      const database = await initWorktreeDb(projectRoot);
      const log = createLogger();
      const warpDeps: WarpDeps | undefined = options.serverUrl
        ? { serverUrl: options.serverUrl }
        : undefined;
      const result = await advWorktreeCleanup(args.reason, {
        projectRoot,
        database,
        log,
        dryRun: args.dryRun,
        store,
        warpDeps,
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
