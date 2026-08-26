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
import { readFile, writeFile, rm } from "fs/promises";
import {
  loadProjectConfig,
  loadProjectConfigWithDiagnostics,
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
  hasArchiveBundle,
  loadClosedChange,
  resolveChangeId,
} from "./json";
import { mkdir } from "fs/promises";
import { PROJECTION_DOCUMENT_BYTE_LIMIT } from "./change-projection-reader";
import { readSpecFilesystem } from "./spec-filesystem";
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
    expect(paths.summariesDir).toBe("/project/.adv/summaries");
    expect(paths.archive).toBe("/project/.adv/archive");
    expect(paths.closed).toBe("/project/.adv/closed");
    expect("db" in paths).toBe(false);
    expect(paths.wisdom).toBe("/project/.adv/wisdom.jsonl");
    expect("agenda" in paths).toBe(false);
    expect(paths.reflections).toBe("/project/.adv/reflections.jsonl");
    expect(paths.projectMetadata).toBe("/project/.adv/project-metadata.json");
    expect(paths.artifactMetadataMigrationMarker).toBe(
      "/project/.adv/artifact-metadata-migration-complete.json",
    );
    expect(paths.snapshotRepairAudit).toBe(
      "/project/.adv/snapshot-repair-audit.jsonl",
    );
    expect("handoff" in paths).toBe(false);
    expect(paths.external).toBeNull();
  });

  test("respects custom config", () => {
    const paths = getProjectPaths("/project", {
      specs_dir: "custom/specs",
      db_dir: ".custom-db",
    });
    expect(paths.specs).toBe("/project/custom/specs");
    expect("db" in paths).toBe(false);
    expect(paths.reflections).toBe("/project/.adv/reflections.jsonl");
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
    expect(paths.summariesDir).toBe("/ext/data/abc123/summaries");
    expect(paths.archive).toBe("/ext/data/abc123/archive");
    expect(paths.closed).toBe("/ext/data/abc123/closed");
    expect("db" in paths).toBe(false);
    expect(paths.wisdom).toBe("/ext/data/abc123/wisdom.jsonl");
    expect("agenda" in paths).toBe(false);
    expect(paths.reflections).toBe("/ext/data/abc123/reflections.jsonl");
    expect(paths.projectMetadata).toBe(
      "/ext/data/abc123/project-metadata.json",
    );
    expect(paths.artifactMetadataMigrationMarker).toBe(
      "/ext/data/abc123/artifact-metadata-migration-complete.json",
    );
    expect(paths.snapshotRepairAudit).toBe(
      "/ext/data/abc123/snapshot-repair-audit.jsonl",
    );
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
    expect("db" in paths).toBe(false);
    expect(paths.summariesDir).toBe("/ext/data/abc123/summaries");
    expect(paths.reflections).toBe("/ext/data/abc123/reflections.jsonl");
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

  test("uses one read/parse boundary for malformed JSON classification", async () => {
    const configPath = join(tempDir, "project.json");
    await writeFile(configPath, "{ not valid json !!!", "utf-8");

    let thrown: unknown;
    try {
      await loadProjectConfig(tempDir);
    } catch (error) {
      thrown = error;
    }

    const diagnostics = await loadProjectConfigWithDiagnostics(tempDir);
    expect(thrown).toBeInstanceOf(SyntaxError);
    expect(diagnostics).toMatchObject({
      success: false,
      type: "read_error",
    });
    if (!diagnostics.success) {
      expect(diagnostics.error).toContain((thrown as Error).message);
    }

    const source = await readFile(
      join(import.meta.dirname, "json.ts"),
      "utf-8",
    );
    expect(source.match(/JSON\.parse\(/g)).toHaveLength(1);
    expect(source.match(/await readFile\(configPath, "utf-8"\)/g)).toHaveLength(
      1,
    );
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
    // Enable ADV_DEBUG so logger.warn routes to console.warn (GH #5:
    // console output is now gated on ADV_DEBUG=1).
    const prevDebug = process.env.ADV_DEBUG;
    process.env.ADV_DEBUG = "1";
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
      if (prevDebug === undefined) {
        delete process.env.ADV_DEBUG;
      } else {
        process.env.ADV_DEBUG = prevDebug;
      }
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

  test("loadChange returns corrupt for malformed JSON", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const changePath = join(changesDir, "addFeature/change.json");
    await writeFile(changePath, "invalid json");

    const result = await loadChange(changesDir, "addFeature");
    expect(result.success).toBe(false);
    expect(result.type).toBe("corrupt");
  });

  test("loadChange normalizes legacy gate statuses in memory without rewriting disk", async () => {
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

    const original = JSON.stringify(raw, null, 2);
    await writeFile(changePath, original);

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

    // Readers must not mutate disk; the legacy file stays as written.
    const after = await readFile(changePath, "utf-8");
    expect(after).toBe(original);
  });

  test('loadChange normalizes legacy root status "active" to "draft" in memory without rewriting disk', async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const changePath = join(changesDir, "addFeature/change.json");
    const raw = JSON.parse(await readFile(changePath, "utf-8"));

    // Legacy/poisoned disk state: root status "active" is no longer written
    // by any code path but must still load (C4). Gates legitimately carry
    // status "pending" — the normalizer must NOT recurse into them.
    raw.status = "active";
    raw.gates = {
      proposal: { status: "pending" },
      discovery: { status: "pending" },
      design: { status: "pending" },
      planning: { status: "pending" },
      execution: { status: "pending" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    };
    const original = JSON.stringify(raw, null, 2);
    await writeFile(changePath, original);

    const result = await loadChange(changesDir, "addFeature");

    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("draft");
    // Gate statuses are a different domain — untouched by root normalization.
    expect(result.data!.gates.proposal.status).toBe("pending");
    expect(result.data!.gates.release.status).toBe("pending");

    // Readers must not mutate disk; the legacy file stays as written.
    const after = await readFile(changePath, "utf-8");
    expect(after).toBe(original);
  });

  test('loadChange normalizes legacy root status "pending" to "draft" in memory without rewriting disk', async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const changePath = join(changesDir, "addFeature/change.json");
    const raw = JSON.parse(await readFile(changePath, "utf-8"));

    raw.status = "pending";
    const original = JSON.stringify(raw, null, 2);
    await writeFile(changePath, original);

    const result = await loadChange(changesDir, "addFeature");

    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("draft");

    // Readers must not mutate disk; the legacy file stays as written.
    const after = await readFile(changePath, "utf-8");
    expect(after).toBe(original);
  });

  test("loadChange normalizes legacy task sub-agent reports in memory without rewriting disk", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const changePath = join(changesDir, "addFeature/change.json");
    const raw = JSON.parse(await readFile(changePath, "utf-8"));

    raw.tasks[0].subagent_reports = [
      {
        schema_version: "1.0",
        change_id: "addFeature",
        task_id: raw.tasks[0].id,
        attempt: 1,
        agent: "adv-engineer",
        status: "complete",
        scope: "legacy string scope",
        workdir_used: "/repo",
        files_touched: ["src/example.ts"],
        verification: [
          { command: "pnpm test", exit_code: 0, summary: "passed" },
        ],
        decisions: [{ what: "Kept legacy report", why: "Readback compat" }],
        blockers: [],
        follow_ups: [],
        related_scan: "No same-pattern issues",
        context_update_for_adv: {
          what_ads_needs_to_know: "Legacy report normalized",
          suggested_next_action: "Continue",
        },
      },
    ];

    const original = JSON.stringify(raw, null, 2);
    await writeFile(changePath, original);

    const result = await loadChange(changesDir, "addFeature");

    expect(result.success).toBe(true);
    expect(result.data!.tasks[0]?.subagent_reports?.[0]).toMatchObject({
      scope_drift: null,
      required_main_agent_actions: [],
    });

    // Readers must not mutate disk; the legacy file stays as written.
    const after = await readFile(changePath, "utf-8");
    expect(after).toBe(original);
  });

  test("loadChange does not write to disk while reading", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const changePath = join(changesDir, "addFeature/change.json");
    const raw = JSON.parse(await readFile(changePath, "utf-8"));
    raw.status = "active";
    const original = JSON.stringify(raw, null, 2);
    await writeFile(changePath, original);

    const result = await loadChange(changesDir, "addFeature");
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("draft");

    const after = await readFile(changePath, "utf-8");
    expect(after).toBe(original);
  });

  test("loadChange returns oversized for projections exceeding byte limit", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const changePath = join(changesDir, "addFeature/change.json");
    const huge = "x".repeat(PROJECTION_DOCUMENT_BYTE_LIMIT + 1);
    await writeFile(changePath, huge);

    const result = await loadChange(changesDir, "addFeature");
    expect(result.success).toBe(false);
    expect(result.type).toBe("oversized");
  });

  test("loadChange returns unreadable when projection path is not a file", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const changePath = join(changesDir, "addFeature/change.json");
    await rm(changePath, { recursive: true, force: true });
    await mkdir(changePath, { recursive: true });

    const result = await loadChange(changesDir, "addFeature");
    expect(result.success).toBe(false);
    expect(result.type).toBe("unreadable");
  });

  test("saveChange writes change to JSON", async () => {
    const changesDir = join(tempDir, ".adv/changes");
    const change = { ...SAMPLE_CHANGE, id: "newFeature" };
    await saveChange(changesDir, change);

    const result = await loadChange(changesDir, "newFeature");
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe("newFeature");
  });

  describe("saveChange synthetic-fixture-id guard (rq-synthstate01 disk layer)", () => {
    test("rejects changeRoundtrip ID — leaks ~514 records before this guard", async () => {
      const changesDir = join(tempDir, ".adv/changes");
      const change = { ...SAMPLE_CHANGE, id: "changeRoundtrip5" };
      await expect(saveChange(changesDir, change)).rejects.toThrow(
        /synthetic.*validation.*draft/i,
      );
    });

    test("rejects gateParity ID — leaks ~69 records before this guard", async () => {
      const changesDir = join(tempDir, ".adv/changes");
      const change = { ...SAMPLE_CHANGE, id: "gateParity42" };
      await expect(saveChange(changesDir, change)).rejects.toThrow(
        /synthetic.*validation.*draft/i,
      );
    });

    test("rejects parityValidationGateParity ID", async () => {
      const changesDir = join(tempDir, ".adv/changes");
      const change = { ...SAMPLE_CHANGE, id: "parityValidationGateParity" };
      await expect(saveChange(changesDir, change)).rejects.toThrow(
        /synthetic.*validation.*draft/i,
      );
    });

    test("rejects latencyLegacy ID", async () => {
      const changesDir = join(tempDir, ".adv/changes");
      const change = { ...SAMPLE_CHANGE, id: "latencyLegacy" };
      await expect(saveChange(changesDir, change)).rejects.toThrow(
        /synthetic.*validation.*draft/i,
      );
    });

    test("does not reject real change IDs that contain similar substrings", async () => {
      const changesDir = join(tempDir, ".adv/changes");
      // 'parity' substring but not the synthetic pattern
      await expect(
        saveChange(changesDir, {
          ...SAMPLE_CHANGE,
          id: "addParityCheckMonitoring",
        }),
      ).resolves.not.toThrow();
      await expect(
        saveChange(changesDir, {
          ...SAMPLE_CHANGE,
          id: "documentDataRoundtripContract",
        }),
      ).resolves.not.toThrow();
    });

    test("error message names the offending ID and the spec ref", async () => {
      const changesDir = join(tempDir, ".adv/changes");
      const change = { ...SAMPLE_CHANGE, id: "changeRoundtrip" };
      await expect(saveChange(changesDir, change)).rejects.toThrow(
        /changeRoundtrip/,
      );
    });
  });

  test("loadAllChanges loads all changes", async () => {
    const changesDir = join(tempDir, ".adv/changes");

    // Add another change
    await saveChange(changesDir, { ...SAMPLE_CHANGE, id: "secondFeature" });

    const changes = await loadAllChanges(changesDir);
    expect(changes.size).toBe(2);
  });

  test("loadClosedChange reads the exact closed change path", async () => {
    const closedDir = join(tempDir, ".adv/closed");
    const changeId = "closed-feature";
    const closedChange = {
      ...SAMPLE_CHANGE,
      id: changeId,
      status: "closed",
      closure: {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "User approved closure.",
        approved_at: "2026-08-26T00:00:00Z",
      },
    };
    await mkdir(join(closedDir, changeId), { recursive: true });
    await writeFile(
      join(closedDir, changeId, "change.json"),
      JSON.stringify(closedChange),
    );
    await mkdir(join(closedDir, `decoy-${changeId}`), { recursive: true });
    await writeFile(
      join(closedDir, `decoy-${changeId}`, "change.json"),
      "not valid JSON",
    );

    const result = await loadClosedChange(closedDir, changeId);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe(changeId);
    expect(result.data?.status).toBe("closed");
    expect(result.data?.closure?.approval_evidence).toBe(
      "User approved closure.",
    );
  });

  test("loadClosedChange does not enumerate sibling directories", async () => {
    const source = await readFile(
      join(import.meta.dirname, "json.ts"),
      "utf-8",
    );
    const helperStart = source.indexOf(
      "export async function loadClosedChange",
    );
    const helperEnd = source.indexOf("\n}\n", helperStart) + 3;

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(source.slice(helperStart, helperEnd)).not.toContain(
      "listChangeDirs",
    );
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

  test("creates change directory with projection-backed proposal", async () => {
    const changesDir = join(tempDir, "changes");
    const result = await createChangeScaffold(
      changesDir,
      "newFeature",
      "Add New Feature",
    );

    expect(result.changePath).toContain("change.json");
    expect(result.documents.proposal).toBeDefined();
    expect(
      await fileExists(join(changesDir, "newFeature", "proposal.md")),
    ).toBe(false);

    const content = result.documents.proposal!;
    expect(content).toContain("# Add New Feature");
  });

  test("proposal template includes all 8 required sections", async () => {
    const changesDir = join(tempDir, "changes");
    const result = await createChangeScaffold(
      changesDir,
      "testSections",
      "Test All Sections",
    );

    const content = result.documents.proposal!;

    // All 8 sections from the structured proposal template
    expect(content).toContain("## Why");
    expect(content).toContain("## What Changes");
    expect(content).toContain("## User Outcomes");
    expect(content).not.toContain("## Success Criteria");
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

    const content = result.documents.proposal!;

    // Validation Plan should mention TDD
    expect(content).toMatch(/TDD|test.*first|red.*green/i);
    // User Outcomes should have checklist items
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
      { proposal: customProposal },
    );

    const content = result.documents.proposal!;
    expect(content).toBe(customProposal);
  });

  test("rejects blank provided scaffold artifacts before writing", async () => {
    const changesDir = join(tempDir, "changes");

    await expect(
      createChangeScaffold(changesDir, "blankScaffold", "Blank Scaffold", {
        proposal: "# Valid proposal",
        problemStatement: "   ",
        agreement: "Valid agreement",
      }),
    ).rejects.toThrow(
      "Blank artifact fields are not allowed: problemStatement. Omit fields you do not intend to change.",
    );

    expect(await fileExists(join(changesDir, "blankScaffold"))).toBe(false);
  });

  test("returns problemStatement for projection persistence when provided", async () => {
    const changesDir = join(tempDir, "changes");
    const problemStatement =
      "PROBLEM\n  The widget is broken.\n\nDESIRED OUTCOME\n  The widget works.";
    const result = await createChangeScaffold(
      changesDir,
      "withProblemStatement",
      "Test Problem Statement",
      { problemStatement },
    );

    expect(result.documents.problemStatement).toBe(problemStatement);
    expect(
      await fileExists(
        join(changesDir, "withProblemStatement", "problem-statement.md"),
      ),
    ).toBe(false);
  });

  test("does not write problem-statement.md when problemStatement is omitted", async () => {
    const changesDir = join(tempDir, "changes");
    const result = await createChangeScaffold(
      changesDir,
      "withoutProblemStatement",
      "No Problem Statement",
    );

    expect(result.documents.problemStatement).toBeUndefined();
    const psPath = join(
      changesDir,
      "withoutProblemStatement",
      "problem-statement.md",
    );
    expect(await fileExists(psPath)).toBe(false);
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

describe("hasArchiveBundle", () => {
  let tempDir: string;
  let archiveDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    archiveDir = join(tempDir, "archive");
    await mkdir(archiveDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("returns true when archive/<id>/change.json exists (sentinel)", async () => {
    const bundleDir = join(archiveDir, "chg-archived");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "change.json"), '{"id":"chg-archived"}');
    expect(await hasArchiveBundle(archiveDir, "chg-archived")).toBe(true);
  });

  test("returns false when archive directory for change does not exist", async () => {
    expect(await hasArchiveBundle(archiveDir, "chg-missing")).toBe(false);
  });

  test("returns false when bundle dir exists but change.json sentinel is missing (partial bundle)", async () => {
    const bundleDir = join(archiveDir, "chg-partial");
    await mkdir(bundleDir, { recursive: true });
    // Intentionally NO change.json — simulating a partially-created bundle
    expect(await hasArchiveBundle(archiveDir, "chg-partial")).toBe(false);
  });

  test("returns false when archive root itself does not exist", async () => {
    const missingArchive = join(tempDir, "no-archive-here");
    expect(await hasArchiveBundle(missingArchive, "chg-anything")).toBe(false);
  });
});

// Proposal-read coverage moved to storage/proposal-read.test.ts (KD5):
// `loadProposalWithFallback` was retired in favour of the projection-first
// storage helper `loadProposalForSnapshot`.

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
      { agreement: "# Agreement\n\nObjectives here." },
    );
    expect(result.documents.agreement).toBeDefined();
    const content = result.documents.agreement!;
    expect(content).toContain("Agreement");
    expect(content).toContain("Objectives here");
  });

  test("writes design.md when designContent is provided", async () => {
    const result = await createChangeScaffold(
      changesDir,
      "testDesign",
      "Test Design",
      { design: "# Design\n\nArchitecture overview." },
    );
    expect(result.documents.design).toBeDefined();
    const content = result.documents.design!;
    expect(content).toContain("Design");
    expect(content).toContain("Architecture overview");
  });

  test("does not write agreement.md or design.md when content is omitted", async () => {
    const result = await createChangeScaffold(
      changesDir,
      "testNoArtifacts",
      "No Artifacts",
    );
    expect(result.documents.agreement).toBeUndefined();
    expect(result.documents.design).toBeUndefined();
    // Verify files don't exist
    const agreementPath = join(changesDir, "testNoArtifacts", "agreement.md");
    const designPath = join(changesDir, "testNoArtifacts", "design.md");
    expect(await fileExists(agreementPath)).toBe(false);
    expect(await fileExists(designPath)).toBe(false);
  });

  test("writes executive-summary.md when executiveSummaryContent is provided", async () => {
    const result = await createChangeScaffold(
      changesDir,
      "testExecSummary",
      "Test Exec Summary",
      {
        executiveSummary:
          "# Executive Summary\n\n## Outcome\nThe change landed well.",
      },
    );
    expect(result.documents.executiveSummary).toBeDefined();
    const content = result.documents.executiveSummary!;
    expect(content).toContain("Executive Summary");
    expect(content).toContain("The change landed well");
  });

  test("does not write executive-summary.md when content is omitted", async () => {
    const result = await createChangeScaffold(
      changesDir,
      "testNoExecSummary",
      "No Exec Summary",
    );
    expect(result.documents.executiveSummary).toBeUndefined();
    const execSummaryPath = join(
      changesDir,
      "testNoExecSummary",
      "executive-summary.md",
    );
    expect(await fileExists(execSummaryPath)).toBe(false);
  });
});

describe("readSpecFilesystem", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("returns ok with content and path for an existing spec", async () => {
    const result = await readSpecFilesystem({
      specsDir: join(tempDir, ".adv/specs"),
      capability: "test-capability",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toContain("test-capability/spec.json");
    expect(result.content).toContain("test-capability");
  });

  test("returns not_found error shape for a missing spec", async () => {
    const result = await readSpecFilesystem({
      specsDir: join(tempDir, ".adv/specs"),
      capability: "missing-capability",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Spec not found");
  });

  test("returns oversized error shape for a spec exceeding the limit", async () => {
    const specsDir = join(tempDir, ".adv/specs");
    await writeFile(
      join(specsDir, "test-capability", "spec.json"),
      "x".repeat(101),
      "utf-8",
    );

    const result = await readSpecFilesystem({
      specsDir,
      capability: "test-capability",
      limitBytes: 100,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("oversized");
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
