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
| `adv_doctor` | operator-only | `approvedByUser` + `approvalEvidence` for unsafe escalations; safe fixes (STSL reinit, missing search attributes, owned worker restart, confirmed-phantom pointer clear) apply automatically | Single diagnose→safe-fix→verify entry for infrastructure recovery. Refuses approval-gated escalations (wrong-type search attributes, suspect lock reclaim, ambiguous ownership) with typed operator proposals |
| `adv_store_cleanup` | operator-only | `approvedByUser` + `approvalEvidence` + dry-run `plan_hash` | Deletes legacy agenda stores; manifest-before-delete, retained indefinitely as operator-only maintenance (`rq-storeCleanupCoupling01`) |
| `adv_store_reconcile` | operator-only | Matching dry-run `plan_hash`; target trust approval for cross-project apply | Repairs disk-backed migration residue; the MCP tool and `bin/adv reconcile` CLI dispatch the same bundled handler, with plan/dry_run read-only and apply re-verifying the fresh plan before mutation (`AC12`, `C5`) |
| `adv_store_consolidate` | operator-only | `approvedByUser` + `approvalEvidence` + dry-run plan | Consolidates orphaned identity stores into the true-root store; mutually serialized with cleanup |
| `adv_snapshot_health` (`#repair`) | operator-only | `approvedByUser` + `approvalEvidence` + `repair_actions` whitelist | Deletes corrupt OpenCode snapshot-store objects; `scan`/`audit_history` remain agent-readable diagnostics |
| `adv_conformance` (`#override`) | operator-only | audit fields `user` + `reason` + `re_verify_deadline` | Overrides a locked conformance verdict; audit-escape hatch only. Other actions (`status`, `init`, `lock`, `unlock`, `run`) stay orchestrator-reachable |
| `adv_change_repair_origin` | operator-only | `approvedByUser` + `approvalEvidence` + `reason` | Repairs origin provenance linkage on an open change; claim-safe audited repair |
| `adv_change_projection_quarantine` | operator-only | `approvedByUser` + `approvalEvidence` + `changeId` | Operator-only quarantine for corrupt or oversized active change projections; atomically moves the bad `change.json` outside the active read path, preserves original bytes/metadata, and appends a purpose-specific audit entry |
| `adv_change_workflow_terminate` | operator-only | `approvedByUser` + `approvalEvidence` + shipped acceptance/release gate proof + (poisoned-history describe evidence OR shipped-terminal structural proof) | Terminates the exact describe-pinned (`runId`) wedged run of a shipped change's workflow — NOT a Temporal Reset; dry-run pin assessment, idempotent completed/not-found handling only after eligibility, failure before any projection-cache refresh. Two eligibility classes (rq-shippedWorkflowTermination01): `poisoned_history` (existing — describe carries poisoned-history evidence, terminate + cache refresh only) and `shipped_terminal` (new — describe shows RUNNING/PAUSED with no poison but disk carries all 7 gates done + phase9 done + schema-valid archive bundle matching changeId; terminate + atomic status/lifecycleState=archived convergence write + read-after-write verification). Shipped-terminal refusal codes: PROOF_INVALID_DISK_PROJECTION, PROOF_MISSING_GATES, PROOF_MISSING_PHASE9, PROOF_NO_BUNDLE, PROOF_INVALID_BUNDLE, PROOF_BUNDLE_ID_MISMATCH. Convergence failure shape: `success:false, partialRecovery:true, pinnedRunTerminated:true, converged:false` with typed `successorRace` (pre-write), `lateSuccessorRace` (post-readback TOCTOU), or `readback`+`remediation`. Archived changes route to `adv_archive_purge` (rq-archivePurge01 semantics preserved) |
| `adv_launcher_projection_rebuild` | operator-only | `approvedByUser` + `approvalEvidence` | Regenerates the aggregate `active-launcher-state.json` from the on-disk per-change projection set; plugin/MCP-only, never exposed via `bin/adv` |
| `adv_worktree_detach` | operator-only | `approvalEvidence` (apply mode) + exact branch set | Directory-only nonterminal worktree detach; preserves local branch and ADV change record; never invoked by reapers, triage, startup cleanup, or migration automation (`rq-migrateExistingAdvWorktrees`) |

