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
import { fireSignal, querySignal, getChangeHandle } from "./_adapters";
import {
  changeTasksQuery,
  gateCompletedSignal,
  getGateStatusQuery,
} from "../temporal/messages";

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
  await fireSignal(handle, gateCompletedSignal, {
    gateId,
    completedBy,
    completedAt: new Date().toISOString(),
    approvalEvidence: notes,
  });

  return completeGateAndBuildResponse({
    store,
    change,
    changeId,
    gateId,
    gates,
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
        .describe("Who completed the gate (default: agent)"),
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

        // Signal-driven mutation: fire gateCompletedSignal after sequence/task checks pass
        await fireSignal(handle, gateCompletedSignal, {
          gateId,
          completedBy,
          completedAt: new Date().toISOString(),
          approvalEvidence: notes,
        });

        return completeGateAndBuildResponse({
          store: activeStore,
          change,
          changeId,
          gateId,
          gates,
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
function validateGateBoundary(
  gateId: GateId,
  completedBy: string,
): string | undefined {
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
  // Provider-specific ADV agents (for example adv-gpt/adv-claude) are actors,
  // not slash-command IDs. Boundary validation only applies when completedBy
  // explicitly starts with a known command from COMMAND_MANIFEST.
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
