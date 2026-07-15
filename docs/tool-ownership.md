# Tool Ownership and Reachability Matrix

> Git-tracked ownership/reachability classification for every registered ADV
> tool (`plugin/src/tool-registry.ts` `ADV_TOOL_NAMES`).
> Anchors: spec `rq-toolOwnership01` (`.adv/specs/advance-meta/spec.json`),
> static-check `plugin/src/tool-ownership-assets.test.ts`. Adding, renaming,
> or removing a registered tool without updating this matrix fails CI.

Classifications are advisory reachability policy, not tool-manifest gating:
operator-only tools stay registered and discoverable, but agents invoke them
only on explicit operator instruction with the required approval evidence —
never as routine autonomous actions (contract C5 / DONT5).

## Classifications

| Class | Meaning | Reachability |
|---|---|---|
| `orchestrator` | Workflow tool: lifecycle, task, gate, Epic, backlog, spec, wisdom, contract, and supporting reads | ADV command workflow + agent |
| `operator-only` | Maintenance or recovery tool with destructive, wedged-state, or store-level blast radius | Explicit operator invocation with approval evidence; never routine autonomous agent action |
| `dual` | Mixed surface: reads are agent-safe, mutation/refresh surfaces are operator-owned | Read: agent; mutate: operator |

## Operator-Only Tools

Named maintenance set (`rq-toolOwnership01.2`) plus the extended
approval-gated recovery family that shares the same posture.

| Tool | Class | Approval gate | Rationale |
|---|---|---|---|
| `adv_archive_purge` | operator-only | `approvedByUser` + `approvalEvidence` | Terminates archived workflows; opt-in `includeDiskBundle` recursively deletes the archive bundle (`rq-archivePurge01`) |
| `adv_archive_repair` | operator-only | action-scoped evidence (`reconcile` requires `approvedByUser`) | Archived-change recovery: scan, redrive, reconcile of wedged terminal projections |
| `adv_store_cleanup` | operator-only | `approvedByUser` + `approvalEvidence` + dry-run `plan_hash` | Deletes legacy agenda stores; manifest-before-delete, retained indefinitely as operator-only maintenance (`rq-storeCleanupCoupling01`) |
| `adv_store_consolidate` | operator-only | `approvedByUser` + `approvalEvidence` + dry-run plan | Consolidates orphaned identity stores into the true-root store; mutually serialized with cleanup |
| `adv_snapshot_health` (`#repair`) | operator-only | `approvedByUser` + `approvalEvidence` + `repair_actions` whitelist | Deletes corrupt OpenCode snapshot-store objects; `scan`/`audit_history` remain agent-readable diagnostics |
| `adv_temporal_worker_restart` | operator-only | explicit operator invocation | Restarts the project Temporal worker; disruptive to in-flight tool calls |
| `adv_conformance` (`#override`) | operator-only | audit fields `user` + `reason` + `re_verify_deadline` | Overrides a locked conformance verdict; audit-escape hatch only. Other actions (`status`, `init`, `lock`, `unlock`, `run`) stay orchestrator-reachable |
| `adv_change_status_repair` | operator-only | `approvedByUser` + `approvalEvidence` + recovery evidence | Single-change wedged-status flip. Decision matrix vs `adv_archive_repair action=reconcile`: status repair is the targeted single-change path gated on precise workflow evidence (no branch requirement, `target_path` routing); reconcile is the batch path gated on branch-merge evidence |
| `adv_change_repair_origin` | operator-only | `approvedByUser` + `approvalEvidence` + `reason` | Repairs origin provenance linkage on an open change; claim-safe audited repair |
| `adv_temporal_register_search_attributes` | operator-only | `approvedByUser` + `approvalEvidence` | Registers missing Temporal search attributes on the server; one-time metadata mutation |

## Dual Tools

Read actions are agent-reachable. Mutation or refresh surfaces are
operator-owned and must not run as routine autonomous agent actions
(`rq-toolOwnership01.3`).

