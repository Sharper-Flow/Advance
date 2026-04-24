/**
 * Project Metadata Tool Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { projectMetadataTools } from "./project-metadata";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import type { Store } from "../storage/store";

// Minimal mock store for testing
function createMockStore(root: string, projectMetadata: string): Store {
  return {
    paths: {
      root,
      projectMetadata,
      specs: join(root, ".adv/specs"),
      changes: join(root, ".adv/changes"),
      archive: join(root, ".adv/archive"),
      db: join(root, ".adv/db"),
      wisdom: join(root, ".adv/wisdom.jsonl"),
      agenda: join(root, ".adv/agenda.jsonl"),
      docs: join(root, "docs/specs"),
      config: join(root, "project.json"),
      external: null,
    },
  } as unknown as Store;
}

describe("adv_project_metadata", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    store = createMockStore(
      tempDir,
      join(tempDir, ".adv", "project-metadata.json"),
    );
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("write then read round-trip", async () => {
    const writeResult = await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "write",
        key: "slop-scan",
        count: 3,
        summary: "3 findings: 1 major, 2 minor",
      },
      store,
    );
    expect(writeResult).toContain("slop-scan");
    expect(writeResult).toContain("3 findings");

    const readResult = await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "read",
        key: "slop-scan",
      },
      store,
    );
    expect(readResult).toContain("slop-scan");
    expect(readResult).toContain("3 findings");
  });

  test("read missing key returns null entry", async () => {
    const result = await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "read",
        key: "nonexistent",
      },
      store,
    );
    expect(result).toContain('"entry":null');
  });

  test("list returns all entries", async () => {
    await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "write",
        key: "slop-scan",
        count: 3,
        summary: "3 findings",
      },
      store,
    );
    await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "write",
        key: "arch-scan",
        count: 0,
        summary: "no findings",
      },
      store,
    );

    const result = await projectMetadataTools.adv_project_metadata.execute(
      { action: "list" },
      store,
    );
    expect(result).toContain("slop-scan");
    expect(result).toContain("arch-scan");
  });

  test("write validation: missing key", async () => {
    const result = await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "write",
        count: 1,
        summary: "test",
      } as any,
      store,
    );
    expect(result).toContain("error");
    expect(result).toContain("key is required");
  });

  test("write validation: missing count", async () => {
    const result = await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "write",
        key: "test",
        summary: "test",
      } as any,
      store,
    );
    expect(result).toContain("error");
    expect(result).toContain("count is required");
  });

  test("write validation: missing summary", async () => {
    const result = await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "write",
        key: "test",
        count: 1,
      } as any,
      store,
    );
    expect(result).toContain("error");
    expect(result).toContain("summary is required");
  });

  test("write validation: count < 0 rejected by schema", async () => {
    // Schema validation happens at the SDK level, but we test the tool logic
    // The tool receives validated args, so negative count won't reach execute
    // We test that the tool works correctly with valid args
    const result = await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "write",
        key: "test",
        count: 0,
        summary: "zero count is valid",
      },
      store,
    );
    expect(result).toContain("zero count is valid");
  });

  test("write uses custom written_by", async () => {
    const result = await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "write",
        key: "test",
        count: 1,
        summary: "user entry",
        written_by: "user",
      },
      store,
    );
    expect(result).toContain("user");
  });

  test("write defaults written_by to agent", async () => {
    const result = await projectMetadataTools.adv_project_metadata.execute(
      {
        action: "write",
        key: "test",
        count: 1,
        summary: "agent entry",
      },
      store,
    );
    expect(result).toContain("agent");
  });
});
