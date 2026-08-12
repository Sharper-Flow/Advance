/**
 * Advance (ADV) Plugin
 *
 * Spec-driven development with specs as laws.
 * Primary interface for AI agents to manage specs, changes, and tasks.
 *
 * Implements the @opencode-ai/plugin SDK interface with:
 * - tool: MCP tools for spec/change/task/wisdom/test management (see tool-registry.ts)
 * - event: Session status tracking, terminal UI updates
 * - tool.execute.before/after: Active change tracking, task completion detection
 * - experimental.session.compacting: Change preservation during compaction
 */

import { type Plugin } from "@opencode-ai/plugin";
import { isAbsolute, join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  initializeStatus,
  cleanup as cleanupTerminal,
  getProjectName,
  setStatus,
  setActiveChange,
  pruneStaleRetries,
} from "./events";
import { tryInitStore, registerShutdownHandlers } from "./plugin-init";
import type { Change, StatusMarker } from "./types";
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
import { changeToDirectiveState } from "./types/change-state-helpers";
import { deriveWorkflowDirective } from "./utils/workflow-directive";
import {
  recordAdvToolCall,
  recordSubagentSpawn,
  recordSystemBlockBytes,
  resetMetrics,
} from "./utils/metrics";
import { initializeToolSchemaTelemetry } from "./utils/tool-schema-telemetry";
import {
  recordStepFinishTokens,
  resetCacheTokenTelemetry,
} from "./utils/cache-token-telemetry";
import { resetLaneProjectionsCache } from "./utils/tool-lane-projection";

import {
  createToolMap,
  createDegradedToolMap,
  getRegisteredAdvToolEntries,
} from "./tool-registry";
import { loadProjectConfigWithDiagnostics } from "./storage/json";
import { loadChange } from "./storage/change-projection-reader";
import { appendDebugLog, createLogger } from "./utils/debug-log";
import { detectPeerSessions } from "./utils/peer-sessions";
import { detectStaleBranchHead } from "./utils/stale-head";
import {
  initStateDb as initWorktreeStateDb,
  type WorktreeStateAccess,
} from "./tools/worktree/state";
import { drainPendingDeletes } from "./tools/worktree";
import {
  extractCompletedTask,
  extractCreatedChangeId,
  extractTerminalSuccess,
  isLongRunningTool,
} from "./plugin-output";
import {
  checkTrunkWrite,
  checkTrunkWriteBash,
  type TrunkWriteFirewallDeps,
} from "./tools/trunk-write-firewall";
import { setDoctorPointerRepairProvider } from "./tools/doctor";
import { parseWorktreePaths } from "./utils/worktree-paths";
import { getWorktreeBase } from "./utils/project-id";
import {
  getLoadedPluginBundleGeneration,
  getPluginBundleGenerationGuardError,
  getPluginBundleDistDir,
  getPluginBundleFreshness,
  PluginBundleGenerationMismatchError,
} from "./plugin-bundle-manifest";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { createHash } from "node:crypto";
import { execGit, getDefaultBranch } from "./utils/git";
import { resolveTargetProject } from "./tools/target-project";
import { resolveGitSessionContext } from "./utils/git-session";
import {
  resolveRootSessionId,
  roleFirewallCheckWithSessionAncestry,
} from "./tool-role-firewall";
import {
  evaluateTodoWriteGuard,
  extractTodoTaskIds,
  normalizeTodoWriteItems,
  type TodoWriteTaskState,
} from "./utils/todowrite-guard";
import { buildAdvWorktreeAdapter } from "./utils/workspace-adapter";
import { authorizeMorphWorktree } from "./utils/morph-worktree-authorization";
import { worktreeExistsForChange } from "./tools/worktree/state";

export { resolveGitSessionContext } from "./utils/git-session";

const MAX_PROMPT_TOOL_OUTPUT_CHARS = 24_000;
const MAX_PROMPT_DIFF_CHARS = 24_000;
const PROMPT_EXCERPT_CHARS = 2_000;

/**
 * Number of most-recent non-blank messages protected from any content
 * truncation (AC5 recency skip). Mirrors the host prune turn-protection
 * discipline (~3 turns). See boundSubAgentReportContract KD2/DC1.
 */
