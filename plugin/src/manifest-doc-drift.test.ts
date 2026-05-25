/**
 * Manifest ↔ Command Doc Drift Tests
 *
 * Enforces that every `.opencode/command/adv-*.md` frontmatter `description`
 * exactly matches the canonical description in `plugin/src/manifest.ts`.
 *
 * Manifest is the single source of truth. Update manifest first, then run
 * this test to find which command docs need syncing.
 *
 * See: docs/command-voice-standard.md
 */

import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { COMMAND_MANIFEST } from "./manifest";

// Resolve the .opencode/command directory relative to the plugin root
const PLUGIN_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(PLUGIN_ROOT, ".opencode/command");
const README_PATH = join(PLUGIN_ROOT, "README.md");
const ADV_INSTRUCTIONS_PATH = join(PLUGIN_ROOT, "ADV_INSTRUCTIONS.md");

function assertContainsAllSnippets(
  content: string,
  snippets: string[],
  fileName: string,
) {
  const missing = snippets.filter((snippet) => !content.includes(snippet));
  expect(
    missing,
    `${fileName} is missing required prioritizer example snippets:\n${missing
      .map((s) => `- ${s}`)
      .join("\n")}`,
  ).toHaveLength(0);
}

/**
 * Parse the `description:` field from a markdown frontmatter block.
 *
 * CONTRACT: Command doc frontmatter `description` MUST be a single-line
 * YAML scalar (no multiline `|` or `>` blocks, no folded strings).
 * This regex parser relies on that constraint. If multiline frontmatter
 * descriptions are ever needed, replace this with a YAML-aware parser
 * such as `gray-matter`. See docs/command-voice-standard.md.
 */
