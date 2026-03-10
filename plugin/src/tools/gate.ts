/**
 * Gate Tools
 *
 * Tools for 6-gate quality checklist management.
 */

import { z } from "zod";
import { join } from "path";
import type { Store } from "../storage/store";
import {
  type GateId,
  type Gates,
  type FeatureFlags,
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

// =============================================================================
// Tool Definitions
// =============================================================================

export const gateTools = {
  adv_gate_status: {
    description:
      "Get gate status for a change. Returns all 6 gates with completion status, timestamps, and next gate to complete.",
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
      gateId: z
        .enum([
          "research",
          "prep",
          "implementation",
          "review",
          "harden",
          "signoff",
        ])
        .describe("Gate to mark complete"),
      completedBy: z
        .string()
        .optional()
        .describe("Who completed the gate (default: agent)"),
    },
    execute: async (
      {
        changeId,
        gateId,
        completedBy = "agent",
      }: {
        changeId: string;
        gateId: GateId;
        completedBy?: string;
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
      const buildContextSnapshot = async () => {
        const latestGates = await store.gates.get(changeId);
        const changeDir = join(store.paths.changes, changeId);
        const { content: proposalText } = await loadProposalWithFallback(
          changeDir,
          change.title,
        );
        const taskCounts = {
          done: change.tasks.filter((t) => t.status === "done").length,
          in_progress: change.tasks.filter((t) => t.status === "in_progress")
            .length,
          pending: change.tasks.filter((t) => t.status === "pending").length,
          cancelled: change.tasks.filter((t) => t.status === "cancelled")
            .length,
        };
        const currentTask = change.tasks.find(
          (t) => t.status === "in_progress",
        );

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
      };

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

      // Prep gate: run readiness checks before marking done
      if (gateId === "prep") {
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
        // Warnings-only: gate proceeds but advisory warnings included in response
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

        // Clarify-readiness enforcement (runs after prep-readiness passes)
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
            // advisory mode: include as warnings, don't block
            clarifyPayload = {
              clarifyWarnings: clarifyResult.findings.map((f) => ({
                code: f.code,
                message: f.message,
                questionCategory: f.details?.questionCategory,
              })),
            };
          }
        }

        // Mark gate complete via store
        try {
          await store.gates.complete(changeId, gateId);
        } catch (saveError) {
          return formatToolOutput({
            error: `Failed to complete gate: ${(saveError as Error).message}`,
            changeId,
            gateId,
            hint: "Gate state was not persisted. Retry the operation.",
          });
        }

        const now = new Date().toISOString();
        return wrapWithBanner(
          { command: "adv_gate_complete", target: `${changeId}:${gateId}` },
          formatToolOutput({
            success: true,
            changeId,
            gateId,
            status: "done",
            completed_at: now,
            completed_by: completedBy,
            _contextSnapshot: await buildContextSnapshot(),
            ...warningsPayload,
            ...clarifyPayload,
          }),
        );
      }

      // Mark gate complete via store (handles locking and sequence enforcement)
      try {
        await store.gates.complete(changeId, gateId);
      } catch (saveError) {
        return formatToolOutput({
          error: `Failed to complete gate: ${(saveError as Error).message}`,
          changeId,
          gateId,
          hint: "Gate state was not persisted. Retry the operation.",
        });
      }

      const now = new Date().toISOString();
      return wrapWithBanner(
        { command: "adv_gate_complete", target: `${changeId}:${gateId}` },
        formatToolOutput({
          success: true,
          changeId,
          gateId,
          status: "done",
          completed_at: now,
          completed_by: completedBy,
          _contextSnapshot: await buildContextSnapshot(),
        }),
      );
    },
  },
};
