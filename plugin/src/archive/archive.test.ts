/**
 * Archive Tests
 *
 * TDD tests for delta application and doc generation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readFile, access } from "fs/promises";
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

      // Verify doc file exists
      const docPath = result.docsGenerated[0];
      await expect(access(docPath)).resolves.toBeUndefined();
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
      await expect(access(result.archivePath)).resolves.toBeUndefined();
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

      // Verify new spec file was created
      const specPath = join(testDir, "specs/brand-new-capability/spec.json");
      await expect(access(specPath)).resolves.toBeUndefined();
    });
  });
});
