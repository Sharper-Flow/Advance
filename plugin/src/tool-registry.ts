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
import { safeExecute } from "./utils/safe-execute";
import {
  formatToolArgPreflightError,
  preflightToolArgs,
} from "./utils/tool-arg-preflight";
import { formatAdvToolTitle } from "./utils/tool-title";
import { formatToolOutput, paginate } from "./utils/tool-output";
import type { Store } from "./storage/store-types";
import type { OpencodeClient } from "./utils/opencode-types";

// Re-export SDK-free catalog types/functions/constants so existing imports
// from tool-registry keep working (KD2 — task tk-9ad1a04909a2).
// The canonical definitions live in ./tool-catalog-entries; tool-registry
// consumes them and layers the SDK-coupled PUBLIC_TOOL_GROUPS data on top.
export {
  type ToolArgsSchema,
  type PublicToolGroup,
  type PublicToolEntry,
  type ToolCatalogItem,
  type ToolInputSchemaResult,
  type ToolRealm,
  type ToolGroup,
  type ToolLifecycleGate,
  type ToolMetadataV1,
  ADV_PUBLIC_TOOL_BASELINE_COUNT,
  REALM_OVERRIDES,
  REALM_PREFIXES,
  GROUP_OVERRIDES,
  LIFECYCLE_BY_REALM,
  REPAIR_LIFECYCLE,
  collectPublicToolEntries,
  renderToolInputSchema,
  deriveToolRealm,
  deriveToolMetadata,
} from "./tool-catalog-entries";
import {
  collectPublicToolEntries,
  renderToolInputSchema,
  getToolSurface as getToolSurfaceFromEntries,
  deriveToolMetadata,
  type ToolArgsSchema,
  type PublicToolGroup,
  type PublicToolEntry,
  type ToolCatalogItem,
  type ToolMetadataV1,
} from "./tool-catalog-entries";

import { specTools } from "./tools/spec";
import { specDeltaTools } from "./tools/spec-delta";
import { backlogTools, WIP_CALLER_TIMEOUT_MS } from "./tools/backlog";
import { backlogShellTools } from "./tools/backlog-shell";
import { changeTools } from "./tools/change";
import { followupTools } from "./tools/followup";
import { reportFollowupTools } from "./tools/report-followup";
import { opsEvidenceTools } from "./tools/ops-evidence";
import { contractTools } from "./tools/contract";
import { designConcernTools } from "./tools/design-concern";
import { verificationEvidenceTools } from "./tools/verification-evidence";
import { taskTools } from "./tools/task";
import { subagentReportTools } from "./tools/subagent-report";
import { wisdomTools } from "./tools/wisdom";
import { statusTools } from "./tools/status";
import { projectTools } from "./tools/project";
import { gateTools } from "./tools/gate";
import { testTools } from "./tools/test";
import { temporalOpsTools } from "./tools/temporal-ops";
import { checkpointTools } from "./tools/checkpoint";
import { formatArchiveTimeoutResult } from "./tools/change/archive-timeout";
import { formatGateCompleteTimeoutResult } from "./tools/gate-timeout";
import { reflectionTools } from "./tools/reflection";
import { snapshotHealthTools } from "./tools/snapshot";
import { projectMetadataTools } from "./tools/project-metadata";
import { conformanceTools } from "./tools/conformance";
import { advWorktreeTools } from "./tools/adv-worktree";
import { advSessionTools } from "./tools/adv-session";
import { epicTools } from "./tools/epic";
import { storeConsolidateTools } from "./tools/store-consolidate";
import { storeCleanupTools } from "./tools/store-cleanup";
import { lightweightProfileTools } from "./tools/lightweight-profile";
import { advInvokeTools } from "./tools/adv-invoke";
type ToolExecute<TArgs> = (
  args: TArgs,
  contextOrExtra?: unknown,
) => Promise<ToolResult>;

