#!/usr/bin/env node

/**
 * Database Recovery Tool
 *
 * Fixes corrupted or stale SQLite databases by deleting them and rebuilding from JSON.
 * Safe because JSON files are the source of truth.
 *
 * Usage:
 *   node scripts/recover-db.js                   # In-repo .adv/db (legacy)
 *   node scripts/recover-db.js --db-dir <path>   # Custom dir (absolute or relative to CWD)
 *   node scripts/recover-db.js --external        # External state dir (auto-detected from git)
 *
 * External state dir: $XDG_DATA_HOME/opencode/plugins/advance/{root-commit-sha}/db/
 * Use --external when adv_spec list shows stale/deleted specs after a server restart.
 */

import { rm } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import { execFile } from "child_process";
import { homedir } from "os";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const DEFAULT_DB_DIR = ".adv/db";
const DB_FILE = "spec.db";

function parseArgs() {
  const args = process.argv.slice(2);
  let dbDir = DEFAULT_DB_DIR;
  let useExternal = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--db-dir") {
      if (!args[i + 1]) {
        console.error("Error: --db-dir requires a value");
        process.exit(1);
      }
      dbDir = args[i + 1];
      i++; // skip next arg
    } else if (args[i] === "--external") {
      useExternal = true;
    }
  }

  return { dbDir, useExternal };
}

/**
 * Resolve the root commit SHA of the git repo at cwd.
 * Returns null if not a git repo or git is unavailable.
 */
async function getRootCommitSha() {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-list", "--max-parents=0", "HEAD"],
      { cwd: process.cwd(), timeout: 5000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    );
    const roots = stdout.trim().split("\n").filter(Boolean).sort();
    const sha = roots[0];
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
    return null;
  } catch (e) {
    // Not a git repo, or git unavailable/timed out — caller handles null.
    if (process.env.DEBUG) console.error("git error:", e.message ?? String(e));
    return null;
  }
}

/**
 * Resolve the external state DB dir for this project.
 * Path: $XDG_DATA_HOME/opencode/plugins/advance/{projectId}/db
 */
async function resolveExternalDbDir() {
  const projectId = await getRootCommitSha();
  if (!projectId) {
    console.error("❌ Could not determine project ID (is this a git repo?)");
    process.exit(1);
  }
  const dataHome = process.env.XDG_DATA_HOME || path.join(homedir(), ".local/share");
  const resolvedPath = path.join(dataHome, "opencode/plugins/advance", projectId, "db");

  // Guard: ensure the resolved path contains the expected structure.
  // Prevents a manipulated XDG_DATA_HOME from redirecting to arbitrary locations.
  const normalized = path.normalize(resolvedPath);
  if (!normalized.includes(path.join("opencode", "plugins", "advance"))) {
    console.error(
      `❌ Resolved external path looks unexpected: ${normalized}\n` +
      "   Expected path to contain 'opencode/plugins/advance/'. Aborting.",
    );
    process.exit(1);
  }

  return resolvedPath;
}

async function main() {
  const { dbDir, useExternal } = parseArgs();

  let resolvedDbDir;
  if (useExternal) {
    console.log("🔍 Resolving external state directory...");
    resolvedDbDir = await resolveExternalDbDir();
    console.log(`   External DB dir: ${resolvedDbDir}`);
  } else if (path.isAbsolute(dbDir)) {
    resolvedDbDir = dbDir;
  } else {
    resolvedDbDir = path.join(process.cwd(), dbDir);
  }

  // Guard: warn if path.normalize reveals traversal components.
  const normalized = path.normalize(resolvedDbDir);
  if (normalized !== resolvedDbDir && !path.isAbsolute(dbDir)) {
    console.warn(
      `⚠️  Path normalized from '${resolvedDbDir}' to '${normalized}'.\n` +
      "   Proceeding with normalized path.",
    );
    resolvedDbDir = normalized;
  }

  const dbPath = path.join(resolvedDbDir, DB_FILE);

  console.log(`🔍 Checking database: ${dbPath}`);

  // Check if database exists
  if (!existsSync(dbPath)) {
    console.log("✅ Database doesn't exist — no recovery needed.");
    console.log("   The DB rebuilds automatically on next ADV server start.");
    return;
  }

  // Show database files
  const filesToDelete = [
    dbPath,
    `${dbPath}-wal`,
    `${dbPath}-shm`,
  ];

  const existingFiles = filesToDelete.filter((f) => existsSync(f));

  if (existingFiles.length === 0) {
    console.log("✅ No database files found");
    return;
  }

  console.log("\n📦 Current database files:");
  for (const file of existingFiles) {
    try {
      const stats = statSync(file);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`  ${path.basename(file)}: ${sizeKB} KB`);
    } catch {
      console.log(`  ${path.basename(file)}: (size unavailable)`);
    }
  }

  console.log("\n⚠️  Deleting database files...");
  for (const file of existingFiles) {
    try {
      await rm(file, { force: true });
      console.log(`  ✓ Deleted: ${path.basename(file)}`);
    } catch (e) {
      console.log(`  ✗ Failed: ${path.basename(file)} - ${String(e).split("\n")[0]}`);
    }
  }

  console.log("\n✅ Recovery complete!");
  console.log("Restart OpenCode (or the MCP server) — the database rebuilds");
  console.log("automatically from .adv/specs/ on next startup.\n");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
