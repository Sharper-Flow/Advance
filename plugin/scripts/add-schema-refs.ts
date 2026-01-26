#!/usr/bin/env npx tsx
/**
 * Migration script to add $schema references to existing change.json and spec.json files.
 * 
 * Usage: 
 *   npx tsx scripts/add-schema-refs.ts /path/to/project
 *   npx tsx scripts/add-schema-refs.ts  # uses current directory
 * 
 * This is idempotent - running multiple times is safe.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const CHANGE_SCHEMA_URL =
  "https://raw.githubusercontent.com/anomalyco/oc-plugins/main/advance/plugin/schemas/change.schema.json";
const SPEC_SCHEMA_URL =
  "https://raw.githubusercontent.com/anomalyco/oc-plugins/main/advance/plugin/schemas/spec.schema.json";

function addSchemaRef(filePath: string, schemaUrl: string): boolean {
  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);

    // Already has $schema - skip
    if (data.$schema) {
      console.log(`  ⏭️  ${filePath} (already has $schema)`);
      return false;
    }

    // Add $schema as first property
    const updated = { $schema: schemaUrl, ...data };
    writeFileSync(filePath, JSON.stringify(updated, null, "\t") + "\n");
    console.log(`  ✅ ${filePath}`);
    return true;
  } catch (error) {
    console.log(`  ❌ ${filePath}: ${(error as Error).message}`);
    return false;
  }
}

function findAndFixFiles(projectDir: string): { changes: number; specs: number; skipped: number } {
  const results = { changes: 0, specs: 0, skipped: 0 };

  // Find changes directory
  const changesDir = join(projectDir, "changes");
  if (existsSync(changesDir)) {
    console.log("\nProcessing changes/...");
    const changeDirs = readdirSync(changesDir).filter((name) => {
      const path = join(changesDir, name);
      return statSync(path).isDirectory();
    });

    for (const dir of changeDirs) {
      const changeFile = join(changesDir, dir, "change.json");
      if (existsSync(changeFile)) {
        if (addSchemaRef(changeFile, CHANGE_SCHEMA_URL)) {
          results.changes++;
        } else {
          results.skipped++;
        }
      }
    }
  }

  // Find specs directory
  const specsDir = join(projectDir, "specs");
  if (existsSync(specsDir)) {
    console.log("\nProcessing specs/...");
    const specDirs = readdirSync(specsDir).filter((name) => {
      const path = join(specsDir, name);
      return statSync(path).isDirectory();
    });

    for (const dir of specDirs) {
      const specFile = join(specsDir, dir, "spec.json");
      if (existsSync(specFile)) {
        if (addSchemaRef(specFile, SPEC_SCHEMA_URL)) {
          results.specs++;
        } else {
          results.skipped++;
        }
      }
    }
  }

  // Check archive directory too
  const archiveDir = join(projectDir, "archive");
  if (existsSync(archiveDir)) {
    console.log("\nProcessing archive/...");
    const archiveDirs = readdirSync(archiveDir).filter((name) => {
      const path = join(archiveDir, name);
      return statSync(path).isDirectory();
    });

    for (const dir of archiveDirs) {
      const changeFile = join(archiveDir, dir, "change.json");
      if (existsSync(changeFile)) {
        if (addSchemaRef(changeFile, CHANGE_SCHEMA_URL)) {
          results.changes++;
        } else {
          results.skipped++;
        }
      }
    }
  }

  return results;
}

// Main
const projectDir = process.argv[2] || process.cwd();

console.log(`Adding $schema references to ADV files in: ${projectDir}`);

if (!existsSync(projectDir)) {
  console.error(`Error: Directory not found: ${projectDir}`);
  process.exit(1);
}

const results = findAndFixFiles(projectDir);

console.log("\n" + "=".repeat(50));
console.log(`Done! Updated ${results.changes} changes, ${results.specs} specs`);
if (results.skipped > 0) {
  console.log(`Skipped ${results.skipped} files (already had $schema)`);
}