| Tool | Class | Read (agent) | Mutate (operator) |
|---|---|---|---|
| `adv_status` | dual | All views (`summary`, `health`, `changes`, `hygiene`) | `forceRefresh` health-probe cache refresh |
| `adv_project_metadata` | dual | `read`, `list` | `write` — scan-owned producers only (slop-scan, comp-scan, audit, arch-scan); not ad-hoc agent writes |
| `adv_wip_state` | dual | Cross-change work-in-progress aggregate read | No agent mutation surface; worktree/session state it reports on is operator-owned |
| `adv_session_list` | dual | Privacy-defensive peer session inventory | No agent mutation surface; session lifecycle owned by the `oc` wrapper/operator |
| `adv_session_show` | dual | Self-session detail read | No agent mutation surface; session lifecycle owned by the `oc` wrapper/operator |
| `adv_roadmap` | dual | `file`/`live` backlog reads with TTL-bounded freshness and O(1) active-change annotation | Roadmap mirror regeneration via `/adv-triage` (HITL-scoped); live GitHub Project refresh is operator-triggered |

## Orchestrator Tools

Routine ADV command-workflow and agent tools, grouped by domain. Several
mutations remain approval-gated (noted); the orchestrator drives them through
gate/command workflows with human checkpoints, which keeps them orchestrator
class rather than operator-only.

### Spec

| Tool | Class | Notes |
|---|---|---|
| `adv_spec` | orchestrator | Spec list/show/search read |
| `adv_delta_add` | orchestrator | Change-scoped spec-delta mutation; archive remains sole global-spec writer |

### Backlog

| Tool | Class | Notes |
|---|---|---|
| `adv_backlog_add` | orchestrator | Backlog item capture |
| `adv_backlog_list` | orchestrator | Backlog read |
| `adv_backlog_show` | orchestrator | Backlog read |
| `adv_backlog_promote` | orchestrator | Promotion to change/Epic shell |
| `adv_backlog_archive` | orchestrator | Soft-delete (archive) of a backlog item |

### Change lifecycle

| Tool | Class | Notes |
|---|---|---|
| `adv_change_list` | orchestrator | Change inventory read |
| `adv_change_show` | orchestrator | Change detail read |
| `adv_change_create` | orchestrator | Change creation |
| `adv_change_update` | orchestrator | Change update |
| `adv_change_close` | orchestrator | Approval-gated close |
| `adv_change_bulk_close` | orchestrator | Approval-gated bulk close; fail-all on protected/invalid targets |
| `adv_change_validate` | orchestrator | Validation read |
| `adv_change_archive` | orchestrator | Release-gate archive workflow |
| `adv_change_update_issues` | orchestrator | Issue linkage update |
| `adv_change_reenter` | orchestrator | Gate re-entry |
| `adv_change_forget` | orchestrator | In-memory session active-change pointer clear; no persistent mutation |

### Epic

| Tool | Class | Notes |
|---|---|---|
| `adv_epic_create` | orchestrator | Epic creation |
| `adv_epic_show` | orchestrator | Epic read |
| `adv_epic_list` | orchestrator | Epic read |
| `adv_epic_update` | orchestrator | Title/narrative update with optimistic concurrency |
| `adv_epic_add_shell` | orchestrator | Shell entry add |
| `adv_epic_promote_shell` | orchestrator | Shell promotion to change |
| `adv_epic_link_change` | orchestrator | Link existing change |
| `adv_epic_unlink_change` | orchestrator | Unlink change entry |
| `adv_epic_move_change` | orchestrator | Move change between Epics |
| `adv_epic_repair_membership` | orchestrator | Membership projection repair; evidence-audited, orchestrator-driven hygiene |
| `adv_epic_reorder` | orchestrator | Advisory reorder |
| `adv_epic_retire` | orchestrator | Terminal Epic retirement with evidence |

### Task

