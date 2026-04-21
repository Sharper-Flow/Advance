/**
 * Types Tests
 *
 * Test Zod schemas for runtime validation
 */

import { describe, test, expect } from "vitest";
import {
  SpecSchema,
  ChangeSchema,
  ChangeStatusSchema,
  ChangeClosureSchema,
  CrossProjectOriginSchema,
  GATE_DEFS,
  GateIdSchema,
  GATE_ORDER,
  GatesSchema,
  createDefaultGates,
  GateCompletionSchema,
  canCompleteGate,
  RequirementSchema,
  TaskSchema,
  DeltaSchema,
  ScenarioSchema,
  ProjectConfigSchema,
  FeatureFlagsSchema,
  ErrorRecoverySchema,
  AttemptSchema,
  PrioritySchema,
  TaskStatusSchema,
  DependencySchema,
  TddPhaseSchema,
  TddPhaseEvidenceSchema,
  TddEvidenceSchema,
  AgendaItemSchema,
  ClarifyFindingSnapshotSchema,
  ReentryHistoryEntrySchema,
  JudgmentCallSchema,
  JudgmentCallCategorySchema,
  InvestmentReportSchema,
  ThresholdTierSchema,
  isLogicTask,
  isTrivialTask,
  hasCompleteTddEvidence,
  getTddComplianceStatus,
  truncateOutput,
  stripTddEvidence,
  BulkCloseSelectorSchema,
  BulkCloseResultSchema,
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

  test("parses modify delta with valid requirement keys", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "modify",
      target_id: "rq-existing",
      changes: { body: "Updated body", priority: "should" },
    };
    const result = DeltaSchema.parse(delta);
    expect(result.operation).toBe("modify");
    if (result.operation === "modify") {
      expect(result.target_id).toBe("rq-existing");
      expect(result.changes.body).toBe("Updated body");
      expect(result.changes.priority).toBe("should");
    }
  });

  test("rejects modify delta with unknown keys in changes", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "modify",
      target_id: "rq-existing",
      changes: { nonexistent_field: 42 },
    };
    expect(() => DeltaSchema.parse(delta)).toThrow();
  });

  test("accepts modify delta with title change", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "modify",
      target_id: "rq-existing",
      changes: { title: "New Title" },
    };
    const result = DeltaSchema.parse(delta);
    if (result.operation === "modify") {
      expect(result.changes.title).toBe("New Title");
    }
  });

  test("accepts modify delta with tags change", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "modify",
      target_id: "rq-existing",
      changes: { tags: ["new-tag", "security"] },
    };
    const result = DeltaSchema.parse(delta);
    if (result.operation === "modify") {
      expect(result.changes.tags).toEqual(["new-tag", "security"]);
    }
  });

  test("accepts modify delta with scenarios replacement", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "modify",
      target_id: "rq-existing",
      changes: {
        scenarios: [
          {
            id: "rq-existing.1",
            title: "Updated scenario",
            given: ["condition"],
            when: "action",
            then: ["result"],
          },
        ],
      },
    };
    const result = DeltaSchema.parse(delta);
    if (result.operation === "modify") {
      expect(result.changes.scenarios).toHaveLength(1);
    }
  });

  test("rejects modify delta with invalid priority value in changes", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "modify",
      target_id: "rq-existing",
      changes: { priority: "critical" }, // not a valid priority
    };
    expect(() => DeltaSchema.parse(delta)).toThrow();
  });

  test("accepts modify delta with empty changes object", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "modify",
      target_id: "rq-existing",
      changes: {},
    };
    // Empty changes is valid (no-op modify)
    const result = DeltaSchema.parse(delta);
    expect(result.operation).toBe("modify");
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

  test("parses rename delta with title only", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "rename",
      target_id: "rq-existing",
      new_title: "Renamed Requirement",
    };
    const result = DeltaSchema.parse(delta);
    expect(result.operation).toBe("rename");
    if (result.operation === "rename") {
      expect(result.target_id).toBe("rq-existing");
      expect(result.new_title).toBe("Renamed Requirement");
      expect(result.new_id).toBeUndefined();
    }
  });

  test("parses rename delta with title and new ID", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "rename",
      target_id: "rq-old-id",
      new_title: "New Name",
      new_id: "rq-new-id",
    };
    const result = DeltaSchema.parse(delta);
    if (result.operation === "rename") {
      expect(result.new_title).toBe("New Name");
      expect(result.new_id).toBe("rq-new-id");
    }
  });

  test("rejects rename delta without new_title", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "rename",
      target_id: "rq-existing",
    };
    expect(() => DeltaSchema.parse(delta)).toThrow();
  });

  test("rejects rename delta without target_id", () => {
    const delta = {
      id: "dl-abc12345",
      operation: "rename",
      new_title: "Some Title",
    };
    expect(() => DeltaSchema.parse(delta)).toThrow();
  });
});

