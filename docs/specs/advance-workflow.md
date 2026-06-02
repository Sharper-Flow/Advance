# Advance Workflow

> **Version:** 1.14.0
> **Updated:** 2026-05-25

## Purpose

Capability: Workflow contract layer for ADV — gate model, autonomy boundaries, design validation, scope management, releases, approvals, handoff voice, review remediation, and touched-scope quality. Split from `advance` capability.

## Requirements

### Behavior-Significant Problem Findings Preserve Spec-Law Intent

**ID:** `rq-problemSpecLaw01` | **Priority:** **[MUST]**

/adv-problem MUST include a spec-law impact assessment when triage clarifies expected durable product/system behavior. If the finding requires spec-law change, the triage outcome MUST route to /adv-proposal with a draft spec-delta obligation carried forward. If no spec law update is required, direct fix remains allowed only when all direct-fix guardrails pass and the triage summary records the no-delta rationale. A finding with uncertain spec-law impact MUST NOT be classified as a trivial direct-fix candidate. /adv-problem remains read-only and MUST NOT create changes, tasks, gates, or spec deltas directly.

**Tags:** `workflow`, `adv-problem`, `spec-law`, `triage`

#### Scenarios

**Behavior-significant finding routes to proposal with spec-law obligation** (`rq-problemSpecLaw01.1`)

**Given:**

- A user reports through /adv-problem that page X must have behavior Y

**When:** Triage concludes behavior Y is a durable expected behavior or contract change

**Then:**

- The triage summary includes a spec-law impact assessment
- The next step is proposal-sized, carrying a draft spec-delta obligation
- The issue is not classified as a trivial direct-fix candidate

**Non-law direct fix requires no-delta rationale** (`rq-problemSpecLaw01.2`)

**Given:**

- /adv-problem identifies a narrow defect that does not alter durable behavior or existing spec law

**When:** The command recommends a direct-fix candidate

**Then:**

- The triage summary states that no spec law update is required and why
- Direct fix remains allowed only when all direct-fix guardrails pass
- The existing direct-fix guardrails remain satisfied

**Problem triage remains read-only** (`rq-problemSpecLaw01.3`)

**Given:**

- /adv-problem identifies a behavior-significant issue

**When:** The command completes triage

**Then:**

- It does not create or mutate changes, tasks, gates, or spec files
- It hands off to /adv-proposal for artifact creation

---

### Fast-Track Tasks Preserve Spec-Law Intent and Crash-Safe Tracking

**ID:** `rq-taskSpecLaw01` | **Priority:** **[MUST]**

/adv-task MUST include a spec-law impact assessment for small well-understood durable changes before planning completes. The assessment MUST classify impact as add, modify, remove, No spec law update required, or Uncertain. Add/modify/remove outcomes MUST persist draft spec-delta obligations with concrete rq-* requirement IDs and at least one Given/When/Then scenario per obligation before implementation tasks are generated. No-update outcomes MUST persist a no-delta rationale. Uncertain outcomes MUST NOT complete planning or create implementation tasks for the uncertain scope; they route to /adv-proposal or deeper discovery. ADV agent routing SHOULD prefer /adv-task over ad hoc/direct implementation when full /adv-proposal ceremony is not warranted but durable change/task state exists before implementation for crash recovery.

**Tags:** `workflow`, `adv-task`, `spec-law`, `tracking`

#### Scenarios

**Fast-track spec delta obligations are concrete** (`rq-taskSpecLaw01.1`)

**Given:**

- A small well-understood durable change is routed through /adv-task

**When:** The spec-law impact assessment classifies the change as add, modify, or remove

**Then:**

- The change artifacts include draft spec-delta obligations before planning completes
- Each obligation has a concrete rq-* requirement ID
- Each obligation has at least one Given/When/Then scenario

**No-delta fast-track records rationale** (`rq-taskSpecLaw01.2`)

**Given:**

- A small well-understood durable change is routed through /adv-task

**When:** The spec-law impact assessment determines no spec law update is required

**Then:**

- The change artifacts state No spec law update required
- The change artifacts include the no-delta rationale
- Planning may complete only after the rationale is persisted

**Small durable changes use tracked fast path** (`rq-taskSpecLaw01.3`)

**Given:**

- A user asks for a small well-understood durable change

**When:** Full /adv-proposal ceremony is not warranted but implementation work is needed

**Then:**

- ADV agent routing prefers /adv-task over ad hoc/direct implementation
- Durable change/task state exists before implementation begins
- A crash can resume from tracked change/task state

**Uncertain fast-track scope routes deeper before planning** (`rq-taskSpecLaw01.4`)

**Given:**

- A small durable change is routed through /adv-task
- The spec-law impact assessment cannot resolve whether spec law must be added, modified, removed, or left unchanged

**When:** The assessment classifies the impact as Uncertain

**Then:**

- /adv-task does not complete planning for the uncertain scope
- /adv-task creates no implementation tasks for the uncertain scope
- The change routes to /adv-proposal or deeper discovery before implementation planning resumes

---

### Adversarial Review Enforcement

**ID:** `rq-R3v13wR1` | **Priority:** **[MUST]**

/adv-review and /adv-harden must prevent shallow 'LGTM' behavior through evidence-backed clean verdicts, checked dimensions, and red-flag invalidators instead of a fixed finding count. /adv-review owns contract, correctness, security, tests, and scope validation. /adv-harden owns release, deploy, production, docs, and cleanup readiness. Both phases retain a critical blocker backstop and mandatory remediation for blocker/issue and validated in-scope findings.

#### Scenarios

**Evidence-backed clean verdict validation** (`rq-R3v13wR1.1`)

**Given:**

- A review or harden pass produces few or no actionable findings

**When:** The final verdict is emitted

**Then:**

- The verdict includes evidence-backed clean justification for checked dimensions
- Red-flag invalidators are evaluated before accepting the clean result
- The gate does not remain open solely because a fixed finding count was not reached

**Review remediation is mandatory** (`rq-R3v13wR1.2`)

**Given:**

- Review or harden produces blocker/issue findings or validated in-scope findings

**When:** The phase enters remediation

**Then:**

- All blocker and issue findings are fixed and verified unless rejected with evidence as invalid or out of scope
- Each suggestion/question is investigated and marked validated or rejected with evidence
- Validated suggestions are implemented
- Validated in-scope findings are not deferred as report-only, future-work, or accepted debt
- A cleanup pass runs before final verdict is emitted when cleanup is in phase scope

---

### Mid-Change Scope Expansion Re-Entry

**ID:** `rq-scopeReentry01` | **Priority:** **[MUST]**

When new objectives or acceptance criteria are introduced after a change has already progressed through the gate workflow, the added scope must be routed back through the earliest invalidated pre-implementation gate via adv_change_reenter before execution continues. Agents may trigger this re-entry autonomously; explicit user approval is not required to circle back to an earlier gate. Unaffected approved scope may continue without re-entry, and non-invalidating clarifications do not require re-entry.

**Tags:** `workflow`, `re-entry`, `scope-expansion`, `gates`

#### Scenarios

**Scope expansion triggers re-entry** (`rq-scopeReentry01.1`)

**Given:**

- A change is in execution or a later gate
- New objectives or acceptance criteria are discovered that were not part of the approved agreement

**When:** adv_change_reenter is used from the earliest affected gate

**Then:**

- The newly added scope is routed back through discovery, agreement, design, and planning as needed before execution resumes
- Execution does not silently absorb the new scope without re-entry

**Unaffected approved scope continues without re-entry** (`rq-scopeReentry01.2`)

**Given:**

- A change has approved scope already in execution
- A newly discovered item does not invalidate the existing approved work

**When:** The unaffected scope is evaluated

**Then:**

- Previously approved scope may continue without reopening unrelated gates
- Only the newly invalidated scope is routed back through re-entry

**Non-invalidating clarification does not require re-entry** (`rq-scopeReentry01.3`)

**Given:**

- A change is in progress
- A clarification is discovered that does not alter objectives, acceptance criteria, or design intent

**When:** The clarification is applied

**Then:**

- adv_change_reenter is not required
- Execution may continue within the existing scope

**Re-entry may proceed without explicit user approval** (`rq-scopeReentry01.4`)

**Given:**

- A change needs scope-expansion re-entry

**When:** adv_change_reenter is executed

**Then:**

- The call may succeed without approvedByUser or approvalEvidence
- approvalEvidence is optional audit context when re-entry follows an explicit user instruction

---

### Re-Entry Cascade Reset Preserves Work

**ID:** `rq-scopeReentry02` | **Priority:** **[MUST]**

Reopening a change from gate X must reset gate X and all downstream gates to pending while preserving existing tasks and completed work. Each re-entry must append an audit entry describing the reopened gate, reason, optional scope delta, actor, timestamp, and gates reset.

