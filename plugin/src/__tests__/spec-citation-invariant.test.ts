// CI Invariant: Every spec requirement must have at least one external citation.
//
// This test ensures that every requirement in .adv/specs/{capability}/spec.json
// is referenced by at least one file outside its own spec definition and the
// auto-generated docs/specs/ mirrors. This prevents new laws from shipping
// without an enforcement path.
//
// Citation sources (any one is sufficient):
//   plugin/src/**/*.ts   — code and tests
//   .opencode/**/*.md    — command files and agent overlays
//   skills/**/*.md       — methodology skills
//   ADV_INSTRUCTIONS.md  — root-level instructions
//   AGENTS.md            — repo-level agent docs
//
// Exclusions:
//   docs/specs/           — auto-generated mirrors, not enforcement
//   own spec.json         — the requirement's own definition
//   meta.status=planned   — future enforcement path

import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const REPO_ROOT = join(__dirname, "../../..");

interface Requirement {
  id: string;
  title: string;
  body: string;
  priority: string;
  meta?: {
    status?: string;
    [key: string]: unknown;
  };
  scenarios?: unknown[];
}

interface SpecJson {
  name: string;
  version: string;
  requirements: Requirement[];
}

interface SpecFile {
  capability: string;
  path: string;
  spec: SpecJson;
}

function loadAllSpecs(): SpecFile[] {
  const specsDir = join(REPO_ROOT, ".adv/specs");
  const entries = readdirSync(specsDir);
  const specs: SpecFile[] = [];

  for (const entry of entries) {
    const specPath = join(specsDir, entry, "spec.json");
    try {
      if (statSync(specPath).isFile()) {
        const content = JSON.parse(readFileSync(specPath, "utf8")) as SpecJson;
        specs.push({ capability: entry, path: specPath, spec: content });
      }
    } catch {
      // Skip non-spec directories
    }
  }

  return specs;
}

// Pure-Node recursive directory walker
function walkDir(dir: string, excludePrefixes: string[]): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath, excludePrefixes));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist (e.g. skills/ on a fresh checkout)
  }
  return results;
}

/**
 * Search for requirement IDs using pure Node.js (no external deps).
 * Returns a Set of IDs that have at least one external citation.
 */
function findCitedRequirements(reqIds: string[]): Set<string> {
  if (reqIds.length === 0) return new Set<string>();

  const searchRoots = [
    join(REPO_ROOT, "plugin/src"),
    join(REPO_ROOT, ".opencode"),
    join(REPO_ROOT, "skills"),
    join(REPO_ROOT, "docs"),
  ];
  const searchFiles = [
    join(REPO_ROOT, "ADV_INSTRUCTIONS.md"),
    join(REPO_ROOT, "AGENTS.md"),
    join(REPO_ROOT, "CHANGELOG.md"),
  ];

  // Exclude auto-generated docs/specs/ mirrors
  const excludePrefix = join(REPO_ROOT, "docs", "specs");

  // Collect all files from search directories
  const allFiles = [...searchFiles];
  for (const root of searchRoots) {
    allFiles.push(...walkDir(root, [excludePrefix]));
  }

  // Filter out excluded paths and non-text files
  const textFiles = allFiles.filter(
    (f) =>
      !f.startsWith(excludePrefix) &&
      /\.(ts|tsx|js|jsx|md|json|yaml|yml)$/.test(f),
  );

  // Build a single alternation regex from all IDs
  const pattern = new RegExp(
    reqIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "g",
  );

  const cited = new Set<string>();
  for (const file of textFiles) {
    try {
      const content = readFileSync(file, "utf8");
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        cited.add(match[0]);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return cited;
}

describe("spec citation invariant", () => {
  const specs = loadAllSpecs();
  const allRequirements: Array<{
    id: string;
    title: string;
    capability: string;
    specPath: string;
    status?: string;
  }> = [];

  for (const { capability, path: specPath, spec } of specs) {
    for (const req of spec.requirements) {
      allRequirements.push({
        id: req.id,
        title: req.title,
        capability,
        specPath: relative(REPO_ROOT, specPath),
        status: req.meta?.status,
      });
    }
  }

  test(`all ${allRequirements.length} requirements have ≥1 external citation`, () => {
    const activeReqs = allRequirements.filter((r) => r.status !== "planned");
    const plannedReqs = allRequirements.filter((r) => r.status === "planned");

    // Batch search all IDs in one ripgrep call
    const citedIds = findCitedRequirements(activeReqs.map((r) => r.id));

    const uncited = activeReqs.filter((r) => !citedIds.has(r.id));

    if (plannedReqs.length > 0) {
      console.log(
        `  ℹ ${plannedReqs.length} planned requirement(s) skipped:`,
        plannedReqs.map((r) => r.id),
      );
    }

    if (uncited.length > 0) {
      const details = uncited
        .map((r) => `  - ${r.id} [${r.capability}]: ${r.title}`)
        .join("\n");
      expect.fail(
        `${uncited.length} requirement(s) have no external citation (excluding docs/specs/*.md and their own spec.json):\n${details}\n\n` +
          "Each requirement must be cited in at least one of: plugin/src/**/*.ts, .opencode/**/*.md, skills/**/*.md, docs/ (excl. specs/), ADV_INSTRUCTIONS.md, AGENTS.md, or CHANGELOG.md.\n" +
          "Add a '// rq-{ID}' comment to the implementing code, or an '<!-- rq-{ID} -->' comment to the relevant command file.",
      );
    }

    // If we get here, all requirements are cited
    expect(uncited).toHaveLength(0);
  }, 30_000);

  test("requirement count does not shrink unexpectedly", () => {
    // Guardrail: alert if capabilities/requirements disappear unexpectedly.
    // New cited requirements are allowed; the citation invariant above catches
    // new uncited requirements.
    const totalReqs = allRequirements.length;
    const specCount = specs.length;

    expect(specCount).toBeGreaterThanOrEqual(10);
    expect(totalReqs).toBeGreaterThanOrEqual(88);
  });
});
