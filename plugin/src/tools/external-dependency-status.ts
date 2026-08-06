import { createDiskStore } from "../storage/store-disk";
import { validateCrossRepoTarget } from "./target-project";
import { createDefaultGates, type ExternalDependency } from "../types";
import { getExternalRootForProject, getProjectId } from "../utils/project-id";
import { withTimeout, TimeoutError } from "../utils/with-timeout";

export type ExternalDependencyStatus = {
  summary: {
    total: number;
    satisfied: number;
    warning: number;
    blocking: number;
    advisoryOnly: true;
  };
  note: string;
  dependencies: Array<{
    target_path: string;
    changeId: string;
    gate?: string;
    taskId?: string;
    relationship: string;
    advisory: boolean;
    status: "satisfied" | "warning";
    message: string;
  }>;
};

export interface ExternalDependencyStatusOptions {
  /**
   * Maximum number of dependency lookups in flight at once. Capped to avoid
   * opening an unbounded number of external stores on a single read.
   */
  concurrency?: number;
  /**
   * Budget for each individual dependency lookup. Exceeding it degrades that
   * dependency to a warning instead of failing the whole read.
   */
  perItemTimeoutMs?: number;
  /**
   * Budget for the entire enrichment. Exceeding it returns a degraded result
   * with the same shape and a partial note.
   */
  totalTimeoutMs?: number;
}

const DEFAULT_CONCURRENCY = 4;
// Aligned with the 1500ms adv_change_show per-member outer cap: inner budgets
// larger than that are never reachable, and the same-shape warning output is
// preserved when the total budget expires.
const DEFAULT_PER_ITEM_TIMEOUT_MS = 1_500;
const DEFAULT_TOTAL_TIMEOUT_MS = 1_500;

const TOTAL_DEADLINE_MESSAGE =
  "External dependency status enrichment deadline exceeded";

function baseDependencyFields(dependency: ExternalDependency) {
  return {
    target_path: dependency.target_path,
    changeId: dependency.changeId,
    gate: dependency.gate,
    taskId: dependency.taskId,
    relationship: dependency.relationship,
    advisory: dependency.advisory,
  };
}

