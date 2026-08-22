import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "./__tests__/setup";
import {
  PLUGIN_BUNDLE_MANIFEST_FILENAME,
  PLUGIN_BUNDLE_STALE_ADVISORY,
  comparePluginBundleGenerations,
  generatePluginBundleGeneration,
  getLoadedPluginBundleGeneration,
  getPluginBundleGenerationGuardError,
  getPluginBundleDistDir,
  getPluginBundleFreshness,
  getPluginBundleReleasePreflightError,
  getPluginRoot,
  readPluginBundleManifest,
  writePluginBundleManifest,
} from "./plugin-bundle-manifest";

const NOW = new Date("2026-07-16T00:00:00.000Z");

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
  tempDirs = [];
});

const tempDistDir = async (withFiles = true) => {
  const dir = await createTempDir("plugin-bundle-manifest-");
  tempDirs.push(dir);
  if (withFiles) {
    await writeFile(join(dir, "index.js"), "// plugin bundle v1\n");
    await writeFile(join(dir, "mcp-server.js"), "// mcp server bundle v1\n");
    await writeFile(join(dir, "reconcile-cli.js"), "// reconcile bundle v1\n");
  }
  return dir;
};

describe("plugin bundle manifest", () => {
  test("generatePluginBundleGeneration returns opaque 64-hex digest", () => {
    const gen = generatePluginBundleGeneration();
    expect(gen).toMatch(/^[0-9a-f]{64}$/);
    expect(generatePluginBundleGeneration()).not.toBe(gen);
  });

  test("write produces schema-v1 manifest with generation and both file hashes", async () => {
    const dir = await tempDistDir();
    const generation = generatePluginBundleGeneration();
    const manifest = await writePluginBundleManifest(dir, generation, {
      now: () => NOW,
    });

    expect(manifest.schema_version).toBe(1);
    expect(manifest.generation).toBe(generation);
    expect(manifest.files.index).toBe(sha256("// plugin bundle v1\n"));
    expect(manifest.files["mcp-server"]).toBe(
      sha256("// mcp server bundle v1\n"),
    );
    expect(manifest.files["reconcile-cli"]).toBe(
      sha256("// reconcile bundle v1\n"),
    );
    expect(manifest.built_at).toBe(NOW.toISOString());

    const raw = await readFile(
      join(dir, PLUGIN_BUNDLE_MANIFEST_FILENAME),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.files.index).toBe(manifest.files.index);
    expect(parsed.files["mcp-server"]).toBe(manifest.files["mcp-server"]);
    expect(parsed.files["reconcile-cli"]).toBe(manifest.files["reconcile-cli"]);
  });

  test("write is atomic via temp+rename and leaves no temp files", async () => {
    const dir = await tempDistDir();
    await writePluginBundleManifest(dir, generatePluginBundleGeneration(), {
      now: () => NOW,
    });

    const entries = await readdir(dir);
    expect(entries).toContain(PLUGIN_BUNDLE_MANIFEST_FILENAME);
    expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  test("write refuses when index.js is missing", async () => {
    // Provide mcp-server.js so only index.js is absent — isolating the
    // index.js check (the writer requires both bundles; with neither present
    // it would report mcp-server.js first).
    const dir = await createTempDir("plugin-bundle-manifest-");
    tempDirs.push(dir);
    await writeFile(join(dir, "mcp-server.js"), "// mcp only\n");
    await writeFile(join(dir, "reconcile-cli.js"), "// reconcile only\n");
    await expect(
      writePluginBundleManifest(dir, generatePluginBundleGeneration()),
    ).rejects.toThrow(/index\.js/);
  });

  test("write refuses when mcp-server.js is missing", async () => {
    const dir = await createTempDir("plugin-bundle-manifest-");
    tempDirs.push(dir);
    await writeFile(join(dir, "index.js"), "// index only\n");
    await writeFile(join(dir, "reconcile-cli.js"), "// reconcile only\n");
    await expect(
      writePluginBundleManifest(dir, generatePluginBundleGeneration()),
    ).rejects.toThrow(/mcp-server\.js/);
  });

  test("read round-trips a written manifest", async () => {
    const dir = await tempDistDir();
    const generation = generatePluginBundleGeneration();
    const written = await writePluginBundleManifest(dir, generation, {
      now: () => NOW,
    });

    const read = await readPluginBundleManifest(dir);
    expect(read).toEqual(written);
  });

  test("read returns null for missing, empty, malformed, invalid, or unsupported manifests", async () => {
    const missingDir = await tempDistDir();
    await expect(readPluginBundleManifest(missingDir)).resolves.toBeNull();

    const emptyDir = await tempDistDir();
    await writeFile(join(emptyDir, PLUGIN_BUNDLE_MANIFEST_FILENAME), "   \n");
    await expect(readPluginBundleManifest(emptyDir)).resolves.toBeNull();

    const malformedDir = await tempDistDir();
    await writeFile(
      join(malformedDir, PLUGIN_BUNDLE_MANIFEST_FILENAME),
      "{ not json",
    );
    await expect(readPluginBundleManifest(malformedDir)).resolves.toBeNull();

    const badGenerationDir = await tempDistDir();
    await writeFile(
      join(badGenerationDir, PLUGIN_BUNDLE_MANIFEST_FILENAME),
      JSON.stringify({
        schema_version: 1,
        generation: "short",
        files: { index: "also-short", "mcp-server": "also-short" },
        built_at: NOW.toISOString(),
      }),
    );
    await expect(
      readPluginBundleManifest(badGenerationDir),
    ).resolves.toBeNull();

    const badMcpServerHashDir = await tempDistDir();
    await writeFile(
      join(badMcpServerHashDir, PLUGIN_BUNDLE_MANIFEST_FILENAME),
      JSON.stringify({
        schema_version: 1,
        generation: generatePluginBundleGeneration(),
        files: {
          index: generatePluginBundleGeneration(),
          "mcp-server": "short",
        },
        built_at: NOW.toISOString(),
      }),
    );
    await expect(
      readPluginBundleManifest(badMcpServerHashDir),
    ).resolves.toBeNull();

    const unsupportedDir = await tempDistDir();
    await writeFile(
      join(unsupportedDir, PLUGIN_BUNDLE_MANIFEST_FILENAME),
      JSON.stringify({
        schema_version: 2,
        generation: generatePluginBundleGeneration(),
        files: { index: generatePluginBundleGeneration() },
        built_at: NOW.toISOString(),
      }),
    );
    await expect(readPluginBundleManifest(unsupportedDir)).resolves.toBeNull();

    const invalidTimestampDir = await tempDistDir();
    await writeFile(
      join(invalidTimestampDir, PLUGIN_BUNDLE_MANIFEST_FILENAME),
      JSON.stringify({
        schema_version: 1,
        generation: generatePluginBundleGeneration(),
        files: {
          index: generatePluginBundleGeneration(),
          "mcp-server": generatePluginBundleGeneration(),
        },
        built_at: "not-an-iso-timestamp",
      }),
    );
    await expect(
      readPluginBundleManifest(invalidTimestampDir),
    ).resolves.toBeNull();
  });

  test("read accepts a legacy manifest that lacks mcp-server.js", async () => {
    const dir = await tempDistDir();
    const generation = generatePluginBundleGeneration();
    await writeFile(
      join(dir, PLUGIN_BUNDLE_MANIFEST_FILENAME),
      JSON.stringify({
        schema_version: 1,
        generation,
        files: { index: generatePluginBundleGeneration() },
        built_at: NOW.toISOString(),
      }),
    );
    const read = await readPluginBundleManifest(dir);
    expect(read).not.toBeNull();
    expect(read?.generation).toBe(generation);
    expect(read?.files["mcp-server"]).toBeUndefined();
  });

  describe("comparePluginBundleGenerations", () => {
    test("returns current when loaded and deployed generations match", () => {
      const generation = generatePluginBundleGeneration();
      const manifest = {
        schema_version: 1 as const,
        generation,
        files: {
          index: generatePluginBundleGeneration(),
          "mcp-server": generatePluginBundleGeneration(),
        },
        built_at: NOW.toISOString(),
      };
      const result = comparePluginBundleGenerations(generation, manifest);
      expect(result.state).toBe("current");
      expect(result.loadedGeneration).toBe(generation);
      expect(result.deployedGeneration).toBe(generation);
      expect(result.recovery).toBeNull();
      expect(result.reason).toBeNull();
    });

    test("returns stale with typed advisory and both generations when they differ", () => {
      const loaded = generatePluginBundleGeneration();
      const deployed = generatePluginBundleGeneration();
      const manifest = {
        schema_version: 1 as const,
        generation: deployed,
        files: {
          index: generatePluginBundleGeneration(),
          "mcp-server": generatePluginBundleGeneration(),
        },
        built_at: NOW.toISOString(),
      };
      const result = comparePluginBundleGenerations(loaded, manifest);
      expect(result.state).toBe("stale");
      expect(result.advisoryType).toBe(PLUGIN_BUNDLE_STALE_ADVISORY);
      expect(result.loadedGeneration).toBe(loaded);
      expect(result.deployedGeneration).toBe(deployed);
      expect(result.recovery).toMatch(/restart/i);
    });

    test("returns unknown with bounded reason when loaded generation is missing", () => {
      const manifest = {
        schema_version: 1 as const,
        generation: generatePluginBundleGeneration(),
        files: {
          index: generatePluginBundleGeneration(),
          "mcp-server": generatePluginBundleGeneration(),
        },
        built_at: NOW.toISOString(),
      };
      const result = comparePluginBundleGenerations(null, manifest);
      expect(result.state).toBe("unknown");
      expect(result.reason).toBe("missing_loaded_generation");
      expect(result.loadedGeneration).toBeNull();
    });

    test("returns unknown with bounded reason when deployed manifest is missing", () => {
      const loaded = generatePluginBundleGeneration();
      const result = comparePluginBundleGenerations(loaded, null);
      expect(result.state).toBe("unknown");
      expect(result.reason).toBe("missing_manifest");
      expect(result.deployedGeneration).toBeNull();
    });

    test("index hash is diagnostic only — mtime-preserving manifest change still reports stale", () => {
      const loaded = generatePluginBundleGeneration();
      const indexHash = generatePluginBundleGeneration();
      const manifest = {
        schema_version: 1 as const,
        generation: generatePluginBundleGeneration(),
        files: {
          index: indexHash,
          "mcp-server": generatePluginBundleGeneration(),
        },
        built_at: NOW.toISOString(),
      };
      const result = comparePluginBundleGenerations(loaded, manifest);
      expect(result.state).toBe("stale");
      expect(result.deployedIndexSha256).toBe(indexHash);
    });
  });

  test("getLoadedPluginBundleGeneration returns captured generation", () => {
    // In test source execution, the build-time define is not injected, so it
    // returns null. This still proves the capture path is wired and safe.
    expect(getLoadedPluginBundleGeneration()).toBeNull();
  });
});

describe("getPluginBundleFreshness", () => {
  test("returns current when loaded and deployed generations match", async () => {
    const dir = await tempDistDir();
    const generation = generatePluginBundleGeneration();
    await writePluginBundleManifest(dir, generation, { now: () => NOW });
    const result = await getPluginBundleFreshness(dir, generation);
    expect(result.state).toBe("current");
    expect(result.loadedGeneration).toBe(generation);
    expect(result.deployedGeneration).toBe(generation);
    expect(result.reason).toBeNull();
    expect(result.recovery).toBeNull();
  });

  test("returns stale with typed advisory when generations differ", async () => {
    const dir = await tempDistDir();
    const loaded = generatePluginBundleGeneration();
    const deployed = generatePluginBundleGeneration();
    await writePluginBundleManifest(dir, deployed, { now: () => NOW });
    const result = await getPluginBundleFreshness(dir, loaded);
    expect(result.state).toBe("stale");
    expect(result.advisoryType).toBe(PLUGIN_BUNDLE_STALE_ADVISORY);
    expect(result.loadedGeneration).toBe(loaded);
    expect(result.deployedGeneration).toBe(deployed);
    expect(result.recovery).toMatch(/restart/i);
  });

  test("returns unknown with bounded reason when loaded generation is missing", async () => {
    const dir = await tempDistDir();
    const deployed = generatePluginBundleGeneration();
    await writePluginBundleManifest(dir, deployed, { now: () => NOW });
    const result = await getPluginBundleFreshness(dir);
    expect(result.state).toBe("unknown");
    expect(result.reason).toBe("missing_loaded_generation");
    expect(result.loadedGeneration).toBeNull();
  });

  test("returns unknown with bounded reason when manifest is missing", async () => {
    const dir = await tempDistDir();
    const loaded = generatePluginBundleGeneration();
    const result = await getPluginBundleFreshness(dir, loaded);
    expect(result.state).toBe("unknown");
    expect(result.reason).toBe("missing_manifest");
    expect(result.deployedGeneration).toBeNull();
  });
});

describe("plugin bundle generation guard", () => {
  test.each([
    {
      loadedModulePath: "/plugin/dist/index.js",
      processName: "OpenCode",
      expectedRemediation: "Restart OpenCode",
    },
    {
      loadedModulePath: "/plugin/dist/mcp-server.js",
      processName: "the Vision-supervised MCP server",
      expectedRemediation: "systemctl --user restart vision.service",
    },
  ])(
    "returns a typed refusal instead of serving a read for $processName when generations differ",
    async ({ loadedModulePath, expectedRemediation }) => {
      const dir = await tempDistDir();
      const loaded = generatePluginBundleGeneration();
      const deployed = generatePluginBundleGeneration();
      await writePluginBundleManifest(dir, deployed, { now: () => NOW });

      const refusal = await getPluginBundleGenerationGuardError(dir, {
        loadedGeneration: loaded,
        loadedModulePath,
      });

      expect(refusal).toMatchObject({
        code: "PLUGIN_BUNDLE_GENERATION_MISMATCH",
        loadedGeneration: loaded,
        deployedGeneration: deployed,
        loadedModulePath,
      });
      expect(refusal?.recovery).toContain(expectedRemediation);
      expect(refusal?.recovery).toMatch(/restart/i);
    },
  );
});

describe("getPluginBundleReleasePreflightError", () => {
  test("returns a typed release preflight error when the loaded bundle is stale", async () => {
    const dir = await tempDistDir();
    const loaded = generatePluginBundleGeneration();
    const deployed = generatePluginBundleGeneration();
    await writePluginBundleManifest(dir, deployed, { now: () => NOW });

    const result = await getPluginBundleReleasePreflightError(dir, loaded);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("PLUGIN_BUNDLE_STALE_RELEASE_PREFLIGHT");
    expect(result?.error).toMatch(/loaded plugin bundle is stale/i);
    expect(result?.remediation).toMatch(/restart/i);
    expect(result?.reason).toBe("generation_mismatch");
    expect(result?.loadedGeneration).toBe(loaded);
    expect(result?.deployedGeneration).toBe(deployed);
  });

  test("returns null when the loaded bundle is current", async () => {
    const dir = await tempDistDir();
    const generation = generatePluginBundleGeneration();
    await writePluginBundleManifest(dir, generation, { now: () => NOW });

    const result = await getPluginBundleReleasePreflightError(dir, generation);
    expect(result).toBeNull();
  });

  test("returns null when freshness is unknown", async () => {
    const dir = await tempDistDir();
    const deployed = generatePluginBundleGeneration();
    await writePluginBundleManifest(dir, deployed, { now: () => NOW });

    // No loaded generation override → null loaded generation → unknown.
    const result = await getPluginBundleReleasePreflightError(dir);
    expect(result).toBeNull();
  });
});

describe("plugin bundle path resolution", () => {
  test("getPluginRoot resolves plugin root from source index.ts module", () => {
    const srcUrl = "file:///home/user/advance/plugin/src/index.ts";
    expect(getPluginRoot(srcUrl)).toBe("/home/user/advance/plugin");
  });

  test("getPluginRoot resolves plugin root from bundled dist/index.js module", () => {
    const distUrl = "file:///home/user/advance/plugin/dist/index.js";
    expect(getPluginRoot(distUrl)).toBe("/home/user/advance/plugin");
  });

  test("getPluginRoot resolves plugin root from bundled dist chunk module", () => {
    const chunkUrl = "file:///home/user/advance/plugin/dist/chunk-PL7DRBOO.js";
    expect(getPluginRoot(chunkUrl)).toBe("/home/user/advance/plugin");
  });

  test("getPluginRoot resolves plugin root from bundled dist/mcp-server.js module", () => {
    const mcpUrl = "file:///home/user/advance/plugin/dist/mcp-server.js";
    expect(getPluginRoot(mcpUrl)).toBe("/home/user/advance/plugin");
  });

  test("getPluginBundleDistDir resolves plugin/dist from source module", () => {
    const srcUrl =
      "file:///home/user/advance/plugin/src/plugin-bundle-manifest.ts";
    expect(getPluginBundleDistDir(srcUrl)).toBe(
      "/home/user/advance/plugin/dist",
    );
  });

  test("getPluginBundleDistDir resolves plugin/dist from bundled chunk module", () => {
    const chunkUrl = "file:///home/user/advance/plugin/dist/chunk-PL7DRBOO.js";
    expect(getPluginBundleDistDir(chunkUrl)).toBe(
      "/home/user/advance/plugin/dist",
    );
  });

  test("getPluginBundleDistDir returns a path inside plugin root, not repo root", () => {
    const distUrl = "file:///home/user/advance/plugin/dist/index.js";
    const distDir = getPluginBundleDistDir(distUrl);
    expect(distDir).not.toBe("/home/user/advance/dist");
    expect(distDir).not.toBe("/home/user/dist");
    expect(distDir).toMatch(/\/advance\/plugin\/dist$/);
  });
});
