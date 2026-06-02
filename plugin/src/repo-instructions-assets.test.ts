import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENTS_PATH = join(REPO_ROOT, "AGENTS.md");
const PROJECT_CONTEXT_PATH = join(REPO_ROOT, "project.md");
const CI_WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/ci.yml");

describe("repo instruction drift guards (repairDriftContradictions T4)", () => {
  const agents = readFileSync(AGENTS_PATH, "utf8");
  const projectContext = readFileSync(PROJECT_CONTEXT_PATH, "utf8");
  const ciWorkflow = readFileSync(CI_WORKFLOW_PATH, "utf8");

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

  test("schema drift check is documented and enforced in CI before typecheck", () => {
    for (const text of [agents, projectContext]) {
      expect(text).toContain("CI order");
      expect(text).toContain(
        "schemas:check → typecheck → lint → format:check → test → build",
      );
    }

    expect(ciWorkflow).toContain("name: Schema drift check");
    expect(ciWorkflow).toContain("run: pnpm run schemas:check");
    expect(ciWorkflow.indexOf("run: pnpm run schemas:check")).toBeLessThan(
      ciWorkflow.indexOf("run: pnpm run typecheck"),
    );
  });
});
