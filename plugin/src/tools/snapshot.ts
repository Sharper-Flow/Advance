/**
 * Snapshot Health Tool
 *
 * ADV tool wrapper over snapshot-scan.ts. Provides scan (read-only) and
 * repair (approval-gated) actions. Every successful repair appends a durable
 * audit entry to the purpose-specific snapshot-repair audit log (NOT to the
 * Agenda store) — see retireAgendaWorkflow AC4 and the "Purpose-specific
 * repair audit" design decision.
 */

import { basename } from "node:path";
import { formatToolOutput } from "../utils/tool-output";
import {
  scanSnapshotHealth,
  executeRepair,
  SNAPSHOT_HEALTH_SCHEMA_VERSION,
  type SnapshotHealthOutput,
  type RepairAction,
  type RepairActionRecord,
} from "./snapshot-scan";
import {
  appendSnapshotRepairAudit,
  listSnapshotRepairAudits,
} from "../storage/snapshot-repair-audit";
import { getProjectId } from "../utils/project-id";
import type { Store } from "../storage/store";

// =============================================================================
// Constants
// =============================================================================

/**
 * Closed repair whitelist (rq-snapshotHealthRepairWhitelist01). Exported so
 * the validator parity test can assert spec/runtime name the same action set.
 */
export const REPAIR_ACTION_ENUM = [
  "delete_stale_locks",
  "delete_zero_byte_objects",
  "delete_orphan_bare_repos",
  "delete_fsck_corrupt_repos",
] as const;

/** Default number of audit entries returned by action 'audit_history'. */
const AUDIT_HISTORY_DEFAULT_LIMIT = 20;
/** Hard cap on audit entries returned by action 'audit_history' (DDC2). */
const AUDIT_HISTORY_MAX_LIMIT = 100;

// =============================================================================
// Tool Definitions
// =============================================================================

export const snapshotHealthHandler = async (
  args: {
    action: "scan" | "repair" | "audit_history";
    scope: "project" | "global";
    limit?: number;
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

  if (args.action === "audit_history") {
    if (args.scope === "global") {
      return formatToolOutput({
        success: false,
        error:
          "audit_history is project-scoped only. scope:'global' is not supported for audit reads (no cross-project audit data).",
      });
    }
    const rawLimit = args.limit ?? AUDIT_HISTORY_DEFAULT_LIMIT;
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.floor(rawLimit), 1), AUDIT_HISTORY_MAX_LIMIT)
      : AUDIT_HISTORY_DEFAULT_LIMIT;
    const entries = await listSnapshotRepairAudits(
      store.paths.root,
      store.paths.snapshotRepairAudit,
    );
    const audits = entries.slice(-limit).reverse();
    return formatToolOutput({
      schema_version: SNAPSHOT_HEALTH_SCHEMA_VERSION,
      action: "audit_history",
      project_id: projectId,
      total_entries: entries.length,
      returned: audits.length,
      limit,
      audits,
    });
  }

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
      if (record.status !== "success") continue;
      const finding = scanOutput.findings.find(
        (f) =>
          f.remediation === record.action &&
          f.bare_repo_path === record.target_path,
      );
      const pattern = finding?.pattern ?? "unknown";
      const specificTarget =
        (finding?.metadata?.lock_path as string | undefined) ??
        (finding?.metadata?.object_path as string | undefined) ??
        record.target_path;
      await appendSnapshotRepairAudit(
        store.paths.root,
        {
          pattern,
          action: record.action,
          target_path: specificTarget,
          before_summary: `Finding ${pattern} at ${specificTarget} (action=${record.action})`,
          after_summary: `Repair succeeded${record.reason ? ` (${record.reason})` : ""}; target ${basename(specificTarget)} removed`,
          outcome: "success",
        },
        store.paths.snapshotRepairAudit,
      );
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
};
