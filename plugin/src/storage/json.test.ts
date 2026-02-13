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
import type { Spec, ProjectConfig } from "../types";

describe("getProjectPaths", () => {
  test("returns default paths (no external root — legacy fallback)", () => {
    const paths = getProjectPaths("/project");
    expect(paths.root).toBe("/project");
    expect(paths.specs).toBe("/project/.adv/specs");
    expect(paths.changes).toBe("/project/.adv/changes");
    expect(paths.archive).toBe("/project/.adv/archive");
    expect(paths.db).toBe("/project/.adv/db");
    expect(paths.wisdom).toBe("/project/.adv/wisdom.jsonl");
    expect(paths.agenda).toBe("/project/.adv/agenda.jsonl");
    expect(paths.handoff).toBe("/project/.adv/handoff.json");
    expect(paths.external).toBeNull();
  });

  test("respects custom config", () => {
    const paths = getProjectPaths("/project", {
      specs_dir: "custom/specs",
      db_dir: ".custom-db",
    });
    expect(paths.specs).toBe("/project/custom/specs");
    expect(paths.db).toBe("/project/.custom-db");
  });

  test("uses external root for mutable paths when provided", () => {
    const paths = getProjectPaths("/project", undefined, {
      externalRoot: "/ext/data/abc123",
    });
    // Immutable paths stay in-repo
    expect(paths.root).toBe("/project");
    expect(paths.specs).toBe("/project/.adv/specs");
    expect(paths.docs).toBe("/project/docs/specs");
    expect(paths.config).toBe("/project/project.json");
    // Mutable paths go external
    expect(paths.changes).toBe("/ext/data/abc123/changes");
    expect(paths.archive).toBe("/ext/data/abc123/archive");
    expect(paths.db).toBe("/ext/data/abc123/db");
    expect(paths.wisdom).toBe("/ext/data/abc123/wisdom.jsonl");
    expect(paths.agenda).toBe("/ext/data/abc123/agenda.jsonl");
    expect(paths.handoff).toBe("/ext/data/abc123/handoff.json");
    expect(paths.external).toBe("/ext/data/abc123");
  });

  test("external root with custom config uses config subdirectory names", () => {
    const paths = getProjectPaths(
      "/project",
      { changes_dir: "my-changes", db_dir: "my-db" },
      { externalRoot: "/ext/data/abc123" },
    );
    // Custom subdirectory names applied within external root
    expect(paths.changes).toBe("/ext/data/abc123/my-changes");
    expect(paths.db).toBe("/ext/data/abc123/my-db");
    // Specs still in-repo (unaffected by external)
    expect(paths.specs).toBe("/project/.adv/specs");
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
      specs_dir: ".adv/specs",
      changes_dir: ".adv/changes",
      archive_dir: ".adv/archive",
      docs_dir: "docs/specs",
      db_dir: ".adv/db",
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
    const specsDir = join(tempDir, ".adv/specs");
    const dirs = await listSpecDirs(specsDir);
    expect(dirs).toContain("test-capability");
  });

  test("loadSpec loads spec from JSON", async () => {
    const specsDir = join(tempDir, ".adv/specs");
    const result = await loadSpec(specsDir, "test-capability");

    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.name).toBe("test-capability");
    expect(result.data!.requirements).toHaveLength(2);
  });

  test("loadSpec returns success with null data for missing spec", async () => {
    const specsDir = join(tempDir, ".adv/specs");
    const result = await loadSpec(specsDir, "nonexistent");
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  test("saveSpec creates spec directory and file", async () => {
    const specsDir = join(tempDir, ".adv/specs");
    const newSpec: Spec = {
      ...SAMPLE_SPEC,
      name: "new-capability",
      title: "New Capability",
    };

    const path = await saveSpec(specsDir, newSpec);
    expect(path).toContain("new-capability/spec.json");

    const result = await loadSpec(specsDir, "new-capability");
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe("New Capability");
  });

  test("loadAllSpecs loads all specs", async () => {
    const specsDir = join(tempDir, ".adv/specs");

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
    const changesDir = join(tempDir, ".adv/changes");
    const dirs = await listChangeDirs(changesDir);
    expect(dirs).toContain("addFeature");
  });

  test("loadChange loads change from JSON", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const result = await loadChange(changesDir, "addFeature");

    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.id).toBe("addFeature");
    expect(result.data!.tasks).toHaveLength(3);
  });

  test("loadChange returns success with null data for missing change", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const result = await loadChange(changesDir, "nonexistent");
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  test("loadChange handles malformed JSON", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const changePath = join(changesDir, "addFeature/change.json");
    await writeFile(changePath, "invalid json");

    const result = await loadChange(changesDir, "addFeature");
    expect(result.success).toBe(false);
    expect(result.type).toBe("read_error");
  });

  test("saveChange writes change to JSON", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const change = { ...SAMPLE_CHANGE, id: "newFeature" };
    await saveChange(changesDir, change);

    const result = await loadChange(changesDir, "newFeature");
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe("newFeature");
  });

  test("loadAllChanges loads all changes", async () => {
    const changesDir = join(tempDir, ".adv/changes");

    // Add another change
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "secondFeature" });

    const changes = await loadAllChanges(changesDir);
    expect(changes.size).toBe(2);
  });
});