function parseFrontmatterDescription(content: string): string | null {
  const match = content.match(/^description:\s*(.+)$/m);
  if (!match) return null;
  // Strip surrounding quotes if present
  return match[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * List all adv-*.md command files in the command directory.
 *
 * Wraps readdirSync with a diagnostic error if the command directory
 * is missing, so test failures point to the root cause immediately.
 */
function listCommandFiles(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(COMMAND_DIR);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Command directory not found: ${COMMAND_DIR}\n` +
          `Expected .opencode/command/ relative to plugin root: ${PLUGIN_ROOT}`,
        { cause: err },
      );
    }
    throw err;
  }
  return entries
    .filter((f) => f.startsWith("adv-") && f.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Parse markdown table rows matching `| /adv-<name> ... | <description> |`
 * into a map of command name → description.
 *
 * Handles argument suffixes like `<id>`, `<summary>`, `[path]` by stripping
 * them to extract the bare command name (e.g., "adv-apply").
 */
function parseDocTableDescriptions(content: string): Map<string, string> {
  const map = new Map<string, string>();
  // Match: | `/adv-<name>` or `/adv-<name> <args>` | <description> |
  const re = /^\|\s*`\/(adv-[a-z-]+)(?:\s+[^`]*)?`\s*\|\s*(.*?)\s*\|$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

describe("Manifest ↔ Command Doc Drift", () => {
  const commandFiles = listCommandFiles();

  test("all manifest commands have a corresponding command doc", () => {
    const docNames = new Set(commandFiles.map((f) => f.replace(".md", "")));
    for (const name of Object.keys(COMMAND_MANIFEST)) {
      expect(
        docNames.has(name),
        `manifest command '${name}' has no corresponding .opencode/command/${name}.md`,
      ).toBe(true);
    }
  });

  test("all command docs have a manifest entry", () => {
    for (const file of commandFiles) {
      const name = file.replace(".md", "");
      expect(
        COMMAND_MANIFEST,
        `command doc '${file}' has no entry in manifest.ts`,
      ).toHaveProperty(name);
    }
  });

  test("every command doc frontmatter description exactly matches manifest", () => {
    const mismatches: string[] = [];

    for (const file of commandFiles) {
      const name = file.replace(".md", "");
      const manifestDef =
        COMMAND_MANIFEST[name as keyof typeof COMMAND_MANIFEST];
      if (!manifestDef) continue; // covered by previous test

      const content = readFileSync(join(COMMAND_DIR, file), "utf8");
      const docDesc = parseFrontmatterDescription(content);

      if (docDesc === null) {
        mismatches.push(`${file}: missing 'description:' in frontmatter`);
        continue;
      }

      if (docDesc !== manifestDef.description) {
        mismatches.push(
          `${file}:\n  doc:      "${docDesc}"\n  manifest: "${manifestDef.description}"`,
        );
      }
    }

    expect(
      mismatches,
      `Frontmatter/manifest drift detected:\n\n${mismatches.join("\n\n")}`,
    ).toHaveLength(0);
  });

  test("every command doc has a non-empty description in frontmatter", () => {
    for (const file of commandFiles) {
      const content = readFileSync(join(COMMAND_DIR, file), "utf8");
      const desc = parseFrontmatterDescription(content);
      expect(
        desc,
        `${file}: 'description:' field is missing or empty`,
      ).toBeTruthy();

      const wordCount = desc!.trim().split(/\s+/).length;
      expect(
        wordCount,
        `${file}: description must be 5–14 words, got ${wordCount}: "${desc}"`,
      ).toBeGreaterThanOrEqual(5);
      expect(
        wordCount,
        `${file}: description must be 5–14 words, got ${wordCount}: "${desc}"`,
      ).toBeLessThanOrEqual(14);
    }
  });

  test("no frontmatter description uses multiline YAML markers", () => {
    for (const file of commandFiles) {
      const content = readFileSync(join(COMMAND_DIR, file), "utf8");
      // Extract the raw description line (before quote-stripping)
      const rawMatch = content.match(/^description:\s*(.*)$/m);
      if (!rawMatch) continue; // covered by other tests

      const rawValue = rawMatch[1].trim();
      expect(
        rawValue.startsWith("|") || rawValue.startsWith(">"),
        `${file}: description uses multiline YAML marker '${rawValue[0]}'. ` +
          `Use a single-line scalar instead. See docs/command-voice-standard.md`,
      ).toBe(false);
    }
  });
});

describe("Manifest ↔ Doc Table Drift", () => {
  /**
   * For each doc file (README.md, ADV_INSTRUCTIONS.md), verify that every
   * manifest command appears in the command table with the correct description.
   *
   * This is a semantic-presence check: the doc table description must exactly
   * match the manifest description. Doc tables may include argument hints
   * (e.g., `<id>`, `<summary>`) which are stripped during parsing.
   */
  const docFiles = [
    { name: "README.md", path: README_PATH },
    { name: "ADV_INSTRUCTIONS.md", path: ADV_INSTRUCTIONS_PATH },
  ];

  for (const { name: docName, path: docPath } of docFiles) {
    describe(docName, () => {
      let tableDescs: Map<string, string>;

      try {
        const content = readFileSync(docPath, "utf8");
        tableDescs = parseDocTableDescriptions(content);
      } catch {
        // If the file doesn't exist, all tests in this block will fail clearly
        tableDescs = new Map();
      }

      test("contains all manifest commands", () => {
        const missing: string[] = [];
        for (const name of Object.keys(COMMAND_MANIFEST)) {
          if (!tableDescs.has(name)) {
            missing.push(name);
          }
        }
        expect(
          missing,
          `${docName} is missing command table entries for: ${missing.join(", ")}`,
        ).toHaveLength(0);
      });

      test("command descriptions match manifest", () => {
        const mismatches: string[] = [];
        for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
          const docDesc = tableDescs.get(name);
          if (!docDesc) continue; // covered by "contains all" test
          if (docDesc !== def.description) {
            mismatches.push(
              `${name}:\n  ${docName}: "${docDesc}"\n  manifest:    "${def.description}"`,
            );
          }
        }
        expect(
          mismatches,
          `${docName} command table drift:\n\n${mismatches.join("\n\n")}`,
        ).toHaveLength(0);
      });
    });
  }
});

describe("Prioritizer protocol docs", () => {
  const readmeSnippets = [
    "Prioritizer protocol",
    "inline by default",
    "prioritizer",
    "task",
  ];

  const advSnippets = [
    "Tradeoff Prioritizer Protocol",
    "Default (inline):",
    "Optional (skill):",
    "prioritizer",
  ];

  test("README includes prioritizer protocol section", () => {
    const content = readFileSync(README_PATH, "utf8");
    assertContainsAllSnippets(content, readmeSnippets, "README.md");
  });

  test("ADV instructions include inline-first prioritizer protocol", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");
    assertContainsAllSnippets(content, advSnippets, "ADV_INSTRUCTIONS.md");
  });
});

// =============================================================================
// Prose-Load Reduction Drift (rq-proseReduction01–04)
// =============================================================================
//
// Per docs/command-voice-standard.md § Prose-Load Reduction Rules and the
// 4 spec deltas in `.adv/specs/advance-meta/spec.json`, instruction surfaces
// classify each section by enforcement class and apply matching templates.
//
// These tests are STRUCTURAL — they assert (1) per-class line caps, (2)
// presence of code-path reference in fully/partially-enforced section
// pointer lines. They do NOT assert specific wording.

const VOICE_STANDARD_PATH = join(PLUGIN_ROOT, "docs/command-voice-standard.md");
const ADVANCE_META_SPEC_PATH = join(
  PLUGIN_ROOT,
  ".adv/specs/advance-meta/spec.json",
);

describe("prose-load-reduction methodology presence (rq-proseReduction01)", () => {
  test("voice canon publishes the prose-reduction rules section", () => {
    const content = readFileSync(VOICE_STANDARD_PATH, "utf8");
    expect(content).toMatch(/##\s+Prose-Load Reduction Rules/);
    // 3-class taxonomy keywords (canonical class names)
    expect(content).toMatch(/fully-enforced/);
    expect(content).toMatch(/partially-enforced/);
    expect(content).toMatch(/inherently-prose/);
  });

  test("voice canon publishes the partially-enforced gap-rationale anchor", () => {
    const content = readFileSync(VOICE_STANDARD_PATH, "utf8");
    expect(content).toMatch(/Agent-side gap:/);
  });
});

describe("prose-load-reduction source-of-truth anchors (rq-proseReduction03)", () => {
  test("advance-meta makes specs/tests/contracts the durable source of truth", () => {
    const spec = JSON.parse(readFileSync(ADVANCE_META_SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string; body: string; tags?: string[] }>;
    };
    const req = spec.requirements.find((r) => r.id === "rq-proseReduction03");
    expect(req).toBeDefined();
    expect(req?.tags).toContain("source-of-truth");
    expect(req?.body).toContain("docs/command-voice-standard.md");
    expect(req?.body).toContain("specs, tests, command contracts");
    expect(req?.body).not.toContain("docs/" + "prose-load-inventory.md");
  });
});

describe("prose-load-reduction spec deltas (rq-proseReduction01–04)", () => {
  test("advance-meta spec.json contains all four prose-reduction requirements", () => {
    const spec = JSON.parse(readFileSync(ADVANCE_META_SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string; title: string; priority: string }>;
      version: string;
    };
    const ids = spec.requirements.map((r) => r.id);
    expect(ids).toContain("rq-proseReduction01");
    expect(ids).toContain("rq-proseReduction02");
    expect(ids).toContain("rq-proseReduction03");
    expect(ids).toContain("rq-proseReduction04");
  });

  test("each prose-reduction requirement is MUST priority", () => {
    const spec = JSON.parse(readFileSync(ADVANCE_META_SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string; priority: string }>;
    };
    const reqs = spec.requirements.filter((r) =>
      r.id.startsWith("rq-proseReduction"),
    );
    expect(reqs).toHaveLength(4);
    for (const r of reqs) {
      expect(r.priority).toBe("must");
    }
  });
});

describe("prose-load-reduction section structural caps (rq-proseReduction02)", () => {
  // Structural cap (advisory): the §Prose-Load Reduction Rules section itself
  // should remain compact. Generous cap allows the templates + taxonomy table
  // but prevents drift back to paragraph-form explanation.
  test("voice canon §Prose-Load Reduction Rules section ≤ 80 lines", () => {
    const content = readFileSync(VOICE_STANDARD_PATH, "utf8");
    const match = content.match(
      /##\s+Prose-Load Reduction Rules\n([\s\S]*?)\n##\s/,
    );
    expect(match).not.toBeNull();
    const sectionLines = match![1].split("\n").length;
    expect(sectionLines).toBeLessThanOrEqual(80);
  });
});
