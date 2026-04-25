import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundleWorkflowCode } from "@temporalio/worker";

/**
 * P1.8 — Sandbox asset test (transitive import guard).
 *
 * `workflows.test.ts` already guards DIRECT imports of `workflows.ts`.
 * This test closes the transitive gap: bundle the actual workflow code
 * with `@temporalio/worker`'s webpack bundler and assert that no
 * filesystem / Node-only modules end up in the output.
 *
 * Modules that MUST NOT appear in the bundle:
 *   - `fs`, `fs/promises`, `node:fs`, `node:fs/promises`
 *   - `bun:sqlite`, `better-sqlite3`
 *   - `child_process`, `node:child_process`
 *   - `net`, `node:net`, `http`, `node:http`, `https`, `node:https`
 *
 * If any of these slip in via a transitive import (e.g. someone adds a
 * helper to `change-state.ts` that imports `../storage/X`), the
 * Temporal sandbox will fail at boot. This test catches it at PR time.
 *
 * Bundling takes ~5-10s on a cold cache; we set a generous test
 * timeout. CI runners benefit from the bundler cache so steady-state
 * cost is well under 5s.
 */
describe("workflow bundle import guard (P1.8)", () => {
  const workflowsPath = fileURLToPath(
    new URL("../workflows.ts", import.meta.url),
  );

  // Bundle once across all assertions — the actual bundle artifact is
  // identical regardless of which sniff we run.
  it("bundles workflows.ts without pulling in filesystem or Node-only modules", async () => {
    const bundle = await bundleWorkflowCode({ workflowsPath });
    expect(bundle.code).toBeTruthy();
    expect(typeof bundle.code).toBe("string");

    // Forbidden module specifiers. The bundler emits these as literal
    // strings in `require(...)` / dependency manifests when a module
    // is referenced. A clean workflow bundle must NOT reference any
    // of them. We match either bare or `node:` form.
    //
    // Note: we look for the QUOTED specifier (e.g. `"fs"`,
    // `'better-sqlite3'`) so that incidental occurrences in
    // comments or longer identifiers (like `pathToFileURL`) don't
    // false-positive.
    const forbidden = [
      "fs",
      "fs/promises",
      "node:fs",
      "node:fs/promises",
      "bun:sqlite",
      "better-sqlite3",
      "child_process",
      "node:child_process",
      "net",
      "node:net",
      "http",
      "node:http",
      "https",
      "node:https",
    ];

    const violations: { module: string; sample: string }[] = [];
    for (const mod of forbidden) {
      // Match `"<mod>"` or `'<mod>'` — the bundler always emits
      // quoted module IDs.
      const pattern = new RegExp(
        `["']${mod.replace(/[.+*?^${}()|[\]\\]/g, "\\$&")}["']`,
        "g",
      );
      const match = bundle.code.match(pattern);
      if (match) {
        // Capture a small context window for diagnostics
        const idx = bundle.code.search(pattern);
        const sample = bundle.code.slice(
          Math.max(0, idx - 60),
          Math.min(bundle.code.length, idx + 80),
        );
        violations.push({ module: mod, sample });
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map(
          (v) =>
            `  - ${v.module}\n      …${v.sample.replace(/\s+/g, " ").trim()}…`,
        )
        .join("\n");
      throw new Error(
        `Workflow bundle contains forbidden module references:\n${report}\n\n` +
          `Filesystem / Node-only modules must not reach the workflow sandbox. ` +
          `Check transitive imports from workflows.ts → contracts.ts / change-state.ts / project-state.ts.`,
      );
    }
  }, // Webpack bundling is slow on cold cache; CI runners hit ~5-8s.
  30_000);
});
