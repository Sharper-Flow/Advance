/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once Temporal is the default
 * backend. This module exists only to dry-run migration against every known
 * ADV project without mutating live state.
 */

import { join } from "node:path";
import { readdir } from "node:fs/promises";

export interface DirEntryLike {
  name: string;
  isDirectory: boolean;
}

export interface DryRunProjectResult {
  projectPath: string;
  projectId: string;
  pass: boolean;
  parityPassed: boolean;
  importedChanges: number;
  importedAgendaItems: number;
  importedProjectWisdomEntries: number;
  unmappableReason?: string;
}

export interface DryRunMigrationSweepResult {
  totalProjects: number;
  passedProjects: number;
  failedProjects: number;
  results: DryRunProjectResult[];
}

export async function discoverAdvanceProjectIds(input: {
  roots: string[];
  listDir?: (root: string) => Promise<DirEntryLike[]>;
}): Promise<string[]> {
  const listDir = input.listDir ?? defaultListDir;
  const projectPaths: string[] = [];

  for (const root of input.roots) {
    const entries = await listDir(root);
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      if (["archive", "db", "changes"].includes(entry.name)) continue;
      projectPaths.push(join(root, entry.name));
    }
  }

  return projectPaths;
}

export async function runDryRunMigrationSweep(input: {
  projectPaths: string[];
  runProject: (projectPath: string) => Promise<DryRunProjectResult>;
}): Promise<DryRunMigrationSweepResult> {
  const results: DryRunProjectResult[] = [];

  for (const projectPath of input.projectPaths) {
    try {
      results.push(await input.runProject(projectPath));
    } catch (error) {
      results.push({
        projectPath,
        projectId: projectPath.split("/").pop() ?? projectPath,
        pass: false,
        parityPassed: false,
        importedChanges: 0,
        importedAgendaItems: 0,
        importedProjectWisdomEntries: 0,
        unmappableReason:
          error instanceof Error
            ? error.message
            : String(error ?? "unknown error"),
      });
    }
  }

  const failedProjects = results.filter((r) => !r.pass).length;
  return {
    totalProjects: results.length,
    passedProjects: results.length - failedProjects,
    failedProjects,
    results,
  };
}

async function defaultListDir(root: string): Promise<DirEntryLike[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
  }));
}