describe("resolveChangeId", () => {
  let tempDir: string;
  let changesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    changesDir = join(tempDir, ".adv/changes");

    // Create multiple changes for testing
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "addFeature" });
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "fixLoginBug" });
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "add-kebab-1234" });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("exact match returns the ID", async () => {
    const result = await resolveChangeId(changesDir, "addFeature");
    expect(result.id).toBe("addFeature");
    expect(result.candidates).toEqual(["addFeature"]);
  });

  test("prefix match returns unique match", async () => {
    const result = await resolveChangeId(changesDir, "fixLog");
    expect(result.id).toBe("fixLoginBug");
  });

  test("case-insensitive prefix match returns unique match", async () => {
    const result = await resolveChangeId(changesDir, "addfeature");
    expect(result.id).toBe("addFeature");
  });

  test("suffix match no longer works", async () => {
    const result = await resolveChangeId(changesDir, "1234");
    expect(result.id).toBeNull();
  });

  test("ambiguous prefix match returns exact if present", async () => {
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "addFeatureProfile" });
    const result = await resolveChangeId(changesDir, "addFeature");
    expect(result.id).toBe("addFeature");
  });

  test("ambiguous prefix (non-exact) returns null with candidates", async () => {
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "addFeatureProfile" });
    const result = await resolveChangeId(changesDir, "addFeat");
    expect(result.id).toBeNull();
    expect(result.candidates).toHaveLength(2);
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
      "newFeature",
      "Add New Feature",
    );

    expect(result.proposalPath).toContain("proposal.md");
    expect(await fileExists(result.proposalPath)).toBe(true);

    const content = await readFile(result.proposalPath, "utf-8");
    expect(content).toContain("# Add New Feature");
  });

  test("proposal template includes all 8 required sections", async () => {
    const changesDir = join(tempDir, "changes");
    const result = await createChangeScaffold(
      changesDir,
      "testSections",
      "Test All Sections",
    );

    const content = await readFile(result.proposalPath, "utf-8");

    // All 8 sections from the structured proposal template
    expect(content).toContain("## Why");
    expect(content).toContain("## What Changes");
    expect(content).toContain("## Success Criteria");
    expect(content).toContain("## Affected Code");
    expect(content).toContain("## Constraints");
    expect(content).toContain("## Impact");
    expect(content).toContain("## Risks");
    expect(content).toContain("## Validation Plan");
  });

  test("proposal template includes actionable placeholder guidance", async () => {
    const changesDir = join(tempDir, "changes");
    const result = await createChangeScaffold(
      changesDir,
      "testGuidance",
      "Test Guidance Content",
    );

    const content = await readFile(result.proposalPath, "utf-8");

    // Validation Plan should mention TDD
    expect(content).toMatch(/TDD|test.*first|red.*green/i);
    // Success Criteria should have checklist items
    expect(content).toContain("- [ ]");
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
