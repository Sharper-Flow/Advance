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
import type { OpencodeClient } from "../utils/opencode-types";
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
  /**
   * v1 SDK client from `PluginInput.client`. When present, session lookup
   * routes through the SDK's interceptor pipeline so `x-opencode-directory`
   * is attached automatically (rq-warpModeContract04).
   */
  client?: OpencodeClient;
}

/**
 * Structured downgrade reason emitted on every `mode:warp → mode:terminal`
 * fallback path. Discriminated union so agents can branch on `kind` without
 * parsing the human-readable `warning` string (rq-warpModeContract03).
 */
export type DowngradeReason =
  | { kind: "missing_server" }
  | { kind: "missing_session" }
  | { kind: "missing_client" }
  | { kind: "flag_disabled" }
  | { kind: "lookup_failed"; status?: number; detail?: string }
  | { kind: "endpoint_unreachable" }
  | { kind: "warp_failed"; detail: string; cleanupFailed?: boolean };

async function resolveCreateRuntimeMode(
  projectRoot: string,
  log: ReturnType<typeof createLogger>,
  runtime?: AdvWorktreeCreateRuntime,
): Promise<
  | { mode: "legacy" }
  | { mode: "warp"; warpDeps: WarpDeps }
  | {
      mode: "terminal" | "spawn";
      warning?: string;
      downgrade_reason?: DowngradeReason;
    }
  | { mode: "blocked"; output: Record<string, unknown> }
> {
  const config = await loadWorktreeConfig(projectRoot, log);
  if (config.mode !== "warp") return { mode: config.mode };

  const warningMissingServer =
    "mode:warp unavailable because the OpenCode tool context did not include serverUrl; falling back to mode:terminal.";
  if (!runtime?.serverUrl) {
    log.warn(`[worktree] ${warningMissingServer}`);
    return {
      mode: "terminal",
      warning: warningMissingServer,
      downgrade_reason: { kind: "missing_server" },
    };
  }

  const warningMissingSession =
    "mode:warp unavailable because the OpenCode tool context did not include a sessionID; falling back to mode:terminal.";
  if (!runtime.sessionID) {
    log.warn(`[worktree] ${warningMissingSession}`);
    return {
      mode: "terminal",
      warning: warningMissingSession,
      downgrade_reason: { kind: "missing_session" },
    };
  }

  const warningMissingClient =
    "mode:warp unavailable because the OpenCode tool context did not include an SDK client; falling back to mode:terminal.";
  if (!runtime.client) {
    log.warn(`[worktree] ${warningMissingClient}`);
    return {
      mode: "terminal",
      warning: warningMissingClient,
      downgrade_reason: { kind: "missing_client" },
    };
  }

  const warningFlag =
    "mode:warp unavailable because OpenCode workspace sync is not enabled. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true (or OPENCODE_EXPERIMENTAL=true) and restart OpenCode to enable workspace warp; falling back to mode:terminal.";
  if (!warpFlagEnabled()) {
    log.warn(`[worktree] ${warningFlag}`);
    return {
      mode: "terminal",
      warning: warningFlag,
      downgrade_reason: { kind: "flag_disabled" },
    };
  }

  const warpDeps: WarpDeps = {
    serverUrl: runtime.serverUrl,
    directory: projectRoot,
    client: runtime.client,
  };

  const lookup = await getSessionWorkspaceID(warpDeps, runtime.sessionID);
  if (!lookup.ok) {
    const warningSession = `mode:warp unavailable because current session lookup failed (${lookup.detail}); falling back to mode:terminal.`;
    log.warn(`[worktree] ${warningSession}`);
    return {
      mode: "terminal",
      warning: warningSession,
      downgrade_reason: {
        kind: "lookup_failed",
        ...(lookup.status !== undefined ? { status: lookup.status } : {}),
        detail: lookup.detail,
      },
    };
  }
  if (lookup.workspaceID) {
    return {
      mode: "blocked",
      output: {
        ok: false,
        error: "SESSION_ALREADY_WARPED",
        sessionID: runtime.sessionID,
        workspaceID: lookup.workspaceID,
        hint: "Open a fresh OpenCode session from the trunk checkout to create a new worktree.",
      },
    };
  }

  const warningEndpoint =
    "mode:warp unavailable because /experimental/workspace is not reachable. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true and restart OpenCode, or use mode:terminal; falling back to mode:terminal.";
  if (!(await workspaceAndWarpAvailable(warpDeps))) {
    log.warn(`[worktree] ${warningEndpoint}`);
    return {
      mode: "terminal",
      warning: warningEndpoint,
      downgrade_reason: { kind: "endpoint_unreachable" },
    };
  }

  return { mode: "warp", warpDeps };
}

