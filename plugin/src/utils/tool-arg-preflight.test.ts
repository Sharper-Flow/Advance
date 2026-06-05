import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  formatToolArgPreflightError,
  listToolArgFieldPolicies,
  preflightToolArgs,
  validateToolArgsBeforeExecute,
} from "./tool-arg-preflight";
import { createToolMap } from "../tool-registry";
import { createLegacyStore } from "../storage/store";
import { cleanupTempDir, createTempDir } from "../__tests__/setup";

type RegressionMatrixCase = {
  label: string;
  toolName: string;
  schema?: Record<string, z.ZodTypeAny>;
  rawArgs: Record<string, unknown>;
  ok: boolean;
  fields?: string[];
  normalizedArgs?: Record<string, unknown>;
};

type ExpectedFieldPolicy = {
  toolName: string;
  field: string;
  policy: "blank" | "emptyArray" | "zero" | "recordValuesBlank";
  action: "reject" | "omit" | "allow";
};

const AUDITED_PREFLIGHT_POLICY_REQUIREMENTS: ExpectedFieldPolicy[] = [
  {
    toolName: "adv_change_create",
    field: "target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_create",
    field: "origin_issue_number",
    policy: "zero",
    action: "omit",
  },
  {
    // rq-toolPlaceholderPolicy01.6: contextually-validated audit fields
    // flipped from reject to omit to prevent strict-mode deadlock.
    toolName: "adv_change_update",
    field: "confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_update",
    field: "recoveryEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_update",
    field: "recoveryReason",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_update",
    field: "priorApprovalEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_archive",
    field: "worktreePath",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_archive",
    field: "recoveryEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_snapshot_health",
    field: "repair_actions",
    policy: "emptyArray",
    action: "reject",
  },
  {
    toolName: "adv_snapshot_health",
    field: "approvalEvidence",
    policy: "blank",
    action: "reject",
  },
  {
    toolName: "adv_task_update",
    field: "recoveryEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_task_add",
    field: "recoveryEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_task_cancel",
    field: "recoveryEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_task_cancel",
    field: "approvalEvidence",
    policy: "blank",
    action: "reject",
  },
  {
    toolName: "adv_task_cancel",
    field: "reasons",
    policy: "recordValuesBlank",
    action: "reject",
  },
  {
    toolName: "adv_gate_complete",
    field: "confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_gate_complete",
    field: "recoveryEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_gate_complete",
    field: "recoveryReason",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_gate_complete",
    field: "priorApprovalEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_contract_mint",
    field: "recoveryEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_contract_review_matrix_set",
    field: "recoveryEvidence",
    policy: "blank",
    action: "omit",
  },
];

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
    // T2 (rq-toolPlaceholderPolicy01.5 + rq-toolArgBlankArtifactLinkage01.5
    // revised): strict-mode GPT payload — origin_issue_number: 0 normalizes
    // via { zero: "omit" }, origin_source_artifact: "" normalizes via
    // { blank: "omit" }. Cross-field origin matrix sees only origin_kind:
    // "adhoc" and accepts. THIS IS THE BUG FIX.
    label:
      "ad hoc normalizes zero issue number and blank source artifact (strict-mode GPT payload)",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Add placeholder guard",
      origin_kind: "adhoc",
      origin_issue_number: 0,
      origin_source_artifact: "",
    },
    ok: true,
    normalizedArgs: {
      summary: "Add placeholder guard",
      origin_kind: "adhoc",
    },
  },
  {
    // T2 (rq-toolArgBlankArtifactLinkage01.3 revised): blank design normalizes
    // to omitted; proposal is written; design artifact stays untouched.
    label: "blank create artifact normalizes to omitted",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Add artifact guard", proposal: "valid", design: " " },
    ok: true,
    normalizedArgs: { summary: "Add artifact guard", proposal: "valid" },
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
    // T2 (rq-toolPlaceholderPolicy01.5): blank target_path now normalizes to
    // omitted via { blank: "omit" } policy. The change creates as if no
    // target_path was sent.
    label: "blank target path normalizes to omitted",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Add target path guard", target_path: " " },
    ok: true,
    normalizedArgs: { summary: "Add target path guard" },
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
    // T2: blank source_project normalizes to omitted. With target_path set,
    // the cross-field source_project-requires-target check no longer fires
    // (source_project was stripped). This is the GPT-correct outcome.
    label: "blank source project normalizes to omitted (target path retained)",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Add source guard",
      target_path: "/repo/target",
      source_project: " ",
    },
    ok: true,
    normalizedArgs: {
      summary: "Add source guard",
      target_path: "/repo/target",
    },
  },
  {
    // T2: blank source_change_id normalizes to omitted. Same rationale as
    // source_project above.
    label: "blank source change normalizes to omitted (target path retained)",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Add source guard",
      target_path: "/repo/target",
      source_change_id: " ",
    },
    ok: true,
    normalizedArgs: {
      summary: "Add source guard",
      target_path: "/repo/target",
    },
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
    label: "blank run-test phase normalizes to omitted",
    toolName: "adv_run_test",
    schema: {
      taskId: z.string(),
      command: z.string(),
      phase: z.enum(["red", "green", "verify"]).optional(),
    },
    rawArgs: { taskId: "tk-1", command: "pnpm test", phase: " " },
    ok: true,
    normalizedArgs: { taskId: "tk-1", command: "pnpm test" },
  },
  {
    // rq-toolPlaceholderPolicy01.6: completedBy blank normalizes to omitted
    // (handler defaults to "agent") so strict-mode providers can complete
    // non-recovery gates without deadlock.
    label: "blank gate actor normalizes to omitted",
    toolName: "adv_gate_complete",
    rawArgs: { changeId: "c", gateId: "design", completedBy: " " },
    ok: true,
    normalizedArgs: { changeId: "c", gateId: "design" },
  },
  {
    // T2: gate notes are optional-descriptive — blank normalizes to omitted.
    label: "blank gate notes normalize to omitted",
    toolName: "adv_gate_complete",
    rawArgs: { changeId: "c", gateId: "design", notes: " " },
    ok: true,
    normalizedArgs: { changeId: "c", gateId: "design" },
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
    // rq-toolPlaceholderPolicy01.6: recoveryEvidence is contextually validated
    // by the handler (only when recoveryMode=poisoned_history), so blank
    // normalizes to omitted at preflight.
    label: "blank contract recovery evidence normalizes to omitted",
    toolName: "adv_contract_mint",
    rawArgs: { changeId: "c", recoveryEvidence: " " },
    ok: true,
    normalizedArgs: { changeId: "c" },
  },
  {
    // T2: target_path is optional on read tools — blank normalizes to omitted.
    label: "blank target path normalizes to omitted on read tools",
    toolName: "adv_change_show",
    rawArgs: { changeId: "c", target_path: " " },
    ok: true,
    normalizedArgs: { changeId: "c" },
  },
  {
    // T2: target_path is optional on mutation tools too — blank normalizes.
    label: "blank target path normalizes to omitted on mutation tools",
    toolName: "adv_task_update",
    rawArgs: { taskId: "tk-1", status: "done", target_path: " " },
    ok: true,
    normalizedArgs: { taskId: "tk-1", status: "done" },
  },
  {
    // rq-toolPlaceholderPolicy01.6: confirmationEvidence is contextually
    // validated (only when target_path present), blank normalizes to omitted.
    label: "blank target confirmation evidence normalizes to omitted",
    toolName: "adv_change_update",
    rawArgs: { changeId: "c", proposal: "real", confirmationEvidence: " " },
    ok: true,
    normalizedArgs: { changeId: "c", proposal: "real" },
  },
];

