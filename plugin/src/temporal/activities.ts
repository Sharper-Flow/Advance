export async function recordTemporalFoundationEvent(input: {
  scope: "change" | "project";
  id: string;
}): Promise<{ scope: "change" | "project"; id: string; recordedAt: string }> {
  return {
    ...input,
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Placeholder activity for future project-wisdom JSONL export.
 * The current task only establishes the contract surface so the worker has
 * explicit project-scoped activities before the store adapter task wires them.
 */
export async function recordProjectWisdomExport(input: {
  projectId: string;
  entryCount: number;
}): Promise<{ projectId: string; entryCount: number; exportedAt: string }> {
  return {
    ...input,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Placeholder activity for migration-ledger recording during JSON→Temporal
 * import/recovery flows. The migration task will decide actual persistence.
 */
export async function recordProjectMigrationEvent(input: {
  projectId: string;
  key: string;
  status: "pending" | "done" | "failed";
}): Promise<{
  projectId: string;
  key: string;
  status: "pending" | "done" | "failed";
  recordedAt: string;
}> {
  return {
    ...input,
    recordedAt: new Date().toISOString(),
  };
}

export { migrateSingleProjectActivity } from "./migrate-runner";
