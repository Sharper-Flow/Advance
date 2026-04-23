/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */

import { z } from "zod";
import { basename, join } from "path";
import { readFile, stat, access, realpath } from "fs/promises";
import type { Spec, FeatureFlags, CrossProjectOrigin } from "../types";
import {
  createDefaultGates,
  getIncompleteGates,
  allGatesSatisfied,
  GateIdSchema,
  type GateId,
  type ClarifyFindingSnapshot,
} from "../types";
import type { Store } from "../storage/store";
import { createStore } from "../storage/store";
import { getProjectId, getExternalRoot } from "../utils/project-id";
import { validateChange } from "../validator";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("change");
// Warning codes that may still surface during archive-time validation but do
// not, by themselves, indicate broken or unsafe release state. Keep this set
// intentionally narrow: errors and all other warnings continue to block strict
// validation until explicitly reviewed and reclassified.
const ARCHIVE_SAFE_STRICT_WARNING_CODES = new Set([
  "NO_DELTAS",
  "PROPOSAL_TASK_DRIFT",
]);
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { loadProposalWithFallback, fileExists } from "../storage/json";
import { archiveChange } from "../archive";
import { wrapWithBanner } from "../utils/banner";
import { formatToolOutput, paginate } from "../utils/tool-output";
import {
  countSuccessCriteria,
  formatContextSnapshot,
  type ContextSnapshotInput,
} from "../utils/context-snapshot";
import { resolveChangeSelection } from "../storage/change-selection";
import { BulkCloseSelectorSchema } from "../types";

/**
 * Pure function: merge current clarify findings with persisted snapshots.
 * Resolves stale findings and appends new ones.
 */
function resolveClarifyFindings(
  existing: ClarifyFindingSnapshot[],
  current: Array<{ code: string; severity: string; message: string }>,
  now: string,
): ClarifyFindingSnapshot[] {
  const currentCodes = new Set(current.map((f) => f.code));

  // Mark previously-persisted findings as resolved if no longer raised
  const updated: ClarifyFindingSnapshot[] = existing.map((f) =>
    !f.resolved && !currentCodes.has(f.code)
      ? { ...f, resolved: true, resolved_at: now }
      : f,
  );

  // Append new findings not yet in snapshots
  const existingCodes = new Set(existing.map((f) => f.code));
  for (const finding of current) {
    if (!existingCodes.has(finding.code)) {
      updated.push({
        code: finding.code,
        severity: finding.severity as "error" | "warning" | "info",
        message: finding.message,
        recorded_at: now,
      });
    }
  }

  return updated;
}

function summarizeTasks(
  tasks: Array<{ status: string; id: string; title: string }>,
) {
  const taskCounts = {
    done: tasks.filter((t) => t.status === "done").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    cancelled: tasks.filter((t) => t.status === "cancelled").length,
  };
  const inProgressTask = tasks.find((t) => t.status === "in_progress");

  return { taskCounts, inProgressTask };
}

function isSyntheticValidationDraftSummary(summary: string): boolean {
  const trimmed = summary.trim();

  if (/^\[parity:(legacy|temporal)\]\s+/i.test(trimmed)) {
    return true;
  }

  return [
    /^change\s+roundtrip\d*$/i,
    /^changeRoundtrip\d*$/i,
    /^task\s+parity\d*$/i,
    /^taskParity\d*$/i,
    /^gate\s+parity\d*$/i,
    /^gateParity\d*$/i,
    /^wisdom\s+parity\d*$/i,
    /^wisdomParity\d*$/i,
    /^reentry\s+parity\d*$/i,
    /^reentryParity\d*$/i,
  ].some((pattern) => pattern.test(trimmed));
}

function buildSyntheticValidationDraftError(
  summary: string,
): Record<string, string> {
  return {
    error:
      `Synthetic validation draft summary "${summary}" is reserved for parity/validation flows. ` +
      "Use isolated temp/test storage instead of live ADV state.",
  };
}

type ChangeIssueUpdate = {
  added: string[];
  removed: string[];
  alreadyLinked: string[];
  notLinked: string[];
};

