/**
 * Advance (ADV) Plugin
 *
 * Spec-driven development with specs as laws.
 * Primary interface for AI agents to manage specs, changes, and tasks.
 *
 * Implements the @opencode-ai/plugin SDK interface with:
 * - tool: 42 MCP tools for spec/change/task/wisdom/agenda/test management
 * - event: Session status tracking, terminal UI updates
 * - tool.execute.before/after: Active change tracking, task completion detection
 * - experimental.session.compacting: Change preservation during compaction
 */

import { type Plugin } from "@opencode-ai/plugin";
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
import { resolveProjectContext } from "./plugin-context";
// P2.7: legacy-state migration removed. Disk-only store reads from existing
// .adv/ paths or external state directly; no migration step needed.
import { enforceBashPolicy, enforceConformanceBashPolicy } from "./guards/bash";
import { enforceTaskPolicy } from "./guards/task";
import {
  enforceConformanceToolPolicy,
  enforceConformancePathPolicy,
} from "./guards/conformance";
import type {
  ConformanceCallerContext,
  ConformancePathContext,
} from "./guards/conformance";
import { loadConformanceState } from "./storage/conformance";
import { createToolMap, createDegradedToolMap } from "./tool-registry";
import { appendDebugLog, createLogger } from "./utils/debug-log";
import {
  extractCompletedTask,
  extractCreatedChangeId,
  isLongRunningTool,
} from "./plugin-output";

const MAX_PROMPT_TOOL_OUTPUT_CHARS = 24_000;
const MAX_PROMPT_DIFF_CHARS = 24_000;
const PROMPT_EXCERPT_CHARS = 2_000;

interface SessionHealthIssue {
  kind: "session.error" | "message-history";
  message: string;
  detectedAt: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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

const formatSessionHealthBanner = (
  issue: SessionHealthIssue,
  changeId: string | null,
): string => {
  const changeHint = changeId
    ? ` Known active change: ${changeId}. Open a fresh OpenCode session and resume by changeId.`
    : " Open a fresh OpenCode session and resume by changeId if this was ADV work.";
  return [
    `[ADV:SESSION_HEALTH] ${issue.kind}: ${issue.message}`,
    "Current session may be unsafe to continue from chat history.",
    `${changeHint} Do not rely on prior chat history as source of truth.`,
  ].join("\n");
};

const PROVIDER_BEHAVIOR_HINTS: Readonly<Record<string, string>> = {
  openai:
    "[ADV:PROVIDER_HINT] Provider adaptation: prefer explicit numbered steps, use structured formats (tables, numbered lists) for multi-part output, and batch independent tool calls in a single response. Keep user-facing prose terse and direct — drop fluff and pleasantries while preserving structured outputs, safety text, and quoted errors verbatim. When morph_edit fails (API error/timeout), fall back to native edit tool immediately.",
  "zai-coding-plan":
    "[ADV:PROVIDER_HINT] Provider adaptation: prefer direct explicit instructions, briefly restate the task before acting, and treat absolute constraints like NEVER/ONLY/MUST as binding. Keep user-facing prose terse and direct — drop fluff and pleasantries while preserving structured outputs, safety text, and quoted errors verbatim. When morph_edit fails (API error/timeout), fall back to native edit tool immediately.",
};

/** Fallback chain: maps providerID → list of alternative provider names.
 *  On provider switch, injects a one-line suggestion listing alternatives. */
const FALLBACK_CHAIN: Readonly<Record<string, string[]>> = {
  openai: ["anthropic", "google"],
  anthropic: ["openai", "google"],
  google: ["openai", "anthropic"],
  "zai-coding-plan": [],
};

const getProviderBehaviorHint = (providerID?: string): string | null => {
  if (!providerID) return null;
  return PROVIDER_BEHAVIOR_HINTS[providerID.toLowerCase()] ?? null;
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
  /** Current active gate (set from adv_gate_complete output). Used by conformance guards. */
  activeGate: string | null;
  /** Cached locked sibling-repo conformance paths. Updated on adv_conformance calls. */
  conformanceLockedPaths: string[];
  /** Last detected session-resume hazard to surface in system context. */
  lastSessionHealthIssue: SessionHealthIssue | null;
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
        output.system.push(banner);
      } catch {
        // banner injection must never throw
      }
    },
    "experimental.chat.messages.transform": async () => {},
    "experimental.session.compacting": async () => {},
  };
}

/**
 * Format the `[ADV:DEGRADED]` banner that surfaces in every system prompt
 * when the plugin is running in any degraded state. Stage labels:
 *   - "factory"  — the plugin factory itself threw before tryInitStore ran
 *   - "init"     — tryInitStore failed; degraded tool map is wired
 */
