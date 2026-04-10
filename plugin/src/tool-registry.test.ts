/**
 * Tool Registry Tests
 *
 * Validates that tool-registry.ts exists and exports the expected API.
 */
import { describe, test, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

describe("tool-registry module contract", () => {
  const srcDir = resolve(new URL(".", import.meta.url).pathname);

  test("tool-registry.ts module exists", () => {
    expect(existsSync(resolve(srcDir, "tool-registry.ts"))).toBe(true);
  });
});

describe("tool-registry functional contract", () => {
  test("tool-registry.ts exports a registerTool helper function", async () => {
    const mod = await import("./tool-registry");
    expect(typeof mod.registerTool).toBe("function");
  });

  test("index.ts is under 500 lines after refactor", () => {
    const src = readFileSync(
      resolve(new URL(".", import.meta.url).pathname, "index.ts"),
      "utf8",
    );
    const lineCount = src.split("\n").length;
    expect(lineCount).toBeLessThan(500);
  });
});
