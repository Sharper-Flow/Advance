/** Operator surface for the disk-only store reconciliation engine. */

import { z } from "zod";

import {
  buildReconcilePlan,
  detectFollowUpRuns,
  type ReconcilePlan,
} from "../storage/reconcile-plan";
import {
  runReconcileApply,
  ReconcileRefusalError,
  reconcileExitCode,
} from "../storage/reconcile-apply";
import { readReconcileProgress } from "../storage/reconcile-report";
import { runStoreResidueScan } from "../storage/store-residue-scan";
import type { Store } from "../storage/store-types";
import { formatToolOutput } from "../utils/tool-output";
import { getProjectId } from "../utils/project-id";
import { TargetProjectError, withTargetPathStore } from "./target-project";

const PLAN_HASH = /^[a-f0-9]{64}$/;

const StoreReconcileModeSchema = z.enum(["plan", "dry_run", "apply"]);

const storeReconcileToolDefinitions = {
  adv_store_reconcile: {
    description:
      "Reconcile disk-backed ADV store migration residue. The default plan " +
      "mode is read-only and emits the complete plan plus plan_hash; apply " +
      "requires that plan_hash as explicit approval and re-verifies it before mutation. " +
      "This is an operator-only surface; adv_doctor diagnostics are unchanged.",
    args: {
      mode: StoreReconcileModeSchema.default("plan").describe(
        "plan/dry_run = read-only plan with plan_hash; apply = execute the approved plan",
      ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, routes reconciliation through that project's store.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for an untrusted target_path when apply is requested.",
        ),
      confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with target_confirmed for an untrusted target_path mutation.",
        ),
      confirm_plan_hash: z
        .string()
        .regex(PLAN_HASH)
        .optional()
        .describe("Required for apply; plan_hash from a prior plan/dry_run."),
      resume_from: z
        .string()
        .min(1)
        .optional()
        .describe("Optional interrupted reconcile run ID to resume."),
      max_records: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional bounded scan record limit."),
      budget_ms: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional bounded scan time budget in milliseconds."),
    },
    execute: async (
      args: {
        mode: "plan" | "dry_run" | "apply";
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        confirm_plan_hash?: string;
        resume_from?: string;
        max_records?: number;
        budget_ms?: number;
      },
      store: Store,
    ): Promise<string> => {
      const mutation = args.mode === "apply";
      const run = async (targetStore: Store, targetContext?: unknown) => {
        const localProjectId =
          targetStore.productContext?.repoProjectId ??
          (await getProjectId(targetStore.paths.root));
        const resumeProgress = args.resume_from
          ? await readReconcileProgress(
              `${targetStore.paths.reconcileDir}/runs/${args.resume_from}`,
            )
          : null;
        const resumeAfter =
          typeof resumeProgress?.continuation_cursor === "string"
            ? resumeProgress.continuation_cursor
            : undefined;
        const scan = await runStoreResidueScan({
          paths: targetStore.paths,
          ...(args.max_records !== undefined && {
            maxRecords: args.max_records,
          }),
          ...(args.budget_ms !== undefined && { budgetMs: args.budget_ms }),
          ...(resumeAfter !== undefined && { resumeAfter }),
          localProjectId,
        });
        const plan = buildReconcilePlan(scan);

        if (!mutation) {
          const followUpRuns = detectFollowUpRuns(scan);
          return formatToolOutput(
            {
              ok: true,
              mode: args.mode,
              target: targetContext,
              scan,
              plan,
              plan_hash: plan.plan_hash,
              zero_mutations: true,
              ...(followUpRuns && { follow_up_runs_required: followUpRuns }),
            },
            { tool: "adv_store_reconcile" },
          );
        }

        if (!args.confirm_plan_hash) {
          return formatToolOutput(
            {
              ok: false,
              mode: args.mode,
              error_class: "stale_plan",
              exit_code: 6,
              error:
                "apply requires confirm_plan_hash from a prior plan/dry_run",
              plan_hash: plan.plan_hash,
              zero_mutations: true,
            },
            { tool: "adv_store_reconcile" },
          );
        }

        const report = await runReconcileApply({
          storePaths: targetStore.paths,
          plan,
          planHash: plan.plan_hash,
          confirmPlanHash: args.confirm_plan_hash,
          mode: "apply",
          resumeFromRunId: args.resume_from,
          deps: {
            localProjectId,
            scan: (paths, options) =>
              runStoreResidueScan({
                paths,
                ...options,
                localProjectId,
                ...(args.max_records !== undefined && {
                  maxRecords: args.max_records,
                }),
                ...(args.budget_ms !== undefined && {
                  budgetMs: args.budget_ms,
                }),
                ...(resumeAfter !== undefined && { resumeAfter }),
              }),
          },
        });
        return formatToolOutput(
          {
            ok: report.counters.failed === 0 && report.proof?.complete === true,
            mode: args.mode,
            target: targetContext,
            plan_hash: plan.plan_hash,
            report,
            exit_code: reconcileExitCode(report),
          },
          { tool: "adv_store_reconcile" },
        );
      };

      try {
        if (!args.target_path) return await run(store);

        return await withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            mutation,
            stateRequirement: mutation ? "authoritative" : "snapshot-ok",
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            run(targetStore, {
              root: context.root,
              project_id: context.projectId,
              trusted: context.trusted,
              trust_source: context.trustSource,
              state_mode: context.stateMode,
            }),
        );
      } catch (error) {
        const refusal =
          error instanceof ReconcileRefusalError
            ? error
            : error instanceof TargetProjectError
              ? new ReconcileRefusalError(
                  "target_store_resolution",
                  error.message,
                )
              : new ReconcileRefusalError(
                  "target_store_resolution",
                  error instanceof Error ? error.message : String(error),
                );
        return formatToolOutput(
          {
            ok: false,
            mode: args.mode,
            error_class: refusal.error_class,
            exit_code: refusal.exit_code,
            error: refusal.message,
            ...(refusal.resume_from !== undefined && {
              resume_from: refusal.resume_from,
            }),
            ...(refusal.continuation_cursor !== undefined && {
              continuation_cursor: refusal.continuation_cursor,
            }),
            ...(refusal.report !== undefined && { report: refusal.report }),
            zero_mutations:
              refusal.report === undefined ||
              refusal.report.counters.mutated === 0,
          },
          { tool: "adv_store_reconcile" },
        );
      }
    },
  },
} as const;

const { adv_store_reconcile: storeReconcileDefinition } =
  storeReconcileToolDefinitions;

/** Internal CLI handler retained for bin/adv reconcile. */
export const storeReconcileHandler = storeReconcileDefinition.execute;
export const storeReconcileTools = storeReconcileToolDefinitions;

export type StoreReconcilePlan = ReconcilePlan;
