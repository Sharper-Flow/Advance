import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  formatToolArgPreflightError,
  preflightToolArgs,
  validateToolArgsBeforeExecute,
} from "./tool-arg-preflight";

type RegressionMatrixCase = {
  label: string;
  toolName: string;
  schema?: Record<string, z.ZodTypeAny>;
  rawArgs: Record<string, unknown>;
  ok: boolean;
  fields?: string[];
  normalizedArgs?: Record<string, unknown>;
};

const CREATE_SCHEMA = {
  summary: z.string(),
  proposal: z.string().optional(),
  problemStatement: z.string().optional(),
  agreement: z.string().optional(),
  design: z.string().optional(),
  executiveSummary: z.string().optional(),
  origin_kind: z.enum(["roadmap", "discovery", "triage", "adhoc"]).optional(),
  origin_issue_number: z.number().int().positive().optional(),
  origin_source_artifact: z.string().optional(),
  target_path: z.string().optional(),
  source_project: z.string().optional(),
  source_change_id: z.string().optional(),
  parent_change_id: z.string().optional(),
  scope_repos: z.array(z.object({ repo_id: z.string() })).optional(),
};

const PLACEHOLDER_POLICY_REGRESSION_MATRIX: RegressionMatrixCase[] = [
  {
    label: "minimal valid ad hoc payload",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Add rate limiting" },
    ok: true,
  },
  {
    label: "ad hoc rejects blank/zero origin placeholders",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Add placeholder guard",
      origin_kind: "adhoc",
      origin_issue_number: 0,
      origin_source_artifact: "",
    },
    ok: false,
    fields: ["origin_issue_number", "origin_source_artifact"],
  },
  {
    label: "blank create artifact rejected",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Add artifact guard", proposal: "valid", design: " " },
    ok: false,
    fields: ["design"],
  },
  {
    label: "roadmap requires issue number",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Promote roadmap", origin_kind: "roadmap" },
    ok: false,
    fields: ["origin_issue_number"],
  },
  {
    label: "roadmap rejects source artifact",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Promote roadmap",
      origin_kind: "roadmap",
      origin_issue_number: 7,
      origin_source_artifact: "ag-1",
    },
    ok: false,
    fields: ["origin_source_artifact"],
  },
  {
    label: "triage permits source artifact",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Promote triage",
      origin_kind: "triage",
      origin_source_artifact: "ag-1",
    },
    ok: true,
  },
  {
    label: "discovery rejects issue number",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Promote discovery",
      origin_kind: "discovery",
      origin_issue_number: 7,
    },
    ok: false,
    fields: ["origin_issue_number"],
  },
  {
    label: "blank target path rejected",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Add target path guard", target_path: " " },
    ok: false,
    fields: ["target_path"],
  },
  {
    label: "source linkage requires target path",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Add source guard", source_change_id: "abc" },
    ok: false,
    fields: ["source_change_id"],
  },
  {
    label: "blank source project rejected even with target path",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Add source guard",
      target_path: "/repo/target",
      source_project: " ",
    },
    ok: false,
    fields: ["source_project"],
  },
  {
    label: "blank source change rejected even with target path",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Add source guard",
      target_path: "/repo/target",
      source_change_id: " ",
    },
    ok: false,
    fields: ["source_change_id"],
  },
  {
    label: "parent sentinel rejected",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Add parent guard", parent_change_id: "none" },
    ok: false,
    fields: ["parent_change_id"],
  },
  {
    label: "empty scope repos normalizes to omitted",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Add scope guard", scope_repos: [] },
    ok: true,
    normalizedArgs: { summary: "Add scope guard" },
  },
  {
    label: "blank task content rejected",
    toolName: "adv_task_add",
    rawArgs: { content: " " },
    ok: false,
    fields: ["content"],
  },
  {
    label: "blank wisdom content rejected",
    toolName: "adv_wisdom_add",
    rawArgs: { content: " " },
    ok: false,
    fields: ["content"],
  },
  {
    label: "blank run-test command rejected",
    toolName: "adv_run_test",
    rawArgs: { command: " " },
    ok: false,
    fields: ["command"],
  },
  {
    label: "blank gate actor rejected",
    toolName: "adv_gate_complete",
    rawArgs: { completedBy: " " },
    ok: false,
    fields: ["completedBy"],
  },
  {
    label: "blank gate notes rejected",
    toolName: "adv_gate_complete",
    rawArgs: { notes: " " },
    ok: false,
    fields: ["notes"],
  },
  {
    label: "blank approval evidence rejected",
    toolName: "adv_change_close",
    rawArgs: { approvalEvidence: " " },
    ok: false,
    fields: ["approvalEvidence"],
  },
  {
    label: "blank cancellation reason rejected",
    toolName: "adv_task_cancel",
    rawArgs: { reasons: { "tk-1": " " } },
    ok: false,
    fields: ["reasons.tk-1"],
  },
  {
    label: "blank worktree branch rejected",
    toolName: "adv_worktree_create",
    rawArgs: { branch: " " },
    ok: false,
    fields: ["branch"],
  },
  {
    label: "blank worktree base rejected",
    toolName: "adv_worktree_create",
    rawArgs: { base: " " },
    ok: false,
    fields: ["base"],
  },
  {
    label: "blank conformance audit reason rejected",
    toolName: "adv_conformance",
    rawArgs: { reason: " " },
    ok: false,
    fields: ["reason"],
  },
  {
    label: "blank agenda title rejected",
    toolName: "adv_agenda_add",
    rawArgs: { title: " " },
    ok: false,
    fields: ["title"],
  },
  {
    label: "blank agenda cancellation reason rejected",
    toolName: "adv_agenda_cancel",
    rawArgs: { reason: " " },
    ok: false,
    fields: ["reason"],
  },
  {
    label: "blank contract recovery evidence rejected",
    toolName: "adv_contract_mint",
    rawArgs: { recoveryEvidence: " " },
    ok: false,
    fields: ["recoveryEvidence"],
  },
  {
    label: "blank target path rejected for target-aware read tool",
    toolName: "adv_change_show",
    rawArgs: { changeId: "c", target_path: " " },
    ok: false,
    fields: ["target_path"],
  },
  {
    label: "blank target path rejected for target-aware mutation tool",
    toolName: "adv_task_update",
    rawArgs: { taskId: "tk-1", status: "done", target_path: " " },
    ok: false,
    fields: ["target_path"],
  },
  {
    label: "blank target confirmation evidence rejected",
    toolName: "adv_change_update",
    rawArgs: { changeId: "c", proposal: "real", confirmationEvidence: " " },
    ok: false,
    fields: ["confirmationEvidence"],
  },
];

