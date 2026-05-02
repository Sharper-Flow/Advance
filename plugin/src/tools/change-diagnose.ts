/**
 * Change Diagnose Tool
 *
 * Read-only divergence inspector that compares disk state vs Temporal store
 * state for one change and recommends a fix.
 */

import { z } from "zod";
import { loadChange } from "../storage/json";
import type { Store } from "../storage/store-types";
import type { Change, Gates } from "../types";
import { GATE_ORDER } from "../types";
import { buildChangeWorkflowId } from "../temporal/client";
import { getProjectId } from "../utils/project-id";
import { withOptionalTargetPathStore } from "./target-project";

function summarizeGates(gates?: Gates): Record<string, string> | undefined {
  if (!gates) return undefined;
  const result: Record<string, string> = {};
  for (const gateId of GATE_ORDER) {
    result[gateId] = gates[gateId]?.status ?? "pending";
  }
  return result;
}

function countTasks(change?: Change | null): number {
  return change?.tasks?.length ?? 0;
}

function buildDivergences(
  diskChange: Change | null,
  temporalChange: Change | null,
): Array<{ field: string; disk: unknown; temporal: unknown }> {
  const divergences: Array<{
    field: string;
    disk: unknown;
    temporal: unknown;
  }> = [];

  if (!diskChange && !temporalChange) {
    return divergences;
  }

  if (!diskChange && temporalChange) {
    divergences.push({
      field: "existence",
      disk: "missing",
      temporal: "present",
    });
    return divergences;
  }

  if (diskChange && !temporalChange) {
    divergences.push({
      field: "existence",
      disk: "present",
      temporal: "missing",
    });
    return divergences;
  }

  // Compare status
  if (diskChange!.status !== temporalChange!.status) {
    divergences.push({
      field: "status",
      disk: diskChange!.status,
      temporal: temporalChange!.status,
    });
  }

  // Compare gates
  const diskGates = summarizeGates(diskChange!.gates);
  const temporalGates = summarizeGates(temporalChange!.gates);

  for (const gateId of GATE_ORDER) {
    const diskStatus = diskGates?.[gateId];
    const temporalStatus = temporalGates?.[gateId];
    if (diskStatus !== temporalStatus) {
      divergences.push({
        field: `gates.${gateId}.status`,
        disk: diskStatus,
        temporal: temporalStatus,
      });
    }
  }

  return divergences;
}

function buildRecommendedFix(
  diskChange: Change | null,
  temporalChange: Change | null,
  divergences: Array<{ field: string }>,
): string {
  if (divergences.length === 0) {
    return "No divergence detected. Both disk and Temporal agree.";
  }

  if (!diskChange && temporalChange) {
    return "Temporal has change but disk does not. Likely cleanup-after-archive race; run `adv_archive_sweep_orphans dryRun: true includeClosed: true` to investigate.";
  }

  if (diskChange && !temporalChange) {
    return "Change exists on disk but not in Temporal. Run `adv_change_import source_path: <dir>`.";
  }

  const hasGateDiff = divergences.some((d) => d.field.startsWith("gates."));
  if (hasGateDiff) {
    return "Gates differ between disk and Temporal. Run `adv_workflow_repair changeId: <id>` to rebind.";
  }

  return "Divergence detected. Review the field-level differences above.";
}

export const changeDiagnoseTools = {
  adv_change_diagnose: {
    description:
      "Read-only divergence inspector that compares disk state vs Temporal store state for one change and recommends a fix.",
    args: {
      changeId: z.string().describe("Change ID to diagnose"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe("Confirmation flag for untrusted target_path mutations"),
      confirmationEvidence: z
        .string()
        .optional()
        .describe("Evidence string for target_path confirmation"),
    },
    execute: async (
      args: {
        changeId: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path: args.target_path },
        async (activeStore, projectContext) => {
          const diskResult = await loadChange(
            activeStore.paths.changes,
            args.changeId,
          );
          const temporalResult = await activeStore.changes.get(args.changeId);

          const diskChange = diskResult.success ? diskResult.data : null;
          const temporalChange = temporalResult.success
            ? temporalResult.data
            : null;

          const divergences = buildDivergences(diskChange, temporalChange);

          let workflowId: string | undefined;
          try {
            const projectId = await getProjectId(activeStore.paths.root);
            if (projectId) {
              workflowId = buildChangeWorkflowId(projectId, args.changeId);
            }
          } catch {
            // ignore — workflowId stays undefined
          }

          const response: Record<string, unknown> = {
            changeId: args.changeId,
            disk: {
              gates: summarizeGates(diskChange?.gates ?? undefined),
              status: diskChange?.status ?? "unknown",
              taskCount: countTasks(diskChange),
              source_path: diskChange
                ? `${activeStore.paths.changes}/${args.changeId}`
                : null,
            },
            temporal: {
              gates: summarizeGates(temporalChange?.gates ?? undefined),
              status: temporalChange?.status ?? "unknown",
              workflowId: workflowId ?? "unknown",
              ...(temporalResult.success
                ? {}
                : { queryError: temporalResult.error }),
            },
            divergences,
            recommendedFix: buildRecommendedFix(
              diskChange,
              temporalChange,
              divergences,
            ),
          };

          if (projectContext) {
            response._projectContext = projectContext;
          }

          return JSON.stringify(response, null, 2);
        },
      );
    },
  },
};
