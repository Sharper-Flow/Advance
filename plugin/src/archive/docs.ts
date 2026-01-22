/**
 * Documentation Generation
 *
 * Generates markdown documentation from specs.
 */

import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import type { Spec, Requirement, Scenario } from "../types";
import type { GeneratedDoc, DocGenerationOptions } from "./types";

/**
 * Default doc generation options.
 */
const DEFAULT_OPTIONS: DocGenerationOptions = {
  outputDir: "docs/specs",
  includeToc: false,
  includeScenarios: true,
  template: "default",
};

/**
 * Generate markdown documentation for a single spec.
 */
export function generateSpecDoc(
  spec: Spec,
  options: Partial<DocGenerationOptions> = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // Title
  lines.push(`# ${spec.title}`);
  lines.push("");

  // Metadata
  lines.push(`> **Version:** ${spec.version}`);
  lines.push(`> **Updated:** ${formatDate(spec.updated_at)}`);
  lines.push("");

  // Purpose
  lines.push("## Purpose");
  lines.push("");
  lines.push(spec.purpose);
  lines.push("");

  // Table of Contents
  if (opts.includeToc && spec.requirements.length > 0) {
    lines.push("## Table of Contents");
    lines.push("");
    for (const req of spec.requirements) {
      const anchor = slugify(req.title);
      lines.push(`- [${req.title}](#${anchor})`);
    }
    lines.push("");
  }

  // Requirements
  lines.push("## Requirements");
  lines.push("");

  if (spec.requirements.length === 0) {
    lines.push("*No requirements defined.*");
    lines.push("");
  } else {
    for (const req of spec.requirements) {
      lines.push(...generateRequirementSection(req, opts));
    }
  }

  return lines.join("\n");
}

/**
 * Generate markdown for a single requirement.
 */
function generateRequirementSection(
  req: Requirement,
  options: DocGenerationOptions,
): string[] {
  const lines: string[] = [];

  // Requirement header with priority badge
  const badge = getPriorityBadge(req.priority);
  lines.push(`### ${req.title}`);
  lines.push("");
  lines.push(`**ID:** \`${req.id}\` | **Priority:** ${badge}`);
  lines.push("");

  // Body
  lines.push(req.body);
  lines.push("");

  // Tags
  if (req.tags && req.tags.length > 0) {
    const tagList = req.tags.map((t) => `\`${t}\``).join(", ");
    lines.push(`**Tags:** ${tagList}`);
    lines.push("");
  }

  // Scenarios
  if (options.includeScenarios && req.scenarios && req.scenarios.length > 0) {
    lines.push("#### Scenarios");
    lines.push("");

    for (const scenario of req.scenarios) {
      lines.push(...generateScenarioSection(scenario));
    }
  }

  lines.push("---");
  lines.push("");

  return lines;
}

/**
 * Generate markdown for a scenario.
 */
function generateScenarioSection(scenario: Scenario): string[] {
  const lines: string[] = [];

  lines.push(`**${scenario.title}** (\`${scenario.id}\`)`);
  lines.push("");

  // Given
  if (scenario.given.length > 0) {
    lines.push("**Given:**");
    for (const condition of scenario.given) {
      lines.push(`- ${condition}`);
    }
    lines.push("");
  }

  // When
  lines.push(`**When:** ${scenario.when}`);
  lines.push("");

  // Then
  if (scenario.then.length > 0) {
    lines.push("**Then:**");
    for (const outcome of scenario.then) {
      lines.push(`- ${outcome}`);
    }
    lines.push("");
  }

  return lines;
}

/**
 * Get a priority badge string.
 */
function getPriorityBadge(priority: string): string {
  switch (priority.toLowerCase()) {
    case "must":
      return "**[MUST]**";
    case "should":
      return "**[SHOULD]**";
    case "may":
      return "**[MAY]**";
    default:
      return `**[${priority.toUpperCase()}]**`;
  }
}

/**
 * Format a date string for display.
 */
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toISOString().split("T")[0];
  } catch {
    return isoDate;
  }
}

/**
 * Convert a string to a URL-safe slug.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate documentation for all provided specs.
 */
export async function generateAllDocs(
  specs: Map<string, Spec>,
  options: Partial<DocGenerationOptions> = {},
): Promise<GeneratedDoc[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const docs: GeneratedDoc[] = [];

  // Ensure output directory exists
  await mkdir(opts.outputDir, { recursive: true });

  for (const [capability, spec] of specs) {
    const content = generateSpecDoc(spec, opts);
    const filePath = join(opts.outputDir, `${capability}.md`);

    await writeFile(filePath, content, "utf-8");

    docs.push({
      capability,
      filePath,
      content,
    });
  }

  return docs;
}

/**
 * Generate a single spec's documentation file.
 */
export async function generateSpecDocFile(
  spec: Spec,
  outputDir: string,
  options: Partial<DocGenerationOptions> = {},
): Promise<GeneratedDoc> {
  const opts = { ...DEFAULT_OPTIONS, ...options, outputDir };

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  const content = generateSpecDoc(spec, opts);
  const filePath = join(outputDir, `${spec.name}.md`);

  await writeFile(filePath, content, "utf-8");

  return {
    capability: spec.name,
    filePath,
    content,
  };
}
