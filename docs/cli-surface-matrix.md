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
| `/adv-roadmap` | `cli-bridge-primary` | Thin bridge over `adv roadmap --no-color`; MCP kept for live + annotation |
| `/adv-validate` | `mcp+cli-additive` | Gates/archive need MCP; CLI/CI verdict additive (deferred to C5) |
| `/adv-audit` | `mcp+cli-additive` | Deterministic phase scan; additive CLI JSON output |
| `/adv-slop-scan` | `mcp+cli-additive` | Deterministic detector phase; additive CLI JSON output |
| `/adv-arch-scan` | `mcp+cli-additive` | Stack-pack phase scan; additive CLI JSON output |
| `/adv-triage` | `agent-workflow-only` | Regenerates mirrors from GitHub Project; HITL-scoped |
| `/adv-cleanup` | `agent-workflow-only` | Dry-run / approval-gated mutation; HITL-scoped |
| `/adv-reflect` | `agent-workflow-only` | Post-archive synthesis; agent workflow only |
| `/adv-tron` | `agent-workflow-only` | Codebase reconnaissance; agent interpretation required |
| `/adv-improve` | `agent-workflow-only` | Improvement discovery; agent judgment required |
| `/adv-comp-scan` | `agent-workflow-only` | Competitive intelligence; agent synthesis required |
| `/adv-proposal` | `agent-workflow-only` | Gate workflow: proposal creation |
| `/adv-idea` | `agent-workflow-only` | Pre-proposal ideation |
| `/adv-problem` | `agent-workflow-only` | Pre-proposal triage |
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

## Tool Matrix