**Tags:** `workflow`, `re-entry`, `audit`, `gates`

#### Scenarios

**Cascade from discovery resets downstream gates** (`rq-scopeReentry02.1`)

**Given:**

- A change has completed proposal, discovery, design, planning, execution, acceptance, and release is still pending

**When:** adv_change_reenter reopens from discovery

**Then:**

- discovery, design, planning, execution, acceptance, and release are reset to pending
- proposal remains satisfied

**Tasks remain intact after cascade reset** (`rq-scopeReentry02.2`)

**Given:**

- A change has existing tasks, including completed tasks

**When:** adv_change_reenter resets gates to pending

**Then:**

- All existing tasks remain on the change
- Task status and task content are preserved

**Re-entry appends audit history** (`rq-scopeReentry02.3`)

**Given:**

- A change has been reopened via adv_change_reenter

**When:** The re-entry is persisted

**Then:**

- A reentry_history entry is appended with from_gate, reason, reopened_by, approval_evidence, reopened_at, and gates_reset
- scope_delta is included when provided

---

### Seven-Gate Collaborative Workflow

**ID:** `rq-gatemodel01` | **Priority:** **[MUST]**

The canonical ADV workflow is seven sequential gates: proposal, discovery, design, planning, execution, acceptance, release. Gates must be completed in order. A change cannot be archived until all seven gates are satisfied (status 'done' or 'skipped').

**Tags:** `workflow`, `gates`

#### Scenarios

**Sequential gate enforcement** (`rq-gatemodel01.1`)

**Given:**

- A change with the proposal gate pending

**When:** adv_gate_complete is called for the discovery gate

**Then:**

- The call is rejected
- The response identifies proposal as the blocking gate

**Archive requires all seven gates satisfied** (`rq-gatemodel01.2`)

**Given:**

- A change with gates proposal through acceptance marked done
- The release gate still pending

**When:** adv_change_archive is called

**Then:**

- The archive is rejected with incomplete-gates error
- release is listed as the remaining gate

**Archive blocked when conformance-required spec has non-PASS verdict** (`rq-gatemodel01.3`)

**Given:**

- A change touches a spec with conformance_required: true
- All seven gates including release are otherwise satisfied
- Conformance verdict is DRIFT and no override is recorded

**When:** /adv-archive Phase 5.5 evaluates the conformance gate

**Then:**

- Archive is halted before Phase 6 (Execute Archive)
- adv_change_archive is not called
- The user is presented with the failing AC labels and three explicit options (fix locally, override, unlock + amend) per rq-confTriage01

---

### External Conformance Gate Cross-Link

**ID:** `rq-extConfGate01` | **Priority:** **[MUST]**

Archive of a change that touches a spec with `conformance_required: true` is blocked unless the external conformance verdict is PASS or a valid override is recorded. The external conformance capability is defined by `spec-conformance` (rq-confSource01 through rq-confTriage01). The conformance gate runs as `/adv-archive` Phase 5.5, between User Signoff (Phase 5) and Execute Archive (Phase 6), so active source removal (rq-archiveRetirement01) only triggers on a passing or override-approved release.

**Tags:** `workflow`, `archive`, `conformance`, `cross-link`

#### Scenarios

**Archive halts on DRIFT without override** (`rq-extConfGate01.1`)

**Given:**

- A change touches a spec with conformance_required: true
- Phase 5.5 conformance run returns verdict: DRIFT
- No valid override has been recorded for this archive attempt

**When:** The orchestrator evaluates whether to advance to Phase 6

**Then:**

- Archive halts at Phase 5.5
- adv_change_archive is not invoked
- The drift triage flow defined by rq-confTriage01 is surfaced to the user

**Archive proceeds on PASS** (`rq-extConfGate01.2`)

**Given:**

- A change touches a spec with conformance_required: true
- Phase 5.5 conformance run returns verdict: PASS

**When:** The orchestrator evaluates whether to advance to Phase 6

**Then:**

- Phase 6 (Execute Archive) runs
- rq-archiveRetirement01 source removal proceeds normally

**Archive proceeds on valid override** (`rq-extConfGate01.3`)

**Given:**

- A change touches a spec with conformance_required: true
- Phase 5.5 conformance run returns DRIFT or is unavailable
- A valid override entry has been recorded for this archive attempt with required audit fields per rq-confOverride01

**When:** The orchestrator evaluates whether to advance to Phase 6

**Then:**

- Phase 6 (Execute Archive) runs
- The override entry is preserved in the spec's append-only audit log

---

### Archive Finalization Refreshes Basis and Preserves Cleanup Safety

**ID:** `rq-releaseFinalization01` | **Priority:** **[MUST]**

Phase 9 Git Finalization must refresh the current default-branch basis before deciding local merge-back versus PR workflow. Clean low-risk cases prefer a linear-history fast path (`--ff-only` when already current, reconcile only when needed). After a successful local merge, Phase 9 must attempt safe `git push origin {default-branch}` when `origin` exists. If no remote exists or the push fails or is skipped, the archive may complete as a local-only result and must report `Merged locally.` with the explicit reason. Conflicting or risky cases must stop or route to PR workflow before cleanup. Worktree deletion remains forbidden until merged-state verification proves the change branch is fully integrated.

**Tags:** `workflow`, `archive`, `worktree`, `git`

#### Scenarios

**Clean archive refresh uses local fast path** (`rq-releaseFinalization01.1`)

**Given:**

- A change branch is already on the current default-branch basis
- No overlap-risk or PR-only policy applies

**When:** Phase 9 Git Finalization chooses an integration path

**Then:**

- The archive uses the local `--ff-only` path
- No branch rewrite is required

**Conflicting reconcile stops before cleanup** (`rq-releaseFinalization01.2`)

**Given:**

- A change branch must reconcile with a fresher default branch
- Compatibility preflight or rebase finds conflicts

**When:** Phase 9 Git Finalization evaluates the reconcile path

**Then:**

- The archive reports the conflicting files
- The archive does not delete the worktree

**Risky archive routes to PR workflow** (`rq-releaseFinalization01.3`)

**Given:**

- A change has overlap-risk, PR-only policy, or non-fast-forward publish risk

**When:** Phase 9 Git Finalization chooses an integration path

**Then:**

- The archive routes to PR workflow instead of forcing local merge-back
- Cleanup remains blocked until merged-state verification succeeds

**Successful local archive attempts origin push** (`rq-releaseFinalization01.4`)

**Given:**

- A change branch has been merged into the local default branch
- An origin remote is configured

**When:** Phase 9 Git Finalization publishes the archive result

**Then:**

- The archive attempts safe `git push origin {default-branch}`
- If the push succeeds, the archive reports `Shipped.`
- If the push fails or is skipped, the archive reports `Merged locally.` with an explicit reason

**Release gate structurally enforces trunk merge** (`rq-releaseFinalization01.5`)

**Given:**

- A change has completed all gates before release
- The change branch is not reachable from the default branch

**When:** Any caller invokes `adv_gate_complete` with `gateId: "release"`

**Then:**

- The gate rejects completion with code `RELEASE_REQUIRES_TRUNK_MERGE`
- The response cites `rq-releaseFinalization01`
- The response points to `/adv-archive {change-id}` to complete Phase 9

**PR archive mode opts out of local default-branch merge** (`rq-releaseFinalization01.6`)

**Given:**

- Project configuration declares `archive_mode: "pr"`
- The GitHub CLI is available for PR workflow handoff

**When:** Archive finalization runs for the change

**Then:**

- Local default-branch merge is skipped
- The change branch must be pushed or otherwise made available for PR workflow
- The archive reports the PR-mode handoff instead of claiming a local default-branch merge

**Dirty default-branch main checkpoints before merge** (`rq-releaseFinalization01.7`)

**Given:**

- Main checkout is on the resolved default branch
- Main checkout has non-ignored uncommitted changes (tracked or untracked)
- Main checkout is not in an active merge, rebase, cherry-pick, or revert state
- Git committer identity is resolvable via `git var GIT_COMMITTER_IDENT`

**When:** Phase 9 Git Finalization detects a dirty main checkout

**Then:**

- ADV commits all non-ignored tracked and untracked changes with an auditable checkpoint commit message referencing the change ID
- The checkpoint commit SHA is recorded on `GitFinalizeOutcome.mainCheckpointCommitSha`
- The checkpoint SHA is surfaced in the archive terminal report
- Finalization continues to remote freshness, merge, and push without user interruption
- The checkpoint does not create new change-owned work on main; archive bundle/spec artifacts remain authored in the change worktree

**Unsafe main states block before checkpoint** (`rq-releaseFinalization01.8`)

**Given:**

- Phase 9 is evaluating the main checkout for merge readiness

**When:** Any of the following unsafe states is detected

**Then:**

