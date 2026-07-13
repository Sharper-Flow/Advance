import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { ADV_TOOL_NAMES } from "./tool-registry";

const REPO_ROOT = resolve(__dirname, "../..");
const ADV_TOOL_NAME_SET = new Set(ADV_TOOL_NAMES);

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function markdownFiles(relativeDir: string): string[] {
  return readdirSync(join(REPO_ROOT, relativeDir))
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(relativeDir, name));
}

describe("tool-name assets", () => {
  test("agent ADV tool allowlists only name registered ADV tools", () => {
    const offenders: string[] = [];

    for (const relativePath of markdownFiles(".opencode/agents")) {
      const content = readRepoFile(relativePath);
      const toolKeys = [
        ...content.matchAll(/^\s{2}(adv_[A-Za-z0-9_]+):/gm),
      ].map((match) => match[1]);

      for (const toolKey of toolKeys) {
        if (!ADV_TOOL_NAME_SET.has(toolKey)) {
          offenders.push(`${relativePath}: ${toolKey}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("live prompts do not reference unavailable ADV tool names", () => {
    const promptFiles = [
      "ADV_INSTRUCTIONS.md",
      ...markdownFiles(".opencode/agents"),
      ...markdownFiles(".opencode/command"),
      ...markdownFiles(".opencode/overlays"),
    ];
    const offenders: string[] = [];

    for (const relativePath of promptFiles) {
      const content = readRepoFile(relativePath);
      const refs = new Set(
        [...content.matchAll(/\b(adv_[A-Za-z0-9_]+)\b/g)].map(
          (match) => match[1],
        ),
      );

      for (const ref of refs) {
        // `adv_agenda_*` / `adv_wisdom_*` prose shorthand is not a callable.
        if (ref.endsWith("_")) continue;
        // Classification labels surfaced by the coordinate workflow
        // (`adv_backed_fact` is a label, not a callable MCP tool). Pre-existing
        // reference in `.opencode/command/adv-coordinate.md`.
        if (ref === "adv_backed_fact") continue;
        if (!ADV_TOOL_NAME_SET.has(ref)) {
          offenders.push(`${relativePath}: ${ref}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("MCP exact-name guidance covers non-normalized callable names", () => {
    const instructions = readRepoFile("ADV_INSTRUCTIONS.md");
    const researcher = readRepoFile(".opencode/agents/adv-researcher.md");

    for (const content of [instructions, researcher]) {
      expect(content).toContain("searchcode_code_search");
      expect(content).toContain("context7_resolve-library-id");
      expect(content).toMatch(/exact schema identifiers|exact tool names/i);
    }
  });

  test("canonical tool list does not include a standalone adv_briefing_packet tool", () => {
    expect(ADV_TOOL_NAMES).not.toContain("adv_briefing_packet");
  });

  test("Episode recall policy is scoped, advisory, and read-only", () => {
    const orchestrator = readRepoFile(".opencode/agents/adv.md");
    const researcher = readRepoFile(".opencode/agents/adv-researcher.md");

    for (const content of [orchestrator, researcher]) {
      expect(content).toMatch(/^\s{2}episode_recall: true$/m);
      expect(content).toContain("top_k: 5");
      expect(content).toMatch(/advisory/i);
      expect(content).not.toMatch(/^\s{2}episode_(?:remember|forget|stats): true$/m);
    }
  });
});
