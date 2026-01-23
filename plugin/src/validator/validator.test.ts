/**
 * Validator Tests
 *
 * TDD tests for the main validation orchestrator.
 * "Specs as Laws" - changes must pass all checks before promotion.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
  SAMPLE_SPEC,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import type { Change, Spec, Delta } from "../types";
import { validateChange, buildValidationContext } from "./validator";
import { ValidationCodes } from "./types";

describe("Validator", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTempDir();
    await createTestProject(testDir);
  });

  afterEach(async () => {
    await cleanupTempDir(testDir);
  });

  describe("buildValidationContext", () => {
    it("builds context from specs array", () => {
      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const context = buildValidationContext(specs);

      expect(context.existingSpecs.size).toBe(1);
      expect(context.existingSpecs.has("test-capability")).toBe(true);
      expect(context.existingRequirementIds.has("rq-test0001")).toBe(true);
      expect(context.existingRequirementIds.has("rq-test0002")).toBe(true);
    });

    it("builds context with empty specs array", () => {
      const context = buildValidationContext([]);

      expect(context.existingSpecs.size).toBe(0);
      expect(context.existingRequirementIds.size).toBe(0);
    });

    it("extracts requirement references from body text", () => {
      const specWithRefs: Spec = {
        ...SAMPLE_SPEC,
        requirements: [
          {
            id: "rq-parent01",
            title: "Parent",
            body: "This requirement depends on rq-child001.",
            priority: "must",
          },
          {
            id: "rq-child001",
            title: "Child",
            body: "A standalone requirement.",
            priority: "should",
          },
        ],
      } as Spec;

      const context = buildValidationContext([specWithRefs]);

      // Parent references child
      expect(context.requirementReferences.get("rq-parent01")).toContain(
        "rq-child001",
      );
    });
  });

  describe("validateChange", () => {
    it("returns passed=true for valid change", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      // Ensure the change has proper scenarios
      const delta = change.deltas["test-capability"][0] as Extract<
        Delta,
        { operation: "add" }
      >;
      delta.requirement.scenarios = [
        {
          id: "rq-new00001.1",
          title: "Test scenario",
          given: ["a precondition"],
          when: "action occurs",
          then: ["expected outcome"],
        },
      ];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns passed=false when errors exist", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      // Add a delta with invalid ID format
      change.deltas["test-capability"].push({
        id: "invalid-delta-id", // Should be dl-xxx
        operation: "add",
        requirement: {
          id: "invalid-req-id", // Should be rq-xxx
          title: "Bad Requirement",
          body: "This has invalid IDs",
          priority: "must",
        },
      } as Extract<Delta, { operation: "add" }>);

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) => e.code === ValidationCodes.INVALID_ID_FORMAT),
      ).toBe(true);
    });

    it("detects duplicate requirement IDs", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      // Try to add a requirement with ID that exists in spec
      const delta = change.deltas["test-capability"][0] as Extract<
        Delta,
        { operation: "add" }
      >;
      delta.requirement.id = "rq-test0001"; // Already exists in SAMPLE_SPEC

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      expect(result.passed).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === ValidationCodes.DUPLICATE_REQUIREMENT_ID,
        ),
      ).toBe(true);
    });

    it("detects orphaned delta targets", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      // Add a modify delta targeting non-existent requirement
      change.deltas["test-capability"].push({
        id: "dl-modify001",
        operation: "modify",
        target_id: "rq-nonexistent",
        changes: { title: "New Title" },
      } as Extract<Delta, { operation: "modify" }>);

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      expect(result.passed).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === ValidationCodes.ORPHANED_DELTA_TARGET,
        ),
      ).toBe(true);
    });

    it("warns about priority downgrades", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      // Add a modify delta that downgrades MUST to MAY
      change.deltas["test-capability"].push({
        id: "dl-downgrade",
        operation: "modify",
        target_id: "rq-test0001", // Has priority: "must"
        changes: { priority: "may" },
      } as Extract<Delta, { operation: "modify" }>);

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      // Warnings don't fail validation
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some(
          (w) => w.code === ValidationCodes.MODIFYING_MUST_TO_MAY,
        ),
      ).toBe(true);
    });

    it("warns about missing scenarios", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      // Requirement has empty scenarios
      const delta = change.deltas["test-capability"][0] as Extract<
        Delta,
        { operation: "add" }
      >;
      delta.requirement.scenarios = [];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      expect(
        result.warnings.some(
          (w) => w.code === ValidationCodes.MISSING_SCENARIO,
        ),
      ).toBe(true);
    });

    it("warns about incomplete scenarios", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      const delta = change.deltas["test-capability"][0] as Extract<
        Delta,
        { operation: "add" }
      >;
      delta.requirement.scenarios = [
        {
          id: "rq-new00001.1",
          title: "Incomplete scenario",
          given: [], // Empty given
          when: "something",
          then: ["result"],
        },
      ];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      expect(
        result.warnings.some(
          (w) => w.code === ValidationCodes.INCOMPLETE_SCENARIO,
        ),
      ).toBe(true);
    });

    it("detects spec not found for modify operations", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      // Add a delta to a non-existent capability with modify operation
      change.deltas["nonexistent-capability"] = [
        {
          id: "dl-modify002",
          operation: "modify",
          target_id: "rq-something",
          changes: { title: "New Title" },
        } as Extract<Delta, { operation: "modify" }>,
      ];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      expect(result.passed).toBe(false);
      expect(
        result.errors.some((e) => e.code === ValidationCodes.SPEC_NOT_FOUND),
      ).toBe(true);
    });

    it("allows add operations to new capabilities", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      // Add a delta to create a new capability (all add operations)
      change.deltas["new-capability"] = [
        {
          id: "dl-newcap001",
          operation: "add",
          requirement: {
            id: "rq-newcap001",
            title: "New Capability Requirement",
            body: "First requirement for new capability.",
            priority: "must",
            scenarios: [
              {
                id: "rq-newcap001.1",
                title: "Test scenario",
                given: ["precondition"],
                when: "action",
                then: ["outcome"],
              },
            ],
          },
        } as Extract<Delta, { operation: "add" }>,
      ];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      // Should not have SPEC_NOT_FOUND error for all-add deltas
      expect(
        result.errors.some(
          (e) =>
            e.code === ValidationCodes.SPEC_NOT_FOUND &&
            e.path?.includes("new-capability"),
        ),
      ).toBe(false);
    });

    it("warns about removing referenced requirements", async () => {
      // Create a spec where one requirement references another
      const specWithRefs: Spec = {
        ...SAMPLE_SPEC,
        requirements: [
          {
            id: "rq-parent001",
            title: "Parent Requirement",
            body: "Depends on rq-child001 for its implementation.",
            priority: "must",
          },
          {
            id: "rq-child001",
            title: "Child Requirement",
            body: "A dependency of the parent.",
            priority: "should",
          },
        ],
      } as Spec;

      const change: Change = {
        id: "remove-child",
        title: "Remove Child",
        status: "draft",
        created_at: new Date().toISOString(),
        tasks: [],
        deltas: {
          "test-capability": [
            {
              id: "dl-remove001",
              operation: "remove",
              target_id: "rq-child001",
              reason: "No longer needed",
            } as Extract<Delta, { operation: "remove" }>,
          ],
        },
      };

      const result = await validateChange(change, { specs: [specWithRefs] });

      expect(
        result.warnings.some(
          (w) => w.code === ValidationCodes.REMOVING_REFERENCED_REQUIREMENT,
        ),
      ).toBe(true);
    });

    it("includes checksPerformed list", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      expect(result.checksPerformed).toBeDefined();
      expect(result.checksPerformed.length).toBeGreaterThan(0);
      expect(result.checksPerformed).toContain("completeness");
      expect(result.checksPerformed).toContain("conflicts");
    });

    it("includes checkedAt timestamp", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs });

      expect(result.checkedAt).toBeDefined();
      expect(() => new Date(result.checkedAt)).not.toThrow();
    });
  });

  describe("validation with empty specs", () => {
    it("validates change when no specs exist (new project)", async () => {
      const change: Change = {
        id: "initial-setup",
        title: "Initial Setup",
        status: "draft",
        created_at: new Date().toISOString(),
        tasks: [
          {
            id: "tk-init0001",
            title: "Create initial spec",
            status: "pending",
            priority: 0,
            created_at: new Date().toISOString(),
          },
        ],
        deltas: {
          "new-capability": [
            {
              id: "dl-init0001",
              operation: "add",
              requirement: {
                id: "rq-init0001",
                title: "First Requirement",
                body: "The very first requirement.",
                priority: "must",
                scenarios: [
                  {
                    id: "rq-init0001.1",
                    title: "First scenario",
                    given: ["nothing exists"],
                    when: "system initializes",
                    then: ["capability is created"],
                  },
                ],
              },
            } as Extract<Delta, { operation: "add" }>,
          ],
        },
      };

      const result = await validateChange(change, { specs: [] });

      expect(result.passed).toBe(true);
    });
  });

  describe("change conflict detection", () => {
    it("warns when another active change touches the same capability", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;

      // Ensure the change has proper scenarios
      const delta = change.deltas["test-capability"][0] as Extract<
        Delta,
        { operation: "add" }
      >;
      delta.requirement.scenarios = [
        {
          id: "rq-new00001.1",
          title: "Test scenario",
          given: ["a precondition"],
          when: "action occurs",
          then: ["expected outcome"],
        },
      ];

      const activeChanges = [
        {
          id: "other-change-123",
          title: "Another Change",
          capabilities: ["test-capability"], // Same capability
        },
      ];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs, activeChanges });

      expect(
        result.warnings.some(
          (w) => w.code === ValidationCodes.OVERLAPPING_CAPABILITY,
        ),
      ).toBe(true);

      const warning = result.warnings.find(
        (w) => w.code === ValidationCodes.OVERLAPPING_CAPABILITY,
      );
      expect(warning?.details?.otherChangeId).toBe("other-change-123");
      expect(warning?.details?.overlappingCapabilities).toContain(
        "test-capability",
      );
    });

    it("does not warn when active changes touch different capabilities", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;

      const delta = change.deltas["test-capability"][0] as Extract<
        Delta,
        { operation: "add" }
      >;
      delta.requirement.scenarios = [
        {
          id: "rq-new00001.1",
          title: "Test scenario",
          given: ["a precondition"],
          when: "action occurs",
          then: ["expected outcome"],
        },
      ];

      const activeChanges = [
        {
          id: "other-change-456",
          title: "Different Change",
          capabilities: ["different-capability"], // Different capability
        },
      ];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs, activeChanges });

      expect(
        result.warnings.some(
          (w) => w.code === ValidationCodes.OVERLAPPING_CAPABILITY,
        ),
      ).toBe(false);
    });

    it("excludes self from conflict detection", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;

      const delta = change.deltas["test-capability"][0] as Extract<
        Delta,
        { operation: "add" }
      >;
      delta.requirement.scenarios = [
        {
          id: "rq-new00001.1",
          title: "Test scenario",
          given: ["a precondition"],
          when: "action occurs",
          then: ["expected outcome"],
        },
      ];

      // Include the same change ID in active changes (simulating real scenario)
      const activeChanges = [
        {
          id: change.id, // Same ID as the change being validated
          title: change.title,
          capabilities: ["test-capability"],
        },
      ];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, { specs, activeChanges });

      // Should not warn about itself
      expect(
        result.warnings.some(
          (w) => w.code === ValidationCodes.OVERLAPPING_CAPABILITY,
        ),
      ).toBe(false);
    });

    it("detects multiple overlapping capabilities", async () => {
      const change: Change = {
        id: "multi-cap-change",
        title: "Multi-Capability Change",
        status: "draft",
        created_at: new Date().toISOString(),
        tasks: [
          {
            id: "tk-multi001",
            title: "Update multiple",
            status: "pending",
            priority: 0,
            created_at: new Date().toISOString(),
          },
        ],
        deltas: {
          "capability-a": [
            {
              id: "dl-a001",
              operation: "add",
              requirement: {
                id: "rq-a001",
                title: "Req A",
                body: "Body A",
                priority: "must",
                scenarios: [
                  {
                    id: "rq-a001.1",
                    title: "Scenario",
                    given: ["x"],
                    when: "y",
                    then: ["z"],
                  },
                ],
              },
            } as Extract<Delta, { operation: "add" }>,
          ],
          "capability-b": [
            {
              id: "dl-b001",
              operation: "add",
              requirement: {
                id: "rq-b001",
                title: "Req B",
                body: "Body B",
                priority: "must",
                scenarios: [
                  {
                    id: "rq-b001.1",
                    title: "Scenario",
                    given: ["x"],
                    when: "y",
                    then: ["z"],
                  },
                ],
              },
            } as Extract<Delta, { operation: "add" }>,
          ],
        },
      };

      const activeChanges = [
        {
          id: "conflicting-change",
          title: "Conflicting Change",
          capabilities: ["capability-a", "capability-b"], // Both overlap
        },
      ];

      const result = await validateChange(change, {
        specs: [],
        activeChanges,
      });

      const warning = result.warnings.find(
        (w) => w.code === ValidationCodes.OVERLAPPING_CAPABILITY,
      );
      expect(warning).toBeDefined();
      expect(warning?.details?.overlappingCapabilities).toContain(
        "capability-a",
      );
      expect(warning?.details?.overlappingCapabilities).toContain(
        "capability-b",
      );
    });

    it("handles no active changes gracefully", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;

      const delta = change.deltas["test-capability"][0] as Extract<
        Delta,
        { operation: "add" }
      >;
      delta.requirement.scenarios = [
        {
          id: "rq-new00001.1",
          title: "Test scenario",
          given: ["a precondition"],
          when: "action occurs",
          then: ["expected outcome"],
        },
      ];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];

      // No activeChanges passed
      const result = await validateChange(change, { specs });

      expect(
        result.warnings.some(
          (w) => w.code === ValidationCodes.OVERLAPPING_CAPABILITY,
        ),
      ).toBe(false);
    });

    it("handles empty active changes array gracefully", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;

      const delta = change.deltas["test-capability"][0] as Extract<
        Delta,
        { operation: "add" }
      >;
      delta.requirement.scenarios = [
        {
          id: "rq-new00001.1",
          title: "Test scenario",
          given: ["a precondition"],
          when: "action occurs",
          then: ["expected outcome"],
        },
      ];

      const specs: Spec[] = [SAMPLE_SPEC as Spec];
      const result = await validateChange(change, {
        specs,
        activeChanges: [],
      });

      expect(
        result.warnings.some(
          (w) => w.code === ValidationCodes.OVERLAPPING_CAPABILITY,
        ),
      ).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles change with no deltas", async () => {
      const change: Change = {
        id: "no-deltas",
        title: "No Deltas",
        status: "draft",
        created_at: new Date().toISOString(),
        tasks: [],
        deltas: {},
      };

      const result = await validateChange(change, { specs: [] });

      // Should warn but not error
      expect(
        result.warnings.some((w) => w.code === ValidationCodes.NO_DELTAS),
      ).toBe(true);
      expect(
        result.warnings.some((w) => w.code === ValidationCodes.NO_TASKS),
      ).toBe(true);
    });

    it("handles change with no tasks", async () => {
      const change = structuredClone(SAMPLE_CHANGE) as Change;
      change.tasks = [];

      const result = await validateChange(change, { specs: [] });

      expect(
        result.warnings.some((w) => w.code === ValidationCodes.NO_TASKS),
      ).toBe(true);
    });

    it("validates multiple capabilities at once", async () => {
      const secondSpec: Spec = {
        name: "another-capability",
        title: "Another Capability",
        purpose: "Testing multiple specs",
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        requirements: [
          {
            id: "rq-another01",
            title: "Another Requirement",
            body: "From another spec.",
            priority: "should",
          },
        ],
      };

      const change: Change = {
        id: "multi-spec",
        title: "Multi-Spec Change",
        status: "draft",
        created_at: new Date().toISOString(),
        tasks: [
          {
            id: "tk-multi001",
            title: "Update both",
            status: "pending",
            priority: 0,
            created_at: new Date().toISOString(),
          },
        ],
        deltas: {
          "test-capability": [
            {
              id: "dl-multi001",
              operation: "modify",
              target_id: "rq-test0001",
              changes: { title: "Updated Title" },
            } as Extract<Delta, { operation: "modify" }>,
          ],
          "another-capability": [
            {
              id: "dl-multi002",
              operation: "modify",
              target_id: "rq-another01",
              changes: { body: "Updated body." },
            } as Extract<Delta, { operation: "modify" }>,
          ],
        },
      };

      const result = await validateChange(change, {
        specs: [SAMPLE_SPEC as Spec, secondSpec],
      });

      expect(result.passed).toBe(true);
    });
  });
});
