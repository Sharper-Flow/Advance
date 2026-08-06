/** Handler definitions for misc change tools. */
import { z } from "zod";
import {
  GateIdSchema,
  ReleaseNotesContentSchema,
  type GateId,
  type Change,
  type ReleaseNotesContent,
} from "../../types";
import type { Store } from "../../storage/store";
import { invalidGitHubIssueUrls, applyIssueUpdates } from "./create-clarify";
import { buildReentryResult } from "./recovery";
import { formatToolOutput } from "../../utils/tool-output";
import {
  formatTargetProjectContext,
  type TargetProjectContext,
  type TargetProjectOutputContext,
  withTargetPathStore,
  targetPathSchema,
  appendTargetProjectContextOutput,
} from "../target-project";
import { includeSnapshotSchema } from "../shared-args";
import { coordinateChangeMutation } from "../change-mutation-coordinator";
import { GATE_ORDER } from "../../types";

export const advChangeSetReleaseNotesHandler = async (
  {
    changeId,
    release_notes,
    target_path,
    target_confirmed,
    confirmationEvidence,
  }: {
    changeId: string;
    release_notes: ReleaseNotesContent;
    target_path?: string;
    target_confirmed?: true;
    confirmationEvidence?: string;
  },
  store: Store,
) => {
  const runSetReleaseNotes = async (
    activeStore: Store,
    projectContext?: TargetProjectOutputContext,
  ) => {
    if (!changeId || changeId.trim().length === 0) {
      return formatToolOutput({
        success: false,
        error: "changeId is required",
        code: "INVALID_TOOL_ARGS",
      });
    }

    const existing = await activeStore.changes.get(changeId);
    if (!existing.success || !existing.data) {
      return formatToolOutput({
        success: false,
        error: existing.success
          ? `Change '${changeId}' not found.`
          : existing.error,
        hint: "Use adv_change_list to find valid change IDs.",
      });
    }

    const notesValidation = ReleaseNotesContentSchema.safeParse(release_notes);
    if (!notesValidation.success) {
      return formatToolOutput({
        success: false,
        error: "Invalid release_notes content",
        code: "INVALID_TOOL_ARGS",
        issues: notesValidation.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    const setAt = new Date().toISOString();
    try {
      const updated = await activeStore.changes.setReleaseNotes(changeId, {
        release_notes: notesValidation.data,
        setAt,
      });

      if (!updated) {
        return formatToolOutput({
          success: false,
          error: `Failed to set release notes for change '${changeId}'.`,
          changeId,
        });
      }

      return formatToolOutput({
        success: true,
        changeId,
        release_notes: updated.release_notes,
        set_at: setAt,
        ...(projectContext ? { _projectContext: projectContext } : {}),
      });
    } catch (error) {
      return formatToolOutput({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        changeId,
      });
    }
  };

  if (target_path) {
    try {
      return await withTargetPathStore(
        {
          currentProjectPath: store.paths.root,
          target_path,
          stateRequirement: "authoritative",
          mutation: true,
          target_confirmed,
          confirmationEvidence,
        },
        async ({ context, store: targetStore }) =>
          runSetReleaseNotes(targetStore, formatTargetProjectContext(context)),
      );
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      return formatToolOutput({
        success: false,
        error: `Target project release-notes set unavailable: ${errorText}`,
        changeId,
        target_path,
      });
    }
  }
  return runSetReleaseNotes(store);
};
export const advChangeUpdateIssuesHandler = async (
  {
    changeId,
    add,
    remove,
  }: {
    changeId: string;
    add?: string[];
    remove?: string[];
  },
  store: Store,
) => {
  const addList = (add ?? []).filter(Boolean);
  const removeList = (remove ?? []).filter(Boolean);
  if (addList.length === 0 && removeList.length === 0) {
    return formatToolOutput({
      error: "At least one non-empty add/remove issue list is required",
    });
  }
  const invalid = invalidGitHubIssueUrls([...addList, ...removeList]);
  if (invalid.length > 0) {
    return formatToolOutput({
      error: `Invalid GitHub issue URL(s): ${invalid.join(", ")}. Expected https://github.com/<owner>/<repo>/issues/<number>`,
      invalid,
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
  const { github_issues, result: update } = applyIssueUpdates(
    change.github_issues,
    addList,
    removeList,
  );
  change.github_issues = github_issues;
  try {
    await store.changes.save(change);
  } catch (err) {
    return formatToolOutput({
      error: `Failed to save change: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  return formatToolOutput({
    success: true,
    message: `Issues updated: +${update.added.length} -${update.removed.length}`,
    github_issues: change.github_issues,
    added: update.added,
    removed: update.removed,
    alreadyLinked: update.alreadyLinked,
    notLinked: update.notLinked,
  });
};
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
    // opaque WorkflowExecutionAlreadyCompleted error from Temporal. Reject
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
                  : latest.gates?.[gateId] ?? { status: "pending" },
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
          error: outcome.kind === "unverified" ? outcome.reason : "Gate re-entry mutation was not verified.",
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
  adv_change_set_release_notes: {
    description:
      "Set or replace the typed release-note content block for a change. Full replacement only — omitted optional fields are removed. Validates the payload against the canonical ReleaseNotesContentSchema before signaling. Does not complete gates or authorize archive.",
    args: {
      changeId: z
        .string()
        .min(1)
        .describe("Change ID to set release notes on."),
      release_notes: ReleaseNotesContentSchema.describe(
        "Complete release-note content block to replace any existing release_notes. It requires audience and category; all other fields are optional.",
      ),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
    },
    execute: advChangeSetReleaseNotesHandler,
  },
  adv_change_update_issues: {
    description: "Update GitHub issue URLs linked to a change",
    args: {
      changeId: z.string().describe("Change ID"),
      add: z
        .array(z.string().url())
        .optional()
        .describe("GitHub issue URLs to add"),
      remove: z
        .array(z.string().url())
        .optional()
        .describe("GitHub issue URLs to remove"),
    },
    execute: advChangeUpdateIssuesHandler,
  },
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
          "Optional absolute path to another ADV project. When provided, routes the re-entry through that project's Temporal-backed target store.",
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