- Wrong main branch: archive blocks with diagnostics showing actual vs expected branch; does not switch branches
- Missing git identity: archive blocks with `MISSING_GIT_IDENTITY` and instructs user to configure `user.name` and `user.email`
- Active merge/rebase/cherry-pick/revert: archive blocks with `MAIN_IN_PROGRESS_STATE` and lists the detected in-progress operation
- Checkpoint commit failure: archive blocks with `MAIN_CHECKPOINT_FAILED` and the underlying git error
- Merge conflict during merge-back: archive blocks with existing conflict reporting and does not delete the worktree
- Required push failure: archive reports local-only result with explicit reason
- Unverifiable release evidence: archive blocks per `rq-releaseProjectionDurability01`

---

### Archive Success Requires Durable Release Projection

**ID:** `rq-releaseProjectionDurability01` | **Priority:** **[MUST]**

When `/adv-archive` Phase 9 finalization succeeds, archive success MUST be gated by durable release-gate projection proof. Before `adv_change_archive phase9:"run"` reports success or performs archive retirement side effects, the store-backed gate read used by `adv_gate_status` MUST report `gates.release.status === "done"` with Phase 9 evidence in the release completion record. If this proof cannot be established, archive MUST return a blocked/recoverable result and MUST NOT claim shipped success, close linked issues, or run terminal cleanup as a successful retirement. Existing-bundle or completed-workflow retries MAY reconcile release metadata only after structural Phase 9 evidence is re-verified from the main checkout or PR branch state.

**Tags:** `workflow`, `archive`, `release`, `projection`, `durability`

#### Scenarios

**Archive success proves gate-status-equivalent release done** (`rq-releaseProjectionDurability01.1`)

**Given:**

- Phase 9 finalization returns shipped or pr_pushed evidence
- The release gate completion signal or recovery path has run

**When:** `adv_change_archive phase9:"run"` is about to return success

**Then:**

- The store-backed gate read used by `adv_gate_status` reports `gates.release.status === "done"`
- The release completion record includes Phase 9 evidence
- Archive does not report success while the gate-status-equivalent read would show release pending

**Unproven release projection blocks retirement side effects** (`rq-releaseProjectionDurability01.2`)

**Given:**

- Phase 9 finalization has succeeded
- The store-backed release gate proof is missing, stale, pending, unreadable, or lacks matching Phase 9 evidence

**When:** `adv_change_archive` evaluates archive success

**Then:**

- The archive returns a blocked or recoverable result citing `rq-releaseProjectionDurability01`
- The change is not retired as successfully archived
- Linked issue closure and terminal worktree cleanup are not reported as successful retirement effects

**Terminal retry repairs projection only with structural finalization evidence** (`rq-releaseProjectionDurability01.3`)

**Given:**

- An archive bundle already exists or the change workflow has completed
- Release gate metadata is stale or missing from the store-backed read

**When:** Archive retry attempts release projection repair

**Then:**

- Direct archive mode re-verifies the change branch is reachable from and pushed with the default branch before repair
- PR archive mode re-verifies the change branch was pushed for PR handoff before repair
- If finalization evidence is missing or invalid, repair is rejected and release remains not done

---

### Product-Linked ADV State

**ID:** `rq-productLinking01` | **Priority:** **[MUST]**

ADV MAY link separate repositories into one product state plane. Linked products MUST keep two identity planes: `repo_project_id` for repo-local git/spec/worktree mechanics, and `product_project_id` for canonical product state (changes, agenda, wisdom, reflections, status aggregation). Product topology MUST live in `project.json` via `product` metadata plus `related_repos`; single-repo projects without product config stay unchanged. Missing primary resolution MUST fail structurally unless `missing_primary_policy` explicitly allows `read_only` or `isolated` degradation.

**Tags:** `workflow`, `product`, `multi-repo`, `state`

#### Scenarios

**Secondary resolves canonical product state** (`rq-productLinking01.1`)

**Given:**

- A secondary repo has `product.role = secondary`
- `related_repos` identifies the primary repo with `repo_project_id` or resolvable path

**When:** ADV initializes product context

**Then:**

- `product_project_id` resolves to the primary repo ADV project id
- `repo_project_id` remains the secondary repo ADV project id
- Product changes, wisdom, reflections, agenda, and status queries use the product state plane

**Single repo remains unchanged** (`rq-productLinking01.2`)

**Given:**

- A project has no product config

**When:** ADV initializes project context

**Then:**

- `product_project_id` equals `repo_project_id`
- No product filtering, origin tags, or multi-repo archive metadata is required

**Missing primary handled structurally** (`rq-productLinking01.3`)

**Given:**

- A secondary repo cannot resolve the primary repo project id

**When:** `missing_primary_policy` is `block`, `read_only`, or `isolated`

**Then:**

- `block` rejects initialization
- `read_only` reports degraded product state
- `isolated` reports degraded repo-local state

---

### Product Change Repo Scope

**ID:** `rq-productScopedChanges01` | **Priority:** **[MUST]**

Product-linked changes MUST declare repository scope structurally with `scope_repos`. Entries MUST reference product repo ids from `ProductContext.repos` and MAY include `path`, `repo_project_id`, `required`, `role`, and `merge_order`. When product linking is enabled and no explicit `scope_repos` is provided, change creation MUST default to the current repo. `adv_change_list` and `adv_status` MUST default to current-repo scope while exposing explicit product-wide mode.

**Tags:** `workflow`, `product`, `scope`, `status`

#### Scenarios

**Create defaults to current repo scope** (`rq-productScopedChanges01.1`)

**Given:**

- ADV is running from a linked secondary repo

**When:** `adv_change_create` is called without `scope_repos`

**Then:**

- The change has one `scope_repos` entry for the current repo

**List/status default to current repo** (`rq-productScopedChanges01.2`)

**Given:**

- Product state contains backend-scoped and web-scoped changes

**When:** `adv_change_list` or `adv_status` runs without `scope: product`

**Then:**

- Current repo scoped changes are shown
- Other repo scoped changes are hidden
- Legacy unscoped changes remain visible

**Product-wide mode shows all product changes** (`rq-productScopedChanges01.3`)

**Given:**

- Product state contains changes scoped to multiple repos

**When:** `scope: product` is requested

**Then:**

- All product-scoped changes are visible with product context metadata

---

### Product Wisdom and Reflection Origins

**ID:** `rq-productLearning01` | **Priority:** **[MUST]**

Wisdom and reflection entries created in linked-product state MUST persist origin tags: `product_id`, `origin_repo_id`, `origin_repo_project_id`, and `origin_repo_path`. Default linked-repo wisdom queries MUST return current-repo-relevant change wisdom plus promoted/global project wisdom and legacy untagged entries. Explicit product-wide query mode MUST return all matching product wisdom. Reflection storage MUST preserve origin tags and support repo/product filtering for future query surfaces.

**Tags:** `workflow`, `product`, `wisdom`, `reflection`

#### Scenarios

**New wisdom has origin tags** (`rq-productLearning01.1`)

**Given:**

- ADV runs from a linked product repo

**When:** `adv_wisdom_add` records or promotes an entry

**Then:**

- The entry includes `product_id`, `origin_repo_id`, `origin_repo_project_id`, and `origin_repo_path`

**Repo query includes safe legacy and promoted entries** (`rq-productLearning01.2`)

**Given:**

- Product wisdom contains current repo entries, other repo entries, promoted entries, and legacy untagged entries

**When:** `adv_wisdom_list` runs with default scope

**Then:**

- Current repo entries are returned
- Promoted/global entries are returned
- Legacy untagged entries are returned
- Other repo change-level entries are hidden

**Product query includes all product wisdom** (`rq-productLearning01.3`)

**Given:**

- Product wisdom contains entries from multiple repos

**When:** `adv_wisdom_list` runs with `scope: product`

**Then:**

- All matching product wisdom entries are returned

---

### Multi-Repo Archive Evidence

**ID:** `rq-multiRepoArchive01` | **Priority:** **[MUST]**

When a change has `scope_repos`, archive MUST collect multi-repo evidence before bundle write or merge. It MUST sort repos by `merge_order`, capture branch, default branch, before/after HEAD refs, `repo_project_id`, required flag, and verification evidence into `multi-repo-archive.json`. All required repos MUST pass ff-only ancestry preflight before any archive write or merge side effect. If any required repo fails preflight, archive MUST fail safely and write no archive bundle.

**Tags:** `workflow`, `archive`, `product`, `multi-repo`, `git`

#### Scenarios

**Archive writes multi-repo metadata** (`rq-multiRepoArchive01.1`)

**Given:**

- A change has backend and web `scope_repos` with `merge_order`

**When:** `adv_change_archive` creates the archive bundle

**Then:**

- `multi-repo-archive.json` exists in the bundle
- Repos are ordered by `merge_order`
- Each repo has branch, `default_branch`, `head_before`, `head_after`, and `ff_only_preflight` fields
- Done-task verification evidence is included