const RECENCY_PROTECTED_MESSAGES = 6;

/**
 * Tool types whose outputs are sub-agent (task) or skill returns and must
 * never be head/tail-sliced by the consumer transform (AC6 tool-type
 * protection). Matches the host protected-tools discipline. See KD2/DC3.
 */
const PROTECTED_TOOL_TYPES = new Set(["task", "skill"]);

const isProtectedToolType = (toolName: string): boolean =>
  toolName.length > 0 && PROTECTED_TOOL_TYPES.has(toolName.toLowerCase());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isDiskChangeReachable = async (changesDir: string, changeId: string) =>
  existsSync(join(changesDir, changeId, "change.json"));

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

/**
 * Honest full-drop marker for oversized unprotected tool output (AC7).
 * Unlike `compactLargeText` (head/tail excerpt — retained for DIFF patches,
 * which have no durable sink), this names what was removed without
 * preserving a deceptive slice that reads as complete. Layer 2 (fallback
 * durable sink) extends oversized Task/skill returns with a persisted-content
 * path; this marker handles the genuinely-untyped, unpersisted case.
 * See boundSubAgentReportContract KD1/DC4.
 */
const dropToolOutput = (source: string, text: string): string =>
  `[ADV:OUTPUT_DROPPED] ${source} produced ${text.length} chars. ` +
  `Full content removed from model prompt to keep the session resumable.`;

/**
 * Directory for the fallback durable sink (AC3/AC4). `/tmp/opencode/` is
 * pre-approved for external directory access per AGENTS.md. Within-session
 * durability is sufficient; cross-session persistence is the separate
 * changelessReportPersistence change (D2, out of scope here). See KD1/DC2.
 * Overridable via ADV_FALLBACK_SINK_DIR for tests.
 */
const DEFAULT_FALLBACK_SINK_DIR = "/tmp/opencode";
const FALLBACK_EXCERPT_CHARS = 500;

const fallbackSinkDir = (): string =>
  process.env.ADV_FALLBACK_SINK_DIR ?? DEFAULT_FALLBACK_SINK_DIR;

/**
 * Persist oversized fallback content to the durable sink before the consumer
 * transform replaces it in the prompt (AC3). Idempotent by content hash —
 * repeated prompt builds for the same content do not re-write. Returns the
 * persisted file path, or null on write failure (caller falls back to an
 * honest full-drop marker with no path).
 */
export const persistFallbackContent = (
  content: string,
  dir: string = fallbackSinkDir(),
): string | null => {
  try {
    const hash = createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 16);
    const filePath = join(dir, `fallback-report-${hash}.md`);
    if (!existsSync(filePath)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, content, "utf8");
    }
    return filePath;
  } catch {
    return null;
  }
};

/**
 * Honest persisted-result marker (AC4). Names the source, the total chars,
 * the number elided, the durable path, and a small preview — never a
 * head-and-tail excerpt.
 */
export const fallbackPersistedMarker = (
  source: string,
  content: string,
  filePath: string,
): string => {
  const shown = Math.min(content.length, FALLBACK_EXCERPT_CHARS);
  const elided = content.length - shown;
  const excerpt = content.slice(0, FALLBACK_EXCERPT_CHARS);
  return `[ADV:FALLBACK_RESULT_PERSISTED] ${source} returned ${content.length} chars (${elided} elided). Full content at ${filePath}. First ${shown} chars: ${excerpt}`;
};