function formatDegradedBanner(error: Error, stage: "factory" | "init"): string {
  const stageMsg =
    stage === "factory"
      ? "Plugin factory threw before initialization completed"
      : "Plugin store initialization failed";
  return [
    `[ADV:DEGRADED] ADV plugin is running in degraded mode — ${stageMsg}.`,
    `Reason: ${error.message}`,
    "Every `adv_*` tool is stubbed and will return ADV_PLUGIN_INIT_FAILED.",
    "× Do NOT proceed with any ADV workflow (proposal, discover, design, prep, apply, review, harden, archive). They will silently break.",
    "✓ Allowed in this mode: read files, surface this diagnosis, recommend remediation, run /adv-idea or /adv-problem (no tool calls required).",
    "× Forbidden in this mode: drafting markdown as substitute for adv_change_create, fabricating change-ids or gate transitions, declaring tools 'unavailable' without surfacing this banner verbatim.",
    "Remediation: rebuild the plugin (`pnpm --filter @goost/advance build`), confirm `~/.config/opencode/opencode.json` plugin path is current, then restart OpenCode.",
  ].join("\n");
}

const advancePluginImpl: Plugin = async ({ directory, worktree, project }) => {
  const isWorktree = !!worktree && worktree !== directory;
  debugLog(
    `Plugin init: dir=${directory}, worktree=${worktree}, isWorktree=${isWorktree}`,
  );

  const { effectiveDir, externalRoot } = await resolveProjectContext(
    directory,
    project,
    worktree,
  );
  // P2.7: legacy migration removed — disk-only store reads/writes the same
  // on-disk paths. No migration step needed.

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
    activeGate: null,
    conformanceLockedPaths: [],
    lastSessionHealthIssue: null,
  };

  // No handoff.json hydration: session startup is now workflow-backed.
  // The old external handoff file is transitional legacy state and will be
  // deleted in Phase D. Fresh sessions derive active context from explicit
  // tool calls / status queries rather than consuming a sidecar JSON file.

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

  const inferActiveGate = async (
    args: Record<string, unknown>,
  ): Promise<ConformanceCallerContext["gate"]> => {
    const gateOrder: Array<NonNullable<ConformanceCallerContext["gate"]>> = [
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
    ];
    const changeId = args.changeId
      ? String(args.changeId)
      : state.activeChange.id;
    if (!store || !changeId) {
      return state.activeGate as ConformanceCallerContext["gate"];
    }

    const gates = await store.gates.get(changeId);
    if (!gates) return state.activeGate as ConformanceCallerContext["gate"];

    for (const gate of gateOrder) {
      if (gates[gate]?.status !== "done") return gate;
    }
    return "release";
  };

  const refreshConformanceLockedPaths = async (): Promise<string[]> => {
    if (!store?.paths.external) return [];
    try {
      const conformance = await loadConformanceState(
        store.paths.external,
        directory,
      );
      const lockedPaths =
        conformance.conformance_root_kind === "sibling" &&
        Object.values(conformance.specs).some(
          (entry) => entry.conformance_required && entry.locked,
        )
          ? [conformance.conformance_root]
          : [];
      state.conformanceLockedPaths = lockedPaths;
      return lockedPaths;
    } catch (err) {
      debugLog(
        `conformance locked-path refresh failed: ${(err as Error).message}`,
      );
      return state.conformanceLockedPaths;
    }
  };

  const handleToolExecuteBefore = async (
    toolName: string,
    args: Record<string, unknown>,
    input: Record<string, unknown>,
  ) => {
    const lockedPaths = await refreshConformanceLockedPaths();

    if (toolName === "bash") {
      const agent = typeof input.agent === "string" ? input.agent : "unknown";
      const command = typeof args.command === "string" ? args.command : "";
      enforceBashPolicy(agent, command);
      const conformanceBash = enforceConformanceBashPolicy(command, {
        lockedSiblingRoots: lockedPaths,
      });
      if (conformanceBash.action === "block") {
        throw new Error(conformanceBash.message);
      }
    }

    // Conformance guards (rq-confDegradation01)
    if (toolName === "adv_conformance") {
      const callerCtx: ConformanceCallerContext = {
        gate: await inferActiveGate(args),
      };
      enforceConformanceToolPolicy(toolName, callerCtx);
    }
    enforceConformancePathPolicy(toolName, args, {
      lockedPaths,
    } as ConformancePathContext);

    if (args.changeId) {
      state.activeChange.id = String(args.changeId);
      setActiveChange(state.activeChange.id);
    }

    if (toolName === "task") {
      enforceTaskPolicy(state.activeSubAgents);
      debugLog(`Sub-agent spawned: count=${state.activeSubAgents + 1}`);
      setFlags({
        activeSubAgents: state.activeSubAgents + 1,
        sessionIdle: false,
      });
    }

    if (toolName === "question") {
      setFlags({ permissionPending: true, sessionIdle: false });
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

  // Provider-switch detection — tracks last providerID for fallback chain hint
  let lastProviderID: string | null = null;

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
        if (input.tool === "adv_gate_complete") {
          try {
            const afterInput = input as unknown as {
              args?: Record<string, unknown>;
            };
            const gateId =
              typeof afterInput.args?.gateId === "string"
                ? afterInput.args.gateId
                : null;
            if (gateId) {
              state.activeGate = gateId;
              debugLog(`adv_gate_complete: set activeGate to ${gateId}`);
            }
          } catch {
            // ignore parse errors
          }
        }

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

        // Degraded-mode banner: emit on every turn so the agent sees the
        // failure BEFORE attempting any adv_* tool call. The pre-flight
        // rule "verify first" needs a verifiable signal to read; this is
        // it. Without this banner, agents observed silent self-blocking
        // ("tools unavailable" with no diagnostic).
        if (initError || !store) {
          try {
            output.system.push(
              formatDegradedBanner(
                initError ?? new Error("Plugin store unavailable"),
                "init",
              ),
            );
          } catch {
            // banner injection must never break the transform hook
          }
        }

        if (state.lastSessionHealthIssue) {
          try {
            output.system.push(
              formatSessionHealthBanner(
                state.lastSessionHealthIssue,
                state.activeChange.id,
              ),
            );
          } catch {
            // health banner injection must never break the transform hook
          }
        }

        const providerHint = getProviderBehaviorHint(input.model?.providerID);
        if (providerHint) {
          output.system.push(providerHint);
        }

        // Provider-switch detection: inject fallback chain suggestion
        const currentProviderID =
          input.model?.providerID?.toLowerCase() ?? null;
        if (
          currentProviderID &&
          lastProviderID &&
          lastProviderID !== currentProviderID
        ) {
          const alternatives = FALLBACK_CHAIN[currentProviderID] ?? [];
          if (alternatives.length > 0) {
            output.system.push(
              `[ADV:PROVIDER_SWITCH] Provider changed from ${lastProviderID} to ${currentProviderID}. ` +
                `Configured fallback alternatives: ${alternatives.join(", ")}.`,
            );
          }
        }
        if (currentProviderID) {
          lastProviderID = currentProviderID;
        }

        // Inject worktree session marker if running in a worktree
        if (state.isWorktree && state.activeChange.id) {
          output.system.push(
            `[ADV:WORKTREE_SESSION] You are working in a git worktree. ` +
              `Active change: ${state.activeChange.id}. ` +
              `All ADV state (changes, tasks, wisdom) is shared via external storage. ` +
              `Use adv_change_show and adv_task_ready to pick up where the parent session left off.`,
          );
        }

        if (!state.activeChange.id) return;

        output.system.push(
          `[ADV] Active change: ${state.activeChange.id}${state.activeChange.objective ? ` | Objective: ${state.activeChange.objective.slice(0, 60)}` : ""}`,
        );

        // Wisdom Recording Prompt (if task just finished)
        if (state.lastCompletedTask) {
          output.system.push(
            `[ADV:RECORD_WISDOM] You just completed task "${state.lastCompletedTask.title}" (${state.lastCompletedTask.id}). If you learned anything (gotchas, patterns, successes), please record it using 'adv_wisdom_add'.`,
          );
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
    "experimental.session.compacting": async (input, output): Promise<void> => {
      try {
        if (state.activeChange.id) {
          const changeContext = [
            "=== ACTIVE ADV CHANGE ===",
            `Change ID: ${state.activeChange.id}`,
            state.activeChange.objective
              ? `Objective: ${state.activeChange.objective}`
              : "",
            "This change should be preserved across compaction.",
            "========================",
          ]
            .filter(Boolean)
            .join("\n");

          output.context.push(changeContext);
        }

        if (!store) {
          // Plugin init failed — no specs available, skip compaction context
          return;
        }

        try {
          const specs = await store.specs.list({});
          if (specs.specs && specs.specs.length > 0) {
            const specsSummary = [
              "=== ADV SPECS CONTEXT ===",
              `Project has ${specs.specs.length} spec(s):`,
              ...specs.specs
                .slice(0, 5)
                .map(
                  (s: { name: string; title: string }) =>
                    `- ${s.name}: ${s.title}`,
                ),
              specs.specs.length > 5
                ? `... and ${specs.specs.length - 5} more`
                : "",
              "=========================",
            ]
              .filter(Boolean)
              .join("\n");

            output.context.push(specsSummary);
          }
        } catch (e) {
          debugLog(`Error loading specs for compaction: ${e}`);
        }

        // Push ADV TASK CONTEXT block for compaction continuity
        try {
          if (state.activeChange.id) {
            const tasks = await store.tasks.list(state.activeChange.id);
            const inProgress = tasks.find((t) => t.status === "in_progress");
            const done = tasks.filter((t) => t.status === "done").length;
            const active = tasks.filter(
              (t) => t.status === "in_progress",
            ).length;
            const pending = tasks.filter((t) => t.status === "pending").length;

            const lines: string[] = ["=== ADV TASK CONTEXT ==="];

            if (inProgress) {
              const desc =
                inProgress.title.length > 40
                  ? inProgress.title.slice(0, 37) + "..."
                  : inProgress.title;
              const phase = inProgress.tdd_phase ?? "none";
              const currentLine = `Current: ${inProgress.id} (${desc}) | Phase: ${phase}`;
              lines.push(currentLine.slice(0, 80));
            }

            const progressLine = `Progress: ${done} done | ${active} active | ${pending} pending`;
            lines.push(progressLine.slice(0, 80));
            lines.push("========================");

            output.context.push(lines.join("\n"));
          }
        } catch (e) {
          debugLog(`Error loading tasks for compaction: ${e}`);
        }
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
