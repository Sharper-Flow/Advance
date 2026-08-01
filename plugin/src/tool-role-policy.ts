/**
 * Code-owned ADV tool role policy
 * (consolidateAdvToolSurface2 — SC2/SC3/AC5/AC6, C6, DONT3, DDC8).
 *
 * Single authoritative classification of every retained public ADV tool
 * (ADV_TOOL_NAMES) into orchestrator / operator-only / dual reachability,
 * plus the intended ADV tool allowlist for every shipped agent manifest.
 *
 * docs/tool-ownership.md remains the documented view; this module is the
 * code-owned policy that agent manifests are validated against. Dual tools
 * keep the action-level read/mutate distinction (e.g. adv_snapshot_health
 * `scan`/`audit_history` agent-readable, `repair` operator-only) instead of
 * flattening it.
 *
 * Manifest semantics (verified against OpenCode 1.18.x
 * packages/core/src/v1/config/agent.ts normalize() +
 * packages/opencode/src/permission/index.ts fromConfig/disabled/evaluate):
 * legacy `tools:` entries convert to permission rules in document order and
 * the LAST matching rule wins, so `adv_*: false` first with specific
 * `adv_x: true` entries after it yields default-deny with explicit role
 * grants. Unspecified tools inherit the default allow posture, which is why
 * every non-orchestrator agent must carry the deny wildcard.
 */

import { ADV_TOOL_NAMES } from "./tool-registry";

export { TIER_4_MCP_TOOLS } from "./tool-tier4-catalog.js";

export type ToolRoleClass = "orchestrator" | "operator-only" | "dual";

export interface ToolRoleEntry {
  readonly class: ToolRoleClass;
  readonly rationale: string;
  /**
   * Dual only: agent-reachable action/argument surface (reads, diagnostics).
   * Undefined for non-dual classes so the distinction cannot be flattened.
   */
  readonly agentActions?: readonly string[];
  /**
   * Dual only: operator-owned action/argument surface (mutations, refreshes,
   * audit-escape hatches). May be empty when the tool exposes no agent
   * mutation surface at all. Undefined for non-dual classes.
   */
  readonly operatorActions?: readonly string[];
}

/**
 * Exhaustive role classification for every retained canonical ADV tool.
 * Exact-key parity with ADV_TOOL_NAMES is enforced by
 * tool-role-policy.test.ts — a registry change without a policy row fails CI.
 */
