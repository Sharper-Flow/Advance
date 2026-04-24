/**
 * JSON Storage Tests
 *
 * Test file operations for specs and changes
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import {
  loadProjectConfig,
  loadProjectConfigWithDiagnostics,
  loadProposalWithFallback,
  saveProjectConfig,
  loadSpec,
  saveSpec,
  loadAllSpecs,
  loadChange,
  saveChange,
  loadAllChanges,
  createChangeScaffold,
  updateChangeArtifacts,
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
    expect(paths.projectMetadata).toBe("/project/.adv/project-metadata.json");
    expect("handoff" in paths).toBe(false);
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
    expect(paths.projectMetadata).toBe("/ext/data/abc123/project-metadata.json");
    expect("handoff" in paths).toBe(false);
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

  test("loadProjectConfig throws on malformed JSON", async () => {
    const configPath = join(tempDir, "project.json");
    await writeFile(configPath, "{ not valid json !!!", "utf-8");
    await expect(loadProjectConfig(tempDir)).rejects.toThrow();
  });

  test("loadProjectConfig returns null on schema-invalid JSON (legacy fallback)", async () => {
    // Schema failures must NOT abort plugin init. loadProjectConfig returns
    // null so callers fall back to defaults; use loadProjectConfigWithDiagnostics
    // for structured error reporting.
    const configPath = join(tempDir, "project.json");
    await writeFile(
      configPath,
      JSON.stringify({ totally: "wrong", schema: true }),
      "utf-8",
    );
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    try {
      const config = await loadProjectConfig(tempDir);
      expect(config).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("schema validation"),
      );
    } finally {
      warnSpy.mockRestore();
    }
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

describe("loadProjectConfigWithDiagnostics", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("returns not_found when project.json is missing", async () => {
    const result = await loadProjectConfigWithDiagnostics(tempDir);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.type).toBe("not_found");
    }
  });

  test("returns success with parsed config for valid project.json", async () => {
    await writeFile(
      join(tempDir, "project.json"),
      JSON.stringify({ name: "my-project" }),
    );
    const result = await loadProjectConfigWithDiagnostics(tempDir);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("my-project");
      expect(result.data.features.tdd_enforcement).toBe("strict");
    }
  });

  test("returns schema_error with actionable message for invalid project.json", async () => {
    await writeFile(
      join(tempDir, "project.json"),
      JSON.stringify({ name: 123 }), // name must be string
    );
    const result = await loadProjectConfigWithDiagnostics(tempDir);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.type).toBe("schema_error");
      expect(result.error).toContain("name");
    }
  });

  test("returns schema_error for invalid features.tdd_enforcement value", async () => {
    await writeFile(
      join(tempDir, "project.json"),
      JSON.stringify({
        name: "test",
        features: { tdd_enforcement: "invalid" },
      }),
    );
    const result = await loadProjectConfigWithDiagnostics(tempDir);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.type).toBe("schema_error");
      expect(result.error).toContain("tdd_enforcement");
    }
  });

  test("returns read_error for malformed JSON", async () => {
    await writeFile(join(tempDir, "project.json"), "{ not valid json }");
    const result = await loadProjectConfigWithDiagnostics(tempDir);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.type).toBe("read_error");
    }
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

  test("loadChange rewrites legacy gate statuses and removes migration fields before validation", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const changePath = join(changesDir, "addFeature/change.json");
    const raw = JSON.parse(await readFile(changePath, "utf-8"));

    raw.gates = {
      proposal: {
        status: "legacy",
        completed_at: "2026-01-01T00:00:00Z",
        completed_by: "migration",
        migrated_from: "research",
        absorbed_completions: [
          {
            gate_id: "signoff",
            status: "legacy",
            completed_at: "2026-01-01T00:00:00Z",
            completed_by: "migration",
          },
        ],
      },
      discovery: { status: "pending" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    };

    await writeFile(changePath, JSON.stringify(raw, null, 2));

    const result = await loadChange(changesDir, "addFeature");
    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.gates.proposal.status).toBe("done");
    expect(
      (result.data!.gates.proposal as Record<string, unknown>).migrated_from,
    ).toBeUndefined();
    expect(
      (result.data!.gates.proposal as Record<string, unknown>)
        .absorbed_completions,
    ).toBeUndefined();

    const rewritten = JSON.parse(await readFile(changePath, "utf-8"));
    expect(rewritten.gates.proposal.status).toBe("done");
    expect(rewritten.gates.proposal.migrated_from).toBeUndefined();
    expect(rewritten.gates.proposal.absorbed_completions).toBeUndefined();
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

  test("uses provided proposal content when supplied", async () => {
    const changesDir = join(tempDir, "changes");
    const customProposal =
      "# Custom Contract\n\n## Intent\n\nTool-driven writes only.";
    const result = await createChangeScaffold(
      changesDir,
      "customProposal",
      "Ignored Title",
      customProposal,
    );

    const content = await readFile(result.proposalPath, "utf-8");
    expect(content).toBe(customProposal);
  });

  test("writes problem-statement.md when problemStatement is provided", async () => {
    const changesDir = join(tempDir, "changes");
    const problemStatement =
      "PROBLEM\n  The widget is broken.\n\nDESIRED OUTCOME\n  The widget works.";
    const result = await createChangeScaffold(
      changesDir,
      "withProblemStatement",
      "Test Problem Statement",
      undefined,
      problemStatement,
    );

    expect(result.problemStatementPath).toContain("problem-statement.md");
    expect(await fileExists(result.problemStatementPath)).toBe(true);

    const content = await readFile(result.problemStatementPath, "utf-8");
    expect(content).toBe(problemStatement);
  });

  test("does not write problem-statement.md when problemStatement is omitted", async () => {
    const changesDir = join(tempDir, "changes");
    const result = await createChangeScaffold(
      changesDir,
      "withoutProblemStatement",
      "No Problem Statement",
    );

    expect(result.problemStatementPath).toBeUndefined();
    const psPath = join(
      changesDir,
      "withoutProblemStatement",
      "problem-statement.md",
    );
    expect(await fileExists(psPath)).toBe(false);
  });
});

describe("updateChangeArtifacts", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("overwrites proposal.md and writes problem-statement.md for existing change", async () => {
    const changesDir = join(tempDir, "changes");
    // First create a change scaffold
    await createChangeScaffold(changesDir, "testChange", "Test Change");

    // Now update it
    const newProposal = "# Updated Proposal\n\n## Why\n\nBecause reasons.";
    const newProblemStatement = "PROBLEM\n  Updated problem.";
    const result = await updateChangeArtifacts(
      changesDir,
      "testChange",
      newProposal,
      newProblemStatement,
    );

    expect(result.proposalPath).toContain("proposal.md");
    expect(result.problemStatementPath).toContain("problem-statement.md");

    const proposalContent = await readFile(result.proposalPath, "utf-8");
    expect(proposalContent).toBe(newProposal);

    const psContent = await readFile(result.problemStatementPath, "utf-8");
    expect(psContent).toBe(newProblemStatement);
  });

  test("returns error for nonexistent change directory", async () => {
    const changesDir = join(tempDir, "changes");
    const result = await updateChangeArtifacts(
      changesDir,
      "nonExistentChange",
      "proposal content",
      "problem statement content",
    );

    expect(result.error).toBeDefined();
    expect(result.error).toContain("nonExistentChange");
  });

  test("does not modify change.json when updating artifacts", async () => {
    const changesDir = join(tempDir, "changes");
    await createChangeScaffold(changesDir, "preserveJson", "Preserve JSON");

    // Write a change.json manually
    const changePath = join(changesDir, "preserveJson", "change.json");
    const originalJson = JSON.stringify({
      id: "preserveJson",
      title: "Preserve JSON",
      status: "draft",
      tasks: [{ id: "tk-test", title: "A task" }],
      deltas: {},
    });
    await writeFile(changePath, originalJson);

    // Update artifacts
    await updateChangeArtifacts(
      changesDir,
      "preserveJson",
      "# New proposal",
      "New problem statement",
    );

    // change.json must be untouched
    const afterJson = await readFile(changePath, "utf-8");
    expect(afterJson).toBe(originalJson);
  });

  test("updates only proposal.md when problemStatement is omitted", async () => {
    const changesDir = join(tempDir, "changes");
    await createChangeScaffold(
      changesDir,
      "proposalOnly",
      "Proposal Only",
      "# Original proposal",
      "Original problem statement",
    );

    const result = await updateChangeArtifacts(
      changesDir,
      "proposalOnly",
      "# Updated proposal only",
    );

    expect(result.proposalPath).toContain("proposal.md");
    expect(result.problemStatementPath).toBeUndefined();
    expect(result.error).toBeUndefined();

    const proposalContent = await readFile(result.proposalPath!, "utf-8");
    expect(proposalContent).toBe("# Updated proposal only");

    // problem-statement.md should be unchanged
    const psPath = join(changesDir, "proposalOnly", "problem-statement.md");
    const psContent = await readFile(psPath, "utf-8");
    expect(psContent).toBe("Original problem statement");
  });

  test("updates only problem-statement.md when proposal is omitted", async () => {
    const changesDir = join(tempDir, "changes");
    await createChangeScaffold(
      changesDir,
      "psOnly",
      "PS Only",
      "# Original proposal",
      "Original problem statement",
    );

    const result = await updateChangeArtifacts(
      changesDir,
      "psOnly",
      undefined,
      "Updated problem statement only",
    );

    expect(result.proposalPath).toBeUndefined();
    expect(result.problemStatementPath).toContain("problem-statement.md");
    expect(result.error).toBeUndefined();

    // proposal.md should be unchanged
    const proposalPath = join(changesDir, "psOnly", "proposal.md");
    const proposalContent = await readFile(proposalPath, "utf-8");
    expect(proposalContent).toBe("# Original proposal");

    const psContent = await readFile(result.problemStatementPath!, "utf-8");
    expect(psContent).toBe("Updated problem statement only");
  });

  test("returns empty result when both params are omitted", async () => {
    const changesDir = join(tempDir, "changes");
    await createChangeScaffold(changesDir, "noop", "Noop");

    const result = await updateChangeArtifacts(changesDir, "noop");

    expect(result.proposalPath).toBeUndefined();
    expect(result.problemStatementPath).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  test("overwrites existing proposal.md content completely", async () => {
    const changesDir = join(tempDir, "changes");
    await createChangeScaffold(
      changesDir,
      "overwriteTest",
      "Overwrite Test",
      "# Original proposal content",
      "Original problem statement",
    );

    const result = await updateChangeArtifacts(
      changesDir,
      "overwriteTest",
      "# Completely new proposal",
      "Completely new problem statement",
    );

    const proposalContent = await readFile(result.proposalPath!, "utf-8");
    expect(proposalContent).toBe("# Completely new proposal");
    expect(proposalContent).not.toContain("Original");

    const psContent = await readFile(result.problemStatementPath!, "utf-8");
    expect(psContent).toBe("Completely new problem statement");
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

describe("loadProposalWithFallback", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("returns content when proposal.md exists", async () => {
    const proposalPath = join(tempDir, "proposal.md");
    await writeFile(proposalPath, "# My Proposal\n\nSome content.");

    const result = await loadProposalWithFallback(tempDir, "My Change");
    expect(result.content).toContain("My Proposal");
    expect(result.warning).toBeUndefined();
  });

  test("returns scaffold and warning when proposal.md is missing", async () => {
    const result = await loadProposalWithFallback(tempDir, "My Change");
    expect(result.content).toContain("My Change");
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("proposal.md");
  });

  test("returns scaffold and warning when proposal.md is empty", async () => {
    const proposalPath = join(tempDir, "proposal.md");
    await writeFile(proposalPath, "   \n  ");

    const result = await loadProposalWithFallback(tempDir, "My Change");
    expect(result.content).toContain("My Change");
    expect(result.warning).toBeDefined();
  });

  test("scaffold content includes change title", async () => {
    const result = await loadProposalWithFallback(tempDir, "Fix Login Bug");
    expect(result.content).toContain("Fix Login Bug");
  });

  test("never throws — always returns a result", async () => {
    // Even with a completely invalid path, should not throw
    const result = await loadProposalWithFallback("/nonexistent/path", "Test");
    expect(result.content).toBeDefined();
    expect(result.warning).toBeDefined();
  });
});

// =============================================================================
// Agreement.md and Design.md artifact support
// =============================================================================

describe("createChangeScaffold with agreement and design", () => {
  let changesDir: string;

  beforeEach(async () => {
    changesDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(changesDir);
  });

  test("writes agreement.md when agreementContent is provided", async () => {
    const result = await createChangeScaffold(
      changesDir,
      "testAgreement",
      "Test Agreement",
      undefined,
      undefined,
      "# Agreement\n\nObjectives here.",
    );
    expect(result.agreementPath).toContain("agreement.md");
    const content = await readFile(result.agreementPath!, "utf-8");
    expect(content).toContain("Agreement");
    expect(content).toContain("Objectives here");
  });

  test("writes design.md when designContent is provided", async () => {
    const result = await createChangeScaffold(
      changesDir,
      "testDesign",
      "Test Design",
      undefined,
      undefined,
      undefined,
      "# Design\n\nArchitecture overview.",
    );
    expect(result.designPath).toContain("design.md");
    const content = await readFile(result.designPath!, "utf-8");
    expect(content).toContain("Design");
    expect(content).toContain("Architecture overview");
  });

  test("does not write agreement.md or design.md when content is omitted", async () => {
    const result = await createChangeScaffold(
      changesDir,
      "testNoArtifacts",
      "No Artifacts",
    );
    expect(result.agreementPath).toBeUndefined();
    expect(result.designPath).toBeUndefined();
    // Verify files don't exist
    const agreementPath = join(changesDir, "testNoArtifacts", "agreement.md");
    const designPath = join(changesDir, "testNoArtifacts", "design.md");
    expect(await fileExists(agreementPath)).toBe(false);
    expect(await fileExists(designPath)).toBe(false);
  });
});

describe("updateChangeArtifacts with agreement and design", () => {
  let changesDir: string;

  beforeEach(async () => {
    changesDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(changesDir);
  });

  test("updates agreement.md and design.md for existing change", async () => {
    await createChangeScaffold(changesDir, "updateTest", "Update Test");

    const result = await updateChangeArtifacts(
      changesDir,
      "updateTest",
      undefined,
      undefined,
      "# Updated Agreement",
      "# Updated Design",
    );
    expect(result.agreementPath).toContain("agreement.md");
    expect(result.designPath).toContain("design.md");

    const agContent = await readFile(result.agreementPath!, "utf-8");
    expect(agContent).toBe("# Updated Agreement");

    const dsContent = await readFile(result.designPath!, "utf-8");
    expect(dsContent).toBe("# Updated Design");
  });

  test("updates only agreement.md when design is omitted", async () => {
    await createChangeScaffold(changesDir, "agOnly", "Agreement Only");

    const result = await updateChangeArtifacts(
      changesDir,
      "agOnly",
      undefined,
      undefined,
      "# Agreement Only Content",
    );
    expect(result.agreementPath).toContain("agreement.md");
    expect(result.designPath).toBeUndefined();
  });
});

// =============================================================================
// Error observability: ENOENT vs unexpected errors (D2)
// =============================================================================

describe("listSpecDirs and listChangeDirs error observability", () => {
  let warnSpy: MockInstance;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("listSpecDirs returns [] and does NOT warn for missing directory (ENOENT)", async () => {
    const dirs = await listSpecDirs(
      "/nonexistent/path/that/definitely/does/not/exist",
    );
    expect(dirs).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("listChangeDirs returns [] and does NOT warn for missing directory (ENOENT)", async () => {
    const dirs = await listChangeDirs(
      "/nonexistent/path/that/definitely/does/not/exist",
    );
    expect(dirs).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