**Preflight failure has no archive side effects** (`rq-multiRepoArchive01.2`)

**Given:**

- A required scoped repo cannot fast-forward merge to the default branch

**When:** `adv_change_archive` runs preflight

**Then:**

- The tool returns `success: false`
- The error names the repo and ff-only preflight failure
- No archive bundle is written

---

### Archive Retirement Removes Active Source State After Durable Archive

**ID:** `rq-archiveRetirement01` | **Priority:** **[MUST]**

When adv_change_archive completes successfully, ADV MUST create the archive bundle first, transition the change workflow/status to archived, and only then remove the active changes/<id>/ source directory. Post-archive persistence MUST NOT recreate active change.json for archived changes. Archive orphan sweep recovery MUST repair any matching non-archived workflow/source state to archived before approved source-dir removal and MUST report repair errors separately from removal errors.

**Tags:** `workflow`, `archive`, `recovery`, `cleanup`

#### Scenarios

**Archive retires active source after durable status transition** (`rq-archiveRetirement01.1`)

**Given:**

- A change has satisfied all archive gates

**When:** adv_change_archive completes successfully

**Then:**

- The archive bundle exists
- The change status is archived in durable state
- The source changes/<id>/ directory is removed
- Default active change lists do not include the archived change

**Post-archive persistence cannot resurrect active change state** (`rq-archiveRetirement01.2`)

**Given:**

- A change has been transitioned to archived

**When:** Archive completion persists final state or refreshes caches

**Then:**

- No active changes/<id>/change.json is written for the archived change
- Archived change lookups resolve from durable archived state or the archive bundle

**Sweep repairs archive zombies before source cleanup** (`rq-archiveRetirement01.3`)

**Given:**

- An archive bundle exists for a change
- A matching source changes/<id>/ directory still exists
- The workflow or source state is not marked archived

**When:** A bulk-close or archive operation runs and leaves orphaned source dirs

**Then:**

- The change status is repaired to archived before source removal
- Repair counts and repair errors are reported separately from removal counts and removal errors
- A candidate with repair failure is not removed

---

### Human Checkpoint Contract

**ID:** `rq-autonomy01` | **Priority:** **[MUST]**

ADV must pause for human input only at explicit approval/judgment checkpoints and auto-continue through clean agent-owned workflow steps. Human checkpoints are: proposal confirmation, agreement sign-off, design approval when real tradeoffs depend on user values, when the design validator returns CONFLICT, or when contract-compromise risk is present, acceptance, archive sign-off, cancellation approval, and doom-loop recovery. All other clean workflow steps (discovery, deterministic design, prep, apply, harden, and scope-driven re-entry) proceed sequentially without prompting the user when no unresolved user-value tradeoff, contract-compromise risk, or required approval exists.

**Tags:** `workflow`, `autonomy`, `checkpoints`

#### Scenarios

**Clean agent-owned step auto-continues** (`rq-autonomy01.1`)

**Given:**

- A change has completed the proposal gate
- The next step is discovery with no unresolved user-value tradeoffs

**When:** The ADV orchestrator evaluates the next gate

**Then:**

- Discovery proceeds without prompting the user
- No question tool call is made for the gate transition

**Human checkpoint pauses for approval** (`rq-autonomy01.2`)

**Given:**

- A change has completed the acceptance gate via /adv-review
- Archive sign-off is the next step

**When:** The ADV orchestrator evaluates the next gate

**Then:**

- The orchestrator stops and presents a change report
- The user is asked for explicit sign-off via inline handoff text per docs/command-voice-standard.md § Inline Approval Voice (Tier B)

**Design approval conditional on tradeoffs** (`rq-autonomy01.3`)

**Given:**

- A change has a straightforward design with no user-value tradeoffs

**When:** The design gate completes

**Then:**

- The orchestrator proceeds to planning without a design-approval pause

**Apply auto-continues across task boundaries** (`rq-autonomy01.4`)

**Given:**

- A change is in the execution gate with multiple pending ready tasks
- No enumerated human checkpoint has triggered (no doom-loop, no environmental blocker, no cancellation, no re-entry)

**When:** A task completes successfully and `adv_task_ready` returns another pending task

**Then:**

- `/adv-apply` proceeds immediately to the next task's TDD loop
- No "task complete", "section complete", "progress update", or "shall I continue?" pause is emitted
- No question tool call is made between tasks

**Apply forbids execution-start approval pause** (`rq-autonomy01.5`)

**Given:**

- A change has completed planning and is entering the execution gate
- User-value tradeoffs have been resolved at the design approval checkpoint per rq-autonomy01.3

**When:** `/adv-apply` begins the TDD work loop

**Then:**

- No "Begin work / Modify criteria / Cancel" prompt or equivalent execution-start approval is emitted
- The first ready task's TDD phase starts directly

**Contract-compromise risk triggers design pause** (`rq-autonomy01.6`)

**Given:**

- A change is at the design gate
- The agent identifies that delivering the design would require compromising agreed acceptance criteria, explicit constraints, or stated avoidances

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**

- The orchestrator pauses for human input before proceeding
- The design approval checkpoint is triggered regardless of whether user-value tradeoffs exist

---

### Structural Change-Contract Traceability

**ID:** `rq-contractTrace01` | **Priority:** **[MUST]**

ADV changes with an approved agreement may carry a typed `change.contract` spine. Once minted, `contract.items` are the source of truth for success criteria, acceptance criteria, constraints, avoidances, and out-of-scope boundaries. Command workflows MUST project the typed contract into human-facing agreement/review/archive surfaces while preserving structured task refs and proof state.

**Tags:** `workflow`, `contract`, `traceability`, `acceptance`

#### Scenarios

**Discovery mints typed contract from approved agreement** (`rq-contractTrace01.1`)

**Given:**

- The user has approved acceptance criteria during /adv-discover
- The change will use structural contract traceability

**When:** The discovery gate is completed

**Then:**

- The workflow persists a typed ChangeContract before completing discovery
- Contract item IDs distinguish SC, AC, C, DONT, and OOS obligations
- Legacy acceptanceCriteria is a projection of AC contract items

**Prep connects tasks to contract items** (`rq-contractTrace01.2`)

**Given:**

- A change has change.contract set

**When:** /adv-prep synthesizes or updates the task graph

**Then:**

- Tasks that implement obligations carry contract_refs.implements
- Tasks that prove obligations carry contract_refs.verifies
- Tasks that preserve constraints, avoidances, or out-of-scope boundaries carry contract_refs.respects or a not_applicable_reason

**Review persists bounded proof matrix** (`rq-contractTrace01.3`)

**Given:**

- A change with change.contract reaches /adv-review

**When:** Acceptance evidence is prepared

**Then:**

- /adv-review persists contract.reviewMatrix before acceptance sign-off
- Each required contract item has a bounded evidence row
- Failing, violated, unknown, or missing required proof blocks acceptance until fixed or formally amended

**Re-entry invalidates stale contract proof** (`rq-contractTrace01.4`)

**Given:**

- A change has contract.reviewMatrix evidence

**When:** The change re-enters a gate before release or receives a substantive contract amendment

**Then:**

- The stale review matrix is cleared or invalidated
- Fresh proof is required before acceptance/archive can proceed

---

### Validated In-Scope Findings Resolved In-Change

**ID:** `rq-remediation01` | **Priority:** **[MUST]**

When /adv-review or /adv-harden validates an actionable finding or suggestion as in-scope, the current change must fix it before completion. No report-only, future-work, or accepted-debt path is permitted for validated in-scope findings. Findings may only be left unresolved if rejected with evidence showing they are invalid or out of scope.

**Tags:** `workflow`, `review`, `harden`, `quality`

#### Scenarios

**Validated suggestion implemented before completion** (`rq-remediation01.1`)

**Given:**

- /adv-review validates a suggestion as in-scope and correct

**When:** Remediation runs

**Then:**

- The validated suggestion is implemented and verified in the current change
- The finding status is updated to fixed

**Report-only path rejected for in-scope findings** (`rq-remediation01.2`)

**Given:**

- /adv-harden identifies an actionable in-scope finding

**When:** Remediation options are presented

**Then:**

- No report-only or future-work option is offered
- The finding must be fixed before the release gate can complete

**Rejection with evidence is permitted** (`rq-remediation01.3`)

**Given:**

- /adv-review flags a suggestion as potentially in-scope

**When:** Investigation determines the suggestion is invalid or out of scope

**Then:**

- The finding is rejected with documented evidence
- The rejection does not block gate completion

---

### Touched-Scope Quality Ownership

**ID:** `rq-touchedScope01` | **Priority:** **[MUST]**

