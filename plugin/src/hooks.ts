/**
 * Plugin Hook Implementations
 *
 * Event, tool.execute.before/after, and experimental hooks extracted from
 * index.ts to keep the plugin entry point under 500 lines.
 *
 * All hooks are created via createHooks() which closes over the shared plugin
 * state and dependencies injected from index.ts.
 */

import type { Store } from "./storage/store";
import {
  cleanup as cleanupTerminal,
  setActiveChange,
  pruneStaleRetries,
} from "./events";
import { enforceBashPolicy } from "./guards/bash";
import { enforceTaskPolicy } from "./guards/task";
import { appendDebugLog } from "./utils/debug-log";

// =============================================================================
// Types (mirrored from index.ts — keep in sync)
// =============================================================================

export interface StatusFlags {
  sessionIdle: boolean;
  activeSubAgents: number;
  permissionPending: boolean;
  tddPhase: "TDD_RED" | "TDD_GREEN" | null;
}

export interface PluginState extends StatusFlags {
  activeChange: {
    id: string | null;
    objective: string | null;
  };
  lastCompletedTask: {
    id: string;
    title: string;
  } | null;
  isWorktree: boolean;
}

// =============================================================================
// Hook Factory
// =============================================================================

export interface HookDeps {
  state: PluginState;
  store: Store;
  setFlags: (updates: Partial<StatusFlags>) => void;
  removeProcessListeners: () => void;
}

const debugLog = (msg: string): void => appendDebugLog("hooks", msg);

const PROVIDER_BEHAVIOR_HINTS: Readonly<Record<string, string>> = {
  openai:
    "[ADV:PROVIDER_HINT] Provider adaptation: prefer explicit numbered steps, use structured formats (tables, numbered lists) for multi-part output, and batch independent tool calls in a single response.",
  "zai-coding-plan":
    "[ADV:PROVIDER_HINT] Provider adaptation: prefer direct explicit instructions, briefly restate the task before acting, and treat absolute constraints like NEVER/ONLY/MUST as binding.",
};

const getProviderBehaviorHint = (providerID?: string): string | null => {
  if (!providerID) return null;
  return PROVIDER_BEHAVIOR_HINTS[providerID.toLowerCase()] ?? null;
};

export function createHooks(deps: HookDeps) {
  const { state, store, setFlags, removeProcessListeners } = deps;

  // ========================================================================
  // Event Hook
  // ========================================================================
  const event = async ({
    event,
  }: {
    event: { type: string; properties?: unknown };
  }): Promise<void> => {
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
          store.close();
          debugLog("Store closed on session.deleted");
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
  };

  // ========================================================================
  // Tool Execute Before Hook
  // ========================================================================
  const toolExecuteBefore = async (
    input: { tool: string },
    output: { args: unknown },
  ): Promise<void> => {
    try {
      debugLog(`tool.execute.before: tool="${input.tool}"`);
      const args = output.args as Record<string, unknown>;

      if (input.tool === "bash") {
        const extInput = input as Record<string, unknown>;
        const agent =
          typeof extInput["agent"] === "string" ? extInput["agent"] : "unknown";
        const command =
          typeof args["command"] === "string" ? args["command"] : "";
        enforceBashPolicy(agent, command);
      }

      if (args["changeId"]) {
        state.activeChange.id = String(args["changeId"]);
        setActiveChange(state.activeChange.id);
      }

      if (input.tool === "task") {
        enforceTaskPolicy(state.activeSubAgents);
        debugLog(`Sub-agent spawned: count=${state.activeSubAgents + 1}`);
        setFlags({
          activeSubAgents: state.activeSubAgents + 1,
          sessionIdle: false,
        });
      }

      if (input.tool === "question") {
        setFlags({ permissionPending: true, sessionIdle: false });
      }

      if (input.tool === "adv_run_test" || input.tool === "adv_task_evidence") {
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
  };

  // ========================================================================
  // Tool Execute After Hook
  // ========================================================================
  const toolExecuteAfter = async (
    input: { tool: string },
    output: { output?: string },
  ): Promise<void> => {
    try {
      debugLog(`tool.execute.after: tool="${input.tool}"`);

      if (input.tool === "adv_change_create" && output.output) {
        try {
          const rawOutput = output.output.trim();
          const separatorIndex = rawOutput.lastIndexOf("\n\n");
          const postBanner =
            separatorIndex >= 0
              ? rawOutput.slice(separatorIndex + 2).trim()
              : null;
          const parseCandidates = [postBanner, rawOutput].filter(
            (c): c is string => !!c,
          );

          for (const candidate of parseCandidates) {
            try {
              const result = JSON.parse(candidate);
              const newChangeId = result.changeId ?? result.data?.changeId;
              if (newChangeId && typeof newChangeId === "string") {
                state.activeChange.id = newChangeId;
                setActiveChange(newChangeId);
                debugLog(
                  `adv_change_create: set activeChange to ${newChangeId}`,
                );
                break;
              }
            } catch {
              // try next candidate
            }
          }
        } catch {
          // ignore parse errors
        }
      }

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

      if (input.tool === "task") {
        const newCount = Math.max(0, state.activeSubAgents - 1);
        debugLog(`Sub-agent completed: count=${newCount}`);
        setFlags({ activeSubAgents: newCount, permissionPending: false });
      }

      if (input.tool === "question") {
        setFlags({ permissionPending: false });
      }

      if (input.tool === "adv_run_test" || input.tool === "adv_task_evidence") {
        setFlags({ tddPhase: null });
      }
    } catch (e) {
      debugLog(`tool.execute.after error: ${e}`);
    }
  };

  // ========================================================================
  // Context Injection Hook
  // ========================================================================
  const chatSystemTransform = async (
    input: { model?: { providerID?: string } },
    output: { system: string[] },
  ): Promise<void> => {
    try {
      const providerHint = getProviderBehaviorHint(input.model?.providerID);
      if (providerHint) {
        output.system.push(providerHint);
      }

      if (state.isWorktree && state.activeChange.id) {
        output.system.push(
          `[ADV:WORKTREE_SESSION] You are working in a git worktree. ` +
            `Active change: ${state.activeChange.id}. ` +
            `All ADV state (changes, tasks, wisdom) is shared via external storage. ` +
            `Use adv_change_show and adv_task_ready to pick up where the parent session left off.`,
        );
      }

      if (!state.activeChange.id) return;

      if (state.lastCompletedTask) {
        output.system.push(
          `[ADV:RECORD_WISDOM] You just completed task "${state.lastCompletedTask.title}" (${state.lastCompletedTask.id}). If you learned anything (gotchas, patterns, successes), please record it using 'adv_wisdom_add'.`,
        );
        state.lastCompletedTask = null;
      }
    } catch (e) {
      debugLog(`experimental.chat.system.transform error: ${e}`);
    }
  };

  // ========================================================================
  // Session Compaction Hook
  // ========================================================================
  const sessionCompacting = async (
    _input: unknown,
    output: { context: string[] },
  ): Promise<void> => {
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
  };

  return {
    event,
    "tool.execute.before": toolExecuteBefore,
    "tool.execute.after": toolExecuteAfter,
    "experimental.chat.system.transform": chatSystemTransform,
    "experimental.session.compacting": sessionCompacting,
  };
}
