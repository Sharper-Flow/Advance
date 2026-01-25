/**
 * JSON Storage Tests
 *
 * Test file operations for specs and changes
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import {
  loadProjectConfig,
  saveProjectConfig,
  loadSpec,
  saveSpec,
  loadAllSpecs,
  loadChange,
  saveChange,
  loadAllChanges,
  createChangeScaffold,
  listSpecDirs,
  listChangeDirs,
  getProjectPaths,
  fileExists,
  resolveChangeId,
} from "./json";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  SAMPLE_SPEC,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import type { Spec, Change, ProjectConfig } from "../types";
import type { Spec, Change, ProjectConfig } from "../types";

describe("getProjectPaths", () => {
  test("returns default paths", () => {
    const paths = getProjectPaths("/project");
    expect(paths.root).toBe("/project");
    expect(paths.specs).toBe("/project/specs");
    expect(paths.changes).toBe("/project/changes");
    expect(paths.db).toBe("/project/.specdb");
  });

  test("respects custom config", () => {
    const paths = getProjectPaths("/project", {
      specs_dir: "custom/specs",
      db_dir: ".custom-db",
    });
    expect(paths.specs).toBe("/project/custom/specs");
    expect(paths.db).toBe("/project/.custom-db");
  });
});

describe("ProjectConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("loadProjectConfig returns null for missing file", async () => {
    const config = await loadProjectConfig(tempDir);
    expect(config).toBeNull();
  });

  test("saveProjectConfig creates config file", async () => {
    const config: ProjectConfig = {
      name: "test",
      specs_dir: "specs",
      changes_dir: "changes",
      archive_dir: "archive",
      docs_dir: "docs/specs",
      db_dir: ".specdb",
    };
    await saveProjectConfig(tempDir, config);

    const loaded = await loadProjectConfig(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("test");
  });
});

describe("Spec Operations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("listSpecDirs returns capability directories", async () => {
    const specsDir = join(tempDir, "specs");
    const dirs = await listSpecDirs(specsDir);
    expect(dirs).toContain("test-capability");
  });

  test("loadSpec loads spec from JSON", async () => {
    const specsDir = join(tempDir, "specs");
    const spec = await loadSpec(specsDir, "test-capability");

    expect(spec).not.toBeNull();
    expect(spec!.name).toBe("test-capability");
    expect(spec!.requirements).toHaveLength(2);
  });

  test("loadSpec returns null for missing spec", async () => {
    const specsDir = join(tempDir, "specs");
    const spec = await loadSpec(specsDir, "nonexistent");
    expect(spec).toBeNull();
  });

  test("saveSpec creates spec directory and file", async () => {
    const specsDir = join(tempDir, "specs");
    const newSpec: Spec = {
      ...SAMPLE_SPEC,
      name: "new-capability",
      title: "New Capability",
    };

    const path = await saveSpec(specsDir, newSpec);
    expect(path).toContain("new-capability/spec.json");

    const loaded = await loadSpec(specsDir, "new-capability");
    expect(loaded!.title).toBe("New Capability");
  });

  test("loadAllSpecs loads all specs", async () => {
    const specsDir = join(tempDir, "specs");

    // Add another spec
    await saveSpec(specsDir, { ...SAMPLE_SPEC, name: "second-cap" });

    const specs = await loadAllSpecs(specsDir);
    expect(specs.size).toBe(2);
    expect(specs.has("test-capability")).toBe(true);
    expect(specs.has("second-cap")).toBe(true);
  });
});

describe("Change Operations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("listChangeDirs returns change directories", async () => {
    const changesDir = join(tempDir, "changes");
    const dirs = await listChangeDirs(changesDir);
    expect(dirs).toContain("add-feature-abc123");
  });

  test("loadChange loads change from JSON", async () => {
    const changesDir = join(tempDir, "changes");
    const change = await loadChange(changesDir, "add-feature-abc123");

    expect(change).not.toBeNull();
    expect(change!.id).toBe("add-feature-abc123");
    expect(change!.tasks).toHaveLength(3);
  });

  test("loadChange returns null for missing change", async () => {
    const changesDir = join(tempDir, "changes");
    const change = await loadChange(changesDir, "nonexistent");
    expect(change).toBeNull();
  });

  test("saveChange creates change directory and file", async () => {
    const changesDir = join(tempDir, "changes");
    const newChange: Change = {
      ...SAMPLE_CHANGE,
      id: "new-change-xyz789",
      title: "New Change",
    };

    const path = await saveChange(changesDir, newChange);
    expect(path).toContain("new-change-xyz789/change.json");

    const loaded = await loadChange(changesDir, "new-change-xyz789");
    expect(loaded!.title).toBe("New Change");
  });

  test("loadAllChanges loads all changes", async () => {
    const changesDir = join(tempDir, "changes");

    // Add another change
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "second-change" });

    const changes = await loadAllChanges(changesDir);
    expect(changes.size).toBe(2);
  });
});

describe("resolveChangeId", () => {
  let tempDir: string;
  let changesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    changesDir = join(tempDir, "changes");

    // Create multiple changes for testing
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "add-feature-abc1" });
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "add-feature-xyz9" });
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "fix-bug-def2" });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("exact match returns the ID", async () => {
    const result = await resolveChangeId(changesDir, "add-feature-abc1");
    expect(result.id).toBe("add-feature-abc1");
    expect(result.candidates).toEqual(["add-feature-abc1"]);
  });

  test("suffix match with nanoid returns unique match", async () => {
    const result = await resolveChangeId(changesDir, "abc1");
    expect(result.id).toBe("add-feature-abc1");
  });

  test("suffix match with multiple candidates returns null", async () => {
    // Both add-feature-abc1 and add-feature-xyz9 match "add-feature-"
    const result = await resolveChangeId(changesDir, "add-feature");
    expect(result.id).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  test("prefix match returns unique match", async () => {
    const result = await resolveChangeId(changesDir, "fix-bug");
    expect(result.id).toBe("fix-bug-def2");
  });

  test("no match returns null with empty candidates", async () => {
    const result = await resolveChangeId(changesDir, "nonexistent");
    expect(result.id).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });
});

describe("createChangeScaffold", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("creates change directory with proposal.md", async () => {
    const changesDir = join(tempDir, "changes");
    const result = await createChangeScaffold(
      changesDir,
      "new-feature-abc123",
      "Add New Feature",
    );

    expect(result.proposalPath).toContain("proposal.md");
    expect(await fileExists(result.proposalPath)).toBe(true);

    const content = await readFile(result.proposalPath, "utf-8");
    expect(content).toContain("# Add New Feature");
    expect(content).toContain("## Summary");
    expect(content).toContain("## Acceptance Criteria");
  });
});

describe("fileExists", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("returns true for existing file", async () => {
    const path = join(tempDir, "test.txt");
    await writeFile(path, "content");
    expect(await fileExists(path)).toBe(true);
  });

  test("returns false for missing file", async () => {
    const path = join(tempDir, "missing.txt");
    expect(await fileExists(path)).toBe(false);
  });
});
