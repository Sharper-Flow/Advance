/**
 * adv CLI — live Temporal Epic list reader
 *
 * Reads Epic workflow IDs from Temporal Visibility only. Does not read ADV
 * external state files and does not query or hydrate Epic workflow state.
 */

import {
  listEpicWorkflows,
  type EpicWorkflowListEntry as TemporalEpicWorkflowListEntry,
  withTemporalOperations,
  type TemporalOperations,
  TemporalListOutcomeError,
} from "../../plugin/src/cli/temporal-boundary";
import { QUERY_TIMEOUT_MS } from "./live-status";

export interface EpicListEntry {
  id: string;
  startTime: string | null;
}

export interface EpicListPayload {
  source: "temporal";
  live: boolean;
  stale: false;
  generated_at: string;
  project_id: string | null;
  epics: EpicListEntry[];
  resume_projection?: unknown;
  /**
   * Always present. Explains whether `resume_projection` can be trusted as a
   * full answer, so an absent projection is never silently ambiguous.
   */
  resume_projection_state?: unknown;
  error?: string;
  remediation?: string;
}

export function buildLiveEpicListPayload(
  epics: TemporalEpicWorkflowListEntry[],
  options: {
    projectId: string;
    now: Date;
  },
): EpicListPayload {
  return {
    source: "temporal",
    live: true,
    stale: false,
    generated_at: options.now.toISOString(),
    project_id: options.projectId,
    epics: epics.map((epic) => ({
      id: epic.id,
      startTime: epic.startTime ? epic.startTime.toISOString() : null,
    })),
  };
}

export function buildLiveEpicListFailure(
  projectId: string | null,
  error: unknown,
  now: Date,
): EpicListPayload {
  const message = error instanceof Error ? error.message : String(error);
  return {
    source: "temporal",
    live: false,
    stale: false,
    generated_at: now.toISOString(),
    project_id: projectId,
    epics: [],
    error: message,
    remediation:
      "Live ADV Epic list unavailable. Verify this command is running inside a git repository and Temporal is reachable.",
  };
}

export async function listEpicsFromVisibility(
  owner: TemporalOperations,
  options: { projectId: string; timeoutMs?: number; status?: "active" | "all" },
): Promise<TemporalEpicWorkflowListEntry[]> {
  const timeoutMs = options.timeoutMs ?? QUERY_TIMEOUT_MS;
  const outcome = await listEpicWorkflows(owner, {
    projectId: options.projectId,
    status: options.status ?? "active",
    limit: 1000,
  });
  if (outcome.kind !== "complete") {
    throw new TemporalListOutcomeError(outcome);
  }
  return outcome.value;
}

export async function loadLiveEpics(
  projectId: string,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<TemporalEpicWorkflowListEntry[]> {
  return withTemporalOperations(
    projectId,
    (owner) =>
      listEpicsFromVisibility(owner, {
        projectId,
        timeoutMs,
        status: "active",
      }),
    undefined,
    { connectTimeoutMs: timeoutMs },
  );
}
