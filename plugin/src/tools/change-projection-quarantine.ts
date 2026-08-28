/**
 * Change Projection Quarantine Tool
 *
 * Operator-only repair surface for corrupt or oversized active change
 * projections. Diagnoses via the bounded projection reader, refuses healthy or
 * missing records, and atomically moves
 * the bad projection outside the normal active read path while retaining the
 * original bytes/metadata and appending a purpose-specific audit entry.
 */

import { rename, stat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { loadChange } from "../storage/change-projection-reader";
import type { LoadResult } from "../storage/change-projection-reader";
import {
  appendChangeProjectionQuarantineAudit,
  type ChangeProjectionQuarantineReason,
} from "../storage/change-projection-quarantine-audit";
import { acquireFileLock } from "../utils/fs";
import { isValidChangeId } from "../utils/change-id";
import { getProjectId } from "../utils/project-id";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store";

// =============================================================================
// Typed outcome codes
// =============================================================================

type QuarantineResultCode =
  | "QUARANTINED"
  | "HEALTHY_REFUSAL"
  | "NOT_FOUND_REFUSAL"
  | "UNAPPROVED"
  | "MISSING_EVIDENCE"
  | "MOVE_FAILED"
  | "AUDIT_FAILED"
  | "AUDIT_ROLLBACK_FAILED"
  | "INVALID_CHANGE_ID"
  | "SOURCE_CHANGED"
  | "LOCK_FAILED";

interface QuarantineSuccess {
  success: true;
  code: "QUARANTINED";
  change_id: string;
  project_id: string;
  source_path: string;
  quarantine_path: string;
  reason: ChangeProjectionQuarantineReason;
  size_bytes: number;
  mtime: string;
  audit_id: string;
  recorded_at: string;
  dry_run?: boolean;
}

interface QuarantineRefusal {
  success: false;
  code: Exclude<
    QuarantineResultCode,
    | "QUARANTINED"
    | "AUDIT_FAILED"
    | "AUDIT_ROLLBACK_FAILED"
    | "MOVE_FAILED"
    | "LOCK_FAILED"
  >;
  change_id: string;
  reason?: string;
  details?: string;
}

interface QuarantineFailure {
  success: false;
  code:
    | "MOVE_FAILED"
    | "AUDIT_FAILED"
    | "AUDIT_ROLLBACK_FAILED"
    | "LOCK_FAILED";
  change_id: string;
  source_path: string;
  quarantine_path?: string;
  error: string;
  audit_id?: string;
  rolled_back?: boolean;
  rollback_error?: string;
  recovery_action?: string;
}

type QuarantineResult =
  | QuarantineSuccess
  | QuarantineRefusal
  | QuarantineFailure;

// =============================================================================
// Tool Definition
// =============================================================================

const changeProjectionQuarantineToolDefinitions = {
  adv_change_projection_quarantine: {
    description:
      "Operator-only quarantine for corrupt or oversized active change projections. " +
      "Diagnoses via the bounded projection reader, refuses healthy/missing records, " +
      "refuses to synthesize missing state, and atomically moves the bad change.json " +
      "to a quarantine directory outside the active read path. " +
      "Requires approvedByUser:true, non-blank approvalEvidence, and changeId. " +
      "Use dryRun:true to preview the diagnosis and target path without moving files.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe(
          "ADV change ID whose active projection will be diagnosed and quarantined.",
        ),
      approvedByUser: z
        .boolean()
        .optional()
        .describe(
          "Required to execute the quarantine. Must be true after explicit operator approval.",
        ),
      approvalEvidence: z
        .string()
        .optional()
        .describe(
          "Required non-blank evidence of how the operator approved the quarantine (e.g., question tool response).",
        ),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Preview the diagnosis and planned quarantine path without moving the file or writing an audit entry.",
        ),
    },
    execute: async (
      args: {
        changeId: string;
        approvedByUser?: boolean;
        approvalEvidence?: string;
        dryRun?: boolean;
      },
      store: Store,
    ) => {
      const gitRoot = store.paths.root;
      const projectDir = store.paths.external ?? store.paths.root;
      const projectId = await getProjectId(gitRoot);

      if (!projectId) {
        return formatToolOutput({
          success: false,
          error: "Could not resolve project identity from store.",
        });
      }

      const result = await executeQuarantine({
        changeId: args.changeId,
        approvedByUser: args.approvedByUser ?? false,
        approvalEvidence: args.approvalEvidence ?? "",
        dryRun: args.dryRun ?? false,
        projectId,
        projectDir,
        changesDir: store.paths.changes,
      });

      return formatToolOutput(result);
    },
  },
};

