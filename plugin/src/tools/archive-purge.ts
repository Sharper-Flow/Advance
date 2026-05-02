/**
 * adv_archive_purge — explicit user-side lever for archived-change cleanup
 *
 * Terminates an archived child workflow and removes its entry from the
 * parent project workflow's `change_summaries` registry. The on-disk
 * archive bundle (`archive/<id>/change.json`, `proposal.md`, ...) is
 * preserved by default; the destructive `includeDiskBundle: true`
 * escalation also removes the disk bundle.
 *
 * After a workflow-only purge, `adv_change_show` for the purged change
 * continues returning content from the on-disk projection.
 *
 * Spec: rq-archivePurge01.
 *
 * Flow (KD-3):
 *   1. Resolve change via `store.changes.get` — refuse unknown / non-archived
 *   2. Verify disk bundle exists when `!includeDiskBundle` (else the caller
 *      would lose audit history with no opt-in)
 *   3. `await handle.terminate(reason)` on the child workflow — explicit
 *      await per validator caution to minimize the late-signal race window
 *   4. `executeUpdate(purgeChangeSummary, {changeId})` on the parent project
 *      workflow to drop the entry from change_summaries + source_versions
 *   5. If `includeDiskBundle: true`, `rm -rf {external}/archive/<id>/`
 *   6. Return `{purged, terminated, diskRemoved}`
 */

import { basename, join } from "path";
import { rm, access } from "fs/promises";
import { z } from "zod";
import type { Store } from "../storage/store";
import {
  buildChangeWorkflowId,
  buildProjectWorkflowId,
} from "../temporal/client";
import { PROJECT_WORKFLOW_UPDATE_NAMES } from "../temporal/contracts";
import { getService } from "../temporal/service";
import { formatToolOutput } from "../utils/tool-output";
import { appendDebugLog } from "../utils/debug-log";

interface ArchivePurgeArgs {
  changeId: string;
  includeDiskBundle?: boolean;
}

