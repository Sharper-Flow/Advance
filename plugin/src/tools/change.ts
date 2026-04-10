/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */

import { z } from "zod";
import { join } from "path";
import { readFile, stat } from "fs/promises";
import type { Spec, FeatureFlags } from "../types";
import {
  createDefaultGates,
  getIncompleteGates,
  allGatesSatisfied,
  type ClarifyFindingSnapshot,
} from "../types";
import type { Store } from "../storage/store";
import { validateChange } from "../validator";
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
      const taskCounts = {
        done: change.tasks.filter((t) => t.status === "done").length,
        in_progress: change.tasks.filter((t) => t.status === "in_progress")
          .length,
        pending: change.tasks.filter((t) => t.status === "pending").length,
        cancelled: change.tasks.filter((t) => t.status === "cancelled").length,
      };
      const inProgressTask = change.tasks.find(
        (t) => t.status === "in_progress",
      );
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
          const currentCodes = new Set(
            clarifyResult.findings.map((f) => f.code),
          );
          const existing: ClarifyFindingSnapshot[] =
            change.clarify_findings ?? [];

          // Mark previously-persisted findings as resolved if no longer raised
          const updated: ClarifyFindingSnapshot[] = existing.map((f) =>
            !f.resolved && !currentCodes.has(f.code)
              ? { ...f, resolved: true, resolved_at: now }
              : f,
          );

          // Append new findings not yet in snapshots
          const existingCodes = new Set(existing.map((f) => f.code));
          for (const finding of clarifyResult.findings) {
            if (!existingCodes.has(finding.code)) {
              updated.push({
                code: finding.code,
                severity: finding.severity as "error" | "warning" | "info",
                message: finding.message,
                recorded_at: now,
              });
            }
          }

          if (updated.length > 0) {
            // Persist back to the change (best-effort — don't fail if save fails)
            try {
              const freshResult = await store.changes.get(changeId);
              if (freshResult.success && freshResult.data) {
                freshResult.data.clarify_findings = updated;
                await store.changes.save(freshResult.data);
              }
            } catch {
              // Non-fatal: persistence failure doesn't affect the tool response
            }
          }
        } else {
          // No current findings — resolve any previously-persisted unresolved findings
          if (change.clarify_findings?.some((f) => !f.resolved)) {
            const now = new Date().toISOString();
            try {
              const freshResult = await store.changes.get(changeId);
              if (freshResult.success && freshResult.data) {
                freshResult.data.clarify_findings = (
                  freshResult.data.clarify_findings ?? []
                ).map((f: ClarifyFindingSnapshot) =>
                  !f.resolved ? { ...f, resolved: true, resolved_at: now } : f,
                );
                await store.changes.save(freshResult.data);
              }
            } catch {
              // Non-fatal
            }
          }
        }
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
    },
    execute: async (
      {
        summary,
        capability,
        proposal,
        problemStatement,
        agreement,
        design,
      }: {
        summary: string;
        capability?: string;
        proposal?: string;
        problemStatement?: string;
        agreement?: string;
        design?: string;
      },
      store: Store,
    ) => {
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

      // In strict mode, treat warnings as errors
      const passed = strict
        ? validationResult.errors.length === 0 &&
          validationResult.warnings.length === 0
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
      const archiveResult = await archiveChange({
        change,
        specs,
        paths: store.paths,
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

  adv_change_add_issue: {
    description: "Add a GitHub issue URL to a change",
    args: {
      changeId: z.string().describe("Change ID"),
      issueUrl: z.string().url().describe("GitHub issue URL to add"),
    },
    execute: async (
      { changeId, issueUrl }: { changeId: string; issueUrl: string },
      store: Store,
    ) => {
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_add_issue", target: changeId },
          formatToolOutput({ error: result.error }),
        );
      }
      if (!result.data) {
        return wrapWithBanner(
          { command: "adv_change_add_issue", target: changeId },
          formatToolOutput({ error: `Change not found: ${changeId}` }),
        );
      }

      const change = result.data;

      // Initialize github_issues array if not present
      if (!change.github_issues) {
        change.github_issues = [];
      }

      // Check for duplicate
      if (change.github_issues.includes(issueUrl)) {
        return wrapWithBanner(
          { command: "adv_change_add_issue", target: changeId },
          formatToolOutput({
            success: true,
            message: `Issue already linked: ${issueUrl}`,
            github_issues: change.github_issues,
          }),
        );
      }

      // Add the issue URL
      change.github_issues.push(issueUrl);

      // Save the change
      await store.changes.save(change);

      return wrapWithBanner(
        { command: "adv_change_add_issue", target: changeId },
        formatToolOutput({
          success: true,
          message: `Added issue: ${issueUrl}`,
          github_issues: change.github_issues,
        }),
      );
    },
  },

  adv_change_remove_issue: {
    description: "Remove a GitHub issue URL from a change",
    args: {
      changeId: z.string().describe("Change ID"),
      issueUrl: z.string().url().describe("GitHub issue URL to remove"),
    },
    execute: async (
      { changeId, issueUrl }: { changeId: string; issueUrl: string },
      store: Store,
    ) => {
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_remove_issue", target: changeId },
          formatToolOutput({ error: result.error }),
        );
      }
      if (!result.data) {
        return wrapWithBanner(
          { command: "adv_change_remove_issue", target: changeId },
          formatToolOutput({ error: `Change not found: ${changeId}` }),
        );
      }

      const change = result.data;

      // Check if github_issues exists and contains the URL
      if (!change.github_issues || !change.github_issues.includes(issueUrl)) {
        return wrapWithBanner(
          { command: "adv_change_remove_issue", target: changeId },
          formatToolOutput({
            success: true,
            message: `Issue not linked: ${issueUrl}`,
            github_issues: change.github_issues || [],
          }),
        );
      }

      // Remove the issue URL
      change.github_issues = change.github_issues.filter(
        (url) => url !== issueUrl,
      );

      // Save the change
      await store.changes.save(change);

      return wrapWithBanner(
        { command: "adv_change_remove_issue", target: changeId },
        formatToolOutput({
          success: true,
          message: `Removed issue: ${issueUrl}`,
          github_issues: change.github_issues,
        }),
      );
    },
  },
};
