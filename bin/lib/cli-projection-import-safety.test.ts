/**
 * Bun import-safety smoke test for the shared CLI projection module.
 *
 * Verifies that importing the shared module from the Bun CLI graph does not
 * drag in heavy plugin dependencies (storage, zod, node:* beyond the Bun
 * stdlib surfaces already used by the CLI).
 *
 * Run with: bun test bin/lib/cli-projection-import-safety.test.ts
 */

import { describe, expect, test } from "bun:test";

const SHARED_MODULE_PATH = "../../plugin/src/shared/cli-projection.ts";
const SHARED_SOURCE_URL = new URL(
  "../../plugin/src/shared/cli-projection.ts",
  import.meta.url,
);

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']zod["']/,
  /from\s+["']\.\.\/storage\//,
  /from\s+["']\.\.\/tools\//,
  /from\s+["']\.\.\/tool-registry/,
  /from\s+["']\.\.\/index["']/,
  /from\s+["']node:/,
];

describe("cli-projection Bun import safety", () => {
  test("shared module imports cleanly under Bun", async () => {
    const mod = await import(SHARED_MODULE_PATH);

    expect(Array.isArray(mod.GATE_ORDER)).toBe(true);
    expect(mod.GATE_ORDER).toHaveLength(7);
    expect(mod.GATE_ORDER).toEqual([
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
    ]);
    expect(typeof mod.GateState).toBe("undefined"); // interface only
  });

  test("shared module source contains no heavy imports", async () => {
    const source = await Bun.file(SHARED_SOURCE_URL).text();

    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }

    // Sanity: there should be no import statements at all in this plain-TS module.
    expect(source).not.toMatch(/^\s*import\s+/m);
  });

  test("bin/lib/changes.ts re-exports GATE_ORDER from shared module", async () => {
    const source = await Bun.file(new URL("./changes.ts", import.meta.url)).text();

    expect(source).toContain("../../plugin/src/shared/cli-projection");
    expect(source).toMatch(
      /import\s+\{\s*GATE_ORDER[^}]*\}\s+from\s+["']\.\.\/\.\.\/plugin\/src\/shared\/cli-projection["']/,
    );
    expect(source).toMatch(/export\s+\{\s*GATE_ORDER[^}]*\}\s*;?/);
  });

  test("bin/lib/types.ts re-exports projection types from shared module", async () => {
    const source = await Bun.file(new URL("./types.ts", import.meta.url)).text();

    expect(source).toContain("../../plugin/src/shared/cli-projection");
    expect(source).toMatch(/export\s+\{/);
    expect(source).toContain("GateId");
    expect(source).toContain("GateState");
    expect(source).toContain("ChangeRecord");
    expect(source).toContain("ChangeSummary");
    expect(source).toContain("LiveStatusPayload");
  });
});