A change owns quality and test coverage for: (1) directly touched implementation files, (2) adjacent tests and docs needed for correctness, and (3) same-pattern quality or test issues in the local touched subsystem. This ownership boundary must remain local enough to avoid implicit repo-wide refactors. /adv-prep must synthesize tasks covering touched-scope obligations, /adv-apply must verify them before execution completes, and /adv-review and /adv-harden must enforce them.

**Tags:** `workflow`, `quality`, `ownership`, `testing`

#### Scenarios

**Adjacent test gaps addressed** (`rq-touchedScope01.1`)

**Given:**

- A change modifies an implementation file
- The corresponding test file has gaps in coverage for the touched code

**When:** Execution completes

**Then:**

- The test gaps are addressed as part of the change
- The execution gate is not marked complete while known test gaps remain in touched files

**Same-pattern issues fixed in local subsystem** (`rq-touchedScope01.2`)

**Given:**

- A change fixes a defect pattern in one file
- The same pattern exists in other files within the local touched subsystem

**When:** Review or harden identifies the related instances

**Then:**

- The same-pattern instances are fixed in the current change
- The fixes are verified before gate completion

**Ownership boundary remains local** (`rq-touchedScope01.3`)

**Given:**

- A change touches files in one subsystem
- A similar pattern exists in unrelated subsystems

**When:** Ownership scope is evaluated

**Then:**

- Only the local touched subsystem is in scope
- Unrelated subsystems are not implicitly pulled into the change

---

### Design Stage Requires Independent Validation

**ID:** `rq-designval01` | **Priority:** **[MUST]**

Before the design gate can complete, /adv-design must run an independent validation pass via an independent, read-only, externally informed validator sub-agent. The validator must be a distinct agent from the designer (different model or isolated context), have read-only access to ADV state, and possess external research capabilities (documentation lookup, web search). The validator assesses correctness, simplicity, spec-law compliance, and key alternatives. The current implementation of this capability is adv-researcher. Validator failure or timeout results in an INCONCLUSIVE warning and does not block gate completion.

**Tags:** `workflow`, `design`, `validation`, `autonomy`

#### Scenarios

**Validator runs before design gate completion** (`rq-designval01.1`)

**Given:**

- A change has a confirmed agreement and completed design work

**When:** /adv-design is executed

**Then:**

- An independent validation sub-agent pass runs before adv_gate_complete is called for the design gate
- The validator is a distinct agent from the designer with read-only state access and external research capabilities
- The validator assesses at least: correctness, simplicity, spec-law compliance, and key alternatives

**Validator failure results in INCONCLUSIVE, not a block** (`rq-designval01.2`)

**Given:**

- The validator sub-agent fails, returns empty, or times out

**When:** /adv-design handles the failed validator response

**Then:**

- The result is recorded as INCONCLUSIVE with a warning
- The design gate is not blocked by the validator failure
- The warning is surfaced in the /adv-design presentation output

---

### Validation Findings Included in Design Presentation

**ID:** `rq-designval02` | **Priority:** **[MUST]**

When /adv-design summarizes the design, it must include the validator verdict and findings from the design validation step. VALIDATED shows a brief clean-pass note. CAUTION shows findings inline. CONFLICT shows conflict details. INCONCLUSIVE shows a warning. Legacy designs without validation data omit the section silently.

**Tags:** `workflow`, `design`, `presentation`

#### Scenarios

**Clean-pass note shown for VALIDATED verdict** (`rq-designval02.1`)

**Given:**

- The design validator returned VALIDATED

**When:** /adv-design presents the design summary

**Then:**

- The output includes a one-line clean-pass note (e.g. 'Validator: clean pass')
- No detailed findings are shown

**Conflict details shown for CONFLICT verdict** (`rq-designval02.2`)

**Given:**

- The design validator returned CONFLICT with findings

**When:** /adv-design presents the design summary

**Then:**

- The conflict details and unresolved findings are shown to the user
- The presentation pauses for user resolution before proceeding to planning

---

### Critical Validator Disagreement Requires Explicit Handling

**ID:** `rq-designval03` | **Priority:** **[MUST]**

When the design validator returns a CONFLICT verdict, the orchestrator must not silently auto-continue to planning. The conflict must be surfaced to the user or resolved inline before /adv-prep can proceed.

**Tags:** `workflow`, `design`, `autonomy`, `checkpoints`

#### Scenarios

**CONFLICT verdict blocks silent auto-continue to planning** (`rq-designval03.1`)

**Given:**

- The design validator returned a CONFLICT verdict with unresolved findings

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**

- The orchestrator does not silently proceed to /adv-prep
- The conflict is surfaced to the user via /adv-design presentation pause or inline resolution attempt

**VALIDATED and CAUTION verdicts auto-continue** (`rq-designval03.2`)

**Given:**

- The design validator returned VALIDATED or CAUTION

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**

- Planning proceeds without a new user-facing checkpoint (assuming no other user-value tradeoffs)

---

### Contract-Compromise Risk Requires Design Pause

**ID:** `rq-designval04` | **Priority:** **[MUST]**

When an agent identifies that a proposed design can only be delivered by compromising agreed acceptance criteria, explicit constraints, or stated avoidances, the orchestrator must pause for human input before proceeding to planning. This check is independent of the design validator verdict and must trigger even when the validator returns VALIDATED or CAUTION.

**Tags:** `workflow`, `design`, `autonomy`, `checkpoints`

#### Scenarios

**Contract-compromise risk triggers design pause** (`rq-designval04.1`)

**Given:**

- A design is being evaluated
- The agent determines that implementing the design would violate an agreed acceptance criterion or explicit constraint

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**

- The orchestrator pauses for human input
- No silent auto-continue to planning occurs

**No compromise risk auto-continues** (`rq-designval04.2`)

**Given:**

- A design is being evaluated
- The agent confirms the design can be delivered without compromising any acceptance criteria, constraints, or stated avoidances

**When:** The orchestrator evaluates whether to proceed from design to planning

**Then:**

- Planning proceeds without a new design-approval checkpoint (assuming no other user-value tradeoffs)

---

### Gate Handoff Voice Spine

**ID:** `rq-handoffVoice01` | **Priority:** **[MUST]**

Every /adv-\* command that emits a user-facing gate-transition message MUST use the Gate Handoff Voice spine: Problem / Chosen direction / Delivered, followed by a blockquote wayfinder block. The blockquote MUST contain three rows: bolded `**{change-id}**`, the gate transition `{gate} ✓ → {next-gate}`, and an arrow-prefixed runnable command `→ `/adv-{next-command} {change-id}``. The command shown MUST be the single command needed to continue — no redundant or alternative command lines. Canonical source: docs/command-voice-standard.md § Gate Handoff Voice.

**Tags:** `voice`, `handoff`, `presentation`

#### Scenarios

**Handoff follows spine with blockquote wayfinder block** (`rq-handoffVoice01.1`)

**Given:**

- An /adv-\* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**

- All three narrative spine headings are present: Problem, Chosen direction, Delivered, followed by a blockquote wayfinder block below a --- separator
- The blockquote contains a row with `**{change-id}**` (bolded change ID)
- The blockquote contains a row with `{gate} ✓ → {next-gate}` (gate transition)
- The blockquote contains an arrow-prefixed row `→ `/adv-{next-command} {change-id}`` showing exactly one runnable command
- The archive terminal variant uses a single-line blockquote `> **{change-id}** · release ✓ ·` followed by a terminal verb (Shipped. when push succeeds and assets propagate to the global install, Merged locally. when no remote is configured or push is skipped or push fails) instead of the standard three-row wayfinder block
- When the handoff is paired with a human-checkpoint approval, reply instructions appear as plain prose below the blockquote (not inside it); the three-section spine (Problem / Chosen direction / Delivered) is unchanged

**No mechanics leakage** (`rq-handoffVoice01.2`)

**Given:**

- An /adv-\* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**

- No todo checklists appear as primary handoff content
- No step-completed logs appear as primary handoff content
- No orchestration summaries appear as primary handoff content
- No sub-agent bookkeeping appears as primary handoff content
- No gate checkbox banners appear as primary handoff content

**Auto-continue transitions unaffected** (`rq-handoffVoice01.3`)

**Given:**

- rq-autonomy01 permits auto-continue between stages
- No unresolved user-value tradeoff exists
- No required approval is pending

**When:** The agent proceeds without emitting a user-facing message

**Then:**

- No handoff message is emitted
- No handoff validation is required for the silent transition

**Blockquote wayfinder block replaces Next sections** (`rq-handoffVoice01.4`)

**Given:**

- An /adv-\* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**

- ## Next stage and ## Next headings are absent from the handoff
- A blockquote wayfinder block appears after ## Delivered with three rows: change-id, gate transition, arrow-prefixed runnable command
- The archive terminal variant ends with a single-line blockquote `> **{change-id}** · release ✓ ·` followed by a terminal verb (Shipped. or Merged locally. depending on push state) and no separate labeled block
- Optional reply instructions for human checkpoints (Inline Approval Voice) appear as plain prose below the blockquote, not inside it