| Tool | Class | Notes |
|---|---|---|
| `adv_task_show` | orchestrator | Task read |
| `adv_task_list` | orchestrator | Task read |
| `adv_task_ready` | orchestrator | Ready-queue read |
| `adv_task_update` | orchestrator | Task mutation |
| `adv_task_add` | orchestrator | Task mutation |
| `adv_task_cancel` | orchestrator | Task cancellation |
| `adv_task_reclassify_tdd` | orchestrator | TDD reclassification with user signoff |

### Gate, contract, and follow-up

| Tool | Class | Notes |
|---|---|---|
| `adv_gate_status` | orchestrator | Gate read |
| `adv_gate_complete` | orchestrator | Gate completion with approval evidence |
| `adv_contract_mint` | orchestrator | ChangeContract minting from approved agreement |
| `adv_contract_review_matrix_set` | orchestrator | Review-matrix persistence |
| `adv_design_concern_disposition` | orchestrator | Design-concern disposition |
| `adv_followup_promote` | orchestrator | Ops follow-up promotion to child change |
| `adv_report_followup_promote` | orchestrator | Report follow-up promotion |
| `adv_subagent_report_submit` | orchestrator | Typed sub-agent report ingestion |

### Ops evidence

| Tool | Class | Notes |
|---|---|---|
| `adv_ops_evidence_add` | orchestrator | Ops follow-up evidence append |
| `adv_ops_run_upsert` | orchestrator | Ops runbook run upsert |
| `adv_ops_run_evidence_add` | orchestrator | Run-step evidence append; prod execute steps approval-gated |

### Wisdom, project, status support

| Tool | Class | Notes |
|---|---|---|
| `adv_wisdom_add` | orchestrator | Wisdom capture |
| `adv_wisdom_list` | orchestrator | Wisdom read (including project-only listings) |
| `adv_project_context` | orchestrator | project.md read |
| `adv_run_test` | orchestrator | Bounded test-run evidence |
| `adv_task_checkpoint` | orchestrator | Task checkpoint commit |
| `adv_reflection_list` | orchestrator | Reflection read |
| `adv_reflect` | orchestrator | Post-archive two-plane reflection |

### Temporal and worktree

| Tool | Class | Notes |
|---|---|---|
| `adv_temporal_diagnose` | orchestrator | Read-only Temporal recovery diagnostic |
| `adv_temporal_reconnect` | orchestrator | STSL reconnect without workflow-state mutation |
| `adv_worktree_create` | orchestrator | Tool-owned worktree creation |
| `adv_worktree_resume` | orchestrator | Worktree resume/materialize |
| `adv_worktree_delete` | orchestrator | Worktree deletion (merge-before-delete) |
| `adv_worktree_cleanup` | orchestrator | Worktree hygiene; `archived_branches` mode is operator-explicit (dry-run first) |
| `adv_worktree_triage` | orchestrator | Read-only worktree inventory |

## Drift Guard

`plugin/src/tool-ownership-assets.test.ts` asserts this document exists,
classifies every `ADV_TOOL_NAMES` entry, names the operator-only set, and
mirrors `rq-toolOwnership01` in `.adv/specs/advance-meta/spec.json`. A
registry change without a matching matrix row fails CI — silent drift between
the tool surface and this matrix is a test failure, not a docs chore.

This matrix is the documented view. The code-owned enforcement lives in
`plugin/src/tool-role-policy.ts`: an exhaustive role classification of every
retained canonical tool (including the action-level dual distinctions above)
plus the intended ADV allowlist per shipped agent manifest.
`plugin/src/tool-role-policy.test.ts` fails CI when the policy and this
document disagree, when an agent manifest's ADV grants diverge from the
intended allowed set, or when a non-orchestrator agent can reach an
operator-only tool across a destructive, privacy, approval, or cross-project
trust boundary.

Related surfaces: `docs/cli-surface-matrix.md` (CLI disposition per tool),
`ADV_INSTRUCTIONS.md` worktree-cleanup repair decision matrix,
`docs/store-consolidation.md`, `docs/snapshot-health.md`.