export async function buildExternalDependencyStatus(
  dependencies: ExternalDependency[] | undefined,
  options: ExternalDependencyStatusOptions = {},
): Promise<ExternalDependencyStatus | undefined> {
  if (!dependencies || dependencies.length === 0) return undefined;

  const concurrency = Math.max(
    1,
    Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY),
  );
  const perItemMs = options.perItemTimeoutMs ?? DEFAULT_PER_ITEM_TIMEOUT_MS;
  const totalMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;

  async function resolveDependency(
    dependency: ExternalDependency,
  ): Promise<ExternalDependencyStatus["dependencies"][number]> {
    const base = baseDependencyFields(dependency);

    try {
      const validation = await validateCrossRepoTarget(dependency.target_path);
      if (!validation.ok) {
        return {
          ...base,
          status: "warning" as const,
          message: validation.error,
        };
      }

      const targetProjectId = await getProjectId(dependency.target_path);
      const targetStore = await createDiskStore(dependency.target_path, {
        externalRoot: targetProjectId
          ? getExternalRootForProject(targetProjectId)
          : undefined,
      });
      try {
        const changeResult = await targetStore.changes.get(dependency.changeId);
        if (!changeResult.success || !changeResult.data) {
          return {
            ...base,
            status: "warning" as const,
            message: `Target change not found: ${dependency.changeId}`,
          };
        }

        if (dependency.gate) {
          const gates = changeResult.data.gates ?? createDefaultGates();
          const gate = gates[dependency.gate];
          const satisfied = gate?.status === "done";
          return {
            ...base,
            status: satisfied ? ("satisfied" as const) : ("warning" as const),
            message: satisfied
              ? `Target gate satisfied: ${dependency.gate}`
              : `Target gate not complete: ${dependency.gate}`,
          };
        }

        if (dependency.taskId) {
          const task = changeResult.data.tasks.find(
            (candidate) => candidate.id === dependency.taskId,
          );
          const satisfied = task?.status === "done";
          return {
            ...base,
            status: satisfied ? ("satisfied" as const) : ("warning" as const),
            message: satisfied
              ? `Target task satisfied: ${dependency.taskId}`
              : `Target task not complete: ${dependency.taskId}`,
          };
        }

        return {
          ...base,
          status: "satisfied" as const,
          message: `Target change found: ${dependency.changeId}`,
        };
      } finally {
        targetStore.close();
      }
    } catch (err) {
      return {
        ...base,
        status: "warning" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function resolveDependencyWithTimeout(
    dependency: ExternalDependency,
  ): Promise<ExternalDependencyStatus["dependencies"][number]> {
    try {
      return await withTimeout(
        resolveDependency(dependency),
        perItemMs,
        `External dependency lookup timed out for ${dependency.changeId} at ${dependency.target_path}`,
      );
    } catch (err) {
      const base = baseDependencyFields(dependency);
      if (err instanceof TimeoutError) {
        return {
          ...base,
          status: "warning" as const,
          message: `External dependency lookup timed out (${perItemMs}ms budget)`,
        };
      }
      return {
        ...base,
        status: "warning" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Bounded-concurrency map that returns whatever has resolved when the total
   * deadline expires. Completed results are preserved; only unfinished items are
   * marked as warnings so a single slow dependency cannot overwrite already
   * satisfied ones.
   */
  async function mapWithDeadline<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
    deadlineMs: number,
    timeoutResult: (item: T, index: number) => R,
  ): Promise<R[]> {
    const n = items.length;
    const results = new Array<R>(n);
    const assigned = new Set<number>();
    let started = 0;

    const deadlinePromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        for (let i = 0; i < n; i++) {
          if (!assigned.has(i)) {
            results[i] = timeoutResult(items[i], i);
            assigned.add(i);
          }
        }
        resolve();
      }, deadlineMs);
    });

    async function worker(): Promise<void> {
      for (;;) {
        if (assigned.size === n) return;
        const index = started++;
        if (index >= n) return;
        try {
          const value = await fn(items[index], index);
          if (!assigned.has(index)) {
            results[index] = value;
            assigned.add(index);
          }
        } catch {
          if (!assigned.has(index)) {
            results[index] = timeoutResult(items[index], index);
            assigned.add(index);
          }
        }
      }
    }

    await Promise.race([
      Promise.all(Array.from({ length: limit }, () => worker())),
      deadlinePromise,
    ]);

    // Fill any indices that were not assigned by the deadline or a worker.
    for (let i = 0; i < n; i++) {
      if (!assigned.has(i)) {
        results[i] = timeoutResult(items[i], i);
        assigned.add(i);
      }
    }

    return results;
  }

  const dependencyStatuses = await mapWithDeadline(
    dependencies,
    concurrency,
    resolveDependencyWithTimeout,
    totalMs,
    (dependency) => ({
      ...baseDependencyFields(dependency),
      status: "warning" as const,
      message: TOTAL_DEADLINE_MESSAGE,
    }),
  );

  const satisfied = dependencyStatuses.filter(
    (dependency) => dependency.status === "satisfied",
  ).length;
  const warning = dependencyStatuses.length - satisfied;
  const deadlineExceeded = dependencyStatuses.some(
    (dependency) => dependency.message === TOTAL_DEADLINE_MESSAGE,
  );

  return {
    summary: {
      total: dependencyStatuses.length,
      satisfied,
      warning,
      blocking: 0,
      advisoryOnly: true,
    },
    note: deadlineExceeded
      ? `External dependency status is partial: enrichment deadline exceeded (${totalMs}ms budget). External dependencies are advisory only and do not block gates or archive by default.`
      : "External dependencies are advisory only and do not block gates or archive by default.",
    dependencies: dependencyStatuses,
  };
}