**Blockquote wayfinder shows only the needed command** (`rq-handoffVoice01.5`)

**Given:**

- An /adv-\* command completes a gate and emits a user-facing gate-transition message

**When:** The blockquote wayfinder block is inspected

**Then:**

- Exactly one runnable command is shown in the wayfinder block (in the arrow-prefixed row)
- No redundant alternative command lines appear
- The command shown is the single next action needed to continue

---

### Inline Approval at Named Human Checkpoints

**ID:** `rq-inlineApproval01` | **Priority:** **[MUST]**

ADV's seven named human checkpoints (proposal confirmation, agreement sign-off, design approval, prep approval, acceptance, archive sign-off, cancellation approval) MUST use inline handoff text — composed with the Gate Handoff Voice spine — instead of the question tool. The inline pattern MUST emit reply instructions covering approve, redirect via slash command, revise, and stop. Reply parsing tiers MUST be: Tier A (reversible — proposal/agreement/design/prep/acceptance) uses whitelist + LLM fallback for natural-language replies; Tier B (irreversible — archive sign-off, cancellation) uses whitelist-only with no LLM fallback. Non-checkpoint question tool uses (change-id selection, doom-loop recovery, drift detection, AC clarification rounds, triage commands) remain unaffected. Canonical source: docs/command-voice-standard.md § Inline Approval Voice.

**Tags:** `voice`, `checkpoints`, `approval`, `ux`

#### Scenarios

**Checkpoint approval uses inline handoff** (`rq-inlineApproval01.1`)

**Given:**

- An ADV workflow reaches a named human checkpoint

**When:** The agent presents the checkpoint to the user

**Then:**

- The presentation uses the Gate Handoff Voice spine plus inline reply instructions
- The question tool is not used for the checkpoint approval

**Tier A whitelist + LLM fallback for reversible checkpoints** (`rq-inlineApproval01.2`)

**Given:**

- A reversible checkpoint (proposal, agreement, design, prep, acceptance) is presented
- User replies with a whitelist word OR an ambiguous reply

**When:** The agent processes the reply

**Then:**

- Whitelist words (continue, go, approve, yes, ok, proceed, accept, lgtm, etc.) trigger immediate approval
- Ambiguous replies are classified by LLM into approve / revise / redirect / stop / unclear
- Unclear replies trigger re-prompt

**Tier B whitelist-only for irreversible actions** (`rq-inlineApproval01.3`)

**Given:**

- An irreversible checkpoint (archive sign-off, cancellation approval) is presented

**When:** The agent processes the reply

**Then:**

- Only exact whitelist matches trigger approval
- LLM fallback is not used
- Anything else triggers re-prompt with the same options
- Archive sign-off executes in the same response as the whitelist-match acknowledgment with no separate confirmation-echo turn

**Cancellation uses structured inline format** (`rq-inlineApproval01.4`)

**Given:**

- A cancellation approval is needed

**When:** The agent presents the cancellation

**Then:**

- The agent emits a numbered per-task list as inline prose
- Reply instructions cover approve all, reject all, keep N, cancel N, stop
- Replies are parsed by exact regex; LLM fallback is not used
- Ambiguous replies trigger re-prompt

**Prep gate machine contract preserved** (`rq-inlineApproval01.5`)

**Given:**

- The user replies with a Tier A whitelist word at the prep checkpoint

**When:** The agent calls adv_gate_complete gateId: planning

**Then:**

- userApproved: true is passed
- The machine contract is satisfied
- Inline approval is the upstream signal source independent of the API surface

**Non-checkpoint question uses unaffected** (`rq-inlineApproval01.6`)

**Given:**

- A non-checkpoint workflow step uses the question tool (change-id selection, doom-loop, drift detection, AC clarification round, triage)

**When:** The step executes

**Then:**

- The question tool continues to be used
- The inline approval pattern does not apply

**Exact shown Tier A continuation command counts as approval** (`rq-inlineApproval01.7`)

**Given:**

- A Tier A checkpoint (proposal, agreement, design, prep, acceptance) is presented with a blockquote wayfinder block showing a specific continuation command (e.g., `/adv-apply {change-id}`)
- The user invokes that exact command while the checkpoint is pending

**When:** The agent processes the command invocation

**Then:**

- The invocation counts as explicit approval equivalent to a Tier A whitelist word
- The agent completes the pending gate with userApproved: true
- The agent proceeds immediately to the next stage without a second approval prompt

**Tier B remains whitelist-only with no command-as-approval bypass** (`rq-inlineApproval01.8`)

**Given:**

- A Tier B checkpoint (archive sign-off, cancellation approval) is presented

**When:** The user invokes a slash command or provides a non-whitelist reply

**Then:**

- Only exact whitelist matches trigger approval
- No slash command invocation counts as approval
- LLM fallback is not used
- Anything else triggers re-prompt with the same options

---

### Fast-Follow Schema Contract

**ID:** `rq-scopeFollowupSchema01` | **Priority:** **[MUST]**

The ChangeSchema must support an optional `fast_follow_of` field that records same-project parent lineage. The `adv_change_create` tool must accept `parent_change_id` and enforce mutual exclusion with `target_path`.

**Tags:** `schema`, `lineage`, `fast-follow`

#### Scenarios

**parent_change_id creates fast_follow_of metadata** (`rq-scopeFollowupSchema01.1`)

**Given:**

- A valid parent change ID in the current project

**When:** adv_change_create is called with parent_change_id

**Then:**

- The new change has fast_follow_of: { parent_change_id, linked_at } set
- linked_at is an ISO8601 timestamp

**Backward compatibility without fast_follow_of** (`rq-scopeFollowupSchema01.2`)

**Given:**

- A change created without parent_change_id

**When:** ChangeSchema is parsed

**Then:**

- The fast_follow_of field is absent
- Parsing succeeds normally

**Mutual exclusion with target_path** (`rq-scopeFollowupSchema01.3`)

**Given:**

- Both target_path and parent_change_id are provided

**When:** adv_change_create is called

**Then:**

- A mutual-exclusion error is returned
- No change is created

---

### Inline-Approval Protocol for Non-Campsite Scope Discovery

**ID:** `rq-scopeDiscoveryProtocol01` | **Priority:** **[MUST]**

When non-P23-campsite-eligible scope is discovered during /adv-apply, /adv-review, or /adv-harden, the agent must emit a Tier A inline prompt with options reenter/split/keep/cancel. The agent must never silently absorb discovered scope.

**Tags:** `workflow`, `scope-discovery`, `inline-approval`, `campsite-rule`

#### Scenarios

**Non-campsite scope triggers inline prompt** (`rq-scopeDiscoveryProtocol01.1`)

**Given:**

- Non-P23-campsite-eligible scope discovered during /adv-apply, /adv-review, or /adv-harden

**When:** The agent evaluates the discovered scope

**Then:**

- A Tier A inline prompt is emitted with options: reenter {gate}, split, keep, cancel
- The agent never silently absorbs the scope

**Split creates fast-follow child** (`rq-scopeDiscoveryProtocol01.2`)

**Given:**

- User replies split to the scope-discovery prompt

**When:** The agent processes the reply

**Then:**

- adv_change_create is called with parent_change_id set to the current change
- The new change is a fast-follow child

**Keep with new objectives requires re-entry** (`rq-scopeDiscoveryProtocol01.3`)

**Given:**

- User replies keep and the absorbed scope adds new objectives or acceptance criteria

**When:** The agent processes the reply

**Then:**

- adv_change_reenter is invoked per rq-scopeReentry01
- Keep does not bypass re-entry when scope adds objectives/AC

**Campsite-eligible scope applied freely** (`rq-scopeDiscoveryProtocol01.4`)

**Given:**

- P23-campsite-eligible adjacent scope (any size, clear, safe, focused)

**When:** The agent evaluates the scope

**Then:**

- The campsite-rule is applied freely without prompting
- No inline approval is required

---

### Lineage Display in List, Show, and Status

**ID:** `rq-scopeFollowupSurfacing01` | **Priority:** **[MUST]**

Tools that surface change data must display fast-follow lineage: adv_change_show includes \_fastFollowOrigin, adv_change_list annotates entries with parent_change_id, and adv_status prefixes child labels and references parents in recommendations.

**Tags:** `lineage`, `surfacing`, `ui`

#### Scenarios

**adv_change_show surfaces \_fastFollowOrigin** (`rq-scopeFollowupSurfacing01.1`)

**Given:**

- A change with fast_follow_of set

**When:** adv_change_show is called

**Then:**

- Output includes \_fastFollowOrigin parallel to \_crossProjectOrigin
- \_fastFollowOrigin contains note, parent_change_id, and linked_at

