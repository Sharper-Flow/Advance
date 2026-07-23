/**
 * bin/adv resume-projection adapter.
 *
 * Thin adapter that maps bin/adv's data shapes to the kernel input types and
 * calls buildResumeProjection. Matches the bin/lib/live-status.ts pattern:
 * bin/adv loads data from Temporal directly (not through the plugin Store),
 * then calls this adapter.
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase E
 */

import {
  buildResumeProjection,
  type ChangeNodeInput,
  type EpicNodeInput,
  type EpicEntryInput,
} from "../../plugin/src/projection/resume-projection";
import type { ResumeProjection } from "../../plugin/src/types/work-graph";
import type { WorkNodeRef } from "../../plugin/src/types/work-graph";

/**
 * Build the resume projection from bin/adv's loaded data.
 *
 * @param changeRecords - Live change records from Temporal Visibility
 * @param epics - Epic projections from the store
 * @param projectId - 40-hex project ID
 * @param epicIds - Optional Epic filter
 */
export function buildBinResumeProjection(
  changeRecords: ReadonlyArray<{
    id: string;
    title: string;
    status: string;
    lifecycleState?: string;
    same_project_dependencies?: WorkNodeRef[];
    taskCount?: number;
    completedTasks?: number;
    epic_membership?: { epic_id: string; entry_id: string; order: number };
  }>,
  epics: ReadonlyArray<{
    id: string;
    title: string;
    entries: ReadonlyArray<{
      kind: string;
      entry_id: string;
      order: number;
      title?: string;
      change_id?: string;
      success_hint?: string;
      blocked_by?: WorkNodeRef[];
    }>;
  }>,
  projectId: string,
  epicIds?: string[],
): ResumeProjection {
  const changeInputs: ChangeNodeInput[] = changeRecords.map((r) => ({
    id: r.id,
    title: r.title,
    status: (r.status === "archived" || r.status === "closed"
      ? r.status
      : "draft") as ChangeNodeInput["status"],
    lifecycleState: (r.lifecycleState === "archived" ||
    r.lifecycleState === "closed"
      ? r.lifecycleState
      : "open") as ChangeNodeInput["lifecycleState"],
    same_project_dependencies: r.same_project_dependencies ?? [],
    // Bin records have summary counts; treat any change with completedTasks
    // between 0 and taskCount as potentially having in-progress work.
    hasInProgressTasks:
      (r.completedTasks ?? 0) > 0 && (r.completedTasks ?? 0) < (r.taskCount ?? 0),
    epic_membership: r.epic_membership,
  }));

  const epicInputs: EpicNodeInput[] = epics.map((epic) => ({
    id: epic.id,
    title: epic.title,
    entries: epic.entries.map((entry): EpicEntryInput => {
      if (entry.kind === "shell") {
        return {
          kind: "shell",
          entry_id: entry.entry_id,
          order: entry.order,
          title: entry.title ?? "",
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

  return buildResumeProjection(changeInputs, epicInputs, {
    project_id: projectId,
    epic_ids: epicIds,
  });
}
