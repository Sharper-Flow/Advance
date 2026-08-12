/** Handler definitions for misc change tools. */
import { z } from "zod";
import { GateIdSchema, type GateId, type Change } from "../../types";
import type { Store } from "../../storage/store";
import { buildReentryResult } from "./recovery";
import { formatToolOutput } from "../../utils/tool-output";
import {
  formatTargetProjectContext,
  type TargetProjectContext,
  withTargetPathStore,
  appendTargetProjectContextOutput,
} from "../target-project";
import { includeSnapshotSchema } from "../shared-args";
import { coordinateChangeMutation } from "../change-mutation-coordinator";
import { GATE_ORDER } from "../../types";

export const advChangeReenterHandler = async (
  {
    changeId,
    fromGate,
    reason,
    scopeDelta,
    approvalEvidence: _approvalEvidence,
    dryRun,
    target_path,
    target_confirmed,
    confirmationEvidence,
    include,
  }: {
    changeId: string;
    fromGate: GateId;
    reason: string;
    scopeDelta?: string;
    approvedByUser?: boolean;
    approvalEvidence?: string;
    dryRun?: boolean;
    target_path?: string;
    target_confirmed?: true;
    confirmationEvidence?: string;
    include?: { snapshot?: boolean };
  },
  store: Store,
) => {
  const runReenter = async (
    activeStore: Store,
    projectContext?: TargetProjectContext,
  ) => {
    const result = await activeStore.changes.get(changeId);
    if (!result.success) {
      return formatToolOutput({ error: result.error });
    }
    if (!result.data) {
      return formatToolOutput({
        error: `Change not found: ${changeId}`,
        changeId,
      });
    }

    // M2a (terminatechangeworkflowonarchi): change workflows now Complete
    // on archive/close. Reenter on a Completed workflow would fail with an
    // opaque completed-operation error. Reject
    // at the tool layer with a domain-level message and remediation hint.
    if (result.data.status === "archived" || result.data.status === "closed") {
      return formatToolOutput({
        error: `Cannot reenter ${result.data.status} change ${changeId}. Reenter is for scope expansion on active changes; archived/closed changes cannot be reopened. Use adv_doctor if workflow recovery is needed.`,
        changeId,
      });
    }

    if (dryRun) {
      return formatToolOutput({
        success: true,
        dryRun: true,
        changeId,
        fromGate,
        reason,
        scopeDelta,
        ...(projectContext
          ? { _projectContext: formatTargetProjectContext(projectContext) }
          : {}),
        message: `Would reenter change ${changeId} from ${fromGate}.`,
      });
    }

    try {
      const reenteredAt = new Date().toISOString();
      const fromIndex = GATE_ORDER.indexOf(fromGate);
      const outcome = await coordinateChangeMutation<Change>({
        authority: {
          reason: `reenter change from ${fromGate}`,
          evidence: _approvalEvidence ?? reason,
        },
        changesDir: activeStore.paths.changes,
        intent: {
          changeId,
          mutationKind: "gate_reentry",
          mutateLatestProjection: (latest) => ({
            ...latest,
            gates: Object.fromEntries(
              GATE_ORDER.map((gateId, index) => [
                gateId,
                index >= fromIndex
                  ? { status: "pending" }
                  : (latest.gates?.[gateId] ?? { status: "pending" }),
              ]),
            ) as Change["gates"],
            reentry_history: [
              ...(latest.reentry_history ?? []),
              {
                from_gate: fromGate,
                reason,
                scope_delta: scopeDelta,
                reopened_by: "agent",
                approval_evidence: _approvalEvidence,
                reopened_at: reenteredAt,
                gates_reset: GATE_ORDER.slice(fromIndex),
              },
            ],
          }),
          verifyProjection: (readback) =>
            readback.gates?.[fromGate]?.status === "pending" &&
            readback.reentry_history?.some(
              (entry) => entry.reopened_at === reenteredAt,
            ) === true,
        },
      });
      if (outcome.kind !== "verified") {
        return formatToolOutput({
          error:
            outcome.kind === "unverified"
              ? outcome.reason
              : "Gate re-entry mutation was not verified.",
          changeId,
        });
      }
      const output = await buildReentryResult(
        activeStore,
        changeId,
        fromGate,
        include?.snapshot ?? false,
      );
      return projectContext
        ? appendTargetProjectContextOutput(output, projectContext)
        : output;
    } catch (error) {
      return formatToolOutput({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (target_path) {
    try {
      return await withTargetPathStore(
        {
          currentProjectPath: store.paths.root,
          target_path,
          target_confirmed,
          confirmationEvidence,
          stateRequirement: dryRun ? "snapshot-ok" : "authoritative",
          mutation: dryRun ? false : undefined,
        },
        async ({ context, store: targetStore }) =>
          runReenter(targetStore, context),
      );
    } catch (error) {
      return formatToolOutput({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return runReenter(store);
};

export const miscChangeTools = {
  adv_change_reenter: {
    description:
      "Reopen gates from a specified point for scope expansion re-entry. Resets the target gate and all downstream gates to pending, preserving existing tasks and completed work.",
    args: {
      changeId: z.string().describe("Change ID to reopen gates for"),
      fromGate: GateIdSchema.describe("Gate to reopen from"),
      reason: z.string().describe("Why re-entry is needed"),
      scopeDelta: z
        .string()
        .optional()
        .describe("Description of new or changed scope"),
      approvedByUser: z
        .boolean()
        .optional()
        .describe(
          "Deprecated compatibility field. Re-entry no longer requires explicit user approval.",
        ),
      approvalEvidence: z
        .string()
        .optional()
        .describe(
          "Optional audit evidence when re-entry follows an explicit user instruction.",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview re-entry without firing gate reset signal."),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, routes the re-entry through that project's disk-backed store.",
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
      ...includeSnapshotSchema.shape,
    },
    execute: advChangeReenterHandler,
  },
};
