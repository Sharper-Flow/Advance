/**
 * Project Metadata Storage Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join, dirname } from "path";
import { writeFile, mkdir } from "fs/promises";
import {
  getProjectMetadataPath,
  readProjectMetadata,
  writeProjectMetadataEntry,
} from "./project-metadata";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";

describe("getProjectMetadataPath", () => {
  test("returns default path without override", () => {
    const path = getProjectMetadataPath("/project");
    expect(path).toBe("/project/.adv/project-metadata.json");
  });

  test("returns override path when provided", () => {
    const path = getProjectMetadataPath("/project", "/ext/meta.json");
    expect(path).toBe("/ext/meta.json");
  });
});

describe("readProjectMetadata", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("returns empty object when file is missing", async () => {
    const result = await readProjectMetadata(tempDir);
    expect(result).toEqual({});
  });

  test("returns empty object when file is empty", async () => {
    const path = join(tempDir, ".adv", "project-metadata.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "", "utf-8");
    const result = await readProjectMetadata(tempDir);
    expect(result).toEqual({});
  });

  test("reads valid entries", async () => {
    const path = join(tempDir, ".adv", "project-metadata.json");
    await mkdir(dirname(path), { recursive: true });
    const data = {
      "slop-scan": {
        key: "slop-scan",
        timestamp: "2026-04-23T00:00:00Z",
        count: 3,
        summary: "3 findings",
        written_by: "agent",
      },
    };
    await writeFile(path, JSON.stringify(data, null, 2), "utf-8");

    const result = await readProjectMetadata(tempDir);
    expect(result["slop-scan"]).toBeDefined();
    expect(result["slop-scan"].count).toBe(3);
    expect(result["slop-scan"].summary).toBe("3 findings");
  });

  test("skips invalid entries and keeps valid ones", async () => {
    const path = join(tempDir, ".adv", "project-metadata.json");
    await mkdir(dirname(path), { recursive: true });
    const data = {
      valid: {
        key: "valid",
        timestamp: "2026-04-23T00:00:00Z",
        count: 1,
        summary: "ok",
      },
      invalid: {
        key: "invalid",
        timestamp: "2026-04-23T00:00:00Z",
        count: -1, // invalid: negative
        summary: "bad",
      },
    };
    await writeFile(path, JSON.stringify(data, null, 2), "utf-8");

    const result = await readProjectMetadata(tempDir);
    expect(result.valid).toBeDefined();
    expect(result.invalid).toBeUndefined();
  });

  test("returns empty object for corrupt JSON", async () => {
    const path = join(tempDir, ".adv", "project-metadata.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{ not json }", "utf-8");

    const result = await readProjectMetadata(tempDir);
    expect(result).toEqual({});
  });

  test("returns empty object for non-object root (array)", async () => {
    const path = join(tempDir, ".adv", "project-metadata.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "[]", "utf-8");

    const result = await readProjectMetadata(tempDir);
    expect(result).toEqual({});
  });

  test("uses override path when provided", async () => {
    const extPath = join(tempDir, "external", "project-metadata.json");
    await mkdir(dirname(extPath), { recursive: true });
    const data = {
      "arch-scan": {
        key: "arch-scan",
        timestamp: "2026-04-23T00:00:00Z",
        count: 0,
        summary: "no findings",
      },
    };
    await writeFile(extPath, JSON.stringify(data, null, 2), "utf-8");

    const result = await readProjectMetadata(tempDir, extPath);
    expect(result["arch-scan"]).toBeDefined();
  });
});

describe("writeProjectMetadataEntry", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("creates file and writes entry", async () => {
    const entry = {
      key: "slop-scan",
      timestamp: "2026-04-23T00:00:00Z",
      count: 3,
      summary: "3 findings",
      written_by: "agent" as const,
    };

    await writeProjectMetadataEntry(tempDir, entry);

    const result = await readProjectMetadata(tempDir);
    expect(result["slop-scan"]).toEqual(entry);
  });

  test("upserts existing entry with same key", async () => {
    const entry1 = {
      key: "slop-scan",
      timestamp: "2026-04-23T00:00:00Z",
      count: 3,
      summary: "3 findings",
      written_by: "agent" as const,
    };
    const entry2 = {
      key: "slop-scan",
      timestamp: "2026-04-23T01:00:00Z",
      count: 5,
      summary: "5 findings",
      written_by: "agent" as const,
    };

    await writeProjectMetadataEntry(tempDir, entry1);
    await writeProjectMetadataEntry(tempDir, entry2);

    const result = await readProjectMetadata(tempDir);
    expect(result["slop-scan"].count).toBe(5);
    expect(result["slop-scan"].summary).toBe("5 findings");
  });

  test("preserves other entries during upsert", async () => {
    const entry1 = {
      key: "slop-scan",
      timestamp: "2026-04-23T00:00:00Z",
      count: 3,
      summary: "3 findings",
      written_by: "agent" as const,
    };
    const entry2 = {
      key: "arch-scan",
      timestamp: "2026-04-23T00:00:00Z",
      count: 0,
      summary: "no findings",
      written_by: "agent" as const,
    };

    await writeProjectMetadataEntry(tempDir, entry1);
    await writeProjectMetadataEntry(tempDir, entry2);

    const result = await readProjectMetadata(tempDir);
    expect(result["slop-scan"]).toBeDefined();
    expect(result["arch-scan"]).toBeDefined();
  });

  test("uses override path when provided", async () => {
    const extPath = join(tempDir, "external", "project-metadata.json");
    const entry = {
      key: "comp-scan",
      timestamp: "2026-04-23T00:00:00Z",
      count: 2,
      summary: "2 competitors analyzed",
      written_by: "agent" as const,
    };

    await writeProjectMetadataEntry(tempDir, entry, extPath);

    const result = await readProjectMetadata(tempDir, extPath);
    expect(result["comp-scan"]).toEqual(entry);
  });

  test("concurrent writes are safe (lock prevents corruption)", async () => {
    const entry = {
      key: "test",
      timestamp: "2026-04-23T00:00:00Z",
      count: 1,
      summary: "test",
      written_by: "agent" as const,
    };

    // Run multiple writes concurrently
    const promises = Array.from({ length: 10 }, (_, i) =>
      writeProjectMetadataEntry(tempDir, {
        ...entry,
        count: i,
        summary: `write ${i}`,
      }),
    );

    await Promise.all(promises);

    // File should still be valid JSON and contain one of the writes
    const result = await readProjectMetadata(tempDir);
    expect(result.test).toBeDefined();
    expect(result.test.key).toBe("test");
  });

  test("returns the written entry", async () => {
    const entry = {
      key: "slop-scan",
      timestamp: "2026-04-23T00:00:00Z",
      count: 3,
      summary: "3 findings",
      written_by: "agent" as const,
    };

    const result = await writeProjectMetadataEntry(tempDir, entry);
    expect(result).toEqual(entry);
  });
});
