# CLI Surface Matrix

> Git-tracked disposition matrix for every ADV command and tool.
> Maintained by `plugin/src/cli-surface-matrix.test.ts` — additions or removals
> without a matching matrix row fail CI (AC1/AC2).

## Dispositions

| Keyword | Meaning |
|---|---|
| `cli-bridge-primary` | Default path is a thin CLI bridge; MCP depth kept for explicit diagnostics |
| `mcp+cli-additive` | Both CLI and MCP surfaces are useful; CLI adds CI/human value |
| `agent-workflow-only` | Agent judgment, HITL, or multi-step workflow required; no CLI simplification |
| `keep-mcp-only` | Low standalone CLI value; stays MCP-only for agent workflow integration |
| `no-cli-dangerous` | Mutation, approval, archive, or destructive; never exposed to CLI without gating |

## Command Matrix

| Command | Disposition | Rationale |
|---|---|---|
| `/adv-status` | `cli-bridge-primary` | Thin bridge over `adv status --no-color`; MCP kept for `view:"health"` |
| `/adv-validate` | `mcp+cli-additive` | Gates/archive need MCP; CLI/CI verdict additive (deferred to C5) |
| `/adv-audit` | `mcp+cli-additive` | Deterministic phase scan; additive CLI JSON output |
| `/adv-slop-scan` | `mcp+cli-additive` | Deterministic detector phase; additive CLI JSON output |
| `/adv-arch-scan` | `mcp+cli-additive` | Stack-pack phase scan; additive CLI JSON output |
| `/adv-triage` | `agent-workflow-only` | Regenerates mirrors from GitHub Project; HITL-scoped |
| `/adv-cleanup` | `agent-workflow-only` | Dry-run / approval-gated mutation; HITL-scoped |
| `/adv-coordinate` | `agent-workflow-only` | Project-change and Epic-set audit plus approval-gated typed-tool mutation; HITL-scoped |
| `/adv-reflect` | `agent-workflow-only` | Post-archive synthesis; agent workflow only |
| `/adv-tron` | `agent-workflow-only` | Codebase reconnaissance; agent interpretation required |
| `/adv-optimizer` | `agent-workflow-only` | Simplification proposal synthesis; agent interpretation required |
| `/adv-improve` | `agent-workflow-only` | Improvement discovery; agent judgment required |
| `/adv-comp-scan` | `agent-workflow-only` | Competitive intelligence; agent synthesis required |
| `/adv-proposal` | `agent-workflow-only` | Gate workflow: proposal creation |
| `/adv-idea` | `agent-workflow-only` | Pre-proposal ideation |
| `/adv-problem` | `agent-workflow-only` | Pre-proposal triage |
| `/adv-epic` | `agent-workflow-only` | Goal-first Epic creation; mutation remains typed-tool and HITL-scoped |
| `/adv-backlog` | `agent-workflow-only` | Capture/promote future work; mutation remains typed-tool and HITL-scoped |
| `/adv-clarify` | `agent-workflow-only` | Socratic requirements clarification |
| `/adv-research` | `agent-workflow-only` | Research and plan validation |
| `/adv-discover` | `agent-workflow-only` | Discovery gate workflow |
| `/adv-design` | `agent-workflow-only` | Design gate workflow |
| `/adv-prep` | `agent-workflow-only` | Planning gate workflow |
| `/adv-apply` | `agent-workflow-only` | Execution gate workflow |
| `/adv-task` | `agent-workflow-only` | Fast-track change creation |
| `/adv-review` | `agent-workflow-only` | Acceptance gate workflow |
| `/adv-harden` | `agent-workflow-only` | Production-readiness verification |
| `/adv-archive` | `agent-workflow-only` | Release gate workflow |
| `/adv-refactor` | `agent-workflow-only` | Stale proposal refresh |

## `bin/adv` Subcommand Boundary

| Subcommand | Boundary | Rationale |
|---|---|---|
| `adv status` | read-only | Live active-change table; no local service writes |
| `adv slop-scan` | read-only scanner | Deterministic scan/report only |
| `adv epic list` | read-only | Lists live Epic IDs from Temporal Visibility |
| `adv dashboard` | read-only local server | Serves configured state over loopback by default |
| `adv dashboard doctor` | read-only diagnostics | Checks service health and prints remediation |
| `adv dashboard install` | mutates local user state | Writes dashboard config/systemd unit and enables the user service; use `--dry-run` to preview |
| `adv reconcile` | operator-only plan/apply | Bundled disk-only reconciliation handler shared with `adv_store_reconcile`; plan/dry-run emit `plan_hash`, apply requires matching approval and preserves typed refusal exit codes |

## Tool Matrix

