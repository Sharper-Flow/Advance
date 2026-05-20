/**
 * Advance (ADV) Plugin
 *
 * Spec-driven development with specs as laws.
 * Primary interface for AI agents to manage specs, changes, and tasks.
 *
 * Implements the @opencode-ai/plugin SDK interface with:
 * - tool: MCP tools for spec/change/task/wisdom/agenda/test management (see tool-registry.ts)
 * - event: Session status tracking, terminal UI updates
 * - tool.execute.before/after: Active change tracking, task completion detection
 * - experimental.session.compacting: Change preservation during compaction
 */

import { type Plugin } from "@opencode-ai/plugin";
import { isAbsolute, resolve } from "node:path";
import {
  initializeStatus,
  cleanup as cleanupTerminal,
  getProjectName,
  setStatus,
  setActiveChange,
  pruneStaleRetries,
  armPendingFinalAlert,
} from "./events";
import { tryInitStore, registerShutdownHandlers } from "./plugin-init";
import type { StatusMarker } from "./types";
import { withStabilityFeatureDefaults } from "./types";
import { resolveProjectContext } from "./plugin-context";
// P2.7: legacy-state migration removed. Disk-only store reads from existing
// .adv/ paths or external state directly; no migration step needed.
import {
  applyAdvSystemBlock,
  formatDegradedBanner,
  type SessionHealthIssue,
} from "./utils/system-block";
import { buildCompactionContext } from "./utils/compaction-context";
import {
  recordAdvToolCall,
  recordSubagentSpawn,
  recordSystemBlockBytes,
  resetMetrics,
} from "./utils/metrics";

import { createToolMap, createDegradedToolMap } from "./tool-registry";
import { loadProjectConfigWithDiagnostics } from "./storage/json";
import { appendDebugLog, createLogger } from "./utils/debug-log";
import { detectPeerSessions } from "./utils/peer-sessions";
import { detectStaleBranchHead } from "./utils/stale-head";
import { generateSessionId } from "./utils/session-id";
import {
  initStateDb as initWorktreeStateDb,
  registerSession as registerSessionInRegistry,
  unregisterSession as unregisterSessionFromRegistry,
} from "./tools/worktree/state";
import {
  extractCompletedTask,
  extractCreatedChangeId,
  isLongRunningTool,
} from "./plugin-output";
import {
  checkTrunkWrite,
  checkTrunkWriteBash,
  type TrunkWriteFirewallDeps,
} from "./tools/trunk-write-firewall";
import { parseWorktreePaths } from "./utils/worktree-paths";
import { execGit, getDefaultBranch } from "./utils/git";
import { resolveGitSessionContext } from "./utils/git-session";
import {
  evaluateTodoWriteGuard,
  extractTodoTaskIds,
  normalizeTodoWriteItems,
  type TodoWriteTaskState,
} from "./utils/todowrite-guard";

export { resolveGitSessionContext } from "./utils/git-session";

const MAX_PROMPT_TOOL_OUTPUT_CHARS = 24_000;
const MAX_PROMPT_DIFF_CHARS = 24_000;
const PROMPT_EXCERPT_CHARS = 2_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeToolTargetPath = (
  targetPath: string,
  basePath: string,
): string =>
  isAbsolute(targetPath) ? targetPath : resolve(basePath, targetPath);

const compactLargeText = (
  marker: "TOOL_OUTPUT" | "DIFF",
  source: string,
  text: string,
): string => {
  const first = text.slice(0, PROMPT_EXCERPT_CHARS);
  const last = text.slice(-PROMPT_EXCERPT_CHARS);
  return [
    `[ADV:${marker}_TRUNCATED] ${source} produced ${text.length} chars. Full content omitted from model prompt to keep the session resumable.`,
    `--- first ${PROMPT_EXCERPT_CHARS} chars ---`,
    first,
    `--- last ${PROMPT_EXCERPT_CHARS} chars ---`,
    last,
  ].join("\n");
};

const compactToolPart = (part: unknown): boolean => {
  if (!isRecord(part) || part.type !== "tool") return false;
  const toolName =
    typeof part.tool === "string"
      ? part.tool
      : typeof part.callID === "string"
        ? part.callID
        : "tool output";
  let compacted = false;

  if (isRecord(part.state) && typeof part.state.output === "string") {
    const output = part.state.output;
    if (output.length > MAX_PROMPT_TOOL_OUTPUT_CHARS) {
      part.state.output = compactLargeText("TOOL_OUTPUT", toolName, output);
      compacted = true;
    }
  }

  if (typeof part.output === "string") {
    const output = part.output;
    if (output.length > MAX_PROMPT_TOOL_OUTPUT_CHARS) {
      part.output = compactLargeText("TOOL_OUTPUT", toolName, output);
      compacted = true;
    }
  }

  return compacted;
};

