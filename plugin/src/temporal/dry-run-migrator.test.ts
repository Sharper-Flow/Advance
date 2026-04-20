import { describe, expect, it } from "vitest";
import {
  discoverAdvanceProjectIds,
  runDryRunMigrationSweep,
} from "./dry-run-migrator";

describe("dry-run migrator", () => {
  it("discovers project-id directories while ignoring archive/db/changes sentinels", async () => {
    const projects = await discoverAdvanceProjectIds({
      roots: ["/tmp/advance-state"],
      listDir: async (root) => {
        expect(root).toBe("/tmp/advance-state");
        return [
          { name: "archive", isDirectory: true },
          { name: "db", isDirectory: true },
          { name: "changes", isDirectory: true },
          { name: "projA", isDirectory: true },
          { name: "projB", isDirectory: true },
          { name: "README.md", isDirectory: false },
        ];
      },
    });

    expect(projects).toEqual([
      "/tmp/advance-state/projA",
      "/tmp/advance-state/projB",
    ]);
  });

  it("returns per-project results and keeps unmappable projects from aborting the sweep", async () => {
    const result = await runDryRunMigrationSweep({
      projectPaths: ["/state/projA", "/state/projB"],
      runProject: async (projectPath) => {
        if (projectPath.endsWith("projB")) {
          throw new Error("corrupt change.json");
        }
        return {
          projectPath,
          projectId: "projA",
          pass: true,
          parityPassed: true,
          importedChanges: 2,
          importedAgendaItems: 1,
          importedProjectWisdomEntries: 3,
          unmappableReason: undefined,
        };
      },
    });

    expect(result.totalProjects).toBe(2);
    expect(result.passedProjects).toBe(1);
    expect(result.failedProjects).toBe(1);
    expect(result.results[0]?.pass).toBe(true);
    expect(result.results[1]?.pass).toBe(false);
    expect(result.results[1]?.unmappableReason).toMatch(/corrupt change.json/);
  });
});
