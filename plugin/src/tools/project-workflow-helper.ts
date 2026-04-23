import { basename, dirname } from "path";
import {
  buildProjectTaskQueue,
  buildProjectWorkflowId,
  getTemporalAddress,
  type TemporalClientBundle,
} from "../temporal/client";
import { getService } from "../temporal/service";
import { canReachTemporalAddress } from "../temporal/runtime-manager";
import {
  getRegisteredTemporalWorkerQueues,
  getTemporalWorkerAliveness,
} from "../plugin-init";
import { getProjectId } from "../utils/project-id";

interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  executeUpdate: (
    definition: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
}

export type ProjectWorkflowAccess =
  | {
      mode: "local-only";
      projectId: string | null;
      reason: string;
    }
  | {
      mode: "unavailable";
      projectId: string;
      reason: string;
    }
  | {
      mode: "workflow-backed";
      projectId: string;
      bundle: TemporalClientBundle;
      handle: WorkflowHandleLike;
    };

function isExternalMutablePath(path?: string): boolean {
  return Boolean(path && !path.includes("/.adv/"));
}

export async function getBoundedProjectWorkflowAccess(input: {
  projectDir: string;
  mutablePath?: string;
  timeoutMs?: number;
}): Promise<ProjectWorkflowAccess> {
  const projectId = isExternalMutablePath(input.mutablePath)
    ? basename(dirname(input.mutablePath!))
    : await getProjectId(input.projectDir);

  if (!projectId) {
    return {
      mode: "local-only",
      projectId: null,
      reason: "No project workflow identity available",
    };
  }

  if (!isExternalMutablePath(input.mutablePath)) {
    return {
      mode: "local-only",
      projectId,
      reason: "Workflow-backed mode not expected for local mutable paths",
    };
  }

  const address = getTemporalAddress(process.env);
  const timeoutMs = input.timeoutMs ?? 250;
  const reachable = await canReachTemporalAddress(address, timeoutMs);
  if (!reachable) {
    return {
      mode: "unavailable",
      projectId,
      reason: `Temporal server at ${address} unreachable within ${timeoutMs}ms`,
    };
  }

  const expectedQueue = buildProjectTaskQueue(projectId);
  const queues = getRegisteredTemporalWorkerQueues();
  if (!getTemporalWorkerAliveness() || !queues.includes(expectedQueue)) {
    return {
      mode: "unavailable",
      projectId,
      reason: `Temporal worker not ready for queue ${expectedQueue}`,
    };
  }

  const bundle = getService();
  if (!bundle) {
    return {
      mode: "unavailable",
      projectId,
      reason: "Temporal service layer not initialized",
    };
  }
  return {
    mode: "workflow-backed",
    projectId,
    bundle,
    handle: bundle.client.workflow.getHandle(
      buildProjectWorkflowId(projectId),
    ) as unknown as WorkflowHandleLike,
  };
}
