/**
 * Archive Orchestrator
 *
 * Main entry point for archiving changes.
 * Coordinates delta application, spec updates, and doc generation.
 */

import { join, dirname } from "path";
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
import {
  addProjectWisdom,
  listProjectWisdom,
  compactProjectWisdom,
} from "../storage/project-wisdom";

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
          `Failed to apply deltas to ${capability}: ${result.deltaResults.find((r) => !r.success)?.error ?? "unknown error"}`,
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

  // Auto-promote convention/pattern wisdom to project level
  let wisdomPromoted = 0;
  if (!dryRun && paths.wisdom && change.wisdom && change.wisdom.length > 0) {
    // Types eligible for promotion: convention and pattern only
    const promotableTypes = new Set(["convention", "pattern"]);
    const promotable = change.wisdom.filter((w) => promotableTypes.has(w.type));

    if (promotable.length > 0) {
      // Load existing project wisdom to avoid duplicates
      const projectDir = dirname(dirname(paths.wisdom)); // project dir derived from wisdom path
      const existing = await listProjectWisdom(projectDir, {
        wisdomPath: paths.wisdom,
      });
      const existingContents = new Set(existing.map((e) => e.content));

      for (const entry of promotable) {
        if (!existingContents.has(entry.content)) {
          try {
            await addProjectWisdom(projectDir, {
              type: entry.type,
              content: entry.content,
              sourceChange: change.id,
              sourceTask: entry.source_task,
              wisdomPath: paths.wisdom,
            });
            wisdomPromoted++;
          } catch (err) {
            errors.push(`Failed to promote wisdom "${entry.content}": ${err}`);
          }
        }
      }

      // Compact if we added entries (enforce cap)
      if (wisdomPromoted > 0) {
        try {
          await compactProjectWisdom(projectDir, { wisdomPath: paths.wisdom });
        } catch (err) {
          errors.push(`Failed to compact project wisdom: ${err}`);
        }
      }
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

  // In-repo archive: write identical bundle to in-repo path (warning-only on failure)
  if (paths.inRepoArchive && !dryRun) {
    try {
      await createInRepoArchive(change, paths.inRepoArchive, sourceChangeDir);
    } catch (err) {
      // In-repo failure is warning-only — do NOT add to errors array
      // to avoid failing the overall archive operation.
      // Logged for diagnostic purposes only.
      void err; // intentionally swallowed
    }
  }

  return {
    success: errors.length === 0,
    changeId: change.id,
    specsUpdated,
    docsGenerated,
    archivePath,
    errors,
    archivedAt: new Date().toISOString(),
    ...(wisdomPromoted > 0 && { wisdomPromoted }),
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

    // Copy wisdom entries to archive if present
    if (change.wisdom && change.wisdom.length > 0) {
      await atomicWriteFile(
        join(archivePath, "wisdom.json"),
        JSON.stringify(
          { entries: change.wisdom, count: change.wisdom.length },
          null,
          2,
        ),
      );
    }

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
    // Include implementation summary if present
    if (task.implementation_summary) {
      lines.push(`  > ${task.implementation_summary}`);
    }
  }
  lines.push("");

  lines.push("## Specs Modified");
  lines.push("");

  for (const capability of Object.keys(change.deltas)) {
    const deltaCount = change.deltas[capability].length;
    lines.push(`- **${capability}**: ${deltaCount} delta(s)`);
  }
  lines.push("");

  // Include wisdom summary if present
  if (change.wisdom && change.wisdom.length > 0) {
    lines.push("## Wisdom Accumulated");
    lines.push("");
    for (const entry of change.wisdom) {
      lines.push(`- **[${entry.type}]** ${entry.content}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Create an identical archive bundle inside the repository.
 * Writes the same files as createArchive() but to an in-repo path.
 * Failure is warning-only — the caller logs it but does not fail the archive.
 */
export async function createInRepoArchive(
  change: Change,
  inRepoArchiveDir: string,
  sourceChangeDir?: string,
): Promise<string> {
  const date = new Date().toISOString().split("T")[0];
  const archivePath = join(inRepoArchiveDir, `${date}-${change.id}`);

  // Strip TDD evidence to minimal proof before archiving
  const strippedTasks = change.tasks.map((task) => ({
    ...task,
    tdd_evidence: task.tdd_evidence
      ? stripTddEvidence(task.tdd_evidence)
      : task.tdd_evidence,
  }));

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

  // Copy wisdom entries to archive if present
  if (change.wisdom && change.wisdom.length > 0) {
    await atomicWriteFile(
      join(archivePath, "wisdom.json"),
      JSON.stringify(
        { entries: change.wisdom, count: change.wisdom.length },
        null,
        2,
      ),
    );
  }

  // Copy sibling files from source change directory
  if (sourceChangeDir) {
    try {
      const entries = await readdir(sourceChangeDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "change.json" || !entry.isFile()) continue;
        try {
          const content = await readFile(
            join(sourceChangeDir, entry.name),
            "utf-8",
          );
          await atomicWriteFile(join(archivePath, entry.name), content);
        } catch {
          // Non-fatal — sibling file copy failure is a warning
        }
      }
    } catch {
      // Source directory may not exist — not an error
    }
  }

  return archivePath;
}

/**
 * Check whether an archive bundle already exists on disk for a given change.
 *
 * Bundles are written by createArchive() at `{archiveDir}/{date}-{changeId}/`.
 * Returns the path to the bundle when one exists with a readable
 * `change.json` manifest, otherwise null.
 *
 * If multiple bundles exist for the same change (e.g. partial retries on
 * different days), the lexically last one is returned — `YYYY-MM-DD-`
 * prefixes sort to the most recent bundle.
 */
export async function findArchiveBundle(
  archiveDir: string,
  changeId: string,
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(archiveDir);
  } catch {
    return null;
  }

  const matches = entries
    .filter((name) => name.endsWith(`-${changeId}`))
    .sort();

  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = join(archiveDir, matches[i]);
    try {
      await readFile(join(candidate, "change.json"), "utf-8");
      return candidate;
    } catch {
      // Manifest missing or unreadable — try next candidate.
    }
  }

  return null;
}

/**
 * Boolean variant of findArchiveBundle for callers that only need to know
 * whether a bundle exists.
 */
export async function archiveBundleExists(
  archiveDir: string,
  changeId: string,
): Promise<boolean> {
  const path = await findArchiveBundle(archiveDir, changeId);
  return path !== null;
}
