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
import {
  formatTargetProjectContext,
  type TargetProjectOutputContext,
  withTargetPathStore,
} from "./target-project";

export interface ArchiveOrphanCandidate {
  /** Change ID (matches both source dir name AND archive change.json `id`) */
  id: string;
  /** Absolute path to the source dir slated for removal */
  sourcePath: string;
  /** Absolute path to the archive bundle that justifies removal (empty for closed orphans) */
  archivePath: string;
  /** Discriminator: "archive" = matched by archive bundle, "closed" = status:closed with no archive */
  kind?: "archive" | "closed";
}

export interface ArchiveOrphanSweepResult {
  dryRun: boolean;
  candidateCount: number;
  candidates: ArchiveOrphanCandidate[];
  /** Archive candidates whose active workflow/source state needs status repair */
  repairCandidateCount?: number;
  repairCandidates?: string[];
  /** Archive candidates successfully repaired before removal */
  repairedCount?: number;
  repaired?: string[];
  repairErrors?: { id: string; error: string }[];
  removedCount?: number;
  removed?: string[];
  removalErrors?: { id: string; error: string }[];
  /** Source dir IDs with NO matching archive bundle — left alone (likely active) */
  skippedActive: string[];
  /** Count of closed-change source dirs detected (only when includeClosed: true) */
  closedCandidateCount?: number;
}

interface SweepOptions {
  dryRun: boolean;
  includeClosed?: boolean;
}