const compactSummaryDiffs = (info: unknown): number => {
  if (!isRecord(info) || !isRecord(info.summary)) return 0;
  const diffs = info.summary.diffs;
  if (!Array.isArray(diffs)) return 0;

  let compacted = 0;
  for (const diff of diffs) {
    if (!isRecord(diff) || typeof diff.patch !== "string") continue;
    if (diff.patch.length <= MAX_PROMPT_DIFF_CHARS) continue;
    const file = typeof diff.file === "string" ? diff.file : "summary diff";
    diff.patch = compactLargeText("DIFF", file, diff.patch);
    compacted++;
  }
  return compacted;
};

const isBlankUnfinishedAssistantMessage = (message: {
  info?: unknown;
  parts?: unknown[];
}): boolean => {
  if (!isRecord(message.info)) return false;
  if (message.info.role !== "assistant") return false;
  if (Array.isArray(message.parts) && message.parts.length > 0) return false;
  return message.info.finish == null;
};

const compactPromptMessages = (
  messages: Array<{ info?: unknown; parts?: unknown[] }>,
): {
  droppedBlank: number;
  compactedToolOutputs: number;
  compactedDiffs: number;
} => {
  let droppedBlank = 0;
  let compactedToolOutputs = 0;
  let compactedDiffs = 0;

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message) continue;
    if (isBlankUnfinishedAssistantMessage(message)) {
      messages.splice(index, 1);
      droppedBlank++;
      continue;
    }

    compactedDiffs += compactSummaryDiffs(message.info);
    if (Array.isArray(message.parts)) {
      for (const part of message.parts) {
        if (compactToolPart(part)) compactedToolOutputs++;
      }
    }
  }

  return { droppedBlank, compactedToolOutputs, compactedDiffs };
};

const extractSessionErrorMessage = (properties: unknown): string => {
  if (!isRecord(properties)) return "Unknown session error";
  for (const key of ["error", "message", "reason"]) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  try {
    return JSON.stringify(properties);
  } catch {
    return "Unknown session error";
  }
};

/** Flags that drive the resolved StatusMarker (via resolveStatus). */
interface StatusFlags {
  sessionIdle: boolean;
  activeSubAgents: number;
  activeLongTools: number;
  permissionPending: boolean;
}

/** Plugin state for tracking active work */
interface PluginState extends StatusFlags {
  activeChange: {
    id: string | null;
    objective: string | null;
  };
  lastCompletedTask: {
    id: string;
    title: string;
  } | null;
  /** True when running inside a git worktree (directory !== main repo root) */
  isWorktree: boolean;
  /** True when current checkout is the main checkout resolved via git common-dir. */
  isMainCheckout: boolean;

  /** Last detected session-resume hazard to surface in system context. */
  lastSessionHealthIssue: SessionHealthIssue | null;
  /** Provider ID seen on the previous turn — drives provider-switch hint
   *  in the assembled system block. Updated each turn after the
   *  experimental.chat.system.transform hook runs. */
  lastProviderID: string | null;
}

/**
 * Resolve the current StatusMarker from plugin state flags.
 *
 * Precedence (highest → lowest):
 *   ATTN (permission pending) > TOOLING (sub-agents/long tools) > IDLE (session idle) > WORK
 *
 * Markers:
 *   - ATTN: user must act (permission pending, approval, or question pending)
 *   - TOOLING: sub-agent or long-running tool in flight
 *   - IDLE: agent finished, no user action needed (rq-idleMarker01)
 *   - WORK: agent actively working
 *
 * BLOCKED is set directly by trackRetry() in status.ts, bypassing the resolver.
 */
const resolveStatus = (s: PluginState): StatusMarker => {
  if (s.lastSessionHealthIssue?.kind === "session.error") return "BLOCKED";
  if (s.permissionPending) return "ATTN";
  if (s.activeSubAgents > 0 || s.activeLongTools > 0) return "TOOLING";
  if (s.sessionIdle) return "IDLE";
  return "WORK";
};

const debugLog = (msg: string): void => appendDebugLog("index", msg);
const hooksLogger = createLogger("hooks");

