#!/usr/bin/env tsx
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createDefaultGates, ChangeSchema, type Change } from "../src/types";
import {
  buildChangeWorkflowId,
  buildProjectTaskQueue,
  createTemporalClientBundle,
} from "../src/temporal/client";
import { changeWorkflow } from "../src/temporal/workflows";
import { changeStateQuery } from "../src/temporal/messages";
import {
  buildMigrationReplayPlan,
  replayChangeAsSignals,
  validateMigrationRoundTrip,
  type MigrationDocuments,
  type MigrationRoundTripReport,
} from "../src/temporal/migration-replay";
import { getExternalRoot, getProjectId } from "../src/utils/project-id";

interface CliOptions {
  mode: "dry-run" | "execute";
  root: string;
  projectId?: string;
  only?: string;
}

export interface LoadedChange {
  dir: string;
  change: Change;
  documents: MigrationDocuments;
}

export interface ChangeMigrationReport {
  changeId: string;
  mode: CliOptions["mode"];
  planSteps: number;
  signalSteps: number;
  markerSteps: number;
  roundTrip?: MigrationRoundTripReport;
  error?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const mode = argv.includes("--execute") ? "execute" : "dry-run";
  const rootArg = valueAfter(argv, "--root");
  const projectId = valueAfter(argv, "--project-id");
  const only = valueAfter(argv, "--only");
  return { mode, root: resolve(rootArg ?? process.cwd()), projectId, only };
}

function valueAfter(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

export async function loadChangeDir(dir: string): Promise<LoadedChange> {
  const raw = JSON.parse(await readFile(join(dir, "change.json"), "utf8"));
  const change = ChangeSchema.parse(raw);
  const documents: MigrationDocuments = {
    proposal: await readOptionalText(join(dir, "proposal.md")),
    problemStatement: await readOptionalText(join(dir, "problem-statement.md")),
    agreement: await readOptionalText(join(dir, "agreement.md")),
    design: await readOptionalText(join(dir, "design.md")),
  };
  return { dir, change, documents };
}

async function loadChanges(
  changesDir: string,
  only?: string,
): Promise<LoadedChange[]> {
  const names = await readdir(changesDir);
  const loaded: LoadedChange[] = [];
  for (const name of names.sort()) {
    if (only && name !== only) continue;
    const dir = join(changesDir, name);
    if (!(await stat(dir)).isDirectory()) continue;
    loaded.push(await loadChangeDir(dir));
  }
  return loaded;
}

export async function dryRunChange(
  loaded: LoadedChange,
): Promise<ChangeMigrationReport> {
  const plan = buildMigrationReplayPlan(loaded.change, loaded.documents);
  return {
    changeId: loaded.change.id,
    mode: "dry-run",
    planSteps: plan.length,
    signalSteps: plan.filter((step) => step.kind === "signal").length,
    markerSteps: plan.filter((step) => step.kind === "marker").length,
  };
}

async function executeChange(
  projectId: string,
  loaded: LoadedChange,
): Promise<ChangeMigrationReport> {
  const bundle = await createTemporalClientBundle();
  try {
    const workflowId = buildChangeWorkflowId(projectId, loaded.change.id);
    const taskQueue = buildProjectTaskQueue(projectId);
    const handle = await bundle.client.workflow.start(changeWorkflow, {
      workflowId,
      taskQueue,
      workflowIdConflictPolicy: "TERMINATE_EXISTING",
      args: [
        {
          projectId,
          changeId: loaded.change.id,
          title: loaded.change.title,
          initializedAt: loaded.change.created_at,
          searchAttributesEnabled: false,
          seedState: {
            status: loaded.change.status,
            tasks: [],
            wisdom: [],
            gates: createDefaultGates(),
            reentry_history: [],
            deltas: loaded.change.deltas,
            fast_follow_of: loaded.change.fast_follow_of,
            affectedProjects: loaded.change.affectedProjects,
            affectedPaths: loaded.change.affectedPaths,
          },
        },
      ],
    });
    const plan = await replayChangeAsSignals(
      handle,
      loaded.change,
      loaded.documents,
    );
    const state = (await handle.query(changeStateQuery)) as Awaited<
      ReturnType<typeof handle.query>
    >;
    const roundTrip = validateMigrationRoundTrip(
      loaded.change,
      state as Parameters<typeof validateMigrationRoundTrip>[1],
      loaded.documents,
    );
    return {
      changeId: loaded.change.id,
      mode: "execute",
      planSteps: plan.length,
      signalSteps: plan.filter((step) => step.kind === "signal").length,
      markerSteps: plan.filter((step) => step.kind === "marker").length,
      roundTrip,
    };
  } finally {
    await bundle.connection.close();
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const projectId = opts.projectId ?? (await getProjectId(opts.root));
  if (!projectId)
    throw new Error(`Could not resolve project ID for ${opts.root}`);
  const externalRoot = getExternalRoot(projectId);
  const changesDir = join(externalRoot, "changes");
  const changes = await loadChanges(changesDir, opts.only);
  const reports: ChangeMigrationReport[] = [];

  for (const loaded of changes) {
    try {
      reports.push(
        opts.mode === "dry-run"
          ? await dryRunChange(loaded)
          : await executeChange(projectId, loaded),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`
          : String(error);
      console.error(`[migrate] ${loaded.change.id} failed: ${message}`);
      if (error && typeof error === "object" && "cause" in error) {
        const cause = (error as { cause: unknown }).cause;
        console.error(
          `[migrate] cause: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`,
        );
      }
      reports.push({
        changeId: loaded.change.id,
        mode: opts.mode,
        planSteps: 0,
        signalSteps: 0,
        markerSteps: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failed = reports.filter(
    (report) => report.error || report.roundTrip?.ok === false,
  );
  console.log(
    JSON.stringify(
      {
        mode: opts.mode,
        projectId,
        changesDir,
        workflowIdPrefix: `adv/change/${projectId}/`,
        reports,
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