## Dual Tools

Read actions are agent-reachable. Mutation or refresh surfaces are
operator-owned and must not run as routine autonomous agent actions
(`rq-toolOwnership01.3`).

| Tool | Class | Read (agent) | Mutate (operator) |
|---|---|---|---|
| `adv_status` | dual | All views (`summary`, `health`, `changes`, `hygiene`) | `forceRefresh` health-probe cache refresh |
| `adv_resume_projection` | orchestrator | Dependency-aware resume projection (pure read) | — |
| `adv_project_metadata` | dual | `read`, `list` | `write` — scan-owned producers only (slop-scan, comp-scan, audit, arch-scan); not ad-hoc agent writes |
| `adv_wip_state` | dual | Cross-change work-in-progress aggregate read | No agent mutation surface; worktree/session state it reports on is operator-owned |
| `adv_session_list` | dual | Privacy-defensive peer session inventory | No agent mutation surface; session lifecycle owned by the `oc` wrapper/operator |

## Orchestrator Tools

Routine ADV command-workflow and agent tools, grouped by domain. Several
mutations remain approval-gated (noted); the orchestrator drives them through
gate/command workflows with human checkpoints, which keeps them orchestrator
class rather than operator-only.

### Spec

| Tool | Class | Notes |
|---|---|---|
| `adv_spec` | orchestrator | Spec list/show/search read |

### Backlog

| Tool | Class | Notes |
|---|---|---|
| `adv_backlog_add` | orchestrator | Backlog item capture |
| `adv_backlog_promote` | orchestrator | Promotion to change/Epic shell |
| `adv_backlog_archive` | orchestrator | Soft-delete (archive) of a backlog item |

### MCP Tier-4 reads

These four reads are not host tools. The plugin bridges them through
`plugin/src/mcp-server/tier4-tool-map.ts`; under Code Mode, use their
`tools.adv.*` names. Dispositions use the CLI surface matrix vocabulary.

| MCP read | Disposition | Notes |
|---|---|---|
| `tools.adv.backlog_list` | `keep-mcp-only` | Backlog read |
| `tools.adv.backlog_show` | `keep-mcp-only` | Backlog read |
| `tools.adv.epic_list` | `mcp+cli-additive` | Rich MCP agent-workflow read; reduced CLI enumeration is additive |
| `tools.adv.epic_show` | `keep-mcp-only` | Epic read |

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
| `adv_change_set_worker_bundle_impact` | orchestrator | Typed worker-bundle impact declaration at planning |

### Lightweight change profile

| Tool | Class | Notes |
|---|---|---|
| `adv_lightweight_profile_evaluate` | orchestrator | Host-side evidence collection + Temporal signal for gate-bound lightweight profile evaluation |

### Worker bundle release provenance

| Tool | Class | Notes |
|---|---|---|
| `adv_change_set_worker_bundle_impact` | orchestrator | Declares/confirm worker-bundle impact applicability at planning time; fires `workerBundleImpactSetSignal` |
| `adv_worker_bundle_provenance_record` | orchestrator | Records passing `build:worker` + replay-determinism provenance on the change after execution; fires `workerBundleProvenanceRecordedSignal` |

### Epic

| Tool | Class | Notes |
|---|---|---|
| `adv_epic_create` | orchestrator | Epic creation |
| `adv_epic_update` | orchestrator | Title/narrative update with optimistic concurrency |
| `adv_epic_add_shell` | orchestrator | Shell entry add |
| `adv_epic_promote_shell` | orchestrator | Shell promotion to change |
| `adv_epic_link_change` | orchestrator | Link existing change |
| `adv_epic_unlink_change` | orchestrator | Unlink change entry |
| `adv_epic_move_change` | orchestrator | Move change between Epics |
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
| `adv_verification_evidence_disposition` | orchestrator | Verification-evidence disposition clearing `VERIFICATION_EVIDENCE_MISSING` blockers on proof-bearing task policies (`fixed` / `rejected_with_evidence` / `split` / `fast_follow` with non-blank evidence; no `accepted_debt` path) |
| `adv_followup_promote` | orchestrator | Ops follow-up promotion to child change |
| `adv_subagent_report_submit` | orchestrator | Typed sub-agent report ingestion |

### Ops evidence

