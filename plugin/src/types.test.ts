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
