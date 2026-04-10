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
  GateIdSchema,
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
import {
  countSuccessCriteria,
  formatContextSnapshot,
} from "../utils/context-snapshot";
import { COMMAND_MANIFEST } from "../manifest";
import type { Change } from "../types";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a context snapshot for a gate completion response.
 * Reads the latest gates from the store so the snapshot reflects the
 * just-persisted state.
 */
async function buildGateContextSnapshot(
  store: Store,
  change: Change,
): Promise<string> {
  const latestGates = await store.gates.get(change.id);
  const changeDir = join(store.paths.changes, change.id);
  const { content: proposalText } = await loadProposalWithFallback(
    changeDir,
    change.title,
  );

  const taskCounts = {
    done: change.tasks.filter((t) => t.status === "done").length,
    in_progress: change.tasks.filter((t) => t.status === "in_progress").length,
    pending: change.tasks.filter((t) => t.status === "pending").length,
    cancelled: change.tasks.filter((t) => t.status === "cancelled").length,
  };
  const currentTask = change.tasks.find((t) => t.status === "in_progress");

  return formatContextSnapshot({
    changeId: change.id,
    title: change.title,
    successCriteriaCount: countSuccessCriteria(proposalText),
    gates: latestGates ?? undefined,
    taskCounts,
    workdir: store.paths.root,
    currentTask: currentTask
      ? { id: currentTask.id, title: currentTask.title }
      : undefined,
  });
}

type PlanningReadinessResult =
  | { kind: "block"; response: string }
  | { kind: "allow"; extras: Record<string, unknown> };

/**
 * Run prep + clarify readiness checks for the planning gate.
 * Returns either a blocking error response, or an "allow" result with any
 * advisory payload (warnings / clarify warnings) to include in the success
 * response.
 */
async function runPlanningReadinessChecks(
  store: Store,
  change: Change,
  gateId: GateId,
): Promise<PlanningReadinessResult> {
  const features = store.config?.features as FeatureFlags | undefined;
  const tddEnforcement = features?.tdd_enforcement ?? "strict";
  const readiness = runPrepReadinessChecks(change, tddEnforcement);

  if (!readiness.passed) {
    return {
      kind: "block",
      response: formatToolOutput({
        error: `Planning gate blocked: ${readiness.mustFailures.length} readiness failure(s) must be resolved`,
        changeId: change.id,
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
      }),
    };
  }

  const extras: Record<string, unknown> = {};

  if (readiness.warnings.length > 0) {
    extras.readinessWarnings = readiness.warnings.map((w) => ({
      code: w.code,
      message: w.message,
      path: w.path,
    }));
  }

  // Clarify-readiness enforcement (runs after prep-readiness passes)
  const clarifyMode = features?.clarify_enforcement ?? "advisory";
  if (clarifyMode !== "off") {
    const changeDir = join(store.paths.changes, change.id);
    const { content: proposalText } = await loadProposalWithFallback(
      changeDir,
      change.title,
    );

    const clarifyResult = runClarifyReadinessChecks(change, proposalText);

    if (clarifyResult.findings.length > 0) {
      if (clarifyMode === "strict") {
        return {
          kind: "block",
          response: formatToolOutput({
            error: `Planning gate blocked: ${clarifyResult.findings.length} ambiguity finding(s) must be resolved via /adv-clarify`,
            changeId: change.id,
            gateId,
            clarifyFindings: clarifyResult.findings.map((f) => ({
              code: f.code,
              severity: f.severity,
              message: f.message,
              questionCategory: f.details?.questionCategory,
            })),
            hint: `Run /adv-clarify ${change.id} to resolve ambiguity findings, then retry adv_gate_complete.`,
          }),
        };
      }
      // advisory mode: include as warnings, don't block
      extras.clarifyWarnings = clarifyResult.findings.map((f) => ({
        code: f.code,
        message: f.message,
        questionCategory: f.details?.questionCategory,
      }));
    }
  }

  return { kind: "allow", extras };
}

/**
 * Persist the gate completion and build the user-facing response.
 * Centralizes the try/catch + success banner so all gate paths use the
 * same behavior.
 */
async function persistGateCompletion(
  store: Store,
  change: Change,
  gateId: GateId,
  completedBy: string,
  extras: Record<string, unknown>,
  boundaryWarning: string | undefined,
  notes?: string,
): Promise<string> {
  try {
    await store.gates.complete(change.id, gateId, notes);
  } catch (saveError) {
    return formatToolOutput({
      error: `Failed to complete gate: ${(saveError as Error).message}`,
      changeId: change.id,
      gateId,
      hint: "Gate state was not persisted. Retry the operation.",
    });
  }

  const now = new Date().toISOString();
  return wrapWithBanner(
    { command: "adv_gate_complete", target: `${change.id}:${gateId}` },
    formatToolOutput({
      success: true,
      changeId: change.id,
      gateId,
      status: "done",
      completed_at: now,
      completed_by: completedBy,
      _contextSnapshot: await buildGateContextSnapshot(store, change),
      ...(boundaryWarning ? { boundaryWarning } : {}),
      ...extras,
    }),
  );
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const gateTools = {
  adv_gate_status: {
    description:
      "Get gate status for a change. Returns all 7 gates with completion status, timestamps, and next gate to complete.",
    args: {
      changeId: z.string().describe("Change ID"),
    },
    execute: async ({ changeId }: { changeId: string }, store: Store) => {
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
    },
  },

  adv_gate_complete: {
    description:
      "Mark a gate as complete for a change. Enforces sequence - prior gates must be complete first.",
    args: {
      changeId: z.string().describe("Change ID"),
      gateId: GateIdSchema.describe("Gate to mark complete"),
      completedBy: z
        .string()
        .optional()
        .describe("Who completed the gate (default: agent)"),
      notes: z
        .string()
        .optional()
        .describe(
          "Key decisions or context to persist alongside gate completion",
        ),
    },
    execute: async (
      {
        changeId,
        gateId,
        completedBy = "agent",
        notes,
      }: {
        changeId: string;
        gateId: GateId;
        completedBy?: string;
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

      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({ error: `Change not found: ${changeId}` });
      }

      const change = result.data;
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

      // Planning gate has extra readiness checks before we persist.
      let extras: Record<string, unknown> = {};
      if (gateId === "planning") {
        const planning = await runPlanningReadinessChecks(
          store,
          change,
          gateId,
        );
        if (planning.kind === "block") {
          return planning.response;
        }
        extras = planning.extras;
      }

      // Execution gate: all non-cancelled tasks must be done.
      if (gateId === "execution") {
        const incompleteTasks = (change.tasks ?? []).filter(
          (t) => t.status !== "done" && t.status !== "cancelled",
        );
        if (incompleteTasks.length > 0) {
          return formatToolOutput({
            error: `Cannot complete execution gate: ${incompleteTasks.length} task(s) not done`,
            incompleteTasks: incompleteTasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
            })),
          });
        }
      }

      return persistGateCompletion(
        store,
        change,
        gateId,
        completedBy,
        extras,
        boundaryWarning,
        notes,
      );
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
    return `Gate '${gateId}' is owned by [${authorizedCommands.join(", ")}] but was completed by '${completedBy}'. This may indicate a command boundary violation. See specs adv-proposal, adv-research, adv-prep for gate ownership rules.`;
  }

  return undefined;
}