| Tool | Class | Notes |
|---|---|---|
| `adv_ops_evidence_add` | orchestrator | Ops follow-up evidence append |
| `adv_ops_followup_resolution_upsert` | orchestrator | Typed parent-link resolution upsert from authoritative child-state reconciliation |
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
| `adv_worktree_create` | orchestrator | Tool-owned worktree creation |
| `adv_worktree_resume` | orchestrator | Worktree resume/materialize |
| `adv_worktree_delete` | orchestrator | Worktree deletion (merge-before-delete) |
| `adv_worktree_cleanup` | orchestrator | Worktree hygiene; `archived_branches` mode is operator-explicit (dry-run first) |
| `adv_worktree_triage` | orchestrator | Read-only worktree inventory |
| `adv_tool_catalog` | orchestrator | Bounded read-only catalog of canonical ADV tools with descriptive visibility metadata |
| `adv_tool_describe` | orchestrator | Read-only single-tool schema/metadata projection; no handler invocation |
| `adv_tool_invoke` | orchestrator | Strict in-process dispatcher through the canonical wrapped `ToolDefinition.execute`; preserves ToolContext, validation, authorization, approvals, recovery restrictions, and timeouts. Recursion-exclusion (`adv_tool_invoke`, `adv_tool_catalog`, `adv_tool_describe`, `execute`) is enforced before any lookup or dispatch (`addProviderToolSearch` AC1–AC4) |
| `adv_worker_bundle_provenance_record` | orchestrator | Record worker-bundle build+replay provenance on a change after both runs pass; execution-time evidence receipt |

## Removed Tools and Replacements

`consolidateAdvToolSurface2` removed five legacy or redundant agent-callable
tools completely — no wrappers, aliases, or compatibility exports. This matrix
classifies retained tools only; removed names must never reappear in
`ADV_TOOL_NAMES`, agent manifests, or new matrix rows (tombstone guard:
`plugin/src/latent-tool-removal.test.ts`; manifest guard:
`plugin/src/tool-role-policy.test.ts`).

| Removed tool | Previous state | Replacement path |
|---|---|---|
| `adv_backlog_state` | Registered backlog-state reader | `/adv-triage` portfolio balance plus typed `adv_change_list` / `tools.adv.epic_show` reads. The retired `adv_roadmap` tool has no compatibility wrapper. |
| `adv_project_wisdom_list` | Registered project-wisdom reader | `adv_wisdom_list` with `project_only: true`; `maxEntries` bounds the project-only listing and is applied after type and product-visibility filtering. `project_only` is mutually exclusive with `changeId` and `query` |
| `adv_gate_criteria` | Latent definition, never registered | No agent-callable replacement. Gate criteria remain advisory checklists evaluated through the gate completion/status path (`adv_gate_status`, `adv_gate_complete`) |
| `adv_epic_update_scope` | Latent definition, never registered | No agent-callable replacement. Audited, versioned Epic scope mutation remains Temporal storage/workflow behavior (`epicScopeUpdated` signal path, `rq-epicMutableScope01`) |
| `adv_epic_merge` | Latent definition, never registered | No agent-callable replacement. Epic merge finalization remains Temporal storage/workflow behavior (`epicMerged` signal path, `rq-epicMerge01`) |

Historical references under `.adv/archive/**` and `CHANGELOG.md` release
history are permitted evidence, not active references.

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
`plugin/src/tool-role-firewall.ts` is the runtime backstop: `tool.execute.before`
derives its blockable set as the complement of the spawned-agent allowlist
union, permits that set only for the captured main session, and fails closed
when role or policy resolution is unavailable.
`plugin/src/tool-role-policy.test.ts` fails CI when the policy and this
document disagree, when an agent manifest's ADV grants diverge from the
intended allowed set, or when a non-orchestrator agent can reach an
operator-only tool across a destructive, privacy, approval, or cross-project
trust boundary.

Related surfaces: `docs/cli-surface-matrix.md` (CLI disposition per tool),
`ADV_INSTRUCTIONS.md` worktree-cleanup repair decision matrix,
`docs/snapshot-health.md`.

## Visibility Profile (addProviderToolSearch AC5–AC7)

