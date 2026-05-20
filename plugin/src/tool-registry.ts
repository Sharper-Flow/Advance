/**
 * Tool Registry Helper
 *
 * Provides two helpers for registering tools in index.ts:
 *
 * 1. `registerTool(description, args, execute)` — low-level, explicit
 * 2. `bindTool(toolDef, name, execFn)` — high-level, one-liner per tool
 *
 * Both reduce index.ts boilerplate from ~15-line blocks per tool down to
 * a single line per tool. Arg schemas live in each tool file alongside
 * description and execute, keeping them co-located and readable.
 *
 * P1.12 pinned `pnpm.overrides.zod = "4.3.6"` so the plugin and SDK share one
 * runtime Zod instance. The `as any` cast at the SDK boundary remains required
 * because the typed `tool()` signature expects the SDK's own Zod import
 * identity — a single structural cast, not a version bridge.
 */

import { tool, type ToolContext, type ToolResult } from "@opencode-ai/plugin";
import { z } from "zod";
import { safeExecute, safeExecuteSimple } from "./utils/safe-execute";
import { formatToolArgPreflightError } from "./utils/tool-arg-preflight";
import { formatAdvToolTitle } from "./utils/tool-title";
import type { Store } from "./storage/store-types";

import { specTools } from "./tools/spec";
import { roadmapTools } from "./tools/roadmap";
import { backlogTools } from "./tools/backlog";
import { changeTools } from "./tools/change";
import { taskTools } from "./tools/task";
import { wisdomTools } from "./tools/wisdom";
import { statusTools } from "./tools/status";
import { agendaTools } from "./tools/agenda";
import { projectTools } from "./tools/project";
import { gateTools } from "./tools/gate";
import { testTools } from "./tools/test";
import { investmentTools } from "./tools/investment";
import { temporalOpsTools } from "./tools/temporal-ops";
import { checkpointTools } from "./tools/checkpoint";
import { reflectionTools } from "./tools/reflection";
import { snapshotHealthTools } from "./tools/snapshot";
import { projectMetadataTools } from "./tools/project-metadata";
import { conformanceTools } from "./tools/conformance";
import { advWorktreeTools } from "./tools/adv-worktree";
import { advSessionTools } from "./tools/adv-session";
type ToolArgsSchema = Record<string, z.ZodTypeAny>;
type ToolExecute<TArgs> = (
  args: TArgs,
  contextOrExtra?: unknown,
) => Promise<ToolResult>;

/** Low-level helper: explicit description, args, and pre-wrapped execute. */
export function registerTool(
  description: string,
  args: ToolArgsSchema,
  execute: ToolExecute<unknown>,
) {
  // Structural cast at the SDK boundary: tool files import Zod directly
  // (via `import { z } from "zod"`) while the SDK's `tool()` signature
  // expects its own Zod import. With `pnpm.overrides.zod` pinning a
  // single instance this is now a pure type identity bridge — no runtime
  // difference — but the cast is still required because TypeScript treats
  // the two imports as nominal types even when they resolve to the same
  // module on disk.
  //
  // rq-zodParseValidation01: Add runtime z.parse() validation at the
  // boundary during tests. The SDK and plugin each use their own Zod import
  // identity. Even though pnpm.overrides pins a single zod@4.3.6 runtime
  // instance, TypeScript treats them as nominal types so the `as any` cast
  // is required. This guard validates that every value in `args` is actually
  // a ZodType — catching schemas that were accidentally defined with
  // undefined/null/non-Zod values that would silently fail at runtime when
  // the SDK tries to parse incoming tool arguments.
  //
  // The validation does NOT validate against the SDK's Zod instance
  // (unavailable here); it validates that the plugin's own schemas are
  // well-formed Zod types. Malformed schemas are caught in CI, not
  // silently accepted. Validation is test-only to avoid production
  // overhead.
  if (process.env.NODE_ENV === "test") {
    for (const [key, schema] of Object.entries(args)) {
      if (!schema || typeof schema.safeParse !== "function") {
        throw new Error(
          `[rq-zodParseValidation01] Tool args["${key}"] is not a Zod type — check the tool definition in the tools/ file. Received: ${typeof schema}`,
        );
      }
    }
  }
  const executeWithPreflight: ToolExecute<unknown> = async (
    rawArgs,
    contextOrExtra,
  ) => {
    const toolName = (execute as { __advToolName?: string }).__advToolName;
    const display = toolName
      ? formatAdvToolTitle(toolName, rawArgs)
      : undefined;
    if (display && isToolContext(contextOrExtra)) {
      try {
        contextOrExtra.metadata({
          title: display.title,
          metadata: display.metadata,
        });
      } catch {
        // Display metadata is best-effort and must never affect tool behavior.
      }
    }

    const wrapResult = (result: ToolResult): ToolResult => {
      if (!display) return result;
      if (typeof result === "string") {
        return {
          title: display.title,
          output: result,
          metadata: display.metadata,
        };
      }
      const existingMetadata = result.metadata ?? {};
      const existingAdv =
        existingMetadata.adv && typeof existingMetadata.adv === "object"
          ? (existingMetadata.adv as Record<string, unknown>)
          : {};
      return {
        ...result,
        title: display.title,
        metadata: {
          ...existingMetadata,
          adv: { ...existingAdv, ...display.metadata.adv },
        },
      };
    };

    if (toolName) {
      const validationError = formatToolArgPreflightError(
        toolName,
        args,
        rawArgs,
      );
      if (validationError) return wrapResult(validationError);
    }
    return wrapResult(await execute(rawArgs, contextOrExtra));
  };

  return tool({
    description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: args as any,
    execute: executeWithPreflight,
  });
}