describe("ChangeSchema", () => {
  test("parses sample change fixture", () => {
    const result = ChangeSchema.parse(SAMPLE_CHANGE);
    expect(result.id).toBe("addFeature");
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

  test("parses change with github_issues field", () => {
    const changeWithIssues = {
      id: "testChange",
      title: "Test Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {},
      github_issues: [
        "https://github.com/org/repo/issues/123",
        "https://github.com/org/repo/issues/456",
      ],
    };
    const result = ChangeSchema.parse(changeWithIssues);
    expect(result.github_issues).toEqual([
      "https://github.com/org/repo/issues/123",
      "https://github.com/org/repo/issues/456",
    ]);
  });

  test("accepts change without github_issues (backwards compatible)", () => {
    const changeWithoutIssues = {
      id: "testChange",
      title: "Test Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {},
    };
    const result = ChangeSchema.parse(changeWithoutIssues);
    expect(result.github_issues).toBeUndefined();
  });

  test("rejects invalid URL in github_issues", () => {
    const changeWithInvalidUrl = {
      id: "testChange",
      title: "Test Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {},
      github_issues: ["not-a-valid-url"],
    };
    expect(() => ChangeSchema.parse(changeWithInvalidUrl)).toThrow();
  });

  test("accepts closed change status", () => {
    expect(ChangeStatusSchema.parse("closed")).toBe("closed");
  });

  test("parses structured change closure metadata", () => {
    const closure = {
      reason: "superseded",
      approved_by_user: true,
      approval_evidence: "User approved duplicate cleanup",
      superseded_by: "fooFeature2",
      approved_at: "2026-03-24T00:00:00Z",
    };

    expect(ChangeClosureSchema.parse(closure)).toEqual(closure);
  });

  test("parses change with closure metadata", () => {
    const closedChange = {
      id: "closedChange",
      title: "Closed Change",
      status: "closed",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {},
      closure: {
        reason: "not_planned",
        approved_by_user: true,
        approval_evidence: "User declined proposal",
        approved_at: "2026-03-24T00:00:00Z",
      },
    };

    const result = ChangeSchema.parse(closedChange);
    expect(result.status).toBe("closed");
    expect(result.closure?.reason).toBe("not_planned");
  });

  test("parses change with cross_project_origin", () => {
    const crossProjectChange = {
      id: "addWebhookHandler",
      title: "Add webhook handler",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {},
      cross_project_origin: {
        source_project: "pokeedge",
        source_path: "/home/user/dev/pokeedge",
        source_change_id: "addApiEndpoint",
        linked_at: "2026-01-01T01:00:00Z",
      },
    };

    const result = ChangeSchema.parse(crossProjectChange);
    expect(result.cross_project_origin).toBeDefined();
    expect(result.cross_project_origin?.source_project).toBe("pokeedge");
    expect(result.cross_project_origin?.source_path).toBe(
      "/home/user/dev/pokeedge",
    );
    expect(result.cross_project_origin?.source_change_id).toBe(
      "addApiEndpoint",
    );
    expect(result.cross_project_origin?.linked_at).toBe("2026-01-01T01:00:00Z");
  });

  test("accepts change without cross_project_origin (backwards compatible)", () => {
    const localChange = {
      id: "testChange",
      title: "Test Change",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      tasks: [],
      deltas: {},
    };
    const result = ChangeSchema.parse(localChange);
    expect(result.cross_project_origin).toBeUndefined();
  });

  test("cross_project_origin source_change_id is optional", () => {
    const origin = {
      source_project: "pokeedge",
      source_path: "/home/user/dev/pokeedge",
      linked_at: "2026-01-01T01:00:00Z",
    };
    const result = CrossProjectOriginSchema.parse(origin);
    expect(result.source_change_id).toBeUndefined();
  });

  test("cross_project_origin requires source_project and source_path", () => {
    expect(() =>
      CrossProjectOriginSchema.parse({
        source_path: "/some/path",
        linked_at: "2026-01-01T01:00:00Z",
      }),
    ).toThrow();

    expect(() =>
      CrossProjectOriginSchema.parse({
        source_project: "test",
        linked_at: "2026-01-01T01:00:00Z",
      }),
    ).toThrow();
  });
});

describe("BulkCloseSelectorSchema", () => {
  test("accepts explicit selector with changeIds", () => {
    const selector = { kind: "explicit", changeIds: ["chg-a", "chg-b"] };
    const result = BulkCloseSelectorSchema.parse(selector);
    expect(result.kind).toBe("explicit");
    if (result.kind === "explicit") {
      expect(result.changeIds).toEqual(["chg-a", "chg-b"]);
    }
  });

  test("rejects explicit selector with empty changeIds", () => {
    expect(() =>
      BulkCloseSelectorSchema.parse({ kind: "explicit", changeIds: [] }),
    ).toThrow();
  });

  test("accepts filter selector with status", () => {
    const selector = { kind: "filter", filter: { status: "draft" } };
    const result = BulkCloseSelectorSchema.parse(selector);
    expect(result.kind).toBe("filter");
    if (result.kind === "filter") {
      expect(result.filter.status).toBe("draft");
    }
  });

  test("accepts filter selector with titleContains", () => {
    const selector = {
      kind: "filter",
      filter: { titleContains: "parity" },
    };
    const result = BulkCloseSelectorSchema.parse(selector);
    if (result.kind === "filter") {
      expect(result.filter.titleContains).toBe("parity");
    }
  });

  test("accepts filter selector with prefix", () => {
    const selector = { kind: "filter", filter: { prefix: "test" } };
    const result = BulkCloseSelectorSchema.parse(selector);
    if (result.kind === "filter") {
      expect(result.filter.prefix).toBe("test");
    }
  });

  test("accepts filter selector with createdBefore", () => {
    const selector = {
      kind: "filter",
      filter: { createdBefore: "2026-01-01T00:00:00Z" },
    };
    const result = BulkCloseSelectorSchema.parse(selector);
    if (result.kind === "filter") {
      expect(result.filter.createdBefore).toBe("2026-01-01T00:00:00Z");
    }
  });

  test("accepts filter selector with lastActivityBefore", () => {
    const selector = {
      kind: "filter",
      filter: { lastActivityBefore: "2026-01-01T00:00:00Z" },
    };
    const result = BulkCloseSelectorSchema.parse(selector);
    if (result.kind === "filter") {
      expect(result.filter.lastActivityBefore).toBe("2026-01-01T00:00:00Z");
    }
  });

  test("accepts filter selector with multiple fields", () => {
    const selector = {
      kind: "filter",
      filter: {
        status: "draft",
        titleContains: "parity",
        createdBefore: "2026-01-01T00:00:00Z",
      },
    };
    const result = BulkCloseSelectorSchema.parse(selector);
    expect(result.kind).toBe("filter");
  });

  test("rejects selector without kind", () => {
    expect(() =>
      BulkCloseSelectorSchema.parse({ changeIds: ["chg-a"] }),
    ).toThrow();
  });

  test("rejects selector with unknown kind", () => {
    expect(() =>
      BulkCloseSelectorSchema.parse({ kind: "unknown", changeIds: ["chg-a"] }),
    ).toThrow();
  });
});

describe("BulkCloseResultSchema", () => {
  test("accepts result with all successes", () => {
    const result = {
      success: true,
      closed: 2,
      results: [
        { changeId: "chg-a", success: true },
        { changeId: "chg-b", success: true },
      ],
      message: "Closed 2 change(s).",
    };
    const parsed = BulkCloseResultSchema.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.closed).toBe(2);
    expect(parsed.results).toHaveLength(2);
  });

  test("accepts result with CLOSE_FAILED entries", () => {
    const result = {
      success: false,
      closed: 1,
      results: [
        { changeId: "chg-a", success: true },
        { changeId: "chg-b", success: false, error: "Already closed" },
      ],
      message: "Partial close: 1/2 succeeded.",
    };
    const parsed = BulkCloseResultSchema.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.results[1].error).toBe("Already closed");
  });

  test("rejects result missing success", () => {
    expect(() =>
      BulkCloseResultSchema.parse({
        closed: 1,
        results: [{ changeId: "chg-a", success: true }],
        message: "Closed 1 change(s).",
      }),
    ).toThrow();
  });

  test("rejects result missing closed", () => {
    expect(() =>
      BulkCloseResultSchema.parse({
        success: true,
        results: [{ changeId: "chg-a", success: true }],
        message: "Closed 1 change(s).",
      }),
    ).toThrow();
  });

  test("rejects result missing results", () => {
    expect(() =>
      BulkCloseResultSchema.parse({
        success: true,
        closed: 0,
        message: "No changes closed.",
      }),
    ).toThrow();
  });

  test("rejects result missing message", () => {
    expect(() =>
      BulkCloseResultSchema.parse({
        success: true,
        closed: 1,
        results: [{ changeId: "chg-a", success: true }],
      }),
    ).toThrow();
  });

  test("rejects result entry missing changeId", () => {
    expect(() =>
      BulkCloseResultSchema.parse({
        success: true,
        closed: 1,
        results: [{ success: true }],
        message: "Closed 1 change(s).",
      }),
    ).toThrow();
  });

  test("rejects result entry missing success", () => {
    expect(() =>
      BulkCloseResultSchema.parse({
        success: true,
        closed: 1,
        results: [{ changeId: "chg-a" }],
        message: "Closed 1 change(s).",
      }),
    ).toThrow();
  });
});

