/**
 * Archive Orphan Sweep Tool
 *
 * Detects and (with explicit user approval) removes leaked source
 * `changes/<id>/` directories whose archive bundle exists at
 * `archive/<date>-<id>/`. These leaks accumulated before the
 * `archiveChange` cleanup hook landed (GH #15) and are recoverable
 * disk-only — the change index already considers them archived.
 *
 * Distinct from `adv_orphan_sweep` (Temporal workflow re-seed domain).
 */

import { readdir, readFile, rm } from "fs/promises";
import type { Dirent } from "fs";
import { join } from "path";
import { z } from "zod";
import type { Store } from "../storage/store";
import { formatToolOutput } from "../utils/tool-output";

export interface ArchiveOrphanCandidate {
  /** Change ID (matches both source dir name AND archive change.json `id`) */
  id: string;
  /** Absolute path to the source dir slated for removal */
  sourcePath: string;
  /** Absolute path to the archive bundle that justifies removal */
  archivePath: string;
}

export interface ArchiveOrphanSweepResult {
  dryRun: boolean;
  candidateCount: number;
  candidates: ArchiveOrphanCandidate[];
  removedCount?: number;
  removed?: string[];
  removalErrors?: { id: string; error: string }[];
  /** Source dir IDs with NO matching archive bundle — left alone (likely active) */
  skippedActive: string[];
}

interface SweepOptions {
  dryRun: boolean;
}

/**
 * Scan an archive dir and build an index of `id -> archivePath`.
 * `<date>-<id>` directory naming is informational only — the authoritative
 * source is the `id` field inside each `change.json`.
 */
async function buildArchiveIndex(
  archiveDir: string,
): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  let entries: Dirent[];
  try {
    entries = (await readdir(archiveDir, { withFileTypes: true })) as Dirent[];
  } catch {
    return index; // No archive dir → no orphans by definition
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const archivePath = join(archiveDir, entry.name);
    const changeJsonPath = join(archivePath, "change.json");
    try {
      const raw = await readFile(changeJsonPath, "utf-8");
      const parsed = JSON.parse(raw) as { id?: unknown };
      if (typeof parsed.id === "string" && parsed.id.length > 0) {
        // First-write-wins: if multiple archive entries share an id (legacy),
        // keep the first encountered. Sweep-time dedup is out of scope.
        if (!index.has(parsed.id)) {
          index.set(parsed.id, archivePath);
        }
      }
    } catch {
      // Skip malformed archive entries — sweep is best-effort.
    }
  }
  return index;
}

/**
 * Find source `changes/<id>/` directories whose archive bundle exists.
 * Pure function — no side effects when `dryRun: true`.
 */
export async function sweepArchiveOrphans(
  changesDir: string,
  archiveDir: string,
  options: SweepOptions,
): Promise<ArchiveOrphanSweepResult> {
  const archiveIndex = await buildArchiveIndex(archiveDir);

  let sourceEntries: Dirent[];
  try {
    sourceEntries = (await readdir(changesDir, {
      withFileTypes: true,
    })) as Dirent[];
  } catch {
    return {
      dryRun: options.dryRun,
      candidateCount: 0,
      candidates: [],
      skippedActive: [],
    };
  }

  const candidates: ArchiveOrphanCandidate[] = [];
  const skippedActive: string[] = [];

  for (const entry of sourceEntries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const archivePath = archiveIndex.get(id);
    const sourcePath = join(changesDir, id);
    if (archivePath) {
      candidates.push({ id, sourcePath, archivePath });
    } else {
      skippedActive.push(id);
    }
  }

  if (options.dryRun) {
    return {
      dryRun: true,
      candidateCount: candidates.length,
      candidates,
      skippedActive,
    };
  }

  const removed: string[] = [];
  const removalErrors: { id: string; error: string }[] = [];
  for (const c of candidates) {
    try {
      await rm(c.sourcePath, { recursive: true, force: true });
      removed.push(c.id);
    } catch (err) {
      removalErrors.push({
        id: c.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    dryRun: false,
    candidateCount: candidates.length,
    candidates,
    removedCount: removed.length,
    removed,
    removalErrors,
    skippedActive,
  };
}

export const archiveSweepTools = {
  adv_archive_sweep_orphans: {
    description:
      "Detect and optionally remove leaked source `changes/<id>/` directories whose archive bundle exists. Disk-level cleanup for archives that landed before the in-archive cleanup hook (GH #15). Dry-run is default; execute mode requires explicit user approval. Distinct from `adv_orphan_sweep` (Temporal workflow re-seed).",
    args: {
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "When true or omitted, list orphan candidates without removing them",
        ),
      approvedByUser: z
        .boolean()
        .optional()
        .describe("Required true when dryRun is false"),
      approvalEvidence: z
        .string()
        .optional()
        .describe(
          "How the user explicitly approved disk-level orphan removal",
        ),
    },
    execute: async (
      args: {
        dryRun?: boolean;
        approvedByUser?: boolean;
        approvalEvidence?: string;
      },
      store: Store,
    ) => {
      const dryRun = args.dryRun ?? true;
      if (!dryRun) {
        if (!args.approvedByUser || !args.approvalEvidence?.trim()) {
          return formatToolOutput({
            success: false,
            error:
              "Explicit user approval is required to execute archive orphan removal. Re-run with dryRun:true to preview only.",
          });
        }
      }

      const result = await sweepArchiveOrphans(
        store.paths.changes,
        store.paths.archive,
        { dryRun },
      );

      const message = dryRun
        ? `Found ${result.candidateCount} archive orphan source dir(s); ${result.skippedActive.length} active dir(s) left alone`
        : `Removed ${result.removedCount ?? 0} of ${result.candidateCount} archive orphan source dir(s)${
            result.removalErrors && result.removalErrors.length > 0
              ? ` (${result.removalErrors.length} error(s))`
              : ""
          }`;

      return formatToolOutput({
        success: true,
        approvalEvidence: dryRun ? undefined : args.approvalEvidence?.trim(),
        ...result,
        message,
      });
    },
  },
};