/**
 * Build a minimal degraded hooks object for the case where the plugin
 * factory itself cannot complete normal initialization (project-context
 * resolve throws, terminal init throws, or any other top-level failure
 * before `tryInitStore` can run).
 *
 * Without this, OpenCode catches the factory throw and drops the entire
 * plugin from the session — agents see ADV operating protocol but have
 * ZERO `adv_*` tools in their function schema and no diagnostic of any
 * kind. The pre-flight rule "verify by calling" then becomes mechanically
 * impossible.
 *
 * The returned hooks expose:
 *   - the same `createDegradedToolMap` stubs used for `tryInitStore`
 *     failures, so any tool call returns `ADV_PLUGIN_INIT_FAILED`
 *   - a `system.transform` hook that injects an `[ADV:DEGRADED]` banner
 *     on every turn, so the agent discovers the failure BEFORE making
 *     any tool call
 *   - safe no-ops for all other hooks
 */
function buildFactoryFailureHooks(
  error: Error,
  directory: string,
): Awaited<ReturnType<Plugin>> {
  const banner = formatDegradedBanner(error, "factory");
  return {
    tool: createDegradedToolMap(error, directory),
    event: async () => {},
    "tool.execute.before": async () => {},
    "tool.execute.after": async () => {},
    "experimental.chat.system.transform": async (_input, output) => {
      try {
        // Single ordered append per AC1: never use output.system.push.
        // Factory-failure path has no plugin state, so we append the
        // degraded banner directly into output.system[0].
        const existing = output.system[0] ?? null;
        output.system[0] = existing ? `${existing}\n\n${banner}` : banner;
      } catch {
        // banner injection must never throw
      }
    },
    "experimental.chat.messages.transform": async () => {},
    "experimental.session.compacting": async () => {},
  };
}

