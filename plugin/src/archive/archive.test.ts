/**
 * Archive Tests
 *
 * TDD tests for delta application and doc generation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readFile, writeFile, access, mkdir, chmod } from "fs/promises";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  SAMPLE_SPEC,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import type { Change, Spec, Delta } from "../types";
import { applyDelta, applyDeltasToSpec } from "./delta";
import { generateSpecDoc } from "./docs";
import { archiveChange } from "./archive";
import { listProjectWisdom, addProjectWisdom } from "../storage/project-wisdom";

describe("Delta Application", () => {
  describe("applyDelta", () => {
    it("adds a new requirement to spec", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const delta: Delta = {
        id: "dl-add00001",
        operation: "add",
        requirement: {
          id: "rq-newreq01",
          title: "New Requirement",
          body: "A newly added requirement.",
          priority: "must",
          scenarios: [],
        },
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(true);
      expect(result.operation).toBe("add");
      expect(result.newId).toBe("rq-newreq01");
      expect(spec.requirements).toHaveLength(3); // 2 original + 1 new
      expect(
        spec.requirements.find((r) => r.id === "rq-newreq01"),
      ).toBeDefined();
    });

    it("modifies an existing requirement", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const delta: Delta = {
        id: "dl-mod00001",
        operation: "modify",
        target_id: "rq-test0001",
        changes: {
          title: "Updated Title",
          priority: "should",
        },
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(true);
      expect(result.operation).toBe("modify");
      expect(result.targetId).toBe("rq-test0001");

      const modifiedReq = spec.requirements.find((r) => r.id === "rq-test0001");
      expect(modifiedReq?.title).toBe("Updated Title");
      expect(modifiedReq?.priority).toBe("should");
    });

    it("removes an existing requirement", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const originalLength = spec.requirements.length;
      const delta: Delta = {
        id: "dl-rem00001",
        operation: "remove",
        target_id: "rq-test0002",
        reason: "No longer needed",
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(true);
      expect(result.operation).toBe("remove");
      expect(result.targetId).toBe("rq-test0002");
      expect(spec.requirements).toHaveLength(originalLength - 1);
      expect(
        spec.requirements.find((r) => r.id === "rq-test0002"),
      ).toBeUndefined();
    });

    it("fails to modify non-existent requirement", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const delta: Delta = {
        id: "dl-mod00002",
        operation: "modify",
        target_id: "rq-nonexistent",
        changes: { title: "New Title" },
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("fails to remove non-existent requirement", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const delta: Delta = {
        id: "dl-rem00002",
        operation: "remove",
        target_id: "rq-nonexistent",
        reason: "Cleanup",
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("fails to add duplicate requirement ID", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const delta: Delta = {
        id: "dl-add00002",
        operation: "add",
        requirement: {
          id: "rq-test0001", // Already exists
          title: "Duplicate",
          body: "This should fail",
          priority: "may",
        },
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("renames a requirement title", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const delta: Delta = {
        id: "dl-ren00001",
        operation: "rename",
        target_id: "rq-test0001",
        new_title: "Renamed Requirement",
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(true);
      expect(result.operation).toBe("rename");
      expect(result.targetId).toBe("rq-test0001");

      const renamed = spec.requirements.find((r) => r.id === "rq-test0001");
      expect(renamed?.title).toBe("Renamed Requirement");
      // Other fields preserved
      expect(renamed?.body).toBe(SAMPLE_SPEC.requirements[0].body);
      expect(renamed?.priority).toBe("must");
      expect(renamed?.tags).toEqual(["testing", "sample"]);
      expect(renamed?.scenarios).toHaveLength(2);
    });

    it("renames a requirement title and ID", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const delta: Delta = {
        id: "dl-ren00002",
        operation: "rename",
        target_id: "rq-test0001",
        new_title: "Fully Renamed",
        new_id: "rq-renamed1",
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(true);
      expect(result.targetId).toBe("rq-test0001");
      expect(result.newId).toBe("rq-renamed1");

      // Old ID no longer exists
      expect(
        spec.requirements.find((r) => r.id === "rq-test0001"),
      ).toBeUndefined();
      // New ID exists with correct title
      const renamed = spec.requirements.find((r) => r.id === "rq-renamed1");
      expect(renamed?.title).toBe("Fully Renamed");
      expect(renamed?.body).toBe(SAMPLE_SPEC.requirements[0].body);
    });

    it("fails to rename non-existent requirement", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const delta: Delta = {
        id: "dl-ren00003",
        operation: "rename",
        target_id: "rq-nonexistent",
        new_title: "Ghost Rename",
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("fails to rename to duplicate ID", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const delta: Delta = {
        id: "dl-ren00004",
        operation: "rename",
        target_id: "rq-test0001",
        new_title: "Conflicting Rename",
        new_id: "rq-test0002", // Already exists
      };

      const result = applyDelta(spec, delta);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });
  });

  describe("applyDeltasToSpec", () => {
    it("applies multiple deltas in order", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const deltas: Delta[] = [
        {
          id: "dl-add00003",
          operation: "add",
          requirement: {
            id: "rq-multi001",
            title: "First Addition",
            body: "Added first",
            priority: "must",
          },
        },
        {
          id: "dl-mod00003",
          operation: "modify",
          target_id: "rq-test0001",
          changes: { title: "Modified Original" },
        },
      ];

      const result = applyDeltasToSpec(spec, deltas, "1.0.0");

      expect(result.deltaResults).toHaveLength(2);
      expect(result.deltaResults.every((r) => r.success)).toBe(true);
      expect(result.newVersion).not.toBe("1.0.0"); // Version should bump
      expect(spec.requirements).toHaveLength(3);
    });

    it("stops on first error", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const deltas: Delta[] = [
        {
          id: "dl-bad00001",
          operation: "modify",
          target_id: "rq-nonexistent",
          changes: { title: "Will Fail" },
        },
        {
          id: "dl-add00004",
          operation: "add",
          requirement: {
            id: "rq-neveradded",
            title: "Never Added",
            body: "This should not be added",
            priority: "may",
          },
        },
      ];

      const result = applyDeltasToSpec(spec, deltas, "1.0.0");

      expect(result.deltaResults).toHaveLength(1); // Only first delta attempted
      expect(result.deltaResults[0].success).toBe(false);
    });

    it("bumps minor version for adds", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const deltas: Delta[] = [
        {
          id: "dl-add00005",
          operation: "add",
          requirement: {
            id: "rq-version01",
            title: "Version Test",
            body: "Testing version bump",
            priority: "should",
          },
        },
      ];

      const result = applyDeltasToSpec(spec, deltas, "1.2.3");

      expect(result.newVersion).toBe("1.3.0"); // Minor bump for feature add
    });

    it("bumps patch version for modifications", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const deltas: Delta[] = [
        {
          id: "dl-mod00004",
          operation: "modify",
          target_id: "rq-test0001",
          changes: { body: "Updated body text" },
        },
      ];

      const result = applyDeltasToSpec(spec, deltas, "1.2.3");

      expect(result.newVersion).toBe("1.2.4"); // Patch bump for modification
    });

    it("bumps patch version for renames", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      const deltas: Delta[] = [
        {
          id: "dl-ren00005",
          operation: "rename",
          target_id: "rq-test0001",
          new_title: "Renamed For Version Test",
        },
      ];

      const result = applyDeltasToSpec(spec, deltas, "2.1.0");

      expect(result.newVersion).toBe("2.1.1"); // Patch bump for rename (identity change)
    });

    it("enforces ordering: rename before modify on same target", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      // Pass deltas in wrong order: modify first, rename second
      // Without ordering, modify would target "rq-test0001", then rename would too
      // With ordering, rename runs first (renames ID), then modify targets new ID
      const deltas: Delta[] = [
        {
          id: "dl-mod-order1",
          operation: "modify",
          target_id: "rq-renamed01",
          changes: { body: "Modified after rename" },
        },
        {
          id: "dl-ren-order1",
          operation: "rename",
          target_id: "rq-test0001",
          new_title: "Renamed First",
          new_id: "rq-renamed01",
        },
      ];

      const result = applyDeltasToSpec(spec, deltas, "1.0.0");

      // Both should succeed because rename happens first, creating "rq-renamed01",
      // then modify targets "rq-renamed01" which now exists
      expect(result.deltaResults).toHaveLength(2);
      expect(result.deltaResults.every((r) => r.success)).toBe(true);

      // Verify the rename result came first
      expect(result.deltaResults[0].operation).toBe("rename");
      expect(result.deltaResults[1].operation).toBe("modify");

      // Verify final state
      const renamed = spec.requirements.find((r) => r.id === "rq-renamed01");
      expect(renamed?.title).toBe("Renamed First");
      expect(renamed?.body).toBe("Modified after rename");
    });

    it("enforces ordering: rename before remove", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      // Pass in wrong order: remove first, rename second
      const deltas: Delta[] = [
        {
          id: "dl-rem-order1",
          operation: "remove",
          target_id: "rq-test0002",
          reason: "Removing secondary",
        },
        {
          id: "dl-ren-order2",
          operation: "rename",
          target_id: "rq-test0001",
          new_title: "Renamed Before Remove",
        },
      ];

      const result = applyDeltasToSpec(spec, deltas, "1.0.0");

      expect(result.deltaResults).toHaveLength(2);
      expect(result.deltaResults.every((r) => r.success)).toBe(true);

      // Rename should execute first
      expect(result.deltaResults[0].operation).toBe("rename");
      expect(result.deltaResults[1].operation).toBe("remove");
    });

    it("enforces ordering: remove before add", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      // Pass in wrong order: add first, remove second
      const deltas: Delta[] = [
        {
          id: "dl-add-order1",
          operation: "add",
          requirement: {
            id: "rq-neworder1",
            title: "Added Last",
            body: "Should be added after remove",
            priority: "must",
          },
        },
        {
          id: "dl-rem-order2",
          operation: "remove",
          target_id: "rq-test0002",
          reason: "Removing before add",
        },
      ];

      const result = applyDeltasToSpec(spec, deltas, "1.0.0");

      expect(result.deltaResults).toHaveLength(2);
      expect(result.deltaResults.every((r) => r.success)).toBe(true);

      // Remove should execute first, add last
      expect(result.deltaResults[0].operation).toBe("remove");
      expect(result.deltaResults[1].operation).toBe("add");
    });

    it("enforces full ordering: rename > remove > modify > add", () => {
      const spec = structuredClone(SAMPLE_SPEC) as Spec;
      // Pass all four operations in reverse of correct order
      const deltas: Delta[] = [
        {
          id: "dl-add-full1",
          operation: "add",
          requirement: {
            id: "rq-fullnew1",
            title: "Added Requirement",
            body: "New",
            priority: "may",
          },
        },
        {
          id: "dl-mod-full1",
          operation: "modify",
          target_id: "rq-test0001",
          changes: { priority: "should" },
        },
        {
          id: "dl-rem-full1",
          operation: "remove",
          target_id: "rq-test0002",
          reason: "Cleanup",
        },
        {
          id: "dl-ren-full1",
          operation: "rename",
          target_id: "rq-test0001",
          new_title: "Fully Ordered Rename",
        },
      ];

      const result = applyDeltasToSpec(spec, deltas, "1.0.0");

      expect(result.deltaResults).toHaveLength(4);
      expect(result.deltaResults.every((r) => r.success)).toBe(true);

      // Verify canonical order: rename, remove, modify, add
      expect(result.deltaResults[0].operation).toBe("rename");
      expect(result.deltaResults[1].operation).toBe("remove");
      expect(result.deltaResults[2].operation).toBe("modify");
      expect(result.deltaResults[3].operation).toBe("add");
    });
  });
});

describe("Doc Generation", () => {
  describe("generateSpecDoc", () => {
    it("generates markdown for a spec", () => {
      const spec = SAMPLE_SPEC as Spec;
      const doc = generateSpecDoc(spec);

      expect(doc).toContain("# Test Capability");
      expect(doc).toContain("## Requirements");
      expect(doc).toContain("rq-test0001");
      expect(doc).toContain("Sample Requirement");
    });

    it("includes priority badges", () => {
      const spec = SAMPLE_SPEC as Spec;
      const doc = generateSpecDoc(spec);

      expect(doc).toMatch(/\*\*MUST\*\*|\[MUST\]/i);
      expect(doc).toMatch(/\*\*SHOULD\*\*|\[SHOULD\]/i);
    });

    it("includes scenarios when present", () => {
      const spec = SAMPLE_SPEC as Spec;
      const doc = generateSpecDoc(spec, { includeScenarios: true });

      expect(doc).toContain("Given");
      expect(doc).toContain("When");
      expect(doc).toContain("Then");
    });

    it("includes table of contents when requested", () => {
      const spec = SAMPLE_SPEC as Spec;
      const doc = generateSpecDoc(spec, { includeToc: true });

      expect(doc).toContain("## Table of Contents");
    });

    it("handles spec with no requirements", () => {
      const emptySpec: Spec = {
        name: "empty-spec",
        title: "Empty Spec",
        purpose: "Testing empty specs",
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        requirements: [],
      };

      const doc = generateSpecDoc(emptySpec);

      expect(doc).toContain("# Empty Spec");
      expect(doc).toContain("No requirements defined");
    });
  });
});

describe("Archive Workflow", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTempDir();
    await createTestProject(testDir);
  });

  afterEach(async () => {
    await cleanupTempDir(testDir);
  });

  describe("archiveChange", () => {
    it("archives a change with add deltas", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      // Mark all tasks as done
      change.tasks.forEach((t) => (t.status = "done"));

      const specs = new Map<string, Spec>();
      specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

      const result = await archiveChange({
        change,
        specs,
        paths: {
          specs: join(testDir, "specs"),
          archive: join(testDir, "archive"),
          docs: join(testDir, "docs/specs"),
        },
      });

      expect(result.success).toBe(true);
      expect(result.specsUpdated).toHaveLength(1);
      expect(result.specsUpdated[0].capability).toBe("test-capability");
    });

    it("generates documentation files", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      change.tasks.forEach((t) => (t.status = "done"));

      const specs = new Map<string, Spec>();
      specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

      const result = await archiveChange({
        change,
        specs,
        paths: {
          specs: join(testDir, "specs"),
          archive: join(testDir, "archive"),
          docs: join(testDir, "docs/specs"),
        },
      });

      expect(result.docsGenerated.length).toBeGreaterThan(0);

      // Verify doc file exists (access() throws if file missing)
      const docPath = result.docsGenerated[0];
      await access(docPath);
    });

    it("creates archive directory with change copy", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      change.tasks.forEach((t) => (t.status = "done"));

      const specs = new Map<string, Spec>();
      specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

      const result = await archiveChange({
        change,
        specs,
        paths: {
          specs: join(testDir, "specs"),
          archive: join(testDir, "archive"),
          docs: join(testDir, "docs/specs"),
        },
      });

      expect(result.archivePath).toBeDefined();
      // access() throws if path missing
      await access(result.archivePath);
    });

    it("strips TDD evidence to minimal proof in archived change", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      change.tasks.forEach((t) => (t.status = "done"));
      // Add full TDD evidence to a task
      change.tasks[0].tdd_evidence = {
        red: {
          test_file: "src/foo.test.ts",
          command: "bun test src/foo.test.ts",
          output_snippet:
            "FAIL: expected 1 to be 2 — long output that bloats the file",
          exit_code: 1,
          recorded_at: "2026-01-22T00:00:00Z",
        },
        green: {
          test_file: "src/foo.test.ts",
          command: "bun test src/foo.test.ts",
          output_snippet: "PASS: all tests passed — more verbose output here",
          exit_code: 0,
          recorded_at: "2026-01-22T01:00:00Z",
        },
      };
      // Add skipped evidence to another task
      change.tasks[1].tdd_evidence = {
        skipped: true,
        skip_reason: "trivial: docs change",
      };

      const specs = new Map<string, Spec>();
      specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

      const result = await archiveChange({
        change,
        specs,
        paths: {
          specs: join(testDir, "specs"),
          archive: join(testDir, "archive"),
          docs: join(testDir, "docs/specs"),
        },
      });

      expect(result.success).toBe(true);

      // Read the archived change.json and verify evidence is stripped
      const archivedContent = await readFile(
        join(result.archivePath, "change.json"),
        "utf-8",
      );
      const archivedChange = JSON.parse(archivedContent);

      // Red phase: command and output_snippet should be stripped
      const task0Evidence = archivedChange.tasks[0].tdd_evidence;
      expect(task0Evidence.red.exit_code).toBe(1);
      expect(task0Evidence.red.recorded_at).toBe("2026-01-22T00:00:00Z");
      expect(task0Evidence.red.test_file).toBe("src/foo.test.ts");
      expect(task0Evidence.red.command).toBeUndefined();
      expect(task0Evidence.red.output_snippet).toBeUndefined();

      // Green phase: same stripping
      expect(task0Evidence.green.exit_code).toBe(0);
      expect(task0Evidence.green.test_file).toBe("src/foo.test.ts");
      expect(task0Evidence.green.command).toBeUndefined();
      expect(task0Evidence.green.output_snippet).toBeUndefined();

      // Skipped evidence preserved unchanged
      const task1Evidence = archivedChange.tasks[1].tdd_evidence;
      expect(task1Evidence.skipped).toBe(true);
      expect(task1Evidence.skip_reason).toBe("trivial: docs change");
    });

    it("performs dry run without writing files", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      change.tasks.forEach((t) => (t.status = "done"));

      const specs = new Map<string, Spec>();
      specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

      const result = await archiveChange({
        change,
        specs,
        paths: {
          specs: join(testDir, "specs"),
          archive: join(testDir, "archive"),
          docs: join(testDir, "docs/specs"),
        },
        dryRun: true,
      });

      expect(result.success).toBe(true);
      // Archive path should not exist in dry run
      await expect(access(result.archivePath)).rejects.toThrow();
    });

    it("updates spec version in file", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      change.tasks.forEach((t) => (t.status = "done"));

      const specs = new Map<string, Spec>();
      specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

      await archiveChange({
        change,
        specs,
        paths: {
          specs: join(testDir, "specs"),
          archive: join(testDir, "archive"),
          docs: join(testDir, "docs/specs"),
        },
      });

      // Read the spec file and verify version changed
      const specPath = join(testDir, "specs/test-capability/spec.json");
      const specContent = await readFile(specPath, "utf-8");
      const updatedSpec = JSON.parse(specContent);

      expect(updatedSpec.version).not.toBe("1.0.0"); // Should have bumped
    });

    it("handles change targeting new capability", async () => {
      const change: Change = {
        id: "new-cap-change",
        title: "Add New Capability",
        status: "active",
        created_at: new Date().toISOString(),
        tasks: [
          {
            id: "tk-new001",
            title: "Create cap",
            status: "done",
            priority: 0,
            created_at: new Date().toISOString(),
          },
        ],
        deltas: {
          "brand-new-capability": [
            {
              id: "dl-newcap01",
              operation: "add",
              requirement: {
                id: "rq-brand001",
                title: "First Requirement",
                body: "The first requirement of a new capability.",
                priority: "must",
                scenarios: [],
              },
            },
          ],
        },
      };

      const specs = new Map<string, Spec>(); // No existing specs

      const result = await archiveChange({
        change,
        specs,
        paths: {
          specs: join(testDir, "specs"),
          archive: join(testDir, "archive"),
          docs: join(testDir, "docs/specs"),
        },
      });

      expect(result.success).toBe(true);
      expect(result.specsUpdated[0].capability).toBe("brand-new-capability");

      // Verify new spec file was created (access() throws if missing)
      const specPath = join(testDir, "specs/brand-new-capability/spec.json");
      await access(specPath);
    });

    it("copies sibling files (proposal.md, problem-statement.md) to archive", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      change.tasks.forEach((t) => (t.status = "done"));

      // Create source change directory with sibling files
      const changesDir = join(testDir, "changes");
      const sourceChangeDir = join(changesDir, change.id);
      await mkdir(sourceChangeDir, { recursive: true });
      await writeFile(
        join(sourceChangeDir, "proposal.md"),
        "# My Proposal\n\n## Why\n\nBecause.",
      );
      await writeFile(
        join(sourceChangeDir, "problem-statement.md"),
        "PROBLEM\n  The widget is broken.",
      );

      const specs = new Map<string, Spec>();
      specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

      const result = await archiveChange({
        change,
        specs,
        paths: {
          specs: join(testDir, "specs"),
          archive: join(testDir, "archive"),
          docs: join(testDir, "docs/specs"),
          changes: changesDir,
        },
      });

      expect(result.success).toBe(true);

      // Verify sibling files were copied to archive
      const archivedProposal = await readFile(
        join(result.archivePath, "proposal.md"),
        "utf-8",
      );
      expect(archivedProposal).toBe("# My Proposal\n\n## Why\n\nBecause.");

      const archivedProblemStatement = await readFile(
        join(result.archivePath, "problem-statement.md"),
        "utf-8",
      );
      expect(archivedProblemStatement).toBe("PROBLEM\n  The widget is broken.");
    });

    it("reports errors when a sibling artifact cannot be copied", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      change.tasks.forEach((t) => (t.status = "done"));

      const changesDir = join(testDir, "changes");
      const sourceChangeDir = join(changesDir, change.id);
      await mkdir(sourceChangeDir, { recursive: true });

      const unreadablePath = join(sourceChangeDir, "problem-statement.md");
      await writeFile(unreadablePath, "PROBLEM\n  The widget is broken.");
      await chmod(unreadablePath, 0o000);

      try {
        const specs = new Map<string, Spec>();
        specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

        const result = await archiveChange({
          change,
          specs,
          paths: {
            specs: join(testDir, "specs"),
            archive: join(testDir, "archive"),
            docs: join(testDir, "docs/specs"),
            changes: changesDir,
          },
        });

        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual(
          expect.stringContaining(
            "Failed to copy change artifact problem-statement.md",
          ),
        );
      } finally {
        await chmod(unreadablePath, 0o644);
      }
    });

    describe("wisdom copy to archive (Leak #10)", () => {
      it("copies wisdom entries to archive directory when wisdom exists", async () => {
        const change = structuredClone(SAMPLE_CHANGE) as Change;
        change.tasks.forEach((t) => (t.status = "done"));
        // Add wisdom entries to the change
        change.wisdom = [
          {
            id: "ws-test01",
            type: "convention",
            content: "Always use .passthrough() for schema backwards compat",
            recorded_at: new Date().toISOString(),
          },
          {
            id: "ws-test02",
            type: "gotcha",
            content: "node_modules must be symlinked in worktrees",
            recorded_at: new Date().toISOString(),
          },
        ];

        const specs = new Map<string, Spec>();
        specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

        const result = await archiveChange({
          change,
          specs,
          paths: {
            specs: join(testDir, "specs"),
            archive: join(testDir, "archive"),
            docs: join(testDir, "docs/specs"),
          },
        });

        expect(result.success).toBe(true);

        // wisdom.json should be present in the archive directory
        const archivePath = result.archivePath;
        const wisdomContent = await readFile(
          join(archivePath, "wisdom.json"),
          "utf-8",
        );
        const wisdomData = JSON.parse(wisdomContent);
        expect(wisdomData.entries).toHaveLength(2);
        expect(wisdomData.entries[0].content).toBe(
          "Always use .passthrough() for schema backwards compat",
        );
      });

      it("skips wisdom file when change has no wisdom entries", async () => {
        const change = structuredClone(SAMPLE_CHANGE) as Change;
        change.tasks.forEach((t) => (t.status = "done"));
        // No wisdom entries

        const specs = new Map<string, Spec>();
        specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

        const result = await archiveChange({
          change,
          specs,
          paths: {
            specs: join(testDir, "specs"),
            archive: join(testDir, "archive"),
            docs: join(testDir, "docs/specs"),
          },
        });

        expect(result.success).toBe(true);

        // wisdom.json should NOT be present
        const archivePath = result.archivePath;
        await expect(
          access(join(archivePath, "wisdom.json")),
        ).rejects.toThrow();
      });
    });

    describe("enriched ARCHIVE_SUMMARY.md (Leak #10)", () => {
      it("includes implementation summaries in archive summary when present", async () => {
        const change = structuredClone(SAMPLE_CHANGE) as Change;
        change.tasks.forEach((t) => {
          t.status = "done";
        });
        // Add implementation_summary to first task
        (
          change.tasks[0] as Change["tasks"][number] & {
            implementation_summary?: string;
          }
        ).implementation_summary =
          "Implemented core logic using recursive descent parser";

        const specs = new Map<string, Spec>();

        const result = await archiveChange({
          change,
          specs,
          paths: {
            specs: join(testDir, "specs"),
            archive: join(testDir, "archive"),
            docs: join(testDir, "docs/specs"),
          },
        });

        expect(result.success).toBe(true);

        const summaryContent = await readFile(
          join(result.archivePath, "ARCHIVE_SUMMARY.md"),
          "utf-8",
        );
        expect(summaryContent).toContain(
          "Implemented core logic using recursive descent parser",
        );
      });

      it("includes wisdom summary section when wisdom exists", async () => {
        const change = structuredClone(SAMPLE_CHANGE) as Change;
        change.tasks.forEach((t) => (t.status = "done"));
        change.wisdom = [
          {
            id: "ws-test01",
            type: "convention",
            content: "Use append-only snapshots for resolution tracking",
            recorded_at: new Date().toISOString(),
          },
        ];

        const specs = new Map<string, Spec>();

        const result = await archiveChange({
          change,
          specs,
          paths: {
            specs: join(testDir, "specs"),
            archive: join(testDir, "archive"),
            docs: join(testDir, "docs/specs"),
          },
        });

        expect(result.success).toBe(true);

        const summaryContent = await readFile(
          join(result.archivePath, "ARCHIVE_SUMMARY.md"),
          "utf-8",
        );
        expect(summaryContent).toContain("Wisdom");
        expect(summaryContent).toContain(
          "Use append-only snapshots for resolution tracking",
        );
      });
    });
  });
});

describe("wisdom auto-promotion during archive (tk-uv67_Wsk)", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTempDir();
    await createTestProject(testDir, { withSpecs: true, withChanges: false });
    await mkdir(join(testDir, "archive"), { recursive: true });
    await mkdir(join(testDir, "docs/specs"), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(testDir);
  });

  const wisdomPath = () => join(testDir, ".adv", "wisdom.jsonl");

  const makeChangeWithWisdom = () => {
    const change = structuredClone(SAMPLE_CHANGE) as Change;
    change.tasks.forEach((t) => (t.status = "done"));
    change.wisdom = [
      { id: "ws-conv1", type: "convention", content: "always use atomic writes for JSONL", recorded_at: new Date().toISOString() },
      { id: "ws-patt1", type: "pattern", content: "use dependency injection for testability", recorded_at: new Date().toISOString() },
      { id: "ws-gotcha1", type: "gotcha", content: "sqlite needs WAL mode for concurrent access", recorded_at: new Date().toISOString() },
    ];
    return change;
  };

  it("auto-promotes convention entries to project wisdom on archive", async () => {
    const change = makeChangeWithWisdom();
    const specs = new Map<string, Spec>();
    specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

    const result = await archiveChange({
      change,
      specs,
      paths: {
        specs: join(testDir, ".adv/specs"),
        archive: join(testDir, "archive"),
        docs: join(testDir, "docs/specs"),
        wisdom: wisdomPath(),
      },
    });

    expect(result.success).toBe(true);

    const projectEntries = await listProjectWisdom(testDir, { wisdomPath: wisdomPath() });
    const contents = projectEntries.map((e) => e.content);
    expect(contents).toContain("always use atomic writes for JSONL");
    expect(contents).toContain("use dependency injection for testability");
  });

  it("auto-promotes pattern entries to project wisdom on archive", async () => {
    const change = makeChangeWithWisdom();
    const specs = new Map<string, Spec>();
    specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

    await archiveChange({
      change,
      specs,
      paths: {
        specs: join(testDir, ".adv/specs"),
        archive: join(testDir, "archive"),
        docs: join(testDir, "docs/specs"),
        wisdom: wisdomPath(),
      },
    });

    const projectEntries = await listProjectWisdom(testDir, { wisdomPath: wisdomPath() });
    expect(projectEntries.some((e) => e.type === "pattern")).toBe(true);
  });

  it("does NOT promote gotcha entries to project wisdom", async () => {
    const change = makeChangeWithWisdom();
    const specs = new Map<string, Spec>();
    specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

    await archiveChange({
      change,
      specs,
      paths: {
        specs: join(testDir, ".adv/specs"),
        archive: join(testDir, "archive"),
        docs: join(testDir, "docs/specs"),
        wisdom: wisdomPath(),
      },
    });

    const projectEntries = await listProjectWisdom(testDir, { wisdomPath: wisdomPath() });
    expect(projectEntries.every((e) => e.type !== "gotcha")).toBe(true);
  });

  it("does not create duplicate entries when same wisdom is already promoted", async () => {
    // Pre-populate project wisdom with same convention entry
    await addProjectWisdom(testDir, {
      type: "convention",
      content: "always use atomic writes for JSONL",
      sourceChange: "priorChange",
      wisdomPath: wisdomPath(),
    });

    const change = makeChangeWithWisdom();
    const specs = new Map<string, Spec>();
    specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

    await archiveChange({
      change,
      specs,
      paths: {
        specs: join(testDir, ".adv/specs"),
        archive: join(testDir, "archive"),
        docs: join(testDir, "docs/specs"),
        wisdom: wisdomPath(),
      },
    });

    const projectEntries = await listProjectWisdom(testDir, { wisdomPath: wisdomPath() });
    const conventionEntries = projectEntries.filter(
      (e) => e.content === "always use atomic writes for JSONL",
    );
    expect(conventionEntries).toHaveLength(1);
  });

  it("archive with 0 wisdom entries completes without errors", async () => {
    const change = structuredClone(SAMPLE_CHANGE) as Change;
    change.tasks.forEach((t) => (t.status = "done"));
    // No wisdom entries
    const specs = new Map<string, Spec>();
    specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

    const result = await archiveChange({
      change,
      specs,
      paths: {
        specs: join(testDir, ".adv/specs"),
        archive: join(testDir, "archive"),
        docs: join(testDir, "docs/specs"),
        wisdom: wisdomPath(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("auto-promotion count is reported in result", async () => {
    const change = makeChangeWithWisdom();
    const specs = new Map<string, Spec>();
    specs.set("test-capability", structuredClone(SAMPLE_SPEC) as Spec);

    const result = await archiveChange({
      change,
      specs,
      paths: {
        specs: join(testDir, ".adv/specs"),
        archive: join(testDir, "archive"),
        docs: join(testDir, "docs/specs"),
        wisdom: wisdomPath(),
      },
    });

    expect(result.wisdomPromoted).toBe(2); // convention + pattern
  });
});