/** Low-level helper: explicit description, args, and pre-wrapped execute. */
export function registerTool(
  description: string,
  args: ToolArgsSchema,
  execute: ToolExecute<unknown>,
  transportArgs?: ToolArgsSchema,
) {
  const sdkArgs = transportArgs ?? args;
  if (transportArgs) {
    const canonicalKeys = Object.keys(args).sort();
    const transportKeys = Object.keys(transportArgs).sort();
    if (JSON.stringify(canonicalKeys) !== JSON.stringify(transportKeys)) {
      throw new Error(
        `Tool transport args must have the same top-level keys as canonical args (canonical: ${canonicalKeys.join(", ")}; transport: ${transportKeys.join(", ")}).`,
      );
    }
  }
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
    for (const [key, schema] of Object.entries(sdkArgs)) {
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

    let argsForExecute = rawArgs;
    if (toolName) {
      const preflight = preflightToolArgs(toolName, args, rawArgs);
      const validationError = preflight.ok
        ? undefined
        : formatToolArgPreflightError(toolName, args, rawArgs);
      if (validationError) return wrapResult(validationError);
      argsForExecute = preflight.normalizedArgs;
    }
    return wrapResult(await execute(argsForExecute, contextOrExtra));
  };

  return tool({
    description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: sdkArgs as any,
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

/**
 * Extract the host abort signal from an SDK ToolContext when present.
 *
 * This is a defensive, ABI-safe read: we only use the signal if it is an
 * actual AbortSignal instance. Generic tool wrappers are unchanged; only
 * tools that opt in via their own execute signature receive the signal.
 */
function extractAbortSignal(context: unknown): AbortSignal | undefined {
  if (
    context &&
    typeof context === "object" &&
    "abort" in context &&
    context.abort instanceof AbortSignal
  ) {
    return context.abort as AbortSignal;
  }
  return undefined;
}

function namedExecute<TArgs>(
  name: string,
  execute: ToolExecute<TArgs>,
): ToolExecute<TArgs> {
  (execute as { __advToolName?: string }).__advToolName = name;
  return execute;
}

/** Tool definition shape expected by bindTool. */
interface ToolDef<TArgs, TStore> {
  description: string;
  args: ToolArgsSchema;
  transportArgs?: ToolArgsSchema;
  execute: (args: TArgs, store: TStore) => Promise<string>;
}

/** Tool definition shape for adv_spec, which receives SDK execution context. */
interface ToolDefWithContext<TArgs> {
  description: string;
  args: ToolArgsSchema;
  execute: (
    args: TArgs,
    ctx: { store: Store; worktree?: string; directory?: string },
  ) => Promise<string>;
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
    def.transportArgs,
  );
}

/**
 * Bind adv_spec to a store instance while threading SDK execution context
 * (worktree/directory) so spec reads can resolve the calling worktree's
 * .adv/specs directory.
 *
 * Usage: `adv_spec: bindToolWithContext(specTools.adv_spec, "adv_spec", store)`
 */
function bindToolWithContext<TArgs>(
  def: ToolDefWithContext<TArgs>,
  name: string,
  store: Store,
) {
  return registerTool(
    def.description,
    def.args,
    namedExecute(
      name,
      safeExecute(
        async (args, sdkContext) =>
          def.execute(args as TArgs, {
            store,
            worktree: (sdkContext as { worktree?: string } | undefined)
              ?.worktree,
            directory: (sdkContext as { directory?: string } | undefined)
              ?.directory,
          }),
        name,
      ),
    ),
  );
}

/**
 * Build the complete tool map for the ADV plugin.
 *
 * Encapsulates all 36+ tool registrations so index.ts stays under 500 lines.
 * Uses bindTool for store-based tools. Special cases (type coercion, extra
 * args) use registerTool directly.
 */
export function createToolMap(
  store: Store,
  directory: string,
  serverUrl?: URL,
  client?: OpencodeClient,
) {
  const baseToolMap = {
    // Spec Tools
    adv_spec: bindToolWithContext(specTools.adv_spec, "adv_spec", store),

    // Spec Delta Writer (addSpecDeltaWriter / roadmap #64): append-only
    // add-operation delta under change.deltas[capability]. Archive remains
    // the sole global-spec writer; this tool only mutates the change-owned
    // durable delta record.
    adv_delta_add: bindTool(
      specDeltaTools.adv_delta_add,
      "adv_delta_add",
      store,
    ),
    adv_delta_modify: bindTool(
      specDeltaTools.adv_delta_modify,
      "adv_delta_modify",
      store,
    ),

    // adv_wip_state — fixTriageTimeouts.
    //
    // WIP aggregator reads active changes, cross-change worktree inventory, and
    // peer sessions. The worktree inventory fans out to every change workflow
    // and can exceed the default 10s safety net on large projects, so this is
    // the only interactive read tool with a >10s override.
    //
    // Outer safety net: 60s (WIP_CALLER_TIMEOUT_MS). Inner collector budget:
    // 55s (INVENTORY_INTERNAL_BUDGET_MS), reserving 5s to render a partial
    // response before the outer wrapper fires. If the collector stops early, the
    // tool still returns active_changes and peer_sessions plus a typed
    // degradation warning. The host abort signal is extracted from the SDK
    // ToolContext and forwarded to the collector only on this tool, so a
    // caller cancellation stops new workflow queries without losing sections
    // that have already settled.
    adv_wip_state: registerTool(
      backlogTools.adv_wip_state.description,
      backlogTools.adv_wip_state.args,
      namedExecute(
        "adv_wip_state",
        safeExecute(
          async (args, sdkContext: unknown) => {
            const signal = extractAbortSignal(sdkContext);
            return backlogTools.adv_wip_state.execute(
              args as Record<string, unknown>,
              {
                store,
                signal,
              },
            );
          },
          "adv_wip_state",
          undefined,
          { timeoutMs: WIP_CALLER_TIMEOUT_MS },
        ),
      ),
    ),

    // Backlog Shell Tools
    adv_backlog_add: bindTool(
      backlogShellTools.adv_backlog_add,
      "adv_backlog_add",
      store,
    ),
    adv_backlog_list: bindTool(
      backlogShellTools.adv_backlog_list,
      "adv_backlog_list",
      store,
    ),
    adv_backlog_show: bindTool(
      backlogShellTools.adv_backlog_show,
      "adv_backlog_show",
      store,
    ),
    adv_backlog_promote: bindTool(
      backlogShellTools.adv_backlog_promote,
      "adv_backlog_promote",
      store,
    ),
    adv_backlog_archive: bindTool(
      backlogShellTools.adv_backlog_archive,
      "adv_backlog_archive",
      store,
    ),

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
    // adv_change_archive — fixArchiveTerminalProjection SC3/AC4 +
    // rq-toolTimeoutOverride01. Heavy-tier outer budget: the inner git
    // push alone defaults to 300s (DEFAULT_GIT_PUSH_TIMEOUT_MS in
    // archive-helpers/git-finalize.ts), plus fetch/merge/gh ops at 30s
    // each, release-gate signals, durable-proof queries, worktree
    // cleanup, and issue closure. 420s = 300s push + 120s headroom for
    // the remaining terminal-step work; the inner git budgets remain the
    // authoritative per-op bounds. If the outer net still fires after the
    // bundle write, onToolTimeout returns a typed still-finalizing /
    // re-run-to-reconcile result instead of a bare ToolExecutionTimeout
    // (re-runs are idempotent — rq-archiveOrdering01).
    adv_change_archive: registerTool(
      changeTools.adv_change_archive.description,
      changeTools.adv_change_archive.args,
      namedExecute(
        "adv_change_archive",
        safeExecute(
          async (args) =>
            changeTools.adv_change_archive.execute(
              args as Parameters<
                typeof changeTools.adv_change_archive.execute
              >[0],
              store,
            ),
          "adv_change_archive",
          undefined,
          {
            timeoutMs: 420_000,
            onToolTimeout: (args, error) =>
              formatArchiveTimeoutResult({
                store,
                args: args as {
                  changeId?: unknown;
                  worktreePath?: unknown;
                  target_path?: unknown;
                },
                timeoutMs: error.timeoutMs,
              }),
          },
        ),
      ),
    ),
    adv_archive_repair: bindTool(
      changeTools.adv_archive_repair,
      "adv_archive_repair",
      store,
    ),
    adv_archive_purge: bindTool(
      changeTools.adv_archive_purge,
      "adv_archive_purge",
      store,
    ),
    adv_change_workflow_terminate: bindTool(
      changeTools.adv_change_workflow_terminate,
      "adv_change_workflow_terminate",
      store,
    ),
    adv_change_status_repair: bindTool(
      changeTools.adv_change_status_repair,
      "adv_change_status_repair",
      store,
    ),
    adv_change_update_issues: bindTool(
      changeTools.adv_change_update_issues,
      "adv_change_update_issues",
      store,
    ),
    adv_change_repair_origin: bindTool(
      changeTools.adv_change_repair_origin,
      "adv_change_repair_origin",
      store,
    ),
    adv_change_reenter: bindTool(
      changeTools.adv_change_reenter,
      "adv_change_reenter",
      store,
    ),
    adv_change_forget: bindTool(
      changeTools.adv_change_forget,
      "adv_change_forget",
      store,
    ),

    // Epic Tools
    adv_epic_create: bindTool(
      epicTools.adv_epic_create,
      "adv_epic_create",
      store,
    ),
    adv_epic_show: bindTool(epicTools.adv_epic_show, "adv_epic_show", store),
    adv_epic_list: bindTool(epicTools.adv_epic_list, "adv_epic_list", store),
    adv_epic_update: bindTool(
      epicTools.adv_epic_update,
      "adv_epic_update",
      store,
    ),
    adv_epic_add_shell: bindTool(
      epicTools.adv_epic_add_shell,
      "adv_epic_add_shell",
      store,
    ),
    adv_epic_promote_shell: bindTool(
      epicTools.adv_epic_promote_shell,
      "adv_epic_promote_shell",
      store,
    ),
    adv_epic_link_change: bindTool(
      epicTools.adv_epic_link_change,
      "adv_epic_link_change",
      store,
    ),
    adv_epic_unlink_change: bindTool(
      epicTools.adv_epic_unlink_change,
      "adv_epic_unlink_change",
      store,
    ),
    adv_epic_move_change: bindTool(
      epicTools.adv_epic_move_change,
      "adv_epic_move_change",
      store,
    ),
    adv_epic_repair_membership: bindTool(
      epicTools.adv_epic_repair_membership,
      "adv_epic_repair_membership",
      store,
    ),
    adv_epic_reorder: bindTool(
      epicTools.adv_epic_reorder,
      "adv_epic_reorder",
      store,
    ),
    adv_epic_retire: bindTool(
      epicTools.adv_epic_retire,
      "adv_epic_retire",
      store,
    ),

    // Ops Follow-up Promotion Tool
    adv_followup_promote: bindTool(
      followupTools.adv_followup_promote,
      "adv_followup_promote",
      store,
    ),

    // Report Follow-Up Promotion Tool
    adv_report_followup_promote: bindTool(
      reportFollowupTools.adv_report_followup_promote,
      "adv_report_followup_promote",
      store,
    ),

    // Ops Evidence Append Tool
    adv_ops_evidence_add: bindTool(
      opsEvidenceTools.adv_ops_evidence_add,
      "adv_ops_evidence_add",
      store,
    ),
    adv_ops_run_upsert: bindTool(
      opsEvidenceTools.adv_ops_run_upsert,
      "adv_ops_run_upsert",
      store,
    ),
    adv_ops_run_evidence_add: bindTool(
      opsEvidenceTools.adv_ops_run_evidence_add,
      "adv_ops_run_evidence_add",
      store,
    ),

    // Contract Tools
    adv_contract_mint: bindTool(
      contractTools.adv_contract_mint,
      "adv_contract_mint",
      store,
    ),
    adv_contract_review_matrix_set: bindTool(
      contractTools.adv_contract_review_matrix_set,
      "adv_contract_review_matrix_set",
      store,
    ),
    adv_design_concern_disposition: bindTool(
      designConcernTools.adv_design_concern_disposition,
      "adv_design_concern_disposition",
      store,
    ),
    adv_verification_evidence_disposition: bindTool(
      verificationEvidenceTools.adv_verification_evidence_disposition,
      "adv_verification_evidence_disposition",
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

    // Sub-agent Report Tools
    adv_subagent_report_submit: bindTool(
      subagentReportTools.adv_subagent_report_submit,
      "adv_subagent_report_submit",
      store,
    ),

    // Wisdom Tools — adv_project_wisdom_list was removed by
    // consolidateAdvToolSurface2 (tk-11d902254d63); its project-only listing
    // folded into adv_wisdom_list behind project_only + bounded maxEntries.
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

    // Status Tool
    adv_status: bindTool(statusTools.adv_status, "adv_status", store),

    // Snapshot Health Tool
    adv_snapshot_health: bindTool(
      snapshotHealthTools.adv_snapshot_health,
      "adv_snapshot_health",
      store,
    ),

    // Store Consolidation Tool (scan/dry_run read-only; execute approval-gated)
    adv_store_consolidate: bindTool(
      storeConsolidateTools.adv_store_consolidate,
      "adv_store_consolidate",
      store,
    ),

    // Store Cleanup Tool — legacy Agenda cleanup (scan/dry_run read-only; execute approval-gated)
    adv_store_cleanup: bindTool(
      storeCleanupTools.adv_store_cleanup,
      "adv_store_cleanup",
      store,
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
    // adv_gate_complete — fixTemporalTimeoutsWorker AC1. The gate signal
    // (gateCompletedSignal via fireSignalAndRefresh) is lighter than
    // archive's git finalization, but under worker contention the default
    // 10s safety-net is sometimes exceeded: the signal may have landed
    // while the agent sees a bare ToolExecutionTimeout. 30s covers the
    // Temporal signal + cache-refresh round trip with headroom, and the
    // onToolTimeout classifier returns a typed "may have landed — verify
    // via adv_gate_status" advisory instead of the generic timeout so
    // the caller does not blindly re-fire the signal.
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
          undefined,
          {
            timeoutMs: 30_000,
            onToolTimeout: (args, error) =>
              formatGateCompleteTimeoutResult({
                args: args as { changeId?: unknown; gateId?: unknown },
                timeoutMs: error.timeoutMs,
              }),
          },
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
    adv_reflection_list: bindTool(
      reflectionTools.adv_reflection_list,
      "adv_reflection_list",
      store,
    ),
    adv_reflect: bindTool(reflectionTools.adv_reflect, "adv_reflect", store),

    // Lightweight Change Profile Tool
    adv_lightweight_profile_evaluate: bindTool(
      lightweightProfileTools.adv_lightweight_profile_evaluate,
      "adv_lightweight_profile_evaluate",
      store,
    ),

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
              {
                serverUrl,
                sessionID: getToolContextSessionID(context),
                client,
              },
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
              { serverUrl, client },
            ),
          "adv_worktree_delete",
        ),
      ),
    ),
    adv_worktree_cleanup: registerTool(
      advWorktreeTools.adv_worktree_cleanup.description,
      advWorktreeTools.adv_worktree_cleanup.args,
      namedExecute(
        "adv_worktree_cleanup",
        safeExecute(
          async (args) =>
            advWorktreeTools.adv_worktree_cleanup.execute(
              args as Parameters<
                typeof advWorktreeTools.adv_worktree_cleanup.execute
              >[0],
              store,
              { serverUrl, client },
            ),
          "adv_worktree_cleanup",
        ),
      ),
    ),
    // Triage shares the 55s bounded inventory collector with WIP. Preserve a
    // 5s formatting reserve beneath this 60s outer containment so partial
    // findings and omissions return before safeExecute can become opaque.
    adv_worktree_triage: registerTool(
      advWorktreeTools.adv_worktree_triage.description,
      advWorktreeTools.adv_worktree_triage.args,
      namedExecute(
        "adv_worktree_triage",
        safeExecute(
          async (args, sdkContext: unknown) =>
            advWorktreeTools.adv_worktree_triage.execute(
              args as Parameters<
                typeof advWorktreeTools.adv_worktree_triage.execute
              >[0],
              { store, signal: extractAbortSignal(sdkContext) },
            ),
          "adv_worktree_triage",
          undefined,
          { timeoutMs: WIP_CALLER_TIMEOUT_MS },
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

    // Tool Catalog / Describe (addAdvanceMetadata AC3/C3/C4)
    adv_tool_catalog: bindTool(
      toolCatalogTools.adv_tool_catalog,
      "adv_tool_catalog",
      store,
    ),
    adv_tool_describe: bindTool(
      toolCatalogTools.adv_tool_describe,
      "adv_tool_describe",
      store,
    ),
  };

  // Tool Invoke Facade (addProviderToolSearch AC1-AC4).
  // Dispatches to the same wrapped ToolDefinition.execute used by direct
  // calls, preserving ToolContext, validation, authorization, approvals,
  // recovery restrictions, and timeouts. The outer 10-minute safety net
  // is longer than any current tool timeout (max 420s for adv_change_archive)
  // so inner target timeouts remain authoritative.
  const adv_tool_invoke = registerTool(
    advInvokeTools.adv_tool_invoke.description,
    advInvokeTools.adv_tool_invoke.args,
    namedExecute(
      "adv_tool_invoke",
      safeExecute(
        async (args, sdkContext) =>
          advInvokeTools.adv_tool_invoke.execute(
            args as { name: string; args: Record<string, unknown> },
            (
              name,
            ): import("./tools/adv-invoke").ToolLookupResult | undefined => {
              const entry = PUBLIC_TOOL_ENTRIES.find((e) => e.name === name);
              const def = (
                baseToolMap as Record<
                  string,
                  import("@opencode-ai/plugin").ToolDefinition
                >
              )[name];
              if (!entry || !def) return undefined;
              return { definition: def, rawArgs: entry.args };
            },
            sdkContext,
          ),
        "adv_tool_invoke",
        undefined,
        { timeoutMs: 600_000 },
      ),
    ),
  );

  return {
    ...baseToolMap,
    adv_tool_invoke,
  };
}

/**
 * Typed inventory of retained public tool groups
 * (consolidateAdvToolSurface2 — SC1/SC2/AC5/C5, DDC1/DDC2/DDC3).
 *
 * This readonly, type-checked inventory is the single source of truth for the
 * public ADV tool surface. Canonical names (ADV_TOOL_NAMES) and the
 * warrant-visible argument surface (getToolSurface) are BOTH derived from it,
 * so discovery metadata can no longer drift from the exported `*Tools`
 * groups. `createToolMap` above stays explicit — runtime registration
 * preserves special bind, timeout, and context behavior — and deterministic
 * parity tests (tool-registry.inventory.test.ts) fail if the explicit map,
 * the degraded map, or the warrant surface diverges from this inventory.
 *
 * The inventory includes the backlog-shell, store-consolidation, and
 * store-cleanup groups so warrant visibility matches registration (the
 * pre-consolidation surface omitted them).
 */

/**
 * Read-only catalog and describe tools for the canonical ADV tool surface.
 * They project the existing definition inventory and metadata; they never
 * execute a handler or grant access (C1/DONT1/DONT2/DONT3).
 */
export const toolCatalogTools = {
  adv_tool_catalog: {
    description:
      "Bounded read-only catalog of all canonical ADV tools. Returns each tool's name, description, argument keys, and visibility metadata (realm, group, lifecycle gates, risk, recovery-only). Restriction labels are descriptive only and do not grant access.",
    args: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Maximum number of catalog entries to return (1-100, default 50)",
        ),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Offset for pagination (default: 0)"),
    },
    execute: async (
      args: { limit?: number; offset?: number },
      _store: unknown,
    ): Promise<string> => {
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;
      const sortedEntries = [...PUBLIC_TOOL_ENTRIES].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const items: ToolCatalogItem[] = sortedEntries.map((entry) => {
        const meta = ADV_TOOL_METADATA[entry.name];
        if (!meta) {
          throw new Error(
            `Metadata parity mismatch: ${entry.name} has no ADV_TOOL_METADATA entry`,
          );
        }
        return {
          name: entry.name,
          description: entry.description,
          argKeys: Object.keys(entry.args),
          visibility: meta,
        };
      });
      const paged = paginate(items, {
        limit,
        offset,
        tool: "adv_tool_catalog",
      });
      return formatToolOutput(
        {
          items: paged.items,
          pagination: paged.pagination,
        },
        { maxChars: 100000 },
      );
    },
  },

  adv_tool_describe: {
    description:
      "Describe a single canonical ADV tool by exact name. Returns metadata, argument keys, and a JSON Schema representation of the tool's input arguments. Does not execute the tool or grant access.",
    args: {
      name: z
        .string()
        .min(1)
        .describe("Exact canonical ADV tool name (e.g. adv_change_show)"),
    },
    execute: async (
      args: { name: string },
      _store: unknown,
    ): Promise<string> => {
      const entry = PUBLIC_TOOL_ENTRIES.find((e) => e.name === args.name);
      if (!entry) {
        return formatToolOutput({
          error: `Tool not found: ${args.name}`,
          code: "TOOL_NOT_FOUND",
        });
      }
      const meta = ADV_TOOL_METADATA[entry.name];
      if (!meta) {
        return formatToolOutput({
          error: `Metadata parity mismatch: ${entry.name} has no ADV_TOOL_METADATA entry`,
          code: "METADATA_PARITY_MISMATCH",
        });
      }
      const converted = renderToolInputSchema(entry);
      if (!converted.ok) {
        return formatToolOutput({
          error: `Schema conversion failed for ${entry.name}`,
          code: converted.code,
          details: converted.error,
        });
      }
      return formatToolOutput({
        name: entry.name,
        description: entry.description,
        argKeys: Object.keys(entry.args),
        visibility: meta,
        inputSchema: converted.schema,
      });
    },
  },
};

const PUBLIC_TOOL_GROUPS = [
  specTools,
  specDeltaTools,
  backlogTools,
  backlogShellTools,
  changeTools,
  followupTools,
  reportFollowupTools,
  opsEvidenceTools,
  contractTools,
  designConcernTools,
  verificationEvidenceTools,
  taskTools,
  subagentReportTools,
  wisdomTools,
  statusTools,
  projectTools,
  gateTools,
  testTools,
  temporalOpsTools,
  checkpointTools,
  reflectionTools,
  snapshotHealthTools,
  lightweightProfileTools,
  projectMetadataTools,
  conformanceTools,
  advWorktreeTools,
  advSessionTools,
  epicTools,
  storeConsolidateTools,
  storeCleanupTools,
  toolCatalogTools,
  advInvokeTools,
] as const satisfies readonly PublicToolGroup[];

export const PUBLIC_TOOL_ENTRIES: readonly PublicToolEntry[] = Object.freeze(
  collectPublicToolEntries(PUBLIC_TOOL_GROUPS),
);

/**
 * Registered ADV tool definitions for init-time schema telemetry. The entries
 * intentionally reuse the inventory that parity-tests against createToolMap.
 */
export function getRegisteredAdvToolEntries(): readonly PublicToolEntry[] {
  return PUBLIC_TOOL_ENTRIES;
}

/**
 * Live tool-surface lookup (addAcWarrantGuard): tool name → set of declared
 * argument keys, derived from PUBLIC_TOOL_ENTRIES (data only — no `execute`
 * invocation). Backward-compat wrapper: the imported pure function takes
 * entries explicitly; this wrapper binds PUBLIC_TOOL_ENTRIES for the legacy
 * no-arg API. The pure function is re-exported from ./tool-catalog-entries
 * for new MCP consumers.
 */
export function getToolSurface(): Map<string, Set<string>> {
  return getToolSurfaceFromEntries(PUBLIC_TOOL_ENTRIES);
}

/**
 * Canonical list of all ADV tool names, derived from PUBLIC_TOOL_GROUPS.
 * Duplicates are rejected at module load by collectPublicToolEntries before
 * this array is constructed (DDC2). createDegradedToolMap registers a stub
 * for every name; exact-set parity with createToolMap and getToolSurface is
 * enforced by deterministic tests (DDC1).
 */
export const ADV_TOOL_NAMES: readonly string[] = Object.freeze(
  PUBLIC_TOOL_ENTRIES.map((entry) => entry.name),
);

export const ADV_TOOL_METADATA: Readonly<Record<string, ToolMetadataV1>> =
  Object.freeze(
    Object.fromEntries(
      ADV_TOOL_NAMES.map((name) => [name, deriveToolMetadata(name)]),
    ),
  );

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
        "Set ADV_DEBUG=1 in your shell and restart OpenCode to capture init errors in $ADV_CACHE_DIR/adv-debug.log",
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