const {
  adv_change_projection_quarantine: changeProjectionQuarantineDefinition,
} = changeProjectionQuarantineToolDefinitions;

/** Internal repair handler retained for future CLI doctor use. */
export const changeProjectionQuarantineHandler =
  changeProjectionQuarantineDefinition.execute;
export const changeProjectionQuarantineTools =
  changeProjectionQuarantineToolDefinitions;

// =============================================================================
// Internal execution
// =============================================================================

interface QuarantineExecuteInput {
  changeId: string;
  approvedByUser: boolean;
  approvalEvidence: string;
  dryRun: boolean;
  projectId: string;
  projectDir: string;
  changesDir: string;
}

export async function executeQuarantine(
  input: QuarantineExecuteInput,
): Promise<QuarantineResult> {
  const {
    changeId,
    approvedByUser,
    approvalEvidence,
    dryRun,
    projectId,
    projectDir,
    changesDir,
  } = input;

  if (!isValidChangeId(changeId)) {
    return {
      success: false,
      code: "INVALID_CHANGE_ID",
      change_id: changeId,
      reason: "invalid_change_id",
      details: `changeId '${changeId}' is not a canonical ADV change identifier.`,
    };
  }

  const sourcePath = join(changesDir, changeId, "change.json");
  const quarantineDir = join(
    projectDir,
    ".adv",
    "quarantine",
    "changes",
    changeId,
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  const quarantinePath = join(quarantineDir, "change.json");

  // Initial advisory diagnosis (no lock) for early refusal and dry-run preview.
  const initialDiagnosis = await diagnoseProjection(changesDir, changeId);

  if (initialDiagnosis.kind === "healthy") {
    return {
      success: false,
      code: "HEALTHY_REFUSAL",
      change_id: changeId,
      reason: "healthy_projection",
      details: `Active projection ${sourcePath} is healthy and readable; quarantine refused.`,
    };
  }

  if (initialDiagnosis.kind === "not_found") {
    return {
      success: false,
      code: "NOT_FOUND_REFUSAL",
      change_id: changeId,
      reason: "not_found",
      details: `Active projection ${sourcePath} does not exist; nothing to quarantine.`,
    };
  }

  const reason = initialDiagnosis.reason;

  if (dryRun) {
    let sizeBytes = 0;
    let mtime = new Date().toISOString();
    try {
      const stats = await stat(sourcePath);
      sizeBytes = stats.size;
      mtime = stats.mtime.toISOString();
    } catch {
      // Best-effort metadata for dry-run preview.
    }
    return {
      success: true,
      code: "QUARANTINED",
      change_id: changeId,
      project_id: projectId,
      source_path: sourcePath,
      quarantine_path: quarantinePath,
      reason,
      size_bytes: sizeBytes,
      mtime,
      audit_id: "dry-run",
      recorded_at: new Date().toISOString(),
      dry_run: true,
    };
  }

  if (!approvedByUser) {
    return {
      success: false,
      code: "UNAPPROVED",
      change_id: changeId,
      reason,
      details:
        "approvedByUser must be true. Operator must explicitly approve the quarantine.",
    };
  }

  if (!approvalEvidence || approvalEvidence.trim().length === 0) {
    return {
      success: false,
      code: "MISSING_EVIDENCE",
      change_id: changeId,
      reason,
      details:
        "approvalEvidence is required. Record how the operator approved the quarantine.",
    };
  }

  // Acquire the writer-compatible lock used by all active projection writers
  // before the authoritative re-diagnosis and atomic move. This closes the
  // diagnosis-to-rename TOCTOU window.
  let releaseLock: (() => Promise<void>) | undefined;
  try {
    releaseLock = await acquireFileLock(sourcePath, 10_000);
  } catch (error) {
    return {
      success: false,
      code: "LOCK_FAILED",
      change_id: changeId,
      source_path: sourcePath,
      error: `Could not acquire lock on active projection: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const lockedDiagnosis = await diagnoseProjection(changesDir, changeId);

    // If the projection changed between the advisory diagnosis and the
    // authoritative locked diagnosis, refuse and let the operator retry.
    if (
      lockedDiagnosis.kind !== "bad" ||
      lockedDiagnosis.reason !== initialDiagnosis.reason
    ) {
      return {
        success: false,
        code: "SOURCE_CHANGED",
        change_id: changeId,
        reason: "source_changed",
        details: `Active projection ${sourcePath} changed between diagnosis and quarantine; re-diagnose and retry.`,
      };
    }

    let sizeBytes: number;
    let mtime: string;
    try {
      const stats = await stat(sourcePath);
      sizeBytes = stats.size;
      mtime = stats.mtime.toISOString();
    } catch (error) {
      return {
        success: false,
        code: "MOVE_FAILED",
        change_id: changeId,
        source_path: sourcePath,
        error: `Could not stat source projection: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    try {
      await mkdir(quarantineDir, { recursive: true });
      await rename(sourcePath, quarantinePath);
    } catch (error) {
      return {
        success: false,
        code: "MOVE_FAILED",
        change_id: changeId,
        source_path: sourcePath,
        quarantine_path: quarantinePath,
        error: `Atomic move failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    let auditId: string;
    try {
      const audit = await appendChangeProjectionQuarantineAudit(projectDir, {
        project_id: projectId,
        change_id: changeId,
        reason: lockedDiagnosis.reason,
        action: "quarantine",
        source_path: sourcePath,
        quarantine_path: quarantinePath,
        size_bytes: sizeBytes,
        mtime,
        outcome: "success",
      });
      auditId = audit.id;
    } catch (auditError) {
      // Audit evidence is required for a successful quarantine. Roll the file
      // back to the active read path so the operator does not end up with a
      // retained quarantine but no durable record.
      let rollbackError: unknown;
      try {
        await rename(quarantinePath, sourcePath);
      } catch (error) {
        rollbackError = error;
      }

      if (rollbackError) {
        return {
          success: false,
          code: "AUDIT_ROLLBACK_FAILED",
          change_id: changeId,
          source_path: sourcePath,
          quarantine_path: quarantinePath,
          audit_id: undefined,
          error: `Audit append failed and rollback failed: audit=${auditError instanceof Error ? auditError.message : String(auditError)}; rollback=${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          rolled_back: false,
          rollback_error:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
          recovery_action: `Audit append failed and the source could not be restored. The retained bytes are at ${quarantinePath}; the active path is ${sourcePath}. Investigate the audit store and filesystem, then manually move the file back or fix the audit append and retry.`,
        };
      }

      return {
        success: false,
        code: "AUDIT_FAILED",
        change_id: changeId,
        source_path: sourcePath,
        quarantine_path: quarantinePath,
        audit_id: undefined,
        error: `Audit append failed; the projection was rolled back to the active path: ${auditError instanceof Error ? auditError.message : String(auditError)}`,
        rolled_back: true,
        recovery_action:
          "Investigate the audit store failure and retry the quarantine; the source projection is unchanged.",
      };
    }

    return {
      success: true,
      code: "QUARANTINED",
      change_id: changeId,
      project_id: projectId,
      source_path: sourcePath,
      quarantine_path: quarantinePath,
      reason: lockedDiagnosis.reason,
      size_bytes: sizeBytes,
      mtime,
      audit_id: auditId,
      recorded_at: new Date().toISOString(),
    };
  } finally {
    if (releaseLock) {
      await releaseLock();
    }
  }
}

// =============================================================================
// Diagnosis
// =============================================================================

type DiagnosisResult =
  | { kind: "healthy" }
  | { kind: "not_found" }
  | { kind: "bad"; reason: ChangeProjectionQuarantineReason };

async function diagnoseProjection(
  changesDir: string,
  changeId: string,
): Promise<DiagnosisResult> {
  const result: LoadResult<unknown> = await loadChange(changesDir, changeId);

  if (result.success) {
    if (result.data === null) return { kind: "not_found" };
    return { kind: "healthy" };
  }

  switch (result.type) {
    case "oversized":
      return { kind: "bad", reason: "oversized" };
    case "corrupt":
      return { kind: "bad", reason: "corrupt" };
    case "schema_error":
      return { kind: "bad", reason: "schema_error" };
    case "unreadable":
    default:
      return { kind: "bad", reason: "unreadable" };
  }
}