export const TOOL_ROLE_POLICY: Readonly<Record<string, ToolRoleEntry>> = {
  // ── Operator-only (9) ────────────────────────────────────────────────
  // Maintenance/recovery tools with destructive, wedged-state, or store-level
  // blast radius. Grantable only to the ADV orchestrator, which invokes them
  // solely on explicit operator instruction with approval evidence (C6).
  adv_archive_purge: {
    class: "operator-only",
    rationale:
      "Terminates archived workflows; opt-in includeDiskBundle recursively deletes the archive bundle (approvedByUser + approvalEvidence).",
  },
  adv_change_repair_origin: {
    class: "operator-only",
    rationale:
      "Repairs origin provenance linkage on an open change; claim-safe audited repair (approvedByUser + approvalEvidence + reason).",
  },
  adv_change_projection_quarantine: {
    class: "operator-only",
    rationale:
      "Operator-only quarantine for corrupt or oversized active change projections. Atomically moves the bad change.json outside the active read path, preserves original bytes/metadata, and appends a purpose-specific audit entry (approvedByUser + approvalEvidence + changeId). Refuses healthy, missing, or Temporal-reconstructable records.",
  },
  adv_change_workflow_terminate: {
    class: "operator-only",
    rationale:
      "Terminates the exact describe-pinned wedged run of a shipped change's workflow (not a Temporal Reset); approvedByUser + approvalEvidence + shipped acceptance/release gate proof + poisoned-history describe evidence required.",
  },
  adv_store_cleanup: {
    class: "operator-only",
    rationale:
      "Deletes legacy agenda stores; manifest-before-delete with approvedByUser + approvalEvidence + dry-run plan_hash.",
  },
  adv_store_consolidate: {
    class: "operator-only",
    rationale:
      "Consolidates orphaned identity stores into the true-root store; approval-gated, mutually serialized with cleanup.",
  },
  adv_launcher_projection_rebuild: {
    class: "operator-only",
    rationale:
      "Regenerates the aggregate active-launcher-state.json from the on-disk per-change projection set; a producer-owned cache rebuild with external-state blast radius if misused.",
  },

  // ── Dual (8) ─────────────────────────────────────────────────────────
  // Read actions agent-reachable; mutation/refresh surfaces operator-owned.
  // Action-level distinctions mirror docs/tool-ownership.md, including the
  // action-qualified operator-only rows for snapshot_health (#repair) and
  // conformance (#override).
  adv_conformance: {
    class: "dual",
    rationale:
      "Spec conformance: status/init/lock/unlock/run stay orchestrator-reachable; override is an audit-escape hatch requiring user + reason + re_verify_deadline.",
    agentActions: ["status", "init", "lock", "unlock", "run"],
    operatorActions: ["override"],
  },
  adv_project_metadata: {
    class: "dual",
    rationale:
      "Per-project metadata: read/list are agent-safe; write is owned by scan producers (slop-scan, comp-scan, audit, arch-scan), not ad-hoc agent writes.",
    agentActions: ["read", "list"],
    operatorActions: ["write"],
  },
  adv_session_list: {
    class: "dual",
    rationale:
      "Privacy-defensive peer session inventory read; no agent mutation surface — session lifecycle is owned by the oc wrapper/operator.",
    agentActions: ["read"],
    operatorActions: [],
  },
  adv_session_show: {
    class: "dual",
    rationale:
      "Self-session detail read; no agent mutation surface — session lifecycle is owned by the oc wrapper/operator.",
    agentActions: ["read"],
    operatorActions: [],
  },
  adv_snapshot_health: {
    class: "dual",
    rationale:
      "Snapshot-store corruption scan/audit_history are agent-readable diagnostics; repair deletes corrupt objects and requires approvedByUser + approvalEvidence + repair_actions whitelist.",
    agentActions: ["scan", "audit_history"],
    operatorActions: ["repair"],
  },
  adv_status: {
    class: "dual",
    rationale:
      "All status views (summary/health/changes/hygiene) are agent-readable; forceRefresh health-probe cache refresh is operator-owned.",
    agentActions: [
      "summary view",
      "health view",
      "changes view",
      "hygiene view",
    ],
    operatorActions: ["forceRefresh"],
  },
  adv_wip_state: {
    class: "dual",
    rationale:
      "Cross-change work-in-progress aggregate read; no agent mutation surface — the worktree/session state it reports on is operator-owned.",
    agentActions: ["read"],
    operatorActions: [],
  },

  // ── Orchestrator (63) ────────────────────────────────────────────────
  // Routine ADV command-workflow and agent tools. Several mutations remain
  // approval-gated, driven by the orchestrator through gate/command workflows
  // with human checkpoints. Safety-distinct families (archive/purge/repair,
  // task checkpoint/update/cancel, Temporal repair, cross-project trust
  // boundaries) stay distinct — no universal router (DONT1/DONT3).
  adv_resume_projection: {
    class: "orchestrator",
    rationale:
      "Pure-read dependency-aware resume projection. No mutation surface — generates an in-memory 'what next' view from changes + epics. Consumed by adv_status, /adv-coordinate, /adv-triage, and bin/adv.",
  },
  adv_backlog_add: {
    class: "orchestrator",
    rationale: "Backlog item capture.",
  },
  adv_backlog_archive: {
    class: "orchestrator",
    rationale: "Soft-delete (archive) of a backlog item.",
  },
  adv_backlog_list: {
    class: "orchestrator",
    rationale: "Backlog read.",
  },
  adv_backlog_promote: {
    class: "orchestrator",
    rationale: "Promotion to change/Epic shell.",
  },
  adv_backlog_show: {
    class: "orchestrator",
    rationale: "Backlog read.",
  },
  adv_change_archive: {
    class: "orchestrator",
    rationale: "Release-gate archive workflow.",
  },
  adv_change_bulk_close: {
    class: "orchestrator",
    rationale:
      "Approval-gated bulk close; fail-all on protected/invalid targets.",
  },
  adv_change_close: {
    class: "orchestrator",
    rationale: "Approval-gated close.",
  },
  adv_change_create: {
    class: "orchestrator",
    rationale: "Change creation.",
  },
  adv_change_list: {
    class: "orchestrator",
    rationale: "Change inventory read.",
  },
  adv_change_reenter: {
    class: "orchestrator",
    rationale: "Gate re-entry.",
  },
  adv_change_show: {
    class: "orchestrator",
    rationale: "Change detail read.",
  },
  adv_change_update: {
    class: "orchestrator",
    rationale: "Change update.",
  },
  adv_change_set_worker_bundle_impact: {
    class: "orchestrator",
    rationale: "Typed worker-bundle impact declaration at planning.",
  },
  adv_change_set_release_notes: {
    class: "orchestrator",
    rationale: "Typed release-note full-replacement setter.",
  },
  adv_change_update_issues: {
    class: "orchestrator",
    rationale: "Issue linkage update.",
  },
  adv_change_validate: {
    class: "orchestrator",
    rationale: "Validation read.",
  },
  adv_contract_mint: {
    class: "orchestrator",
    rationale: "ChangeContract minting from approved agreement.",
  },
  adv_contract_review_matrix_set: {
    class: "orchestrator",
    rationale: "Review-matrix persistence.",
  },
  adv_delta_add: {
    class: "orchestrator",
    rationale:
      "Change-scoped spec-delta mutation; archive remains sole global-spec writer.",
  },
  adv_delta_modify: {
    class: "orchestrator",
    rationale:
      "Typed change-scoped spec modification; archive remains sole global-spec writer.",
  },
  adv_delta_amend: {
    class: "orchestrator",
    rationale:
      "Full-replacement change-scoped spec delta amend; archive remains sole global-spec writer.",
  },
  adv_delta_retract: {
    class: "orchestrator",
    rationale:
      "Change-scoped spec delta retraction; archive remains sole global-spec writer.",
  },
  adv_delta_remove: {
    class: "orchestrator",
    rationale:
      "Change-scoped remove-operation spec delta; archive remains sole global-spec writer.",
  },
  adv_delta_rename: {
    class: "orchestrator",
    rationale:
      "Change-scoped rename-operation spec delta; archive remains sole global-spec writer.",
  },
  adv_delta_list: {
    class: "orchestrator",
    rationale: "Staged spec-delta read (bounded list).",
  },
  adv_delta_show: {
    class: "orchestrator",
    rationale: "Staged spec-delta read (single delta).",
  },
  adv_design_concern_disposition: {
    class: "orchestrator",
    rationale: "Design-concern disposition.",
  },
  adv_epic_add_shell: {
    class: "orchestrator",
    rationale: "Shell entry add.",
  },
  adv_epic_create: {
    class: "orchestrator",
    rationale: "Epic creation.",
  },
  adv_epic_link_change: {
    class: "orchestrator",
    rationale: "Link existing change.",
  },
  adv_epic_list: {
    class: "orchestrator",
    rationale: "Epic read.",
  },
  adv_epic_move_change: {
    class: "orchestrator",
    rationale: "Move change between Epics.",
  },
  adv_epic_promote_shell: {
    class: "orchestrator",
    rationale: "Shell promotion to change.",
  },
  adv_epic_reorder: {
    class: "orchestrator",
    rationale: "Advisory reorder.",
  },
  adv_epic_retire: {
    class: "orchestrator",
    rationale: "Terminal Epic retirement with evidence.",
  },
  adv_epic_show: {
    class: "orchestrator",
    rationale: "Epic read.",
  },
  adv_epic_unlink_change: {
    class: "orchestrator",
    rationale: "Unlink change entry.",
  },
  adv_epic_update: {
    class: "orchestrator",
    rationale: "Title/narrative update with optimistic concurrency.",
  },
  adv_followup_promote: {
    class: "orchestrator",
    rationale: "Ops follow-up promotion to child change.",
  },
  adv_gate_complete: {
    class: "orchestrator",
    rationale: "Gate completion with approval evidence.",
  },
  adv_gate_status: {
    class: "orchestrator",
    rationale: "Gate read.",
  },
  adv_lightweight_profile_evaluate: {
    class: "orchestrator",
    rationale:
      "Host-side evidence collection + Temporal signal for lightweight profile evaluation; driven by gate workflow.",
  },
  adv_ops_evidence_add: {
    class: "orchestrator",
    rationale: "Ops follow-up evidence append.",
  },
  adv_ops_followup_resolution_upsert: {
    class: "orchestrator",
    rationale: "Ops follow-up link resolution upsert.",
  },
  adv_ops_run_evidence_add: {
    class: "orchestrator",
    rationale: "Run-step evidence append; prod execute steps approval-gated.",
  },
  adv_ops_run_upsert: {
    class: "orchestrator",
    rationale: "Ops runbook run upsert.",
  },
  adv_project_context: {
    class: "orchestrator",
    rationale: "project.md read.",
  },
  adv_reflect: {
    class: "orchestrator",
    rationale: "Post-archive two-plane reflection.",
  },
  adv_reflection_list: {
    class: "orchestrator",
    rationale: "Reflection read.",
  },
  adv_report_followup_promote: {
    class: "orchestrator",
    rationale: "Report follow-up promotion.",
  },
  adv_run_test: {
    class: "orchestrator",
    rationale: "Bounded test-run evidence.",
  },
  adv_worker_bundle_provenance_record: {
    class: "orchestrator",
    rationale:
      "Record worker-bundle build+replay provenance on a change after both runs pass; execution-time evidence receipt.",
  },
  adv_spec: {
    class: "orchestrator",
    rationale: "Spec list/show/search read.",
  },
  adv_subagent_report_submit: {
    class: "orchestrator",
    rationale: "Typed sub-agent report ingestion.",
  },
  adv_task_add: {
    class: "orchestrator",
    rationale: "Task mutation.",
  },
  adv_task_cancel: {
    class: "orchestrator",
    rationale: "Task cancellation.",
  },
  adv_task_checkpoint: {
    class: "orchestrator",
    rationale: "Task checkpoint commit.",
  },
  adv_task_list: {
    class: "orchestrator",
    rationale: "Task read.",
  },
  adv_task_ready: {
    class: "orchestrator",
    rationale: "Ready-queue read.",
  },
  adv_task_reclassify_tdd: {
    class: "orchestrator",
    rationale: "TDD reclassification with user signoff.",
  },
  adv_task_show: {
    class: "orchestrator",
    rationale: "Task read.",
  },
  adv_task_update: {
    class: "orchestrator",
    rationale: "Task mutation.",
  },
  adv_doctor: {
    class: "orchestrator",
    rationale:
      "Single diagnose→safe-fix→verify entry point for routine infrastructure recovery. Orchestrator-reachable because every fix is gated on a proven safe-subset and every escalation refuses with a typed approval-required proposal.",
  },
  adv_verification_evidence_disposition: {
    class: "orchestrator",
    rationale:
      "Verification-evidence disposition clearing a VERIFICATION_EVIDENCE_MISSING blocker on proof-bearing task policies; typed fixed/rejected_with_evidence/split/fast_follow with non-blank evidence (no accepted_debt), parallel to adv_design_concern_disposition.",
  },
  adv_wisdom_add: {
    class: "orchestrator",
    rationale: "Wisdom capture.",
  },
  adv_wisdom_list: {
    class: "orchestrator",
    rationale: "Wisdom read (including project-only listings).",
  },
  adv_worktree_cleanup: {
    class: "orchestrator",
    rationale:
      "Worktree hygiene; archived_branches mode is operator-explicit (dry-run first).",
  },
  adv_worktree_detach: {
    class: "operator-only",
    rationale:
      "Directory-only nonterminal worktree detach; preserves branch and change record, requires explicit operator approval and exact branch set. Never invoked by reapers, triage, startup cleanup, or migration automation.",
  },
  adv_worktree_create: {
    class: "orchestrator",
    rationale: "Tool-owned worktree creation.",
  },
  adv_worktree_delete: {
    class: "orchestrator",
    rationale: "Worktree deletion (merge-before-delete).",
  },
  adv_worktree_resume: {
    class: "orchestrator",
    rationale: "Worktree resume/materialize.",
  },
  adv_worktree_triage: {
    class: "orchestrator",
    rationale: "Read-only worktree inventory.",
  },
  adv_tool_catalog: {
    class: "orchestrator",
    rationale:
      "Read-only bounded catalog of canonical ADV tools; descriptive visibility metadata only.",
  },
  adv_tool_describe: {
    class: "orchestrator",
    rationale:
      "Read-only single-tool schema and metadata projection; no handler invocation.",
  },
  adv_tool_invoke: {
    class: "orchestrator",
    rationale:
      "Strict in-process dispatcher through the canonical wrapped ToolDefinition.execute; preserves ToolContext, validation, authorization, approvals, recovery restrictions, and timeouts. Recursion exclusion (adv_tool_invoke, adv_tool_catalog, adv_tool_describe, execute) is enforced before any lookup or dispatch (addProviderToolSearch AC1-AC4).",
  },
} as const;