function isToolContext(value: unknown): value is ToolContext {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as ToolContext).metadata === "function"
  );
}

function getToolContextSessionID(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const sessionID = (value as { sessionID?: unknown }).sessionID;
  return typeof sessionID === "string" && sessionID.length > 0
    ? sessionID
    : undefined;
}

function namedExecute<TArgs>(
  name: string,
  execute: ToolExecute<TArgs>,
): ToolExecute<TArgs> {
  (execute as { __advToolName?: string }).__advToolName = name;
  return execute;
}

/** Tool definition shape expected by bindTool / bindToolSimple. */
interface ToolDef<TArgs, TStore> {
  description: string;
  args: ToolArgsSchema;
  execute: (args: TArgs, store: TStore) => Promise<string>;
}

/** Tool definition shape for agenda-style tools (directory + optional path). */
interface ToolDefSimple<TArgs> {
  description: string;
  args: ToolArgsSchema;
  execute: (args: TArgs, dir: string, path?: string) => Promise<string>;
}

/**
 * Bind a store-based tool definition to a store instance.
 * Usage: `adv_spec: bindTool(specTools.adv_spec, "adv_spec", store)`
 */
function bindTool<TArgs, TStore>(
  def: ToolDef<TArgs, TStore>,
  name: string,
  store: TStore,
) {
  return registerTool(
    def.description,
    def.args,
    namedExecute(
      name,
      safeExecute(async (args) => def.execute(args as TArgs, store), name),
    ),
  );
}

/**
 * Bind an agenda-style tool definition to a directory + optional path.
 * Usage: `adv_agenda_list: bindToolSimple(agendaTools.adv_agenda_list, "adv_agenda_list", directory, store.paths.agenda)`
 */
function bindToolSimple<TArgs>(
  def: ToolDefSimple<TArgs>,
  name: string,
  dir: string,
  path?: string,
) {
  // Wrap with safeExecuteSimple but pass `dir` as the inner `extra` and
  // surface `path` via the third "extraPath" slot so enrichment can
  // include it in error responses.
  const wrapped = safeExecuteSimple(
    async (args) => def.execute(args as TArgs, dir, path),
    name,
  );
  return registerTool(
    def.description,
    def.args,
    namedExecute(name, async (args: unknown) => wrapped(args, dir, path)),
  );
}

/**
 * Build the complete tool map for the ADV plugin.
 *
 * Encapsulates all 36+ tool registrations so index.ts stays under 500 lines.
 * Uses bindTool for store-based tools and bindToolSimple for agenda tools.
 * Special cases (type coercion, extra args) use registerTool directly.
 */
