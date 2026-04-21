import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("migration-workflow module (workflow-safe invariant)", () => {
  const modulePath = fileURLToPath(
    new URL("./migration-workflow.ts", import.meta.url),
  );
  const source = readFileSync(modulePath, "utf8");

  it("imports only @temporalio/workflow and type-only references", () => {
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));

    expect(importLines).toHaveLength(2);
    expect(importLines[0]).toMatch(
      /^import \* as wf from "@temporalio\/workflow";$/,
    );
    expect(importLines[1]).toMatch(
      /^import type \{[^}]+\} from "\.\/migrate-runner";$/,
    );
  });

  it("does not import node:* or storage/ modules", () => {
    expect(source).not.toMatch(/from "node:/);
    expect(source).not.toMatch(/from "\.\.\/storage\//);
    expect(source).not.toMatch(/from "\.\/migration"/);
  });

  it("exports migrateAllProjectsWorkflow", () => {
    expect(source).toMatch(
      /export async function migrateAllProjectsWorkflow\(/,
    );
  });
});