function namesByClass(className: ToolRoleClass): readonly string[] {
  return Object.freeze(
    Object.entries(TOOL_ROLE_POLICY)
      .filter(([, entry]) => entry.class === className)
      .map(([tool]) => tool),
  );
}

/** Retained tools restricted to operator-invoked use (any agent action). */
export const OPERATOR_ONLY_TOOL_NAMES: readonly string[] =
  namesByClass("operator-only");

/** Retained tools whose read surface is agent-safe and mutation surface is operator-owned. */
export const DUAL_TOOL_NAMES: readonly string[] = namesByClass("dual");

export interface AgentToolPolicy {
  /** Agent manifest basename under .opencode/agents (no .md suffix). */
  readonly agent: string;
  /**
   * Intended ADV allowlist: the manifest's `adv_*: true` entries must equal
   * this set exactly (AC6 — role-irrelevant or unregistered entries fail CI).
   */
  readonly allowed: readonly string[];
  /**
   * ADV tools the manifest must keep as explicit `false` entries (pinned by
   * per-agent asset tests) even when the deny wildcard already covers them.
   */
  readonly explicitBlocked: readonly string[];
  /**
   * When true, the manifest must carry `adv_*: false` ahead of any specific
   * grants (last-match-wins), closing the default-allow hole for every
   * retained and future ADV tool outside `allowed`. The orchestrator is the
   * only agent without the wildcard: it grants the full retained surface
   * explicitly.
   */
  readonly denyWildcard: boolean;
  readonly rationale: string;
}

