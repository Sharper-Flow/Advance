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
import { mapWithConcurrency } from "../utils/concurrency";
import {
  buildResumeProjection,
  type ChangeNodeInput,
  type EpicNodeInput,
  type EpicEntryInput,
} from "../projection/resume-projection";

/**
 * Bounded concurrency for hydrating non-terminal changes. The list() call
 * already loads summaries for the full dependency graph; we only need full
 * Change objects for active/draft changes (to resolve dependencies and
 * in-progress tasks). Running these gets in parallel with a small cap avoids
 * the sequential N+1 timeout that blew the 10s direct tool deadline while
 * keeping in-flight Temporal reads bounded.
 */
const RESUME_PROJECTION_GET_CONCURRENCY = 8;

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
        .describe("Optional Epic filter. Default: all active Epics in scope."),
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
        // Let the store hydrate the full dependency graph with a bit more
        // parallelism than the default; this single bounded call replaces the
        // previous sequential per-change get storm.
        validationConcurrency: RESUME_PROJECTION_GET_CONCURRENCY,
      });

      const terminalInputs: ChangeNodeInput[] = [];
      const nonTerminalSummaries: typeof listResult.changes = [];
      for (const summary of listResult.changes) {
        const isTerminal =
          summary.status === "archived" || summary.status === "closed";

        if (isTerminal) {
          // Terminal changes only need status for the "done" classification.
          terminalInputs.push({
            id: summary.id,
            title: summary.title,
            status: summary.status,
            lifecycleState: summary.lifecycleState ?? "open",
            same_project_dependencies: [],
            hasInProgressTasks: false,
            epic_membership: summary.epic_membership,
          });
        } else {
          nonTerminalSummaries.push(summary);
        }
      }

      // Hydrate non-terminal changes with bounded concurrency. Each get is
      // independent, and failures degrade to the summary-only input.
      const nonTerminalInputs = await mapWithConcurrency(
        nonTerminalSummaries,
        RESUME_PROJECTION_GET_CONCURRENCY,
        async (summary): Promise<ChangeNodeInput> => {
          try {
            const full = await store.changes.get(summary.id);
            if (!full.success || !full.data) {
              // Degrade gracefully: use summary if full get fails.
              return {
                id: summary.id,
                title: summary.title,
                status: summary.status,
                lifecycleState: summary.lifecycleState ?? "open",
                same_project_dependencies: [],
                hasInProgressTasks: false,
                epic_membership: summary.epic_membership,
              };
            }
            const change = full.data;
            const hasInProgressTasks =
              change.tasks?.some((t) => t.status === "in_progress") ?? false;

            return {
              id: change.id,
              title: change.title,
              status: change.status,
              lifecycleState: change.lifecycleState ?? "open",
              same_project_dependencies: change.same_project_dependencies ?? [],
              hasInProgressTasks,
              epic_membership: change.epic_membership,
            };
          } catch {
            // Degrade gracefully: use summary if full get fails.
            return {
              id: summary.id,
              title: summary.title,
              status: summary.status,
              lifecycleState: summary.lifecycleState ?? "open",
              same_project_dependencies: [],
              hasInProgressTasks: false,
              epic_membership: summary.epic_membership,
            };
          }
        },
      );

      const changeInputs: ChangeNodeInput[] = [
        ...terminalInputs,
        ...nonTerminalInputs,
      ];

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