describe("ProjectConfigSchema", () => {
  test("parses config with defaults", () => {
    const config = { name: "test-project" };
    const result = ProjectConfigSchema.parse(config);
    expect(result.name).toBe("test-project");
    expect(result.specs_dir).toBe(".adv/specs");
    expect(result.changes_dir).toBe(".adv/changes");
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

  test("features block defaults to all-on with current behavior", () => {
    const config = { name: "test-project" };
    const result = ProjectConfigSchema.parse(config);
    expect(result.features).toBeDefined();
    expect(result.features?.tdd_enforcement).toBe("strict");
    expect(result.features?.worktree_auto_create).toBe(true);
    expect(result.features?.gate_enforcement).toBe("strict");
    expect(result.features?.wisdom_accumulation).toBe(true);
  });

  test("features block accepts partial overrides", () => {
    const config = {
      name: "test-project",
      features: { tdd_enforcement: "advisory" },
    };
    const result = ProjectConfigSchema.parse(config);
    expect(result.features?.tdd_enforcement).toBe("advisory");
    // Other flags still default
    expect(result.features?.worktree_auto_create).toBe(true);
    expect(result.features?.gate_enforcement).toBe("strict");
  });

  test("features block accepts tdd_enforcement: off", () => {
    const config = {
      name: "test-project",
      features: { tdd_enforcement: "off" },
    };
    const result = ProjectConfigSchema.parse(config);
    expect(result.features?.tdd_enforcement).toBe("off");
  });

  test("features block rejects invalid tdd_enforcement value", () => {
    const config = {
      name: "test-project",
      features: { tdd_enforcement: "invalid" },
    };
    expect(() => ProjectConfigSchema.parse(config)).toThrow();
  });

  test("features block rejects invalid gate_enforcement value", () => {
    const config = {
      name: "test-project",
      features: { gate_enforcement: "invalid" },
    };
    expect(() => ProjectConfigSchema.parse(config)).toThrow();
  });
});

describe("FeatureFlagsSchema", () => {
  test("parses empty object with all defaults", () => {
    const result = FeatureFlagsSchema.parse({});
    expect(result.tdd_enforcement).toBe("strict");
    expect(result.worktree_auto_create).toBe(true);
    expect(result.gate_enforcement).toBe("strict");
    expect(result.wisdom_accumulation).toBe(true);
  });

  test("accepts all valid tdd_enforcement values", () => {
    expect(
      FeatureFlagsSchema.parse({ tdd_enforcement: "strict" }).tdd_enforcement,
    ).toBe("strict");
    expect(
      FeatureFlagsSchema.parse({ tdd_enforcement: "advisory" }).tdd_enforcement,
    ).toBe("advisory");
    expect(
      FeatureFlagsSchema.parse({ tdd_enforcement: "off" }).tdd_enforcement,
    ).toBe("off");
  });

  test("accepts all valid gate_enforcement values", () => {
    expect(
      FeatureFlagsSchema.parse({ gate_enforcement: "strict" }).gate_enforcement,
    ).toBe("strict");
    expect(
      FeatureFlagsSchema.parse({ gate_enforcement: "advisory" })
        .gate_enforcement,
    ).toBe("advisory");
  });

  test("accepts boolean flags", () => {
    const result = FeatureFlagsSchema.parse({
      worktree_auto_create: false,
      wisdom_accumulation: false,
    });
    expect(result.worktree_auto_create).toBe(false);
    expect(result.wisdom_accumulation).toBe(false);
  });

  describe("slop_scan config block", () => {
    test("defaults to inner schema values when slop_scan block is absent", () => {
      const result = FeatureFlagsSchema.parse({});
      expect(result.slop_scan).toBeDefined();
      // Must match SlopScanConfigSchema inner defaults — single source of truth
      expect(result.slop_scan?.nesting_depth_threshold).toBe(4);
      expect(result.slop_scan?.defensive_guard_threshold).toBe(3);
      expect(result.slop_scan?.complexity_threshold).toBe(10);
      expect(result.slop_scan?.ast_timeout_ms).toBe(10000);
    });

    test("defaults to smart values when slop_scan block is empty object", () => {
      const result = FeatureFlagsSchema.parse({ slop_scan: {} });
      expect(result.slop_scan?.nesting_depth_threshold).toBe(4);
      expect(result.slop_scan?.defensive_guard_threshold).toBe(3);
      expect(result.slop_scan?.complexity_threshold).toBe(10);
      expect(result.slop_scan?.ast_timeout_ms).toBe(10000);
    });

    test("accepts partial override — only nesting_depth_threshold", () => {
      const result = FeatureFlagsSchema.parse({
        slop_scan: { nesting_depth_threshold: 6 },
      });
      expect(result.slop_scan?.nesting_depth_threshold).toBe(6);
      // Other thresholds remain at defaults
      expect(result.slop_scan?.defensive_guard_threshold).toBe(3);
      expect(result.slop_scan?.complexity_threshold).toBe(10);
      expect(result.slop_scan?.ast_timeout_ms).toBe(10000);
    });

    test("accepts partial override — only complexity_threshold", () => {
      const result = FeatureFlagsSchema.parse({
        slop_scan: { complexity_threshold: 15 },
      });
      expect(result.slop_scan?.complexity_threshold).toBe(15);
      expect(result.slop_scan?.nesting_depth_threshold).toBe(4);
    });

    test("accepts full override of all slop_scan fields", () => {
      const result = FeatureFlagsSchema.parse({
        slop_scan: {
          nesting_depth_threshold: 6,
          defensive_guard_threshold: 5,
          complexity_threshold: 20,
          ast_timeout_ms: 5000,
        },
      });
      expect(result.slop_scan?.nesting_depth_threshold).toBe(6);
      expect(result.slop_scan?.defensive_guard_threshold).toBe(5);
      expect(result.slop_scan?.complexity_threshold).toBe(20);
      expect(result.slop_scan?.ast_timeout_ms).toBe(5000);
    });

    test("rejects non-integer nesting_depth_threshold", () => {
      expect(() =>
        FeatureFlagsSchema.parse({
          slop_scan: { nesting_depth_threshold: "four" },
        }),
      ).toThrow();
    });

    test("rejects negative nesting_depth_threshold", () => {
      expect(() =>
        FeatureFlagsSchema.parse({
          slop_scan: { nesting_depth_threshold: -1 },
        }),
      ).toThrow();
    });

    test("rejects zero defensive_guard_threshold", () => {
      expect(() =>
        FeatureFlagsSchema.parse({
          slop_scan: { defensive_guard_threshold: 0 },
        }),
      ).toThrow();
    });

    test("rejects negative ast_timeout_ms", () => {
      expect(() =>
        FeatureFlagsSchema.parse({
          slop_scan: { ast_timeout_ms: -500 },
        }),
      ).toThrow();
    });

    test("slop_scan block does not affect other feature flags", () => {
      const result = FeatureFlagsSchema.parse({
        tdd_enforcement: "advisory",
        slop_scan: { nesting_depth_threshold: 5 },
      });
      expect(result.tdd_enforcement).toBe("advisory");
      expect(result.slop_scan?.nesting_depth_threshold).toBe(5);
      expect(result.worktree_auto_create).toBe(true);
    });

    test("unknown slop_scan keys are passed through (forward compatibility)", () => {
      const result = FeatureFlagsSchema.parse({
        slop_scan: { nesting_depth_threshold: 4, future_flag: true },
      });
      // passthrough allows unknown keys
      expect(result.slop_scan?.nesting_depth_threshold).toBe(4);
    });
  });

  describe("clarify_enforcement flag", () => {
    test("defaults to advisory when absent", () => {
      const result = FeatureFlagsSchema.parse({});
      expect(result.clarify_enforcement).toBe("advisory");
    });

    test("accepts all valid clarify_enforcement values", () => {
      expect(
        FeatureFlagsSchema.parse({ clarify_enforcement: "off" })
          .clarify_enforcement,
      ).toBe("off");
      expect(
        FeatureFlagsSchema.parse({ clarify_enforcement: "advisory" })
          .clarify_enforcement,
      ).toBe("advisory");
      expect(
        FeatureFlagsSchema.parse({ clarify_enforcement: "strict" })
          .clarify_enforcement,
      ).toBe("strict");
    });

    test("rejects invalid clarify_enforcement value", () => {
      expect(() =>
        FeatureFlagsSchema.parse({ clarify_enforcement: "invalid" }),
      ).toThrow();
    });

    test("clarify_enforcement does not affect other feature flags", () => {
      const result = FeatureFlagsSchema.parse({
        clarify_enforcement: "strict",
      });
      expect(result.clarify_enforcement).toBe("strict");
      expect(result.tdd_enforcement).toBe("strict");
      expect(result.gate_enforcement).toBe("strict");
      expect(result.worktree_auto_create).toBe(true);
    });

    test("ProjectConfigSchema includes clarify_enforcement default", () => {
      const config = { name: "test-project" };
      const result = ProjectConfigSchema.parse(config);
      expect(result.features?.clarify_enforcement).toBe("advisory");
    });

    test("ProjectConfigSchema accepts clarify_enforcement override", () => {
      const config = {
        name: "test-project",
        features: { clarify_enforcement: "strict" },
      };
      const result = ProjectConfigSchema.parse(config);
      expect(result.features?.clarify_enforcement).toBe("strict");
    });
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

  test("truncates long output at 80 chars by default", () => {
    const long = "x".repeat(1000);
    const result = truncateOutput(long);
    // 80 chars + "\n... [truncated]" suffix
    expect(result.length).toBeLessThanOrEqual(80 + "\n... [truncated]".length);
    expect(result).toContain("[truncated]");
  });

  test("respects custom max length", () => {
    const result = truncateOutput("hello world", 5);
    expect(result).toBe("hello\n... [truncated]");
  });
});

describe("stripTddEvidence", () => {
  test("strips output_snippet and command from red/green phases, keeps exit_code + recorded_at + test_file", () => {
    const evidence = {
      red: {
        test_file: "src/foo.test.ts",
        command: "bun test src/foo.test.ts",
        output_snippet: "FAIL: expected 1 to be 2",
        exit_code: 1,
        recorded_at: "2026-01-22T00:00:00Z",
      },
      green: {
        test_file: "src/foo.test.ts",
        command: "bun test src/foo.test.ts",
        output_snippet: "PASS: all tests passed",
        exit_code: 0,
        recorded_at: "2026-01-22T01:00:00Z",
      },
    };
    const stripped = stripTddEvidence(evidence);
    expect(stripped.red).toEqual({
      test_file: "src/foo.test.ts",
      exit_code: 1,
      recorded_at: "2026-01-22T00:00:00Z",
    });
    expect(stripped.green).toEqual({
      test_file: "src/foo.test.ts",
      exit_code: 0,
      recorded_at: "2026-01-22T01:00:00Z",
    });
  });

  test("preserves skipped + skip_reason unchanged", () => {
    const evidence = {
      skipped: true,
      skip_reason: "trivial: docs change",
    };
    const stripped = stripTddEvidence(evidence);
    expect(stripped).toEqual({
      skipped: true,
      skip_reason: "trivial: docs change",
    });
  });

  test("handles empty evidence gracefully", () => {
    const stripped = stripTddEvidence({});
    expect(stripped).toEqual({});
  });

  test("handles evidence with only red phase", () => {
    const evidence = {
      red: {
        command: "bun test",
        output_snippet: "FAIL",
        exit_code: 1,
        recorded_at: "2026-01-22T00:00:00Z",
      },
    };
    const stripped = stripTddEvidence(evidence);
    expect(stripped.red).toEqual({
      exit_code: 1,
      recorded_at: "2026-01-22T00:00:00Z",
    });
    expect(stripped.green).toBeUndefined();
  });

  test("handles phase with no test_file (omits it)", () => {
    const evidence = {
      red: {
        command: "bun test",
        output_snippet: "FAIL",
        exit_code: 1,
        recorded_at: "2026-01-22T00:00:00Z",
      },
    };
    const stripped = stripTddEvidence(evidence);
    expect(stripped.red?.test_file).toBeUndefined();
  });
});

// =============================================================================
// Backward Compatibility Tests
// =============================================================================

describe("Schema Backward Compatibility", () => {
  describe("TaskSchema", () => {
    test("parses task with extra/unknown fields (passthrough)", () => {
      const taskWithExtraFields = {
        id: "tk-test123",
        title: "Test task",
        status: "pending",
        priority: 0,
        created_at: "2026-01-22T00:00:00Z",
        tdd_phase: "none",
        // Extra fields that might exist in older/other projects
        custom_field: "some value",
        legacy_notes: "old data",
        metadata: { foo: "bar" },
      };

      const result = TaskSchema.parse(taskWithExtraFields);
      expect(result.id).toBe("tk-test123");
      expect(result.title).toBe("Test task");
      // Extra fields should be preserved
      expect((result as Record<string, unknown>).custom_field).toBe(
        "some value",
      );
      expect((result as Record<string, unknown>).legacy_notes).toBe("old data");
    });

    test("parses task without optional tdd fields (pre-TDD era)", () => {
      const oldTask = {
        id: "tk-old123",
        title: "Old task",
        status: "done",
        priority: 1,
        created_at: "2025-01-01T00:00:00Z",
        // No tdd_phase or tdd_evidence - defaults should apply
      };

      const result = TaskSchema.parse(oldTask);
      expect(result.id).toBe("tk-old123");
      expect(result.tdd_phase).toBe("none"); // default
      expect(result.tdd_evidence).toBeUndefined();
    });
  });

  describe("ChangeSchema", () => {
    test("parses change with extra/unknown fields (passthrough)", () => {
      const changeWithExtraFields = {
        id: "old-change-123",
        title: "Old change",
        status: "draft",
        created_at: "2025-06-01T00:00:00Z",
        tasks: [],
        deltas: {},
        // Extra fields from other projects/versions
        custom_metadata: { version: "1.0" },
        legacy_field: true,
        old_format_data: [1, 2, 3],
      };

      const result = ChangeSchema.parse(changeWithExtraFields);
      expect(result.id).toBe("old-change-123");
      expect(result.title).toBe("Old change");
      // Extra fields should be preserved
      expect((result as Record<string, unknown>).custom_metadata).toEqual({
        version: "1.0",
      });
      expect((result as Record<string, unknown>).legacy_field).toBe(true);
    });

    test("parses change without wisdom field (pre-wisdom era)", () => {
      const preWisdomChange = {
        id: "pre-wisdom-change",
        title: "Change before wisdom was added",
        status: "active",
        created_at: "2025-01-01T00:00:00Z",
        tasks: [
          {
            id: "tk-task1",
            title: "Task 1",
            status: "done",
            priority: 0,
            created_at: "2025-01-01T00:00:00Z",
          },
        ],
        deltas: {},
        // No wisdom field
      };

      const result = ChangeSchema.parse(preWisdomChange);
      expect(result.id).toBe("pre-wisdom-change");
      expect(result.wisdom).toBeUndefined(); // optional, not present
      expect(result.tasks).toHaveLength(1);
    });

    test("parses change with nested tasks containing extra fields", () => {
      const changeWithCustomTasks = {
        id: "custom-tasks-change",
        title: "Change with custom task fields",
        status: "draft",
        created_at: "2026-01-01T00:00:00Z",
        tasks: [
          {
            id: "tk-custom1",
            title: "Custom task",
            status: "pending",
            priority: 0,
            created_at: "2026-01-01T00:00:00Z",
            tdd_phase: "none",
            // Extra task fields
            assignee: "user@example.com",
            estimate_hours: 4,
            labels: ["bug", "urgent"],
          },
        ],
        deltas: {},
      };

      const result = ChangeSchema.parse(changeWithCustomTasks);
      expect(result.tasks[0].id).toBe("tk-custom1");
      // Extra fields on tasks should be preserved
      expect((result.tasks[0] as Record<string, unknown>).assignee).toBe(
        "user@example.com",
      );
      expect((result.tasks[0] as Record<string, unknown>).estimate_hours).toBe(
        4,
      );
    });
  });

  describe("SpecSchema", () => {
    test("parses spec with extra/unknown fields (passthrough)", () => {
      const specWithExtraFields = {
        name: "test-spec",
        title: "Test Spec",
        purpose: "Testing",
        version: "1.0.0",
        updated_at: "2026-01-01T00:00:00Z",
        requirements: [],
        // Extra fields
        custom_metadata: { author: "test" },
        legacy_field: "old value",
      };

      const result = SpecSchema.parse(specWithExtraFields);
      expect(result.name).toBe("test-spec");
      expect((result as Record<string, unknown>).custom_metadata).toEqual({
        author: "test",
      });
    });

    test("parses spec with requirements containing extra fields", () => {
      const specWithCustomReqs = {
        name: "custom-reqs-spec",
        title: "Spec with Custom Requirements",
        purpose: "Testing",
        version: "1.0.0",
        updated_at: "2026-01-01T00:00:00Z",
        requirements: [
          {
            id: "rq-test123",
            title: "Test Requirement",
            body: "Test body",
            priority: "must",
            // Extra fields on requirement
            author: "dev@example.com",
            reviewed: true,
          },
        ],
      };

      const result = SpecSchema.parse(specWithCustomReqs);
      expect(result.requirements[0].id).toBe("rq-test123");
      expect((result.requirements[0] as Record<string, unknown>).author).toBe(
        "dev@example.com",
      );
    });
  });

  describe("ProjectConfigSchema", () => {
    test("parses config with extra/unknown fields (passthrough)", () => {
      const configWithExtraFields = {
        name: "test-project",
        version: "1.0.0",
        // Extra fields
        custom_setting: true,
        legacy_paths: { old: "/path" },
      };

      const result = ProjectConfigSchema.parse(configWithExtraFields);
      expect(result.name).toBe("test-project");
      expect((result as Record<string, unknown>).custom_setting).toBe(true);
    });

    test("applies defaults for missing optional fields", () => {
      const minimalConfig = {
        name: "minimal-project",
      };

      const result = ProjectConfigSchema.parse(minimalConfig);
      expect(result.name).toBe("minimal-project");
      expect(result.specs_dir).toBe(".adv/specs");
      expect(result.changes_dir).toBe(".adv/changes");
    });
  });

  describe("AgendaItemSchema", () => {
    test("parses agenda item with extra/unknown fields (passthrough)", () => {
      const itemWithExtraFields = {
        id: "ag-test123",
        title: "Test Item",
        created_at: "2026-01-01T00:00:00Z",
        // Extra fields
        custom_tag: "urgent",
        external_id: "JIRA-123",
      };

      const result = AgendaItemSchema.parse(itemWithExtraFields);
      expect(result.id).toBe("ag-test123");
      expect((result as Record<string, unknown>).custom_tag).toBe("urgent");
      expect((result as Record<string, unknown>).external_id).toBe("JIRA-123");
    });

    test("applies defaults for missing optional fields", () => {
      const minimalItem = {
        id: "ag-minimal",
        title: "Minimal Item",
        created_at: "2026-01-01T00:00:00Z",
      };

      const result = AgendaItemSchema.parse(minimalItem);
      expect(result.priority).toBe("medium");
      expect(result.status).toBe("pending");
      expect(result.tdd_phase).toBe("none");
    });

    test("parses agenda item with github_issues field", () => {
      const itemWithIssues = {
        id: "ag-issues123",
        title: "Linked Item",
        created_at: "2026-01-01T00:00:00Z",
        github_issues: [
          "https://github.com/org/repo/issues/1",
          "https://github.com/org/repo/issues/2",
        ],
      };

      const result = AgendaItemSchema.parse(itemWithIssues);
      expect(result.github_issues).toEqual([
        "https://github.com/org/repo/issues/1",
        "https://github.com/org/repo/issues/2",
      ]);
    });

    test("accepts agenda item without github_issues (backwards compatible)", () => {
      const itemWithoutIssues = {
        id: "ag-noissues",
        title: "No Issues",
        created_at: "2026-01-01T00:00:00Z",
      };

      const result = AgendaItemSchema.parse(itemWithoutIssues);
      expect(result.github_issues).toBeUndefined();
    });

    test("rejects invalid URL in agenda item github_issues", () => {
      const itemWithInvalidUrl = {
        id: "ag-badurl",
        title: "Bad URL",
        created_at: "2026-01-01T00:00:00Z",
        github_issues: ["not-a-valid-url"],
      };
      expect(() => AgendaItemSchema.parse(itemWithInvalidUrl)).toThrow();
    });
  });

  describe("ScenarioSchema", () => {
    test("parses scenario with extra/unknown fields (passthrough)", () => {
      const scenarioWithExtraFields = {
        id: "rq-test.1",
        title: "Test Scenario",
        given: ["A user exists"],
        when: "User logs in",
        then: ["User sees dashboard"],
        // Extra fields
        notes: "Manual test required",
        automation_status: "pending",
      };

      const result = ScenarioSchema.parse(scenarioWithExtraFields);
      expect(result.id).toBe("rq-test.1");
      expect((result as Record<string, unknown>).notes).toBe(
        "Manual test required",
      );
    });
  });

  describe("backward compatibility", () => {
    test("ChangeSchema parses change with empty deltas object", () => {
      const changeWithEmptyDeltas = {
        id: "compat-test",
        title: "Compat Test",
        status: "draft",
        created_at: new Date().toISOString(),
        tasks: [],
        deltas: {},
      };

      const result = ChangeSchema.parse(changeWithEmptyDeltas);
      expect(result.id).toBe("compat-test");
      expect(Object.keys(result.deltas)).toHaveLength(0);
    });

    test("ChangeSchema parses change with only add deltas (pre-rename era)", () => {
      const result = ChangeSchema.parse(SAMPLE_CHANGE);
      expect(result.id).toBe("addFeature");
      const deltas = Object.values(result.deltas).flat();
      expect(deltas.every((d) => d.operation === "add")).toBe(true);
    });

    test("DeltaSchema still parses legacy add/modify/remove operations", () => {
      const addDelta = {
        id: "dl-compat01",
        operation: "add",
        requirement: {
          id: "rq-compat01",
          title: "Compat Requirement",
          body: "Test",
          priority: "must",
        },
      };
      expect(() => DeltaSchema.parse(addDelta)).not.toThrow();

      const modifyDelta = {
        id: "dl-compat02",
        operation: "modify",
        target_id: "rq-test0001",
        changes: { title: "Updated" },
      };
      expect(() => DeltaSchema.parse(modifyDelta)).not.toThrow();

      const removeDelta = {
        id: "dl-compat03",
        operation: "remove",
        target_id: "rq-test0001",
        reason: "Obsolete",
      };
      expect(() => DeltaSchema.parse(removeDelta)).not.toThrow();
    });
  });
});

describe("ErrorRecoverySchema", () => {
  test("accepts valid TRANSIENT error recovery", () => {
    const recovery = {
      last_error: "Network timeout",
      retry_count: 1,
      max_retries: 1,
      error_class: "TRANSIENT",
      next_strategy: "wait 5s and retry",
    };
    expect(() => ErrorRecoverySchema.parse(recovery)).not.toThrow();
    const parsed = ErrorRecoverySchema.parse(recovery);
    expect(parsed.error_class).toBe("TRANSIENT");
    expect(parsed.retry_count).toBe(1);
  });

  test("accepts all valid error_class values", () => {
    for (const cls of ["TRANSIENT", "SEMANTIC", "ENVIRONMENTAL", "FATAL"]) {
      const recovery = {
        last_error: "some error",
        retry_count: 0,
        max_retries: 3,
        error_class: cls,
      };
      expect(() => ErrorRecoverySchema.parse(recovery)).not.toThrow();
    }
  });

  test("rejects invalid error_class", () => {
    const recovery = {
      last_error: "error",
      retry_count: 0,
      max_retries: 3,
      error_class: "UNKNOWN",
    };
    expect(() => ErrorRecoverySchema.parse(recovery)).toThrow();
  });

  test("next_strategy is optional", () => {
    const recovery = {
      last_error: "error",
      retry_count: 0,
      max_retries: 3,
      error_class: "SEMANTIC",
    };
    const parsed = ErrorRecoverySchema.parse(recovery);
    expect(parsed.next_strategy).toBeUndefined();
  });
});

describe("TaskSchema error_recovery field", () => {
  const baseTask = {
    id: "tk-test001",
    title: "Test task",
    status: "pending",
    priority: 0,
    created_at: "2026-01-01T00:00:00Z",
    tdd_phase: "none",
  };

  test("task parses without error_recovery (optional)", () => {
    const parsed = TaskSchema.parse(baseTask);
    expect(parsed.error_recovery).toBeUndefined();
  });

  test("task parses with error_recovery field", () => {
    const task = {
      ...baseTask,
      error_recovery: {
        last_error: "Type error: string not assignable to number",
        retry_count: 2,
        max_retries: 3,
        error_class: "SEMANTIC",
        next_strategy: "Check type definitions in types.ts",
      },
    };
    const parsed = TaskSchema.parse(task);
    expect(parsed.error_recovery?.error_class).toBe("SEMANTIC");
    expect(parsed.error_recovery?.retry_count).toBe(2);
  });

  test("existing tasks without error_recovery still parse (backward compat)", () => {
    // Simulate a legacy task JSON with no error_recovery
    const legacyTask = {
      id: "tk-legacy01",
      title: "Legacy task",
      status: "done",
      priority: 0,
      created_at: "2025-01-01T00:00:00Z",
      tdd_phase: "complete",
    };
    expect(() => TaskSchema.parse(legacyTask)).not.toThrow();
  });
});

// =============================================================================
// GATE_DEFS — Single Source of Truth for Gate Definitions
// =============================================================================

describe("GATE_DEFS single source of truth", () => {
  test("GATE_DEFS array exists and drives GateIdSchema values", () => {
    const gateIds = GATE_DEFS.map((g: { id: string }) => g.id);
    expect(GateIdSchema.options).toEqual(gateIds);
  });

  test("GATE_ORDER is derived from GATE_DEFS order", () => {
    const gateIds = GATE_DEFS.map((g: { id: string }) => g.id);
    expect(GATE_ORDER).toEqual(gateIds);
  });

  test("GatesSchema has one field per GATE_DEFS entry", () => {
    const gateIds = GATE_DEFS.map((g: { id: string }) => g.id);
    const schemaKeys = Object.keys(GatesSchema.shape);
    expect(schemaKeys).toEqual(gateIds);
  });

  test("createDefaultGates returns one pending entry per GATE_DEFS entry", () => {
    const defaults = createDefaultGates();
    const gateIds = GATE_DEFS.map((g: { id: string }) => g.id);
    expect(Object.keys(defaults)).toEqual(gateIds);
    for (const id of gateIds) {
      expect(defaults[id].status).toBe("pending");
    }
  });
});

// =============================================================================
// Task.type field and GateCompletion.migrated_from
// =============================================================================

describe("TaskSchema.type field", () => {
  test("accepts all valid task types", () => {
    const types = [
      "code",
      "docs",
      "ops",
      "research",
      "approval",
      "verification",
    ];
    for (const t of types) {
      const task = TaskSchema.parse({
        id: "tk-test01",
        title: "Test task",
        status: "pending",
        priority: 0,
        created_at: "2026-01-01T00:00:00Z",
        tdd_phase: "none",
        type: t,
      });
      expect(task.type).toBe(t);
    }
  });

  test("defaults to 'code' when type is omitted (backward compat)", () => {
    const task = TaskSchema.parse({
      id: "tk-test02",
      title: "Legacy task without type",
      status: "done",
      priority: 0,
      created_at: "2026-01-01T00:00:00Z",
      tdd_phase: "complete",
    });
    expect(task.type).toBe("code");
  });

  test("rejects invalid task types", () => {
    expect(() =>
      TaskSchema.parse({
        id: "tk-test03",
        title: "Bad type",
        status: "pending",
        priority: 0,
        created_at: "2026-01-01T00:00:00Z",
        tdd_phase: "none",
        type: "invalid",
      }),
    ).toThrow();
  });
});

describe("GateCompletionSchema.migrated_from", () => {
  test("accepts migrated_from field for migration audit trail", () => {
    const gate = GateCompletionSchema.parse({
      status: "done",
      completed_at: "2026-01-01T00:00:00Z",
      completed_by: "migration",
      migrated_from: "research",
    });
    expect(gate.migrated_from).toBe("research");
  });

  test("migrated_from is optional (existing gates work without it)", () => {
    const gate = GateCompletionSchema.parse({
      status: "done",
      completed_at: "2026-01-01T00:00:00Z",
      completed_by: "agent",
    });
    expect(gate.migrated_from).toBeUndefined();
  });

  test("accepts absorbed_completions for merged migration audit trail", () => {
    const gate = GateCompletionSchema.parse({
      status: "done",
      completed_at: "2026-01-01T00:00:00Z",
      completed_by: "agent",
      migrated_from: "review",
      absorbed_completions: [
        {
          gate_id: "signoff",
          status: "done",
          completed_at: "2026-01-02T00:00:00Z",
          completed_by: "user",
        },
      ],
    });
    expect(gate.absorbed_completions).toEqual([
      {
        gate_id: "signoff",
        status: "done",
        completed_at: "2026-01-02T00:00:00Z",
        completed_by: "user",
      },
    ]);
  });
});

// =============================================================================
// 7-Gate Model — New gate IDs and schema shape
// =============================================================================

describe("7-gate collaborative model", () => {
  test("GATE_DEFS contains exactly 7 gates in the correct order", () => {
    expect(GATE_DEFS).toHaveLength(7);
    const ids = GATE_DEFS.map((g: { id: string }) => g.id);
    expect(ids).toEqual([
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
    ]);
  });

  test("GateIdSchema accepts new gate IDs and rejects old ones", () => {
    // New IDs should parse
    expect(GateIdSchema.parse("proposal")).toBe("proposal");
    expect(GateIdSchema.parse("discovery")).toBe("discovery");
    expect(GateIdSchema.parse("design")).toBe("design");
    expect(GateIdSchema.parse("planning")).toBe("planning");
    expect(GateIdSchema.parse("execution")).toBe("execution");
    expect(GateIdSchema.parse("acceptance")).toBe("acceptance");
    expect(GateIdSchema.parse("release")).toBe("release");
    // Old IDs should be rejected
    expect(() => GateIdSchema.parse("research")).toThrow();
    expect(() => GateIdSchema.parse("prep")).toThrow();
    expect(() => GateIdSchema.parse("implementation")).toThrow();
    expect(() => GateIdSchema.parse("review")).toThrow();
    expect(() => GateIdSchema.parse("harden")).toThrow();
    expect(() => GateIdSchema.parse("signoff")).toThrow();
  });

  test("GatesSchema has 7 fields matching new gate IDs", () => {
    const keys = Object.keys(GatesSchema.shape);
    expect(keys).toEqual([
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
    ]);
  });

  test("createDefaultGates returns 7 pending gates with new IDs", () => {
    const gates = createDefaultGates();
    expect(Object.keys(gates)).toHaveLength(7);
    expect(gates.proposal.status).toBe("pending");
    expect(gates.discovery.status).toBe("pending");
    expect(gates.design.status).toBe("pending");
    expect(gates.planning.status).toBe("pending");
    expect(gates.execution.status).toBe("pending");
    expect(gates.acceptance.status).toBe("pending");
    expect(gates.release.status).toBe("pending");
  });

  test("canCompleteGate enforces 7-gate sequence", () => {
    const gates = createDefaultGates();
    // First gate (proposal) can always be completed
    expect(canCompleteGate(gates, "proposal")).toBe(true);
    // Second gate (discovery) cannot be completed before proposal
    expect(canCompleteGate(gates, "discovery")).toBe(false);
    // Complete proposal, then discovery should be allowed
    gates.proposal.status = "done";
    expect(canCompleteGate(gates, "discovery")).toBe(true);
    // Last gate (release) requires all prior gates
    expect(canCompleteGate(gates, "release")).toBe(false);
  });
});

// =============================================================================
// New schema additions — Leak #6, #9, #11, #12 (fixAdvContextLeakSurfaces)
// =============================================================================

describe("TaskSchema.implementation_summary (Leak #6)", () => {
  const baseTask = {
    id: "tk-test01",
    title: "Test task",
    status: "pending",
    created_at: new Date().toISOString(),
  };

  test("accepts task with implementation_summary", () => {
    const task = TaskSchema.parse({
      ...baseTask,
      implementation_summary: "Used Zod .optional() pattern per KD4",
    });
    expect(task.implementation_summary).toBe(
      "Used Zod .optional() pattern per KD4",
    );
  });

  test("accepts task without implementation_summary (backwards compat)", () => {
    const task = TaskSchema.parse(baseTask);
    expect(task.implementation_summary).toBeUndefined();
  });

  test("persists implementation_summary through parse round-trip", () => {
    const summary = "Extended GateCompletionSchema with notes field";
    const parsed = TaskSchema.parse({
      ...baseTask,
      implementation_summary: summary,
    });
    expect(parsed.implementation_summary).toBe(summary);
  });
});

describe("AttemptSchema + ErrorRecoverySchema.attempts (Leak #9)", () => {
  test("AttemptSchema parses a valid attempt record", () => {
    const attempt = AttemptSchema.parse({
      attempt_number: 1,
      error: "Type error: string not assignable to number",
      diagnosis: "Wrong type passed to zod schema",
      fix_tried: "Changed field type from string to z.number()",
      outcome: "failed",
      attempted_at: new Date().toISOString(),
    });
    expect(attempt.attempt_number).toBe(1);
    expect(attempt.outcome).toBe("failed");
  });

  test("ErrorRecoverySchema accepts attempts array (Leak #9 fix)", () => {
    const recovery = ErrorRecoverySchema.parse({
      last_error: "Build failed",
      retry_count: 2,
      max_retries: 3,
      error_class: "SEMANTIC",
      attempts: [
        {
          attempt_number: 1,
          error: "First failure",
          diagnosis: "Wrong approach",
          fix_tried: "Tried X",
          outcome: "failed",
          attempted_at: new Date().toISOString(),
        },
        {
          attempt_number: 2,
          error: "Second failure",
          diagnosis: "Still wrong",
          fix_tried: "Tried Y",
          outcome: "failed",
          attempted_at: new Date().toISOString(),
        },
      ],
    });
    expect(recovery.attempts).toHaveLength(2);
    expect(recovery.attempts![0].attempt_number).toBe(1);
  });

  test("ErrorRecoverySchema without attempts is backwards compatible", () => {
    const recovery = ErrorRecoverySchema.parse({
      last_error: "Some error",
      retry_count: 0,
      max_retries: 3,
      error_class: "TRANSIENT",
    });
    expect(recovery.attempts).toBeUndefined();
  });
});

describe("AttemptSchema.strategy_label", () => {
  test("accepts attempt with strategy_label", () => {
    const attempt = AttemptSchema.parse({
      attempt_number: 2,
      error: "Test still failing after import fix",
      diagnosis: "Wrong module path",
      fix_tried: "Rewrote import to use relative path",
      strategy_label: "rewrite-import-path",
      outcome: "succeeded",
      attempted_at: new Date().toISOString(),
    });
    expect(attempt.strategy_label).toBe("rewrite-import-path");
  });

  test("strategy_label is optional (backwards compatible)", () => {
    const attempt = AttemptSchema.parse({
      attempt_number: 1,
      error: "Type error",
      diagnosis: "Wrong type",
      fix_tried: "Changed type",
      outcome: "failed",
      attempted_at: new Date().toISOString(),
    });
    expect(attempt.strategy_label).toBeUndefined();
  });
});

describe("GateCompletionSchema.notes (Leak #11)", () => {
  test("accepts gate completion with notes", () => {
    const gate = GateCompletionSchema.parse({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: "agent",
      notes:
        "Drift detection added; spec divergence warning scoped to warning severity",
    });
    expect(gate.notes).toBe(
      "Drift detection added; spec divergence warning scoped to warning severity",
    );
  });

  test("accepts gate completion without notes (backwards compat)", () => {
    const gate = GateCompletionSchema.parse({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: "agent",
    });
    expect(gate.notes).toBeUndefined();
  });
});

describe("ClarifyFindingSnapshotSchema + ChangeSchema.clarify_findings (Leak #12)", () => {
  test("ClarifyFindingSnapshotSchema parses a valid snapshot", () => {
    const snapshot = ClarifyFindingSnapshotSchema.parse({
      code: "CLARIFY_MISSING_SUCCESS_CRITERIA",
      severity: "warning",
      message: "Success criteria are placeholder",
      recorded_at: new Date().toISOString(),
    });
    expect(snapshot.code).toBe("CLARIFY_MISSING_SUCCESS_CRITERIA");
    expect(snapshot.resolved).toBeUndefined();
  });

  test("ClarifyFindingSnapshotSchema accepts resolved findings", () => {
    const snapshot = ClarifyFindingSnapshotSchema.parse({
      code: "CLARIFY_MISSING_SUCCESS_CRITERIA",
      severity: "warning",
      message: "Success criteria are placeholder",
      recorded_at: new Date().toISOString(),
      resolved: true,
      resolved_at: new Date().toISOString(),
    });
    expect(snapshot.resolved).toBe(true);
  });

  test("ChangeSchema accepts clarify_findings array (Leak #12 fix)", () => {
    const change = ChangeSchema.parse({
      id: "testChange",
      title: "Test change",
      status: "draft",
      created_at: new Date().toISOString(),
      tasks: [],
      deltas: {},
      clarify_findings: [
        {
          code: "CLARIFY_MISSING_SUCCESS_CRITERIA",
          severity: "warning",
          message: "Success criteria are placeholder",
          recorded_at: new Date().toISOString(),
        },
      ],
    });
    expect(change.clarify_findings).toHaveLength(1);
    expect(change.clarify_findings![0].code).toBe(
      "CLARIFY_MISSING_SUCCESS_CRITERIA",
    );
  });

  test("ChangeSchema without clarify_findings is backwards compatible", () => {
    const change = ChangeSchema.parse({
      id: "testChange",
      title: "Test change",
      status: "draft",
      created_at: new Date().toISOString(),
      tasks: [],
      deltas: {},
    });
    expect(change.clarify_findings).toBeUndefined();
  });
});

// =============================================================================
// ReentryHistoryEntrySchema — Scope Expansion Re-Entry Audit Trail
// =============================================================================

describe("ReentryHistoryEntrySchema", () => {
  const validEntry = {
    from_gate: "discovery",
    reason: "New OAuth scope requirement added after design was approved",
    scope_delta: "Added OAuth PKCE flow requirement to AC #2",
    reopened_by: "/adv-apply agent",
    reopened_at: "2026-04-10T20:00:00.000Z",
    gates_reset: ["discovery", "design", "planning", "execution"],
  };

  test("parses a valid re-entry history entry", () => {
    const parsed = ReentryHistoryEntrySchema.parse(validEntry);
    expect(parsed.from_gate).toBe("discovery");
    expect(parsed.reason).toBe(
      "New OAuth scope requirement added after design was approved",
    );
    expect(parsed.scope_delta).toBe(
      "Added OAuth PKCE flow requirement to AC #2",
    );
    expect(parsed.reopened_by).toBe("/adv-apply agent");
    expect(parsed.reopened_at).toBe("2026-04-10T20:00:00.000Z");
    expect(parsed.gates_reset).toEqual([
      "discovery",
      "design",
      "planning",
      "execution",
    ]);
  });

  test("scope_delta is optional", () => {
    const { scope_delta: _, ...withoutDelta } = validEntry;
    const parsed = ReentryHistoryEntrySchema.parse(withoutDelta);
    expect(parsed.scope_delta).toBeUndefined();
  });

  test("approval_evidence is accepted when present and optional for legacy entries", () => {
    const parsedWithEvidence = ReentryHistoryEntrySchema.parse({
      ...validEntry,
      approval_evidence: "User approved via question tool",
    });
    expect(parsedWithEvidence.approval_evidence).toBe(
      "User approved via question tool",
    );

    const parsedWithoutEvidence = ReentryHistoryEntrySchema.parse(validEntry);
    expect(parsedWithoutEvidence.approval_evidence).toBeUndefined();
  });

  test("rejects invalid gate IDs in from_gate", () => {
    expect(() =>
      ReentryHistoryEntrySchema.parse({
        ...validEntry,
        from_gate: "nonexistent_gate",
      }),
    ).toThrow();
  });

  test("rejects invalid gate IDs in gates_reset array", () => {
    expect(() =>
      ReentryHistoryEntrySchema.parse({
        ...validEntry,
        gates_reset: ["discovery", "bogus_gate"],
      }),
    ).toThrow();
  });

  test("rejects missing required fields", () => {
    // Missing reason
    expect(() =>
      ReentryHistoryEntrySchema.parse({
        from_gate: "discovery",
        reopened_by: "agent",
        reopened_at: "2026-04-10T20:00:00.000Z",
        gates_reset: ["discovery"],
      }),
    ).toThrow();

    // Missing from_gate
    expect(() =>
      ReentryHistoryEntrySchema.parse({
        reason: "scope change",
        reopened_by: "agent",
        reopened_at: "2026-04-10T20:00:00.000Z",
        gates_reset: ["discovery"],
      }),
    ).toThrow();
  });

  test("gates_reset must be a non-empty array", () => {
    expect(() =>
      ReentryHistoryEntrySchema.parse({
        ...validEntry,
        gates_reset: [],
      }),
    ).toThrow();
  });
});

describe("ChangeSchema reentry_history field", () => {
  const baseChange = {
    id: "testChange",
    title: "Test change",
    status: "draft",
    created_at: new Date().toISOString(),
    tasks: [],
    deltas: {},
  };

  test("ChangeSchema accepts reentry_history array", () => {
    const change = ChangeSchema.parse({
      ...baseChange,
      reentry_history: [
        {
          from_gate: "discovery",
          reason: "New requirement emerged during execution",
          reopened_by: "user",
          reopened_at: "2026-04-10T20:00:00.000Z",
          gates_reset: ["discovery", "design", "planning", "execution"],
        },
      ],
    });
    expect(change.reentry_history).toHaveLength(1);
    expect(change.reentry_history![0].from_gate).toBe("discovery");
    expect(change.reentry_history![0].gates_reset).toHaveLength(4);
  });

  test("ChangeSchema without reentry_history is backwards compatible", () => {
    const change = ChangeSchema.parse(baseChange);
    expect(change.reentry_history).toBeUndefined();
  });

  test("ChangeSchema accepts multiple re-entry history entries", () => {
    const change = ChangeSchema.parse({
      ...baseChange,
      reentry_history: [
        {
          from_gate: "discovery",
          reason: "First re-entry",
          reopened_by: "user",
          reopened_at: "2026-04-10T18:00:00.000Z",
          gates_reset: ["discovery", "design", "planning", "execution"],
        },
        {
          from_gate: "planning",
          reason: "Second re-entry — task graph needs rework",
          scope_delta: "Added integration test phase",
          reopened_by: "agent",
          reopened_at: "2026-04-10T20:00:00.000Z",
          gates_reset: ["planning", "execution"],
        },
      ],
    });
    expect(change.reentry_history).toHaveLength(2);
    expect(change.reentry_history![1].scope_delta).toBe(
      "Added integration test phase",
    );
  });
});

// =============================================================================
// Investment Check-In / Judgment-Surfacing Governance (addCostTimeInvestment)
// =============================================================================

describe("ThresholdTierSchema", () => {
  test("accepts the three tier values", () => {
    expect(ThresholdTierSchema.parse("auto")).toBe("auto");
    expect(ThresholdTierSchema.parse("escalate")).toBe("escalate");
    expect(ThresholdTierSchema.parse("hardstop")).toBe("hardstop");
  });

  test("rejects unknown tier values", () => {
    expect(() => ThresholdTierSchema.parse("warn")).toThrow();
    expect(() => ThresholdTierSchema.parse("")).toThrow();
  });
});

describe("JudgmentCallCategorySchema", () => {
  test("accepts the three in-scope categories", () => {
    expect(JudgmentCallCategorySchema.parse("non_functional_tradeoff")).toBe(
      "non_functional_tradeoff",
    );
    expect(JudgmentCallCategorySchema.parse("extensibility")).toBe(
      "extensibility",
    );
    expect(JudgmentCallCategorySchema.parse("scope_boundary")).toBe(
      "scope_boundary",
    );
  });

  test("rejects out-of-scope categories (defaults, naming, error_semantics)", () => {
    expect(() => JudgmentCallCategorySchema.parse("defaults")).toThrow();
    expect(() => JudgmentCallCategorySchema.parse("naming")).toThrow();
    expect(() => JudgmentCallCategorySchema.parse("error_semantics")).toThrow();
  });
});

describe("JudgmentCallSchema", () => {
  test("parses a complete judgment call entry", () => {
    const result = JudgmentCallSchema.parse({
      id: "jc-abc123",
      category: "non_functional_tradeoff",
      question: "Trade latency for consistency here?",
      agent_recommendation: "Prefer consistency",
      rationale: "Data-correctness matters more than p99",
      options: [
        { label: "Favor consistency (Recommended)", description: "Stronger" },
        { label: "Favor latency", description: "Faster p99" },
      ],
    });
    expect(result.id).toBe("jc-abc123");
    expect(result.options).toHaveLength(2);
    expect(result.surfaced_at).toBeUndefined();
    expect(result.user_choice).toBeUndefined();
  });

  test("accepts optional resolution fields", () => {
    const result = JudgmentCallSchema.parse({
      id: "jc-xyz789",
      category: "extensibility",
      question: "Hardcode vs config-drive this?",
      agent_recommendation: "Config-driven",
      rationale: "Likely to change",
      options: [{ label: "Config-driven", description: "More flexible" }],
      surfaced_at: "2026-04-18T08:00:00.000Z",
      resolved_by: "user",
      user_choice: "Config-driven",
    });
    expect(result.resolved_by).toBe("user");
    expect(result.user_choice).toBe("Config-driven");
  });

  test("rejects missing required fields", () => {
    expect(() =>
      JudgmentCallSchema.parse({
        id: "jc-incomplete",
        category: "scope_boundary",
        // missing question, agent_recommendation, rationale, options
      }),
    ).toThrow();
  });
});

describe("InvestmentReportSchema", () => {
  test("parses a complete report", () => {
    const result = InvestmentReportSchema.parse({
      task_counts: {
        total: 10,
        done: 3,
        cancelled: 1,
        pending: 5,
        in_progress: 1,
      },
      elapsed_ms: 3_600_000,
      retry_total: 2,
      retry_density: 0.5,
      doom_loop_active: false,
      per_gate_ms: { proposal: 120_000, discovery: 180_000 },
      threshold_tier: "escalate",
    });
    expect(result.task_counts.total).toBe(10);
    expect(result.threshold_tier).toBe("escalate");
    expect(result.doom_loop_active).toBe(false);
  });

  test("rejects missing task_counts fields", () => {
    expect(() =>
      InvestmentReportSchema.parse({
        task_counts: { total: 1 }, // missing done/cancelled/pending/in_progress
        elapsed_ms: 0,
        retry_total: 0,
        retry_density: 0,
        doom_loop_active: false,
        per_gate_ms: {},
        threshold_tier: "auto",
      }),
    ).toThrow();
  });
});

describe("ChangeSchema — judgment_calls extension", () => {
  test("accepts change without judgment_calls (legacy / pre-v1)", () => {
    // AC #15 / D11: legacy changes have judgment_calls === undefined
    const result = ChangeSchema.parse(SAMPLE_CHANGE);
    expect(result.judgment_calls).toBeUndefined();
    expect(result.batch_surfaced_at).toBeUndefined();
  });

  test("accepts change with empty judgment_calls array", () => {
    // Phase J initializes judgment_calls: [] when no calls identified
    const result = ChangeSchema.parse({
      ...SAMPLE_CHANGE,
      judgment_calls: [],
      batch_surfaced_at: "2026-04-18T09:00:00.000Z",
    });
    expect(result.judgment_calls).toEqual([]);
    expect(result.batch_surfaced_at).toBe("2026-04-18T09:00:00.000Z");
  });

  test("accepts change with populated judgment_calls", () => {
    const result = ChangeSchema.parse({
      ...SAMPLE_CHANGE,
      judgment_calls: [
        {
          id: "jc-001",
          category: "scope_boundary",
          question: "Handle edge case X here or defer?",
          agent_recommendation: "Defer to follow-up",
          rationale: "Out of current scope",
          options: [
            { label: "Defer (Recommended)", description: "Follow-up ticket" },
            { label: "Handle now", description: "+1 task in this change" },
          ],
        },
      ],
    });
    expect(result.judgment_calls).toHaveLength(1);
    expect(result.judgment_calls![0].category).toBe("scope_boundary");
  });

  test("rejects invalid judgment_call entry inside change", () => {
    expect(() =>
      ChangeSchema.parse({
        ...SAMPLE_CHANGE,
        judgment_calls: [
          {
            id: "jc-bad",
            category: "defaults", // out-of-scope category
            question: "?",
            agent_recommendation: "?",
            rationale: "?",
            options: [],
          },
        ],
      }),
    ).toThrow();
  });
});
