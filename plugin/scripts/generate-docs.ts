#!/usr/bin/env pnpm dlx tsx
/**
 * Generate markdown documentation from spec.json files.
 *
 * Usage: pnpm dlx tsx scripts/generate-docs.ts
 * Output: docs/specs/*.md
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = join(__dirname, "..", "..", ".adv", "specs");
const DOCS_DIR = join(__dirname, "..", "..", "docs", "specs");

// Ensure output directory exists
if (!existsSync(DOCS_DIR)) {
  mkdirSync(DOCS_DIR, { recursive: true });
}

interface Scenario {
  id: string;
  title: string;
  given: string[];
  when: string;
  then: string[];
}

interface Requirement {
  id: string;
  title: string;
  body: string;
  priority: string;
  tags?: string[];
  scenarios?: Scenario[];
}

interface Spec {
  name: string;
  title: string;
  purpose: string;
  version: string;
  updated_at: string;
  requirements: Requirement[];
}

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

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toISOString().split("T")[0];
  } catch {
    return isoDate;
  }
}

function generateSpecDoc(spec: Spec): string {
  const lines: string[] = [];

  lines.push(`# ${spec.title}`);
  lines.push("");
  lines.push(`> **Version:** ${spec.version}`);
  lines.push(`> **Updated:** ${formatDate(spec.updated_at)}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push(spec.purpose);
  lines.push("");
  lines.push("## Requirements");
  lines.push("");

  if (spec.requirements.length === 0) {
    lines.push("*No requirements defined.*");
    lines.push("");
  } else {
    for (const req of spec.requirements) {
      const badge = getPriorityBadge(req.priority);
      lines.push(`### ${req.title}`);
      lines.push("");
      lines.push(`**ID:** \`${req.id}\` | **Priority:** ${badge}`);
      lines.push("");
      lines.push(req.body);
      lines.push("");

      if (req.tags && req.tags.length > 0) {
        const tagList = req.tags.map((t) => `\`${t}\``).join(", ");
        lines.push(`**Tags:** ${tagList}`);
        lines.push("");
      }

      if (req.scenarios && req.scenarios.length > 0) {
        lines.push("#### Scenarios");
        lines.push("");

        for (const scenario of req.scenarios) {
          lines.push(`**${scenario.title}** (\`${scenario.id}\`)`);
          lines.push("");

          if (scenario.given.length > 0) {
            lines.push("**Given:**");
            for (const condition of scenario.given) {
              lines.push(`- ${condition}`);
            }
            lines.push("");
          }

          lines.push(`**When:** ${scenario.when}`);
          lines.push("");

          if (scenario.then.length > 0) {
            lines.push("**Then:**");
            for (const outcome of scenario.then) {
              lines.push(`- ${outcome}`);
            }
            lines.push("");
          }
        }
      }

      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}

// Main
const specDirs = readdirSync(SPECS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

console.log("Generating spec documentation...\n");

let count = 0;
for (const dir of specDirs) {
  const specPath = join(SPECS_DIR, dir, "spec.json");
  if (!existsSync(specPath)) {
    console.log(`  ⚠ ${dir}/spec.json not found, skipping`);
    continue;
  }

  const raw = readFileSync(specPath, "utf-8");
  const spec: Spec = JSON.parse(raw);
  const content = generateSpecDoc(spec);
  const outputPath = join(DOCS_DIR, `${spec.name}.md`);

  writeFileSync(outputPath, content, "utf-8");
  console.log(`  ✓ ${spec.name}.md (${spec.requirements.length} requirements)`);
  count++;
}

console.log(`\nGenerated ${count} spec docs in ${DOCS_DIR}`);
