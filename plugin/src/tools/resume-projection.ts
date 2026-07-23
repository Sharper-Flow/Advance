/**
 * adv_resume_projection — MCP tool adapter for the resume projection kernel.
 *
 * ADV tool `class: orchestrator` (pure-read, no mutation surface). Loads
 * changes + epics from the store, maps to kernel input types, calls
 * buildResumeProjection, returns the typed projection.
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase E
 */

import { z } from "zod";
import { basename } from "node:path";
import type { Store } from "../storage/store";
import { formatToolOutput } from "../utils/tool-output";
import {
  buildResumeProjection,
  type ChangeNodeInput,
  type EpicNodeInput,
  type EpicEntryInput,
} from "../projection/resume-projection";

export const resumeProjectionTools = {
  adv_resume_projection: {
    description:
      "Generate a dependency-aware resume projection: what to work on next, " +
      "what's blocked, what's active, and cross-Epic redirects. Pure read — no " +
      "signal fired, no state mutation. Diagnostics surface cycles and " +
      "unresolved refs in legacy/partial state without failing.",
    args: {
      epic_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Optional Epic filter. Default: all active Epics in scope.",
        ),
      include_diagnostics: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Include cycles and unresolved_refs diagnostics (default true).",
        ),
    },
    execute: async (
      {
        epic_ids,
        include_diagnostics = true,
      }: {
        epic_ids?: string[];
        include_diagnostics?: boolean;
      },
      store: Store,
    ) => {
      const projectId = store.paths.external
        ? basename(store.paths.external)
        : "";

      // -------------------------------------------------------------------
      // Load changes (draft + archived + closed for full dependency graph).
      // -------------------------------------------------------------------
      const listResult = await store.changes.list({
        includeArchived: true,
        includeClosed: true,
      });

      const changeInputs: ChangeNodeInput[] = [];
      for (const summary of listResult.changes) {
        const isTerminal =
          summary.status === "archived" || summary.status === "closed";

        if (isTerminal) {
          // Terminal changes only need status for the "done" classification.
          changeInputs.push({
            id: summary.id,
            title: summary.title,
            status: summary.status,
            lifecycleState: summary.lifecycleState ?? "open",
            same_project_dependencies: [],
            hasInProgressTasks: false,
            epic_membership: summary.epic_membership,
          });
        } else {
          // Non-terminal changes need full details for deps + task status.
          try {
            const full = await store.changes.get(summary.id);
            if (!full.success || !full.data) {
              // Degrade gracefully: use summary if full get fails.
              changeInputs.push({
                id: summary.id,
                title: summary.title,
                status: summary.status,
                lifecycleState: summary.lifecycleState ?? "open",
                same_project_dependencies: [],
                hasInProgressTasks: false,
                epic_membership: summary.epic_membership,
              });
              continue;
            }
            const change = full.data;
            const hasInProgressTasks =
              change.tasks?.some((t) => t.status === "in_progress") ?? false;

            changeInputs.push({
              id: change.id,
              title: change.title,
              status: change.status,
              lifecycleState: change.lifecycleState ?? "open",
              same_project_dependencies: change.same_project_dependencies ?? [],
              hasInProgressTasks,
              epic_membership: change.epic_membership,
            });
          } catch {
            // Degrade gracefully: use summary if full get fails.
            changeInputs.push({
              id: summary.id,
              title: summary.title,
              status: summary.status,
              lifecycleState: summary.lifecycleState ?? "open",
              same_project_dependencies: [],
              hasInProgressTasks: false,
              epic_membership: summary.epic_membership,
            });
          }
        }
      }

      // -------------------------------------------------------------------
      // Load epics.
      // -------------------------------------------------------------------
      const allEpics = await store.epics.list({ status: "all" });
      const epicInputs: EpicNodeInput[] = allEpics.map((epic) => ({
        id: epic.id,
        title: epic.title,
        entries: (epic.entries ?? []).map((entry): EpicEntryInput => {
          if (entry.kind === "shell") {
            return {
              kind: "shell",
              entry_id: entry.entry_id,
              order: entry.order,
              title: entry.title,
              success_hint: entry.success_hint,
              blocked_by: entry.blocked_by ?? [],
            };
          }
          return {
            kind: "change",
            entry_id: entry.entry_id,
            order: entry.order,
            title: entry.title ?? "",
            change_id: entry.change_id ?? "",
          };
        }),
      }));

      // -------------------------------------------------------------------
      // Build projection.
      // -------------------------------------------------------------------
      const projection = buildResumeProjection(changeInputs, epicInputs, {
        project_id: projectId,
        epic_ids,
      });

      if (!include_diagnostics) {
        return formatToolOutput({
          ...projection,
          diagnostics: { cycles: [], unresolved_refs: [] },
        });
      }

      return formatToolOutput(projection);
    },
  },
};