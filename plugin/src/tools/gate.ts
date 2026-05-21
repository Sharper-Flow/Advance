/**
 * Gate Tools
 *
 * Tools for 7-gate quality checklist management.
 */

import { z } from "zod";
import { join } from "path";
import type { Store } from "../storage/store";
import {
  type GateId,
  type GateCompletion,
  type Gates,
  type Task,
  type FeatureFlags,
  type Change,
  GATE_ORDER,
  canCompleteGate,
  getIncompleteGates,
  allGatesSatisfied,
  createDefaultGates,
} from "../types";
import { formatToolOutput } from "../utils/tool-output";
import { runPrepReadinessChecks } from "../validator/prep-readiness";
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { loadProposalWithFallback } from "../storage/json";
import { buildChangeContextSnapshot } from "../utils/context-snapshot";
import { COMMAND_MANIFEST } from "../manifest";
import {
  formatTargetProjectContext,
  type TargetProjectOutputContext,
  withOptionalTargetPathStore,
  withTargetPathStore,
} from "./target-project";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import {
  fireSignalAndRefresh,
  querySignal,
  getChangeHandle,
} from "./_adapters";
import {
  changeTasksQuery,
  gateCompletedSignal,
  getGateStatusQuery,
} from "../temporal/messages";
import {
  type WorktreeIsolationDeps,
  type WorktreeIsolationResult,
} from "./worktree-isolation-guard";
import {
  ensureWorktreeForMutation,
  type EnsureWorktreeForMutationDeps,
} from "./worktree-auto-manage";
import type { WorkflowHandleLike } from "../storage/store-temporal/shared";

const GATE_COMPLETION_POLL_ATTEMPTS = 40;
const GATE_COMPLETION_POLL_DELAY_MS = 25;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function waitForGateCompletionResult(
  handle: WorkflowHandleLike,
  gateId: GateId,
): Promise<GateCompletion | undefined> {
  let latest: GateCompletion | undefined;
  for (let attempt = 0; attempt < GATE_COMPLETION_POLL_ATTEMPTS; attempt++) {
    latest = await querySignal<GateCompletion>(
      handle,
      getGateStatusQuery,
      gateId,
    );
    if (latest?.status === "done" || latest?.status === "stuck") {
      return latest;
    }
    await delay(GATE_COMPLETION_POLL_DELAY_MS);
  }
  return latest;
}

function workflowReadinessBlockedResponse(input: {
  changeId: string;
  gateId: GateId;
  gate: GateCompletion;
}): string {
  return formatToolOutput({
    error: `Cannot complete ${input.gateId}: workflow readiness blocked gate completion`,
    changeId: input.changeId,
    gateId: input.gateId,
    workflowGateStatus: input.gate.status,
    stuckReason: input.gate.stuck_reason,
    readinessBlockers: input.gate.readiness_blockers ?? [],
    hint: "Fix the workflow readiness blockers listed above, then retry adv_gate_complete.",
  });
}

function gateCompletionNotConfirmedResponse(input: {
  changeId: string;
  gateId: GateId;
  gate?: GateCompletion;
}): string {
  return formatToolOutput({
    error: `Cannot confirm ${input.gateId} gate completion from workflow state`,
    changeId: input.changeId,
    gateId: input.gateId,
    workflowGateStatus: input.gate?.status,
    hint: "Retry adv_gate_status to inspect workflow state before retrying adv_gate_complete.",
  });
}

/**
 * Gate-completion worktree-isolation guard (rq-autoManageAdvWorktrees AC5).
 *
 * Per-change marker + global flag activation matrix lives in
 * `evaluateWorktreeGuardActivation`. The proposal gate is exempt regardless
 * of activation (C5 + DONT2): a change must be creatable from main before
 * any worktree can exist for it.
 *
 * When `change` is provided AND `change.worktree_auto_managed === true`,
 * this delegates to `ensureWorktreeForMutation` which attempts to
 * auto-create the worktree before BLOCKing. When `change` is omitted (e.g.,
 * in legacy crosscut tests), the function preserves the pre-Block-B
 * behavior: block_only when the global flag is true, ALLOW when off.
 *
 * The function is async because the auto-manage path awaits
 * `advWorktreeResume`. Block-only and off paths remain effectively sync
 * (no I/O); the caller just awaits for uniformity.
 */
