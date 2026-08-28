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
import type { WorkNodeRef } from "../types/work-graph";
import {
  buildResumeProjection,
  type ChangeNodeInput,
  type EpicNodeInput,
  type EpicEntryInput,
} from "../projection/resume-projection";

/**
 * Bounded concurrency for hydrating non-terminal changes. Running these gets
 * in parallel with a small cap avoids the sequential N+1 timeout that blew the
 * 10s direct tool deadline while keeping in-flight reads bounded.
 */
const RESUME_PROJECTION_GET_CONCURRENCY = 8;

const resumeProjectionToolDefinitions = {
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
      // Active-first loading: only non-terminal (draft/pending/active) changes.
      // No includeArchived/includeClosed scan on ordinary calls. This keeps the
      // initial load proportional to live work (~5 changes) instead of full
      // history (~88 changes), which is what was timing out under live load.
      // -------------------------------------------------------------------
      const listResult = await store.changes.list({
        validationConcurrency: RESUME_PROJECTION_GET_CONCURRENCY,
      });

      // Hydrate every active/draft change with bounded concurrency. Failures
      // degrade gracefully to a summary-only input.
      const activeInputs = await mapWithConcurrency(
        listResult.changes,
        RESUME_PROJECTION_GET_CONCURRENCY,
        async (summary): Promise<ChangeNodeInput> => {
          try {
            const full = await store.changes.get(summary.id);
            if (!full.success || !full.data) {
              return degradeToSummary(summary);
            }
            const change = full.data;
            return {
              id: change.id,
              title: change.title,
              status: change.status,
              lifecycleState: change.lifecycleState ?? "open",
              same_project_dependencies: change.same_project_dependencies ?? [],
              hasInProgressTasks:
                change.tasks?.some((t) => t.status === "in_progress") ?? false,
              epic_membership: change.epic_membership,
            };
          } catch {
            return degradeToSummary(summary);
          }
        },
      );

      const activeById = new Map(activeInputs.map((c) => [c.id, c]));

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
      // Resolve only referenced terminal dependencies.
      //
      // The kernel needs terminal prereqs in scope so that dependents blocked
      // by completed work are classified actionable. We collect the same-
      // project change refs from active changes and Epic shell blocked_by lists,
      // then fetch only the IDs that are not already in the active set. This is
      // bounded by the number of live edges, not the size of history.
      // -------------------------------------------------------------------
      const referencedTerminalIds = new Set<string>();
      const collectChangeRef = (ref: WorkNodeRef) => {
        if (
          ref.kind === "change" &&
          ref.project_id === projectId &&
          !activeById.has(ref.change_id)
        ) {
          referencedTerminalIds.add(ref.change_id);
        }
      };

      for (const change of activeInputs) {
        for (const dep of change.same_project_dependencies) {
          collectChangeRef(dep);
        }
      }
      for (const epic of epicInputs) {
        for (const entry of epic.entries) {
          if (entry.kind === "shell") {
            for (const dep of entry.blocked_by) {
              collectChangeRef(dep);
            }
          }
        }
      }

      const terminalInputs = await mapWithConcurrency(
        Array.from(referencedTerminalIds),
        RESUME_PROJECTION_GET_CONCURRENCY,
        async (id): Promise<ChangeNodeInput | null> => {
          try {
            const full = await store.changes.get(id);
            if (!full.success || !full.data) return null;
            const change = full.data;
            return {
              id: change.id,
              title: change.title,
              status: change.status,
              lifecycleState: change.lifecycleState ?? "open",
              same_project_dependencies: change.same_project_dependencies ?? [],
              hasInProgressTasks:
                change.tasks?.some((t) => t.status === "in_progress") ?? false,
              epic_membership: change.epic_membership,
            };
          } catch {
            return null;
          }
        },
      );

      const changeInputs: ChangeNodeInput[] = [
        ...activeInputs,
        ...terminalInputs.filter((c): c is ChangeNodeInput => c !== null),
      ];

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

export const resumeProjectionTools = resumeProjectionToolDefinitions;

function degradeToSummary(summary: {
  id: string;
  title: string;
  status: "draft" | "archived" | "closed" | string;
  lifecycleState?: "open" | "archived" | "closed" | null;
  epic_membership?:
    | {
        epic_id: string;
        entry_id: string;
        order: number;
      }
    | undefined;
}): ChangeNodeInput {
  return {
    id: summary.id,
    title: summary.title,
    status: summary.status as ChangeNodeInput["status"],
    lifecycleState: summary.lifecycleState ?? "open",
    same_project_dependencies: [],
    hasInProgressTasks: false,
    epic_membership: summary.epic_membership,
  };
}
