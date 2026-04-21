import * as wf from "@temporalio/workflow";
import type { MigrationSweepInput, MigrationSweepResult } from "./migrate-runner";

export async function migrateAllProjectsWorkflow(input: MigrationSweepInput): Promise<MigrationSweepResult[]> {
  const activities = wf.proxyActivities<{
    migrateSingleProjectActivity(input: { projectPath: string }): Promise<MigrationSweepResult>;
  }>({
    startToCloseTimeout: "5 minutes",
  });

  const results: MigrationSweepResult[] = [];
  for (const projectPath of input.projectPaths) {
    results.push(await activities.migrateSingleProjectActivity({ projectPath }));
  }
  return results;
}