const advancePluginImpl: Plugin = async ({ directory, worktree, project }) => {
  const gitSession = resolveGitSessionContext(directory, worktree);
  const { isWorktree, isMainCheckout } = gitSession;
  debugLog(
    `Plugin init: dir=${directory}, worktree=${worktree}, isWorktree=${isWorktree}, isMainCheckout=${isMainCheckout}, mainCheckoutPath=${gitSession.mainCheckoutPath ?? "unknown"}`,
  );

  const { effectiveDir, externalRoot } = await resolveProjectContext(
    directory,
    project,
    worktree,
  );
  // P2.7: legacy migration removed — disk-only store reads/writes the same
  // on-disk paths. No migration step needed.

  let trunkWriteFirewallEnforced = false;
  // Read project config from the MAIN CHECKOUT (trunk), not from the
  // current session's directory. In post-warp scenarios `directory` is the
  // worktree, but worktrees don't carry the trunk-rooted `project.json`
  // that gates `worktree_guard_enforce`. Falling back to currentCheckoutPath
  // preserves behavior for sessions where mainCheckoutPath cannot be
  // derived (e.g. fixtures without `git-common-dir`).
  // See change `fixWorktreeSessionRoot` task `tk-180a72cea67c`.
  const firewallConfigRoot =
    gitSession.mainCheckoutPath ?? gitSession.currentCheckoutPath ?? effectiveDir;
  const projectConfigResult =
    await loadProjectConfigWithDiagnostics(firewallConfigRoot);
  if (projectConfigResult.success) {
    const effectiveFeatures = withStabilityFeatureDefaults(
      projectConfigResult.data.features as Record<string, unknown> | undefined,
    );
    trunkWriteFirewallEnforced =
      effectiveFeatures.worktree_guard_enforce === true;
  } else if (projectConfigResult.type !== "not_found") {
    // Malformed/unreadable project config must not silently disable a strict
    // safety policy. Fail closed for the hook-level firewall and surface a log.
    trunkWriteFirewallEnforced = true;
    debugLog(
      `trunk-write-firewall: project config invalid; enforcing firewall (${projectConfigResult.error})`,
    );
  }

  // Initialize store. tryInitStore() never throws — if createStore or
  // store.init() fails, it returns { store: null, initError: Error } so we
  // can register a degraded tool map rather than nuking every adv_* tool.
  const { store, initError } = await tryInitStore(effectiveDir, externalRoot);

  // Initialize terminal status
  const projectName = getProjectName(directory);
  debugLog(`Initializing status: projectName=${projectName}`);
  initializeStatus(projectName);

  // Plugin state
  const state: PluginState = {
    sessionIdle: true,
    activeSubAgents: 0,
    activeLongTools: 0,
    permissionPending: false,
    activeChange: { id: null, objective: null },
    lastCompletedTask: null,
    isWorktree,
    isMainCheckout,

    lastSessionHealthIssue: null,
    lastProviderID: null,
  };

  // AC6 — reset session-scoped metrics on every plugin init. JC-1 keeps
  // metrics in-memory only; no persistence across plugin restarts.
  resetMetrics();

  // No handoff.json hydration: session startup is now workflow-backed.
  // The old external handoff file is transitional legacy state and will be
  // deleted in Phase D. Fresh sessions derive active context from explicit
  // tool calls / status queries rather than consuming a sidecar JSON file.

  // Detect peer OpenCode sessions in this project (multi-session is supported;
  // emit informational marker only — Temporal serializes state writes and
  // per-worktree git isolation eliminates working-tree races).
  // J4: Linux-only platform guard inside detectPeerSessions; gate the call.
  if (process.platform === "linux") {
    try {
      const peerSessions = await detectPeerSessions(directory);
      const peerCount = peerSessions.length;
      if (peerCount > 0) {
        debugLog(
          `Peer sessions detected: ${peerCount} (PIDs ${peerSessions.map((p) => p.pid).join(", ")})`,
        );
        hooksLogger.info(
          `[ADV:PEER_SESSIONS] ${peerCount} peer session(s) active in this project.`,
        );
      }

      // Worktree occupancy marker: detect when >1 session shares the same
      // worktree (CWD). Count-only; no peer PID/path/branch exposed.
      // Privacy: we already have peer CWDs internally but only emit count.
      const allCwds = [directory, ...peerSessions.map((p) => p.cwd)];
      const myWorktree = directory;
      const sameWorktree = allCwds.filter((cwd) => cwd === myWorktree);
      if (sameWorktree.length > 1) {
        hooksLogger.info(
          `[ADV:WORKTREE_OCCUPANCY] ${sameWorktree.length} sessions share this worktree. Nominal 1:1 violated; continuing allowed.`,
        );
      }
    } catch (err) {
      // Best-effort detection; never block init on peer-detection failure.
      debugLog(`peer detection failed: ${(err as Error).message}`);
    }
  }

  // Detect stale HEAD (branch merged + remote deleted). Warn-only; never
  // mutates branch state. Recovery is the user's responsibility.
  try {
    const staleHead = await detectStaleBranchHead(directory);
    if (staleHead.stale) {
      debugLog(`Stale HEAD detected: ${staleHead.reason}`);
      hooksLogger.warn(
        `[ADV:WARN] Stale HEAD: ${staleHead.reason} — ${staleHead.suggestion}`,
      );
    }
  } catch (err) {
    debugLog(`stale-HEAD detection failed: ${(err as Error).message}`);
  }

  // Register this session in the project workflow's session_registry (T21).
  // Best-effort: any failure is swallowed so peer-discovery never blocks
  // plugin init. The registry is consumed by adv_status, adv_session_list,
  // adv_session_show, and adv_temporal_diagnose.
  const advSessionId = generateSessionId();
  try {
    const access = await initWorktreeStateDb(directory);
    await registerSessionInRegistry(access, {
      sessionId: advSessionId,
      worktreePath: directory,
      pid: process.pid,
      now: new Date().toISOString(),
    });
    debugLog(`session registered: ${advSessionId} (pid=${process.pid})`);

    // Graceful unregister on SIGINT/SIGTERM. Best-effort.
    const unregister = async () => {
      try {
        await unregisterSessionFromRegistry(access, advSessionId);
        debugLog(`session unregistered: ${advSessionId}`);
      } catch (err) {
        debugLog(`session unregister failed: ${(err as Error).message}`);
      }
    };
    process.once("SIGINT", () => {
      void unregister();
    });
    process.once("SIGTERM", () => {
      void unregister();
    });
  } catch (err) {
    debugLog(`session registration failed: ${(err as Error).message}`);
  }

  // Helper to update status flags and push the resolved status to the terminal
  const setFlags = (updates: Partial<StatusFlags>) => {
    Object.assign(state, updates);
    setStatus(resolveStatus(state));
  };

  const handleLongRunningToolStart = (toolName: string) => {
    if (!isLongRunningTool(toolName)) return;
    setFlags({
      activeLongTools: state.activeLongTools + 1,
      sessionIdle: false,
    });
  };

  const handleLongRunningToolEnd = (toolName: string) => {
    if (!isLongRunningTool(toolName)) return;
    setFlags({
      activeLongTools: Math.max(0, state.activeLongTools - 1),
    });
  };

  const handleToolExecuteBefore = async (
    toolName: string,
    args: Record<string, unknown>,
    input: Record<string, unknown>,
  ) => {
    if (args.changeId) {
      state.activeChange.id = String(args.changeId);
      setActiveChange(state.activeChange.id);
    }

    if (toolName === "task") {
      // Use session ID to distinguish orchestrator vs sub-agent callers.
      // OpenCode plugin SDK v1.4.5 does not provide `input.agent` on the
      // `tool.execute.before` hook (input shape: {tool, sessionID, callID}),
      // so session-based discrimination is the deterministic signal.
      const callerSessionId =
        typeof input.sessionID === "string" ? input.sessionID : undefined;
      debugLog(
        `Sub-agent spawned: count=${state.activeSubAgents + 1} callerSession=${callerSessionId ?? "unknown"} mainSession=${mainSessionId ?? "null"}`,
      );
      setFlags({
        activeSubAgents: state.activeSubAgents + 1,
        sessionIdle: false,
      });
      // AC6: subagent_spawns counter
      recordSubagentSpawn();
    }

    if (toolName === "question") {
      setFlags({ permissionPending: true, sessionIdle: false });
    }

    if (toolName.toLowerCase() === "todowrite") {
      const callerSessionId =
        typeof input.sessionID === "string" ? input.sessionID : undefined;
      const isMainSession = Boolean(
        mainSessionId && callerSessionId === mainSessionId,
      );
      const changeId = state.activeChange.id;
      const todos = normalizeTodoWriteItems(args);

      if (store && changeId && isMainSession) {
        try {
          const changeResult = await store.changes.get(changeId);
          const change = changeResult.success ? changeResult.data : null;
          const planningDone =
            change?.gates?.planning?.status === "done" ||
            change?.tasks.some((task) => task.status !== "cancelled");
          const active = Boolean(
            change && planningDone && change.tasks.length > 0,
          );
          const tasksById = new Map<string, TodoWriteTaskState>();

          for (const task of change?.tasks ?? []) {
            tasksById.set(task.id, {
              id: task.id,
              changeId,
              status: task.status,
            });
          }

          const referencedIds = todos.flatMap((todo) =>
            typeof todo.content === "string"
              ? extractTodoTaskIds(todo.content)
              : [],
          );
          for (const taskId of referencedIds) {
            if (tasksById.has(taskId)) continue;
            const owner = await store.tasks.show(taskId);
            if (owner) {
              tasksById.set(taskId, {
                id: owner.task.id,
                changeId: owner.changeId,
                status: owner.task.status,
              });
            }
          }

          const decision = evaluateTodoWriteGuard({
            scope: { active, activeChangeId: changeId },
            todos,
            tasksById,
          });
          if (decision.kind === "block") throw new Error(decision.message);
          if (decision.kind === "warn") debugLog(decision.message);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (message.startsWith("TodoWrite ")) throw error;
          debugLog(`TodoWrite ADV guard warning: ${message}`);
        }
      }
    }

    // Identify trunk by git topology (main checkout containing the default
    // branch), not by the session's bound directory. In post-warp scenarios
    // `directory` is the worktree path, so deriving `projectRoot = directory`
    // would mis-classify worktree writes as trunk-rooted and miss real trunk
    // writes. mainCheckoutPath comes from `git rev-parse --git-common-dir`
    // and is project-stable across worktrees. Falls back to `directory` for
    // fixtures or environments where git-common-dir cannot be derived.
    // Paired with the firewallConfigRoot derivation above so config and
    // projectRoot consistently resolve to the trunk.
    // See change `fixWorktreeSessionRoot` task `tk-180a72cea67c`.
    const projectRoot = gitSession.mainCheckoutPath ?? directory;
    const firewallDeps: TrunkWriteFirewallDeps = {
      getDefaultBranch: (cwd: string) => getDefaultBranch(cwd),
      execGit: (gitArgs: string[], cwd: string) => execGit(gitArgs, cwd),
      getWorktreePaths: async () => {
        try {
          const output = await execGit(
            ["worktree", "list", "--porcelain"],
            projectRoot,
          );
          return parseWorktreePaths(output).filter(
            (path) => path !== projectRoot,
          );
        } catch (error) {
          debugLog(
            `trunk-write-firewall WARN: worktree path lookup failed for ${projectRoot}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return [];
        }
      },
      getProjectRoot: () => projectRoot,
      onWarning: (message: string) => debugLog(message),
    };

    if (
      trunkWriteFirewallEnforced &&
      (toolName === "write" || toolName === "edit" || toolName === "morph_edit")
    ) {
      const targetPath =
        typeof args.filePath === "string"
          ? args.filePath
          : typeof args.target_filepath === "string"
            ? args.target_filepath
            : typeof args.path === "string"
              ? args.path
              : undefined;
      if (targetPath) {
        const result = await checkTrunkWrite(
          normalizeToolTargetPath(targetPath, directory),
          firewallDeps,
        );
        if (result.decision === "BLOCK") {
          throw new Error(
            result.reason ?? "Trunk write firewall blocked file write.",
          );
        }
      }
    }

    if (trunkWriteFirewallEnforced && toolName === "bash") {
      const command = typeof args.command === "string" ? args.command : "";
      const argsWorkdir =
        typeof args.workdir === "string" ? args.workdir : undefined;
      const result = await checkTrunkWriteBash(
        command,
        argsWorkdir ?? directory,
        firewallDeps,
      );
      if (result.decision === "BLOCK") {
        throw new Error(
          result.reason ?? "Trunk write firewall blocked bash write.",
        );
      }
    }

    handleLongRunningToolStart(toolName);
  };

  const recordCreatedChange = (rawOutput: string) => {
    const newChangeId = extractCreatedChangeId(rawOutput);
    if (!newChangeId) return;
    state.activeChange.id = newChangeId;
    setActiveChange(newChangeId);
    debugLog(`adv_change_create: set activeChange to ${newChangeId}`);
  };

  const recordCompletedTask = (rawOutput: string) => {
    const completedTask = extractCompletedTask(rawOutput);
    if (!completedTask) return;
    state.lastCompletedTask = completedTask;
  };

  const handleSessionStatusEvent = (event: { properties: unknown }) => {
    const props = event.properties as { status?: { type?: string } };
    const statusType = props.status?.type;
    if (statusType === "idle") {
      if (state.activeSubAgents === 0) {
        setFlags({ sessionIdle: true });
      }
      pruneStaleRetries();
      return;
    }
    if (statusType === "busy") {
      setFlags({ sessionIdle: false });
    }
  };

  const handleSessionErrorEvent = (event: { properties: unknown }) => {
    const message = extractSessionErrorMessage(event.properties);
    state.lastSessionHealthIssue = {
      kind: "session.error",
      message,
      detectedAt: Date.now(),
    };
    setStatus("BLOCKED");
  };

  const handleSessionDeletedEvent = () => {
    mainSessionId = null;
    lastObservedCompletedMessageId = null;
    cleanupTerminal();
    removeProcessListeners();
    try {
      store?.close();
    } catch (e) {
      debugLog(`Error closing store: ${e}`);
    }
  };

  const getCompletedMainMessageId = (event: {
    properties: Record<string, unknown>;
  }): string | null => {
    const info = event.properties?.info as Record<string, unknown> | undefined;
    if (!info || !mainSessionId) return null;
    if (info.sessionID !== mainSessionId) return null;
    if (info.role !== "assistant") return null;

    const time = info.time as Record<string, unknown> | undefined;
    if (!time?.completed) return null;

    if (!isTerminalAssistantMessage(info)) {
      return null;
    }

    const messageId = info.id as string | undefined;
    if (!messageId || messageId === lastObservedCompletedMessageId) {
      return null;
    }

    return messageId;
  };

  const isTerminalAssistantMessage = (
    info: Record<string, unknown>,
  ): boolean => {
    const finish = info.finish as string | undefined;
    return !!finish && finish !== "tool-calls" && finish !== "unknown";
  };

  const handleMessageUpdatedEvent = (event: {
    properties: Record<string, unknown>;
  }) => {
    const messageId = getCompletedMainMessageId(event);
    if (!messageId) return;

    lastObservedCompletedMessageId = messageId;
    debugLog(
      `message.updated: arming bell for main agent message ${messageId}`,
    );
    armPendingFinalAlert(messageId);
  };

  // Main session ID — used to distinguish main-agent message.updated events
  // from sub-agent events. Captured from system.transform input (fires every
  // turn with sessionID). Fail-closed: null means no bell arming.
  let mainSessionId: string | null = null;

  // Dedup for message.updated handler — tracks last completed assistant
  // message ID we've seen to avoid re-arming on duplicate events.
  let lastObservedCompletedMessageId: string | null = null;

  // Provider-switch detection lives in `state.lastProviderID` — see
  // applyAdvSystemBlock invocation in the system.transform hook below.

  // Register process-level shutdown handlers (tolerates init failure).
  const { removeProcessListeners } = registerShutdownHandlers(store);

  return {
    // MCP Tools — degraded map on init failure so agents see ADV_PLUGIN_INIT_FAILED
    tool:
      store && !initError
        ? createToolMap(store, directory, store.paths.agenda)
        : createDegradedToolMap(
            initError ?? new Error("Plugin store unavailable"),
            effectiveDir,
          ),

    // Event Hook
    event: async ({ event }): Promise<void> => {
      try {
        const eventType = event.type as string;
        debugLog(`event: type="${eventType}"`);

        if (eventType === "session.status") {
          handleSessionStatusEvent(event as { properties: unknown });
        } else if (eventType === "session.deleted") {
          handleSessionDeletedEvent();
        } else if (
          eventType === "permission.updated" ||
          eventType === "permission.asked"
        ) {
          setFlags({ permissionPending: true, sessionIdle: false });
        } else if (eventType === "permission.replied") {
          setFlags({ permissionPending: false });
        } else if (eventType === "session.error") {
          handleSessionErrorEvent(event as { properties: unknown });
        } else if (eventType === "message.updated") {
          handleMessageUpdatedEvent(
            event as { properties: Record<string, unknown> },
          );
        }
      } catch (e) {
        debugLog(`Event hook error: ${e}`);
      }
    },

    // Tool Execute Before Hook
    "tool.execute.before": async (input, output): Promise<void> => {
      try {
        debugLog(`tool.execute.before: tool="${input.tool}"`);
        const args = output.args as Record<string, unknown>;
        await handleToolExecuteBefore(
          input.tool,
          args,
          input as Record<string, unknown>,
        );
      } catch (e) {
        debugLog(`tool.execute.before error: ${e}`);
        throw e;
      }
    },

    // Tool Execute After Hook
    "tool.execute.after": async (input, output): Promise<void> => {
      try {
        debugLog(`tool.execute.after: tool="${input.tool}"`);

        // AC6: increment adv_tool_calls + adv_tool_call_count_by_name for
        // any adv_* tool. Non-adv tools are ignored by recordAdvToolCall.
        recordAdvToolCall(input.tool);

        // Track new change creation (changeId only in output, not input args)
        if (input.tool === "adv_change_create" && output.output) {
          try {
            recordCreatedChange(output.output);
          } catch (err) {
            // Outer parse error — unexpected if banner format changes
            hooksLogger.warn(
              `Failed to parse adv_change_create output: ${(err as Error).message}`,
            );
          }
        }

        // Track task status changes for wisdom prompt
        if (input.tool === "adv_task_update" && output.output) {
          try {
            recordCompletedTask(output.output);
          } catch {
            // ignore parse errors
          }
        }

        // Track active gate from adv_gate_complete output

        // Handle sub-agent completion
        if (input.tool === "task") {
          const newCount = Math.max(0, state.activeSubAgents - 1);
          debugLog(`Sub-agent completed: count=${newCount}`);
          setFlags({ activeSubAgents: newCount, permissionPending: false });
        }

        // Handle question tool completion
        if (input.tool === "question") {
          setFlags({ permissionPending: false });
        }

        handleLongRunningToolEnd(input.tool);
      } catch (e) {
        debugLog(`tool.execute.after error: ${e}`);
      }
    },

    // Context Injection Hook (Continuation & Wisdom)
    //
    // Single ordered emit per AC1: assembles the entire ADV system-context
    // block in `applyAdvSystemBlock` and writes it to `output.system[0]`.
    // No `output.system.push` calls here — multi-block emission breaks the
    // OpenAI-compat provider (assistant-prefilling rejection).
    //
    // Markers composed by `applyAdvSystemBlock` (defined in
    // `utils/system-block.ts`):
    //   - [ADV:DEGRADED]          (degraded-mode banner)
    //   - [ADV:SESSION_HEALTH]    (session-health banner)
    //   - [ADV:PROVIDER_SWITCH]   (provider-switch hint)
    //   - [ADV:WORKTREE_SESSION]  (worktree marker)
    //   - [ADV] Active change     (active change line)
    //   - [ADV:RECORD_WISDOM]     (wisdom recording prompt — append-only)
    //
    "experimental.chat.system.transform": async (
      input,
      output,
    ): Promise<void> => {
      try {
        // Capture main session ID on first transform call.
        if (!mainSessionId && input.sessionID) {
          mainSessionId = input.sessionID;
          debugLog(`Captured mainSessionId: ${mainSessionId}`);
        }

        const currentProviderID =
          input.model?.providerID?.toLowerCase() ?? null;

        const beforeBytes = output.system[0]?.length ?? 0;
        const result = applyAdvSystemBlock(output, {
          state,
          currentProviderID,
          initError,
          storeAvailable: !!store,
        });

        // AC6: track bytes added to output.system[0] this turn.
        if (result.emitted) {
          const afterBytes = output.system[0]?.length ?? 0;
          recordSystemBlockBytes(afterBytes - beforeBytes);
        }

        // Update lastProviderID after assembly (so the next turn detects
        // the switch). Track regardless of whether this turn emitted.
        if (currentProviderID) {
          state.lastProviderID = currentProviderID;
        }

        // Wisdom prompt is volatile: clear lastCompletedTask once it has
        // been emitted so the prompt does not repeat next turn.
        if (result.consumedWisdomPrompt) {
          state.lastCompletedTask = null;
        }
      } catch (e) {
        debugLog(`experimental.chat.system.transform error: ${e}`);
      }
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      try {
        if (!Array.isArray(output.messages)) return;
        const result = compactPromptMessages(output.messages);
        if (
          result.droppedBlank > 0 ||
          result.compactedToolOutputs > 0 ||
          result.compactedDiffs > 0
        ) {
          state.lastSessionHealthIssue = {
            kind: "message-history",
            message:
              `Sanitized prompt history: dropped ${result.droppedBlank} blank assistant message(s), ` +
              `compacted ${result.compactedToolOutputs} oversized tool output(s), ` +
              `compacted ${result.compactedDiffs} oversized diff(s).`,
            detectedAt: Date.now(),
          };
          debugLog(state.lastSessionHealthIssue.message);
        }
      } catch (e) {
        debugLog(`experimental.chat.messages.transform error: ${e}`);
      }
    },

    // Session Compaction Hook
    //
    // Single combined context entry per AC2: composes a change-context
    // snapshot (via buildChangeContextSnapshot — same formatter the live
    // path uses), specs summary, and a resume-hint block sourced from
    // the in-progress task's durable run ledger. Stale-ledger detection
    // (AC7) replaces the resume hint with an explicit warning when the
    // referenced task is cancelled or done.
    "experimental.session.compacting": async (
      _input,
      output,
    ): Promise<void> => {
      try {
        const changeId = state.activeChange.id;
        if (!changeId || !store) {
          // No active change OR plugin init failed: nothing to compose.
          return;
        }

        // Resolve change record. Tolerate a not-found / read-error result
        // by falling back to a minimal CompactionChangeLike sourced from
        // active state — the snapshot still produces useful output.
        let changeTitle = state.activeChange.objective ?? changeId;
        try {
          const changeResult = await store.changes.get(changeId);
          if (changeResult.success && changeResult.data) {
            changeTitle = changeResult.data.title || changeTitle;
          }
        } catch (e) {
          debugLog(`Error loading change for compaction: ${e}`);
        }

        let tasks: Awaited<ReturnType<typeof store.tasks.list>> = [];
        try {
          tasks = await store.tasks.list(changeId);
        } catch (e) {
          debugLog(`Error loading tasks for compaction: ${e}`);
        }

        let gates: Awaited<ReturnType<typeof store.gates.get>> = null;
        try {
          gates = await store.gates.get(changeId);
        } catch (e) {
          debugLog(`Error loading gates for compaction: ${e}`);
        }

        let specs: Array<{ name: string; title: string }> = [];
        try {
          const specsResult = await store.specs.list({});
          specs = specsResult.specs ?? [];
        } catch (e) {
          debugLog(`Error loading specs for compaction: ${e}`);
        }

        const block = buildCompactionContext({
          change: { id: changeId, title: changeTitle },
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            touched_files: t.touched_files,
            error_recovery: t.error_recovery,
          })),
          gates: gates ?? undefined,
          workdir: directory,
          specs,
        });

        output.context.push(block);
      } catch (e) {
        debugLog(`Session compacting hook error: ${e}`);
      }
    },
  };
};

/**
 * Top-level Plugin export.
 *
 * Wraps `advancePluginImpl` so that ANY throw originating outside
 * `tryInitStore` (project-context resolve, terminal init, sub-helper
 * imports, etc.) is caught and converted into a degraded hooks object.
 *
 * Without this wrapper, OpenCode catches the factory throw, drops the
 * plugin from the session, and the agent ends up with zero `adv_*` tools
 * in its function schema and zero diagnostic surface — the original
 * "silent disappearance" failure mode.
 *
 * The wrapper preserves the existing happy path verbatim (impl is called
 * directly; on success its hooks are returned unchanged) and only takes
 * over when the factory throws.
 */
export const AdvancePlugin: Plugin = async (input) => {
  try {
    return await advancePluginImpl(input);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    debugLog(
      `AdvancePlugin factory threw: ${error.message} — registering degraded hooks`,
    );
    return buildFactoryFailureHooks(error, input.directory);
  }
};

// Default export for OpenCode
/** @alias */
export default AdvancePlugin;
