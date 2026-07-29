/**
 * Tier-4 MCP dispatcher unit tests.
 *
 * Regression: the generic dispatcher must be injectable with a `createToolMap`
 * factory so it is not forced to dynamically import `../../tool-registry.js`.
 * `project_context` is routed through this dispatcher and has no separate
 * global-registry handler.
 */
import { describe, expect, it, vi } from "vitest";
import { executeTier4Tool } from "./index.js";

describe("executeTier4Tool dispatcher injection", () => {
  it("uses injected createToolMap instead of dynamic import", async () => {
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
});
