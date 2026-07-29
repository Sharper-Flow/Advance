/**
 * Tier-4 MCP dispatcher unit tests.
 *
 * Regression: the generic dispatcher must receive a `createToolMap` factory
 * injected by the host/server registration path. It must never statically or
 * dynamically import `../../tool-registry.js`.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeTier4Tool } from "./index.js";

describe("executeTier4Tool dispatcher injection", () => {
  it("uses injected createToolMap", async () => {
    const createToolMap = vi.fn(() => ({
      adv_project_context: {
        execute: vi.fn(async () => "injected project context"),
      },
    }));

    const text = await executeTier4Tool(
      "/tmp/fake-project",
      "project_context",
      {},
      { createToolMap },
    );

    expect(createToolMap).toHaveBeenCalledTimes(1);
    expect(text).toBe("injected project context");
  });

  it("has no static or dynamic import of global tool-registry", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "./index.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/from\s+["'][^"']*tool-registry[^"']*["']/);
    expect(source).not.toMatch(
      /import\s*\(\s*["'][^"']*tool-registry[^"']*["']\s*\)/,
    );
  });
});