| Tool | Disposition | Rationale |
|---|---|---|
| `adv_status` | `mcp+cli-additive` | CLI table shipped; MCP kept for `view:"health"` depth |
| `adv_backlog_add` | `no-cli-dangerous` | Backlog mutation |
| `adv_backlog_list` | `keep-mcp-only` | Agent-facing backlog read |
| `adv_backlog_show` | `keep-mcp-only` | Agent-facing backlog read |
| `adv_backlog_promote` | `no-cli-dangerous` | Backlog promotion mutation |
| `adv_backlog_archive` | `no-cli-dangerous` | Backlog archive mutation |
| `adv_spec` | `mcp+cli-additive` | Agents query specs mid-workflow; CLI read additive |
| `adv_change_list` | `mcp+cli-additive` | Agents need Temporal-first reads; CLI snapshot additive |
| `adv_change_show` | `mcp+cli-additive` | Agents need Temporal-first reads; CLI snapshot additive |
| `adv_change_validate` | `mcp+cli-additive` | Gates/archive need MCP; CLI/CI verdict additive (C5 path) |
| `adv_doctor` | `no-cli-dangerous` | Infrastructure recovery; approval-gated safe-fix/verify entry, never exposed to ungated CLI |
| `adv_snapshot_health` | `mcp+cli-additive` | CLI scan additive; repair remains approval-gated MCP-only |
| `adv_store_consolidate` | `keep-mcp-only` | Ops recovery tool; scan/dry_run read-only, execute approval-gated |
| `adv_store_cleanup` | `keep-mcp-only` | Maintenance-only legacy agenda cleanup; scan/dry_run read-only, execute approval-gated |
| `adv_store_reconcile` | `mcp+cli-additive` | Operator-only MCP and `bin/adv reconcile` surfaces share the same plan/dry-run/apply handler and approval contract |
| `adv_session_list` | `mcp+cli-additive` | Human inventory; additive CLI output |
| `adv_worktree_triage` | `mcp+cli-additive` | Human inventory/report; additive CLI output |
| `adv_tool_catalog` | `keep-mcp-only` | Bounded metadata read; agent/profile-author surface |
| `adv_tool_describe` | `keep-mcp-only` | Single-tool schema/metadata read; agent/profile-author surface |
| `adv_tool_invoke` | `keep-mcp-only` | Strict in-process dispatcher through the canonical wrapped `ToolDefinition.execute`; preserves ToolContext, validation, authorization, approvals, recovery restrictions, and timeouts. Recursion-exclusion (`adv_tool_invoke`, `adv_tool_catalog`, `adv_tool_describe`, `execute`) is enforced before any lookup or dispatch (`addProviderToolSearch` AC1–AC4) |
| `adv_conformance` | `mcp+cli-additive` | CLI read/CI verdict additive; init/lock/unlock/override remain MCP-gated |
| `adv_task_show` | `keep-mcp-only` | Agent-workflow reads; low standalone CLI value |
| `adv_task_list` | `keep-mcp-only` | Agent-workflow reads; low standalone CLI value |
| `adv_task_ready` | `keep-mcp-only` | Agent-workflow reads; low standalone CLI value |
| `adv_gate_status` | `keep-mcp-only` | Agent reads constantly during workflow |
| `adv_wisdom_list` | `keep-mcp-only` | Agent knowledge surface |
| `adv_project_context` | `keep-mcp-only` | Agent context read |
| `adv_project_metadata` | `keep-mcp-only` | Agent context read |
| `adv_wip_state` | `keep-mcp-only` | Temporal/session-dependent aggregation |
| `adv_reflection_list` | `keep-mcp-only` | Agent knowledge surface |
| `adv_reflect` | `keep-mcp-only` | Workflow-bound reflection tool |
| `adv_resume_projection` | `mcp+cli-additive` | Pure-read dependency-aware next-work projection; CLI status/epic-list/dashboard consume it |
| `adv_run_test` | `keep-mcp-only` | Workflow-bound test evidence tool |
| `adv_task_checkpoint` | `keep-mcp-only` | Workflow-bound checkpoint tool |
| `adv_subagent_report_submit` | `keep-mcp-only` | Workflow-bound report ingestion |
| `adv_lightweight_profile_evaluate` | `keep-mcp-only` | Workflow-bound gate evaluation signal tool |
| `adv_change_set_worker_bundle_impact` | `keep-mcp-only` | Planning-time worker-bundle applicability declaration; workflow-bound signal |
| `adv_worker_bundle_provenance_record` | `keep-mcp-only` | Execution-time build+replay provenance receipt; workflow-bound signal |
| `adv_worktree_cleanup` | `keep-mcp-only` | Preview MCP-side; mutation approval-gated |
| `adv_change_create` | `no-cli-dangerous` | Change mutation |
| `adv_change_update` | `no-cli-dangerous` | Change mutation |
| `adv_change_close` | `no-cli-dangerous` | Change mutation |
| `adv_followup_promote` | `no-cli-dangerous` | Promotes a linked ops follow-up change; mutation |
| `adv_ops_evidence_add` | `no-cli-dangerous` | Appends ops evidence and updates follow-up status; mutation |
| `adv_ops_followup_resolution_upsert` | `no-cli-dangerous` | Persists verified child-state proof onto a parent ops follow-up link; release/archive authority mutation |
| `adv_change_bulk_close` | `no-cli-dangerous` | Change mutation |
| `adv_change_archive` | `no-cli-dangerous` | Archive mutation + spec delta |
| `adv_archive_purge` | `no-cli-dangerous` | Operator-only archived-change purge; terminates workflow, opt-in disk-bundle removal |
| `adv_change_workflow_terminate` | `no-cli-dangerous` | Operator-only pinned wedged-workflow termination; run pinned via describe, shipped-gate eligibility |
| `adv_change_update_issues` | `no-cli-dangerous` | Issue linkage mutation |
| `adv_change_repair_origin` | `no-cli-dangerous` | Origin-linkage repair mutation |
| `adv_change_projection_quarantine` | `no-cli-dangerous` | Quarantine of corrupt/oversized active change projection; operator-only approval-gated |
| `adv_change_reenter` | `no-cli-dangerous` | Change state mutation |
| `adv_task_add` | `no-cli-dangerous` | Task mutation |
| `adv_task_update` | `no-cli-dangerous` | Task mutation |
| `adv_task_cancel` | `no-cli-dangerous` | Task mutation |
| `adv_task_reclassify_tdd` | `no-cli-dangerous` | Task mutation |
| `adv_gate_complete` | `no-cli-dangerous` | Gate completion + workflow advance |
| `adv_contract_mint` | `no-cli-dangerous` | Contract authority mutation |
| `adv_contract_review_matrix_set` | `no-cli-dangerous` | Contract authority mutation |
| `adv_design_concern_disposition` | `no-cli-dangerous` | Contract authority mutation |
| `adv_verification_evidence_disposition` | `no-cli-dangerous` | Contract authority mutation |
| `adv_ops_run_upsert` | `no-cli-dangerous` | Ops runbook state mutation |
| `adv_ops_run_evidence_add` | `no-cli-dangerous` | Ops run evidence mutation |
| `adv_worktree_create` | `no-cli-dangerous` | Worktree mutation |
| `adv_worktree_detach` | `no-cli-dangerous` | Operator-only nonterminal worktree directory detach; preserves branch and change record |
| `adv_worktree_resume` | `no-cli-dangerous` | Worktree mutation |
| `adv_worktree_delete` | `no-cli-dangerous` | Worktree mutation |
| `adv_wisdom_add` | `no-cli-dangerous` | Wisdom mutation |
| `adv_epic_create` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_show` | `keep-mcp-only` | Agent-workflow read |
| `adv_epic_list` | `mcp+cli-additive` | MCP remains the rich agent-workflow read; `bin/adv epic list --json` exposes reduced live ID-only Visibility enumeration |
| `adv_epic_update` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_add_shell` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_promote_shell` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_link_change` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_unlink_change` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_move_change` | `no-cli-dangerous` | Epic membership mutation across Epics |
| `adv_epic_reorder` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_retire` | `no-cli-dangerous` | Epic retirement mutation |
| `adv_launcher_projection_rebuild` | `keep-mcp-only` | Producer-only aggregate launcher-projection rebuild (drift recovery); plugin/MCP-only, never bin/adv |
| `adv_change_set_worker_bundle_impact` | `keep-mcp-only` | Workflow-bound planning declaration of worker-bundle impact classification; agent/orchestrator use only |
| `adv_worker_bundle_provenance_record` | `keep-mcp-only` | Execution-time worker-bundle build+replay provenance receipt; agent/orchestrator use only |

## Deferred

- `adv validate` and `adv doctor` are NOT implemented in this change (AC8).
  The validate disk-vs-Temporal architecture decision is deferred to a
  follow-up `/adv-design` research task.

## Removed Tools

`adv_backlog_state`, `adv_project_wisdom_list`, `adv_gate_criteria`,
`adv_epic_update_scope`, `adv_epic_merge`, and `adv_roadmap` were removed
completely; none has a current CLI or MCP surface. Replacement paths:
`adv_change_list status: 'in-flight'` + `adv_epic_show` for backlog/roadmap
read (post portfolio-balance reshape), and `adv_wisdom_list` with
`project_only: true` for project wisdom (bounded by `maxEntries` after
filtering). The three latent tools (`adv_backlog_state`,
`adv_project_wisdom_list`, `adv_gate_criteria`) have no agent-callable
replacement. `adv_roadmap` was retired by `reshapeTriagePortfolioBalance`
in favor of `/adv-triage` portfolio-balance output; CLI subcommand
`adv roadmap`, command `/adv-roadmap`, and lib `bin/lib/roadmap.ts` were
removed in the same change. Full mapping: `docs/tool-ownership.md` →
Removed Tools and Replacements.
