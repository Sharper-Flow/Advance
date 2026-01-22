/**
 * Types Tests
 *
 * Test Zod schemas for runtime validation
 */

import { describe, test, expect } from "vitest";
import {
  SpecSchema,
  ChangeSchema,
  RequirementSchema,
  TaskSchema,
  DeltaSchema,
  ScenarioSchema,
  ProjectConfigSchema,
  PrioritySchema,
  TaskStatusSchema,
  DependencySchema,
  TddPhaseSchema,
  TddPhaseEvidenceSchema,
  TddEvidenceSchema,
  isLogicTask,
  isTrivialTask,
  hasCompleteTddEvidence,
  getTddComplianceStatus,
  truncateOutput,
  type Task,
} from "./types";
import { SAMPLE_SPEC, SAMPLE_CHANGE } from "./__tests__/setup";

describe("PrioritySchema", () => {
  test("accepts valid priorities", () => {
    expect(PrioritySchema.parse("must")).toBe("must");
    expect(PrioritySchema.parse("should")).toBe("should");
    expect(PrioritySchema.parse("may")).toBe("may");
  });

  test("rejects invalid priorities", () => {
    expect(() => PrioritySchema.parse("required")).toThrow();
    expect(() => PrioritySchema.parse("optional")).toThrow();
    expect(() => PrioritySchema.parse("")).toThrow();
  });
});

describe("TaskStatusSchema", () => {
  test("accepts valid statuses", () => {
    expect(TaskStatusSchema.parse("pending")).toBe("pending");
    expect(TaskStatusSchema.parse("in_progress")).toBe("in_progress");
    expect(TaskStatusSchema.parse("done")).toBe("done");
    expect(TaskStatusSchema.parse("cancelled")).toBe("cancelled");
  });

  test("rejects invalid statuses", () => {
    expect(() => TaskStatusSchema.parse("completed")).toThrow();
    expect(() => TaskStatusSchema.parse("blocked")).toThrow();
  });
});

describe("ScenarioSchema", () => {
  test("parses valid scenario", () => {
    const scenario = {
      id: "rq-abc123.1",
      title: "Test scenario",
      given: ["condition A", "condition B"],
      when: "action occurs",
      then: ["result X", "result Y"],
    };
    const result = ScenarioSchema.parse(scenario);
    expect(result.id).toBe("rq-abc123.1");
    expect(result.given).toHaveLength(2);
    expect(result.then).toHaveLength(2);
  });

  test("requires all fields", () => {
    expect(() =>
      ScenarioSchema.parse({
        id: "rq-abc123.1",
        title: "Test",
        // missing given, when, then
      }),
    ).toThrow();
  });
});

describe("RequirementSchema", () => {
  test("parses valid requirement", () => {
    const req = {
      id: "rq-abc12345",
      title: "Test Requirement",
      body: "This is the body",
      priority: "must",
    };
    const result = RequirementSchema.parse(req);
    expect(result.id).toBe("rq-abc12345");
    expect(result.priority).toBe("must");
  });

  test("accepts optional tags and scenarios", () => {
    const req = {
      id: "rq-abc12345",
      title: "Test Requirement",
      body: "This is the body",
      priority: "should",
      tags: ["security", "auth"],
      scenarios: [
        {
          id: "rq-abc12345.1",
          title: "Scenario",
          given: ["a"],
          when: "b",
          then: ["c"],
        },
      ],
    };
    const result = RequirementSchema.parse(req);
    expect(result.tags).toEqual(["security", "auth"]);
    expect(result.scenarios).toHaveLength(1);
  });
});

describe("SpecSchema", () => {
  test("parses sample spec fixture", () => {
    const result = SpecSchema.parse(SAMPLE_SPEC);
    expect(result.name).toBe("test-capability");
    expect(result.requirements).toHaveLength(2);
    expect(result.requirements[0].scenarios).toHaveLength(2);
  });

  test("requires all mandatory fields", () => {
    expect(() =>
      SpecSchema.parse({
        name: "test",
        // missing title, purpose, version, updated_at, requirements
      }),
    ).toThrow();
  });
});

