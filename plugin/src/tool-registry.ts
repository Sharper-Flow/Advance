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
 * Zod version: both the plugin and `@opencode-ai/plugin` SDK use Zod v4.
 * Prior to P1.12 (completeTemporalOnlyMigration), the SDK bundled
 * `zod@4.1.8` while the plugin declared `^4.3.6`, producing two runtime
 * Zod instances with different prototype identities. That patch-level
 * drift was the suspected root cause of the zero-args tool-call hang
 * reproduced during /adv-design (see wisdom ws-3550c245). A pinned
 * `pnpm.overrides.zod = "4.3.6"` now forces a single instance across the
 * dependency tree. The `as any` cast at the SDK boundary is retained
 * because the SDK's typed `tool()` signature still expects the SDK's own
 * Zod import identity — a single structural cast, not a version bridge.
 */

import { tool } from "@opencode-ai/plugin";
import { z } from "zod";
import { safeExecute, safeExecuteSimple } from "./utils/safe-execute";
import type { Store } from "./storage/store-types";

import { specTools } from "./tools/spec";
import { changeTools } from "./tools/change";
import { changeDiagnoseTools } from "./tools/change-diagnose";
import { taskTools } from "./tools/task";
import { wisdomTools } from "./tools/wisdom";
import { statusTools } from "./tools/status";
import { agendaTools } from "./tools/agenda";
import { projectTools } from "./tools/project";
import { gateTools } from "./tools/gate";
import { testTools } from "./tools/test";
import { investmentTools } from "./tools/investment";
import { temporalOpsTools } from "./tools/temporal-ops";
import { archiveSweepTools } from "./tools/archive-sweep";
import { migrateCleanupTools } from "./tools/migrate-cleanup";
import { archivePurgeTools } from "./tools/archive-purge";
import { checkpointTools } from "./tools/checkpoint";
import { reflectionTools } from "./tools/reflection";
import { projectMetadataTools } from "./tools/project-metadata";
import { conformanceTools } from "./tools/conformance";
import { changeImportTools } from "./tools/change-import";
type ToolArgsSchema = Record<string, z.ZodTypeAny>;
type ToolExecute<TArgs> = (
  args: TArgs,
  contextOrExtra?: unknown,
) => Promise<string>;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tool({ description, args: args as any, execute });
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
    safeExecute(async (args) => def.execute(args as TArgs, store), name),
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
  return registerTool(def.description, def.args, async (args: unknown) =>
    wrapped(args, dir, path),
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
) {
  return {
    // Spec Tools
    adv_spec: bindTool(specTools.adv_spec, "adv_spec", store),

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
    adv_change_diagnose: bindTool(
      changeDiagnoseTools.adv_change_diagnose,
      "adv_change_diagnose",
      store,
    ),
    adv_change_import: bindTool(
      changeImportTools.adv_change_import,
      "adv_change_import",
      store,
    ),

    // Task Tools
    adv_task_show: bindTool(taskTools.adv_task_show, "adv_task_show", store),
    adv_task_run_status: bindTool(
      taskTools.adv_task_run_status,
      "adv_task_run_status",
      store,
    ),
    adv_task_list: bindTool(taskTools.adv_task_list, "adv_task_list", store),
    adv_task_ready: bindTool(taskTools.adv_task_ready, "adv_task_ready", store),
    adv_task_update: bindTool(
      taskTools.adv_task_update,
      "adv_task_update",
      store,
    ),
    adv_task_add: bindTool(taskTools.adv_task_add, "adv_task_add", store),
    adv_task_evidence: bindTool(
      taskTools.adv_task_evidence,
      "adv_task_evidence",
      store,
    ),
    adv_task_tdd: bindTool(taskTools.adv_task_tdd, "adv_task_tdd", store),

    // Task cancel — needs Record<string,string> type coercion
    adv_task_cancel: registerTool(
      taskTools.adv_task_cancel.description,
      taskTools.adv_task_cancel.args,
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

    // Task reclassify TDD — needs literal/union type coercion
    adv_task_reclassify_tdd: registerTool(
      taskTools.adv_task_reclassify_tdd.description,
      taskTools.adv_task_reclassify_tdd.args,
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

    // Investment Tools (addCostTimeInvestment)
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
    adv_agenda_evidence: bindToolSimple(
      agendaTools.adv_agenda_evidence,
      "adv_agenda_evidence",
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
    adv_orphan_sweep: bindTool(
      temporalOpsTools.adv_orphan_sweep,
      "adv_orphan_sweep",
      store,
    ),
    adv_archive_sweep_orphans: bindTool(
      archiveSweepTools.adv_archive_sweep_orphans,
      "adv_archive_sweep_orphans",
      store,
    ),
    adv_migrate_cleanup: bindTool(
      migrateCleanupTools.adv_migrate_cleanup,
      "adv_migrate_cleanup",
      store,
    ),
    adv_archive_purge: bindTool(
      archivePurgeTools.adv_archive_purge,
      "adv_archive_purge",
      store,
    ),
    adv_temporal_worker_restart: bindTool(
      temporalOpsTools.adv_temporal_worker_restart,
      "adv_temporal_worker_restart",
      store,
    ),
    // adv_workflow_repair — KD-6 timeout override (rq-toolTimeoutOverride01).
    // Outer safety-net timeout must exceed the inner state-rebuild budget:
    // this tool rebuilds the project workflow from legacy snapshots and re-
    // imports change state, which legitimately exceeds the 10s default on
    // mature projects. 30s gives headroom for typical state sizes; bumps
    // beyond that signal a deeper problem (use adv_status to inspect).
    adv_workflow_repair: registerTool(
      temporalOpsTools.adv_workflow_repair.description,
      temporalOpsTools.adv_workflow_repair.args,
      safeExecute(
        async (args) =>
          temporalOpsTools.adv_workflow_repair.execute(
            args as Parameters<
              typeof temporalOpsTools.adv_workflow_repair.execute
            >[0],
            store,
          ),
        "adv_workflow_repair",
        undefined,
        { timeoutMs: 30_000 },
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
      safeExecute(
        async (args) =>
          gateTools.adv_gate_complete.execute(
            args as Parameters<typeof gateTools.adv_gate_complete.execute>[0],
            store,
          ),
        "adv_gate_complete",
      ),
    ),

    // Test Tools — adv_run_test takes (args, store, directory)
    //
    // Outer safety-net timeout must exceed the inner subprocess budget
    // (DEFAULT_TEST_TIMEOUT_MS = 30s in test.ts) so the subprocess is the
    // authoritative timeout source. 35s gives 5s headroom for tool-side
    // bookkeeping (workflow Update, evidence recording).
    adv_run_test: registerTool(
      testTools.adv_run_test.description,
      testTools.adv_run_test.args,
      safeExecute(
        async (args) =>
          testTools.adv_run_test.execute(
            args as Parameters<typeof testTools.adv_run_test.execute>[0],
            store,
            directory,
          ),
        "adv_run_test",
        undefined,
        { timeoutMs: 35_000 },
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

    // Reflection Tool
    adv_reflect: bindTool(reflectionTools.adv_reflect, "adv_reflect", store),

    // Conformance Tool — adv_conformance takes (args, dir=projectDir, path=externalRoot)
    adv_conformance: bindToolSimple(
      conformanceTools.adv_conformance,
      "adv_conformance",
      directory,
      store.paths.external ?? undefined,
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
  "adv_change_diagnose",
  "adv_change_import",
  "adv_task_show",
  "adv_task_run_status",
  "adv_task_list",
  "adv_task_ready",
  "adv_task_update",
  "adv_task_add",
  "adv_task_evidence",
  "adv_task_tdd",
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
  "adv_agenda_evidence",
  "adv_project_context",
  "adv_project_metadata",
  "adv_gate_status",
  "adv_gate_complete",
  "adv_run_test",
  "adv_temporal_diagnose",
  "adv_temporal_register_search_attributes",
  "adv_temporal_reconnect",
  "adv_orphan_sweep",
  "adv_archive_sweep_orphans",
  "adv_migrate_cleanup",
  "adv_archive_purge",
  "adv_temporal_worker_restart",
  "adv_workflow_repair",
  "adv_task_checkpoint",
  "adv_reflect",
  "adv_conformance",
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
        "Run `pnpm --filter @goost/advance build` from the repo root (or `pnpm build` in plugin/) to ensure plugin/dist/ is current",
        "Check ~/.config/opencode/opencode.json — the .plugin array must point to the built plugin directory",
        "If project.json is present, verify it is valid JSON and matches the ADV ProjectConfig schema",
        "Check the ADV external state dir (~/.local/share/opencode/plugins/advance/{project-id}/) for malformed change/spec JSON; repair the artifact or run the orphan-sweep recovery utility, then restart OpenCode",
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
      stubExecute,
    );
  }
  return map;
}
