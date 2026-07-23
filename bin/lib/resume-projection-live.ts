/**
 * Live Temporal resume projection loader for bin/adv.
 *
 * Loads active change records and Epic workflow state directly from Temporal,
 * then adapts them through buildBinResumeProjection. This is intentionally
 * separate from the MCP plugin Store so the CLI can produce a projection even
 * when the plugin host is not running.
 *
 * rq-workGraphTypes01 (addDependencyAwareResume) — Phase F1
 */

import type { Client } from "@temporalio/client";

import { buildBinResumeProjection } from "./resume-projection";
import type { ResumeProjection } from "../../plugin/src/cli/projection-boundary";
import {
  buildChangeWorkflowId,
  buildEpicWorkflowId,
  CHANGE_WORKFLOW_QUERY_NAMES,
  EPIC_WORKFLOW_QUERY_NAMES,
  createTemporalClientBundle,
  escapeVisibilityValue,
  listChangeWorkflowIds,
  listEpicWorkflowIds,
} from "../../plugin/src/cli/temporal-boundary";
import { QUERY_TIMEOUT_MS } from "./live-status";

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

interface ChangeRecord {
  id: string;
  title: string;
  status: string;
  lifecycleState?: string;
  same_project_dependencies?: Array<{
    kind: "change" | "epic";
    change_id?: string;
    epic_id?: string;
    entry_id?: string;
  }>;
  tasks?: Array<{ status: string }>;
  epic_membership?: { epic_id: string; entry_id: string; order: number };
}

interface EpicRecord {
  id: string;
  title: string;
  entries: ReadonlyArray<{
    kind: string;
    entry_id: string;
    order: number;
    title?: string;
    change_id?: string;
    success_hint?: string;
    blocked_by?: Array<{
      kind: "change" | "epic";
      change_id?: string;
      epic_id?: string;
      entry_id?: string;
    }>;
  }>;
}

export interface LiveResumeProjectionResult {
  live: boolean;
  resume_projection?: ResumeProjection;
  error?: string;
  remediation?: string;
}

export async function loadLiveResumeProjection(
  projectId: string,
  timeoutMs = QUERY_TIMEOUT_MS,
  epicIds?: string[],
): Promise<LiveResumeProjectionResult> {
  const bundle = await withTimeout(
    createTemporalClientBundle(),
    timeoutMs,
    "Temporal connection",
  );

  try {
    const client = bundle.client as Client;

    const [changeIds, epicIdList] = await Promise.all([
      withTimeout(
        listChangeWorkflowIds(client, { projectId }),
        timeoutMs,
        "Temporal change list",
      ),
      withTimeout(
        listEpicWorkflowIds(client, {
          projectId,
          status: "active",
        }),
        timeoutMs,
        "Temporal epic list",
      ),
    ]);

    const changeRecords: ChangeRecord[] = [];
    for (const id of changeIds) {
      try {
        const workflowId = buildChangeWorkflowId(projectId, id);
        const raw = (await withTimeout(
          client.workflow.getHandle(workflowId).query(CHANGE_WORKFLOW_QUERY_NAMES.getState),
          timeoutMs,
          `Temporal query ${id}`,
        )) as unknown;
        changeRecords.push(normalizeChangeRecord(raw));
      } catch (err) {
        // Skip unreachable changes; projection is advisory.
      }
    }

    const epicRecords: EpicRecord[] = [];
    const idsToQuery = epicIds?.length ? epicIds : epicIdList.map((e) => e.id);
    for (const id of idsToQuery) {
      try {
        const workflowId = buildEpicWorkflowId(projectId, id);
        const raw = (await withTimeout(
          client.workflow.getHandle(workflowId).query(EPIC_WORKFLOW_QUERY_NAMES.getState),
          timeoutMs,
          `Temporal epic query ${id}`,
        )) as unknown;
        const epic = normalizeEpicRecord(raw);
        if (epic) epicRecords.push(epic);
      } catch (err) {
        // Skip unreachable epics; projection is advisory.
      }
    }

    const projection = buildBinResumeProjection(
      changeRecords,
      epicRecords,
      projectId,
      epicIds,
    );

    return {
      live: true,
      resume_projection: projection,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      live: false,
      error: message,
      remediation:
        "ADV resume projection unavailable. Verify Temporal is running and the project has active changes/epics.",
    };
  } finally {
    await bundle.connection.close();
  }
}

function normalizeChangeRecord(raw: unknown): ChangeRecord {
  const anyRaw = raw as Record<string, unknown>;
  return {
    id: String(anyRaw.id ?? anyRaw.changeId ?? ""),
    title: String(anyRaw.title ?? anyRaw.id ?? anyRaw.changeId ?? "(untitled)"),
    status: String(anyRaw.status ?? "draft"),
    lifecycleState: String(anyRaw.lifecycleState ?? "open"),
    same_project_dependencies: Array.isArray(anyRaw.same_project_dependencies)
      ? anyRaw.same_project_dependencies
      : [],
    tasks: Array.isArray(anyRaw.tasks) ? anyRaw.tasks : [],
    epic_membership: anyRaw.epic_membership as
      | { epic_id: string; entry_id: string; order: number }
      | undefined,
  };
}

function normalizeEpicRecord(raw: unknown): EpicRecord | null {
  const anyRaw = raw as Record<string, unknown>;
  const epic = anyRaw.epic as Record<string, unknown> | undefined;
  if (!epic) return null;

  const id = String(epic.id ?? anyRaw.id ?? "");
  const title = String(epic.title ?? id);
  const entries = Array.isArray(epic.entries) ? epic.entries : [];

  return {
    id,
    title,
    entries: entries.map((entry: Record<string, unknown>) => {
      const kind = String(entry.kind ?? "shell");
      return {
        kind,
        entry_id: String(entry.entry_id ?? ""),
        order: Number(entry.order ?? 0),
        title: entry.title ? String(entry.title) : undefined,
        change_id: entry.change_id ? String(entry.change_id) : undefined,
        success_hint: entry.success_hint ? String(entry.success_hint) : undefined,
        blocked_by: Array.isArray(entry.blocked_by) ? entry.blocked_by : undefined,
      };
    }),
  };
}

export { escapeVisibilityValue };