| Tool | Disposition | Rationale |
|---|---|---|
| `adv_status` | `mcp+cli-additive` | CLI table shipped; MCP kept for `view:"health"` depth |
| `adv_roadmap` | `mcp+cli-additive` | CLI file mode; MCP kept for live + Temporal annotation |
| `adv_backlog_state` | `mcp+cli-additive` | CLI file mode; MCP kept for live + Temporal annotation |
| `adv_spec` | `mcp+cli-additive` | Agents query specs mid-workflow; CLI read additive |
| `adv_change_list` | `mcp+cli-additive` | Agents need Temporal-first reads; CLI snapshot additive |
| `adv_change_show` | `mcp+cli-additive` | Agents need Temporal-first reads; CLI snapshot additive |
| `adv_change_validate` | `mcp+cli-additive` | Gates/archive need MCP; CLI/CI verdict additive (C5 path) |
| `adv_temporal_diagnose` | `mcp+cli-additive` | Add CLI `doctor`; MCP kept for in-recovery use |
| `adv_snapshot_health` | `mcp+cli-additive` | CLI scan additive; repair remains approval-gated MCP-only |
| `adv_session_list` | `mcp+cli-additive` | Human inventory; additive CLI output |
| `adv_session_show` | `mcp+cli-additive` | Human inventory; additive CLI output |
| `adv_worktree_triage` | `mcp+cli-additive` | Human inventory/report; additive CLI output |
| `adv_conformance` | `mcp+cli-additive` | CLI read/CI verdict additive; init/lock/unlock/override remain MCP-gated |
| `adv_task_show` | `keep-mcp-only` | Agent-workflow reads; low standalone CLI value |
| `adv_task_list` | `keep-mcp-only` | Agent-workflow reads; low standalone CLI value |
| `adv_task_ready` | `keep-mcp-only` | Agent-workflow reads; low standalone CLI value |
| `adv_gate_status` | `keep-mcp-only` | Agent reads constantly during workflow |
| `adv_wisdom_list` | `keep-mcp-only` | Agent knowledge surface |
| `adv_project_wisdom_list` | `keep-mcp-only` | Agent knowledge surface |
| `adv_agenda_list` | `keep-mcp-only` | Agent-facing agenda surface |
| `adv_project_context` | `keep-mcp-only` | Agent context read |
| `adv_project_metadata` | `keep-mcp-only` | Agent context read |
| `adv_wip_state` | `keep-mcp-only` | Temporal/session-dependent aggregation |
| `adv_reflect` | `keep-mcp-only` | Workflow-bound reflection tool |
| `adv_run_test` | `keep-mcp-only` | Workflow-bound test evidence tool |
| `adv_task_checkpoint` | `keep-mcp-only` | Workflow-bound checkpoint tool |
| `adv_subagent_report_submit` | `keep-mcp-only` | Workflow-bound report ingestion |
| `adv_worktree_cleanup` | `keep-mcp-only` | Preview MCP-side; mutation approval-gated |
| `adv_change_create` | `no-cli-dangerous` | Change mutation |
| `adv_change_update` | `no-cli-dangerous` | Change mutation |
| `adv_change_close` | `no-cli-dangerous` | Change mutation |
| `adv_change_forget` | `keep-mcp-only` | Session pointer clear (in-memory only) |
| `adv_followup_promote` | `no-cli-dangerous` | Promotes a linked ops follow-up change; mutation |
| `adv_ops_evidence_add` | `no-cli-dangerous` | Appends ops evidence and updates follow-up status; mutation |
| `adv_change_bulk_close` | `no-cli-dangerous` | Change mutation |
| `adv_change_archive` | `no-cli-dangerous` | Archive mutation + spec delta |
| `adv_archive_repair` | `no-cli-dangerous` | Archive release repair mutation |
| `adv_change_status_repair` | `no-cli-dangerous` | Change status repair mutation |
| `adv_change_update_issues` | `no-cli-dangerous` | Issue linkage mutation |
| `adv_change_reenter` | `no-cli-dangerous` | Change state mutation |
| `adv_task_add` | `no-cli-dangerous` | Task mutation |
| `adv_task_update` | `no-cli-dangerous` | Task mutation |
| `adv_task_cancel` | `no-cli-dangerous` | Task mutation |
| `adv_task_reclassify_tdd` | `no-cli-dangerous` | Task mutation |
| `adv_gate_complete` | `no-cli-dangerous` | Gate completion + workflow advance |
| `adv_contract_mint` | `no-cli-dangerous` | Contract authority mutation |
| `adv_contract_review_matrix_set` | `no-cli-dangerous` | Contract authority mutation |
| `adv_design_concern_disposition` | `no-cli-dangerous` | Contract authority mutation |
| `adv_worktree_create` | `no-cli-dangerous` | Worktree mutation |
| `adv_worktree_resume` | `no-cli-dangerous` | Worktree mutation |
| `adv_worktree_delete` | `no-cli-dangerous` | Worktree mutation |
| `adv_temporal_register_search_attributes` | `no-cli-dangerous` | Runtime mutation |
| `adv_temporal_reconnect` | `no-cli-dangerous` | Runtime mutation |
| `adv_temporal_worker_restart` | `no-cli-dangerous` | Runtime mutation |
| `adv_wisdom_add` | `no-cli-dangerous` | Wisdom mutation |
| `adv_agenda_add` | `no-cli-dangerous` | Agenda mutation |
| `adv_agenda_start` | `no-cli-dangerous` | Agenda mutation |
| `adv_agenda_complete` | `no-cli-dangerous` | Agenda mutation |
| `adv_agenda_cancel` | `no-cli-dangerous` | Agenda mutation |
| `adv_agenda_prioritize` | `no-cli-dangerous` | Agenda mutation |
| `adv_epic_create` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_show` | `keep-mcp-only` | Agent-workflow read |
| `adv_epic_list` | `keep-mcp-only` | Agent-workflow read |
| `adv_epic_update` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_add_shell` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_promote_shell` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_link_change` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_unlink_change` | `no-cli-dangerous` | Epic mutation |
| `adv_epic_move_change` | `no-cli-dangerous` | Epic membership mutation across Epics |
| `adv_epic_repair_membership` | `no-cli-dangerous` | Epic/child projection repair mutation |
| `adv_epic_reorder` | `no-cli-dangerous` | Epic mutation |

## Deferred

- `adv validate` and `adv doctor` are NOT implemented in this change (AC8).
  The validate disk-vs-Temporal architecture decision is deferred to a
  follow-up `/adv-design` research task.
