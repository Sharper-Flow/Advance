/**
 * Migrate Cleanup Tool
 *
 * Detects and (with approval) removes legacy in-repo `.adv/{changes,archive,db,agenda.json,agenda.jsonl}`
 * while always preserving `.adv/specs/`. Backs up before deletion.
 * Optionally git-commits the result.
 */

import { join } from "path";
import { stat, cp, rm, mkdir } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import type { Store } from "../storage/store";
import { formatToolOutput } from "../utils/tool-output";
import { resolveTargetProject, TargetProjectError } from "./target-project";

const execFileAsync = promisify(execFile);

export interface MigrateCleanupResult {
  detected: {
    changes_dirs: number;
    archive_dirs: number;
    db_present: boolean;
    agenda_jsonl_present: boolean;
    agenda_json_present: boolean;
  };
  preserved: {
    specs: boolean;
  };
  backup_dir?: string;
  deleted?: string[];
  git_commit_sha?: string | null;
}

interface LegacyDetection {
  changesDirs: number;
  archiveDirs: number;
  dbPresent: boolean;
  agendaJsonlPresent: boolean;
  agendaJsonPresent: boolean;
  specsPresent: boolean;
}

async function detectLegacy(advDir: string): Promise<LegacyDetection> {
  const result: LegacyDetection = {
    changesDirs: 0,
    archiveDirs: 0,
    dbPresent: false,
    agendaJsonlPresent: false,
    agendaJsonPresent: false,
    specsPresent: false,
  };

  async function exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  if (await exists(join(advDir, "changes"))) {
    result.changesDirs = 1;
  }
  if (await exists(join(advDir, "archive"))) {
    result.archiveDirs = 1;
  }
  if (await exists(join(advDir, "db"))) {
    result.dbPresent = true;
  }
  if (await exists(join(advDir, "agenda.jsonl"))) {
    result.agendaJsonlPresent = true;
  }
  if (await exists(join(advDir, "agenda.json"))) {
    result.agendaJsonPresent = true;
  }
  if (await exists(join(advDir, "specs"))) {
    result.specsPresent = true;
  }

  return result;
}

async function gitCommitCleanup(targetDir: string): Promise<string | null> {
  try {
    await execFileAsync("git", ["-C", targetDir, "add", "-A", ".adv/"]);
    await execFileAsync("git", [
      "-C",
      targetDir,
      "commit",
      "-m",
      "chore(adv): remove legacy in-repo state superseded by external store",
    ]);
    const { stdout } = await execFileAsync("git", [
      "-C",
      targetDir,
      "rev-parse",
      "HEAD",
    ]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function isGitRepo(targetDir: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", targetDir, "rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

export async function runMigrateCleanup(
  targetDir: string,
  dryRun: boolean,
  backupPath?: string,
): Promise<MigrateCleanupResult> {
  const advDir = join(targetDir, ".adv");
  const detection = await detectLegacy(advDir);

  const result: MigrateCleanupResult = {
    detected: {
      changes_dirs: detection.changesDirs,
      archive_dirs: detection.archiveDirs,
      db_present: detection.dbPresent,
      agenda_jsonl_present: detection.agendaJsonlPresent,
      agenda_json_present: detection.agendaJsonPresent,
    },
    preserved: {
      specs: detection.specsPresent,
    },
  };

  if (dryRun) {
    return result;
  }

  // Determine backup dir
  const backupDir =
    backupPath ?? join(targetDir, `.adv-migrate-backup-${Date.now()}`);

  // Ensure parent of backup exists
  await mkdir(backupDir, { recursive: true });

  // Backup entire .adv directory
  const backupAdvDir = join(backupDir, ".adv");
  await cp(advDir, backupAdvDir, { recursive: true, force: true });

  const deleted: string[] = [];

  // Remove legacy paths
  const legacyPaths = [
    { name: "changes", path: join(advDir, "changes"), isDir: true },
    { name: "archive", path: join(advDir, "archive"), isDir: true },
    { name: "db", path: join(advDir, "db"), isDir: true },
    { name: "agenda.jsonl", path: join(advDir, "agenda.jsonl"), isDir: false },
    { name: "agenda.json", path: join(advDir, "agenda.json"), isDir: false },
  ];

  for (const item of legacyPaths) {
    try {
      await stat(item.path);
      if (item.isDir) {
        await rm(item.path, { recursive: true, force: true });
      } else {
        await rm(item.path, { force: true });
      }
      deleted.push(item.name);
    } catch {
      // Path did not exist — skip
    }
  }

  result.backup_dir = backupDir;
  result.deleted = deleted;

  // Git commit if target is a git repo
  if (await isGitRepo(targetDir)) {
    result.git_commit_sha = await gitCommitCleanup(targetDir);
  } else {
    result.git_commit_sha = null;
  }

  return result;
}

export const migrateCleanupTools = {
  adv_migrate_cleanup: {
    description:
      "Detect and (with approval) remove legacy in-repo `.adv/{changes,archive,db,agenda.json,agenda.jsonl}` while always preserving `.adv/specs/`. Backs up before deletion. Optionally git-commits the result. With dryRun: true, this tool is read-only and safe to invoke without approval.",
    args: {
      target_path: z
        .string()
        .optional()
        .describe("Optional absolute path to another ADV project."),
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
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "When true or omitted, list legacy paths without removing them. With dryRun: true, this tool is read-only and safe to invoke without approval.",
        ),
      backup_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path for the backup directory. Defaults to `<target>/.adv-migrate-backup-<timestamp>`.",
        ),
    },
    execute: async (
      args: {
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        dryRun?: boolean;
        backup_path?: string;
      },
      store: Store,
    ) => {
      let targetDir: string;

      try {
        if (args.target_path) {
          const context = await resolveTargetProject({
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            mutation: true,
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          });
          targetDir = context.root;
        } else {
          targetDir = store.paths.root;
        }
      } catch (err) {
        if (err instanceof TargetProjectError) {
          return formatToolOutput({
            success: false,
            error: err.message,
          });
        }
        throw err;
      }

      const dryRun = args.dryRun ?? true;

      const result = await runMigrateCleanup(
        targetDir,
        dryRun,
        args.backup_path,
      );

      const message = dryRun
        ? `Detected ${result.detected.changes_dirs} legacy changes dir(s), ${result.detected.archive_dirs} archive dir(s), ${result.detected.db_present ? 1 : 0} db dir(s), ${result.detected.agenda_jsonl_present ? 1 : 0} agenda.jsonl, ${result.detected.agenda_json_present ? 1 : 0} agenda.json. Specs preserved: ${result.preserved.specs}.`
        : `Backed up to ${result.backup_dir}. Deleted: ${result.deleted?.join(", ") ?? "none"}. Specs preserved: ${result.preserved.specs}. Git commit: ${result.git_commit_sha ?? "skipped"}.`;

      return formatToolOutput({
        success: true,
        ...result,
        message,
      });
    },
  },
};