function applyIssueUpdates(
  existing: string[] | undefined,
  add: string[] = [],
  remove: string[] = [],
): { github_issues: string[]; result: ChangeIssueUpdate } {
  const githubIssues = [...(existing ?? [])];
  const result: ChangeIssueUpdate = {
    added: [],
    removed: [],
    alreadyLinked: [],
    notLinked: [],
  };

  for (const issueUrl of add) {
    if (githubIssues.includes(issueUrl)) {
      result.alreadyLinked.push(issueUrl);
      continue;
    }
    githubIssues.push(issueUrl);
    result.added.push(issueUrl);
  }

  for (const issueUrl of remove) {
    const before = githubIssues.length;
    const next = githubIssues.filter((url) => url !== issueUrl);
    if (next.length === before) {
      result.notLinked.push(issueUrl);
      continue;
    }
    githubIssues.splice(0, githubIssues.length, ...next);
    result.removed.push(issueUrl);
  }

  return { github_issues: githubIssues, result };
}

/**
 * Build a markdown section documenting cross-project origin for a proposal.
 */
function buildOriginSection(origin: {
  source_project: string;
  source_path: string;
  source_change_id?: string;
}): string {
  let section = `## Cross-Project Origin\n\n`;
  section += `This change was created as a follow-up from **${origin.source_project}**.\n\n`;
  section += `| Field | Value |\n|-------|-------|\n`;
  section += `| Source project | ${origin.source_project} |\n`;
  section += `| Source path | \`${origin.source_path}\` |\n`;
  if (origin.source_change_id) {
    section += `| Source change | ${origin.source_change_id} |\n`;
  }
  section += `\n> **Note:** The originating project should be consulted for context on why this change is needed.\n`;
  return section;
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const changeTools = {
  adv_change_list: {
    description: "List active changes with optional filtering",
    args: {
      status: z
        .enum(["draft", "pending", "active", "archived", "closed"])
        .optional()
        .describe("Filter by status"),
      includeArchived: z
        .boolean()
        .optional()
        .describe("Include archived changes (default: false)"),
      includeClosed: z
        .boolean()
        .optional()
        .describe("Include closed changes (default: false)"),
      limit: z
        .number()
        .optional()
        .describe("Max changes to return (default: 50)"),
      offset: z
        .number()
        .optional()
        .describe("Offset for pagination (default: 0)"),
    },
    execute: async (
      {
        status,
        includeArchived,
        includeClosed,
        limit,
        offset,
      }: {
        status?: string;
        includeArchived?: boolean;
        includeClosed?: boolean;
        limit?: number;
        offset?: number;
      },
      store: Store,
    ) => {
      const result = await store.changes.list({
        status,
        includeArchived,
        includeClosed,
      });
      const paged = paginate(result.changes, {
        limit,
        offset,
        tool: "adv_change_list",
        args: status ? `status: "${status}"` : undefined,
      });
      return formatToolOutput({
        changes: paged.items,
        pagination: paged.pagination,
      });
    },
  },

  adv_change_show: {
    description: "Get full change details including tasks and deltas",
    args: {
      changeId: z.string().describe("Change ID"),
      limit: z
        .number()
        .optional()
        .describe("Max tasks to return (default: 50)"),
      offset: z
        .number()
        .optional()
        .describe("Task offset for pagination (default: 0)"),
    },
    execute: async (
      {
        changeId,
        limit,
        offset,
      }: { changeId: string; limit?: number; offset?: number },
      store: Store,
    ) => {
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({ error: `Change not found: ${changeId}` });
      }
      const change = result.data;
      const changeDir = join(store.paths.changes, changeId);
      const { content: proposalText } = await loadProposalWithFallback(
        changeDir,
        change.title,
      );
      const paged = paginate(change.tasks, {
        limit,
        offset,
        tool: "adv_change_show",
        args: `changeId: "${changeId}"`,
      });

      // Build context snapshot for context agreement
      const gates = await store.gates.get(changeId);
      const { taskCounts, inProgressTask } = summarizeTasks(change.tasks);
      const snapshotInput: ContextSnapshotInput = {
        changeId: change.id,
        title: change.title,
        successCriteriaCount: countSuccessCriteria(proposalText),
        gates: gates ?? undefined,
        taskCounts,
        workdir: store.paths.root,
        currentTask: inProgressTask
          ? { id: inProgressTask.id, title: inProgressTask.title }
          : undefined,
        wisdomCount: change.wisdom?.length ?? 0,
        wisdomByType: change.wisdom
          ? change.wisdom.reduce<Record<string, number>>((acc, w) => {
              acc[w.type] = (acc[w.type] || 0) + 1;
              return acc;
            }, {})
          : undefined,
      };

      const output: Record<string, unknown> = {
        ...change,
        tasks: paged.items,
        _taskPagination: paged.pagination,
        _contextSnapshot: formatContextSnapshot(snapshotInput),
      };

      // Check for problem-statement.md artifact
      const problemStatementPath = join(changeDir, "problem-statement.md");
      const problemStatementExists = await fileExists(problemStatementPath);
      output.problemStatementExists = problemStatementExists;
      if (problemStatementExists) {
        output.problemStatementPath = problemStatementPath;
      }

      // Run clarify-readiness checks if feature flag is not "off"
      const features = store.config?.features as FeatureFlags | undefined;
      const clarifyMode = features?.clarify_enforcement ?? "advisory";

      if (clarifyMode !== "off") {
        const clarifyResult = runClarifyReadinessChecks(change, proposalText);

        if (clarifyResult.findings.length > 0) {
          output.clarifyFindings = {
            count: clarifyResult.findings.length,
            findings: clarifyResult.findings.map((f) => ({
              code: f.code,
              severity: f.severity,
              message: f.message,
              questionCategory: f.details?.questionCategory,
            })),
          };

          // Persist clarify findings as append-only snapshots
          const now = new Date().toISOString();
          const existing: ClarifyFindingSnapshot[] =
            change.clarify_findings ?? [];
          const updated = resolveClarifyFindings(
            existing,
            clarifyResult.findings,
            now,
          );

          if (updated.length > 0) {
            // Persist back to the change (best-effort — don't fail if save fails)
            try {
              const freshResult = await store.changes.get(changeId);
              if (freshResult.success && freshResult.data) {
                freshResult.data.clarify_findings = updated;
                await store.changes.save(freshResult.data);
              }
            } catch (err) {
              // Non-fatal: persistence failure doesn't affect the tool response
              logger.warn(
                `Failed to persist clarify findings: ${(err as Error).message}`,
              );
            }
          }
        } else {
          // No current findings — resolve any previously-persisted unresolved findings
          if (change.clarify_findings?.some((f) => !f.resolved)) {
            const now = new Date().toISOString();
            try {
              const freshResult = await store.changes.get(changeId);
              if (freshResult.success && freshResult.data) {
                freshResult.data.clarify_findings = resolveClarifyFindings(
                  freshResult.data.clarify_findings ?? [],
                  [],
                  now,
                );
                await store.changes.save(freshResult.data);
              }
            } catch (err) {
              // Non-fatal
              logger.warn(
                `Failed to resolve clarify findings: ${(err as Error).message}`,
              );
            }
          }
        }
      }

      // Surface cross-project origin prominently when present
      if (change.cross_project_origin) {
        output._crossProjectOrigin = {
          note: `⚠️ Cross-project follow-up from ${change.cross_project_origin.source_project}`,
          ...change.cross_project_origin,
        };
      }

      return formatToolOutput(output);
    },
  },

  adv_change_create: {
    description: "Create a new change proposal",
    args: {
      summary: z
        .string()
        .describe(
          "2-5 word summary used as the change title and ID. " +
            "Start with an action verb (add, fix, update, remove, refactor). " +
            "Be specific, not generic. " +
            'Good: "Add rate limiting", "Fix auth token refresh". ' +
            'Bad: "Implement comprehensive authentication system", "Full update".',
        ),
      capability: z.string().optional().describe("Primary capability affected"),
      proposal: z
        .string()
        .optional()
        .describe(
          "Optional proposal.md content to persist during change creation",
        ),
      problemStatement: z
        .string()
        .optional()
        .describe(
          "Optional confirmed problem statement text to persist as problem-statement.md artifact",
        ),
      agreement: z
        .string()
        .optional()
        .describe(
          "Optional agreement.md content (objectives, AC, constraints, avoidances)",
        ),
      design: z
        .string()
        .optional()
        .describe(
          "Optional design.md content (architecture, LBP decisions, implementation strategy)",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Absolute path to the target project directory for cross-project change creation. " +
            "When provided, creates the change in that project instead of the current one.",
        ),
      source_project: z
        .string()
        .optional()
        .describe(
          "Name of the source project creating this follow-up. " +
            "Auto-detected from current store config when target_path is provided.",
        ),
      source_change_id: z
        .string()
        .optional()
        .describe(
          "Change ID in the source project that triggered this follow-up.",
        ),
    },
    execute: async (
      {
        summary,
        capability,
        proposal,
        problemStatement,
        agreement,
        design,
        target_path,
        source_project,
        source_change_id,
      }: {
        summary: string;
        capability?: string;
        proposal?: string;
        problemStatement?: string;
        agreement?: string;
        design?: string;
        target_path?: string;
        source_project?: string;
        source_change_id?: string;
      },
      store: Store,
    ) => {
      if (isSyntheticValidationDraftSummary(summary)) {
        return formatToolOutput(buildSyntheticValidationDraftError(summary));
      }

      // ----- Cross-project creation path -----
      if (target_path) {
        // Validate target directory exists
        try {
          await access(target_path);
        } catch {
          return formatToolOutput({
            error: `Target project directory does not exist: ${target_path}`,
          });
        }

        // Self-target guard: reject if target_path resolves to current project
        try {
          const [realTarget, realRoot] = await Promise.all([
            realpath(target_path),
            realpath(store.paths.root),
          ]);
          if (realTarget === realRoot) {
            return formatToolOutput({
              error:
                "Target path resolves to current project. Omit target_path to create a change in the current project.",
            });
          }
        } catch {
          // realpath failed — proceed with store creation, which will fail
          // with its own error if the path is truly invalid
        }

        // Resolve source project identity
        const resolvedSourceProject =
          source_project ?? store.config?.name ?? basename(store.paths.root);

        // Build origin metadata
        const origin: CrossProjectOrigin = {
          source_project: resolvedSourceProject,
          source_path: store.paths.root,
          source_change_id,
          linked_at: new Date().toISOString(),
        };

        // Prepend origin section to proposal content
        const originSection = buildOriginSection(origin);
        const enrichedProposal = proposal
          ? `${originSection}\n\n${proposal}`
          : undefined;

        // Resolve externalRoot for genuine cross-project targets, then create
        // an isolated Store instance so follow-up creation stays independent of
        // the origin project's ADV state.
        const targetProjectId = await getProjectId(target_path);
        const targetExternalRoot = targetProjectId
          ? getExternalRoot(targetProjectId)
          : undefined;
        let targetStore: Store;
        try {
          targetStore = await createStore(target_path, {
            externalRoot: targetExternalRoot,
          });
          await targetStore.init();
        } catch (err) {
          return formatToolOutput({
            error: `Failed to initialize target project at ${target_path}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }

        try {
          // Create the change in the target store
          const result = await targetStore.changes.create(
            summary,
            capability,
            enrichedProposal,
            problemStatement,
            agreement,
            design,
          );

          // Load the created change and persist cross_project_origin
          const changeResult = await targetStore.changes.get(result.changeId);
          if (changeResult.success && changeResult.data) {
            changeResult.data.cross_project_origin = origin;
            await targetStore.changes.save(changeResult.data);
          }

          const output: Record<string, unknown> = { ...result };
          output.cross_project_origin = origin;
          output.target_path = target_path;

          if (result.duplicateWarning) {
            output._duplicateWarning = result.duplicateWarning;
          }

          return wrapWithBanner(
            {
              command: "adv_change_create",
              target: result.changeId,
            },
            formatToolOutput(output),
          );
        } finally {
          targetStore.close();
        }
      }

      // ----- Local creation path (unchanged) -----
      const result = await store.changes.create(
        summary,
        capability,
        proposal,
        problemStatement,
        agreement,
        design,
      );

      // Run clarify-readiness checks if feature flag is not "off"
      const features = store.config?.features as FeatureFlags | undefined;
      const clarifyMode = features?.clarify_enforcement ?? "advisory";

      const output: Record<string, unknown> = { ...result };

      // Surface duplicate warning prominently if present
      if (result.duplicateWarning) {
        output._duplicateWarning = result.duplicateWarning;
      }

      if (clarifyMode !== "off") {
        // Load the newly created change and its proposal text
        const changeResult = await store.changes.get(result.changeId);
        if (changeResult.success && changeResult.data) {
          const changeDir = join(store.paths.changes, result.changeId);
          const { content: proposalText } = await loadProposalWithFallback(
            changeDir,
            changeResult.data.title,
          );

          const clarifyResult = runClarifyReadinessChecks(
            changeResult.data,
            proposalText,
          );

          if (clarifyResult.findings.length > 0) {
            output.clarifyNeeded = {
              count: clarifyResult.findings.length,
              findings: clarifyResult.findings.map((f) => ({
                code: f.code,
                severity: f.severity,
                message: f.message,
                questionCategory: f.details?.questionCategory,
              })),
            };
          }
        }
      }

      return wrapWithBanner(
        { command: "adv_change_create", target: result.changeId },
        formatToolOutput(output),
      );
    },
  },

  adv_change_update: {
    description:
      "Update proposal.md and/or problem-statement.md for an existing change. Does NOT create a new change or modify change.json metadata (status, tasks, deltas). Use this instead of calling adv_change_create again when refining a proposal. Only provided fields are written — omitted fields are left unchanged.",
    args: {
      changeId: z.string().describe("Change ID to update"),
      proposal: z
        .string()
        .optional()
        .describe(
          "New proposal.md content (overwrites existing). Omit to leave unchanged.",
        ),
      problemStatement: z
        .string()
        .optional()
        .describe(
          "New problem-statement.md content (overwrites existing). Omit to leave unchanged.",
        ),
      agreement: z
        .string()
        .optional()
        .describe(
          "New agreement.md content (overwrites existing). Omit to leave unchanged.",
        ),
      design: z
        .string()
        .optional()
        .describe(
          "New design.md content (overwrites existing). Omit to leave unchanged.",
        ),
    },
    execute: async (
      {
        changeId,
        proposal,
        problemStatement,
        agreement,
        design,
      }: {
        changeId: string;
        proposal?: string;
        problemStatement?: string;
        agreement?: string;
        design?: string;
      },
      store: Store,
    ) => {
      if (
        proposal === undefined &&
        problemStatement === undefined &&
        agreement === undefined &&
        design === undefined
      ) {
        return wrapWithBanner(
          { command: "adv_change_update", target: changeId },
          formatToolOutput({
            error:
              "At least one of 'proposal', 'problemStatement', 'agreement', or 'design' must be provided.",
          }),
        );
      }

      const result = await store.changes.updateArtifacts(
        changeId,
        proposal,
        problemStatement,
        agreement,
        design,
      );

      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_update", target: changeId },
          formatToolOutput({ error: result.error }),
        );
      }

      return wrapWithBanner(
        { command: "adv_change_update", target: changeId },
        formatToolOutput({
          changeId,
          proposalPath: result.proposalPath,
          problemStatementPath: result.problemStatementPath,
          agreementPath: result.agreementPath,
          designPath: result.designPath,
        }),
      );
    },
  },

  adv_change_close: {
    description:
      "Close an active change with required user approval and audit metadata",
    args: {
      changeId: z.string().describe("Change ID to close"),
      reason: z
        .enum(["cancelled", "superseded", "not_planned"])
        .describe("Why the change is being closed"),
      approvedByUser: z
        .literal(true)
        .describe("Must be true — confirms user explicitly approved"),
      approvalEvidence: z
        .string()
        .describe("Evidence of user approval (e.g. question tool response)"),
      supersededBy: z
        .string()
        .optional()
        .describe("Surviving change ID when reason is superseded"),
    },
    execute: async (
      {
        changeId,
        reason,
        approvedByUser,
        approvalEvidence,
        supersededBy,
      }: {
        changeId: string;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
      },
      store: Store,
    ) => {
      if (reason === "superseded" && !supersededBy) {
        return wrapWithBanner(
          { command: "adv_change_close", target: changeId },
          formatToolOutput({
            error: "supersededBy is required when reason is 'superseded'.",
          }),
        );
      }

      const result = await store.changes.get(changeId);
      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_close", target: changeId },
          formatToolOutput({ error: result.error }),
        );
      }
      if (!result.data) {
        return wrapWithBanner(
          { command: "adv_change_close", target: changeId },
          formatToolOutput({ error: `Change not found: ${changeId}` }),
        );
      }

      try {
        const change = await store.changes.close(changeId, {
          reason,
          approved_by_user: approvedByUser,
          approval_evidence: approvalEvidence,
          superseded_by: supersededBy,
          approved_at: new Date().toISOString(),
        });

        if (!change) {
          return wrapWithBanner(
            { command: "adv_change_close", target: changeId },
            formatToolOutput({ error: `Change not found: ${changeId}` }),
          );
        }

        return wrapWithBanner(
          { command: "adv_change_close", target: changeId },
          formatToolOutput({
            success: true,
            change,
            message: `Closed change ${changeId} as ${reason}.`,
          }),
        );
      } catch (error) {
        return wrapWithBanner(
          { command: "adv_change_close", target: changeId },
          formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
  },

  adv_change_bulk_close: {
    description:
      "Close multiple changes in a single approved operation. Supports explicit IDs or filter-based selection. Requires either a status filter or a staleness filter. Fail-all if any target is protected or invalid.",
    args: {
      selector: BulkCloseSelectorSchema.describe(
        "Explicit IDs or filter criteria",
      ),
      reason: z
        .enum(["cancelled", "superseded", "not_planned"])
        .describe("Why changes are being closed"),
      approvedByUser: z
        .literal(true)
        .describe("Must be true — confirms user explicitly approved"),
      approvalEvidence: z
        .string()
        .describe("Evidence of user approval (e.g. question tool response)"),
      supersededBy: z
        .string()
        .optional()
        .describe("Surviving change ID when reason is superseded (max 1)"),
    },
    execute: async (
      {
        selector,
        reason,
        approvedByUser,
        approvalEvidence,
        supersededBy,
      }: {
        selector: import("../types").BulkCloseSelector;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
      },
      store: Store,
    ) => {
      if (reason === "superseded") {
        if (selector.kind === "filter") {
          return wrapWithBanner(
            { command: "adv_change_bulk_close" },
            formatToolOutput({
              error:
                "Filter-based bulk close with reason 'superseded' is not supported. Use explicit IDs.",
            }),
          );
        }
        if (!supersededBy) {
          return wrapWithBanner(
            { command: "adv_change_bulk_close" },
            formatToolOutput({
              error: "supersededBy is required when reason is 'superseded'.",
            }),
          );
        }
      }

      const selection = await resolveChangeSelection(selector, {
        list: store.changes.list.bind(store.changes),
        get: store.changes.get.bind(store.changes),
      });

      if (!selection.ok) {
        return wrapWithBanner(
          { command: "adv_change_bulk_close" },
          formatToolOutput({ error: selection.error }),
        );
      }

      if (selection.changeIds.length === 0) {
        return wrapWithBanner(
          { command: "adv_change_bulk_close" },
          formatToolOutput({
            error: "SELECTION_ERROR: No changes matched the provided criteria.",
          }),
        );
      }

      try {
        const result = await store.changes.closeBatch(selection.changeIds, {
          reason,
          approved_by_user: approvedByUser,
          approval_evidence: approvalEvidence,
          superseded_by: supersededBy,
          approved_at: new Date().toISOString(),
        });

        return wrapWithBanner(
          { command: "adv_change_bulk_close" },
          formatToolOutput({
            success: result.success,
            closed: result.closed,
            results: result.results,
            message: result.message,
          }),
        );
      } catch (error) {
        return wrapWithBanner(
          { command: "adv_change_bulk_close" },
          formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
  },

  adv_change_validate: {
    description:
      "Validate change against existing specs (specs as laws) and check for conflicts with other active changes",
    args: {
      changeId: z.string().describe("Change ID to validate"),
      strict: z.boolean().optional().describe("Treat warnings as errors"),
    },
    execute: async (
      { changeId, strict }: { changeId: string; strict?: boolean },
      store: Store,
    ) => {
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_validate", target: changeId },
          formatToolOutput({ error: result.error }),
        );
      }
      if (!result.data) {
        return wrapWithBanner(
          { command: "adv_change_validate", target: changeId },
          formatToolOutput({ error: `Change not found: ${changeId}` }),
        );
      }

      const change = result.data;
      const changeDir = join(store.paths.changes, changeId);

      // Load all specs for validation context
      const specList = await store.specs.list();
      const specs: Spec[] = [];
      for (const specInfo of specList.specs) {
        const specResult = await store.specs.get(specInfo.name);
        if (specResult.success && specResult.data) {
          specs.push(specResult.data);
        }
      }

      // Load other active changes for conflict detection
      const changeList = await store.changes.list({ includeArchived: false });
      const activeChanges = changeList.changes
        .filter((c) => c.id !== changeId) // Exclude self
        .map((c) => ({
          id: c.id,
          title: c.title,
          capabilities: [] as string[], // Will be populated below
        }));

      // Load full change data to get capabilities
      for (const activeChange of activeChanges) {
        const fullChangeResult = await store.changes.get(activeChange.id);
        if (fullChangeResult.success && fullChangeResult.data) {
          activeChange.capabilities = Object.keys(fullChangeResult.data.deltas);
        }
      }

      // Load proposal text so validator can run proposal-task drift checks.
      const { content: proposalText } = await loadProposalWithFallback(
        changeDir,
        change.title,
      );

      // Detect worktree by checking whether .git is a file pointing at a common dir.
      let isWorktree = false;
      try {
        const gitPath = join(store.paths.root, ".git");
        const gitStat = await stat(gitPath);
        if (gitStat.isFile()) {
          const gitFile = await readFile(gitPath, "utf-8");
          isWorktree = gitFile.includes("gitdir:");
        }
      } catch {
        // Best-effort only; default to non-worktree when detection fails.
      }

      // Run full validation with active changes for conflict detection
      const validationResult = await validateChange(change, {
        specs,
        activeChanges,
        proposalText,
        isWorktree,
      });

      // In strict mode, fail on errors and on warnings that are not explicitly
      // safe for archive-time validation. Archive-safe warnings still surface in
      // tool output but do not block strict validation by themselves.
      const passed = strict
        ? validationResult.errors.length === 0 &&
          validationResult.warnings.every((warning) =>
            ARCHIVE_SAFE_STRICT_WARNING_CODES.has(warning.code),
          )
        : validationResult.passed;

      return wrapWithBanner(
        { command: "adv_change_validate", target: changeId },
        formatToolOutput({
          passed,
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          checksPerformed: validationResult.checksPerformed,
          checkedAt: validationResult.checkedAt,
        }),
      );
    },
  },

  adv_change_archive: {
    description: "Archive a completed change (applies deltas to specs)",
    args: {
      changeId: z.string().describe("Change ID to archive"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview changes without writing"),
    },
    execute: async (
      { changeId, dryRun }: { changeId: string; dryRun?: boolean },
      store: Store,
    ) => {
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_archive", target: changeId },
          formatToolOutput({ error: result.error }),
        );
      }
      if (!result.data) {
        return wrapWithBanner(
          { command: "adv_change_archive", target: changeId },
          formatToolOutput({ error: `Change not found: ${changeId}` }),
        );
      }

      const change = result.data;

      // Check all tasks complete
      const incompleteTasks = change.tasks.filter(
        (t) => t.status !== "done" && t.status !== "cancelled",
      );
      if (incompleteTasks.length > 0) {
        return wrapWithBanner(
          { command: "adv_change_archive", target: changeId },
          formatToolOutput({
            error: "Cannot archive: incomplete tasks",
            incompleteTasks: incompleteTasks.map((t) => ({
              id: t.id,
              title: t.title,
            })),
          }),
        );
      }

      // Check all gates are complete (7-gate quality checklist)
      const gates = change.gates ?? createDefaultGates();
      if (!allGatesSatisfied(gates)) {
        const incompleteGates = getIncompleteGates(gates);
        return wrapWithBanner(
          { command: "adv_change_archive", target: changeId },
          formatToolOutput({
            error:
              "Cannot archive: incomplete gates. Complete all quality gates before archiving.",
            incompleteGates,
            hint: `Run /adv-gate-status ${changeId} to see gate details`,
          }),
        );
      }

      // Load all specs for delta application
      const specList = await store.specs.list();
      const specs = new Map<string, Spec>();
      for (const specInfo of specList.specs) {
        const specResult = await store.specs.get(specInfo.name);
        if (specResult.success && specResult.data) {
          specs.set(specInfo.name, specResult.data);
        }
      }

      // Run the archive operation
      const archivePaths =
        store.config?.features?.wisdom_accumulation === false
          ? { ...store.paths, wisdom: undefined }
          : store.paths;

      const archiveResult = await archiveChange({
        change,
        specs,
        paths: archivePaths,
        dryRun,
      });

      // Update change status in store (unless dry run)
      if (!dryRun && archiveResult.success) {
        change.status = "archived";
        await store.changes.save(change);
      }

      return wrapWithBanner(
        { command: "adv_change_archive", target: changeId },
        formatToolOutput({
          success: archiveResult.success,
          specsUpdated: archiveResult.specsUpdated.map((s) => ({
            capability: s.capability,
            version: `${s.originalVersion} → ${s.newVersion}`,
            deltas: s.deltaResults.length,
          })),
          docsGenerated: archiveResult.docsGenerated,
          archivePath: archiveResult.archivePath,
          errors: archiveResult.errors,
          dryRun: dryRun ?? false,
        }),
      );
    },
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
    execute: async (
      {
        changeId,
        add,
        remove,
      }: { changeId: string; add?: string[]; remove?: string[] },
      store: Store,
    ) => {
      const addList = (add ?? []).filter(Boolean);
      const removeList = (remove ?? []).filter(Boolean);
      if (addList.length === 0 && removeList.length === 0) {
        return wrapWithBanner(
          { command: "adv_change_update_issues", target: changeId },
          formatToolOutput({
            error: "At least one non-empty add/remove issue list is required",
          }),
        );
      }

      const result = await store.changes.get(changeId);
      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_update_issues", target: changeId },
          formatToolOutput({ error: result.error }),
        );
      }
      if (!result.data) {
        return wrapWithBanner(
          { command: "adv_change_update_issues", target: changeId },
          formatToolOutput({ error: `Change not found: ${changeId}` }),
        );
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
        return wrapWithBanner(
          { command: "adv_change_update_issues", target: changeId },
          formatToolOutput({
            error: `Failed to save change: ${err instanceof Error ? err.message : String(err)}`,
          }),
        );
      }

      return wrapWithBanner(
        { command: "adv_change_update_issues", target: changeId },
        formatToolOutput({
          success: true,
          message: `Issues updated: +${update.added.length} -${update.removed.length}`,
          github_issues: change.github_issues,
          added: update.added,
          removed: update.removed,
          alreadyLinked: update.alreadyLinked,
          notLinked: update.notLinked,
        }),
      );
    },
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
    },
    execute: async (
      {
        changeId,
        fromGate,
        reason,
        scopeDelta,
        approvalEvidence,
      }: {
        changeId: string;
        fromGate: GateId;
        reason: string;
        scopeDelta?: string;
        approvedByUser?: boolean;
        approvalEvidence?: string;
      },
      store: Store,
    ) => {
      const normalizedApprovalEvidence = approvalEvidence?.trim() || undefined;

      // Verify the change exists
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_reenter", target: changeId },
          formatToolOutput({ error: result.error }),
        );
      }
      if (!result.data) {
        return wrapWithBanner(
          { command: "adv_change_reenter", target: changeId },
          formatToolOutput({ error: `Change not found: ${changeId}` }),
        );
      }

      try {
        await store.gates.reopenFrom(
          changeId,
          fromGate,
          reason,
          scopeDelta,
          undefined,
          normalizedApprovalEvidence,
        );

        // Fetch updated state
        const gates = await store.gates.get(changeId);
        const updatedChange = await store.changes.get(changeId);
        const reentryHistory =
          updatedChange.success && updatedChange.data
            ? (updatedChange.data.reentry_history ?? [])
            : [];
        const latestEntry = reentryHistory[reentryHistory.length - 1];

        return wrapWithBanner(
          { command: "adv_change_reenter", target: changeId },
          formatToolOutput({
            success: true,
            message: `Re-entry from ${fromGate}: gates reset to pending. ${latestEntry?.gates_reset?.length ?? 0} gate(s) reopened.`,
            gates,
            reentry: latestEntry,
          }),
        );
      } catch (error) {
        return wrapWithBanner(
          { command: "adv_change_reenter", target: changeId },
          formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
  },
};
