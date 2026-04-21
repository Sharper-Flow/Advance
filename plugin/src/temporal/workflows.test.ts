import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Workflow-safe invariant test for `workflows.ts`.
 *
 * This mirrors `migration-workflow.test.ts` but for the larger workflows
 * module that holds `changeWorkflow` and `projectWorkflow`. The bundle
 * fed to `@temporalio/worker`'s webpack MUST NOT drag in `node:*` APIs,
 * storage modules, or anything that calls `new Date()` during the raw
 * module evaluation phase — those break either determinism or bundling
 * in restricted runtimes (Bun's compiled executable, cross-env sandbox).
 *
 * Changes to the import surface must be deliberate. If you are legitimately
 * adding a new local module, update the allow-list here.
 */
describe("workflows module (workflow-safe invariant)", () => {
  const modulePath = fileURLToPath(
    new URL("./workflows.ts", import.meta.url),
  );
  const source = readFileSync(modulePath, "utf8");

  it("imports only @temporalio/workflow and the three allow-listed local modules", () => {
    const importBlock = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));

    // Must contain exactly one `import * as wf from "@temporalio/workflow"`
    const starImports = importBlock.filter((l) =>
      /^import \* as \w+ from/.test(l),
    );
    expect(starImports).toHaveLength(1);
    expect(starImports[0]).toMatch(/"@temporalio\/workflow"/);

    // Flatten multi-line imports into single-space string for regex matching
    const fullSource = source.replace(/\n/g, " ").replace(/\s+/g, " ");

    // Allow-listed local modules: ./contracts, ./change-state, ./project-state
    expect(fullSource).toMatch(/from "\.\/contracts"/);
    expect(fullSource).toMatch(/from "\.\/change-state"/);
    expect(fullSource).toMatch(/from "\.\/project-state"/);
  });

  it("does not import node:* modules directly", () => {
    expect(source).not.toMatch(/from "node:/);
  });

  it("does not import storage/ modules directly (transitive through change-state is acknowledged debt)", () => {
    expect(source).not.toMatch(/from "\.\.\/storage\//);
  });

  it("does not import other non-workflow-safe top-level modules", () => {
    // Catches accidental imports from Temporal client/worker packages, which
    // would drag heavy machinery into the workflow bundle.
    expect(source).not.toMatch(/from "@temporalio\/client"/);
    expect(source).not.toMatch(/from "@temporalio\/worker"/);
    expect(source).not.toMatch(/from "@temporalio\/activity"/);
    // Also catch storage + utils drag-in at the top level
    expect(source).not.toMatch(/from "\.\.\/utils\//);
    expect(source).not.toMatch(/from "\.\.\/storage\b/);
  });

  it("exports changeWorkflow and projectWorkflow", () => {
    expect(source).toMatch(/export async function changeWorkflow\(/);
    expect(source).toMatch(/export async function projectWorkflow\(/);
  });
});