describe("DependencySchema", () => {
  test("parses valid dependencies", () => {
    const dep = { type: "blocked_by", target: "tk-abc123" };
    const result = DependencySchema.parse(dep);
    expect(result.type).toBe("blocked_by");
    expect(result.target).toBe("tk-abc123");
  });

  test("accepts all dependency types", () => {
    expect(DependencySchema.parse({ type: "related", target: "x" }).type).toBe(
      "related",
    );
    expect(
      DependencySchema.parse({ type: "discovered_from", target: "x" }).type,
    ).toBe("discovered_from");
    expect(DependencySchema.parse({ type: "parent", target: "x" }).type).toBe(
      "parent",
    );
  });
});

describe("TaskSchema", () => {
  test("parses valid task", () => {
    const task = {
      id: "tk-abc12345",
      title: "Implement feature",
      status: "pending",
      priority: 0,
      created_at: "2026-01-21T00:00:00Z",
    };
    const result = TaskSchema.parse(task);
    expect(result.id).toBe("tk-abc12345");
    expect(result.status).toBe("pending");
  });

  test("parses task with dependencies", () => {
    const task = {
      id: "tk-abc12345",
      title: "Write tests",
      status: "pending",
      priority: 1,
      created_at: "2026-01-21T00:00:00Z",
      deps: [{ type: "blocked_by", target: "tk-xyz" }],
    };
    const result = TaskSchema.parse(task);
    expect(result.deps).toHaveLength(1);
    expect(result.deps![0].type).toBe("blocked_by");
  });

  test("accepts optional timestamps", () => {
    const task = {
      id: "tk-abc12345",
      title: "Done task",
      status: "done",
      priority: 0,
      created_at: "2026-01-21T00:00:00Z",
      started_at: "2026-01-21T01:00:00Z",
      completed_at: "2026-01-21T02:00:00Z",
      completed_by: "agent",
    };
    const result = TaskSchema.parse(task);
    expect(result.started_at).toBe("2026-01-21T01:00:00Z");
    expect(result.completed_at).toBe("2026-01-21T02:00:00Z");
  });
});

describe("DeltaSchema", () => {
  test("parses add delta", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "add",
      requirement: {
        id: "rq-new12345",
        title: "New Requirement",
        body: "Body text",
        priority: "must",
      },
    };
    const result = DeltaSchema.parse(delta);
    expect(result.operation).toBe("add");
    if (result.operation === "add") {
      expect(result.requirement.id).toBe("rq-new12345");
    }
  });

  test("parses modify delta", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "modify",
      target_id: "rq-existing",
      changes: { body: "Updated body" },
    };
    const result = DeltaSchema.parse(delta);
    expect(result.operation).toBe("modify");
    if (result.operation === "modify") {
      expect(result.target_id).toBe("rq-existing");
    }
  });

  test("parses remove delta", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "remove",
      target_id: "rq-obsolete",
      reason: "Superseded by rq-new",
    };
    const result = DeltaSchema.parse(delta);
    expect(result.operation).toBe("remove");
    if (result.operation === "remove") {
      expect(result.reason).toBe("Superseded by rq-new");
    }
  });
});

describe("ChangeSchema", () => {
  test("parses sample change fixture", () => {
    const result = ChangeSchema.parse(SAMPLE_CHANGE);
    expect(result.id).toBe("add-feature-abc123");
    expect(result.tasks).toHaveLength(3);
    expect(result.deltas["test-capability"]).toHaveLength(1);
  });

  test("requires mandatory fields", () => {
    expect(() =>
      ChangeSchema.parse({
        id: "test",
        // missing title, status, created_at, tasks, deltas
      }),
    ).toThrow();
  });
});