describe("tool arg preflight", () => {
  describe("FIELD_POLICIES drift guards", () => {
    test("every audited placeholder/audit field has an explicit policy", () => {
      const policies = listToolArgFieldPolicies();

      for (const requirement of AUDITED_PREFLIGHT_POLICY_REQUIREMENTS) {
        expect(
          policies[requirement.toolName]?.[requirement.field]?.[
            requirement.policy
          ],
          `${requirement.toolName}.${requirement.field}.${requirement.policy}`,
        ).toBe(requirement.action);
      }
    });

    test("FIELD_POLICIES entries reference live registered tool args", async () => {
      const storeTempDir = await createTempDir();
      const mapTempDir = await createTempDir();
      const store = await createLegacyStore(storeTempDir);
      await store.init();

      try {
        const map = createToolMap(store, mapTempDir, store.paths.agenda);
        const policies = listToolArgFieldPolicies();

        for (const [toolName, fields] of Object.entries(policies)) {
          const tool = (
            map as Record<string, { args?: Record<string, unknown> }>
          )[toolName];
          expect(
            tool,
            `${toolName} policy tool should be registered`,
          ).toBeDefined();
          const argNames = new Set(Object.keys(tool.args ?? {}));

          for (const field of Object.keys(fields)) {
            expect(
              argNames.has(field),
              `${toolName}.${field} policy should match a registered arg`,
            ).toBe(true);
          }
        }
      } finally {
        store.close();
        await cleanupTempDir(mapTempDir);
        await cleanupTempDir(storeTempDir);
      }
    });
  });

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
    // T2: adv_gate_complete.target_path, adv_gate_complete.notes,
    // adv_gate_complete.compatibilityReason flipped to blank: "omit".
    // rq-toolPlaceholderPolicy01.6: adv_gate_complete.completedBy,
    // recoveryEvidence, recoveryReason, priorApprovalEvidence,
    // confirmationEvidence also flipped to blank: "omit".
    // adv_run_test.target_path, adv_status.target_path,
    // adv_temporal_reconnect.target_path, adv_contract_mint.{approvedAt,target_path}
    // similarly flipped. Coverage of the omit semantics for these fields
    // lives in `normalizes representative blank placeholder` below.
    ["adv_worktree_create", { branch: " " }, "branch"],
    ["adv_worktree_resume", { changeId: " " }, "changeId"],
    ["adv_worktree_delete", { branch: " " }, "branch"],
    ["adv_worktree_cleanup", { reason: " " }, "reason"],
    ["adv_conformance", { action: "unlock", user: " " }, "user"],
    ["adv_agenda_add", { title: " " }, "title"],
    ["adv_agenda_cancel", { itemId: "ag-1", reason: " " }, "reason"],
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

  // T2 (rq-toolPlaceholderPolicy01.5): flipped-to-omit optional fields.
  // Coverage that these fields are NORMALIZED rather than rejected.
  test.each([
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", target_path: " " },
      "target_path",
    ],
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", notes: " " },
      "notes",
    ],
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", compatibilityReason: " " },
      "compatibilityReason",
    ],
    // rq-toolPlaceholderPolicy01.6: contextually-validated audit fields
    // now normalize to omitted so strict-mode providers don't deadlock.
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", completedBy: " " },
      "completedBy",
    ],
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", recoveryEvidence: " " },
      "recoveryEvidence",
    ],
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", recoveryReason: " " },
      "recoveryReason",
    ],
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", priorApprovalEvidence: " " },
      "priorApprovalEvidence",
    ],
    [
      "adv_gate_complete",
      { changeId: "c", gateId: "design", confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    [
      "adv_change_update",
      { changeId: "c", proposal: "real", confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    [
      "adv_change_update",
      { changeId: "c", proposal: "real", recoveryEvidence: " " },
      "recoveryEvidence",
    ],
    [
      "adv_change_update",
      { changeId: "c", proposal: "real", recoveryReason: " " },
      "recoveryReason",
    ],
    [
      "adv_change_update",
      { changeId: "c", proposal: "real", priorApprovalEvidence: " " },
      "priorApprovalEvidence",
    ],
    [
      "adv_change_archive",
      { changeId: "c", recoveryEvidence: " " },
      "recoveryEvidence",
    ],
    [
      "adv_run_test",
      { taskId: "tk-1", command: "test", confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    [
      "adv_task_update",
      { taskId: "tk-1", status: "done", confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    [
      "adv_task_update",
      { taskId: "tk-1", status: "done", recoveryEvidence: " " },
      "recoveryEvidence",
    ],
    [
      "adv_task_add",
      { changeId: "c", content: "do thing", confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    [
      "adv_task_add",
      { changeId: "c", content: "do thing", recoveryEvidence: " " },
      "recoveryEvidence",
    ],
    [
      "adv_task_cancel",
      { taskIds: ["t"], approvedByUser: true, approvalEvidence: "ok", confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    [
      "adv_task_cancel",
      { taskIds: ["t"], approvedByUser: true, approvalEvidence: "ok", recoveryEvidence: " " },
      "recoveryEvidence",
    ],
    [
      "adv_task_reclassify_tdd",
      { taskId: "t", toIntent: "inline", approvalEvidence: "ok", confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    [
      "adv_contract_mint",
      { changeId: "c", recoveryEvidence: " " },
      "recoveryEvidence",
    ],
    [
      "adv_contract_mint",
      { changeId: "c", confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    [
      "adv_contract_review_matrix_set",
      { changeId: "c", recoveryEvidence: " " },
      "recoveryEvidence",
    ],
    [
      "adv_temporal_reconnect",
      { confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    ["adv_contract_mint", { changeId: "c", approvedAt: " " }, "approvedAt"],
    ["adv_contract_mint", { changeId: "c", target_path: " " }, "target_path"],
    [
      "adv_run_test",
      { taskId: "tk-1", command: "test", target_path: " " },
      "target_path",
    ],
    ["adv_temporal_reconnect", { target_path: " " }, "target_path"],
    ["adv_status", { target_path: " " }, "target_path"],
    ["adv_agenda_add", { title: "real", description: " " }, "description"],
    ["adv_agenda_add", { title: "real", category: " " }, "category"],
    [
      "adv_change_close",
      {
        changeId: "c",
        reason: "cancelled",
        approvedByUser: true,
        approvalEvidence: "ok",
        supersededBy: " ",
      },
      "supersededBy",
    ],
  ])(
    "normalizes blank placeholder to omitted for %s.%s",
    (toolName, rawArgs, field) => {
      const result = preflightToolArgs(toolName, {}, rawArgs);
      // Field must be normalized OUT — not present in normalizedArgs.
      expect(result.normalizedArgs).not.toHaveProperty(field);
      // No reject error fires for this specific field.
      expect(
        result.invalid.find(
          (i) => i.field === field && /must be a non-blank/.test(i.message),
        ),
      ).toBeUndefined();
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

  test("enforces adv_change_update artifact cross-field constraints (post-T2 omit semantics)", () => {
    const schema = {
      changeId: z.string(),
      proposal: z.string().optional(),
      problemStatement: z.string().optional(),
      agreement: z.string().optional(),
      design: z.string().optional(),
    };

    // No artifact provided at all → at-least-one-of guard fires.
    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
      }).invalid[0]?.message,
    ).toContain("At least one artifact field");

    // T2 (rq-toolArgBlankArtifactLinkage01.1 revised): all blanks normalize
    // to omitted; the at-least-one-of guard then fires because no artifact
    // survived normalization. Result: same error message as "no artifact
    // provided" — semantically correct ("you didn't send anything to
    // change").
    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
        proposal: "",
        agreement: "   ",
      }).invalid[0]?.message,
    ).toContain("At least one artifact field");

    // Valid case unchanged: real content → ok.
    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
        proposal: "real content",
      }).ok,
    ).toBe(true);

    // T2 (GPT-style mixed payload): blank artifact normalizes out; the
    // non-blank artifact remains. Result: ok: true with only the real
    // artifact in normalizedArgs.
    const mixedBlank = validateToolArgsBeforeExecute(
      "adv_change_update",
      schema,
      {
        changeId: "abc",
        proposal: "real content",
        design: "",
      },
    );
    expect(mixedBlank.ok).toBe(true);
    expect(mixedBlank.normalizedArgs).toEqual({
      changeId: "abc",
      proposal: "real content",
    });

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

    // T2 (rq-toolArgBlankArtifactLinkage01.3 revised): blank artifact
    // normalizes to omitted; create proceeds with only the non-blank
    // artifact persisted.
    const blankArtifacts = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      {
        summary: "Add blank guard",
        proposal: "valid",
        design: " ",
      },
    );
    expect(blankArtifacts.ok).toBe(true);
    expect(blankArtifacts.normalizedArgs).toEqual({
      summary: "Add blank guard",
      proposal: "valid",
    });

    // T2 (rq-toolArgBlankArtifactLinkage01.5 revised): blank
    // origin_source_artifact normalizes to omitted. Triage origin recorded
    // with no source artifact metadata; cross-field validator accepts.
    const blankSource = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      {
        summary: "Promote finding",
        origin_kind: "triage",
        origin_source_artifact: "   ",
      },
    );
    expect(blankSource.ok).toBe(true);
    expect(blankSource.normalizedArgs).toEqual({
      summary: "Promote finding",
      origin_kind: "triage",
    });

    // Origin matrix violations (non-blank wrong-kind values) still reject.
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

    // T2: blank target_path normalizes to omitted.
    const blankTargetPath = validateToolArgsBeforeExecute(
      "adv_change_create",
      schema,
      { summary: "Add target path guard", target_path: "   " },
    );
    expect(blankTargetPath.ok).toBe(true);
    expect(blankTargetPath.normalizedArgs).toEqual({
      summary: "Add target path guard",
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
    // T2: target_path: " " no longer errors (normalized out). Use a payload
    // that still errors — missing required `summary` — so the canonical
    // payload diagnostic surfaces.
    const output = JSON.parse(
      formatToolArgPreflightError(
        "adv_change_create",
        { summary: z.string(), target_path: z.string().optional() },
        { target_path: " " },
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

  // rq-toolPlaceholderPolicy01.5: GPT strict-mode comprehensive payloads.
  // These tests exercise the FULL placeholder fill pattern produced by
  // OpenAI Responses API auto-strict mode (Vercel AI SDK #12200): every
  // optional field gets a default ("", 0, []) rather than being omitted.
  describe("GPT strict-mode comprehensive payloads", () => {
    const CREATE_FULL_SCHEMA = {
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

    test("full GPT create payload normalizes to minimal valid", () => {
      // Real strict-mode fill: model emits every optional with default.
      const result = preflightToolArgs(
        "adv_change_create",
        CREATE_FULL_SCHEMA,
        {
          summary: "Add rate limiting",
          proposal: "real proposal content",
          problemStatement: "",
          agreement: "",
          design: "",
          executiveSummary: "",
          origin_kind: "adhoc",
          origin_issue_number: 0,
          origin_source_artifact: "",
          target_path: "",
          source_project: "",
          source_change_id: "",
          parent_change_id: "",
          scope_repos: [],
        },
      );
      expect(result.ok).toBe(true);
      expect(result.normalizedArgs).toEqual({
        summary: "Add rate limiting",
        proposal: "real proposal content",
        origin_kind: "adhoc",
      });
      expect(result.invalid).toEqual([]);
      expect(result.missing).toEqual([]);
    });

    test("full GPT update payload (all artifacts blank) triggers at-least-one-of", () => {
      const schema = {
        changeId: z.string(),
        proposal: z.string().optional(),
        problemStatement: z.string().optional(),
        agreement: z.string().optional(),
        design: z.string().optional(),
        executiveSummary: z.string().optional(),
        target_path: z.string().optional(),
      };
      const result = preflightToolArgs("adv_change_update", schema, {
        changeId: "c",
        proposal: "",
        problemStatement: "",
        agreement: "",
        design: "",
        executiveSummary: "",
        target_path: "",
      });
      expect(result.ok).toBe(false);
      expect(result.invalid[0]?.message).toContain(
        "At least one artifact field must be provided",
      );
      // All blanks normalized out.
      expect(result.normalizedArgs).toEqual({ changeId: "c" });
    });

    test("mixed GPT update payload normalizes blanks and accepts non-blank", () => {
      const schema = {
        changeId: z.string(),
        proposal: z.string().optional(),
        problemStatement: z.string().optional(),
        agreement: z.string().optional(),
        design: z.string().optional(),
      };
      const result = preflightToolArgs("adv_change_update", schema, {
        changeId: "c",
        proposal: "real content",
        problemStatement: "",
        agreement: "",
        design: "",
      });
      expect(result.ok).toBe(true);
      expect(result.normalizedArgs).toEqual({
        changeId: "c",
        proposal: "real content",
      });
    });

    test("sentinel placeholders still reject even after blank-omit flip", () => {
      // KD8: sentinels are agent-typed mistakes, not strict-mode artifacts.
      for (const sentinel of ["none", "n/a", "null", "transcript"]) {
        const result = preflightToolArgs(
          "adv_change_create",
          CREATE_FULL_SCHEMA,
          { summary: "X", parent_change_id: sentinel },
        );
        expect(result.ok, `sentinel "${sentinel}"`).toBe(false);
        expect(
          result.invalid.find((i) => i.field === "parent_change_id"),
          `sentinel "${sentinel}" rejection`,
        ).toBeDefined();
      }
    });

    // rq-toolPlaceholderPolicy01.6: GPT-5/5.5 strict-mode sends ALL optional
    // fields as blank strings. This test reproduces the exact deadlock that
    // GPT-5.5 hit — every optional field blank, non-recovery gate.
    test("full strict-mode adv_gate_complete payload normalizes to minimal valid", () => {
      const result = preflightToolArgs("adv_gate_complete", {}, {
        changeId: "fixPcIdentityScope",
        gateId: "execution",
        completedBy: "",
        userApproved: false,
        notes: "",
        compatibilityReason: "",
        recoveryReason: "",
        recoveryEvidence: "",
        priorApprovalEvidence: "",
        target_path: "",
        target_confirmed: true,
        confirmationEvidence: "",
      });
      expect(result.ok).toBe(true);
      expect(result.invalid).toEqual([]);
      // Only non-blank required fields + boolean + literal survive.
      expect(result.normalizedArgs).toEqual({
        changeId: "fixPcIdentityScope",
        gateId: "execution",
        userApproved: false,
        target_confirmed: true,
      });
    });
  });

  // AC12: required-when-present audit/identity/content/command fields keep
  // blank: "reject" semantics. Parametrized matrix asserts the full
  // protected set.
  describe("audit-and-required fields still reject blank (AC12)", () => {
    test.each([
      ["adv_task_add", { content: " " }, "content"],
      ["adv_wisdom_add", { content: " " }, "content"],
      ["adv_run_test", { taskId: "tk-1", command: " " }, "command"],
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
        "adv_task_cancel",
        { taskIds: ["t"], approvedByUser: true, approvalEvidence: " " },
        "approvalEvidence",
      ],
      [
        "adv_task_reclassify_tdd",
        { taskId: "t", toIntent: "inline", reason: " " },
        "reason",
      ],
      [
        "adv_task_reclassify_tdd",
        { taskId: "t", toIntent: "inline", approvalEvidence: " " },
        "approvalEvidence",
      ],
      // rq-toolPlaceholderPolicy01.6: adv_gate_complete.completedBy,
      // confirmationEvidence, recoveryEvidence, recoveryReason,
      // priorApprovalEvidence moved from reject to omit — no longer here.
      // adv_change_update.confirmationEvidence, recoveryEvidence,
      // recoveryReason, priorApprovalEvidence also moved.
      // adv_contract_mint.recoveryEvidence, confirmationEvidence moved.
      // adv_contract_review_matrix_set.recoveryEvidence moved.
      // adv_temporal_reconnect.confirmationEvidence moved.
      // adv_run_test.confirmationEvidence moved.
      // adv_task_update confirmationEvidence, recoveryEvidence moved.
      // adv_task_add confirmationEvidence, recoveryEvidence moved.
      // adv_task_cancel confirmationEvidence, recoveryEvidence moved.
      // adv_task_reclassify_tdd confirmationEvidence moved.
      // adv_change_archive recoveryEvidence moved.
      ["adv_worktree_create", { branch: " " }, "branch"],
      ["adv_worktree_create", { branch: "x", base: " " }, "base"],
      ["adv_worktree_resume", { changeId: " " }, "changeId"],
      ["adv_worktree_delete", { branch: " " }, "branch"],
      ["adv_worktree_cleanup", { reason: " " }, "reason"],
      ["adv_conformance", { action: "unlock", user: " " }, "user"],
      ["adv_conformance", { action: "unlock", reason: " " }, "reason"],
      ["adv_agenda_add", { title: " " }, "title"],
      ["adv_agenda_cancel", { itemId: "a", reason: " " }, "reason"],
      [
        "adv_temporal_register_search_attributes",
        { approvedByUser: true, approvalEvidence: " " },
        "approvalEvidence",
      ],
      [
        "adv_temporal_worker_restart",
        { approvedLockReclaim: true, approvalEvidence: " " },
        "approvalEvidence",
      ],
    ])("%s.%s blank still rejects", (toolName, rawArgs, field) => {
      const result = preflightToolArgs(toolName, {}, rawArgs);
      expect(result.invalid).toContainEqual({
        field,
        message: `${field} must be a non-blank string.`,
      });
    });
  });

  // rq-toolPlaceholderPolicy01.5: zero-policy axis for strict-mode int placeholders.
  describe("zero policy axis", () => {
    test("zero: 'omit' normalizes value === 0 to omitted (adv_change_create.origin_issue_number)", () => {
      // adv_change_create.origin_issue_number has { zero: "omit" }.
      const result = preflightToolArgs(
        "adv_change_create",
        {
          summary: z.string(),
          origin_kind: z
            .enum(["roadmap", "discovery", "triage", "adhoc"])
            .optional(),
          origin_issue_number: z.number().int().positive().optional(),
        },
        {
          summary: "Add rate limiting",
          origin_kind: "adhoc",
          origin_issue_number: 0,
        },
      );
      expect(result.ok).toBe(true);
      // origin_issue_number normalized out → not present in normalizedArgs.
      expect(result.normalizedArgs).toEqual({
        summary: "Add rate limiting",
        origin_kind: "adhoc",
      });
      expect(result.invalid).toEqual([]);
    });

    test("zero: 'omit' policy does not affect non-zero numeric values", () => {
      const result = preflightToolArgs(
        "adv_change_create",
        {
          summary: z.string(),
          origin_kind: z.enum(["roadmap"]).optional(),
          origin_issue_number: z.number().int().positive().optional(),
        },
        {
          summary: "Promote roadmap item",
          origin_kind: "roadmap",
          origin_issue_number: 42,
        },
      );
      expect(result.ok).toBe(true);
      expect(result.normalizedArgs).toEqual({
        summary: "Promote roadmap item",
        origin_kind: "roadmap",
        origin_issue_number: 42,
      });
    });

    test("no zero policy: value === 0 passes through (synthetic tool control)", () => {
      // Synthetic tool name with no FIELD_POLICIES entry. value === 0 should
      // pass through and Zod's .min(0) accepts it.
      const result = preflightToolArgs(
        "test_no_policy_tool",
        { count: z.number().int().min(0).optional() },
        { count: 0 },
      );
      expect(result.ok).toBe(true);
      expect(result.normalizedArgs).toEqual({ count: 0 });
    });

    test("zero policy only fires on numeric 0, not on string '0' or other falsy values", () => {
      // origin_kind: discovery rejects origin_issue_number (cross-field), so
      // we'd need a clean path. Use adv_change_create with no origin_kind:
      // a literal 0 still gets normalized out; "0" is a string and stays.
      const stringZeroResult = preflightToolArgs(
        "adv_change_create",
        {
          summary: z.string(),
          // Note: real schema is z.number().int().positive(); using union here
          // to allow string "0" through to confirm the zero policy is
          // type-narrow (only numeric 0).
          origin_issue_number: z.union([z.number(), z.string()]).optional(),
        },
        {
          summary: "X",
          origin_issue_number: "0",
        },
      );
      // String "0" stays — not normalized by zero policy. Cross-field
      // validator will then object because origin_kind is missing.
      expect(stringZeroResult.normalizedArgs.origin_issue_number).toBe("0");
    });
  });

  // rq-toolPlaceholderPolicy01.4: Zod reads normalizedArgs, not raw args.
  describe("Zod validation reads normalizedArgs", () => {
    test("optional field normalized out is invisible to Zod schema check", () => {
      // adv_change_create has scope_repos: { emptyArray: "omit" } already.
      // Sending an empty array should normalize out, and Zod should not see
      // it (no validation error against the array schema).
      const result = preflightToolArgs(
        "adv_change_create",
        {
          summary: z.string(),
          scope_repos: z
            .array(z.object({ repo_id: z.string() }).strict())
            .nonempty()
            .optional(),
        },
        { summary: "Add rate limiting", scope_repos: [] },
      );
      // Zod's .nonempty() would normally fail on []. After normalization,
      // scope_repos is omitted, so Zod never sees []. Cross-field validators
      // also see no scope_repos.
      expect(result.ok).toBe(true);
      expect(result.normalizedArgs).toEqual({ summary: "Add rate limiting" });
      // .nonempty() error MUST NOT appear.
      expect(
        result.invalid.find((i) => i.field === "scope_repos"),
      ).toBeUndefined();
    });

    test("required field accidentally normalized out surfaces as missing", () => {
      // Force the case via a synthetic tool with a blank: "omit" policy on
      // a Zod-required field. Defensive: real config should never do this,
      // but if it did, the user-facing error should be `missing`, not silent.
      const result = preflightToolArgs(
        // adv_change_create has parent_change_id: { blank: "reject", sentinels: "reject" }.
        // We exploit an OPTIONAL field that does have blank:"reject" today
        // (still strict) and confirm a TRULY missing required field surfaces
        // via the same code path.
        "adv_change_create",
        {
          summary: z.string(), // required
          target_path: z.string().optional(),
        },
        { target_path: "/tmp/x" },
      );
      expect(result.ok).toBe(false);
      expect(result.missing).toContain("summary");
    });

    test("Zod validates normalized value, not raw value", () => {
      // adv_change_create has scope_repos: { emptyArray: "omit" }.
      // Pass scope_repos: [] (which would fail z.array().nonempty()) and a
      // valid summary. After normalization, scope_repos is omitted.
      // Zod validates remaining { summary } → passes.
      const result = preflightToolArgs(
        "adv_change_create",
        {
          summary: z.string(),
          scope_repos: z
            .array(z.object({ repo_id: z.string() }))
            .nonempty()
            .optional(),
        },
        { summary: "Add rate limiting", scope_repos: [] },
      );
      expect(result.ok).toBe(true);
      expect(result.normalizedArgs).toEqual({ summary: "Add rate limiting" });
    });
  });
});
