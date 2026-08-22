/**
 * Tier-4 MCP dispatcher unit tests.
 *
 * Regression: the generic dispatcher must receive a `createToolMap` factory
 * injected by the host/server registration path. It must never statically or
 * dynamically import `../../tool-registry.js`.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { executeTier4Tool } from "./index.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/setup.js";
import {
  generatePluginBundleGeneration,
  writePluginBundleManifest,
} from "../../plugin-bundle-manifest.js";

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

  it("refuses a stale MCP read before dispatch and names the daemon-restart recovery", async () => {
    const distDir = await createTempDir("plugin-bundle-guard-");
    try {
      await writeFile(join(distDir, "index.js"), "index");
      await writeFile(join(distDir, "mcp-server.js"), "mcp");
      await writeFile(join(distDir, "reconcile-cli.js"), "reconcile-cli");
      const loadedGeneration = generatePluginBundleGeneration();
      const deployedGeneration = generatePluginBundleGeneration();
      await writePluginBundleManifest(distDir, deployedGeneration);
      const execute = vi.fn(async () => "served stale read");

      const text = await executeTier4Tool(
        "/tmp/fake-project",
        "project_context",
        {},
        {
          createToolMap: () => ({
            adv_project_context: { execute },
          }),
          pluginBundleGuard: {
            distDir,
            loadedGeneration,
            loadedModulePath: "/plugin/dist/mcp-server.js",
          },
        },
      );

      expect(JSON.parse(text)).toMatchObject({
        code: "PLUGIN_BUNDLE_GENERATION_MISMATCH",
        loadedGeneration,
        deployedGeneration,
        recovery: expect.stringContaining(
          "systemctl --user restart vision.service",
        ),
      });
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await cleanupTempDir(distDir);
    }
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