export async function evaluateGateWorktreeIsolation(input: {
  gateId: GateId;
  features: unknown;
  cwd: string;
  /** Optional Change for per-change-marker conditioning (AC5). */
  change?: Change;
  /** Optional auto-create runtime deps; required for the auto_manage path. */
  autoManageDeps?: EnsureWorktreeForMutationDeps;
  getSessionContext?: WorktreeIsolationDeps["getSessionContext"];
}): Promise<WorktreeIsolationResult> {
  if (input.gateId === "proposal") return { decision: "ALLOW" };

  // Delegate to the unified helper. It handles the activation matrix,
  // session-context detection, existing-worktree lookup, auto-create,
  // and AC6 structured failures. When `change` is undefined, the helper
  // routes through block_only / off based on the global flag.
  return ensureWorktreeForMutation({
    change: input.change,
    cwd: input.cwd,
    features: input.features,
    deps: {
      ...input.autoManageDeps,
      getSessionContext:
        input.autoManageDeps?.getSessionContext ?? input.getSessionContext,
    },
  });
}

function getContextMismatchFields(error: Error): {
  owningProjectId?: unknown;
  currentProjectId?: unknown;
} {
  return {
    owningProjectId:
      "owningProjectId" in error ? error.owningProjectId : undefined,
    currentProjectId:
      "currentProjectId" in error ? error.currentProjectId : undefined,
  };
}

async function completeGateAndBuildResponse({
  store,
  change,
  changeId,
  gateId,
  gates,
  notes,
  completedBy,
  boundaryWarning,
  extraPayload = {},
}: {
  store: Store;
  change: Change;
  changeId: string;
  gateId: GateId;
  gates: Gates;
  notes?: string;
  completedBy: string;
  boundaryWarning?: string;
  extraPayload?: Record<string, unknown>;
}): Promise<string> {
  // rq-cacheRefresh01: cache invalidation now happens at the call sites
  // via fireSignalAndRefresh (which fires the signal AND refreshes the
  // cache atomically). The previous inline `await store.changes.refresh(changeId)`
  // here was a parallel implementation of the rule — removed in T10 of
  // change centralizemutationcacherefresh to keep a single helper-based
  // path. Both gate.ts call sites (planning gate path and generic gate
  // path) now use fireSignalAndRefresh before invoking this helper.

  const completedAt = new Date().toISOString();
  const completedGates: Gates = {
    ...gates,
    [gateId]: {
      ...gates[gateId],
      status: "done",
      completed_at: completedAt,
      completed_by: completedBy,
      ...(notes ? { notes } : {}),
    },
  };

  const changeDir = join(store.paths.changes, changeId);
  const { content: proposalText } = await loadProposalWithFallback(
    changeDir,
    change.title,
  );

  return formatToolOutput({
    success: true,
    changeId,
    gateId,
    status: "done",
    completed_at: completedAt,
    completed_by: completedBy,
    _contextSnapshot: buildChangeContextSnapshot({
      change,
      proposalText,
      gates: completedGates,
      workdir: store.paths.root,
    }),
    ...(boundaryWarning ? { boundaryWarning } : {}),
    ...extraPayload,
  });
}

