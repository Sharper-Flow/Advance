export interface AdvWorkerTuningOptions {
  workflowTaskPollerBehavior: { type: "simple-maximum"; maximum: number };
  activityTaskPollerBehavior: { type: "simple-maximum"; maximum: number };
  maxConcurrentWorkflowTaskExecutions: number;
  maxConcurrentActivityTaskExecutions: number;
  maxConcurrentLocalActivityExecutions: number;
  maxActivitiesPerSecond: number;
}

/**
 * Single source of truth for ADV Worker.create tuning. Caps bound per-session
 * polling footprint so per-session task-queue routing does not increase total
 * per-project load. See ADR-0001 (draft) and change isolateAdvWorkerTaskQueues
 * design.md KD-3.
 */

function readInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getAdvWorkerTuningOptions(
  env: NodeJS.ProcessEnv = process.env,
): AdvWorkerTuningOptions {
  return {
    workflowTaskPollerBehavior: {
      type: "simple-maximum",
      maximum: readInt(env, "ADV_WORKER_WORKFLOW_POLLER_CAP", 1),
    },
    activityTaskPollerBehavior: {
      type: "simple-maximum",
      maximum: readInt(env, "ADV_WORKER_ACTIVITY_POLLER_CAP", 1),
    },
    maxConcurrentWorkflowTaskExecutions: readInt(
      env,
      "ADV_WORKER_WORKFLOW_SLOT_CAP",
      4,
    ),
    maxConcurrentActivityTaskExecutions: readInt(
      env,
      "ADV_WORKER_ACTIVITY_SLOT_CAP",
      4,
    ),
    maxConcurrentLocalActivityExecutions: readInt(
      env,
      "ADV_WORKER_LOCAL_ACTIVITY_SLOT_CAP",
      4,
    ),
    maxActivitiesPerSecond: readInt(env, "ADV_WORKER_ACTIVITY_RATE", 10),
  };
}
