import { basename } from "node:path";
import type { Change } from "../types";
import { loadAgenda } from "../storage/agenda";
import { loadAllChanges } from "../storage/json";
import { listProjectWisdom } from "../storage/project-wisdom";
import { buildProjectTaskQueue, createTemporalClientBundle } from "./client";
import type {
  MigrationLedgerEntry,
  ProjectWisdomEntry,
  ProjectWorkflowState,
} from "./contracts";
import { migrateProjectState, reImportChangeState } from "./migration";
import { migrateAllProjectsWorkflow } from "./migration-workflow";

/** @deprecated Delete after first production migration succeeds. */
export interface MigrationProjectInput {
  projectId: string;
  initializedAt: string;
  agenda?: ProjectWorkflowState["agenda"];
  projectWisdom?: ProjectWisdomEntry[];
  migrationLedger?: MigrationLedgerEntry[];
  changes: Change[];
}

export interface MigrationSweepInput {
  controlProjectId: string;
  runId: string;
  projectPaths: string[];
}

export interface MigrationSweepResult {
  projectId: string;
  migratedChanges: number;
  status: "done" | "failed";
  detail?: string;
}

export interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  executeUpdate: (
    definition: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
  result?: () => Promise<unknown>;
}

export interface WorkflowClientLike {
  start: (
    workflow: unknown,
    options: { workflowId: string; taskQueue: string; args: [unknown] },
  ) => Promise<WorkflowHandleLike>;
  getHandle: (workflowId: string) => WorkflowHandleLike;
}

function isAlreadyStartedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already started|already exists|Workflow execution already started/i.test(
    message,
  );
}

export async function loadMigrationProjectInput(
  projectPath: string,
): Promise<MigrationProjectInput> {
  const { items: agenda } = await loadAgenda(projectPath, {
    agendaPath: `${projectPath}/agenda.jsonl`,
  });
  const projectWisdom = await listProjectWisdom(projectPath, {
    wisdomPath: `${projectPath}/wisdom.jsonl`,
  });
  const changes = Array.from(
    await loadAllChanges(`${projectPath}/changes`),
  ).map(([, change]) => change);

  return {
    projectId: basename(projectPath),
    initializedAt: new Date().toISOString(),
    agenda,
    projectWisdom: projectWisdom.map((entry) => ({
      id: entry.id,
      type: entry.type,
      content: entry.content,
      sourceChange: entry.source_change,
      sourceTask: entry.source_task,
      promotedAt: entry.promoted_at,
      tags: entry.tags,
      invalidatedBy: entry.invalidated_by,
    })),
    migrationLedger: [],
    changes,
  };
}

export async function migrateSingleProjectActivity(input: {
  projectPath: string;
  client?: { workflow: WorkflowClientLike };
  loadProject?: (projectPath: string) => Promise<MigrationProjectInput>;
}): Promise<MigrationSweepResult> {
  let runtimeBundle: Awaited<
    ReturnType<typeof createTemporalClientBundle>
  > | null = null;
  const loadProject = input.loadProject ?? loadMigrationProjectInput;

  try {
    const effectiveClient = input.client
      ? input.client
      : ((runtimeBundle = await createTemporalClientBundle(process.env)),
        runtimeBundle.client as unknown as { workflow: WorkflowClientLike });
    const project = await loadProject(input.projectPath);
    await migrateProjectState(
      effectiveClient,
      {
        projectId: project.projectId,
        initializedAt: project.initializedAt,
        agenda: project.agenda ?? [],
        projectWisdom: project.projectWisdom ?? [],
        migrationLedger: project.migrationLedger ?? [],
      },
      {
        key: "project-import",
        source: "external_state",
        detail: `imported ${project.changes.length} changes`,
      },
    );

    for (const change of project.changes) {
      await reImportChangeState(effectiveClient, {
        projectId: project.projectId,
        change,
      });
    }

    return {
      projectId: project.projectId,
      migratedChanges: project.changes.length,
      status: "done",
    };
  } catch (error) {
    return {
      projectId: basename(input.projectPath),
      migratedChanges: 0,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (runtimeBundle) {
      await runtimeBundle.connection.close();
    }
  }
}

export async function runMigrationSweep(
  client: { workflow: WorkflowClientLike },
  input: MigrationSweepInput,
): Promise<WorkflowHandleLike> {
  const workflowId = `adv/migration/${input.controlProjectId}/${input.runId}`;
  const taskQueue = buildProjectTaskQueue(input.controlProjectId);

  try {
    return await client.workflow.start(migrateAllProjectsWorkflow, {
      workflowId,
      taskQueue,
      args: [input],
    });
  } catch (error) {
    if (isAlreadyStartedError(error)) {
      return client.workflow.getHandle(workflowId);
    }
    throw error;
  }
}