**adv_change_list annotates parent_change_id** (`rq-scopeFollowupSurfacing01.2`)

**Given:**

- Changes with fast_follow_of in the list

**When:** adv_change_list is called

**Then:**

- Entries with fast_follow_of include parent_change_id at the top level
- Children remain top-level (not nested)

**adv_status prefixes and references parents** (`rq-scopeFollowupSurfacing01.3`)

**Given:**

- Changes with fast_follow_of in the project

**When:** adv_status is called

**Then:**

- Child change labels are prefixed with ↳
- Recommendations reference the parent change ID
- Archived parents are annotated with (archived)

---

### Size Alone Is Not Grounds for Split-Suggestion

**ID:** `rq-largeScopeValidity01` | **Priority:** **[MUST]**

Once a change has completed the prep gate with userApproved, the agent must not suggest splitting based on size, task count, or complexity alone. Real concerns surface through the existing user-value tradeoff escape clause (rq-autonomy01.6 contract-compromise design pause) and the design Key Decisions surface.

**Tags:** `workflow`, `scope`, `autonomy`

#### Scenarios

**No split-suggestion after prep approval** (`rq-largeScopeValidity01.1`)

**Given:**

- A change has completed the prep gate with userApproved

**When:** The agent evaluates whether to suggest splitting

**Then:**

- The agent does not emit split-suggestions based on size, task count, or complexity alone
- Execution proceeds as planned

**Hardstop remains advisory** (`rq-largeScopeValidity01.3`)

**Given:**

- High-investment advisory threshold fires

**When:** The agent evaluates the hardstop signal

**Then:**

- The hardstop is advisory only
- It does not auto-trigger split or adv_change_reenter

---

### ATC Agent Records Delegation Audit and Defers HITL to GitHub

**ID:** `rq-atc01` | **Priority:** **[MUST]**

The /adv-atc agent provides autonomous ROADMAP execution that defers all HITL moments to linked GitHub issues via structured comments. ATC auto-transitions gates only when no HITL is required (proposal, discovery, design, planning via auto-transition with `completedBy: 'adv-atc'`). When HITL would block (planning gate machine enforcement `userApproved: true`, acceptance gate, archive sign-off, system interrupts), ATC posts a structured `<!-- ADV_ATC_DEFERRED v1 -->` comment to the linked GitHub issue and moves to the next ROADMAP item. Resume detection is content-based: at every workflow-boundary transition, ATC batch-queries GitHub for new `<!-- ADV_ATC_RESPONSE v1 -->` comments on awaiting_approval changes. Single-session lock prevents concurrent ATC runs. Tier B checkpoints (archive sign-off, cancellation) remain whitelist-only and are deferred to GitHub like other HITL — NOT auto-approved. All system-level interrupts (doom-loop, design validator CONFLICT, contract-compromise risk, drift) defer to GitHub with full context.

**Tags:** `workflow`, `autonomy`, `atc`, `audit`, `github-defer`

#### Scenarios

**ATC invocation records change-level audit** (`rq-atc01.1`)

**Given:**

- A change has proposal gate pending
- `/adv-atc {change-id}` is invoked

**When:** ATC workflow begins

**Then:**

- Gate transitions record `completedBy: 'adv-atc'`
- Audit trail is forensically distinguishable from manual approval

**Auto-transitioned gates record adv-atc as completer** (`rq-atc01.2`)

**Given:**

- An ATC run is in progress
- The discovery gate is being completed (no HITL needed)

**When:** adv_gate_complete is called

**Then:**

- completedBy is set to 'adv-atc'
- notes contain 'auto-transitioned by adv-atc at <ISO>'

**HITL-deferred gates post structured GH comment** (`rq-atc01.3`)

**Given:**

- ATC reaches planning gate which requires userApproved: true

**When:** ATC cannot auto-transition the gate

**Then:**

- A structured comment with `<!-- ADV_ATC_DEFERRED v1 -->` marker is posted to the linked GitHub issue
- The comment includes: gate name, reason for deferral, context summary, response instructions
- The change is marked as awaiting_approval
- ATC continues to next ROADMAP item (multi mode) or stops (single mode)

**Tier B and system interrupts deferred to GH** (`rq-atc01.4`)

**Given:**

- ATC reaches acceptance gate completion
- Design validator returns CONFLICT

**When:** The orchestrator evaluates whether to proceed

**Then:**

- Archive sign-off is deferred to GitHub via structured comment (Tier B preserved)
- Design CONFLICT defers to GitHub with full error context
- Cancellation always requires adv_task_cancel approvedByUser: true
- Doom-loop, drift, contract-compromise all defer to GitHub

**Resume detection via content-based markers** (`rq-atc01.5`)

**Given:**

- A change is in awaiting_approval state
- A user has commented on the linked GitHub issue with `<!-- ADV_ATC_RESPONSE v1 -->`

**When:** ATC performs workflow-boundary resume check

**Then:**

- The response marker is detected (content-based, not timestamp-based)
- The change is prepended to the execution queue
- Planning gate is completed with `userApproved: true` and `approvalEvidence` citing the GH comment URL
- Gate attribution records `completedBy: 'user'` for resumed gates

---

### Search-Attribute Registration Must Use Correct OperatorService Method

**ID:** `rq-searchAttrHealth01` | **Priority:** **[MUST]**

The Temporal OperatorService search-attribute health check MUST use `listSearchAttributes` (not `getSearchAttributes`). `getSearchAttributes` exists on WorkflowService, not OperatorService. Using the wrong method causes the check to silently fail, returning ok: false even when attributes are registered. All code paths that query search-attribute health — observability checks, diagnose tool, and register tool — must go through `checkAdvSearchAttributes` which uses the correct OperatorService method.

#### Scenarios

**OperatorService method name is listSearchAttributes** (`rq-searchAttrHealth01.1`)

**Given:**

- A Temporal connection with operatorService available
- Search attributes AdvChangeId, AdvChangeStatus, AdvActiveGate, AdvProjectId, AdvDoomLoopActive are registered

**When:** checkAdvSearchAttributes is called

**Then:**

- It calls operatorService.listSearchAttributes (not getSearchAttributes)
- It returns { ok: true, present: [...], missing: [], wrongType: [] }

**Workflow handlers conditionally skip upsertSearchAttributes** (`rq-searchAttrHealth01.2`)

**Given:**

- A ChangeWorkflowInput with searchAttributesEnabled: false

**When:** gateCompletedSignal, archiveChangeSignal, or closeChangeSignal handlers execute

**Then:**

- wf.upsertSearchAttributes is NOT called
- The handler completes normally without error

**initStsl verifies search attributes after registration** (`rq-searchAttrHealth01.3`)

**Given:**

- initStsl is called on a Temporal namespace
- OperatorService.listSearchAttributes and addSearchAttributes are available

**When:** initStsl completes

**Then:**

- After registerAdvSearchAttributes, verifyAdvSearchAttributes is called
- getStslStats().saVerification reflects the verification result
- The verification polls checkAdvSearchAttributes until ok:true or maxAttempts exhausted

**adv_temporal_register_search_attributes returns verification result** (`rq-searchAttrHealth01.4`)

**Given:**

- A Temporal namespace where ADV search attributes need registration
- User has approved registration with approvedByUser: true

**When:** adv_temporal_register_search_attributes is called

**Then:**

- After registerMissingAdvSearchAttributes, checkAdvSearchAttributes is called for verification
- The tool output includes a verification field with ok, present, missing, wrongType
- The tool success field requires both registration ok AND verification ok

---

### Workflow replay and versioning guard command-producing changes

**ID:** `rq-workflowVersioning01` | **Priority:** **[MUST]**

Changes to Temporal workflow code under plugin/src/temporal/\*\* or other workflow-bundled command-producing helpers MUST be replay-verified against committed sanitized histories before archive. A workflow-code change that adds, removes, or reorders command-producing operations (Activities, timers, search-attribute upserts, patch markers, child workflows, continue-as-new, or similar Temporal commands) MUST include wf.patched, Worker Versioning, or an explicit reset/recovery plan. Patch markers MUST document the old branch, new branch, and a deprecation plan or non-deprecation rationale. Restarting a worker alone is not a repair for nondeterministic history mismatch.

**Tags:** `temporal`, `replay`, `versioning`, `determinism`

#### Scenarios

**Committed histories replay in CI** (`rq-workflowVersioning01.1`)

**Given:**

- A sanitized changeWorkflow history fixture is committed under `plugin/src/temporal/__tests__/replay/histories`

**When:** The replay determinism test runs

**Then:**

- Worker.runReplayHistory is invoked against the current workflow bundle
- The test fails on DeterminismViolationError or ReplayError
- The fixture metadata identifies the incident class or workflow behavior covered

**Command-producing changes declare an evolution strategy** (`rq-workflowVersioning01.2`)

**Given:**

