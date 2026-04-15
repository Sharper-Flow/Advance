/**
 * Tool Registry Tests
 *
 * Validates that tool-registry.ts exists and exports the expected API.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  ADV_TOOL_NAMES,
  createDegradedToolMap,
  createToolMap,
} from "./tool-registry";
import { createStore } from "./storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "./__tests__/setup";

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

describe("createDegradedToolMap parity with createToolMap", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("ADV_TOOL_NAMES exactly matches the keys returned by createToolMap", async () => {
    // Drift guard: if a new tool is added to createToolMap but ADV_TOOL_NAMES
    // is not updated, agents in degraded sessions will see "tool missing" for
    // that tool and lose the structured ADV_PLUGIN_INIT_FAILED diagnostic path.
    const store = await createStore(tempDir);
    await store.init();
    try {
      const realToolNames = Object.keys(
        createToolMap(store, tempDir, store.paths.agenda),
      ).sort();
      const stubToolNames = [...ADV_TOOL_NAMES].sort();

      const onlyInReal = realToolNames.filter(
        (n) => !stubToolNames.includes(n),
      );
      const onlyInStub = stubToolNames.filter(
        (n) => !realToolNames.includes(n),
      );

      expect(onlyInReal).toEqual([]);
      expect(onlyInStub).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("createDegradedToolMap registers a stub for every name in ADV_TOOL_NAMES", () => {
    const map = createDegradedToolMap(new Error("test init failure"), "/tmp/x");
    for (const name of ADV_TOOL_NAMES) {
      expect(map).toHaveProperty(name);
    }
    expect(Object.keys(map).length).toBe(ADV_TOOL_NAMES.length);
  });
});
