#!/usr/bin/env npx tsx
/**
 * Generate JSON Schema files from Zod schemas.
 * 
 * These schemas can be referenced by:
 * - Editors (VS Code) for autocomplete
 * - AI agents for validation before writing
 * - CI/CD for validation
 * 
 * Usage: npx tsx scripts/generate-schemas.ts
 * Output: schemas/*.schema.json
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import {
  SpecSchema,
  ChangeSchema,
  RequirementSchema,
  ScenarioSchema,
  TaskSchema,
  DeltaSchema,
  ProjectConfigSchema,
} from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(__dirname, "..", "schemas");

// Ensure schemas directory exists
if (!existsSync(SCHEMA_DIR)) {
  mkdirSync(SCHEMA_DIR, { recursive: true });
}

const schemas = [
  { name: "spec", schema: SpecSchema, description: "ADV Specification (The Law)" },
  { name: "change", schema: ChangeSchema, description: "ADV Change Proposal" },
  { name: "requirement", schema: RequirementSchema, description: "ADV Requirement" },
  { name: "scenario", schema: ScenarioSchema, description: "ADV Scenario (Given/When/Then)" },
  { name: "task", schema: TaskSchema, description: "ADV Task" },
  { name: "delta", schema: DeltaSchema, description: "ADV Delta Operation" },
  { name: "project", schema: ProjectConfigSchema, description: "ADV Project Configuration" },
];

console.log("Generating JSON Schemas from Zod definitions...\n");

for (const { name, schema, description } of schemas) {
  const jsonSchema = zodToJsonSchema(schema, {
    name,
    $refStrategy: "none", // Inline all refs for easier consumption
  });

  // Add metadata
  const enrichedSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: `https://github.com/anomalyco/oc-plugins/advance/schemas/${name}.schema.json`,
    title: `ADV ${name.charAt(0).toUpperCase() + name.slice(1)}`,
    description,
    ...jsonSchema,
  };

  const outputPath = join(SCHEMA_DIR, `${name}.schema.json`);
  writeFileSync(outputPath, JSON.stringify(enrichedSchema, null, 2) + "\n");
  console.log(`  ✓ ${name}.schema.json`);
}

console.log(`\nGenerated ${schemas.length} schemas in ${SCHEMA_DIR}`);
console.log("\nUsage in JSON files:");
console.log('  { "$schema": "./schemas/change.schema.json", ... }');
console.log("\nOr with absolute URL:");
console.log('  { "$schema": "https://raw.githubusercontent.com/anomalyco/oc-plugins/main/advance/plugin/schemas/change.schema.json", ... }');