interface RepairSummary {
  repairCandidateCount: number;
  repairCandidates: string[];
  repairedCount: number;
  repaired: string[];
  repairErrors: { id: string; error: string }[];
  blockedRemovalIds: Set<string>;
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

async function removeArchiveOrphanCandidates(
  candidates: ArchiveOrphanCandidate[],
): Promise<{
  removed: string[];
  removalErrors: { id: string; error: string }[];
}> {
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
  return { removed, removalErrors };
}

async function repairArchiveZombies(
  candidates: ArchiveOrphanCandidate[],
  store: Store,
  dryRun: boolean,
): Promise<RepairSummary> {
  const repairCandidates: string[] = [];
  const repaired: string[] = [];
  const repairErrors: { id: string; error: string }[] = [];
  const blockedRemovalIds = new Set<string>();

  if (!store.changes?.get || !store.changes?.save) {
    return {
      repairCandidateCount: 0,
      repairCandidates,
      repairedCount: 0,
      repaired,
      repairErrors,
      blockedRemovalIds,
    };
  }

  for (const candidate of candidates) {
    if (candidate.kind === "closed") continue;
    const loaded = await store.changes.get(candidate.id);
    if (!loaded.success || !loaded.data) {
      const error = loaded.success
        ? "Change not found"
        : loaded.error || "Change could not be loaded";
      repairErrors.push({ id: candidate.id, error });
      blockedRemovalIds.add(candidate.id);
      continue;
    }
    if (loaded.data.status === "archived") continue;

    repairCandidates.push(candidate.id);
    if (dryRun) continue;

    try {
      await store.changes.save({ ...loaded.data, status: "archived" });
      repaired.push(candidate.id);
    } catch (err) {
      repairErrors.push({
        id: candidate.id,
        error: err instanceof Error ? err.message : String(err),
      });
      blockedRemovalIds.add(candidate.id);
    }
  }

  return {
    repairCandidateCount: repairCandidates.length,
    repairCandidates,
    repairedCount: repaired.length,
    repaired,
    repairErrors,
    blockedRemovalIds,
  };
}

/**
 * Find source `changes/<id>/` directories whose archive bundle exists,
 * and optionally closed-change dirs with no archive bundle.
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
  const closedCandidates: ArchiveOrphanCandidate[] = [];

  for (const entry of sourceEntries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const archivePath = archiveIndex.get(id);
    const sourcePath = join(changesDir, id);
    if (archivePath) {
      candidates.push({ id, sourcePath, archivePath, kind: "archive" });
    } else if (options.includeClosed) {
      // Check if this is a closed change by reading change.json
      try {
        const raw = await readFile(join(sourcePath, "change.json"), "utf-8");
        const parsed = JSON.parse(raw) as { status?: unknown };
        if (parsed.status === "closed") {
          closedCandidates.push({
            id,
            sourcePath,
            archivePath: "",
            kind: "closed",
          });
        } else {
          skippedActive.push(id);
        }
      } catch {
        // Can't read/parse change.json — treat as active
        skippedActive.push(id);
      }
    } else {
      skippedActive.push(id);
    }
  }

  // Merge closed candidates into the main candidates list for unified
  // processing (removal). Report closed count separately for clarity.
  const allCandidates = [...candidates, ...closedCandidates];

  if (options.dryRun) {
    return {
      dryRun: true,
      candidateCount: allCandidates.length,
      candidates: allCandidates,
      skippedActive,
      closedCandidateCount: closedCandidates.length || undefined,
    };
  }

  const { removed, removalErrors } =
    await removeArchiveOrphanCandidates(allCandidates);

  return {
    dryRun: false,
    candidateCount: allCandidates.length,
    candidates: allCandidates,
    removedCount: removed.length,
    removed,
    removalErrors,
    skippedActive,
    closedCandidateCount: closedCandidates.length || undefined,
  };
}

export const archiveSweepTools = {
  adv_archive_sweep_orphans: {
    description:
      "Detect and optionally remove leaked source `changes/<id>/` directories whose archive bundle exists, and optionally closed-change dirs with no archive. Disk-level cleanup for leaks that landed before the cleanup hooks (GH #15, #16). Dry-run is default; execute mode requires explicit user approval. Distinct from `adv_orphan_sweep` (Temporal workflow re-seed).",
    args: {
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "When true or omitted, list orphan candidates without removing them. With dryRun: true, this tool is read-only and safe to invoke without approval.",
        ),
      includeClosed: z
        .boolean()
        .optional()
        .describe(
          "When true, also detect source dirs for closed (not archived) changes with no archive bundle",
        ),
      approvedByUser: z
        .boolean()
        .optional()
        .describe("Required true when dryRun is false"),
      approvalEvidence: z
        .string()
        .optional()
        .describe("How the user explicitly approved disk-level orphan removal"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
        ),
      confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
        ),
    },
    execute: async (
      args: {
        dryRun?: boolean;
        includeClosed?: boolean;
        approvedByUser?: boolean;
        approvalEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const dryRun = args.dryRun ?? true;

      const runArchiveSweep = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        if (!dryRun) {
          if (!args.approvedByUser || !args.approvalEvidence?.trim()) {
            return formatToolOutput({
              success: false,
              error:
                "Explicit user approval is required to execute archive orphan removal. Re-run with dryRun:true to preview only.",
            });
          }
        }

        const preview = await sweepArchiveOrphans(
          activeStore.paths.changes,
          activeStore.paths.archive,
          { dryRun: true, includeClosed: args.includeClosed ?? false },
        );

        const repair = await repairArchiveZombies(
          preview.candidates,
          activeStore,
          dryRun,
        );

        const result: ArchiveOrphanSweepResult = dryRun
          ? { ...preview, ...repair, dryRun: true }
          : {
              ...preview,
              ...repair,
              dryRun: false,
              ...(await (async () => {
                const removalTargets = preview.candidates.filter(
                  (candidate) => !repair.blockedRemovalIds.has(candidate.id),
                );
                const { removed, removalErrors } =
                  await removeArchiveOrphanCandidates(removalTargets);
                return {
                  removedCount: removed.length,
                  removed,
                  removalErrors,
                };
              })()),
            };

        const closedPart =
          result.closedCandidateCount && result.closedCandidateCount > 0
            ? `; ${result.closedCandidateCount} closed-change orphan(s)`
            : "";
        const message = dryRun
          ? `Found ${result.candidateCount} orphan source dir(s)${closedPart}; ${result.repairCandidateCount ?? 0} archive zombie(s) need status repair; ${result.skippedActive.length} active dir(s) left alone`
          : `Removed ${result.removedCount ?? 0} of ${result.candidateCount} orphan source dir(s)${closedPart}${
              (result.removalErrors && result.removalErrors.length > 0) ||
              (result.repairErrors && result.repairErrors.length > 0)
                ? ` (${(result.removalErrors?.length ?? 0) + (result.repairErrors?.length ?? 0)} error(s))`
                : ""
            }; repaired ${result.repairedCount ?? 0} archive zombie(s)`;

        return formatToolOutput({
          success: true,
          approvalEvidence: dryRun ? undefined : args.approvalEvidence?.trim(),
          ...result,
          blockedRemovalIds: undefined,
          message,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "temporal-required",
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runArchiveSweep(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runArchiveSweep(store);
    },
  },
};
