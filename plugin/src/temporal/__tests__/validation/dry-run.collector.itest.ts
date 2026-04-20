import { fileURLToPath } from "node:url";
/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the cutover decision is made.
 */
import { writeFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverAdvanceProjectIds,
  runDryRunMigrationSweep,
} from "../../dry-run-migrator";
import { runStorageLayerParity } from "../../parity-harness";
import { STORAGE_LAYER_SCENARIOS } from "../../parity-scenarios";

const OUTPUT = process.env.ADV_VALIDATION_OUTPUT;
const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const ADV_STATE_ROOT =
  process.env.XDG_DATA_HOME && process.env.XDG_DATA_HOME.length > 0
    ? join(process.env.XDG_DATA_HOME, "opencode", "plugins", "advance")
    : join(
        process.env.HOME ?? "",
        ".local",
        "share",
        "opencode",
        "plugins",
        "advance",
      );

function countJsonChangeFiles(projectPath: string): Promise<number> {
  return readdir(join(projectPath, "changes"))
    .then((entries) => entries.filter((name) => name.endsWith(".json")).length)
    .catch(() => 0);
}

async function countJsonlLines(file: string): Promise<number> {
  try {
    const raw = await readFile(file, "utf8");
    return raw.split("\n").filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

describe("dry-run migration collector", () => {
  it("runs a real per-project dry-run parity sweep and emits JSON evidence", async () => {
    const projectPaths = await discoverAdvanceProjectIds({
      roots: [ADV_STATE_ROOT],
    });
    expect(projectPaths.length).toBeGreaterThan(0);

    const result = await runDryRunMigrationSweep({
      projectPaths,
      runProject: async (projectPath) => {
        const projectId = projectPath.split("/").pop() ?? projectPath;
        const importedChanges = await countJsonChangeFiles(projectPath);
        const importedAgendaItems = await countJsonlLines(
          join(projectPath, "agenda.jsonl"),
        );
        const importedProjectWisdomEntries = await countJsonlLines(
          join(projectPath, "wisdom.jsonl"),
        );

        try {
          const parity = await runStorageLayerParity({
            projectDir: REPO_ROOT,
            projectId,
            externalRoot: projectPath,
            scenarios: STORAGE_LAYER_SCENARIOS,
          });
          const unresolved = parity.results.reduce(
            (n, r) => n + r.mismatches.length,
            0,
          );
          const firstFailure = parity.results.find((r) => r.status === "FAIL");
          return {
            projectPath,
            projectId,
            pass: parity.summary.failed === 0 && unresolved === 0,
            parityPassed: parity.summary.failed === 0 && unresolved === 0,
            importedChanges,
            importedAgendaItems,
            importedProjectWisdomEntries,
            firstParityFailure: firstFailure
              ? {
                  id: firstFailure.id,
                  mismatches: firstFailure.mismatches.slice(0, 3),
                }
              : undefined,
            unmappableReason: undefined,
          };
        } catch (error) {
          return {
            projectPath,
            projectId,
            pass: false,
            parityPassed: false,
            importedChanges,
            importedAgendaItems,
            importedProjectWisdomEntries,
            firstParityFailure: undefined,
            unmappableReason:
              error instanceof Error
                ? error.message
                : String(error ?? "parity failed"),
          };
        }
      },
    });

    if (OUTPUT) {
      await writeFile(
        OUTPUT,
        JSON.stringify(
          {
            pass: result.failedProjects === 0,
            projectCount: result.totalProjects,
            unmappableProjects: result.results
              .filter((r) => !r.pass)
              .map((r) => r.projectId),
            results: result.results,
          },
          null,
          2,
        ),
      );
    }

    expect(result.totalProjects).toBeGreaterThan(0);
  }, 120_000);
});
