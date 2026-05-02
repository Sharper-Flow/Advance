import { basename } from "path";
import { z } from "zod";
import type { Store } from "../storage/store";
import { restartCurrentProjectTemporalWorker } from "../plugin-init";
import { getService, getStslStats, reinitStsl } from "../temporal/service";
import { repairChangeActivity } from "../temporal/activities";
import { getTemporalHealth } from "../temporal/health-probe";
import { sweepProject } from "../temporal/orphan-sweep";
import {
  buildChangeWorkflowId,
  buildProjectWorkflowId,
} from "../temporal/client";
import { checkAdvSearchAttributes } from "../temporal/observability";
import { registerMissingAdvSearchAttributes } from "../temporal/observability";
import { formatToolOutput } from "../utils/tool-output";
import {
  formatTargetProjectContext,
  type TargetProjectOutputContext,
  withTargetPathStore,
} from "./target-project";

type WorkflowReachability =
  | { reachable: true; error?: undefined }
  | { reachable: false; error: string };

/**
 * Checks whether Temporal can describe a workflow ID through the current STSL
 * connection. Returns a structured unreachable result instead of throwing so
 * `adv_temporal_diagnose` can report recovery guidance without crashing.
 */
async function describeWorkflowReachability(
  bundle: ReturnType<typeof getService>,
  workflowId: string,
): Promise<WorkflowReachability> {
  const describeWorkflowExecution = (
    bundle?.connection as unknown as {
      workflowService?: {
        describeWorkflowExecution?: (req: {
          namespace: string;
          execution: { workflowId: string };
        }) => Promise<unknown>;
      };
    }
  )?.workflowService?.describeWorkflowExecution;

  if (!bundle || typeof describeWorkflowExecution !== "function") {
    return {
      reachable: false,
      error: "Temporal workflow describe unavailable",
    };
  }

  try {
    await describeWorkflowExecution({
      namespace: bundle.namespace,
      execution: { workflowId },
    });
    return { reachable: true };
  } catch (err) {
    return {
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Orders recovery recommendations from root-cause prerequisites to narrower
 * workflow repairs. The returned string is operator-facing guidance surfaced by
 * `adv_temporal_diagnose`.
 */
function recommendTemporalRecovery(input: {
  health: Awaited<ReturnType<typeof getTemporalHealth>>;
  stslInitialized: boolean;
  searchAttributesOk: boolean;
  searchAttributesVerificationStatus: "verified" | "unverified";
  projectWorkflowReachable: boolean | null;
  changeWorkflowReachable: boolean | null;
}): string {
  if (!input.health.server_alive) return "restore Temporal server";
  if (!input.stslInitialized) return "restart OpenCode or initialize STSL";
  if (!input.searchAttributesOk) {
    if (input.searchAttributesVerificationStatus === "unverified") {
      return "verify Temporal search-attribute health, run adv_temporal_reconnect or adv_temporal_worker_restart, then retry blocked tool";
    }
    return "run adv_temporal_register_search_attributes";
  }
  if (!input.health.worker_process_alive || !input.health.worker_alive) {
    return "run adv_temporal_worker_restart";
  }
  if (input.health.stale_queues.length > 0)
    return "run adv_orphan_sweep dry-run";
  if (input.projectWorkflowReachable === false)
    return "run adv_workflow_repair";
  if (input.changeWorkflowReachable === false) return "run adv_workflow_repair";
  if (input.health.last_error)
    return "inspect last_error and retry blocked tool";
  return "none";
}

function recommendPostRegistrationAction(input: {
  ok: boolean;
  createdCount: number;
  verificationStatus: "verified" | "unverified";
}): string {
  if (input.createdCount > 0 || input.verificationStatus === "unverified") {
    return "run adv_temporal_worker_restart, then retry the failed workflow update or archive command";
  }
  if (!input.ok)
    return "run adv_temporal_diagnose and follow recommendedNextAction";
  return "retry the previously blocked Temporal tool; worker restart is not required";
}

export const temporalOpsTools = {
  adv_temporal_diagnose: {
    description:
      "Read-only Temporal recovery diagnostic for ADV: classifies server, STSL, worker, workflow, search-attribute, stale-queue, and last-error health with a recommended next action.",
    args: {
      changeId: z
        .string()
        .optional()
        .describe(
          "Optional change ID to check for a reachable change workflow",
        ),
    },
    execute: async (args: { changeId?: string }, store: Store) => {
      const projectId = store.paths.external
        ? basename(store.paths.external)
        : undefined;
      const health = await getTemporalHealth(projectId);
      const bundle = getService();
      const searchAttributes = bundle
        ? await checkAdvSearchAttributes(bundle.connection, bundle.namespace)
        : {
            ok: false,
            verificationStatus: "unverified" as const,
            present: [],
            missing: [],
            wrongType: [],
            error: "Temporal service layer not initialized",
          };

      const projectWorkflow = projectId
        ? await describeWorkflowReachability(
            bundle,
            buildProjectWorkflowId(projectId),
          )
        : { reachable: false as const, error: "No projectId resolved" };

      const changeWorkflow =
        projectId && args.changeId
          ? {
              changeId: args.changeId,
              ...(await describeWorkflowReachability(
                bundle,
                buildChangeWorkflowId(projectId, args.changeId),
              )),
            }
          : null;

      const recommendedNextAction = recommendTemporalRecovery({
        health,
        stslInitialized: bundle !== null,
        searchAttributesOk: searchAttributes.ok,
        searchAttributesVerificationStatus: searchAttributes.verificationStatus,
        projectWorkflowReachable: projectWorkflow.reachable,
        changeWorkflowReachable: changeWorkflow?.reachable ?? null,
      });

      // Compute searchAttributesStatus from the searchAttributes check result
      let searchAttributesStatus: "ok" | "degraded" | "missing";
      if (!searchAttributes.ok) {
        if (searchAttributes.error || !bundle) {
          searchAttributesStatus = "missing";
        } else if (
          searchAttributes.missing.length > 0 ||
          searchAttributes.wrongType.length > 0
        ) {
          searchAttributesStatus = "degraded";
        } else {
          searchAttributesStatus = "missing";
        }
      } else {
        searchAttributesStatus = "ok";
      }

      return formatToolOutput({
        success: true,
        projectId,
        stsl: {
          initialized: bundle !== null,
          namespace: bundle?.namespace ?? null,
          address: bundle?.address ?? null,
          reconnectCount: health.reconnect_count,
        },
        temporalHealth: health,
        searchAttributes,
        searchAttributesStatus,
        projectWorkflow,
        changeWorkflow,
        recommendedNextAction,
      });
    },
  },

  adv_temporal_register_search_attributes: {
    description:
      "Register missing required ADV Temporal search attributes. Creates missing attributes only, refuses wrong-type mutations, and requires explicit user approval.",
    args: {
      approvedByUser: z
        .boolean()
        .describe("Must be true after explicit user approval"),
      approvalEvidence: z
        .string()
        .describe("How the user explicitly approved metadata registration"),
    },
    execute: async (
      args: { approvedByUser: boolean; approvalEvidence: string },
      _store: Store,
    ) => {
      if (!args.approvedByUser || args.approvalEvidence.trim().length === 0) {
        return formatToolOutput({
          success: false,
          error:
            "Explicit user approval is required to register Temporal search attributes.",
        });
      }

      const bundle = getService();
      if (!bundle) {
        return formatToolOutput({
          success: false,
          error:
            "Temporal service layer not initialized — cannot register search attributes",
        });
      }

      const result = await registerMissingAdvSearchAttributes(
        bundle.connection,
        bundle.namespace,
      );

      // Verify SAs are actually queryable after registration
      const verification = await checkAdvSearchAttributes(
        bundle.connection,
        bundle.namespace,
      );

      const nextAction = recommendPostRegistrationAction({
        ok: result.ok,
        createdCount: result.created.length,
        verificationStatus: result.verificationStatus,
      });

      return formatToolOutput({
        success: result.ok && verification.ok,
        namespace: bundle.namespace,
        approvalEvidence: args.approvalEvidence.trim(),
        result,
        verification: {
          ok: verification.ok,
          present: verification.present.map((a) => a.name),
          missing: verification.missing.map((a) => a.name),
          wrongType: verification.wrongType.map((a) => a.name),
        },
        nextAction,
        message:
          result.ok && verification.ok
            ? `ADV Temporal search attributes ready in namespace ${bundle.namespace}`
            : verification.ok
              ? `Registration succeeded but verification found issues: ${result.error ?? "unknown error"}`
              : `Registration completed but verification failed — ${verification.missing.length} SAs still missing`,
      });
    },
  },

  adv_temporal_reconnect: {
    description:
      "Reconnect the shared Temporal service layer (STSL) without mutating workflow state or restarting workers.",
    args: {
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
        ),
      confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
        ),
    },
    execute: async (
      {
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runReconnect = async (
        _activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const before = getStslStats();
        try {
          await reinitStsl();
        } catch (err) {
          const after = getStslStats();
          return formatToolOutput({
            success: false,
            before,
            after,
            error: err instanceof Error ? err.message : String(err),
            message: "Temporal service layer reconnect failed",
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
        const after = getStslStats();
        return formatToolOutput({
          success: true,
          before,
          after,
          message: "Reconnected Temporal service layer",
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };

      if (target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path,
            stateRequirement: "temporal-required",
            target_confirmed,
            confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runReconnect(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runReconnect(store);
    },
  },

  adv_orphan_sweep: {
    description:
      "Detect and optionally re-seed disk-backed change workflows missing from Temporal. Dry-run is default; execute mode requires explicit user approval.",
    args: {
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "When true or omitted, detect orphans without re-seeding. With dryRun: true, this tool is read-only and safe to invoke without approval.",
        ),
      approvedByUser: z
        .boolean()
        .optional()
        .describe("Required true when dryRun is false"),
      approvalEvidence: z
        .string()
        .optional()
        .describe("How the user explicitly approved execute mode"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
        ),
      confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
        ),
    },
    execute: async (
      args: {
        dryRun?: boolean;
        approvedByUser?: boolean;
        approvalEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const dryRun = args.dryRun ?? true;

      const runSweep = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        if (!activeStore.paths.external) {
          return formatToolOutput({
            success: false,
            error:
              "Orphan sweep requires external state paths; current store is running in legacy in-repo mode.",
          });
        }
        if (!dryRun) {
          if (!args.approvedByUser || !args.approvalEvidence?.trim()) {
            return formatToolOutput({
              success: false,
              error:
                "Explicit user approval is required to execute orphan sweep re-seeding. Re-run with dryRun:true to preview only.",
            });
          }
        }

        const bundle = getService();
        if (!bundle) {
          return formatToolOutput({
            success: false,
            error:
              "Temporal service layer not initialized — cannot run orphan sweep",
          });
        }

        const projectId = basename(activeStore.paths.external);
        const result = await sweepProject({
          projectId,
          changesDir: activeStore.paths.changes,
          client: bundle.client as unknown as Parameters<
            typeof sweepProject
          >[0]["client"],
          dryRun,
        });

        return formatToolOutput({
          success: true,
          dryRun,
          projectId,
          approvalEvidence: dryRun ? undefined : args.approvalEvidence?.trim(),
          result,
          message: dryRun
            ? `Orphan sweep dry-run found ${result.orphans.length} missing change workflows`
            : `Orphan sweep re-seeded ${result.reseeded.length} change workflows`,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "temporal-required",
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runSweep(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runSweep(store);
    },
  },

  adv_temporal_worker_restart: {
    description:
      "Force-restart the in-process Temporal worker for the current project when the respawn loop is exhausted or the worker is wedged.",
    args: {},
    execute: async (_args: Record<string, never>, store: Store) => {
      const result = await restartCurrentProjectTemporalWorker(
        store.paths.root,
      );
      const bundle = getService();
      const stats = getStslStats();
      return formatToolOutput({
        success: true,
        ...result,
        stsl: {
          initialized: bundle !== null,
          reconnectCount: stats.reconnectCount,
          reconnectFailureCount: stats.reconnectFailureCount,
          recommendedNextAction:
            "run adv_temporal_diagnose if tools still fail",
        },
        message: `Restarted Temporal worker for ${result.projectId}`,
      });
    },
  },

  adv_workflow_repair: {
    description:
      "Repair the current project's workflow state for a single change by rebuilding the project workflow from legacy snapshots, re-importing the specified change, and re-emitting derived agenda/wisdom exports.",
    args: {
      changeId: z
        .string()
        .describe("Change ID to re-import into the repaired project workflow"),
      approvalEvidence: z
        .string()
        .describe("How the user explicitly approved running workflow repair"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
        ),
      confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
        ),
    },
    execute: async (
      args: {
        changeId: string;
        approvalEvidence: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runRepair = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        if (
          !args.approvalEvidence ||
          args.approvalEvidence.trim().length === 0
        ) {
          return formatToolOutput({
            error:
              "approvalEvidence is required. Describe how the user explicitly approved workflow repair.",
          });
        }

        if (!activeStore.paths.external) {
          return formatToolOutput({
            error:
              "Workflow repair requires external state paths; current store is running in legacy in-repo mode.",
          });
        }

        const projectId = basename(activeStore.paths.external);

        const bundle = getService();
        if (!bundle) {
          return formatToolOutput({
            success: false,
            error:
              "Temporal service layer not initialized — cannot repair workflow state",
          });
        }

        try {
          await reinitStsl();
        } catch (err) {
          return formatToolOutput({
            success: false,
            phase: "reconnect-stsl",
            error: err instanceof Error ? err.message : String(err),
            message:
              "Temporal service layer reconnect failed before workflow repair",
          });
        }

        // P2.6: Disk + workflow repair logic lives in `repairChangeActivity`
        // (see `temporal/activities.ts`). The tool body validates args,
        // refreshes STSL, and invokes the activity. Critically, the activity
        // does NOT close `bundle.connection` — the service-layer singleton owns
        // that lifecycle (was the poison-pill of the pre-4aa420e bug).
        const result = await repairChangeActivity({
          projectId,
          changeId: args.changeId,
          approvalEvidence: args.approvalEvidence,
          paths: {
            root: activeStore.paths.root,
            changes: activeStore.paths.changes,
            agenda: activeStore.paths.agenda,
            wisdom: activeStore.paths.wisdom,
          },
          client: bundle.client as unknown as Parameters<
            typeof repairChangeActivity
          >[0]["client"],
        });

        if (!result.ok) {
          return formatToolOutput({
            success: false,
            ...result,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
        return formatToolOutput({
          success: true,
          projectId: result.projectId,
          changeId: result.changeId,
          message: result.message,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "temporal-required",
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runRepair(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runRepair(store);
    },
  },
};