export function createToolMap(
  store: Store,
  directory: string,
  agendaPath: string | undefined,
  serverUrl?: URL,
) {
  return {
    // Spec Tools
    adv_spec: bindTool(specTools.adv_spec, "adv_spec", store),

    // Roadmap Tool (legacy — delegates internally to adv_backlog_state via
    // Visibility query when Temporal reachable; kept for backward compat)
    adv_roadmap: bindTool(roadmapTools.adv_roadmap, "adv_roadmap", store),

    // Backlog Coordination Tools (rq-backlogCoord01..07)
    adv_backlog_state: bindTool(
      backlogTools.adv_backlog_state,
      "adv_backlog_state",
      store,
    ),
    adv_wip_state: bindTool(backlogTools.adv_wip_state, "adv_wip_state", store),

    // Change Tools
    adv_change_list: bindTool(
      changeTools.adv_change_list,
      "adv_change_list",
      store,
    ),
    adv_change_show: bindTool(
      changeTools.adv_change_show,
      "adv_change_show",
      store,
    ),
    adv_change_create: bindTool(
      changeTools.adv_change_create,
      "adv_change_create",
      store,
    ),
    adv_change_update: bindTool(
      changeTools.adv_change_update,
      "adv_change_update",
      store,
    ),
    adv_change_close: bindTool(
      changeTools.adv_change_close,
      "adv_change_close",
      store,
    ),
    adv_change_bulk_close: bindTool(
      changeTools.adv_change_bulk_close,
      "adv_change_bulk_close",
      store,
    ),
    adv_change_validate: bindTool(
      changeTools.adv_change_validate,
      "adv_change_validate",
      store,
    ),
    adv_change_archive: bindTool(
      changeTools.adv_change_archive,
      "adv_change_archive",
      store,
    ),
    adv_change_update_issues: bindTool(
      changeTools.adv_change_update_issues,
      "adv_change_update_issues",
      store,
    ),
    adv_change_reenter: bindTool(
      changeTools.adv_change_reenter,
      "adv_change_reenter",
      store,
    ),

    // Task Tools
    adv_task_show: bindTool(taskTools.adv_task_show, "adv_task_show", store),
    adv_task_list: bindTool(taskTools.adv_task_list, "adv_task_list", store),
    adv_task_ready: bindTool(taskTools.adv_task_ready, "adv_task_ready", store),
    adv_task_update: bindTool(
      taskTools.adv_task_update,
      "adv_task_update",
      store,
    ),
    adv_task_add: bindTool(taskTools.adv_task_add, "adv_task_add", store),

    // Task cancel — needs Record<string,string> type coercion
    adv_task_cancel: registerTool(
      taskTools.adv_task_cancel.description,
      taskTools.adv_task_cancel.args,
      namedExecute(
        "adv_task_cancel",
        safeExecute(
          async (args) =>
            taskTools.adv_task_cancel.execute(
              {
                ...(args as Record<string, unknown>),
                reasons: (args as Record<string, unknown>).reasons as Record<
                  string,
                  string
                >,
                supersededBy: (args as Record<string, unknown>).supersededBy as
                  | Record<string, string>
                  | undefined,
              } as Parameters<typeof taskTools.adv_task_cancel.execute>[0],
              store,
            ),
          "adv_task_cancel",
        ),
      ),
    ),

    // Task reclassify TDD — needs literal/union type coercion
    adv_task_reclassify_tdd: registerTool(
      taskTools.adv_task_reclassify_tdd.description,
      taskTools.adv_task_reclassify_tdd.args,
      namedExecute(
        "adv_task_reclassify_tdd",
        safeExecute(
          async (args) =>
            taskTools.adv_task_reclassify_tdd.execute(
              {
                ...(args as Record<string, unknown>),
                toIntent: (args as Record<string, unknown>).toIntent as
                  | "inline"
                  | "separate_verification"
                  | "not_applicable",
                approvedByUser: (args as Record<string, unknown>)
                  .approvedByUser as true,
              } as Parameters<
                typeof taskTools.adv_task_reclassify_tdd.execute
              >[0],
              store,
            ),
          "adv_task_reclassify_tdd",
        ),
      ),
    ),

    // Wisdom Tools
    adv_wisdom_add: bindTool(
      wisdomTools.adv_wisdom_add,
      "adv_wisdom_add",
      store,
    ),
    adv_wisdom_list: bindTool(
      wisdomTools.adv_wisdom_list,
      "adv_wisdom_list",
      store,
    ),
    adv_project_wisdom_list: bindTool(
      wisdomTools.adv_project_wisdom_list,
      "adv_project_wisdom_list",
      store,
    ),

    // Status Tool
    adv_status: bindTool(statusTools.adv_status, "adv_status", store),

    // Snapshot Health Tool
    adv_snapshot_health: bindTool(
      snapshotHealthTools.adv_snapshot_health,
      "adv_snapshot_health",
      store,
    ),

    // Investment Tools
    adv_investment_report: bindTool(
      investmentTools.adv_investment_report,
      "adv_investment_report",
      store,
    ),

    // Agenda Tools
    adv_agenda_list: bindToolSimple(
      agendaTools.adv_agenda_list,
      "adv_agenda_list",
      directory,
      agendaPath,
    ),
    adv_agenda_add: bindToolSimple(
      agendaTools.adv_agenda_add,
      "adv_agenda_add",
      directory,
      agendaPath,
    ),
    adv_agenda_start: bindToolSimple(
      agendaTools.adv_agenda_start,
      "adv_agenda_start",
      directory,
      agendaPath,
    ),
    adv_agenda_complete: bindToolSimple(
      agendaTools.adv_agenda_complete,
      "adv_agenda_complete",
      directory,
      agendaPath,
    ),
    adv_agenda_cancel: bindToolSimple(
      agendaTools.adv_agenda_cancel,
      "adv_agenda_cancel",
      directory,
      agendaPath,
    ),
    adv_agenda_prioritize: bindToolSimple(
      agendaTools.adv_agenda_prioritize,
      "adv_agenda_prioritize",
      directory,
      agendaPath,
    ),

    // Project Metadata Tool
    adv_project_metadata: bindTool(
      projectMetadataTools.adv_project_metadata,
      "adv_project_metadata",
      store,
    ),

    // Project Tools
    adv_project_context: bindTool(
      projectTools.adv_project_context,
      "adv_project_context",
      store,
    ),

    // Temporal operator tools
    adv_temporal_diagnose: bindTool(
      temporalOpsTools.adv_temporal_diagnose,
      "adv_temporal_diagnose",
      store,
    ),
    adv_temporal_register_search_attributes: bindTool(
      temporalOpsTools.adv_temporal_register_search_attributes,
      "adv_temporal_register_search_attributes",
      store,
    ),
    adv_temporal_reconnect: bindTool(
      temporalOpsTools.adv_temporal_reconnect,
      "adv_temporal_reconnect",
      store,
    ),
    // adv_temporal_worker_restart — rq-toolTimeoutOverride01.2.
    // Inner verified recovery waits up to 10s for queue serviceability;
    // 15s outer budget gives modest wrapper headroom while preserving a
    // bounded failure envelope instead of fire-and-forget ambiguity.
    adv_temporal_worker_restart: registerTool(
      // rq-toolTimeoutOverride01.2: inner verification budget is 10s.
      temporalOpsTools.adv_temporal_worker_restart.description,
      temporalOpsTools.adv_temporal_worker_restart.args,
      namedExecute(
        "adv_temporal_worker_restart",
        safeExecute(
          async (args) =>
            temporalOpsTools.adv_temporal_worker_restart.execute(
              args as Parameters<
                typeof temporalOpsTools.adv_temporal_worker_restart.execute
              >[0],
              store,
            ),
          "adv_temporal_worker_restart",
          undefined,
          { timeoutMs: 15_000 },
        ),
      ),
    ),

    // Gate Tools
    adv_gate_status: bindTool(
      gateTools.adv_gate_status,
      "adv_gate_status",
      store,
    ),
    adv_gate_complete: registerTool(
      gateTools.adv_gate_complete.description,
      gateTools.adv_gate_complete.args,
      namedExecute(
        "adv_gate_complete",
        safeExecute(
          async (args) =>
            gateTools.adv_gate_complete.execute(
              args as Parameters<typeof gateTools.adv_gate_complete.execute>[0],
              store,
            ),
          "adv_gate_complete",
        ),
      ),
    ),

    // Test Tools — adv_run_test takes (args, store, directory)
    //
    // Outer safety-net timeout must exceed the inner subprocess budget.
    // The inner subprocess accepts timeoutMs up to the schema max (300_000
    // in test.ts). The outer safety-net must accommodate any valid inner
    // timeout plus bookkeeping headroom (evidence recording, workflow Update).
    // 305s = 300s schema max + 5s bookkeeping. The inner subprocess timeout
    // remains the authoritative wall-clock bound; the outer net catches
    // genuine hangs (infinite loops, stuck SDK calls) beyond the inner limit.
    adv_run_test: registerTool(
      testTools.adv_run_test.description,
      testTools.adv_run_test.args,
      namedExecute(
        "adv_run_test",
        safeExecute(
          async (args) =>
            testTools.adv_run_test.execute(
              args as Parameters<typeof testTools.adv_run_test.execute>[0],
              store,
              directory,
            ),
          "adv_run_test",
          undefined,
          { timeoutMs: 305_000 },
        ),
      ),
    ),

    // Checkpoint Tool — adv_task_checkpoint takes (args, store, directory)
    //
    // Outer safety-net timeout must exceed the inner git subprocess budget
    // (DEFAULT_TIMEOUT_MS = 30s in checkpoint.ts) so the subprocess is the
    // authoritative timeout source. Pre-commit hook chains in large repos
    // routinely run 15-25s, leaving little headroom under the default 10s.
    adv_task_checkpoint: registerTool(
      checkpointTools.adv_task_checkpoint.description,
      checkpointTools.adv_task_checkpoint.args,
      namedExecute(
        "adv_task_checkpoint",
        safeExecute(
          async (args) =>
            checkpointTools.adv_task_checkpoint.execute(
              args as Parameters<
                typeof checkpointTools.adv_task_checkpoint.execute
              >[0],
              store,
              directory,
            ),
          "adv_task_checkpoint",
          undefined,
          { timeoutMs: 35_000 },
        ),
      ),
    ),

    // Reflection Tool
    adv_reflect: bindTool(reflectionTools.adv_reflect, "adv_reflect", store),

    // Conformance Tool — adv_conformance takes (args, store).
    // Switched from bindToolSimple to bindTool in change
    // centralizemutationcacherefresh (T02) so the dispatcher can use
    // fireSignalAndRefresh (rq-cacheRefresh01) when firing conformance
    // signals to change workflows. projectDir and externalRoot are
    // derived inside the execute function from store.paths.{root,external}.
    adv_conformance: bindTool(
      conformanceTools.adv_conformance,
      "adv_conformance",
      store,
    ),

    // Worktree Tools
    adv_worktree_create: registerTool(
      advWorktreeTools.adv_worktree_create.description,
      advWorktreeTools.adv_worktree_create.args,
      namedExecute(
        "adv_worktree_create",
        safeExecute(
          async (args, context) =>
            advWorktreeTools.adv_worktree_create.execute(
              args as Parameters<
                typeof advWorktreeTools.adv_worktree_create.execute
              >[0],
              store,
              { serverUrl, sessionID: getToolContextSessionID(context) },
            ),
          "adv_worktree_create",
        ),
      ),
    ),
    adv_worktree_resume: bindTool(
      advWorktreeTools.adv_worktree_resume,
      "adv_worktree_resume",
      store,
    ),
    adv_worktree_delete: registerTool(
      advWorktreeTools.adv_worktree_delete.description,
      advWorktreeTools.adv_worktree_delete.args,
      namedExecute(
        "adv_worktree_delete",
        safeExecute(
          async (args) =>
            advWorktreeTools.adv_worktree_delete.execute(
              args as Parameters<
                typeof advWorktreeTools.adv_worktree_delete.execute
              >[0],
              store,
              { serverUrl },
            ),
          "adv_worktree_delete",
        ),
      ),
    ),
    adv_worktree_cleanup: bindTool(
      advWorktreeTools.adv_worktree_cleanup,
      "adv_worktree_cleanup",
      store,
    ),
    adv_worktree_triage: bindTool(
      advWorktreeTools.adv_worktree_triage,
      "adv_worktree_triage",
      store,
    ),

    // Backward-compat aliases for standalone worktree plugin (KD-8 phase 2)
    // These share the same implementation as adv_worktree_* but are registered
    // under the old standalone names. Will be removed in a future change once
    // standalone-plugin users have migrated.
    worktree_create: registerTool(
      "Alias → adv_worktree_create (backward compat). Will be removed in a future change once standalone-plugin users have migrated.",
      advWorktreeTools.adv_worktree_create.args,
      namedExecute(
        "worktree_create",
        safeExecute(
          async (args, context) =>
            advWorktreeTools.adv_worktree_create.execute(
              args as Parameters<
                typeof advWorktreeTools.adv_worktree_create.execute
              >[0],
              store,
              { serverUrl, sessionID: getToolContextSessionID(context) },
            ),
          "worktree_create",
        ),
      ),
    ),
    worktree_delete: registerTool(
      "Alias → adv_worktree_delete (backward compat).",
      advWorktreeTools.adv_worktree_delete.args,
      namedExecute(
        "worktree_delete",
        safeExecute(
          async (args) =>
            advWorktreeTools.adv_worktree_delete.execute(
              args as Parameters<
                typeof advWorktreeTools.adv_worktree_delete.execute
              >[0],
              store,
              { serverUrl },
            ),
          "worktree_delete",
        ),
      ),
    ),
    worktree_cleanup: registerTool(
      "Alias → adv_worktree_cleanup (backward compat).",
      advWorktreeTools.adv_worktree_cleanup.args,
      namedExecute(
        "worktree_cleanup",
        safeExecute(
          async (args) =>
            advWorktreeTools.adv_worktree_cleanup.execute(
              args as Parameters<
                typeof advWorktreeTools.adv_worktree_cleanup.execute
              >[0],
              store,
            ),
          "worktree_cleanup",
        ),
      ),
    ),

    // Session Tools
    adv_session_list: bindTool(
      advSessionTools.adv_session_list,
      "adv_session_list",
      store,
    ),
    adv_session_show: bindTool(
      advSessionTools.adv_session_show,
      "adv_session_show",
      store,
    ),
  };
}

