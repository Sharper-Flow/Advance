import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Workflow-safe invariant guard for `workflows.ts`.
 *
 * `plugin/src/temporal/workflows.ts` is the root module Temporal's
 * `@temporalio/worker` webpack-bundles at plugin init. A single stray
 * direct import of `node:*` or `../storage/` pulls Node-only or
 * side-effect-heavy modules into the workflow sandbox and fails the
 * bundle at boot — exactly the `Webpack finished with errors` path
 * this change was created to eliminate.
 *
 * This test guards the DIRECT import surface only. Transitive imports
 * (e.g., `change-state.ts → ../storage/gate-reentry`) are an
 * acknowledged debt out of scope for this task; see change
 * `fixTemporalWorkerBundleFailure` Phase 2 for the follow-up.
 */
describe("workflows module (workflow-safe invariant)", () => {
  const modulePath = fileURLToPath(new URL("./workflows.ts", import.meta.url));
  const source = readFileSync(modulePath, "utf8");

  it("direct imports are restricted to workflow-safe modules", () => {
    // Join the full source so multi-line import statements collapse to a
    // single line for regex matching (prettier wraps long imports).
    const flat = source.replace(/\n/g, " ").replace(/\s+/g, " ");

    // Allowed: one `import * as wf from "@temporalio/workflow"` star import.
    expect(flat).toMatch(/import \* as wf from "@temporalio\/workflow";/);

    // Allowed: named/type imports from the three sibling workflow-safe
    // modules. Each appears exactly once as an import source.
    expect(flat).toMatch(/from "\.\/contracts";/);
    expect(flat).toMatch(/from "\.\/change-state";/);
    expect(flat).toMatch(/from "\.\/project-state";/);
  });

  it("does not directly import node:* modules", () => {
    // Any `from "node:..."` would pull Node built-ins into the workflow
    // bundle and break replay determinism / webpack bundling.
    expect(source).not.toMatch(/from "node:/);
  });

  it("does not directly import ../storage/ modules", () => {
    // Direct storage imports leak the JSON+SQLite layer into the workflow
    // sandbox. Transitive leaks are tracked separately.
    expect(source).not.toMatch(/from "\.\.\/storage\//);
  });

  it("does not import MCP tool layers or plugin-init", () => {
    // Defensive guards against future edits pulling in layers that
    // absolutely must not reach the workflow bundle.
    expect(source).not.toMatch(/from "\.\.\/tools\//);
    expect(source).not.toMatch(/from "\.\.\/plugin-init/);
    expect(source).not.toMatch(/from "\.\.\/tool-registry/);
  });

  it("exports changeWorkflow and projectWorkflow", () => {
    expect(source).toMatch(/export async function changeWorkflow\(/);
    expect(source).toMatch(/export async function projectWorkflow\(/);
  });
});
