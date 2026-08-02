import { createDiskStore as createLegacyStore } from "../storage/store-disk";
import { validateCrossRepoTarget } from "../temporal/activities";
import { createDefaultGates, type ExternalDependency } from "../types";
import { getExternalRootForProject, getProjectId } from "../utils/project-id";
import { withTimeout, TimeoutError } from "../utils/with-timeout";
import { mapWithConcurrency } from "../utils/concurrency";

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
const DEFAULT_PER_ITEM_TIMEOUT_MS = 2_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 5_000;

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
    const base = {
      target_path: dependency.target_path,
      changeId: dependency.changeId,
      gate: dependency.gate,
      taskId: dependency.taskId,
      relationship: dependency.relationship,
      advisory: dependency.advisory,
    };

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
      const targetStore = await createLegacyStore(dependency.target_path, {
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
      if (err instanceof TimeoutError) {
        return {
          target_path: dependency.target_path,
          changeId: dependency.changeId,
          gate: dependency.gate,
          taskId: dependency.taskId,
          relationship: dependency.relationship,
          advisory: dependency.advisory,
          status: "warning" as const,
          message: `External dependency lookup timed out (${perItemMs}ms budget)`,
        };
      }
      throw err;
    }
  }

  let dependencyStatuses: ExternalDependencyStatus["dependencies"];
  try {
    dependencyStatuses = await withTimeout(
      mapWithConcurrency(
        dependencies,
        concurrency,
        resolveDependencyWithTimeout,
      ),
      totalMs,
      "External dependency status enrichment timed out",
    );
  } catch (err) {
    if (err instanceof TimeoutError) {
      dependencyStatuses = dependencies.map((dependency) => ({
        target_path: dependency.target_path,
        changeId: dependency.changeId,
        gate: dependency.gate,
        taskId: dependency.taskId,
        relationship: dependency.relationship,
        advisory: dependency.advisory,
        status: "warning" as const,
        message: "External dependency status enrichment deadline exceeded",
      }));
      return {
        summary: {
          total: dependencyStatuses.length,
          satisfied: 0,
          warning: dependencyStatuses.length,
          blocking: 0,
          advisoryOnly: true,
        },
        note: `External dependency status is partial: enrichment deadline exceeded (${totalMs}ms budget). External dependencies are advisory only and do not block gates or archive by default.`,
        dependencies: dependencyStatuses,
      };
    }
    throw err;
  }

  const satisfied = dependencyStatuses.filter(
    (dependency) => dependency.status === "satisfied",
  ).length;
  const warning = dependencyStatuses.length - satisfied;

  return {
    summary: {
      total: dependencyStatuses.length,
      satisfied,
      warning,
      blocking: 0,
      advisoryOnly: true,
    },
    note: "External dependencies are advisory only and do not block gates or archive by default.",
    dependencies: dependencyStatuses,
  };
}