/**
 * Canonical list of all ADV tool names. Kept in sync with createToolMap so
 * that createDegradedToolMap can register a stub for every tool when plugin
 * init fails.
 */
export const ADV_TOOL_NAMES: readonly string[] = [
  "adv_spec",
  "adv_roadmap",
  "adv_backlog_state",
  "adv_wip_state",
  "adv_change_list",
  "adv_change_show",
  "adv_change_create",
  "adv_change_update",
  "adv_change_close",
  "adv_change_bulk_close",
  "adv_change_validate",
  "adv_change_archive",
  "adv_change_update_issues",
  "adv_change_reenter",
  "adv_task_show",
  "adv_task_list",
  "adv_task_ready",
  "adv_task_update",
  "adv_task_add",
  "adv_task_cancel",
  "adv_task_reclassify_tdd",
  "adv_wisdom_add",
  "adv_wisdom_list",
  "adv_project_wisdom_list",
  "adv_status",
  "adv_investment_report",
  "adv_agenda_list",
  "adv_agenda_add",
  "adv_agenda_start",
  "adv_agenda_complete",
  "adv_agenda_cancel",
  "adv_agenda_prioritize",
  "adv_project_context",
  "adv_project_metadata",
  "adv_gate_status",
  "adv_gate_complete",
  "adv_run_test",
  "adv_temporal_diagnose",
  "adv_temporal_register_search_attributes",
  "adv_temporal_reconnect",
  "adv_temporal_worker_restart",
  "adv_task_checkpoint",
  "adv_reflect",
  "adv_conformance",
  "adv_worktree_create",
  "adv_worktree_resume",
  "adv_worktree_delete",
  "adv_worktree_cleanup",
  "adv_worktree_triage",
  "adv_session_list",
  "adv_session_show",
  "adv_snapshot_health",
  // Backward-compat aliases (KD-8 phase 2)
  "worktree_create",
  "worktree_delete",
  "worktree_cleanup",
] as const;

