/**
 * Archive Orchestrator
 *
 * Main entry point for archiving changes.
 * Coordinates delta application, spec updates, and doc generation.
 */

import { join } from "path";
import { readdir, readFile } from "fs/promises";
import { atomicWriteFile } from "../utils/fs";
import type { Spec, Change } from "../types";
import { stripTddEvidence } from "../types";
import type {
  ArchiveContext,
  ArchiveOperationResult,
  SpecUpdateResult,
} from "./types";
import { applyDeltasToSpec, createSpecFromDeltas } from "./delta";
import { generateSpecDocFile } from "./docs";

/**
 * Archive a change - applies deltas to specs and generates documentation.
 */
export async function archiveChange(
  context: ArchiveContext,
): Promise<ArchiveOperationResult> {
  const { change, specs, paths, dryRun = false } = context;
  const errors: string[] = [];
  const specsUpdated: SpecUpdateResult[] = [];
  const docsGenerated: string[] = [];

  // Process each capability's deltas
  for (const [capability, deltas] of Object.entries(change.deltas)) {
    if (deltas.length === 0) continue;

    let spec = specs.get(capability);
    let result: SpecUpdateResult;

    if (spec) {
      // Apply deltas to existing spec
      const originalVersion = spec.version;
      result = applyDeltasToSpec(
        structuredClone(spec),
        deltas,
        originalVersion,
      );

      if (result.updatedSpec) {
        spec = result.updatedSpec;
        specs.set(capability, spec);
      } else {
        errors.push(
          `Failed to apply deltas to ${capability}: ${result.deltaResults.find((r) => !r.success)?.error}`,
        );
        continue;
      }
    } else {
      // Create new spec from deltas
      const { spec: newSpec, result: createResult } = createSpecFromDeltas(
        capability,
        deltas,
      );
      spec = newSpec;
      result = createResult;
      specs.set(capability, spec);
    }

    specsUpdated.push(result);

    // Write updated spec to disk
    if (!dryRun) {
      try {
        await writeSpecToDisk(spec, paths.specs);
      } catch (err) {
        errors.push(`Failed to write spec ${capability}: ${err}`);
      }
    }

    // Generate documentation
    if (!dryRun) {
      try {
        const doc = await generateSpecDocFile(spec, paths.docs);
        docsGenerated.push(doc.filePath);
      } catch (err) {
        errors.push(`Failed to generate docs for ${capability}: ${err}`);
      }
    } else {
      // In dry run, still record what would be generated
      docsGenerated.push(join(paths.docs, `${capability}.md`));
    }
  }

  // Create archive directory and copy change (+ sibling files if changes dir provided)
  const sourceChangeDir = paths.changes
    ? join(paths.changes, change.id)
    : undefined;
  const archivePath = await createArchive(
    change,
    paths.archive,
    dryRun,
    sourceChangeDir,
    errors,
  );

  return {
    success: errors.length === 0,
    changeId: change.id,
    specsUpdated,
    docsGenerated,
    archivePath,
    errors,
    archivedAt: new Date().toISOString(),
  };
}

/**
 * Write a spec to disk.
 */
async function writeSpecToDisk(spec: Spec, specsDir: string): Promise<void> {
  const specDir = join(specsDir, spec.name);
  const specPath = join(specDir, "spec.json");

  await atomicWriteFile(specPath, JSON.stringify(spec, null, 2));
}

/**
 * Create archive directory with change copy.
 */
async function createArchive(
  change: Change,
  archiveDir: string,
  dryRun: boolean,
  sourceChangeDir?: string,
  errors?: string[],
): Promise<string> {
  const date = new Date().toISOString().split("T")[0];
  const archivePath = join(archiveDir, `${date}-${change.id}`);

  if (!dryRun) {
    // Strip TDD evidence to minimal proof before archiving
    const strippedTasks = change.tasks.map((task) => ({
      ...task,
      tdd_evidence: task.tdd_evidence
        ? stripTddEvidence(task.tdd_evidence)
        : task.tdd_evidence,
    }));

    // Write the change as archived
    const archivedChange: Change = {
      ...change,
      tasks: strippedTasks,
      status: "archived",
    };
    await atomicWriteFile(
      join(archivePath, "change.json"),
      JSON.stringify(archivedChange, null, 2),
    );

    // Write archive summary
    const summary = generateArchiveSummary(change);
    await atomicWriteFile(join(archivePath, "ARCHIVE_SUMMARY.md"), summary);

    // Copy sibling files from source change directory (proposal.md, problem-statement.md, etc.)
    if (sourceChangeDir) {
      try {
        const entries = await readdir(sourceChangeDir, { withFileTypes: true });
        for (const entry of entries) {
          // Skip change.json (already written above with stripped evidence)
          if (entry.name === "change.json" || !entry.isFile()) continue;
          try {
            const content = await readFile(
              join(sourceChangeDir, entry.name),
              "utf-8",
            );
            await atomicWriteFile(join(archivePath, entry.name), content);
          } catch (err) {
            errors?.push(
              `Failed to copy change artifact ${entry.name}: ${err}`,
            );
          }
        }
      } catch {
        // Source directory may not exist for legacy changes — not an error
      }
    }
  }

  return archivePath;
}

/**
 * Generate a summary markdown file for the archive.
 */
function generateArchiveSummary(change: Change): string {
  const lines: string[] = [];

  lines.push(`# Archive: ${change.title}`);
  lines.push("");
  lines.push(`**Change ID:** ${change.id}`);
  lines.push(`**Archived:** ${new Date().toISOString()}`);
  lines.push(`**Created:** ${change.created_at}`);
  if (change.created_by) {
    lines.push(`**Created By:** ${change.created_by}`);
  }
  lines.push("");

  lines.push("## Tasks Completed");
  lines.push("");

  for (const task of change.tasks) {
    const status =
      task.status === "done" ? "✅" : task.status === "cancelled" ? "⏭️" : "❓";
    lines.push(`- ${status} ${task.title}`);
  }
  lines.push("");

  lines.push("## Specs Modified");
  lines.push("");

  for (const capability of Object.keys(change.deltas)) {
    const deltaCount = change.deltas[capability].length;
    lines.push(`- **${capability}**: ${deltaCount} delta(s)`);
  }
  lines.push("");

  return lines.join("\n");
}
