/**
 * bin/adv resume-projection adapter.
 *
 * Thin adapter that maps bin/adv's data shapes to the kernel input types and
 * calls buildResumeProjection. bin/adv loads disk projections directly, then
 * calls this adapter.
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase E
 */

import {
  buildResumeProjection,
  type ChangeNodeInput,
  type EpicNodeInput,
  type EpicEntryInput,
  type ResumeProjection,
  type WorkNodeRef,
} from "../../plugin/src/cli/projection-boundary";

/**
 * Build the resume projection from bin/adv's loaded data.
 *
 * @param changeRecords - Change records from disk projections
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
    tasks?: ReadonlyArray<{ status: string }>;
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
    // Task status is authoritative for activity. Keep the summary-count
    // fallback for callers that do not load task records.
    hasInProgressTasks:
      r.tasks?.some((task) => task.status === "in_progress") ??
      ((r.completedTasks ?? 0) > 0 &&
        (r.completedTasks ?? 0) < (r.taskCount ?? 0)),
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