describe("ProjectConfigSchema", () => {
  test("parses config with defaults", () => {
    const config = { name: "test-project" };
    const result = ProjectConfigSchema.parse(config);
    expect(result.name).toBe("test-project");
    expect(result.specs_dir).toBe("specs");
    expect(result.changes_dir).toBe("changes");
  });

  test("accepts custom paths", () => {
    const config = {
      name: "custom",
      specs_dir: "custom/specs",
      db_dir: ".custom-db",
    };
    const result = ProjectConfigSchema.parse(config);
    expect(result.specs_dir).toBe("custom/specs");
    expect(result.db_dir).toBe(".custom-db");
  });
});

// =============================================================================
// TDD Schema Tests
// =============================================================================

describe("TddPhaseSchema", () => {
  test("accepts valid phases", () => {
    expect(TddPhaseSchema.parse("none")).toBe("none");
    expect(TddPhaseSchema.parse("red")).toBe("red");
    expect(TddPhaseSchema.parse("green")).toBe("green");
    expect(TddPhaseSchema.parse("refactor")).toBe("refactor");
    expect(TddPhaseSchema.parse("complete")).toBe("complete");
  });

  test("rejects invalid phases", () => {
    expect(() => TddPhaseSchema.parse("failing")).toThrow();
    expect(() => TddPhaseSchema.parse("passing")).toThrow();
  });
});