describe("tool arg preflight", () => {
  test("executes data-driven placeholder regression matrix", () => {
    expect(PLACEHOLDER_POLICY_REGRESSION_MATRIX.length).toBeGreaterThan(20);

    for (const entry of PLACEHOLDER_POLICY_REGRESSION_MATRIX) {
      const result = validateToolArgsBeforeExecute(
        entry.toolName,
        entry.schema ?? {},
        entry.rawArgs,
      );
      expect(result.ok, entry.label).toBe(entry.ok);
      for (const field of entry.fields ?? []) {
        expect(
          [...result.missing, ...result.invalid.map((issue) => issue.field)],
          entry.label,
        ).toContain(field);
      }
      if (entry.normalizedArgs) {
        expect(result.normalizedArgs, entry.label).toEqual(
          entry.normalizedArgs,
        );
      }
    }
  });

  test("reports missing required fields while allowing optional/default fields", () => {
    const result = validateToolArgsBeforeExecute(
      "test_tool",
      {
        requiredName: z.string(),
        optionalFlag: z.boolean().optional(),
        defaultLimit: z.number().default(10),
      },
      {},
    );

    expect(result).toEqual({
      ok: false,
      missing: ["requiredName"],
      invalid: [],
      normalizedArgs: {},
    });
  });

  test.each([[], 42, true])(
    "treats non-record raw args as empty object (%j)",
    (rawArgs) => {
      const result = preflightToolArgs("test_tool", {}, rawArgs);

      expect(result).toEqual({
        ok: true,
        missing: [],
        invalid: [],
        normalizedArgs: {},
      });
    },
  );

  test("returns normalized args for omission-equivalent placeholder policies", () => {
    const result = preflightToolArgs(
      "adv_change_create",
      {
        summary: z.string(),
        scope_repos: z.array(z.object({ repo_id: z.string() })).optional(),
      },
      { summary: "Add rate limiting", scope_repos: [] },
    );

    expect(result).toEqual({
      ok: true,
      missing: [],
      invalid: [],
      normalizedArgs: { summary: "Add rate limiting" },
    });
  });

  test("keeps reject-only placeholder policies out of normalized args", () => {
    const result = preflightToolArgs(
      "adv_run_test",
      {
        taskId: z.string(),
        command: z.string(),
      },
      { taskId: "tk-1", command: "   " },
    );

    expect(result.ok).toBe(false);
    expect(result.invalid).toContainEqual({
      field: "command",
      message: "command must be a non-blank string.",
    });
    expect(result.normalizedArgs).toEqual({ taskId: "tk-1", command: "   " });
  });

  test.each([
    ["adv_task_add", { changeId: "c", content: " " }, "content"],
    [
      "adv_wisdom_add",
      { changeId: "c", type: "pattern", content: " " },
      "content",
    ],
    [
      "adv_change_bulk_close",
      {
        selector: { kind: "ids", changeIds: ["c"] },
        reason: "cancelled",
        approvedByUser: true,
        approvalEvidence: " ",
      },
      "approvalEvidence",
    ],
    [
      "adv_change_close",
      {
        changeId: "c",
        reason: "cancelled",
        approvedByUser: true,
        approvalEvidence: " ",
      },
      "approvalEvidence",
    ],
    [
      "adv_task_reclassify_tdd",
      { taskId: "tk-1", toIntent: "inline", reason: " " },
      "reason",
    ],
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", completedBy: " " },
      "completedBy",
    ],
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", target_path: " " },
      "target_path",
    ],
    ["adv_worktree_create", { branch: " " }, "branch"],
    ["adv_worktree_resume", { changeId: " " }, "changeId"],
    ["adv_worktree_delete", { branch: " " }, "branch"],
    ["adv_worktree_cleanup", { reason: " " }, "reason"],
    ["adv_conformance", { action: "unlock", user: " " }, "user"],
    ["adv_agenda_add", { title: " " }, "title"],
    ["adv_agenda_cancel", { itemId: "ag-1", reason: " " }, "reason"],
    ["adv_contract_mint", { changeId: "c", approvedAt: " " }, "approvedAt"],
    ["adv_contract_mint", { changeId: "c", target_path: " " }, "target_path"],
    [
      "adv_run_test",
      { taskId: "tk-1", command: "test", target_path: " " },
      "target_path",
    ],
    ["adv_temporal_reconnect", { target_path: " " }, "target_path"],
    ["adv_status", { target_path: " " }, "target_path"],
    [
      "adv_temporal_register_search_attributes",
      { approvedByUser: true, approvalEvidence: " " },
      "approvalEvidence",
    ],
  ])(
    "rejects representative blank placeholder for %s.%s",
    (toolName, rawArgs, field) => {
      const result = preflightToolArgs(toolName, {}, rawArgs);

      expect(result.invalid).toContainEqual({
        field,
        message: `${field} must be a non-blank string.`,
      });
    },
  );

  test("rejects blank record values for task cancellation reasons", () => {
    const result = preflightToolArgs(
      "adv_task_cancel",
      {},
      {
        taskIds: ["tk-1"],
        reasons: { "tk-1": " " },
        approvedByUser: true,
        approvalEvidence: "approved",
      },
    );

    expect(result.invalid).toContainEqual({
      field: "reasons.tk-1",
      message: "reasons values must be non-blank strings.",
    });
  });

  test("reports nested field validation errors for present objects", () => {
    const result = validateToolArgsBeforeExecute(
      "adv_change_show",
      {
        changeId: z.string(),
        include: z
          .object({ readyTasksLimit: z.number().min(1).max(50).optional() })
          .optional(),
      },
      { changeId: "abc", include: { readyTasksLimit: 99 } },
    );

    expect(result.ok).toBe(false);
    expect(result.invalid[0]?.field).toBe("include.readyTasksLimit");
  });

  test("formats zero-arg required field failures without timeout language", () => {
    const output = JSON.parse(
      formatToolArgPreflightError(
        "adv_wisdom_add",
        {
          changeId: z.string(),
          type: z.enum([
            "pattern",
            "success",
            "failure",
            "gotcha",
            "convention",
          ]),
          content: z.string().max(2000),
        },
        {},
      ) ?? "{}",
    );

    expect(output.code).toBe("INVALID_TOOL_ARGS");
    expect(output.tool).toBe("adv_wisdom_add");
    expect(output.missing).toEqual(["changeId", "type", "content"]);
    expect(output.errorClass).toBeUndefined();
    expect(output.error).not.toContain("timeout");
  });

  test("enforces adv_change_update artifact cross-field constraints", () => {
    const schema = {
      changeId: z.string(),
      proposal: z.string().optional(),
      problemStatement: z.string().optional(),
      agreement: z.string().optional(),
      design: z.string().optional(),
    };

    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
      }).invalid[0]?.message,
    ).toContain("At least one artifact field");

    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
        proposal: "",
        agreement: "   ",
      }).invalid[0]?.message,
    ).toContain("non-blank strings");

    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
        proposal: "real content",
      }).ok,
    ).toBe(true);

    const mixedBlank = validateToolArgsBeforeExecute(
      "adv_change_update",
      schema,
      {
        changeId: "abc",
        proposal: "real content",
        design: "",
      },
    );
    expect(mixedBlank.ok).toBe(false);
    expect(mixedBlank.invalid).toEqual([
      {
        field: "design",
        message:
          "Provided artifact fields must be non-blank strings; omit fields you do not want to change.",
      },
    ]);

    // fixWarpSessionLookup regression: executiveSummary must be recognized
    // as a valid artifact field (see plugin/src/utils/tool-arg-preflight.ts
    // ARTIFACT_FIELDS — historically omitted, blocking acceptance flows).
    const schemaWithSummary = {
      ...schema,
      executiveSummary: z.string().optional(),
    };
    expect(
      validateToolArgsBeforeExecute("adv_change_update", schemaWithSummary, {
        changeId: "abc",
        executiveSummary: "post-acceptance narrative",
      }).ok,
    ).toBe(true);
  });

  test("enforces adv_change_create artifact and origin linkage constraints", () => {
    const schema = {
      summary: z.string(),
      proposal: z.string().optional(),
      problemStatement: z.string().optional(),
      agreement: z.string().optional(),
      design: z.string().optional(),
      executiveSummary: z.string().optional(),
      origin_kind: z
        .enum(["roadmap", "discovery", "triage", "adhoc"])
        .optional(),
      origin_issue_number: z.number().int().positive().optional(),
      origin_source_artifact: z.string().optional(),
      target_path: z.string().optional(),
      source_project: z.string().optional(),
      source_change_id: z.string().optional(),
      parent_change_id: z.string().optional(),
      scope_repos: z.array(z.object({ repo_id: z.string() })).optional(),
    };

    expect(
      validateToolArgsBeforeExecute("adv_change_create", schema, {
        summary: "Add rate limiting",
      }).ok,
    ).toBe(true);

    const blankArtifacts = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      {
        summary: "Add blank guard",
        proposal: "valid",
        design: " ",
      },
    );
    expect(blankArtifacts.ok).toBe(false);
    expect(blankArtifacts.invalid).toContainEqual({
      field: "design",
      message:
        "Provided artifact fields must be non-blank strings; omit fields you do not want to change.",
    });

    const blankSource = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      {
        summary: "Promote finding",
        origin_kind: "triage",
        origin_source_artifact: "   ",
      },
    );
    expect(blankSource.invalid).toContainEqual({
      field: "origin_source_artifact",
      message:
        "origin_source_artifact must be a non-blank string; omit it when there is no source artifact.",
    });

    const invalidRoadmapSource = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      {
        summary: "Promote roadmap item",
        origin_kind: "roadmap",
        origin_issue_number: 12,
        origin_source_artifact: "ag-123",
      },
    );
    expect(invalidRoadmapSource.invalid).toContainEqual({
      field: "origin_source_artifact",
      message:
        "origin_source_artifact is only allowed for triage or discovery origins.",
    });

    const validTriage = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      {
        summary: "Promote triage item",
        origin_kind: "triage",
        origin_issue_number: 12,
        origin_source_artifact: "ag-123",
      },
    );
    expect(validTriage.ok).toBe(true);

    const blankTargetPath = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      { summary: "Add target path guard", target_path: "   " },
    );
    expect(blankTargetPath.invalid).toContainEqual({
      field: "target_path",
      message: "target_path must be a non-blank string.",
    });

    const sourceWithoutTarget = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      { summary: "Add source guard", source_change_id: "abc" },
    );
    expect(sourceWithoutTarget.invalid).toContainEqual({
      field: "source_change_id",
      message: "source_change_id requires target_path to be set.",
    });

    const placeholderParent = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      { summary: "Add parent guard", parent_change_id: "none" },
    );
    expect(placeholderParent.invalid).toContainEqual({
      field: "parent_change_id",
      message:
        "parent_change_id must reference a real change ID; omit it when there is no parent change.",
    });

    expect(
      validateToolArgsBeforeExecute("adv_change_create", schema, {
        summary: "Add scope guard",
        scope_repos: [],
      }).normalizedArgs,
    ).toEqual({ summary: "Add scope guard" });
  });

  test("includes canonical minimal payload for adv_change_create repair", () => {
    const output = JSON.parse(
      formatToolArgPreflightError(
        "adv_change_create",
        { summary: z.string(), target_path: z.string().optional() },
        { summary: "Add rate limiting", target_path: " " },
      ) ?? "{}",
    );

    expect(output.canonical_minimal_payload).toEqual({
      summary: "Add rate limiting",
    });
  });

  test("redacts sensitive received args in preflight errors", () => {
    const output = JSON.parse(
      formatToolArgPreflightError(
        "secret_tool",
        { changeId: z.string() },
        { apiKey: "secret", nested: { token: "also-secret" } },
      ) ?? "{}",
    );

    expect(output.received_args.apiKey).toBe("[REDACTED]");
    expect(output.received_args.nested.token).toBe("[REDACTED]");
  });
});
