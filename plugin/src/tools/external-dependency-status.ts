import { createDiskStore as createLegacyStore } from "../storage/store-disk";
import { validateCrossRepoTarget } from "../temporal/activities";
import { createDefaultGates, type ExternalDependency } from "../types";
import { getExternalRootForProject, getProjectId } from "../utils/project-id";

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

export async function buildExternalDependencyStatus(
  dependencies: ExternalDependency[] | undefined,
): Promise<ExternalDependencyStatus | undefined> {
  if (!dependencies || dependencies.length === 0) return undefined;

  const dependencyStatuses = await Promise.all(
    dependencies.map(async (dependency) => {
      const base = {
        target_path: dependency.target_path,
        changeId: dependency.changeId,
        gate: dependency.gate,
        taskId: dependency.taskId,
        relationship: dependency.relationship,
        advisory: dependency.advisory,
      };

      try {
        const validation = await validateCrossRepoTarget(
          dependency.target_path,
        );
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
          const changeResult = await targetStore.changes.get(
            dependency.changeId,
          );
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
    }),
  );

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
