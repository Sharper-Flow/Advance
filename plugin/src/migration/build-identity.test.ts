/**
 * build-identity tests — immutable deployed-build identity (AC9/DDC5).
 *
 * The receipt binds to a content digest of the deployed `dist/` tree, not to
 * mtimes or prose: any content change (including a redeploy of "the same"
 * source rebuilt to different chunks) produces a different digest, and a
 * deployed tree whose recomputed digest differs from its recorded identity
 * file is stale and blocks cutover activation.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  BUILD_IDENTITY_FILENAME,
  computeBuildIdentity,
  readBuildIdentityFile,
  resolveOwnPluginRoot,
  verifyDeployedBuildIdentity,
  writeBuildIdentityFile,
} from "./build-identity";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
  tempDirs = [];
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await createTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

/** Create a minimal deployed-plugin-shaped tree: pluginRoot/dist/... */
function makePluginTree(root: string, files: Record<string, string>): string {
  const pluginRoot = join(root, "Advance", "plugin");
  for (const [rel, content] of Object.entries(files)) {
    const path = join(pluginRoot, "dist", rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  return pluginRoot;
}

const BASE_FILES: Record<string, string> = {
  "index.js": "export const plugin = 1;\n",
  "chunk-AAAA1111.js": "export const chunk = 1;\n",
  "mcp-server.js": "export const mcp = 1;\n",
};

describe("computeBuildIdentity", () => {
  test("digest is deterministic and covers every dist file recursively", async () => {
    const root = await tempDir("adv-bid-compute-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    const a = computeBuildIdentity(pluginRoot);
    const b = computeBuildIdentity(pluginRoot);
    expect(a.digest).toBe(b.digest);
    expect(a.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a.files.map((f) => f.path).sort()).toEqual([
      "chunk-AAAA1111.js",
      "index.js",
      "mcp-server.js",
    ]);
  });

  test("any content change changes the digest (immutability)", async () => {
    const root = await tempDir("adv-bid-mutate-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    const before = computeBuildIdentity(pluginRoot);
    writeFileSync(
      join(pluginRoot, "dist", "mcp-server.js"),
      "export const mcp = 2;\n",
    );
    const after = computeBuildIdentity(pluginRoot);
    expect(after.digest).not.toBe(before.digest);
  });

  test("throws when dist is absent", async () => {
    const root = await tempDir("adv-bid-nodist-");
    expect(() => computeBuildIdentity(join(root, "empty-plugin"))).toThrow(
      /dist/,
    );
  });
});

describe("writeBuildIdentityFile / readBuildIdentityFile", () => {
  test("writes a schema-valid identity file that round-trips", async () => {
    const root = await tempDir("adv-bid-write-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    const identity = writeBuildIdentityFile(pluginRoot, {
      now: new Date("2026-07-16T00:00:00.000Z"),
    });
    expect(identity.computedAt).toBe("2026-07-16T00:00:00.000Z");
    const read = readBuildIdentityFile(
      join(pluginRoot, "dist", BUILD_IDENTITY_FILENAME),
    );
    expect(read?.digest).toBe(identity.digest);
    expect(read?.schemaVersion).toBe(1);
  });

  test("identity file excludes itself from the digest", async () => {
    const root = await tempDir("adv-bid-self-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    const first = writeBuildIdentityFile(pluginRoot);
    const second = writeBuildIdentityFile(pluginRoot);
    expect(second.digest).toBe(first.digest);
  });

  test("returns null for missing or malformed identity files", async () => {
    const root = await tempDir("adv-bid-malformed-");
    expect(readBuildIdentityFile(join(root, "nope.json"))).toBeNull();
    const bad = join(root, "bad.json");
    writeFileSync(bad, "{ not json");
    expect(readBuildIdentityFile(bad)).toBeNull();
    writeFileSync(bad, JSON.stringify({ schemaVersion: 2, digest: "x" }));
    expect(readBuildIdentityFile(bad)).toBeNull();
  });
});

describe("verifyDeployedBuildIdentity", () => {
  test("match when recorded identity equals recomputed content", async () => {
    const root = await tempDir("adv-bid-verify-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    const written = writeBuildIdentityFile(pluginRoot);
    const result = verifyDeployedBuildIdentity(pluginRoot);
    expect(result.status).toBe("match");
    expect(result.identity?.digest).toBe(written.digest);
  });

  test("stale when deployed content drifted after identity was written", async () => {
    const root = await tempDir("adv-bid-verify-stale-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    writeBuildIdentityFile(pluginRoot);
    writeFileSync(join(pluginRoot, "dist", "index.js"), "/* patched */");
    const result = verifyDeployedBuildIdentity(pluginRoot);
    expect(result.status).toBe("stale");
  });

  test("missing when no identity file exists", async () => {
    const root = await tempDir("adv-bid-verify-missing-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    expect(verifyDeployedBuildIdentity(pluginRoot).status).toBe("missing");
  });

  test("malformed when identity file fails validation", async () => {
    const root = await tempDir("adv-bid-verify-malformed-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    writeFileSync(
      join(pluginRoot, "dist", BUILD_IDENTITY_FILENAME),
      JSON.stringify({ bogus: true }),
    );
    expect(verifyDeployedBuildIdentity(pluginRoot).status).toBe("malformed");
  });
});

describe("resolveOwnPluginRoot", () => {
  test("resolves from a bundled dist/index.js module URL", async () => {
    const root = await tempDir("adv-bid-ownroot-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    const url = new URL(`file://${join(pluginRoot, "dist", "index.js")}`).href;
    expect(resolveOwnPluginRoot(url)).toBe(pluginRoot);
  });

  test("resolves from a src/migration module URL in a dev checkout", async () => {
    const root = await tempDir("adv-bid-ownroot-src-");
    const pluginRoot = makePluginTree(root, BASE_FILES);
    const url = new URL(
      `file://${join(pluginRoot, "src", "migration", "build-identity.ts")}`,
    ).href;
    expect(resolveOwnPluginRoot(url)).toBe(pluginRoot);
  });

  test("returns null when no dist tree is discoverable", async () => {
    const root = await tempDir("adv-bid-ownroot-none-");
    const url = new URL(`file://${join(root, "src", "x.ts")}`).href;
    expect(resolveOwnPluginRoot(url)).toBeNull();
  });
});
