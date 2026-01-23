#!/usr/bin/env bun
/**
 * OpenSpec to ADV Migration Script
 *
 * Migrates requirements from OpenSpec markdown specs to ADV JSON format.
 * Only migrates requirements - changes/tasks/deltas should be created fresh.
 *
 * Usage:
 *   bun scripts/migrate-openspec.ts <openspec-dir> [output-dir]
 *
 * Example:
 *   bun scripts/migrate-openspec.ts ~/dev/pokeedge/openspec ./specs
 */

import { readdir, readFile, mkdir, writeFile } from "fs/promises";
import { join, basename } from "path";
import { randomBytes } from "crypto";
import { existsSync } from "fs";

// Simple nanoid replacement using crypto
function nanoid(size: number = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(size);
  let result = "";
  for (let i = 0; i < size; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// =============================================================================
// Types
// =============================================================================

interface ParsedScenario {
  title: string;
  given: string[];
  when: string;
  then: string[];
}

interface ParsedRequirement {
  title: string;
  body: string;
  priority: "must" | "should" | "may";
  scenarios: ParsedScenario[];
  tags: string[];
}

interface ParsedSpec {
  name: string;
  title: string;
  purpose: string;
  requirements: ParsedRequirement[];
  implementationFiles: string[];
}

interface ADVScenario {
  id: string;
  title: string;
  given: string[];
  when: string;
  then: string[];
}

interface ADVRequirement {
  id: string;
  title: string;
  body: string;
  priority: "must" | "should" | "may";
  scenarios: ADVScenario[];
  tags?: string[];
}

interface ADVSpec {
  $schema: string;
  name: string;
  title: string;
  purpose: string;
  version: string;
  updated_at: string;
  requirements: ADVRequirement[];
}

interface MigrationReport {
  specsProcessed: number;
  requirementsMigrated: number;
  scenariosMigrated: number;
  warnings: string[];
  errors: string[];
}

// =============================================================================
// Parser
// =============================================================================

/**
 * Extract priority from requirement body text.
 * Scans for MUST, SHOULD, MAY keywords (case insensitive).
 */
function extractPriority(body: string): "must" | "should" | "may" {
  const upperBody = body.toUpperCase();

  // Check first sentence or first 200 chars for priority keyword
  const firstPart = upperBody.slice(0, 200);

  if (firstPart.includes("MUST")) return "must";
  if (firstPart.includes("SHALL")) return "must";
  if (firstPart.includes("SHOULD")) return "should";
  if (firstPart.includes("MAY")) return "may";

  // Default to "should" if no keyword found
  return "should";
}

/**
 * Extract tags from requirement body.
 * Looks for [tag] patterns.
 */
function extractTags(body: string): string[] {
  const tagPattern = /\[([a-z0-9-]+)\]/gi;
  const matches = body.matchAll(tagPattern);
  const tags = new Set<string>();

  for (const match of matches) {
    // Filter out common false positives
    const tag = match[1].toLowerCase();
    if (!["x", "given", "when", "then", "and", "or"].includes(tag)) {
      tags.add(tag);
    }
  }

  return [...tags];
}

/**
 * Parse a scenario block into structured format.
 */
function parseScenario(content: string): ParsedScenario | null {
  const lines = content.split("\n").map((l) => l.trim());

  const given: string[] = [];
  const then: string[] = [];
  let when = "";
  let currentSection: "given" | "when" | "then" | null = null;

  for (const line of lines) {
    // Check for section markers
    if (line.startsWith("- **GIVEN**") || line.startsWith("**GIVEN**")) {
      currentSection = "given";
      const text = line.replace(/^-?\s*\*\*GIVEN\*\*\s*/, "").trim();
      if (text) given.push(text);
    } else if (line.startsWith("- **WHEN**") || line.startsWith("**WHEN**")) {
      currentSection = "when";
      const text = line.replace(/^-?\s*\*\*WHEN\*\*\s*/, "").trim();
      if (text) when = text;
    } else if (line.startsWith("- **THEN**") || line.startsWith("**THEN**")) {
      currentSection = "then";
      const text = line.replace(/^-?\s*\*\*THEN\*\*\s*/, "").trim();
      if (text) then.push(text);
    } else if (line.startsWith("- **AND**") || line.startsWith("**AND**")) {
      const text = line.replace(/^-?\s*\*\*AND\*\*\s*/, "").trim();
      if (currentSection === "given" && text) given.push(text);
      else if (currentSection === "when" && text) when += " " + text;
      else if (currentSection === "then" && text) then.push(text);
    } else if (line.startsWith("- ") && currentSection) {
      // Continuation line
      const text = line.replace(/^-\s*/, "").trim();
      if (currentSection === "given" && text) given.push(text);
      else if (currentSection === "then" && text) then.push(text);
    }
  }

  // Validate we got something
  if (!when && given.length === 0 && then.length === 0) {
    return null;
  }

  return {
    title: "", // Will be set by caller
    given,
    when: when || "the action is performed",
    then: then.length > 0 ? then : ["the expected outcome occurs"],
  };
}

/**
 * Parse an OpenSpec markdown file into structured format.
 */
function parseOpenSpecMarkdown(content: string, filepath: string): ParsedSpec {
  const lines = content.split("\n");
  
  // Extract capability name from path like /path/to/specs/consumer-auth/spec.md
  const pathParts = filepath.split("/");
  const specIdx = pathParts.indexOf("spec.md");
  const capabilityName = specIdx > 0 ? pathParts[specIdx - 1] : basename(filepath, ".md");
  
  const spec: ParsedSpec = {
    name: capabilityName,
    title: "",
    purpose: "",
    requirements: [],
    implementationFiles: [],
  };

  let currentSection: "none" | "purpose" | "impl" | "requirements" = "none";
  let currentRequirement: ParsedRequirement | null = null;
  let currentScenarioTitle = "";
  let currentScenarioContent: string[] = [];
  let bodyBuffer: string[] = [];

  const flushScenario = () => {
    if (currentScenarioTitle && currentRequirement) {
      const scenario = parseScenario(currentScenarioContent.join("\n"));
      if (scenario) {
        scenario.title = currentScenarioTitle;
        currentRequirement.scenarios.push(scenario);
      }
    }
    currentScenarioTitle = "";
    currentScenarioContent = [];
  };

  const flushRequirement = () => {
    flushScenario();
    if (currentRequirement) {
      currentRequirement.body = bodyBuffer.join("\n").trim();
      currentRequirement.priority = extractPriority(currentRequirement.body);
      currentRequirement.tags = extractTags(currentRequirement.body);
      spec.requirements.push(currentRequirement);
    }
    currentRequirement = null;
    bodyBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Title (# heading)
    if (trimmed.startsWith("# ") && !spec.title) {
      spec.title = trimmed
        .replace(/^#\s*/, "")
        .replace(/\s*Specification\s*$/i, "")
        .trim();
      continue;
    }

    // Section headers
    if (trimmed === "## Purpose") {
      currentSection = "purpose";
      continue;
    }
    if (
      trimmed === "## Implementation Files" ||
      trimmed === "## Implementation"
    ) {
      currentSection = "impl";
      continue;
    }
    if (trimmed === "## Requirements") {
      currentSection = "requirements";
      continue;
    }

    // Purpose content
    if (currentSection === "purpose" && !trimmed.startsWith("##")) {
      if (trimmed && !spec.purpose) {
        spec.purpose = trimmed;
      } else if (trimmed && spec.purpose) {
        spec.purpose += " " + trimmed;
      }
      continue;
    }

    // Implementation files
    if (currentSection === "impl" && trimmed.startsWith("- ")) {
      spec.implementationFiles.push(trimmed.replace(/^-\s*/, ""));
      continue;
    }

    // Requirements section
    if (currentSection === "requirements" || trimmed.startsWith("### Requirement:")) {
      // New requirement
      if (trimmed.startsWith("### Requirement:")) {
        flushRequirement();
        currentSection = "requirements";
        const title = trimmed.replace(/^###\s*Requirement:\s*/, "").trim();
        currentRequirement = {
          title,
          body: "",
          priority: "should",
          scenarios: [],
          tags: [],
        };
        continue;
      }

      // Scenario header
      if (trimmed.startsWith("#### Scenario:")) {
        flushScenario();
        currentScenarioTitle = trimmed
          .replace(/^####\s*Scenario:\s*/, "")
          .trim();
        continue;
      }

      // Inside a scenario
      if (currentScenarioTitle) {
        currentScenarioContent.push(line);
        continue;
      }

      // Requirement body (before first scenario)
      if (currentRequirement && trimmed && !trimmed.startsWith("#")) {
        bodyBuffer.push(trimmed);
      }
    }
  }

  // Flush final requirement
  flushRequirement();

  return spec;
}

// =============================================================================
// Converter
// =============================================================================

/**
 * Convert parsed spec to ADV format.
 */
function convertToADV(parsed: ParsedSpec): ADVSpec {
  const adv: ADVSpec = {
    $schema: "../spec.schema.json",
    name: parsed.name,
    title: parsed.title || parsed.name,
    purpose: parsed.purpose || "Migrated from OpenSpec",
    version: "1.0.0",
    updated_at: new Date().toISOString(),
    requirements: [],
  };

  for (const req of parsed.requirements) {
    const reqId = `rq-${nanoid(8)}`;

    const advReq: ADVRequirement = {
      id: reqId,
      title: req.title,
      body: req.body,
      priority: req.priority,
      scenarios: req.scenarios.map((s, idx) => ({
        id: `${reqId}.${idx + 1}`,
        title: s.title,
        given: s.given,
        when: s.when,
        then: s.then,
      })),
    };

    if (req.tags.length > 0) {
      advReq.tags = req.tags;
    }

    adv.requirements.push(advReq);
  }

  return adv;
}

// =============================================================================
// Main
// =============================================================================

async function findSpecFiles(openspecDir: string): Promise<string[]> {
  const specsDir = join(openspecDir, "specs");
  const files: string[] = [];

  if (!existsSync(specsDir)) {
    console.error(`Specs directory not found: ${specsDir}`);
    return files;
  }

  const entries = await readdir(specsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const specFile = join(specsDir, entry.name, "spec.md");
      if (existsSync(specFile)) {
        files.push(specFile);
      }
    }
  }

  return files;
}

async function migrate(
  openspecDir: string,
  outputDir: string
): Promise<MigrationReport> {
  const report: MigrationReport = {
    specsProcessed: 0,
    requirementsMigrated: 0,
    scenariosMigrated: 0,
    warnings: [],
    errors: [],
  };

  // Find all spec files
  const specFiles = await findSpecFiles(openspecDir);
  console.log(`Found ${specFiles.length} spec files to migrate\n`);

  for (const specFile of specFiles) {
    try {
      const content = await readFile(specFile, "utf-8");
      const capabilityName = basename(specFile.replace("/spec.md", ""));

      console.log(`Processing: ${capabilityName}`);

      // Parse OpenSpec markdown
      const parsed = parseOpenSpecMarkdown(content, specFile);

      if (parsed.requirements.length === 0) {
        report.warnings.push(`${capabilityName}: No requirements found`);
        console.log(`  - No requirements found, skipping`);
        continue;
      }

      // Convert to ADV format
      const adv = convertToADV(parsed);

      // Create output directory
      const outDir = join(outputDir, parsed.name);
      await mkdir(outDir, { recursive: true });

      // Write spec.json
      const outFile = join(outDir, "spec.json");
      await writeFile(outFile, JSON.stringify(adv, null, 2));

      // Count scenarios
      const scenarioCount = adv.requirements.reduce(
        (sum, r) => sum + r.scenarios.length,
        0
      );

      console.log(
        `  - ${adv.requirements.length} requirements, ${scenarioCount} scenarios`
      );

      report.specsProcessed++;
      report.requirementsMigrated += adv.requirements.length;
      report.scenariosMigrated += scenarioCount;

      // Check for requirements without scenarios
      for (const req of adv.requirements) {
        if (req.scenarios.length === 0) {
          report.warnings.push(
            `${capabilityName}/${req.id}: No scenarios (${req.title})`
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`${specFile}: ${msg}`);
      console.error(`  - Error: ${msg}`);
    }
  }

  return report;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`
OpenSpec to ADV Migration Script

Usage:
  bun scripts/migrate-openspec.ts <openspec-dir> [output-dir]

Arguments:
  openspec-dir  Path to OpenSpec directory (containing specs/ folder)
  output-dir    Output directory for ADV specs (default: ./specs)

Example:
  bun scripts/migrate-openspec.ts ~/dev/pokeedge/openspec ./specs
`);
    process.exit(1);
  }

  const openspecDir = args[0];
  const outputDir = args[1] || "./specs";

  if (!existsSync(openspecDir)) {
    console.error(`OpenSpec directory not found: ${openspecDir}`);
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("  OpenSpec to ADV Migration");
  console.log("=".repeat(60));
  console.log(`Source: ${openspecDir}`);
  console.log(`Output: ${outputDir}`);
  console.log("");

  const report = await migrate(openspecDir, outputDir);

  console.log("");
  console.log("=".repeat(60));
  console.log("  Migration Report");
  console.log("=".repeat(60));
  console.log(`Specs processed:      ${report.specsProcessed}`);
  console.log(`Requirements migrated: ${report.requirementsMigrated}`);
  console.log(`Scenarios migrated:    ${report.scenariosMigrated}`);

  if (report.warnings.length > 0) {
    console.log(`\nWarnings (${report.warnings.length}):`);
    for (const w of report.warnings.slice(0, 20)) {
      console.log(`  - ${w}`);
    }
    if (report.warnings.length > 20) {
      console.log(`  ... and ${report.warnings.length - 20} more`);
    }
  }

  if (report.errors.length > 0) {
    console.log(`\nErrors (${report.errors.length}):`);
    for (const e of report.errors) {
      console.log(`  - ${e}`);
    }
  }

  console.log("");
  console.log("=".repeat(60));

  if (report.errors.length > 0) {
    process.exit(1);
  }
}

main();
