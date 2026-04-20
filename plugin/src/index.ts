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
} from "./events";
import { tryInitStore, registerShutdownHandlers } from "./plugin-init";
import type { StatusMarker } from "./types";
import { getProjectId, getExternalRoot } from "./utils/project-id";
import { migrateToExternalState } from "./storage/migrate";
import { consumeHandoff } from "./storage/handoff";
import { enforceBashPolicy } from "./guards/bash";
import { enforceTaskPolicy } from "./guards/task";
import { createToolMap, createDegradedToolMap } from "./tool-registry";
import { appendDebugLog, createLogger } from "./utils/debug-log";

/**
 * Parse JSON from a (potentially banner-wrapped) tool output string.
 * Tries the post-banner segment first, then falls back to the full string.
 * Returns null if neither parses as valid JSON.
 */
function parseToolOutput<T>(rawOutput: string): T | null {
  const trimmed = rawOutput.trim();
  const separatorIndex = trimmed.lastIndexOf("\n\n");
  const candidates = [
    separatorIndex >= 0 ? trimmed.slice(separatorIndex + 2).trim() : null,
    trimmed,
  ].filter((c): c is string => !!c);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const PROVIDER_BEHAVIOR_HINTS: Readonly<Record<string, string>> = {
  openai:
    "[ADV:PROVIDER_HINT] Provider adaptation: prefer explicit numbered steps, use structured formats (tables, numbered lists) for multi-part output, and batch independent tool calls in a single response. Keep user-facing prose terse and direct — drop fluff and pleasantries while preserving structured outputs, safety text, and quoted errors verbatim.",
  "zai-coding-plan":
    "[ADV:PROVIDER_HINT] Provider adaptation: prefer direct explicit instructions, briefly restate the task before acting, and treat absolute constraints like NEVER/ONLY/MUST as binding. Keep user-facing prose terse and direct — drop fluff and pleasantries while preserving structured outputs, safety text, and quoted errors verbatim.",
};

const getProviderBehaviorHint = (providerID?: string): string | null => {
  if (!providerID) return null;
  return PROVIDER_BEHAVIOR_HINTS[providerID.toLowerCase()] ?? null;
};

/** Flags that drive the resolved StatusMarker (via resolveStatus). */
interface StatusFlags {
  sessionIdle: boolean;
  activeSubAgents: number;
  permissionPending: boolean;
  tddPhase: "TDD_RED" | "TDD_GREEN" | null;
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
}

/**
 * Resolve the current StatusMarker from plugin state flags.
 *
 * Precedence (highest → lowest):
 *   MIC > MOON > TDD_RED > TDD_GREEN > ROCKET > EARTH
 *
 * EARTH is only shown when the session is idle AND no other flag is set.
 * DOOM_LOOP is set directly by trackRetry() in status.ts, bypassing the resolver.
 */
const resolveStatus = (s: PluginState): StatusMarker => {
  if (s.permissionPending) return "MIC";
  if (s.activeSubAgents > 0) return "MOON";
  if (s.tddPhase) return s.tddPhase;
  if (s.sessionIdle) return "EARTH";
  return "ROCKET";
};

const debugLog = (msg: string): void => appendDebugLog("index", msg);
const hooksLogger = createLogger("hooks");

export const AdvancePlugin: Plugin = async ({
  directory,
  worktree,
  project,
}) => {
  const isWorktree = !!worktree && worktree !== directory;
  debugLog(
    `Plugin init: dir=${directory}, worktree=${worktree}, isWorktree=${isWorktree}`,
  );

  // Derive project identity and resolve external state directory.
  // Try directory first; if not a git repo, fall back to project.path
  // from the SDK (covers GUI clients that may start the server from $HOME).
  let effectiveDir = directory;
  let projectId = await getProjectId(effectiveDir);

  if (!projectId && project?.vcsDir && project.vcsDir !== directory) {
    debugLog(
      `directory not a git repo, trying project.vcsDir: ${project.vcsDir}`,
    );
    const altId = await getProjectId(project.vcsDir);
    if (altId) {
      effectiveDir = project.vcsDir;
      projectId = altId;
    }
  }

  let externalRoot: string | undefined;

  if (projectId) {
    externalRoot = getExternalRoot(projectId);
    debugLog(`External state: projectId=${projectId}, root=${externalRoot}`);

    // One-time migration: copy any existing .adv/ mutable state to external dir
    try {
      const report = await migrateToExternalState(effectiveDir, externalRoot);
      if (report.migrated.length > 0)
        debugLog(
          `Migration: ${report.migrated.join(",")} migrated, ${report.skipped.join(",")} skipped`,
        );
    } catch (e) {
      debugLog(`Migration failed (non-fatal): ${(e as Error).message}`);
    }
  } else {
    debugLog("No project ID (not a git repo?) — using legacy in-repo paths");
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
    permissionPending: false,
    tddPhase: null,
    activeChange: { id: null, objective: null },
    lastCompletedTask: null,
    isWorktree,
  };

  // Session hydration: atomically consume handoff.json and populate active change
  if (store && store.paths.external) {
    try {
      const handoff = await consumeHandoff(store.paths.handoff);
      if (handoff) {
        state.activeChange = {
          id: handoff.changeId,
          objective: handoff.objective,
        };
        setActiveChange(handoff.changeId);
        debugLog(
          `Hydrated from handoff: changeId=${handoff.changeId}, objective=${handoff.objective}`,
        );
      }
    } catch (e) {
      debugLog(`Handoff hydration failed (non-fatal): ${(e as Error).message}`);
    }
  }

  // Helper to update status flags and push the resolved status to the terminal
  const setFlags = (updates: Partial<StatusFlags>) => {
    Object.assign(state, updates);
    setStatus(resolveStatus(state));
  };

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
          const props = event.properties as { status?: { type?: string } };
          const statusType = props.status?.type;
          if (statusType === "idle") {
            if (state.activeSubAgents === 0) {
              setFlags({ sessionIdle: true, tddPhase: null });
            }
            pruneStaleRetries();
          } else if (statusType === "busy") {
            setFlags({ sessionIdle: false });
          }
        } else if (eventType === "session.deleted") {
          cleanupTerminal();
          removeProcessListeners();
          try {
            store?.close();
          } catch (e) {
            debugLog(`Error closing store: ${e}`);
          }
        } else if (
          eventType === "permission.updated" ||
          eventType === "permission.asked"
        ) {
          setFlags({ permissionPending: true, sessionIdle: false });
        } else if (eventType === "permission.replied") {
          setFlags({ permissionPending: false });
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

        // Enforce read-only bash policy for restricted sub-agents
        if (input.tool === "bash") {
          const extInput = input as Record<string, unknown>;
          const agent =
            typeof extInput["agent"] === "string"
              ? extInput["agent"]
              : "unknown";
          const command =
            typeof args["command"] === "string" ? args["command"] : "";
          enforceBashPolicy(agent, command);
        }

        // Track changeId from ADV tools for context injection
        if (args["changeId"]) {
          state.activeChange.id = String(args["changeId"]);
          setActiveChange(state.activeChange.id);
        }

        // Detect sub-agent spawning (Task tool)
        if (input.tool === "task") {
          enforceTaskPolicy(state.activeSubAgents);
          debugLog(`Sub-agent spawned: count=${state.activeSubAgents + 1}`);
          setFlags({
            activeSubAgents: state.activeSubAgents + 1,
            sessionIdle: false,
          });
        }

        // Detect question tools (needs user input)
        if (input.tool === "question") {
          setFlags({ permissionPending: true, sessionIdle: false });
        }

        // Detect TDD phase from adv_run_test and adv_task_evidence
        if (
          input.tool === "adv_run_test" ||
          input.tool === "adv_task_evidence"
        ) {
          const phase = args["phase"];
          if (phase === "red") {
            setFlags({ tddPhase: "TDD_RED", sessionIdle: false });
          } else if (phase === "green") {
            setFlags({ tddPhase: "TDD_GREEN", sessionIdle: false });
          }
        }
      } catch (e) {
        debugLog(`tool.execute.before error: ${e}`);
      }
    },

    // Tool Execute After Hook
    "tool.execute.after": async (input, output): Promise<void> => {
      try {
        debugLog(`tool.execute.after: tool="${input.tool}"`);

        // Track new change creation (changeId only in output, not input args)
        if (input.tool === "adv_change_create" && output.output) {
          try {
            const result = parseToolOutput<{
              changeId?: string;
              data?: { changeId?: string };
            }>(output.output);
            const newChangeId = result?.changeId ?? result?.data?.changeId;
            if (newChangeId && typeof newChangeId === "string") {
              state.activeChange.id = newChangeId;
              setActiveChange(newChangeId);
              debugLog(`adv_change_create: set activeChange to ${newChangeId}`);
            }
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
            const result = JSON.parse(output.output);
            if (result.success && result.task?.status === "done") {
              state.lastCompletedTask = {
                id: result.task.id,
                title: result.task.title,
              };
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

        // Clear TDD phase after test tool completes
        if (
          input.tool === "adv_run_test" ||
          input.tool === "adv_task_evidence"
        ) {
          setFlags({ tddPhase: null });
        }
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
        const providerHint = getProviderBehaviorHint(input.model?.providerID);
        if (providerHint) {
          output.system.push(providerHint);
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
      } catch (e) {
        debugLog(`Session compacting hook error: ${e}`);
      }
    },
  };
};

// Default export for OpenCode
/** @alias */
export default AdvancePlugin;
