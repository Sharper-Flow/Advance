/**
 * Snapshot Health Tool
 *
 * ADV tool wrapper over snapshot-scan.ts. Provides scan (read-only) and
 * repair (approval-gated) actions with agenda audit entries.
 */

import { basename } from "node:path";
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import { agendaTools } from "./agenda";
import {
  scanSnapshotHealth,
  executeRepair,
  type SnapshotHealthOutput,
  type RepairAction,
  type RepairActionRecord,
} from "./snapshot-scan";
import { getProjectId } from "../utils/project-id";
import type { Store } from "../storage/store";

// =============================================================================
// Constants
// =============================================================================

const REPAIR_ACTION_ENUM = [
  "delete_stale_locks",
  "delete_zero_byte_objects",
  "delete_orphan_bare_repos",
  "delete_fsck_corrupt_repos",
] as const;

// =============================================================================
// Tool Definitions
// =============================================================================

export const snapshotHealthTools = {
  adv_snapshot_health: {
    description:
      "Detect and remediate OpenCode snapshot-store corruption. " +
      "Default action 'scan' is read-only and returns structured findings. " +
      "Action 'repair' requires approvedByUser:true, approvalEvidence, and repair_actions whitelist. " +
      "Use scope:'global' to scan all OpenCode projects (read still safe; repair requires explicit approval).",
    args: {
      action: z
        .enum(["scan", "repair"])
        .default("scan")
        .describe("scan = read-only detection; repair = approval-gated fix"),
      scope: z
        .enum(["project", "global"])
        .default("project")
        .describe(
          "project = caller-project snapshot dir; global = all OpenCode projects",
        ),
      repair_actions: z
        .array(z.enum(REPAIR_ACTION_ENUM))
        .optional()
        .describe(
          "Which repair actions to apply. Required when action=repair.",
        ),
      approvedByUser: z
        .boolean()
        .optional()
        .describe("Required for repair. Must be true."),
      approvalEvidence: z
        .string()
        .optional()
        .describe(
          "Required for repair. Human-readable summary of what is being approved.",
        ),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe("Preview repair actions without executing."),
    },
    execute: async (
      args: {
        action: "scan" | "repair";
        scope: "project" | "global";
        repair_actions?: RepairAction[];
        approvedByUser?: boolean;
        approvalEvidence?: string;
        dryRun?: boolean;
      },
      store: Store,
    ) => {
      const projectId = store.paths.external
        ? basename(store.paths.external)
        : await getProjectId(store.paths.root);

      if (!projectId) {
        return formatToolOutput({
          success: false,
          error: "Could not resolve project id from store.",
        });
      }

      if (args.action === "scan") {
        const output = await scanSnapshotHealth({
          scope: args.scope,
          projectId,
        });
        return formatToolOutput(output);
      }

      // ── Repair: pre-flight validation ──────────────────────────────────────
      if (!args.approvedByUser) {
        return formatToolOutput({
          success: false,
          error:
            "approvedByUser must be true. You must present repair actions to the user and obtain explicit approval before calling this tool.",
        });
      }

      if (!args.approvalEvidence || args.approvalEvidence.trim().length === 0) {
        return formatToolOutput({
          success: false,
          error:
            "approvalEvidence is required. Describe how the user approved (e.g., question tool response).",
        });
      }

      if (!args.repair_actions || args.repair_actions.length === 0) {
        return formatToolOutput({
          success: false,
          error:
            "repair_actions is required for repair. Specify at least one action from the whitelist.",
        });
      }

      // Belt-and-suspenders: runtime filter for invalid actions (Zod already
      // enforces the enum at the registry boundary, but direct callers bypass
      // that validation).
      const invalidActions = args.repair_actions.filter(
        (a) => !REPAIR_ACTION_ENUM.includes(a),
      );
      if (invalidActions.length > 0) {
        return formatToolOutput({
          success: false,
          error: `Invalid repair_actions: ${invalidActions.join(", ")}. Allowed: ${REPAIR_ACTION_ENUM.join(", ")}.`,
        });
      }

      const scanOutput = await scanSnapshotHealth({
        scope: args.scope,
        projectId,
      });

      const repairRecords = await executeRepair({
        scope: args.scope,
        projectId,
        findings: scanOutput.findings,
        repairActions: args.repair_actions,
        dryRun: args.dryRun ?? false,
      });

      if (!args.dryRun) {
        for (const record of repairRecords) {
          if (record.status === "success") {
            const finding = scanOutput.findings.find(
              (f) =>
                f.remediation === record.action &&
                f.bare_repo_path === record.target_path,
            );
            const pattern = finding?.pattern ?? "unknown";
            await agendaTools.adv_agenda_add.execute(
              {
                title: `snapshot-repair: ${record.action} on ${basename(record.target_path)}`,
                description: `Finding: ${pattern}. Target: ${record.target_path}. Status: ${record.status}.`,
                priority: "low",
                category: "snapshot-repair",
              },
              store.paths.root,
            );
          }
        }
      }

      const output: SnapshotHealthOutput & {
        repair_preview: {
          actions_planned: number;
          actions_executed: number;
          details: RepairActionRecord[];
        };
      } = {
        ...scanOutput,
        repair_preview: {
          actions_planned: args.repair_actions.length,
          actions_executed: repairRecords.filter((r) => r.status === "success")
            .length,
          details: repairRecords,
        },
      };

      return formatToolOutput(output);
    },
  },
};