/**
 * Tier 1 — always top-level for every agent (11 tools).
 * Core workflow reads/mutations + facade discovery surface.
 * slimMutationToolSurface: SC1/AC1/AC2/DDC1/DDC2.
 */
const TIER_1_ALLOWLIST: readonly string[] = Object.freeze([
  "adv_change_archive",
  "adv_change_show",
  "adv_gate_complete",
  "adv_gate_status",
  "adv_task_checkpoint",
  "adv_task_list",
  "adv_task_show",
  "adv_task_update",
  "adv_tool_catalog",
  "adv_tool_describe",
  "adv_tool_invoke",
]);

/**
 * Tier 2 — orchestrator-only top-level (8 tools).
 * Change lifecycle and task creation surface driven by the orchestrator
 * through gate/command workflows. Sub-agents invoke these via
 * adv_tool_invoke when needed.
 */
const TIER_2_ALLOWLIST: readonly string[] = Object.freeze([
  "adv_change_close",
  "adv_change_create",
  "adv_change_list",
  "adv_change_set_release_notes",
  "adv_change_update",
  "adv_run_test",
  "adv_task_add",
  "adv_task_ready",
]);

/**
 * Tier 4 — MCP read surface (13 unprefixed tools, see `TIER_4_MCP_TOOLS`).
 * These tools are additionally reachable via `tools.adv.*` under Code Mode
 * regardless of the host-plugin `adv_*: false` enforcement, because the MCP
 * surface is namespaced separately from the host manifest. The `adv_*: deny`
 * wildcard above applies to the host-plugin tool surface only; it does not
 * block the Code Mode dispatch route for these read-only tools.
 */