export const compactToolPart = (part: unknown): boolean => {
  if (!isRecord(part) || part.type !== "tool") return false;
  const toolName =
    typeof part.tool === "string"
      ? part.tool
      : typeof part.callID === "string"
        ? part.callID
        : "tool output";
  const protectedType = isProtectedToolType(toolName);

  // Decide the replacement for an oversized tool output.
  // - Conforming (<= threshold) returns are never touched (AC6).
  // - Oversized protected (task/skill) returns are persisted to the durable
  //   sink and honestly marked with the path (AC3/AC4). If the sink fails,
  //   they fall through to the honest full-drop marker (AC7).
  // - Oversized unprotected returns get the honest full-drop marker (AC7).
  const replaceOversized = (output: string): string => {
    if (protectedType) {
      const filePath = persistFallbackContent(output);
      if (filePath) return fallbackPersistedMarker(toolName, output, filePath);
    }
    return dropToolOutput(toolName, output);
  };

  let compacted = false;

  if (isRecord(part.state) && typeof part.state.output === "string") {
    const output = part.state.output;
    if (output.length > MAX_PROMPT_TOOL_OUTPUT_CHARS) {
      part.state.output = replaceOversized(output);
      compacted = true;
    }
  }

  if (typeof part.output === "string") {
    const output = part.output;
    if (output.length > MAX_PROMPT_TOOL_OUTPUT_CHARS) {
      part.output = replaceOversized(output);
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

export const compactPromptMessages = (
  messages: Array<{ info?: unknown; parts?: unknown[] }>,
): {
  droppedBlank: number;
  compactedToolOutputs: number;
  compactedDiffs: number;
} => {
  let droppedBlank = 0;
  let compactedToolOutputs = 0;
  let compactedDiffs = 0;
  let recentProtected = 0;

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message) continue;
    if (isBlankUnfinishedAssistantMessage(message)) {
      messages.splice(index, 1);
      droppedBlank++;
      continue;
    }

    // AC5: protect the most recent N non-blank messages from any content
    // truncation (matches host prune turn-protection). Counting non-blank
    // messages from the end is robust to blank-message splicing above.
    if (recentProtected < RECENCY_PROTECTED_MESSAGES) {
      recentProtected++;
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

  /**
   * Tasks on the active change that carry `wisdom_drafts[]` entries in the
   * `suggested` state. Populated by the system.transform producer each turn
   * (rq-wisdomAutoSurfacing01.10 / AC8) so the [ADV:WISDOM_DRAFTS] prompt
   * fires. Recomputed before applyAdvSystemBlock; cleared implicitly when
   * drafts are promoted or auto-dismissed at checkpoint.
   */
  pendingWisdomDraftTasks: Array<{ id: string; title: string; count: number }>;
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

const advancePluginImpl: Plugin = async (input) => {
  const { directory, worktree, project, experimental_workspace, client } =
    input;
  experimental_workspace?.register?.("adv-worktree", buildAdvWorktreeAdapter());

  const gitSession = resolveGitSessionContext(directory, worktree);
  const { isWorktree, isMainCheckout } = gitSession;
  debugLog(
    `Plugin init: dir=${directory}, worktree=${worktree}, isWorktree=${isWorktree}, isMainCheckout=${isMainCheckout}, mainCheckoutPath=${gitSession.mainCheckoutPath ?? "unknown"}`,
  );
  const pluginBundleDistDir = getPluginBundleDistDir();
  const loadedBundleGeneration = getLoadedPluginBundleGeneration();
  debugLog(
    `Loaded plugin bundle generation: ${loadedBundleGeneration ?? "none"}`,
  );

  const {
    effectiveDir,
    externalRoot,
    projectId: resolvedProjectId,
    identityError,
  } = await resolveProjectContext(directory, project, worktree);
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
    gitSession.mainCheckoutPath ??
    gitSession.currentCheckoutPath ??
    effectiveDir;
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
  //
  // Unstable identity (shallow/grafted repo) refuses store initialization
  // entirely: falling through to tryInitStore without an externalRoot would
  // mint legacy in-repo state under a moving pseudo-root
  // (rq-projectIdentityStability01, DONT1).
  const { store, initError } = identityError
    ? { store: null, initError: identityError }
    : await tryInitStore(effectiveDir, externalRoot);

  // Cache the worktree base path for rel-path resolution in the firewall
  // hook. Uses the project ID already resolved by resolveProjectContext.
  // Null when project ID is unavailable (falls back to session directory).
  const cachedWorktreeBase: string | null = resolvedProjectId
    ? getWorktreeBase(resolvedProjectId)
    : null;

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
    activeChange: { id: null },
    lastCompletedTask: null,
    isWorktree,
    isMainCheckout,

    lastSessionHealthIssue: null,
    pendingWisdomDraftTasks: [],
  };

  // AC6 — reset session-scoped metrics on every plugin init. JC-1 keeps
  // metrics in-memory only; no persistence across plugin restarts.
  resetMetrics();
  resetCacheTokenTelemetry();
  resetLaneProjectionsCache();
  // AC1 — schema conversion is amortized at init; request hooks only read the
  // retained manifest through the status health surface.
  // Map PublicToolEntry (object form, consolidateAdvToolSurface2) to the
  // [name, args] tuple the telemetry module expects.
  initializeToolSchemaTelemetry(
    getRegisteredAdvToolEntries().map((e) => [e.name, e.args] as const),
  );

  // No handoff.json hydration: session startup uses explicit disk projections.
  // The old external handoff file is transitional legacy state and will be
  // deleted in Phase D. Fresh sessions derive active context from explicit
  // tool calls / status queries rather than consuming a sidecar JSON file.

  // Detect peer OpenCode sessions in this project (multi-session is supported;
  // emit informational marker only — per-worktree git isolation eliminates
  // working-tree races).
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

  // The projectWorkflow session_registry is retired (T21). We keep the
  // WorktreeStateAccess handle only so pending-delete draining can use the
  // durable change-workflow worktree map.
  let worktreeStateAccess: WorktreeStateAccess | null = null;
  try {
    worktreeStateAccess = await initWorktreeStateDb(directory);
  } catch (err) {
    debugLog(`worktree state access failed: ${(err as Error).message}`);
  }

  const drainTerminalPendingDeletes = async (
    trigger: "startup" | "session.deleted",
  ): Promise<void> => {
    if (!store || initError || !worktreeStateAccess) return;
    try {
      const cleanup = await drainPendingDeletes(
        trigger,
        {
          projectRoot: store.paths.root,
          database: worktreeStateAccess,
          log: hooksLogger,
          store,
          warpDeps:
            input.serverUrl && client
              ? { serverUrl: input.serverUrl, directory, client }
              : undefined,
        },
        { forceAttempts: false },
      );
      if (cleanup.removed > 0 || cleanup.retained > 0) {
        debugLog(
          `${trigger} pending-delete drain complete: removed=${cleanup.removed}, retained=${cleanup.retained}`,
        );
      }
    } catch (err) {
      debugLog(
        `${trigger} pending-delete drain failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  await drainTerminalPendingDeletes("startup");

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

  // rq-activeChangePointer01 / fixTabTitleRepoint:
  // Only active-work mutators may re-point the session active-change/title.
  // Read-only/status tools often carry args.changeId for inspection and must
  // not steal the caller's current tab title. Correctness is structural: this
  // explicit allow-list owns the decision, not tool-name suffix heuristics.
  const activeChangeRepointTools = new Set<string>([
    "adv_task_add",
    "adv_task_update",
    "adv_task_cancel",
    "adv_task_checkpoint",
    "adv_run_test",
    "adv_wisdom_add",
    "adv_gate_complete",
    "adv_change_reenter",
    "adv_change_update",
    "adv_contract_mint",
    "adv_subagent_report_submit",
  ]);

  const shouldRepointActiveChange = (
    toolName: string,
    args: Record<string, unknown>,
  ): boolean =>
    Boolean(args.changeId) && activeChangeRepointTools.has(toolName);

  // rq-activeChangePointer01: session active-change pointer hygiene.
  // Related hooks: recordCreatedChange (set on create), recordTerminalChange
  // (clear on close/archive). Phantom-pointer clearing is owned by adv_doctor
  // (rq-doctorConsolidation01 option B) via the injected pointer-repair
  // provider below — the former adv_change_forget tool was retired.
  // Reachability gate via isChangeReachable prevents phantom re-pointing.
  // Spec: .adv/specs/advance-meta/spec.json rq-activeChangePointer01
  //
  // rq-doctorConsolidation01 option B: inject the session pointer-repair
  // provider so adv_doctor can clear a confirmed-phantom pointer. This is
  // the plugin-host wiring only; tests and the MCP server never set a
  // provider, so their adv_doctor skips the phantom-pointer check.
  setDoctorPointerRepairProvider({
    getActivePointer: () => state.activeChange.id,
    clearActivePointer: () => {
      const prev = state.activeChange.id;
      state.activeChange.id = null;
      setActiveChange(null);
      debugLog(`adv_doctor: cleared phantom session pointer (was ${prev})`);
    },
  });

  const handleToolExecuteBefore = async (
    toolName: string,
    args: Record<string, unknown>,
    input: Record<string, unknown>,
  ) => {
    // Code-identity guard: once a deployed manifest supersedes this loaded
    // bundle, refuse ADV traffic before any read can answer from stale code.
    // Unknown freshness remains allowed so missing manifests are not conflated
    // with a generation mismatch.
    if (toolName.startsWith("adv_")) {
      const refusal = await getPluginBundleGenerationGuardError(
        pluginBundleDistDir,
        {
          loadedGeneration: loadedBundleGeneration ?? undefined,
          loadedModulePath: fileURLToPath(import.meta.url),
        },
      );
      if (refusal) throw new PluginBundleGenerationMismatchError(refusal);
    }

    const callerSessionID =
      typeof input.sessionID === "string" ? input.sessionID : undefined;
    await roleFirewallCheckWithSessionAncestry({
      toolName,
      callerSessionID,
      client,
      cache: sessionRootCache,
    });

    if (toolName === "morph_edit") {
      const sessionID =
        typeof input.sessionID === "string" ? input.sessionID : "";
      if (!store || !worktreeStateAccess || !resolvedProjectId || !sessionID) {
        if (args.workdir !== undefined || args.taskId !== undefined) {
          throw new Error("Morph ADV workdir authorization is unavailable");
        }
      } else {
        await authorizeMorphWorktree(args, sessionID, {
          getTaskChangeId: async (taskId) =>
            (await store.tasks.show(taskId))?.changeId ?? null,
          getExpectedRoot: (changeId) =>
            join(getWorktreeBase(resolvedProjectId), "change", changeId),
          canonicalize: (path) => realpathSync(path),
          isSetupReady: (changeId) =>
            worktreeExistsForChange(worktreeStateAccess, changeId),
        });
      }
    }

    if (shouldRepointActiveChange(toolName, args)) {
      if (args.changeId === state.activeChange.id) {
        // Already pointing here; no-op (covers same-project AND cross-project
        // repeat calls — if the caller's pointer already matches, no work).
      } else if (args.target_path) {
        // rq-activeChangePointer01.7: cross-project active-work repoint.
        // For tools in activeChangeRepointTools, repoint the caller's pointer
        // to the target-project changeId, gated by target-project disk
        // reachability. Read/diagnostic tools are filtered out by
        // shouldRepointActiveChange above (they never reach this branch).
        // KD3b: also resolve target epic_membership.epic_id for title format.
        try {
          const targetCtx = await resolveTargetProject({
            currentProjectPath: directory,
            target_path: String(args.target_path),
          });
          const targetChangesDir = join(targetCtx.externalRoot, "changes");
          // Cross-project uses disk-only check (KD3) — Visibility and
          // The disk check is the authoritative signal that the change exists
          // in the target project.
          const reachable = await isDiskChangeReachable(
            targetChangesDir,
            String(args.changeId),
          );
          if (reachable) {
            // KD3b: read target change.json for epic_membership.epic_id
            // Best-effort per DDC5; failures fall back to bare changeId title.
            let epicId: string | undefined;
            try {
              const projected = await loadChange(
                targetChangesDir,
                String(args.changeId),
              );
              if (projected.success) {
                epicId = projected.data?.epic_membership?.epic_id;
              }
            } catch (err) {
              debugLog(
                `handleToolExecuteBefore: cross-project change.json parse failed for ${args.changeId}: ${err}`,
              );
            }
            state.activeChange.id = String(args.changeId);
            setActiveChange(
              state.activeChange.id,
              epicId ? { epicId } : undefined,
            );
            debugLog(
              `handleToolExecuteBefore: cross-project re-pointed to ${args.changeId} (target project ${targetCtx.projectId}${epicId ? `, epic ${epicId}` : ""})`,
            );
          } else {
            debugLog(
              `handleToolExecuteBefore: cross-project changeId ${args.changeId} not reachable in target ${targetCtx.projectId}; preserving pointer ${state.activeChange.id}`,
            );
          }
        } catch (err) {
          // AC7: target-project resolution or reachability failure must NOT
          // block the tool call itself; only the repoint is skipped.
          debugLog(
            `handleToolExecuteBefore: cross-project repoint failed for ${args.changeId}: ${err}. Preserving pointer.`,
          );
        }
      } else {
        // Same-project reachability gate (AC4/AC5) — check before re-pointing
        try {
          const reachable = store
            ? await isDiskChangeReachable(
                store.paths.changes,
                String(args.changeId),
              )
            : false;
          if (reachable) {
            state.activeChange.id = String(args.changeId);
            const ctx = await resolveChangeContext(state.activeChange.id);
            setActiveChange(state.activeChange.id, ctx);
            debugLog(`handleToolExecuteBefore: re-pointed to ${args.changeId}`);
          } else {
            debugLog(
              `handleToolExecuteBefore: changeId ${args.changeId} not reachable; preserving pointer ${state.activeChange.id}`,
            );
          }
        } catch (err) {
          debugLog(
            `handleToolExecuteBefore: reachability check failed for ${args.changeId}: ${err}. Preserving pointer.`,
          );
        }
      }
    }

    if (toolName === "task") {
      // Use session ID to distinguish orchestrator vs sub-agent callers.
      // OpenCode plugin SDK v1.4.5 does not provide `input.agent` on the
      // `tool.execute.before` hook (input shape: {tool, sessionID, callID}),
      // so session-based discrimination is the deterministic signal.
      const callerSessionId =
        typeof input.sessionID === "string" ? input.sessionID : undefined;
      const rootSessionId = await resolveRootSessionId({
        callerSessionID: callerSessionId,
        client,
        cache: sessionRootCache,
      });
      debugLog(
        `Sub-agent spawned: count=${state.activeSubAgents + 1} callerSession=${callerSessionId ?? "unknown"} rootSession=${rootSessionId ?? "unresolved"}`,
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
      const rootSessionId = await resolveRootSessionId({
        callerSessionID: callerSessionId,
        client,
        cache: sessionRootCache,
      });
      const isMainSession = Boolean(
        rootSessionId && callerSessionId === rootSessionId,
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
        // fixTrunkFirewallRelPath: when session is on main checkout and the
        // agent has an active change with a registered ADV worktree, resolve
        // relative paths against the worktree path instead of the session
        // directory. Absolute paths always use the session directory (unchanged
        // behavior). Falls back to session directory when no worktree exists.
        let resolutionBase = directory;
        const changeId = state.activeChange.id;
        if (
          !isAbsolute(targetPath) &&
          isMainCheckout &&
          changeId &&
          cachedWorktreeBase
        ) {
          const worktreeDir = join(cachedWorktreeBase, "change", changeId);
          if (existsSync(worktreeDir)) {
            debugLog(
              `trunk-write-firewall: resolving rel path against worktree ${worktreeDir} instead of session dir ${directory}`,
            );
            resolutionBase = worktreeDir;
          }
        }
        const result = await checkTrunkWrite(
          normalizeToolTargetPath(targetPath, resolutionBase),
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

  /**
   * Resolve the parent Epic ID for the active change from the project store.
   *
   * The pane identity contract renders stable IDs only — display titles
   * never enter the title path. Returns `epicId` when the change has
   * Epic membership; otherwise an empty object. Falls back gracefully —
   * never blocks or fails the tool operation.
   */
  const resolveChangeContext = async (
    changeId: string,
  ): Promise<{ epicId?: string }> => {
    if (!store) return {};
    try {
      const result = await store.changes.get(changeId);
      if (!result.success || !result.data) return {};
      const change = result.data;
      const epicId = change.epic_membership?.epic_id;
      return epicId ? { epicId } : {};
    } catch {
      return {};
    }
  };

  const recordCreatedChange = async (rawOutput: string) => {
    const newChangeId = extractCreatedChangeId(rawOutput);
    if (!newChangeId) return;
    state.activeChange.id = newChangeId;
    const ctx = await resolveChangeContext(newChangeId);
    setActiveChange(newChangeId, ctx);
    debugLog(`adv_change_create: set activeChange to ${newChangeId}`);
  };

  const recordTerminalChange = (toolName: string, rawOutput: string): void => {
    const terminal = extractTerminalSuccess(rawOutput);
    if (!terminal) return;
    if (state.activeChange.id !== terminal.changeId) return;
    const prev = state.activeChange.id;
    state.activeChange.id = null;
    setActiveChange(null);
    debugLog(
      `recordTerminalChange: cleared pointer (was ${prev}) after ${toolName} for ${terminal.changeId}`,
    );
  };

  const recordCompletedTask = (rawOutput: string) => {
    const completedTask = extractCompletedTask(rawOutput);
    if (!completedTask) return;
    state.lastCompletedTask = completedTask;
  };

  // Cwd-detect: seed active-change pointer from process.cwd() if it matches
  // the canonical ADV worktree pattern. rq-fixZellijPaneTitles/AC1, AC2.
  // Best-effort: failures are logged and ignored, never blocking init.
  async function cwdDetectAndRepoint(): Promise<void> {
    if (!resolvedProjectId || !store) return;
    try {
      const worktreeBase = getWorktreeBase(resolvedProjectId);
      const cwd = process.cwd();
      const prefix = worktreeBase + "/change/";
      if (!cwd.startsWith(prefix)) return;
      const rest = cwd.slice(prefix.length);
      const changeId = rest.split("/")[0];
      if (!changeId) return;
      const reachable = await isDiskChangeReachable(
        store.paths.changes,
        changeId,
      );
      if (reachable) {
        state.activeChange.id = changeId;
        const ctx = await resolveChangeContext(changeId);
        setActiveChange(changeId, ctx);
        debugLog(`cwdDetect: seeded pointer to ${changeId} from cwd ${cwd}`);
      } else {
        debugLog(
          `cwdDetect: changeId ${changeId} not reachable; leaving pointer null`,
        );
      }
    } catch (err) {
      debugLog(`cwdDetect: failed: ${(err as Error).message}`);
    }
  }
  await cwdDetectAndRepoint();

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

  const handleSessionDeletedEvent = async () => {
    await drainTerminalPendingDeletes("session.deleted");
    sessionRootCache.clear();
    cleanupTerminal();
    removeProcessListeners();
    try {
      store?.close();
    } catch (e) {
      debugLog(`Error closing store: ${e}`);
    }
  };

  // Session ancestry is immutable for a session ID, so cache root resolution
  // within this plugin lifetime. Deletion clears the cache defensively.
  const sessionRootCache = new Map<string, string>();

  // Register process-level shutdown handlers (tolerates init failure).
  const { removeProcessListeners } = registerShutdownHandlers(store);

  return {
    // MCP Tools — degraded map on init failure so agents see ADV_PLUGIN_INIT_FAILED
    tool:
      store && !initError
        ? createToolMap(store, directory, input.serverUrl, client)
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
        } else if (eventType === "message.part.updated") {
          const properties = (event as { properties?: { part?: unknown } })
            .properties;
          recordStepFinishTokens(properties?.part);
        } else if (eventType === "session.deleted") {
          await handleSessionDeletedEvent();
        } else if (
          eventType === "permission.updated" ||
          eventType === "permission.asked"
        ) {
          setFlags({ permissionPending: true, sessionIdle: false });
        } else if (eventType === "permission.replied") {
          setFlags({ permissionPending: false });
        } else if (eventType === "session.error") {
          handleSessionErrorEvent(event as { properties: unknown });
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
            await recordCreatedChange(output.output);
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

        // Terminal transition pointer clear (AC2/AC3)
        if (
          (input.tool === "adv_change_close" ||
            input.tool === "adv_change_archive") &&
          output.output
        ) {
          try {
            recordTerminalChange(input.tool, output.output);
          } catch (err) {
            hooksLogger.warn(
              `Failed to process ${input.tool} output for pointer clear: ${(err as Error).message}`,
            );
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
    //   - [ADV:DEGRADED]              (degraded-mode banner)
    //   - [ADV:SESSION_HEALTH]        (session-health banner)
    //   - [ADV:PLUGIN_BUNDLE_STALE]   (deployed plugin bundle newer than loaded)
    //   - [ADV:WORKTREE_SESSION]      (worktree marker)
    //   - [ADV] Active change         (active change line)
    //   - [ADV:RECORD_WISDOM]         (wisdom recording prompt — append-only)
    //
    "experimental.chat.system.transform": async (
      input,
      output,
    ): Promise<void> => {
      try {
        // Reread the bounded deployed manifest every transform so a
        // manifest replacement is surfaced on the next turn (AC7).
        const pluginBundleFreshness = await getPluginBundleFreshness(
          pluginBundleDistDir,
        ).catch((err) => {
          debugLog(
            `plugin bundle freshness probe failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return null;
        });

        const beforeBytes = output.system[0]?.length ?? 0;

        // rq-wisdomAutoSurfacing01.10 / AC8 producer: refresh
        // pendingWisdomDraftTasks from the active change's task list so the
        // [ADV:WISDOM_DRAFTS] nudge reflects the current draft state. The
        // producer is best-effort: any storage failure yields an empty
        // array (no nudge fires). Drafts are advisory-only and never gate.
        state.pendingWisdomDraftTasks = [];
        if (store && state.activeChange.id) {
          try {
            const taskList = await store.tasks.list(state.activeChange.id);
            state.pendingWisdomDraftTasks = taskList
              .map((t) => {
                const suggestedCount = (t.wisdom_drafts ?? []).filter(
                  (d) => d.status === "suggested",
                ).length;
                return suggestedCount > 0
                  ? { id: t.id, title: t.title, count: suggestedCount }
                  : null;
              })
              .filter(
                (
                  entry,
                ): entry is { id: string; title: string; count: number } =>
                  entry !== null,
              );
          } catch (e) {
            debugLog(
              `pendingWisdomDraftTasks producer failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            state.pendingWisdomDraftTasks = [];
          }
        }

        const result = applyAdvSystemBlock(output, {
          state,
          initError,
          storeAvailable: !!store,
          pluginBundleFreshness,
        });

        // AC6: track bytes added to output.system[0] this turn.
        if (result.emitted) {
          const afterBytes = output.system[0]?.length ?? 0;
          recordSystemBlockBytes(afterBytes - beforeBytes);
        }

        // Wisdom prompt is volatile. Legacy tracking: clear
        // lastCompletedTask once it has been emitted so the retired
        // [ADV:RECORD_WISDOM] prompt does not repeat next turn.
        // The new [ADV:WISDOM_DRAFTS] prompt is driven by
        // state.pendingWisdomDraftTasks and naturally clears when drafts
        // are promoted or auto-dismissed at checkpoint.
        if (result.consumedWisdomPrompt) {
          state.lastCompletedTask = null;
        }

        // fixSessionHealthBannerNoise: mark a message-history session-health
        // issue as surfaced once its banner has been emitted, so the one-shot
        // banner does not repeat every turn. A subsequent compaction event
        // replaces lastSessionHealthIssue with a fresh (unsurfaced) issue,
        // which re-emits once. session.error banners stay sticky and are
        // never marked surfaced here.
        if (
          result.surfacedMessageHistoryHealth &&
          state.lastSessionHealthIssue?.kind === "message-history"
        ) {
          state.lastSessionHealthIssue.surfaced = true;
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
        let changeTitle = changeId;
        let changeForDirective: Change | undefined;
        try {
          const changeResult = await store.changes.get(changeId);
          if (changeResult.success && changeResult.data) {
            changeTitle = changeResult.data.title || changeTitle;
            changeForDirective = changeResult.data;
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

        // AC5: derive the authoritative directive from the full change
        // projection so the compacted snapshot renders the same `Next:`
        // orientation line the live context shows (fidelity parity). Best
        // effort — a derivation failure must not break compaction output.
        let directive: ReturnType<typeof deriveWorkflowDirective> | undefined;
        if (changeForDirective) {
          try {
            directive = deriveWorkflowDirective(
              changeToDirectiveState({
                projectId: changeForDirective.adv_project_id ?? "unknown",
                change: changeForDirective,
                gates: gates ?? undefined,
              }),
              Date.now(),
            );
          } catch (e) {
            debugLog(`Error deriving directive for compaction: ${e}`);
          }
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
          directive,
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
