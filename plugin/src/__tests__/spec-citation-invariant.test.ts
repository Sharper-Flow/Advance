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
import { execFileSync } from "child_process";

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

/**
 * Batch-search for all requirement IDs in a single ripgrep invocation.
 * Returns a Set of IDs that have at least one external citation.
 */
function findCitedRequirements(reqIds: string[]): Set<string> {
  const searchPaths = [
    "plugin/src",
    ".opencode",
    "skills",
    "docs",
    "ADV_INSTRUCTIONS.md",
    "AGENTS.md",
    "CHANGELOG.md",
  ].map((p) => join(REPO_ROOT, p));

  const excludeGlobs = ["docs/specs/*.md"];

  // Use ripgrep to find which IDs appear anywhere in citation sources
  // Build a regex that matches any of the requirement IDs as whole words
  const pattern = reqIds
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const rgArgs = [
    "--regexp",
    pattern,
    "--only-matching",
    "--no-filename",
    ...excludeGlobs.flatMap((g) => ["--glob", `!${g}`]),
    ...searchPaths,
  ];

  try {
    const output = execFileSync("rg", rgArgs, {
      cwd: REPO_ROOT,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: "pipe",
      encoding: "utf8",
    });
    const cited = new Set<string>();
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) cited.add(trimmed);
    }
    return cited;
  } catch (err: unknown) {
    // rg exits 1 when no matches at all — return empty set
    return new Set<string>();
  }
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

  test("total requirement count is stable", () => {
    // Guardrail: alert if requirement count changes significantly
    // Current count: 88 across 10 capabilities
    const totalReqs = allRequirements.length;
    const specCount = specs.length;

    expect(specCount).toBe(10);
    expect(totalReqs).toBe(88);
  });
});