/**
 * Build a degraded tool map for the case where plugin init fails
 * (createStore/store.init throws). Every adv_* tool is registered as a stub
 * that returns a structured ADV_PLUGIN_INIT_FAILED payload so agents
 * discover the real cause through any tool call rather than seeing the
 * tools silently disappear from the session.
 *
 * Keeps parity with createToolMap's tool names via ADV_TOOL_NAMES.
 */
export function createDegradedToolMap(
  initError: Error,
  directory: string,
): Record<string, ReturnType<typeof registerTool>> {
  const payload = JSON.stringify(
    {
      status: "ADV_PLUGIN_INIT_FAILED",
      message:
        "ADV plugin failed to initialize. Every adv_* tool is stubbed until the underlying issue is resolved. Restart the OpenCode session after applying a fix.",
      error: initError.message,
      directory,
      remediation: [
        "Run `pnpm --filter @sharperflow/advance build` from the repo root (or `pnpm build` in plugin/) to ensure plugin/dist/ is current",
        "Check ~/.config/opencode/opencode.json — the .plugin array must point to the built plugin directory",
        "If project.json is present, verify it is valid JSON and matches the ADV ProjectConfig schema",
        "Check the ADV external state dir (~/.local/share/opencode/plugins/advance/{project-id}/) for malformed change/spec JSON; repair the artifact, then restart OpenCode",
        "Set ADV_DEBUG=1 in your shell and restart OpenCode to capture init errors in $OPEN_CHAD_CACHE_DIR/adv-debug.log",
      ],
    },
    null,
    2,
  );

  const stubExecute = async (_args: unknown): Promise<string> => payload;

  const map: Record<string, ReturnType<typeof registerTool>> = {};
  for (const name of ADV_TOOL_NAMES) {
    map[name] = registerTool(
      `[ADV plugin init failed — ${name} stub] ${initError.message.slice(0, 160)}`,
      {} as ToolArgsSchema,
      namedExecute(name, stubExecute),
    );
  }
  return map;
}