The three Advance-owned facade tools (`adv_tool_catalog`,
`adv_tool_describe`, `adv_tool_invoke`) compress the visible ADV tool
surface for normal agents while every ADV operation still executes
through canonical typed handlers with direct-tool-equivalent
authorization, approval, target-path trust, recovery-only, lifecycle,
timeout, cancellation, and audit semantics.

Two config layers cooperate:

1. **Agent YAML `tools:` frontmatter** (`/.opencode/agents/*.md`,
   generated from `AGENT_TOOL_POLICY` via `pnpm run generate:manifests`):
   every agent except `adv-ci-waiter` carries
   `adv_tool_catalog: true`, `adv_tool_describe: true`,
   `adv_tool_invoke: true` inside its `# >>> ADV-GENERATED` block.
   `adv-ci-waiter` is excluded because its documented responsibility is
   bash-only CI polling. The orchestrator (`adv`) carries every retained
   ADV tool explicitly (no `adv_*: false` wildcard).

This visibility profile governs the host-plugin `adv_*` surface. Separately, under OpenCode Code Mode the 13 Tier-4 read tools are also reachable as `tools.adv.*` (e.g., `tools.adv.tool_catalog`). That namespace is distinct from host-plugin `adv_*` tools and is not governed by the `adv_*: deny` permission rule. `adv_tool_catalog` and `adv_tool_describe` exist in both surfaces.

2. **`~/.config/opencode/opencode.jsonc` `agent.<name>.permission`**:
   every normal agent that already ships an `adv_*: deny` first-rule
   (`adv-engineer`, `adv-designer`, `adv-researcher`, `adv-reviewer`,
   `adv-visual-review`) also carries the three facade tools as explicit
   `allow` entries immediately after the deny wildcard so last-match-wins
   resolves them as visible. Agents without an `adv_*: deny` rule in
   `opencode.jsonc` (`adv-tron`, `adv-verifier`,
   `plan`, `build`, `general`, `explore`) inherit ADV visibility from
   their agent YAML manifests alone; no `opencode.jsonc` edit is
   required for them. The orchestrator (`adv`) keeps no `adv_*: deny`
   rule, so direct ADV access is retained as the recovery/admin escape
   hatch (AC6).

### Post-deploy runtime verification

After `pnpm run build` + `./scripts/deploy-local.sh --fix` + OpenCode
restart, verify the live surface:

1. **Facade registered**: `adv_tool_catalog` (describe, invoke) appears in
   `adv_status` output and the SDK tool surface.
2. **Normal-agent visibility**: an `adv-engineer` (or other normal agent)
   session sees `adv_tool_invoke` in its tool list. Direct `adv_*` tools
   not in its allowlist are absent.
3. **Orchestrator escape hatch**: the `adv` orchestrator session retains
   direct `adv_*` access (no `adv_*: deny` rule).
4. **Facade dispatch**: `adv_tool_invoke(name: "adv_change_show",
   args: { changeId: "<active-change>" })` returns the same payload a
   direct `adv_change_show` call would.
5. **Recursion rejection**: `adv_tool_invoke(name: "adv_tool_invoke",
   args: {})` returns `RECURSIVE_INVOCATION` before any dispatch.
6. **Schema rejection**: `adv_tool_invoke(name: "adv_change_list",
   args: { limit: "not-a-number" })` returns `SCHEMA_VALIDATION_FAILED`
   before any dispatch.

### Rollback (AC7)

The visibility profile is reversible without code changes. To
restore direct ADV visibility for a normal agent:

1. In `~/.config/opencode/opencode.jsonc`, remove the three
   `adv_tool_catalog` / `adv_tool_describe` / `adv_tool_invoke` `allow`
   lines from that agent's `permission` block (or remove the entire
   `permission` block to revert to default-allow).
2. In `.opencode/agents/<agent>.md`, remove the three lines from the
   `# >>> ADV-GENERATED` block, or edit
   `plugin/src/tool-role-policy.ts` `AGENT_TOOL_POLICY` and re-run
   `pnpm run generate:manifests`.
3. Restart OpenCode.

The `adv_tool_invoke` plugin tool itself remains registered after
rollback (it is part of `ADV_TOOL_NAMES`); only its visibility to normal
agents changes. Direct tool semantics are unchanged because the facade
was strictly additive — it never modified any underlying handler.
