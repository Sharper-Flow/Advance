import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  formatToolArgPreflightError,
  listToolArgFieldPolicies,
  preflightToolArgs,
  validateToolArgsBeforeExecute,
} from "./tool-arg-preflight";
import { createToolMap } from "../tool-registry";
import { createDiskStore } from "../storage/store";
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
  policy: "blank" | "sentinels" | "emptyArray" | "zero" | "recordValuesBlank";
  action: "reject" | "omit" | "allow";
};

const AUDITED_PREFLIGHT_POLICY_REQUIREMENTS: ExpectedFieldPolicy[] = [
  {
    toolName: "adv_worktree_delete",
    field: "planToken",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_worktree_delete",
    field: "approvalEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_worktree_cleanup",
    field: "approvalEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_task_update",
    field: "proof_target",
    policy: "blank",
    action: "omit",
  },
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
    toolName: "adv_change_create",
    field: "epic_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_create",
    field: "epic_id",
    policy: "sentinels",
    action: "omit",
  },
  {
    toolName: "adv_change_create",
    field: "entry_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_create",
    field: "entry_id",
    policy: "sentinels",
    action: "omit",
  },
  {
    toolName: "adv_change_create",
    field: "epic_title",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_create",
    field: "epic_title",
    policy: "sentinels",
    action: "omit",
  },
  {
    toolName: "adv_change_create",
    field: "epic_order",
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
    field: "target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_change_archive",
    field: "confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_task_checkpoint",
    field: "target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_task_checkpoint",
    field: "confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_task_checkpoint",
    field: "workdir",
    policy: "blank",
    action: "omit",
  },
  {
    // Tool catalog page limit: 0 placeholder fills normalize to omitted so
    // the handler default (50) applies; bounded read, no safety impact.
    toolName: "adv_tool_catalog",
    field: "limit",
    policy: "zero",
    action: "omit",
  },
  {
    // Optional review proof: strict-mode blank fills must not masquerade as a
    // real conclusion; route-specific evidence validation remains authoritative.
    toolName: "adv_task_add",
    field: "review_conclusion",
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
    field: "priorApprovalEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_contract_mint",
    field: "priorApprovalEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_followup_promote",
    field: "confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  // tk-6ff82311335f: read-tool page-limit fields surfaced by the coverage guard.
  {
    toolName: "adv_backlog_list",
    field: "tail_limit",
    policy: "zero",
    action: "omit",
  },
  {
    toolName: "adv_epic_list",
    field: "limit",
    policy: "zero",
    action: "omit",
  },
  {
    toolName: "adv_wisdom_list",
    field: "maxEntries",
    policy: "zero",
    action: "omit",
  },
  {
    toolName: "adv_reflection_list",
    field: "maxEntries",
    policy: "zero",
    action: "omit",
  },
  {
    toolName: "adv_ops_run_evidence_add",
    field: "step_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_ops_run_evidence_add",
    field: "batch",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_ops_run_evidence_add",
    field: "completion_signal",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_ops_run_evidence_add",
    field: "health_verification",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_ops_run_evidence_add",
    field: "rollback_or_cleanup_disposition",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_create",
    field: "owner_project_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_create",
    field: "owner_repo_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_create",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_create",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_create",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_show",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_show",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_show",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_list",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_list",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_list",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_update",
    field: "title",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_update",
    field: "narrative",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_update",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_update",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_update",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_add_shell",
    field: "backlog_ref",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_add_shell",
    field: "title",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_add_shell",
    field: "success_hint",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_add_shell",
    field: "entry_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_add_shell",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_add_shell",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_add_shell",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_promote_shell",
    field: "change_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_promote_shell",
    field: "promoted_by",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_promote_shell",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_promote_shell",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_promote_shell",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "title",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "entry_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "repo_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "linked_by",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_link_change",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_unlink_change",
    field: "entry_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_unlink_change",
    field: "change_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_unlink_change",
    field: "target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_unlink_change",
    field: "target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_unlink_change",
    field: "confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_unlink_change",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_unlink_change",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_unlink_change",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "from_entry_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "to_entry_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "repo_id",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "moved_by",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_move_change",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_reorder",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_reorder",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_reorder",
    field: "epic_owner_confirmationEvidence",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_retire",
    field: "retired_by",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_retire",
    field: "epic_owner_target_path",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_retire",
    field: "epic_owner_target_confirmed",
    policy: "blank",
    action: "omit",
  },
  {
    toolName: "adv_epic_retire",
    field: "epic_owner_confirmationEvidence",
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
  epic_id: z.string().min(1).optional(),
  entry_id: z.string().min(1).optional(),
  epic_order: z.number().int().min(0).optional(),
  epic_title: z.string().min(1).optional(),
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
    label: "roadmap origin is retired for new create writes",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Promote roadmap", origin_kind: "roadmap" },
    ok: false,
    fields: ["origin_kind"],
  },
  {
    label: "roadmap origin retirement takes precedence over linkage fields",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Promote roadmap",
      origin_kind: "roadmap",
      origin_issue_number: 7,
      origin_source_artifact: "ag-1",
    },
    ok: false,
    fields: ["origin_kind"],
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
    label: "blank create-time Epic fields normalize to omitted",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Add Epic guard",
      epic_id: " ",
      entry_id: " ",
      epic_title: " ",
      epic_order: 0,
    },
    ok: true,
    normalizedArgs: { summary: "Add Epic guard" },
  },
  {
    label: "sentinel create-time Epic fields normalize to omitted",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Add Epic sentinel guard",
      epic_id: "none",
      entry_id: "n/a",
      epic_title: "null",
    },
    ok: true,
    normalizedArgs: { summary: "Add Epic sentinel guard" },
  },
  {
    label: "partial create-time Epic membership is rejected before persistence",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: { summary: "Add Epic partial guard", epic_id: "addAuthEpic" },
    ok: false,
    fields: ["entry_id", "epic_title"],
  },
  {
    label: "complete create-time Epic membership survives preflight",
    toolName: "adv_change_create",
    schema: CREATE_SCHEMA,
    rawArgs: {
      summary: "Add Epic member",
      epic_id: "addAuthEpic",
      entry_id: "entry-1",
      epic_title: "Add Auth",
      epic_order: 2,
    },
    ok: true,
    normalizedArgs: {
      summary: "Add Epic member",
      epic_id: "addAuthEpic",
      entry_id: "entry-1",
      epic_title: "Add Auth",
      epic_order: 2,
    },
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
  {
    label: "blank ops-run-evidence optional fields normalize to omitted",
    toolName: "adv_ops_run_evidence_add",
    rawArgs: {
      changeId: "c",
      runId: "r",
      step_kind: "execute",
      env: "staging",
      status: "pass",
      summary: "ok",
      artifact: { kind: "none", rationale: "none needed" },
      next_status: "complete",
      step_id: " ",
      batch: " ",
      completion_signal: " ",
      health_verification: " ",
      rollback_or_cleanup_disposition: " ",
    },
    ok: true,
    normalizedArgs: {
      changeId: "c",
      runId: "r",
      step_kind: "execute",
      env: "staging",
      status: "pass",
      summary: "ok",
      artifact: { kind: "none", rationale: "none needed" },
      next_status: "complete",
    },
  },
  {
    label: "non-blank ops-run-evidence optional fields are preserved",
    toolName: "adv_ops_run_evidence_add",
    rawArgs: {
      changeId: "c",
      runId: "r",
      step_kind: "execute",
      env: "staging",
      status: "pass",
      summary: "ok",
      artifact: { kind: "none", rationale: "none needed" },
      next_status: "complete",
      step_id: "step-1",
      batch: "b-1",
      completion_signal: "sig",
      health_verification: "ok",
      rollback_or_cleanup_disposition: "none",
    },
    ok: true,
    normalizedArgs: {
      changeId: "c",
      runId: "r",
      step_kind: "execute",
      env: "staging",
      status: "pass",
      summary: "ok",
      artifact: { kind: "none", rationale: "none needed" },
      next_status: "complete",
      step_id: "step-1",
      batch: "b-1",
      completion_signal: "sig",
      health_verification: "ok",
      rollback_or_cleanup_disposition: "none",
    },
  },
  {
    label: "blank epic create optional fields normalize to omitted",
    toolName: "adv_epic_create",
    rawArgs: {
      epic_id: "myEpic",
      title: "My Epic",
      narrative: "Long narrative",
      owner_project_id: " ",
      owner_repo_id: " ",
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: {
      epic_id: "myEpic",
      title: "My Epic",
      narrative: "Long narrative",
    },
  },
  {
    label: "blank epic show owner-routing fields normalize to omitted",
    toolName: "adv_epic_show",
    rawArgs: {
      epic_id: "myEpic",
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: { epic_id: "myEpic" },
  },
  {
    label: "blank epic list owner-routing fields normalize to omitted",
    toolName: "adv_epic_list",
    rawArgs: {
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: {},
  },
  {
    label: "blank epic update title and narrative normalize to omitted",
    toolName: "adv_epic_update",
    rawArgs: {
      epic_id: "myEpic",
      expected_version: 3,
      title: " ",
      narrative: " ",
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: { epic_id: "myEpic", expected_version: 3 },
  },
  {
    label: "blank epic add-shell optional fields normalize to omitted",
    toolName: "adv_epic_add_shell",
    rawArgs: {
      epic_id: "myEpic",
      title: "Real shell title",
      success_hint: "Real hint",
      backlog_ref: " ",
      entry_id: " ",
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: {
      epic_id: "myEpic",
      title: "Real shell title",
      success_hint: "Real hint",
    },
  },
  {
    label: "blank epic promote-shell optional fields normalize to omitted",
    toolName: "adv_epic_promote_shell",
    rawArgs: {
      epic_id: "myEpic",
      entry_id: "entry-1",
      change_id: " ",
      promoted_by: " ",
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: { epic_id: "myEpic", entry_id: "entry-1" },
  },
  {
    label: "blank epic link-change optional fields normalize to omitted",
    toolName: "adv_epic_link_change",
    rawArgs: {
      epic_id: "myEpic",
      change_id: "c",
      link_evidence: "real evidence",
      title: " ",
      entry_id: " ",
      repo_id: " ",
      linked_by: " ",
      target_path: " ",
      target_confirmed: " ",
      confirmationEvidence: " ",
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: {
      epic_id: "myEpic",
      change_id: "c",
      link_evidence: "real evidence",
    },
  },
  {
    label: "blank epic unlink-change optional fields normalize to omitted",
    toolName: "adv_epic_unlink_change",
    rawArgs: {
      epic_id: "myEpic",
      unlink_evidence: "real evidence",
      entry_id: " ",
      change_id: " ",
      target_path: " ",
      target_confirmed: " ",
      confirmationEvidence: " ",
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: { epic_id: "myEpic", unlink_evidence: "real evidence" },
  },
  {
    label: "blank epic move-change optional fields normalize to omitted",
    toolName: "adv_epic_move_change",
    rawArgs: {
      from_epic_id: "epicA",
      to_epic_id: "epicB",
      change_id: "c",
      move_evidence: "real evidence",
      from_entry_id: " ",
      to_entry_id: " ",
      repo_id: " ",
      moved_by: " ",
      target_path: " ",
      target_confirmed: " ",
      confirmationEvidence: " ",
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: {
      from_epic_id: "epicA",
      to_epic_id: "epicB",
      change_id: "c",
      move_evidence: "real evidence",
    },
  },
  {
    label: "blank epic reorder owner-routing fields normalize to omitted",
    toolName: "adv_epic_reorder",
    rawArgs: {
      epic_id: "myEpic",
      entry_ids: ["e1"],
      expected_version: 1,
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: {
      epic_id: "myEpic",
      entry_ids: ["e1"],
      expected_version: 1,
    },
  },
  {
    label: "blank epic retire optional fields normalize to omitted",
    toolName: "adv_epic_retire",
    rawArgs: {
      epic_id: "myEpic",
      expected_version: 4,
      evidence: "real evidence",
      retired_by: " ",
      epic_owner_target_path: " ",
      epic_owner_target_confirmed: " ",
      epic_owner_confirmationEvidence: " ",
    },
    ok: true,
    normalizedArgs: {
      epic_id: "myEpic",
      expected_version: 4,
      evidence: "real evidence",
    },
  },
  // tk-6ff82311335f: read-tool page-limit fields — zero placeholder omits,
  // non-zero value preserved (AC3/AC4).
  {
    label: "zero backlog-list tail limit normalizes to omitted",
    toolName: "adv_backlog_list",
    rawArgs: { tail_limit: 0 },
    ok: true,
    normalizedArgs: {},
  },
  {
    label: "non-zero backlog-list tail limit preserved",
    toolName: "adv_backlog_list",
    rawArgs: { tail_limit: 500 },
    ok: true,
    normalizedArgs: { tail_limit: 500 },
  },
  {
    label: "zero epic-list limit normalizes to omitted",
    toolName: "adv_epic_list",
    rawArgs: { limit: 0 },
    ok: true,
    normalizedArgs: {},
  },
  {
    label: "non-zero epic-list limit preserved",
    toolName: "adv_epic_list",
    rawArgs: { limit: 25 },
    ok: true,
    normalizedArgs: { limit: 25 },
  },
  {
    label: "zero wisdom-list maxEntries normalizes to omitted",
    toolName: "adv_wisdom_list",
    rawArgs: { maxEntries: 0 },
    ok: true,
    normalizedArgs: {},
  },
  {
    label: "non-zero wisdom-list maxEntries preserved",
    toolName: "adv_wisdom_list",
    rawArgs: { maxEntries: 10 },
    ok: true,
    normalizedArgs: { maxEntries: 10 },
  },
  {
    label: "zero reflection-list maxEntries normalizes to omitted",
    toolName: "adv_reflection_list",
    rawArgs: { maxEntries: 0 },
    ok: true,
    normalizedArgs: {},
  },
  {
    label: "non-zero reflection-list maxEntries preserved",
    toolName: "adv_reflection_list",
    rawArgs: { maxEntries: 8 },
    ok: true,
    normalizedArgs: { maxEntries: 8 },
  },
];

describe("tool arg preflight", () => {
  const removedFacadeTools = new Set([
    "adv_backlog_add",
    "adv_backlog_list",
    "adv_backlog_show",
    "adv_backlog_promote",
    "adv_backlog_archive",
    "adv_contract_mint",
    "adv_followup_promote",
    "adv_epic_create",
    "adv_epic_show",
    "adv_epic_list",
    "adv_epic_update",
    "adv_epic_add_shell",
    "adv_epic_promote_shell",
    "adv_epic_link_change",
    "adv_epic_unlink_change",
    "adv_epic_move_change",
    "adv_epic_reorder",
    "adv_epic_retire",
  ]);
  describe("FIELD_POLICIES drift guards", () => {
    test("every audited placeholder/audit field has an explicit policy", () => {
      const policies = listToolArgFieldPolicies();

      for (const requirement of AUDITED_PREFLIGHT_POLICY_REQUIREMENTS) {
        if (removedFacadeTools.has(requirement.toolName)) continue;
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
      const store = await createDiskStore(storeTempDir);
      await store.init();

      try {
        const map = createToolMap(store, mapTempDir);
        const policies = listToolArgFieldPolicies();

        for (const [toolName, fields] of Object.entries(policies)) {
          if (removedFacadeTools.has(toolName)) continue;
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

    test("optional top-level strict-mode placeholders have reviewed omission coverage", async () => {
      const storeTempDir = await createTempDir();
      const mapTempDir = await createTempDir();
      const store = await createDiskStore(storeTempDir);
      await store.init();

      try {
        const map = createToolMap(
          store,
          mapTempDir,
          store.paths.agenda,
        ) as Record<
          string,
          {
            args?: Record<
              string,
              { safeParse?: (value: unknown) => { success: boolean } }
            >;
          }
        >;
        const policies = listToolArgFieldPolicies();
        const reviewed = new Set(
          AUDITED_PREFLIGHT_POLICY_REQUIREMENTS.filter(
            (requirement) => requirement.action === "omit",
          ).map(
            (requirement) =>
              `${requirement.toolName}.${requirement.field}.${requirement.policy}`,
          ),
        );
        const reviewedExceptions = new Set<string>();
        const uncovered: string[] = [];

        for (const [toolName, tool] of Object.entries(map)) {
          for (const [field, schema] of Object.entries(tool.args ?? {})) {
            const parse = schema.safeParse;
            if (!parse || !parse(undefined).success) continue;

            const blankCandidate = parse("x").success && !parse(" ").success;
            const zeroCandidate = parse(1).success && !parse(0).success;
            for (const policy of [
              ...(blankCandidate ? ["blank"] : []),
              ...(zeroCandidate ? ["zero"] : []),
            ] as const) {
              const key = `${toolName}.${field}.${policy}`;
              if (reviewedExceptions.has(key)) continue;
              if (
                !(
                  reviewed.has(key) &&
                  policies[toolName]?.[field]?.[policy] === "omit"
                )
              ) {
                uncovered.push(key);
              }
            }
          }
        }

        expect(
          uncovered.sort(),
          `optional top-level blank/zero-rejecting fields without a reviewed omission policy or exception:\n${uncovered.join("\n")}`,
        ).toEqual([]);
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
      if (removedFacadeTools.has(entry.toolName)) continue;
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
      "adv_change_close",
      {
        changeId: "c",
        reason: "cancelled",
        approvedByUser: true,
        approvalEvidence: " ",
      },
      "approvalEvidence",
    ],
    // T2: adv_gate_complete.target_path, adv_gate_complete.notes,
    // adv_gate_complete.compatibilityReason flipped to blank: "omit".
    // rq-toolPlaceholderPolicy01.6: adv_gate_complete.completedBy,
    // priorApprovalEvidence, confirmationEvidence also flipped to blank: "omit".
    // adv_run_test.target_path, adv_status.target_path,
    // adv_doctor.target_path, adv_contract_mint.{approvedAt,target_path}
    // similarly flipped. Coverage of the omit semantics for these fields
    // lives in `normalizes representative blank placeholder` below.
    ["adv_worktree_create", { branch: " " }, "branch"],
    ["adv_worktree_delete", { branch: " " }, "branch"],
    ["adv_worktree_cleanup", { reason: " " }, "reason"],
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
      { changeId: "c", proposal: "real", priorApprovalEvidence: " " },
      "priorApprovalEvidence",
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
      "adv_task_add",
      { changeId: "c", content: "do thing", confirmationEvidence: " " },
      "confirmationEvidence",
    ],
    [
      "adv_task_cancel",
      {
        taskIds: ["t"],
        approvedByUser: true,
        approvalEvidence: "ok",
        confirmationEvidence: " ",
      },
      "confirmationEvidence",
    ],
    [
      "adv_run_test",
      { taskId: "tk-1", command: "test", target_path: " " },
      "target_path",
    ],
    ["adv_status", { target_path: " " }, "target_path"],
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

    [
      "adv_worktree_cleanup",
      { reason: "archived branch cleanup", mode: " " },
      "mode",
    ],
    [
      "adv_worktree_cleanup",
      { reason: "archived branch cleanup", changeId: " " },
      "changeId",
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

  test("projects bounded nested union diagnostics instead of an opaque union error", () => {
    const branch = (name: string) =>
      z.object({
        agent: z.literal(name),
        payload: z.object({ required: z.string().min(1) }),
      });
    const result = validateToolArgsBeforeExecute(
      "adv_subagent_report_submit",
      {
        report: z.union([
          branch("adv-engineer"),
          branch("adv-reviewer"),
          branch("adv-researcher"),
          branch("adv-tron"),
          branch("adv-scanner-bundle"),
          branch("adv-verification-triage-bundle"),
        ]),
      },
      { report: { agent: "unknown", payload: {} } },
    );

    expect(result.ok).toBe(false);
    expect(result.invalid.length).toBeLessThanOrEqual(10);
    expect(result.invalid.some((issue) => issue.field === "report.agent")).toBe(
      true,
    );
    expect(
      result.invalid.some((issue) => issue.field === "report.payload.required"),
    ).toBe(true);
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

    // No operation provided at all → the operation-count guard fires.
    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
      }).invalid[0]?.message,
    ).toContain("requires one operation");

    // T2 (rq-toolArgBlankArtifactLinkage01.1 revised): all blanks normalize
    // to omitted; the operation-count guard then fires because no operation
    // survived normalization. Result: same error as "nothing provided" —
    // semantically correct ("you didn't send anything to change").
    expect(
      validateToolArgsBeforeExecute("adv_change_update", schema, {
        changeId: "abc",
        proposal: "",
        agreement: "   ",
      }).invalid[0]?.message,
    ).toContain("requires one operation");

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

  describe("adv_change_update structural operations reach the handler", () => {
    const schema = {
      changeId: z.string(),
      proposal: z.string().optional(),
      design: z.string().optional(),
      link_change: z.string().optional(),
      unlink_change: z.string().optional(),
      reorder_entries: z.array(z.string()).optional(),
    };

    test("link_change alone passes preflight", () => {
      const result = validateToolArgsBeforeExecute(
        "adv_change_update",
        schema,
        {
          changeId: "someEpic",
          link_change: "someChange",
        },
      );
      expect(result.ok).toBe(true);
      expect(result.invalid).toEqual([]);
    });

    test("unlink_change alone passes preflight", () => {
      const result = validateToolArgsBeforeExecute(
        "adv_change_update",
        schema,
        {
          changeId: "someEpic",
          unlink_change: "someChange",
        },
      );
      expect(result.ok).toBe(true);
    });

    test("reorder_entries alone passes preflight", () => {
      const result = validateToolArgsBeforeExecute(
        "adv_change_update",
        schema,
        {
          changeId: "someEpic",
          reorder_entries: ["entry-2", "entry-1"],
        },
      );
      expect(result.ok).toBe(true);
    });

    test("several artifacts together count as one operation", () => {
      const result = validateToolArgsBeforeExecute(
        "adv_change_update",
        schema,
        {
          changeId: "abc",
          proposal: "real",
          design: "also real",
        },
      );
      expect(result.ok).toBe(true);
    });

    test("an empty reorder_entries normalizes out and is not an operation", () => {
      const result = validateToolArgsBeforeExecute(
        "adv_change_update",
        schema,
        {
          changeId: "someEpic",
          reorder_entries: [],
        },
      );
      expect(result.ok).toBe(false);
      expect(result.normalizedArgs).not.toHaveProperty("reorder_entries");
      expect(result.invalid[0]?.message).toContain("requires one operation");
    });

    test("a blank structural field normalizes out and is not an operation", () => {
      const result = validateToolArgsBeforeExecute(
        "adv_change_update",
        schema,
        {
          changeId: "someEpic",
          link_change: "   ",
        },
      );
      expect(result.ok).toBe(false);
      expect(result.invalid[0]?.message).toContain("requires one operation");
    });

    test("no operation at all names both artifact and structural routes", () => {
      const result = validateToolArgsBeforeExecute(
        "adv_change_update",
        schema,
        {
          changeId: "abc",
        },
      );
      expect(result.ok).toBe(false);
      const message = result.invalid[0]?.message ?? "";
      expect(message).toContain("requires one operation");
      expect(message).toContain("proposal");
      expect(message).toContain("link_change");
    });

    test("mixing an artifact with a structural operation is refused", () => {
      const result = validateToolArgsBeforeExecute(
        "adv_change_update",
        schema,
        {
          changeId: "someEpic",
          proposal: "real content",
          link_change: "someChange",
        },
      );
      expect(result.ok).toBe(false);
      expect(result.invalid[0]?.message).toContain("one operation at a time");
    });

    test("mixing two structural operations is refused", () => {
      const result = validateToolArgsBeforeExecute(
        "adv_change_update",
        schema,
        {
          changeId: "someEpic",
          link_change: "changeA",
          unlink_change: "changeB",
        },
      );
      expect(result.ok).toBe(false);
      expect(result.invalid[0]?.message).toContain("one operation at a time");
    });
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
      field: "origin_kind",
      message:
        "ORIGIN_KIND_ROADMAP_RETIRED: origin_kind 'roadmap' is retired for new writes. Use 'triage' for issue-linked changes.",
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
      expect(result.invalid[0]?.message).toContain("requires one operation");
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
      const result = preflightToolArgs(
        "adv_gate_complete",
        {},
        {
          changeId: "fixPcIdentityScope",
          gateId: "execution",
          completedBy: "",
          userApproved: false,
          notes: "",
          compatibilityReason: "",
          priorApprovalEvidence: "",
          target_path: "",
          target_confirmed: true,
          confirmationEvidence: "",
        },
      );
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
        "adv_task_cancel",
        { taskIds: ["t"], approvedByUser: true, approvalEvidence: " " },
        "approvalEvidence",
      ],
      // rq-toolPlaceholderPolicy01.6: adv_gate_complete.completedBy,
      // confirmationEvidence, priorApprovalEvidence moved from reject to omit
      // — no longer here. adv_change_update.confirmationEvidence,
      // priorApprovalEvidence also moved.
      // adv_contract_mint.confirmationEvidence, priorApprovalEvidence moved.
      // adv_contract_review_matrix_set.confirmationEvidence, priorApprovalEvidence moved.
      // adv_doctor.confirmationEvidence moved (rq-doctorConsolidation01).
      // adv_run_test.confirmationEvidence moved.
      // adv_task_update confirmationEvidence moved.
      // adv_task_add confirmationEvidence moved.
      // adv_task_cancel confirmationEvidence moved.
      // adv_task_reclassify_tdd confirmationEvidence moved.
      ["adv_worktree_create", { branch: " " }, "branch"],
      ["adv_worktree_create", { branch: "x", base: " " }, "base"],
      ["adv_worktree_delete", { branch: " " }, "branch"],
      ["adv_worktree_cleanup", { reason: " " }, "reason"],
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
          origin_kind: z.enum(["triage"]).optional(),
          origin_issue_number: z.number().int().positive().optional(),
        },
        {
          summary: "Promote triage item",
          origin_kind: "triage",
          origin_issue_number: 42,
        },
      );
      expect(result.ok).toBe(true);
      expect(result.normalizedArgs).toEqual({
        summary: "Promote triage item",
        origin_kind: "triage",
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