const terminalModePayload = <T extends { path?: string }>(
  result: T,
  warning?: string,
  downgrade_reason?: DowngradeReason,
): T & {
  mode: "terminal";
  workdir: string | undefined;
  warning?: string;
  downgrade_reason?: DowngradeReason;
  message: string;
} => ({
  ...result,
  mode: "terminal",
  workdir: result.path,
  ...(warning ? { warning } : {}),
  ...(downgrade_reason ? { downgrade_reason } : {}),
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
        return formatToolOutput(
          terminalModePayload(result, mode.warning, mode.downgrade_reason),
        );
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
            {
              kind: "warp_failed",
              detail: String(error),
              ...(workspaceCleanupFailed ? { cleanupFailed: true } : {}),
            },
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
      options: { serverUrl?: URL; client?: OpencodeClient } = {},
    ) => {
      const projectRoot = store.paths.root;
      const database = await initWorktreeDb(projectRoot);
      const log = createLogger();
      const warpDeps: WarpDeps | undefined = options.serverUrl
        ? {
            serverUrl: options.serverUrl,
            directory: projectRoot,
            client: options.client,
          }
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
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Optional wall-clock timeout for the cleanup pass. Defaults to 8000ms so the tool returns before the 10s SDK timeout when cleanup hangs on poisoned workflows or stuck I/O.",
        ),
    },
    execute: async (
      args: { reason: string; dryRun?: boolean; timeoutMs?: number },
      store: Store,
      options: { serverUrl?: URL; client?: OpencodeClient } = {},
    ) => {
      const projectRoot = store.paths.root;
      const database = await initWorktreeDb(projectRoot);
      const log = createLogger();
      const warpDeps: WarpDeps | undefined = options.serverUrl
        ? {
            serverUrl: options.serverUrl,
            directory: projectRoot,
            client: options.client,
          }
        : undefined;
      const cleanupPromise = advWorktreeCleanup(args.reason, {
        projectRoot,
        database,
        log,
        dryRun: args.dryRun,
        store,
        warpDeps,
      });
      // rq-extend-poisoned-recovery AC7: bound the cleanup tool with a
      // wall-clock timeout so cleanup hangs (e.g. inside discovery's
      // workflow queries on poisoned workflows) don't exceed the SDK's
      // tool-execution timeout and surface as console errors.
      const timeoutMs = args.timeoutMs ?? 8000;
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<{
        timedOut: true;
      }>((resolve) => {
        timeoutHandle = setTimeout(
          () => resolve({ timedOut: true }),
          timeoutMs,
        );
      });
      const result = await Promise.race([cleanupPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if ("timedOut" in result) {
        return formatToolOutput({
          success: false,
          timedOut: true,
          error: `adv_worktree_cleanup timed out after ${timeoutMs}ms. Cleanup likely blocked on a poisoned workflow or stuck I/O. Retry after the underlying workflow is resolved (see adv_temporal_diagnose).`,
          remediation:
            "Pass a larger timeoutMs to retry, or fix the poisoned workflow via adv_change_archive recoveryMode=poisoned_history first.",
        });
      }
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