- A workflow-bundled change adds, removes, or reorders command-producing operations

**When:** The change is prepared for archive

**Then:**

- The change includes wf.patched, Worker Versioning, or an explicit reset/recovery plan
- Any patch marker includes a deprecation plan or documented non-deprecation rationale

**Worker restart is not nondeterminism repair** (`rq-workflowVersioning01.3`)

**Given:**

- A workflow query or task fails with TMPRL1100, NonDeterministic, Nondeterminism, WorkflowTaskFailedCauseNonDeterministicError, No command scheduled, or WorkflowExecutionUpdateAccepted evidence

**When:** Recovery guidance is presented

**Then:**

- The guidance does not classify worker restart as sufficient repair
- Recovery starts with diagnosis, replay/versioning analysis, and audited quarantine/reset planning as appropriate

---

### Acceptance Proof Exists Before Approval Prompt

**ID:** `rq-acceptanceEvidenceTiming01` | **Priority:** **[MUST]**

/adv-review MUST persist and verify all required acceptance proof before presenting the acceptance approval prompt. Required proof includes contract.reviewMatrix, generated or generatable acceptance.md from typed contract state, and workflow-visible executive-summary.md evidence. If any required proof cannot be persisted, verified, or made workflow-visible, /adv-review MUST stop before asking for acceptance and the acceptance gate MUST remain pending or stuck with deterministic blockers. This is the no-late-homework rule: evidence required to justify acceptance cannot be submitted only after user approval.

**Tags:** `workflow`, `acceptance`, `evidence`, `review`

#### Scenarios

**Review stops before prompt when required proof is missing** (`rq-acceptanceEvidenceTiming01.1`)

**Given:**

- /adv-review is preparing the acceptance checkpoint

**When:** contract.reviewMatrix, acceptance projection proof, or workflow-visible executive-summary evidence is missing or invalid

**Then:**

- The acceptance approval prompt is not presented
- The missing proof is surfaced with remediation
- The acceptance gate remains pending or stuck

**Approval alone is not durable acceptance proof** (`rq-acceptanceEvidenceTiming01.2`)

**Given:**

- A user replies with an acceptance approval
- A required acceptance proof write failed before or after that reply

**When:** The acceptance gate is evaluated

**Then:**

- The approval text alone does not complete acceptance
- The workflow requires persisted proof or audited recovery proof
- The gate remains pending or stuck until proof is durable

---

### Audited Acceptance Evidence Recovery

**ID:** `rq-acceptanceRecovery01` | **Priority:** **[MUST]**

Completed-workflow or poisoned-history acceptance recovery MUST be explicit and audited. Recovery MAY repair disk projection for contract.reviewMatrix, executive-summary metadata, and acceptance gate completion only when precise completed/poisoned evidence, recovery rationale, and prior user approval evidence are supplied. Recovery MUST rerun deterministic readiness validation against typed contract state and required artifacts before marking acceptance done. Silent recovery, chat-history reconstruction, caller-forged metadata, and manual ADV state-file edits are not supported recovery mechanisms.

**Tags:** `workflow`, `acceptance`, `recovery`, `audit`

#### Scenarios

**Audited recovery repairs terminal acceptance evidence** (`rq-acceptanceRecovery01.1`)

**Given:**

- A change workflow is completed or poisoned
- Acceptance proof was produced but could not be fully persisted through Temporal

**When:** Recovery is invoked with precise evidence, recovery rationale, and prior user approval evidence

**Then:**

- The recovery path validates contract rows and required artifacts deterministically
- The disk projection may be repaired with audit metadata
- The response marks the mutation as recovery and warns that workflow history is not healed

**Recovery without evidence is rejected** (`rq-acceptanceRecovery01.2`)

**Given:**

- An acceptance recovery mutation is requested

**When:** Precise recovery evidence, rationale, or prior user approval evidence is missing

**Then:**

- No disk projection repair occurs
- The response identifies the missing audit field
- The acceptance gate remains pending or stuck

---

### Front-End Acceptance Preview URL

**ID:** `rq-acceptancePreviewUrl01` | **Priority:** **[MUST]**

/adv-discover MUST capture preview applicability for each change as visual_surface: true, false, or unknown with rationale. /adv-review MUST surface a Preview URL line before the acceptance Inline Approval prompt. For changes with visual_surface true or implementation evidence of front-end, browser-visible, or visual-output work, the Preview URL line MUST include a user-facing dev-environment URL and reachability evidence. Preview URLs MUST target visual output only, MUST be sanitized before durable recording, and MUST NOT point at internal services, dashboards, databases, admin panels, CI systems, Temporal UI, or other non-visual infrastructure. A bare unverified URL MUST NOT satisfy acceptance proof. Acceptable reachability evidence is bounded to agent-observed dev-server output, CI/deploy log URL assignment, user-confirmed URL, or browser-open evidence for the intended visual surface; agents MUST NOT perform arbitrary HTTP probing of untrusted URLs to satisfy this requirement. Missing URL, missing reachability evidence, unknown applicability, or visual-surface drift MUST block acceptance before user sign-off. Non-visual changes MAY use Preview URL: not_applicable with rationale. Durable preview proof MUST be represented through contract review evidence and included in acceptance or executive-summary evidence; generated acceptance.md remains projection-only and MUST NOT be hand-edited as authoritative proof. Archived preview URLs are point-in-time evidence and MUST include verification context rather than being treated as maintained current URLs.

**Tags:** `workflow`, `acceptance`, `preview-url`, `front-end`

#### Scenarios

**Discovery records preview applicability** (`rq-acceptancePreviewUrl01.1`)

**Given:**

- A change is being finalized through /adv-discover

**When:** The agreement is drafted and persisted

**Then:**

- The agreement records visual_surface as true, false, or unknown
- The agreement records rationale for the preview applicability value
- visual_surface unknown is carried forward as an acceptance blocker until clarified

**Applicable visual work shows reachable preview before acceptance** (`rq-acceptancePreviewUrl01.2`)

**Given:**

- A change has visual_surface true or implementation evidence of front-end, browser-visible, or visual-output work

**When:** /adv-review presents the acceptance summary before the Inline Approval prompt

**Then:**

- The summary includes Preview URL: {url}
- The summary includes reachability evidence with verification method, result, and reviewed timestamp or equivalent context
- The contract review evidence records the preview proof

**Missing applicable preview blocks acceptance** (`rq-acceptancePreviewUrl01.3`)

**Given:**

- A change requires preview proof because visual_surface is true or visual-output work is detected

**When:** No dev-environment URL or reachability evidence is available

**Then:**

- /adv-review reports Preview URL: blocked with a concrete reason
- The acceptance checkpoint is not presented
- The acceptance gate remains pending

**Visual-surface drift blocks acceptance until agreement is updated** (`rq-acceptancePreviewUrl01.4`)

**Given:**

- The approved agreement records visual_surface false
- /adv-review detects implementation evidence of front-end, browser-visible, or visual-output work

**When:** /adv-review evaluates preview applicability

**Then:**

- /adv-review reports Preview URL: blocked with a visual-surface drift reason
- The acceptance checkpoint is not presented
- The agreement must be clarified or re-entered before acceptance can proceed

**Non-visual work may mark preview not applicable** (`rq-acceptancePreviewUrl01.5`)

**Given:**

- A change has visual_surface false and no implementation evidence of front-end, browser-visible, or visual-output work

**When:** /adv-review presents the acceptance summary

**Then:**

- The summary may include Preview URL: not_applicable
- The not_applicable state includes rationale
- Preview URL absence does not block acceptance for the non-visual change

---

### Archive State Transition Must Be Resilient to Failed Disk Bundle Write

**ID:** `rq-archiveOrdering01` | **Priority:** **[MUST]**

adv_change_archive MUST be idempotent when retrying after a previous failure where the disk bundle was written but the Temporal status transition failed. On retry, if the archive bundle already exists on disk and the change status is not 'archived', the disk write MUST be skipped and the flow proceeds directly to the status transition. This prevents double-writing the bundle and allows recovery from transient Temporal failures.

#### Scenarios

**Idempotent retry skips disk write** (`rq-archiveOrdering01.1`)

**Given:**

- An archive bundle exists at {archiveDir}/{changeId}/change.json
- The change status is not 'archived' (previous status transition failed)
- dryRun is false

**When:** adv_change_archive is called

**Then:**

- archiveChange() is NOT called (disk write skipped)
- The status transition to 'archived' proceeds
- The result includes the existing archivePath

**Error output includes cause chain** (`rq-archiveOrdering01.2`)

**Given:**

- The archive disk write succeeded
- store.changes.save(change) throws a Temporal WorkflowUpdateFailedError with a nested cause

**When:** The error is caught

**Then:**

- The tool output includes the full cause chain (not just the outer error class name)
- The output shows success: false with a descriptive error message

---