describe("TddPhaseEvidenceSchema", () => {
  test("parses full evidence", () => {
    const evidence = {
      test_file: "test/feature.test.ts",
      command: "pnpm test",
      output_snippet: "PASS: 1 test",
      exit_code: 0,
      recorded_at: "2026-01-22T00:00:00Z",
    };
    const result = TddPhaseEvidenceSchema.parse(evidence);
    expect(result.test_file).toBe("test/feature.test.ts");
    expect(result.exit_code).toBe(0);
  });

  test("accepts partial evidence", () => {
    const evidence = { exit_code: 1 };
    const result = TddPhaseEvidenceSchema.parse(evidence);
    expect(result.exit_code).toBe(1);
    expect(result.test_file).toBeUndefined();
  });

  test("accepts empty evidence", () => {
    const result = TddPhaseEvidenceSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("TddEvidenceSchema", () => {
  test("parses full TDD evidence", () => {
    const evidence = {
      red: { exit_code: 1, recorded_at: "2026-01-22T00:00:00Z" },
      green: { exit_code: 0, recorded_at: "2026-01-22T01:00:00Z" },
    };
    const result = TddEvidenceSchema.parse(evidence);
    expect(result.red?.exit_code).toBe(1);
    expect(result.green?.exit_code).toBe(0);
  });

  test("parses skipped evidence", () => {
    const evidence = {
      skipped: true,
      skip_reason: "trivial: docs change",
    };
    const result = TddEvidenceSchema.parse(evidence);
    expect(result.skipped).toBe(true);
    expect(result.skip_reason).toBe("trivial: docs change");
  });
});

// =============================================================================
// TDD Helper Function Tests
// =============================================================================

describe("isLogicTask", () => {
  test("detects logic-heavy tasks", () => {
    expect(isLogicTask("Implement user authentication")).toBe(true);
    expect(isLogicTask("Create API endpoint")).toBe(true);
    expect(isLogicTask("Add validation for input")).toBe(true);
    expect(isLogicTask("Fix the login bug")).toBe(true);
    expect(isLogicTask("Refactor the handler")).toBe(true);
    expect(isLogicTask("Implement the feature")).toBe(true);
  });

  test("returns false for trivial tasks", () => {
    expect(isLogicTask("Update README")).toBe(false);
    expect(isLogicTask("Fix typo in docs")).toBe(false);
    expect(isLogicTask("Update configuration")).toBe(false);
  });

  test("returns false for non-matching tasks", () => {
    expect(isLogicTask("Deploy to production")).toBe(false);
    expect(isLogicTask("Review PR")).toBe(false);
  });
});

describe("isTrivialTask", () => {
  test("detects trivial tasks", () => {
    expect(isTrivialTask("Update README")).toBe(true);
    expect(isTrivialTask("Fix typo")).toBe(true);
    expect(isTrivialTask("Update documentation")).toBe(true);
    expect(isTrivialTask("Update config file")).toBe(true);
    expect(isTrivialTask("Format code")).toBe(true);
    expect(isTrivialTask("Lint fixes")).toBe(true);
    expect(isTrivialTask("Rename variable")).toBe(true);
    expect(isTrivialTask("Cleanup unused imports")).toBe(true);
  });

  test("returns false for logic tasks", () => {
    expect(isTrivialTask("Implement feature")).toBe(false);
    expect(isTrivialTask("Create endpoint")).toBe(false);
  });
});

describe("hasCompleteTddEvidence", () => {
  const baseTask: Task = {
    id: "tk-test",
    title: "Test task",
    status: "pending",
    priority: 0,
    created_at: "2026-01-22T00:00:00Z",
    tdd_phase: "none",
  };

  test("returns false when no evidence", () => {
    expect(hasCompleteTddEvidence(baseTask)).toBe(false);
  });

  test("returns false with only red phase", () => {
    const task = {
      ...baseTask,
      tdd_evidence: { red: { recorded_at: "2026-01-22T00:00:00Z" } },
    };
    expect(hasCompleteTddEvidence(task)).toBe(false);
  });

  test("returns true with both red and green", () => {
    const task = {
      ...baseTask,
      tdd_evidence: {
        red: { recorded_at: "2026-01-22T00:00:00Z" },
        green: { recorded_at: "2026-01-22T01:00:00Z" },
      },
    };
    expect(hasCompleteTddEvidence(task)).toBe(true);
  });

  test("returns true when skipped with reason", () => {
    const task = {
      ...baseTask,
      tdd_evidence: { skipped: true, skip_reason: "trivial" },
    };
    expect(hasCompleteTddEvidence(task)).toBe(true);
  });

  test("returns false when skipped without reason", () => {
    const task = {
      ...baseTask,
      tdd_evidence: { skipped: true },
    };
    expect(hasCompleteTddEvidence(task)).toBe(false);
  });
});

describe("getTddComplianceStatus", () => {
  const baseTask: Task = {
    id: "tk-test",
    title: "Implement feature",
    status: "pending",
    priority: 0,
    created_at: "2026-01-22T00:00:00Z",
    tdd_phase: "none",
  };

  test("returns missing for logic task without evidence", () => {
    expect(getTddComplianceStatus(baseTask)).toBe("missing");
  });

  test("returns compliant for logic task with evidence", () => {
    const task = {
      ...baseTask,
      tdd_evidence: {
        red: { recorded_at: "2026-01-22T00:00:00Z" },
        green: { recorded_at: "2026-01-22T01:00:00Z" },
      },
    };
    expect(getTddComplianceStatus(task)).toBe("compliant");
  });

  test("returns compliant when skipped with reason", () => {
    const task = {
      ...baseTask,
      tdd_evidence: { skipped: true, skip_reason: "legacy code" },
    };
    expect(getTddComplianceStatus(task)).toBe("compliant");
  });

  test("returns not_required for trivial task", () => {
    const task = { ...baseTask, title: "Update README" };
    expect(getTddComplianceStatus(task)).toBe("not_required");
  });

  test("returns not_required for non-matching task", () => {
    const task = { ...baseTask, title: "Deploy to production" };
    expect(getTddComplianceStatus(task)).toBe("not_required");
  });
});

describe("truncateOutput", () => {
  test("returns short output unchanged", () => {
    expect(truncateOutput("short")).toBe("short");
  });

  test("truncates long output", () => {
    const long = "x".repeat(1000);
    const result = truncateOutput(long);
    expect(result.length).toBeLessThan(600);
    expect(result).toContain("[truncated]");
  });

  test("respects custom max length", () => {
    const result = truncateOutput("hello world", 5);
    expect(result).toBe("hello\n... [truncated]");
  });
});
