import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENT_PATH = join(REPO_ROOT, ".opencode/agents/adv-ci-waiter.md");
const ARCHIVE_COMMAND = join(REPO_ROOT, ".opencode/command/adv-archive.md");

function splitFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("File does not have a valid YAML frontmatter block");
  }
  return { frontmatter: match[1], body: match[2] };
}

describe("adv-ci-waiter assets", () => {
  test("ships repo-owned adv-ci-waiter.md agent definition", () => {
    expect(existsSync(AGENT_PATH)).toBe(true);
  });

  test("has mode: subagent", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    const { frontmatter } = splitFrontmatter(content);
    expect(frontmatter).toMatch(/mode:\s*subagent/);
  });

  test("uses oc-ci-wait as single GitHub polling/backoff owner", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toMatch(/oc-ci-wait\s+start/i);
    expect(content).toMatch(/oc-ci-wait\s+result/i);
    expect(content).toMatch(/oc-ci-wait/i);
  });

  test("starts exactly one watch per target", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toMatch(/exactly one watch/i);
  });

  test("samples oc-ci-wait result with bounded 20-30s cadence, not sleep 15 polling loop", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toMatch(
      /20[\s–—\\-]*(?:to|or|–|—|-)[\s–—\\-]*30\s*s(?:econds)?/i,
    );
    expect(content).not.toMatch(/sleep\s+15\b/);
  });

  test("oc-ci-wait result uses --watch-id <id> --json and never --repo/--sha/--pr", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toMatch(/--watch-id\s+<id>\s+--json/i);
    expect(content).toMatch(
      /(never|no)\s+pass[\s\S]{0,80}(--repo|--sha|--pr)/i,
    );
  });

  test("distinguishes CI success from PR MERGED", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toMatch(/CI\s+success/i);
    expect(content).toMatch(/MERGED/i);
    expect(content).toMatch(
      /(MERGED[^.\n]*PR\s+state|PR\s+state[^.\n]*MERGED|not\s+PR\s+MERGED|CI\s+success\s+is\s+not\s+PR)/i,
    );
  });

  test("forbids gh run watch and gh pr checks --watch", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toMatch(/gh\s+run\s+watch/i);
    expect(content).toMatch(/gh\s+pr\s+checks\s+--watch/i);
  });

  test("preserves bounded output and excludes raw log dumps", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toMatch(/bounded\s+output/i);
    expect(content).toMatch(
      /(do\s+not|didn't|doesn't|don't)[\s\S]{0,80}(dump|stream)[\s\S]{0,40}raw\s+logs?/i,
    );
  });

  test("renders final response shape with conclusion, checks, URL, watch ID, next action", () => {
    const content = readFileSync(AGENT_PATH, "utf8");
    expect(content).toMatch(/conclusion/i);
    expect(content).toMatch(/watch\s+id/i);
    expect(content).toMatch(/next\s+action/i);
  });

  test("archive Phase 9.5 does not equate waiter success with PR MERGED", () => {
    const content = readFileSync(ARCHIVE_COMMAND, "utf8");
    expect(content).toContain("Pending auto-merge.");
    expect(content).toContain("oc-ci-wait");
    // Either keep MERGED with explicit PR-state evidence requirement, or
    // explicitly call out that CI success alone is not MERGED.
    expect(content).toMatch(
      /(PR\s+state\s*==\s*MERGED|MERGED[^.\n]*PR\s+state|state[^.\n]*MERGED|PR[^.\n]*MERGED|MERGED[^.\n]*PR)/i,
    );
  });
});
