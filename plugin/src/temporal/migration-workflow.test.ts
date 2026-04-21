import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("migration-workflow module (workflow-safe invariant)", () => {
  const modulePath = fileURLToPath(
    new URL("./migration-workflow.ts", import.meta.url),
  );
  const source = readFileSync(modulePath, "utf8");

  it("imports only @temporalio/workflow and type-only references", () => {
    const importBlock = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));

    expect(importBlock[0]).toMatch(
      /^import \* as wf from "@temporalio\/workflow";$/,
    );

    // The type import may span multiple lines (prettier wraps >80 cols).
    // Re-join the full source and match the type import statement.
    const fullSource = source.replace(/\n/g, " ").replace(/\s+/g, " ");
    expect(fullSource).toMatch(
      /import type \{[^}]+\} from "\.\/migrate-runner";/,
    );

    // Must contain exactly one `import *` and one `import type`
    expect(importBlock.filter((l) => /^import \*/.test(l))).toHaveLength(1);
    expect(importBlock.filter((l) => /^import type/.test(l))).toHaveLength(1);
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