export const archivePurgeTools = {
  adv_archive_purge: {
    description:
      "Explicit user-side lever to terminate an archived child workflow and remove it from the parent project workflow's in-memory change_summaries registry. By default the on-disk archive bundle is preserved (adv_change_show will continue to return its content from the on-disk projection). Pass includeDiskBundle:true to also recursively delete the disk bundle. Refuses non-archived or unknown change IDs.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe(
          "Change ID to purge. Must be in `archived` status — refused otherwise.",
        ),
      includeDiskBundle: z
        .boolean()
        .optional()
        .describe(
          "When true, also recursively delete the on-disk archive bundle at archive/<changeId>/. Default false (audit bundle preserved).",
        ),
    },
    execute: async (args: ArchivePurgeArgs, store: Store): Promise<string> => {
      const { changeId, includeDiskBundle = false } = args;

      // (1) Resolve change. Must exist in workflow state AND be archived.
      const loadResult = await store.changes.get(changeId);
      if (!loadResult.success || !loadResult.data) {
        return formatToolOutput({
          error: `Change not found: ${changeId}`,
          errorClass: "ChangeNotFound",
          changeId,
        });
      }
      const change = loadResult.data;
      if (change.status !== "archived") {
        return formatToolOutput({
          error: `Refusing to purge non-archived change ${changeId} (current status: ${change.status}). Only changes in 'archived' status may be purged.`,
          errorClass: "InvalidChangeStatus",
          changeId,
          status: change.status,
        });
      }

      // (2) Verify disk bundle exists when caller is not removing it.
      // If neither workflow state nor disk bundle would survive the call,
      // the caller has lost audit history without explicit opt-in — refuse.
      if (!store.paths.external) {
        return formatToolOutput({
          error:
            "adv_archive_purge requires external state directory (Temporal-only mode). store.paths.external is null.",
          errorClass: "MissingExternalState",
          changeId,
        });
      }
      const archiveBundlePath = join(store.paths.archive, changeId);
      const diskBundleSentinel = join(archiveBundlePath, "change.json");
      const diskBundleExists = await fileExists(diskBundleSentinel);
      if (!includeDiskBundle && !diskBundleExists) {
        return formatToolOutput({
          error: `Refusing to purge ${changeId}: workflow state would be removed and no on-disk archive bundle exists at ${archiveBundlePath}/change.json. Re-run with includeDiskBundle:true to acknowledge audit-trail loss, or restore the bundle first.`,
          errorClass: "AuditBundleMissing",
          changeId,
          archiveBundlePath,
        });
      }

      // Resolve project ID + Temporal client bundle.
      const projectId = basename(store.paths.external);
      const bundle = getService();
      if (!bundle) {
        return formatToolOutput({
          error:
            "Temporal service layer not initialized — cannot terminate workflow or call project workflow update. Run adv_temporal_diagnose for recovery guidance.",
          errorClass: "StslNotInitialized",
          changeId,
        });
      }

      // (3) Terminate child workflow first (explicit await per KD-3).
      let terminated = false;
      try {
        const childWorkflowId = buildChangeWorkflowId(projectId, changeId);
        const childHandle = bundle.client.workflow.getHandle(childWorkflowId);
        await childHandle.terminate("adv_archive_purge");
        terminated = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Already-terminated / not-found is acceptable — the goal is to
        // ensure no future signals from the child can re-emit a summary.
        const benign = /not found|already (terminated|completed)/i.test(
          message,
        );
        if (!benign) {
          appendDebugLog(
            "adv_archive_purge",
            `terminate failed for ${changeId}: ${message}`,
          );
          return formatToolOutput({
            error: `Failed to terminate child workflow for ${changeId}: ${message}`,
            errorClass: "TerminateFailed",
            changeId,
          });
        }
        // benign: workflow was already gone; proceed to purge registry entry.
        terminated = false;
      }

      // (4) Send purgeChangeSummary update to parent project workflow.
      try {
        const projectHandle = bundle.client.workflow.getHandle(
          buildProjectWorkflowId(projectId),
        );
        // executeUpdate by string update name — keeps tool free of
        // workflow-bundle imports.
        const handleWithUpdate = projectHandle as unknown as {
          executeUpdate: (
            updateName: string,
            options: { args: unknown[] },
          ) => Promise<unknown>;
        };
        await handleWithUpdate.executeUpdate(
          PROJECT_WORKFLOW_UPDATE_NAMES.purgeChangeSummary,
          { args: [{ changeId }] },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendDebugLog(
          "adv_archive_purge",
          `purgeChangeSummary update failed for ${changeId}: ${message}`,
        );
        return formatToolOutput({
          error: `Failed to drop ${changeId} from change_summaries: ${message}. Child workflow termination ${terminated ? "succeeded" : "was attempted"} — manual recovery may be required.`,
          errorClass: "PurgeUpdateFailed",
          changeId,
          terminated,
        });
      }

      // (5) Optionally remove disk bundle.
      let diskRemoved = false;
      if (includeDiskBundle) {
        try {
          await rm(archiveBundlePath, { recursive: true, force: true });
          diskRemoved = true;
        } catch (err) {
          appendDebugLog(
            "adv_archive_purge",
            `disk bundle removal failed for ${changeId}: ${err instanceof Error ? err.message : String(err)}`,
          );
          // Workflow state is already purged; report disk failure but don't
          // unwind. Caller can manually rm the dir if desired.
          return formatToolOutput({
            success: true,
            purged: changeId,
            terminated,
            diskRemoved: false,
            diskRemovalError:
              err instanceof Error ? err.message : String(err),
            message: `Workflow state for ${changeId} purged from change_summaries; child workflow terminated. Disk bundle removal failed — manual cleanup of ${archiveBundlePath} required.`,
          });
        }
      }

      return formatToolOutput({
        success: true,
        purged: changeId,
        terminated,
        diskRemoved,
        message: diskRemoved
          ? `Purged ${changeId} from change_summaries; child workflow terminated; disk bundle removed.`
          : `Purged ${changeId} from change_summaries; child workflow terminated. On-disk archive bundle preserved at ${archiveBundlePath}/.`,
      });
    },
  },
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
