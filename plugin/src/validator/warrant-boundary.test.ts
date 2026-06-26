import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";

/**
 * DDC2 (addAcWarrantGuard): the pure warrant/contract-mint validator must stay
 * cycle-free — no STATIC import of the tool registry or any tools/* module.
 * The tool layer injects the live surface via runtime dynamic import instead.
 */
describe("warrant validator import boundary (DDC2)", () => {
  const files = ["warrant.ts", "contract-mint.ts"];
  const forbidden =
    /^\s*import\s+[^;]*from\s+["'](?:\.\.\/tool-registry|\.\.\/tools\/)/m;

  for (const file of files) {
    test(`${file} has no static tool-registry / tools/* import`, () => {
      const src = readFileSync(join(__dirname, file), "utf8");
      expect(src).not.toMatch(forbidden);
    });
  }
});
