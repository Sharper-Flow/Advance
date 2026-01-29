#!/usr/bin/env node

/**
 * Database Recovery Tool
 *
 * Fixes corrupted SQLite databases by deleting them and rebuilding from JSON.
 * Safe because JSON files are the source of truth.
 */

import { rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const DB_DIR = ".specdb";
const DB_FILE = "spec.db";

async function main() {
  const dbPath = path.join(process.cwd(), DB_DIR, DB_FILE);

  console.log(`🔍 Checking database: ${dbPath}`);

  // Check if database exists
  if (!existsSync(dbPath)) {
    console.log("✅ Database doesn't exist - no recovery needed");
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
  const fs = await import("fs");
  for (const file of existingFiles) {
    try {
      const stats = fs.statSync(file);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`  ${path.basename(file)}: ${sizeKB} KB`);
    } catch {}
  }

  console.log("\n⚠️  Deleting corrupted database files...");
  for (const file of existingFiles) {
    try {
      await rm(file, { force: true });
      console.log(`  ✓ Deleted: ${path.basename(file)}`);
    } catch (e) {
      console.log(`  ✗ Failed: ${path.basename(file)} - ${e.message}`);
    }
  }

  console.log("\n✅ Recovery complete!");
  console.log("Database will be rebuilt automatically on next ADV command.\n");
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