/**
 * Intended ADV tool surface per shipped agent manifest.
 *
 * slimMutationToolSurface: ~66 low-frequency tools (Tier 3) are routed
 * through adv_tool_invoke instead of appearing in any manifest. The
 * orchestrator gets Tier 1 + Tier 2 (18 entries); sub-agents get Tier 1
 * only (11 entries). Operator-only tools are invoke-only — their
 * destructive surface is protected by the tools' own approvedByUser +
 * approvalEvidence required arguments, not by manifest grantability.
 */
export const AGENT_TOOL_POLICY: readonly AgentToolPolicy[] = [
  {
    agent: "adv",
    allowed: [...TIER_1_ALLOWLIST, ...TIER_2_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "ADV orchestrator: Tier 1 + Tier 2 (18 entries). All other ADV tools (Tier 3 ~66) dispatched through adv_tool_invoke. Operator-only tools rely on their own approvedByUser + approvalEvidence gates (C6).",
  },
  {
    agent: "adv-ci-waiter",
    allowed: [],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "CI-only poller driving the oc-ci-wait CLI via bash; no ADV tool is part of its documented responsibility.",
  },
  {
    agent: "adv-designer",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
  {
    agent: "adv-engineer",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
  {
    agent: "adv-researcher",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
  {
    agent: "adv-reviewer",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
  {
    agent: "adv-temporal-repair",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
  {
    agent: "adv-tron",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
  {
    agent: "adv-verifier",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
  {
    agent: "adv-visual-review",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
  {
    agent: "build",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
  {
    agent: "plan",
    allowed: [...TIER_1_ALLOWLIST],
    explicitBlocked: [],
    denyWildcard: true,
    rationale:
      "Tier 1 surface only; all other ADV tools dispatched through adv_tool_invoke.",
  },
] as const;

/**
 * Authoritative spawnable roster: every shipped agent whose manifest carries
 * `mode: subagent`. This is the source of truth for the runtime role firewall
 * and manifest generator.
 */
export const SPAWNABLE_SUBAGENT_ROSTER: readonly string[] = Object.freeze([
  "adv-ci-waiter",
  "adv-designer",
  "adv-engineer",
  "adv-researcher",
  "adv-reviewer",
  "adv-temporal-repair",
  "adv-tron",
  "adv-verifier",
  "adv-visual-review",
]);

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

/** Pure union of the allowlists for every agent in SPAWNABLE_SUBAGENT_ROSTER. */
export function subAgentUnionAllowlist(): readonly string[] {
  const union = new Set<string>();
  for (const agent of SPAWNABLE_SUBAGENT_ROSTER) {
    const policy = AGENT_TOOL_POLICY.find((p) => p.agent === agent);
    if (!policy) continue;
    for (const tool of policy.allowed) {
      union.add(tool);
    }
  }
  return sortedUnique([...union]);
}

/** Pure complement: ADV tools that are NOT in the sub-agent union floor. */
export function blockableFromSubAgentSession(): readonly string[] {
  const allowed = new Set(subAgentUnionAllowlist());
  return sortedUnique(ADV_TOOL_NAMES.filter((tool) => !allowed.has(tool)));
}
