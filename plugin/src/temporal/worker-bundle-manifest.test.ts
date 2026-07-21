import { readdir, writeFile } from "fs/promises";
import { join } from "path";
import { afterEach, describe, expect, test } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/setup";
import {
  WORKER_BUNDLE_MANIFEST_FILENAME,
  readWorkerBundleGeneration,
  readWorkerBundleManifest,
  verifyWorkerArtifactPolicy,
  writeWorkerBundleManifest,
} from "./worker-bundle-manifest";

const NOW = new Date("2026-07-15T00:00:00.000Z");

describe("worker bundle manifest", () => {
  let tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
    tempDirs = [];
  });

  const tempBundleDir = async (withBundles = true) => {
    const dir = await createTempDir("worker-bundle-manifest-");
    tempDirs.push(dir);
    if (withBundles) {
      await writeFile(join(dir, "worker.js"), "// worker bundle v1\n");
      await writeFile(join(dir, "workflows.js"), "// workflows bundle v1\n");
    }
    return dir;
  };

  test("write produces a manifest with sha256 hashes and a generation", async () => {
    const dir = await tempBundleDir();

    const manifest = await writeWorkerBundleManifest(dir, { now: () => NOW });

    expect(manifest.schema_version).toBe(1);
    expect(manifest.built_at).toBe(NOW.toISOString());
    expect(manifest.files["worker.js"]).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files["workflows.js"]).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.generation).toMatch(/^[0-9a-f]{64}$/);
  });

  test("write is atomic via temp+rename and leaves no temp files", async () => {
    const dir = await tempBundleDir();

    await writeWorkerBundleManifest(dir, { now: () => NOW });

    const entries = await readdir(dir);
    expect(entries).toContain(WORKER_BUNDLE_MANIFEST_FILENAME);
    expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  test("generation covers BOTH worker.js and workflows.js", async () => {
    const dir = await tempBundleDir();
    const first = await writeWorkerBundleManifest(dir, { now: () => NOW });

    // Change only workflows.js — generation must change (worker.js alone
    // is never sufficient to define the generation).
    await writeFile(join(dir, "workflows.js"), "// workflows bundle v2\n");
    const second = await writeWorkerBundleManifest(dir, { now: () => NOW });
    expect(second.generation).not.toBe(first.generation);
    expect(second.files["worker.js"]).toBe(first.files["worker.js"]);

    await writeFile(join(dir, "worker.js"), "// worker bundle v2\n");
    const third = await writeWorkerBundleManifest(dir, { now: () => NOW });
    expect(third.generation).not.toBe(second.generation);
  });

  test("same bundle contents produce the same generation", async () => {
    const dir = await tempBundleDir();
    const first = await writeWorkerBundleManifest(dir, {
      now: () => new Date("2026-07-15T00:00:00.000Z"),
    });
    const second = await writeWorkerBundleManifest(dir, {
      now: () => new Date("2026-07-15T01:00:00.000Z"),
    });

    expect(second.generation).toBe(first.generation);
  });

  test("write refuses when worker.js or workflows.js is missing", async () => {
    const dir = await tempBundleDir(false);
    await writeFile(join(dir, "worker.js"), "// worker only\n");

    await expect(writeWorkerBundleManifest(dir)).rejects.toThrow(
      /workflows\.js/,
    );
    await expect(readWorkerBundleGeneration(dir)).resolves.toBeNull();
  });

  test("read round-trips a written manifest", async () => {
    const dir = await tempBundleDir();
    const written = await writeWorkerBundleManifest(dir, { now: () => NOW });

    await expect(readWorkerBundleManifest(dir)).resolves.toEqual(written);
    await expect(readWorkerBundleGeneration(dir)).resolves.toBe(
      written.generation,
    );
  });

  test("read returns null for missing or malformed manifests", async () => {
    const missingDir = await tempBundleDir();
    await expect(readWorkerBundleManifest(missingDir)).resolves.toBeNull();

    const malformedDir = await tempBundleDir();
    await writeFile(
      join(malformedDir, WORKER_BUNDLE_MANIFEST_FILENAME),
      JSON.stringify({ schema_version: 1, generation: 42 }),
    );
    await expect(readWorkerBundleManifest(malformedDir)).resolves.toBeNull();
    await expect(readWorkerBundleGeneration(malformedDir)).resolves.toBeNull();
  });

  test("production verification rehashes artifacts and returns canonical workflows path", async () => {
    const dir = await tempBundleDir();
    const manifest = await writeWorkerBundleManifest(dir, { now: () => NOW });

    await expect(
      verifyWorkerArtifactPolicy({
        policy: { mode: "production_verified", bundleDir: dir },
      }),
    ).resolves.toEqual({
      status: "verified",
      generation: manifest.generation,
      artifactHashes: manifest.files,
      workflowsPath: join(dir, "workflows.js"),
    });
  });

  test("production verification fails closed for stale artifacts and overrides", async () => {
    const dir = await tempBundleDir();
    await writeWorkerBundleManifest(dir, { now: () => NOW });
    await writeFile(join(dir, "workflows.js"), "// stale workflows\n");

    await expect(
      verifyWorkerArtifactPolicy({
        policy: { mode: "production_verified", bundleDir: dir },
      }),
    ).rejects.toMatchObject({ code: "WORKER_BUNDLE_STALE" });

    await writeWorkerBundleManifest(dir, { now: () => NOW });
    await expect(
      verifyWorkerArtifactPolicy({
        policy: { mode: "production_verified", bundleDir: dir },
        workflowsPath: join(dir, "other-workflows.js"),
      }),
    ).rejects.toMatchObject({ code: "WORKER_BUNDLE_STALE" });
  });

  test("development policy requires an explicit source path and rationale", async () => {
    const dir = await tempBundleDir();
    const workflowsPath = join(dir, "workflows.ts");

    await expect(
      verifyWorkerArtifactPolicy({
        policy: { mode: "development_source", rationale: "unit test" },
        workflowsPath,
      }),
    ).resolves.toEqual({ status: "development", workflowsPath });
  });
});
