import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENTS_PATH = join(REPO_ROOT, "AGENTS.md");
const PROJECT_CONTEXT_PATH = join(REPO_ROOT, "project.md");

describe("repo instruction drift guards (repairDriftContradictions T4)", () => {
  const agents = readFileSync(AGENTS_PATH, "utf8");
  const projectContext = readFileSync(PROJECT_CONTEXT_PATH, "utf8");

  test("AGENTS.md command and storage quick-reference stays count-free and Temporal-only", () => {
    expect(agents).not.toMatch(/24 slash-command workflow files/);
    expect(agents).not.toMatch(/JSON \+ SQLite persistence/);
    expect(agents).toMatch(/Temporal-only persistence/);
    expect(agents).toMatch(/external state/);
  });

  test("schema generation guidance reflects Zod-authored generated artifacts", () => {
    for (const text of [agents, projectContext]) {
      expect(text).toContain("schemas:generate");
      expect(text).toContain("schemas:check");
      expect(text).toContain("z.toJSONSchema");
      expect(text).not.toContain("no `generate:schemas`");
      expect(text).not.toContain("$ref stub files only");
      expect(text).not.toContain("no separate schema-regeneration step");
    }
  });
});