async function handlePlanningGateCompletion({
  store,
  change,
  changeId,
  gateId,
  gates,
  userApproved,
  notes,
  completedBy,
  boundaryWarning,
}: {
  store: Store;
  change: Change;
  changeId: string;
  gateId: GateId;
  gates: Gates;
  userApproved?: boolean;
  notes?: string;
  completedBy: string;
  boundaryWarning?: string;
}): Promise<string> {
  if (!userApproved) {
    return formatToolOutput({
      error:
        "Planning gate requires userApproved: true. The user must explicitly approve the prep contract (via question tool) before this gate can be completed.",
      changeId,
      gateId,
      hint: "Present the vision document to the user, obtain approval via question tool, then call adv_gate_complete with userApproved: true.",
    });
  }

  const readiness = runPrepReadinessChecks(change);
  if (!readiness.passed) {
    return formatToolOutput({
      error: `Prep gate blocked: ${readiness.mustFailures.length} readiness failure(s) must be resolved`,
      changeId,
      gateId,
      readinessFailures: readiness.mustFailures.map((f) => ({
        code: f.code,
        severity: f.severity,
        message: f.message,
        path: f.path,
        remediation: (f.details as Record<string, unknown> | undefined)
          ?.remediation,
      })),
      hint: "Fix all readiness failures listed above, then retry adv_gate_complete.",
    });
  }

  const warningsPayload =
    readiness.warnings.length > 0
      ? {
          readinessWarnings: readiness.warnings.map((w) => ({
            code: w.code,
            message: w.message,
            path: w.path,
          })),
        }
      : {};

  const features = store.config?.features as FeatureFlags | undefined;
  const clarifyMode = features?.clarify_enforcement ?? "advisory";
  let clarifyPayload: Record<string, unknown> = {};

  if (clarifyMode !== "off") {
    const changeDir = join(store.paths.changes, changeId);
    const { content: proposalText } = await loadProposalWithFallback(
      changeDir,
      change.title,
    );
    const clarifyResult = runClarifyReadinessChecks(change, proposalText);

    if (clarifyResult.findings.length > 0) {
      if (clarifyMode === "strict") {
        return formatToolOutput({
          error: `Prep gate blocked: ${clarifyResult.findings.length} ambiguity finding(s) must be resolved via /adv-clarify`,
          changeId,
          gateId,
          clarifyFindings: clarifyResult.findings.map((f) => ({
            code: f.code,
            severity: f.severity,
            message: f.message,
            questionCategory: f.details?.questionCategory,
          })),
          hint: `Run /adv-clarify ${changeId} to resolve ambiguity findings, then retry adv_gate_complete.`,
        });
      }

      clarifyPayload = {
        clarifyWarnings: clarifyResult.findings.map((f) => ({
          code: f.code,
          message: f.message,
          questionCategory: f.details?.questionCategory,
        })),
      };
    }
  }

  // Signal-driven mutation: fire gateCompletedSignal after all validations pass
  const bundle = getService();
  if (!bundle) {
    return formatToolOutput({
      error: "Temporal service not available",
      changeId,
      gateId,
    });
  }
  const projectId = await getProjectId(store.paths.root);
  if (!projectId) {
    return formatToolOutput({
      error: "Could not resolve project ID",
      changeId,
      gateId,
    });
  }
  const handle = getChangeHandle(bundle.client, projectId, changeId);
  // rq-cacheRefresh01: helper fires signal AND refreshes cache so the
  // subsequent completeGateAndBuildResponse builds its response from
  // fresh state (no parallel inline refresh in the helper anymore).
  await fireSignalAndRefresh(handle, store, changeId, gateCompletedSignal, {
    gateId,
    completedBy,
    completedAt: new Date().toISOString(),
    approvalEvidence: notes,
  });

  const postSignalGate = await waitForGateCompletionResult(handle, gateId);
  if (postSignalGate?.status === "stuck") {
    return workflowReadinessBlockedResponse({
      changeId,
      gateId,
      gate: postSignalGate,
    });
  }
  if (postSignalGate?.status !== "done") {
    return gateCompletionNotConfirmedResponse({
      changeId,
      gateId,
      gate: postSignalGate,
    });
  }

  return completeGateAndBuildResponse({
    store,
    change,
    changeId,
    gateId,
    gates: { ...gates, [gateId]: postSignalGate },
    notes,
    completedBy,
    boundaryWarning,
    extraPayload: {
      ...warningsPayload,
      ...clarifyPayload,
    },
  });
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const gateTools = {
  adv_gate_status: {
    description:
      "Get gate status for a change. Returns all 7 gates with completion status, timestamps, and next gate to complete.",
    args: {
      changeId: z
        .string()
        .describe(
          "Change ID — must match an existing change from `adv_change_list`. Returns the full gate map (proposal, discovery, design, planning, execution, acceptance, release) plus `nextGate` and `canArchive` flags.",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
    },
    execute: async (
      { changeId, target_path }: { changeId: string; target_path?: string },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          try {
            const result = await activeStore.changes.get(changeId);
            if (!result.success) {
              return formatToolOutput({ error: result.error });
            }
            if (!result.data) {
              return formatToolOutput({
                error: `Change not found: ${changeId}`,
              });
            }

            // Get or create gates
            let gates = result.data.gates ?? createDefaultGates();
            const bundle = getService();
            const projectId = bundle
              ? await getProjectId(activeStore.paths.root)
              : null;
            if (bundle && projectId) {
              const handle = getChangeHandle(
                bundle.client,
                projectId,
                changeId,
              );
              const queriedGates = await querySignal<Gates>(
                handle,
                getGateStatusQuery,
                undefined,
              );
              if (queriedGates && typeof queriedGates === "object") {
                gates = queriedGates;
              }
            }
            const incomplete = getIncompleteGates(gates);
            const canArchive = allGatesSatisfied(gates);
            const nextGate = incomplete.length > 0 ? incomplete[0] : null;

            return formatToolOutput({
              changeId,
              gates,
              incomplete,
              canArchive,
              nextGate,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          } catch (error) {
            const err = error as Error;
            if (err.name === "AdvProjectContextMismatch") {
              const context = getContextMismatchFields(err);
              return formatToolOutput({
                error: err.message,
                changeId,
                errorClass: "AdvProjectContextMismatch",
                owningProjectId: context.owningProjectId,
                currentProjectId: context.currentProjectId,
                hint: "Open the change in its owning project's context, or verify the linked-project configuration.",
              });
            }
            throw error;
          }
        },
      );
    },
  },

  adv_gate_complete: {
    description:
      "Mark a gate as complete for a change. Enforces sequence - prior gates must be complete first.",
    args: {
      changeId: z
        .string()
        .describe(
          "Change ID — must match an existing change from `adv_change_list`. Sequence is strict: proposal → discovery → design → planning → execution → acceptance → release. Prior gates must all be `done`.",
        ),
      gateId: z
        .enum([
          "proposal",
          "discovery",
          "design",
          "planning",
          "execution",
          "acceptance",
          "release",
        ])
        .describe(
          "Gate to mark complete. Valid values: proposal, discovery, design, planning, execution, acceptance, release. Each gate is owned by a specific `/adv-*` command — complete it only after the owning workflow has run.",
        ),
      completedBy: z
        .string()
        .optional()
        .describe(
          "Who completed the gate (default: agent). Values matching `user` or starting with `user:` are treated as human actors with explicit authority and bypass the manifest-driven boundary check; agent values are validated against the command manifest's gate ownership.",
        ),
      userApproved: z
        .boolean()
        .optional()
        .describe(
          "Required for planning gate. Must be true — planning is the only machine-enforced HITL gate and the last human checkpoint before autonomous execution. Confirms the user explicitly approved the prep contract. Ignored for other gates.",
        ),
      notes: z
        .string()
        .optional()
        .describe("Optional notes about the gate completion"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
        ),
      target_confirmed: z.literal(true).optional(),
      confirmationEvidence: z.string().optional(),
    },
    execute: async (
      {
        changeId,
        gateId,
        completedBy = "agent",
        userApproved,
        notes,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        gateId: GateId;
        completedBy?: string;
        userApproved?: boolean;
        notes?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runComplete = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        // Validate gate ID
        if (!GATE_ORDER.includes(gateId)) {
          return formatToolOutput({
            error: `Invalid gate ID: ${gateId}. Valid gates: ${GATE_ORDER.join(", ")}`,
          });
        }

        let change: Change;
        try {
          const result = await activeStore.changes.get(changeId);
          if (!result.success) {
            return formatToolOutput({ error: result.error });
          }
          if (!result.data) {
            return formatToolOutput({ error: `Change not found: ${changeId}` });
          }
          change = result.data;
        } catch (error) {
          const err = error as Error;
          if (err.name === "AdvProjectContextMismatch") {
            const context = getContextMismatchFields(err);
            return formatToolOutput({
              error: err.message,
              changeId,
              errorClass: "AdvProjectContextMismatch",
              owningProjectId: context.owningProjectId,
              currentProjectId: context.currentProjectId,
              hint: "Open the change in its owning project's context, or verify the linked-project configuration.",
            });
          }
          throw error;
        }

        let gates: Gates = change.gates ?? createDefaultGates();

        const bundle = getService();
        if (!bundle) {
          return formatToolOutput({
            error: "Temporal service not available",
            changeId,
            gateId,
          });
        }
        const projectId = await getProjectId(activeStore.paths.root);
        if (!projectId) {
          return formatToolOutput({
            error: "Could not resolve project ID",
            changeId,
            gateId,
          });
        }
        const handle = getChangeHandle(bundle.client, projectId, changeId);
        const queriedGates = await querySignal<Gates>(
          handle,
          getGateStatusQuery,
          undefined,
        );
        if (queriedGates && typeof queriedGates === "object") {
          gates = queriedGates;
        }

        // Check sequence enforcement
        if (!canCompleteGate(gates, gateId)) {
          const blockedBy = GATE_ORDER.slice(
            0,
            GATE_ORDER.indexOf(gateId),
          ).filter((g) => gates[g].status !== "done");
          return formatToolOutput({
            error: `Cannot complete ${gateId}: prior gate(s) incomplete`,
            blockedBy,
          });
        }

        const isolation = await evaluateGateWorktreeIsolation({
          gateId,
          features: activeStore.config?.features,
          cwd: process.cwd(),
          change,
          // Block D wires the auto-create runtime here (target_path /
          // scope_repos routing); for now the helper falls back to the
          // structural defensive failure on missing resumeRuntime, which
          // surfaces a clear AC6 error rather than a vague NPE.
        });
        if (isolation.decision === "BLOCK") {
          return formatToolOutput({
            error: isolation.reason,
            errorClass: isolation.errorClass,
            code: isolation.code,
            changeId,
            gateId,
            mainCheckoutPath: isolation.mainCheckoutPath,
            expectedWorktreePath: isolation.expectedWorktreePath,
            underlying_error: isolation.underlying_error,
            remediation: isolation.remediation,
          });
        }

        // Boundary validation: check if the completing command owns this gate
        const boundaryWarning = validateGateBoundary(gateId, completedBy);

        if (gateId === "planning") {
          return handlePlanningGateCompletion({
            store: activeStore,
            change,
            changeId,
            gateId,
            gates,
            userApproved,
            notes,
            completedBy,
            boundaryWarning,
          });
        }

        if (gateId === "execution") {
          const workflowTasks = await querySignal<Task[]>(
            handle,
            changeTasksQuery,
            undefined,
            undefined,
          );
          const tasks = Array.isArray(workflowTasks)
            ? workflowTasks
            : change.tasks;
          const incompleteTasks = tasks.filter(
            (t) => t.status !== "done" && t.status !== "cancelled",
          );
          if (incompleteTasks.length > 0) {
            return formatToolOutput({
              error: `Cannot complete execution: ${incompleteTasks.length} task(s) not done or cancelled`,
              incompleteTasks: incompleteTasks.map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
              })),
            });
          }
          // All tasks done/cancelled (or empty list) — fall through
        }

        // Signal-driven mutation: fire gateCompletedSignal after
        // sequence/task checks pass. rq-cacheRefresh01: helper invalidates
        // the cache so completeGateAndBuildResponse + subsequent reads
        // see the fresh gate-done state.
        await fireSignalAndRefresh(
          handle,
          activeStore,
          changeId,
          gateCompletedSignal,
          {
            gateId,
            completedBy,
            completedAt: new Date().toISOString(),
            approvalEvidence: notes,
          },
        );

        const postSignalGate = await waitForGateCompletionResult(
          handle,
          gateId,
        );
        if (postSignalGate?.status === "stuck") {
          return workflowReadinessBlockedResponse({
            changeId,
            gateId,
            gate: postSignalGate,
          });
        }
        if (postSignalGate?.status !== "done") {
          return gateCompletionNotConfirmedResponse({
            changeId,
            gateId,
            gate: postSignalGate,
          });
        }

        return completeGateAndBuildResponse({
          store: activeStore,
          change,
          changeId,
          gateId,
          gates: { ...gates, [gateId]: postSignalGate },
          notes,
          completedBy,
          boundaryWarning,
          extraPayload: projectContext
            ? { _projectContext: projectContext }
            : {},
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
            runComplete(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runComplete(store);
    },
  },
};

// =============================================================================
// Boundary Validation
// =============================================================================

/**
 * Check if the completing command is authorized to complete this gate.
 * Returns a warning string if boundary violation detected, undefined otherwise.
 *
 * Uses the manifest scope.gates field to determine which commands own which gates.
 * This is advisory (warning) not blocking — the gate still completes.
 */
export function validateGateBoundary(
  gateId: GateId,
  completedBy: string,
): string | undefined {
  if (completedBy === "user" || completedBy.startsWith("user:")) {
    return undefined;
  }

  // Find all commands that claim this gate in their scope
  const authorizedCommands: string[] = [];
  for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
    if (def.scope?.gates.includes(gateId)) {
      authorizedCommands.push(name);
    }
  }

  // If no commands claim this gate, skip validation
  if (authorizedCommands.length === 0) return undefined;

  // Extract command name from completedBy (may contain extra context like "adv-task LBP validation: ...")
  const commandName = completedBy.split(/\s/)[0];

  // "agent" is the default — no boundary check possible.
  // ADV runtime/provider actors are not slash-command IDs. Boundary validation
  // only applies when completedBy explicitly starts with a known command from
  // COMMAND_MANIFEST.
  if (commandName === "agent") return undefined;
  if (!Object.hasOwn(COMMAND_MANIFEST, commandName)) return undefined;

  // Check if the completing command (or its prefix) matches an authorized command
  const isAuthorized = authorizedCommands.some(
    (cmd) => commandName === cmd || commandName.startsWith(`${cmd} `),
  );

  if (!isAuthorized) {
    return `Gate '${gateId}' is owned by [${authorizedCommands.join(", ")}] but was completed by '${completedBy}'. This may indicate a command boundary violation. See specs adv-proposal, adv-discover, adv-prep for gate ownership rules.`;
  }

  return undefined;
}
