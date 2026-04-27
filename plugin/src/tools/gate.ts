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
  type FeatureFlags,
  type Change,
  GATE_ORDER,
  canCompleteGate,
  getIncompleteGates,
  allGatesSatisfied,
  createDefaultGates,
} from "../types";
import { wrapWithBanner } from "../utils/banner";
import { formatToolOutput } from "../utils/tool-output";
import { runPrepReadinessChecks } from "../validator/prep-readiness";
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { loadProposalWithFallback } from "../storage/json";
import { buildChangeContextSnapshot } from "../utils/context-snapshot";
import { COMMAND_MANIFEST } from "../manifest";

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

  try {
    await store.gates.complete(changeId, gateId, notes);
  } catch (saveError) {
    if ((saveError as Error).name === "AdvProjectContextMismatch") {
      const e = saveError as unknown as Record<string, unknown>;
      return formatToolOutput({
        error: (saveError as Error).message,
        changeId,
        gateId,
        errorClass: "AdvProjectContextMismatch",
        owningProjectId: e.owningProjectId,
        currentProjectId: e.currentProjectId,
        hint: "Open the change in its owning project's context, or verify the linked-project configuration.",
      });
    }
    return formatToolOutput({
      error: `Failed to complete gate: ${(saveError as Error).message}`,
      changeId,
      gateId,
      hint: "Gate state was not persisted. Retry the operation.",
    });
  }

  const changeDir = join(store.paths.changes, changeId);
  const { content: proposalText } = await loadProposalWithFallback(
    changeDir,
    change.title,
  );

  return wrapWithBanner(
    { command: "adv_gate_complete", target: `${changeId}:${gateId}` },
    formatToolOutput({
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
    }),
  );
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
    },
    execute: async ({ changeId }: { changeId: string }, store: Store) => {
      try {
        const result = await store.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }

        // Get or create gates
        const gates = result.data.gates ?? createDefaultGates();
        const incomplete = getIncompleteGates(gates);
        const canArchive = allGatesSatisfied(gates);
        const nextGate = incomplete.length > 0 ? incomplete[0] : null;

        return formatToolOutput({
          changeId,
          gates,
          incomplete,
          canArchive,
          nextGate,
        });
      } catch (error) {
        if ((error as Error).name === "AdvProjectContextMismatch") {
          const e = error as unknown as Record<string, unknown>;
          return formatToolOutput({
            error: (error as Error).message,
            changeId,
            errorClass: "AdvProjectContextMismatch",
            owningProjectId: e.owningProjectId,
            currentProjectId: e.currentProjectId,
            hint: "Open the change in its owning project's context, or verify the linked-project configuration.",
          });
        }
        throw error;
      }
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
    },
    execute: async (
      {
        changeId,
        gateId,
        completedBy = "agent",
        userApproved,
        notes,
      }: {
        changeId: string;
        gateId: GateId;
        completedBy?: string;
        userApproved?: boolean;
        notes?: string;
      },
      store: Store,
    ) => {
      // Validate gate ID
      if (!GATE_ORDER.includes(gateId)) {
        return formatToolOutput({
          error: `Invalid gate ID: ${gateId}. Valid gates: ${GATE_ORDER.join(", ")}`,
        });
      }

      let change: Change;
      try {
        const result = await store.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }
        change = result.data;
      } catch (error) {
        if ((error as Error).name === "AdvProjectContextMismatch") {
          const e = error as unknown as Record<string, unknown>;
          return formatToolOutput({
            error: (error as Error).message,
            changeId,
            errorClass: "AdvProjectContextMismatch",
            owningProjectId: e.owningProjectId,
            currentProjectId: e.currentProjectId,
            hint: "Open the change in its owning project's context, or verify the linked-project configuration.",
          });
        }
        throw error;
      }

      const gates: Gates = change.gates ?? createDefaultGates();

      // Check sequence enforcement
      if (!canCompleteGate(gates, gateId)) {
        const blockedBy = GATE_ORDER.slice(
          0,
          GATE_ORDER.indexOf(gateId),
        ).filter(
          (g) => gates[g].status !== "done" && gates[g].status !== "legacy",
        );
        return formatToolOutput({
          error: `Cannot complete ${gateId}: prior gate(s) incomplete`,
          blockedBy,
        });
      }

      // Boundary validation: check if the completing command owns this gate
      const boundaryWarning = validateGateBoundary(gateId, completedBy);

      if (gateId === "planning") {
        return handlePlanningGateCompletion({
          store,
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

      return completeGateAndBuildResponse({
        store,
        change,
        changeId,
        gateId,
        gates,
        notes,
        completedBy,
        boundaryWarning,
      });
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

  // Check if the completing command (or its prefix) matches an authorized command
  const isAuthorized = authorizedCommands.some(
    (cmd) => commandName === cmd || commandName.startsWith(`${cmd} `),
  );

  // "agent" is the default — no boundary check possible
  if (commandName === "agent") return undefined;

  if (!isAuthorized) {
    return `Gate '${gateId}' is owned by [${authorizedCommands.join(", ")}] but was completed by '${completedBy}'. This may indicate a command boundary violation. See specs adv-proposal, adv-discover, adv-prep for gate ownership rules.`;
  }

  return undefined;
}
