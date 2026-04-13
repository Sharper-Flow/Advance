/**
 * Migration: In-Repo → External State
 *
 * One-time migration of mutable ADV state from .adv/ (in-repo, gitignored)
 * to the external state directory (~/.local/share/opencode/plugins/advance/{project-id}/).
 *
 * Migration rules:
 * 1. Only copies if local exists but external does NOT (skip if external already populated)
 * 2. Leaves local files in place as a safety net (does not delete)
 * 3. Returns a report of what was migrated vs skipped
 */

import { join } from "path";
import { cp, copyFile, mkdir, rename, rm } from "fs/promises";
import { existsSync } from "fs";

// =============================================================================
// Types
// =============================================================================

interface MigrationReport {
  /** Items that were successfully migrated */
  migrated: string[];
  /** Items that were skipped (already exist externally or don't exist locally) */
  skipped: string[];
}

// =============================================================================
// Migration
// =============================================================================

/**
 * Migrate mutable state from in-repo .adv/ to external state directory.
 *
 * Only copies items where:
 * - Local source exists (in .adv/)
 * - External target does NOT exist
 *
 * Safe to call multiple times — idempotent due to existence checks.
 */
export async function migrateToExternalState(
  repoDir: string,
  externalDir: string,
): Promise<MigrationReport> {
  const report: MigrationReport = { migrated: [], skipped: [] };

  const advDir = join(repoDir, ".adv");

  // Directories to migrate
  const dirs = [
    {
      name: "changes",
      local: join(advDir, "changes"),
      external: join(externalDir, "changes"),
    },
    {
      name: "archive",
      local: join(advDir, "archive"),
      external: join(externalDir, "archive"),
    },
    {
      name: "db",
      local: join(advDir, "db"),
      external: join(externalDir, "db"),
    },
  ];

  // Files to migrate
  const files = [
    {
      name: "wisdom.jsonl",
      local: join(advDir, "wisdom.jsonl"),
      external: join(externalDir, "wisdom.jsonl"),
    },
    {
      name: "agenda.jsonl",
      local: join(advDir, "agenda.jsonl"),
      external: join(externalDir, "agenda.jsonl"),
    },
  ];

  // Ensure external dir exists
  await mkdir(externalDir, { recursive: true });

  // Migrate directories using copy-to-temp-then-rename for atomicity.
  // If a partial copy leaves a .migrating dir, it will be cleaned up on retry.
  for (const { name, local, external } of dirs) {
    if (!existsSync(local)) {
      report.skipped.push(name);
      continue;
    }
    if (existsSync(external)) {
      report.skipped.push(name);
      continue;
    }

    const tmpDir = external + ".migrating";
    // Clean up any leftover partial migration from a previous failed attempt
    if (existsSync(tmpDir)) {
      await rm(tmpDir, { recursive: true, force: true });
    }

    await mkdir(tmpDir, { recursive: true });
    await cp(local, tmpDir, { recursive: true });
    await rename(tmpDir, external);
    report.migrated.push(name);
  }

  // Migrate files
  for (const { name, local, external } of files) {
    if (!existsSync(local)) {
      report.skipped.push(name);
      continue;
    }
    if (existsSync(external)) {
      report.skipped.push(name);
      continue;
    }

    await copyFile(local, external);
    report.migrated.push(name);
  }

  return report;
}
