# Advance Workflow

> **Version:** 1.19.0
> **Updated:** 2026-06-20

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

**Execution-gate requires all non-cancelled tasks done** (`rq-gatemodel01.4`)

**Given:**

- A change whose execution gate is being completed
- The change has tasks with status not 'done' and not 'cancelled'

**When:** adv_gate_complete is called with gateId 'execution'

**Then:**

- The call is rejected
- The response lists each incomplete task with id, title, and status
- The execution gate remains pending

**Execution-gate passes when all tasks done or cancelled** (`rq-gatemodel01.5`)

**Given:**

- A change whose execution gate is being completed
- All tasks are either 'done' or 'cancelled' (including zero tasks)

**When:** adv_gate_complete is called with gateId 'execution'

**Then:**

- The gate completes normally

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

### Archive Finalization Requires Origin or PR Merge Proof

**ID:** `rq-releaseFinalization01` | **Priority:** **[MUST]**

Phase 9 Git Finalization must refresh the current default-branch basis before deciding local direct merge versus PR workflow. If no `origin` remote exists, `no_remote` may complete as local-only and report `Merged locally.`. If `origin` exists, release completion and archive retirement MUST require post-fetch `origin/{default-branch}` reachability or merged PR state. Remote-backed push failure, skipped push, protected-branch rejection, unarmed PR, or pending auto-merge MUST NOT record `release ✓`, archive status, issue closure, branch deletion, or worktree cleanup. Protected or risky cases route to PR workflow: `Pending auto-merge.` only when GitHub auto-merge is armed and the change remains active; `Blocked.` when PR/auto-merge cannot be established. `phase9:"skip"` and release recovery must revalidate the same origin/default or merged PR proof before recording release. `adv_archive_repair` must detect archived-but-unmerged remote `change/*` branches and re-drive them through idempotent PR auto-merge without force-push.

**Tags:** `workflow`, `archive`, `worktree`, `git`

#### Scenarios

**No-remote archive uses local fast path** (`rq-releaseFinalization01.1`)

**Given:**

- A change branch is already on the current default-branch basis
- No `origin` remote is configured
- No overlap-risk or PR-only policy applies

**When:** Phase 9 Git Finalization chooses an integration path

**Then:**

- The archive uses the local `--ff-only` path
- No branch rewrite is required
- The archive may complete release locally and report `Merged locally.`

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

**Remote-backed direct archive requires origin proof** (`rq-releaseFinalization01.4`)

**Given:**

- A change branch has been merged into the local default branch
- An origin remote is configured

**When:** Phase 9 Git Finalization publishes the archive result

**Then:**

- The archive attempts safe `git push origin {default-branch}`
- The archive fetches and verifies post-push `origin/{default-branch}` reachability before recording release
- If origin reachability succeeds, the archive reports `Shipped.`
- If the push fails, is skipped, or cannot be verified while `origin` exists, the archive does not record release and routes to `Pending auto-merge.` or `Blocked.`

**Release gate structurally enforces origin or PR proof** (`rq-releaseFinalization01.5`)

**Given:**

- A change has completed all gates before release
- The change lacks no-remote local proof, post-fetch `origin/{default-branch}` reachability, and merged PR state

**When:** Any caller invokes `adv_gate_complete` with `gateId: "release"`

**Then:**

- The gate rejects completion with code `RELEASE_REQUIRES_TRUNK_MERGE`
- The response cites `rq-releaseFinalization01`
- The response points to `/adv-archive {change-id}` to complete Phase 9

**PR auto-merge pending keeps release incomplete** (`rq-releaseFinalization01.6`)

**Given:**

- An origin remote is configured
- Default-branch protection prevents direct push or policy routes the change to PR workflow
- GitHub auto-merge is armed for the opened or reused PR

**When:** Archive finalization runs for the change

**Then:**

- The change branch is pushed for the PR workflow without force-push
- The archive reports `Pending auto-merge.`
- The release gate remains incomplete until the PR state is `MERGED`
- The change remains active; issue closure, branch deletion, and worktree cleanup do not run

**Dirty default-branch main checkpoints before merge** (`rq-releaseFinalization01.7`)

**Given:**

- Main checkout is on the resolved default branch
- Main checkout has non-ignored uncommitted changes (tracked or untracked)
- Main checkout is not in an active merge, rebase, cherry-pick, or revert state
- Git committer identity is resolvable via `git var GIT_COMMITTER_IDENT`

**When:** Phase 9 Git Finalization detects a dirty main checkout

**Then:**

- ADV commits all non-ignored tracked and untracked changes with an auditable checkpoint commit message referencing the change ID
- The checkpoint commit SHA is recorded on GitFinalizeOutcome.mainCheckpointCommitSha
- The checkpoint SHA is surfaced in the archive terminal report
- Finalization continues to remote freshness, merge, and push without user interruption
- The checkpoint does not create new change-owned work on main; archive bundle/spec artifacts remain authored in the change worktree

**Unsafe main states block before checkpoint** (`rq-releaseFinalization01.8`)

**Given:**

- Phase 9 is evaluating the main checkout for merge readiness

**When:** Any of the following unsafe states is detected

**Then:**

- Wrong main branch: archive blocks with diagnostics showing actual vs expected branch; does not switch branches
- Missing git identity: archive blocks with MISSING_GIT_IDENTITY and instructs user to configure `user.name` and `user.email`
- Active merge/rebase/cherry-pick/revert: archive blocks with MAIN_IN_PROGRESS_STATE and lists the detected in-progress operation
- Checkpoint commit failure: archive blocks with MAIN_CHECKPOINT_FAILED and the underlying git error
- Merge conflict during merge-back: archive blocks with existing conflict reporting and does not delete the worktree
- Required remote push failure: archive routes to `Pending auto-merge.` or `Blocked.` without release completion; no-remote archives are the only local-only success path
- Unverifiable release evidence: archive blocks per rq-releaseProjectionDurability01

**Phase 9 skip cannot bypass release proof** (`rq-releaseFinalization01.9`)

**Given:**

- A caller requests `adv_change_archive` with `phase9:"skip"`
- The change is remote-backed or otherwise requires origin/default or merged PR proof

**When:** Archive attempts to transition the change to archived

**Then:**

- The archive revalidates the same release proof required by normal Phase 9
- Without no-remote local proof, post-fetch `origin/{default-branch}` reachability, merged PR state, or explicit audited override evidence, the archive refuses to mark release done or archived
- The response reports `Blocked.` with the missing proof reason

**Release recovery revalidates release proof** (`rq-releaseFinalization01.10`)

**Given:**

- Release gate recovery or poisoned-history repair is requested
- Prior workflow state cannot be trusted as proof by itself

**When:** The recovery path considers recording `gateId: "release"` as done

**Then:**

- Recovery revalidates no-remote local proof, post-fetch `origin/{default-branch}` reachability, or merged PR state before recording release
- Pending auto-merge, unmerged PRs, local-only remote-backed branches, and unverifiable evidence are refused
- The recovery audit cites the proof source used

**Archived-but-unmerged detector re-drives PR auto-merge** (`rq-releaseFinalization01.11`)

**Given:**

- A remote `change/*` branch exists
- The branch is not reachable from post-fetch `origin/{default-branch}`
- The branch appears archived or otherwise stranded

**When:** `adv_archive_repair` scans or re-drives the branch

**Then:**

- Scan reports the archived-but-unmerged branch with release-proof diagnostics
- Re-drive opens or reuses exactly one PR for the branch and arms GitHub auto-merge when possible
- Re-drive never force-pushes and does not mark release complete until origin/default reachability or merged PR state is proven

---

### Archive Success Requires Durable Release Projection

**ID:** `rq-releaseProjectionDurability01` | **Priority:** **[MUST]**

When `/adv-archive` Phase 9 finalization succeeds, archive success MUST be gated by durable release-gate projection proof. Before `adv_change_archive phase9:"run"` reports success or performs archive retirement side effects, the store-backed gate read used by `adv_gate_status` MUST report `gates.release.status === "done"` with Phase 9 evidence in the release completion record. If this proof cannot be established, archive MUST return a blocked/recoverable result and MUST NOT claim shipped success, close linked issues, or run terminal cleanup as a successful retirement. Existing-bundle or completed-workflow retries MAY reconcile release metadata only after structural Phase 9 evidence is re-verified from the main checkout or PR branch state.

**Tags:** `workflow`, `archive`, `release`, `projection`, `durability`

#### Scenarios

**Archive success proves gate-status-equivalent release done** (`rq-releaseProjectionDurability01.1`)

**Given:**

- Phase 9 finalization returns no-remote local proof, direct shipped origin proof, or merged PR proof
- The release gate completion signal or recovery path has run

**When:** adv_change_archive phase9:"run" is about to return success

**Then:**

- The store-backed gate read used by adv_gate_status reports gates.release.status === "done"
- The release completion record includes Phase 9 evidence
- Archive does not report success while the gate-status-equivalent read would show release pending

**Unproven release projection blocks retirement side effects** (`rq-releaseProjectionDurability01.2`)

**Given:**

- Phase 9 finalization has succeeded
- The store-backed release gate proof is missing, stale, pending, unreadable, or lacks matching Phase 9 evidence

**When:** adv_change_archive evaluates archive success

**Then:**

- The archive returns a blocked or recoverable result citing rq-releaseProjectionDurability01
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

### Archive Deploy and Reflection Visibility Without Noise

**ID:** `rq-archiveVisibility01` | **Priority:** **[MUST]**

/adv-archive terminal output MUST keep deploy and reflection status visible and prominent while treating deploy/reflection failures as nonblocking advisories unless they reveal a structural release-safety failure already governed by contract proof, conformance, merge reachability, push safety, release projection durability, or dirty-main safety checks. /adv-reflect MUST provide an archive-visible summary and rerun guidance. This policy MUST NOT absorb separate active-change scope such as archive cleanup scanner behavior or first-class executive-summary ownership; those remain coordinated boundaries, not duplicate implementation in this slice.

**Tags:** `workflow`, `archive`, `reflection`, `deploy`, `noise`

#### Scenarios

**Archive report exposes deploy/reflection advisory state** (`rq-archiveVisibility01.1`)

**Given:**

- A change is finalized through /adv-archive

**When:** The archive terminal report is emitted

**Then:**

- Local deploy status is shown as ran, not available, not needed, or failed with reason and nonblocking marker
- Reflection status is shown as completed or failed with reason and nonblocking marker
- Deploy and reflection visibility does not reintroduce investment-report summary noise

**Advisory deploy/reflection failures do not block release** (`rq-archiveVisibility01.2`)

**Given:**

- Phase 9 merge/push/release projection proof is structurally satisfied
- Deploy or reflection generation fails without invalidating release safety

**When:** Archive completion is evaluated

**Then:**

- The release remains complete
- The failed deploy or reflection is reported as a nonblocking advisory
- Archive blocks only when the failure also proves structural release-safety failure

**Overlap boundaries stay outside this policy slice** (`rq-archiveVisibility01.3`)

**Given:**

- Related active changes own archive cleanup scanner behavior or executive-summary artifact semantics

**When:** Workflow-noise policy is updated

**Then:**

- This policy does not duplicate archive cleanup scanner implementation
- This policy does not change executive-summary ownership beyond removing investment-report noise
- Coordination boundaries are visible in design and command/test surfaces

---

### Product-Linked ADV State

**ID:** `rq-productLinking01` | **Priority:** **[MUST]**

ADV MAY link separate repositories into one product state plane. Linked products MUST keep two identity planes: repo_project_id for repo-local git/spec/worktree mechanics, and product_project_id for canonical product state (changes, agenda, wisdom, reflections, status aggregation). Product topology MUST be declared in project.json via product metadata plus related_repos entries; single-repo projects without product config MUST keep existing behavior unchanged. Missing or invalid primary repo resolution MUST fail structurally unless the explicit missing_primary_policy allows read_only or isolated degradation.

**Tags:** `workflow`, `product`, `multi-repo`, `state`

#### Scenarios

**Secondary resolves canonical product state** (`rq-productLinking01.1`)

**Given:**

- A secondary repo has product.role = secondary
- related_repos identifies the primary repo with repo_project_id or resolvable path

**When:** ADV initializes product context

**Then:**

- product_project_id resolves to the primary repo ADV project id
- repo_project_id remains the secondary repo ADV project id
- Product changes, wisdom, reflections, agenda, and status queries use the product state plane

**Single repo remains unchanged** (`rq-productLinking01.2`)

**Given:**

- A project has no product config

**When:** ADV initializes project context

**Then:**

- product_project_id equals repo_project_id
- No product filtering, origin tags, or multi-repo archive metadata is required

**Missing primary handled structurally** (`rq-productLinking01.3`)

**Given:**

- A secondary repo cannot resolve the primary repo project id

**When:** missing_primary_policy is block, read_only, or isolated

**Then:**

- block rejects initialization
- read_only reports degraded product state
- isolated reports degraded repo-local state

---

### Product Change Repo Scope

**ID:** `rq-productScopedChanges01` | **Priority:** **[MUST]**

Product-linked changes MUST declare repository scope structurally with scope_repos. scope_repos entries MUST reference product repo ids from ProductContext.repos and MAY include path, repo_project_id, required, role, and merge_order. When product linking is enabled and no explicit scope_repos is provided, change creation MUST default to the current repo. adv_change_list and adv_status MUST default to current-repo scope while exposing explicit product-wide mode.

**Tags:** `workflow`, `product`, `scope`, `status`

#### Scenarios

**Create defaults to current repo scope** (`rq-productScopedChanges01.1`)

**Given:**

- ADV is running from a linked secondary repo

**When:** adv_change_create is called without scope_repos

**Then:**

- The change has one scope_repos entry for the current repo

**List/status default to current repo** (`rq-productScopedChanges01.2`)

**Given:**

- Product state contains backend-scoped and web-scoped changes

**When:** adv_change_list or adv_status runs without scope: product

**Then:**

- Current repo scoped changes are shown
- Other repo scoped changes are hidden
- Legacy unscoped changes remain visible

**Product-wide mode shows all product changes** (`rq-productScopedChanges01.3`)

**Given:**

- Product state contains changes scoped to multiple repos

**When:** scope: product is requested

**Then:**

- All product-scoped changes are visible with product context metadata

---

### Product Wisdom and Reflection Origins

**ID:** `rq-productLearning01` | **Priority:** **[MUST]**

Wisdom and reflection entries created in linked-product state MUST persist origin tags: product_id, origin_repo_id, origin_repo_project_id, and origin_repo_path. Default linked-repo wisdom queries MUST return current-repo-relevant change wisdom plus promoted/global project wisdom and legacy untagged entries. Explicit product-wide query mode MUST return all matching product wisdom. Reflection storage MUST preserve origin tags and support repo/product filtering for future query surfaces.

**Tags:** `workflow`, `product`, `wisdom`, `reflection`

#### Scenarios

**New wisdom has origin tags** (`rq-productLearning01.1`)

**Given:**

- ADV runs from a linked product repo

**When:** adv_wisdom_add records or promotes an entry

**Then:**

- The entry includes product_id, origin_repo_id, origin_repo_project_id, and origin_repo_path

**Repo query includes safe legacy and promoted entries** (`rq-productLearning01.2`)

**Given:**

- Product wisdom contains current repo entries, other repo entries, promoted entries, and legacy untagged entries

**When:** adv_wisdom_list runs with default scope

**Then:**

- Current repo entries are returned
- Promoted/global entries are returned
- Legacy untagged entries are returned
- Other repo change-level entries are hidden

**Product query includes all product wisdom** (`rq-productLearning01.3`)

**Given:**

- Product wisdom contains entries from multiple repos

**When:** adv_wisdom_list runs with scope: product

**Then:**

- All matching product wisdom entries are returned

---

### Multi-Repo Archive Evidence

**ID:** `rq-multiRepoArchive01` | **Priority:** **[MUST]**

When a change has scope_repos, archive MUST collect multi-repo evidence before bundle write or merge. It MUST sort repos by merge_order, capture branch, default branch, before/after HEAD refs, repo_project_id, required flag, and verification evidence into multi-repo-archive.json. All required repos MUST pass ff-only ancestry preflight before any archive write or merge side effect. If any required repo fails preflight, archive MUST fail safely and write no archive bundle.

**Tags:** `workflow`, `archive`, `product`, `multi-repo`, `git`

#### Scenarios

**Archive writes multi-repo metadata** (`rq-multiRepoArchive01.1`)

**Given:**

- A change has backend and web scope_repos with merge_order

**When:** adv_change_archive creates the archive bundle

**Then:**

- multi-repo-archive.json exists in the bundle
- Repos are ordered by merge_order
- Each repo has branch, default_branch, head_before, head_after, and ff_only_preflight fields
- Done-task verification evidence is included

**Preflight failure has no archive side effects** (`rq-multiRepoArchive01.2`)

**Given:**

- A required scoped repo cannot fast-forward merge to the default branch

**When:** adv_change_archive runs preflight

**Then:**

- The tool returns success: false
- The error names the repo and ff-only preflight failure
- No archive bundle is written

---

### Archive Retirement Removes Active Source State After Durable Archive

**ID:** `rq-archiveRetirement01` | **Priority:** **[MUST]**

When adv_change_archive completes successfully, ADV MUST create the archive bundle first, transition the change workflow/status to archived, and only then remove the active changes/<id>/ source directory. Post-archive persistence MUST NOT recreate active change.json for archived changes.

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

**Cleanup refuses to remove active changes** (`rq-archiveRetirement01.3`)

**Given:**

- A change in active status still has a source changes/<id>/ directory

**When:** adv_cleanup or archive flow attempts source removal

**Then:**

- The change status is verified as archived before source removal
- Active changes are skipped with a structured warning
- A candidate that is not archived is not removed

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

ADV changes with an approved agreement may carry a typed change.contract spine. Once minted, contract.items are the source of truth for success criteria, acceptance criteria, constraints, avoidances, and out-of-scope boundaries. Command workflows MUST project the typed contract into human-facing agreement/review/archive surfaces while preserving structured task refs and proof state.

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

Every /adv-* command that emits a user-facing gate-transition message MUST use the Gate Handoff Voice spine: Problem / Chosen direction / Delivered, followed by a blockquote wayfinder block. The blockquote MUST contain three rows: bolded `**{change-id}**`, the gate transition `{gate} ✓ → {next-gate}`, and an arrow-prefixed runnable command `→ `/adv-{next-command} {change-id}``. The command shown MUST be the single command needed to continue — no redundant or alternative command lines. Canonical source: docs/command-voice-standard.md § Gate Handoff Voice.

**Tags:** `voice`, `handoff`, `presentation`

#### Scenarios

**Handoff follows spine with blockquote wayfinder block** (`rq-handoffVoice01.1`)

**Given:**

- An /adv-* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**

- All three narrative spine headings are present: Problem, Chosen direction, Delivered, followed by a blockquote wayfinder block below a --- separator
- The blockquote contains a row with `**{change-id}**` (bolded change ID)
- The blockquote contains a row with `{gate} ✓ → {next-gate}` (gate transition)
- The blockquote contains an arrow-prefixed row `→ `/adv-{next-command} {change-id}`` showing exactly one runnable command
- The archive terminal variant uses a single-line blockquote `> **{change-id}** · release ✓ ·` followed by a terminal verb for final states (Shipped. when `origin/{default-branch}` reachability or merged PR proof exists, Merged locally. only when no `origin` remote is configured); non-final remote-backed states use `release pending` / `release blocked` with `Pending auto-merge.` or `Blocked.` and leave the change active
- When the handoff is paired with a human-checkpoint approval, reply instructions appear as plain prose below the blockquote (not inside it); the three-section spine (Problem / Chosen direction / Delivered) is unchanged

**No mechanics leakage** (`rq-handoffVoice01.2`)

**Given:**

- An /adv-* command completes a gate and emits a user-facing gate-transition message

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

- An /adv-* command completes a gate and emits a user-facing gate-transition message

**When:** The handoff message is rendered

**Then:**

- ## Next stage and ## Next headings are absent from the handoff
- A blockquote wayfinder block appears after ## Delivered with three rows: change-id, gate transition, arrow-prefixed runnable command
- The archive terminal variant ends with a single-line blockquote using `release ✓` only for final states (Shipped. or no-remote Merged locally.); Pending auto-merge. and Blocked. use `release pending` or `release blocked` and no separate labeled block
- Optional reply instructions for human checkpoints (Inline Approval Voice) appear as plain prose below the blockquote, not inside it

**Blockquote wayfinder shows only the needed command** (`rq-handoffVoice01.5`)

**Given:**

- An /adv-* command completes a gate and emits a user-facing gate-transition message

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

### Target-Path Cross-Project Coordination

**ID:** `rq-crossProjectCoordination01` | **Priority:** **[MUST]**

ADV tools that support cross-project coordination must use explicit `target_path` routing, persist structured cross_project_links and advisory external_dependencies on changes, require explicit confirmation before mutating untrusted target projects, and present dependency status as summary by default with drilldown available on request. `adv_change_create` with `target_path` is a target mutation: it must route creation through the target project's Temporal-backed store, seed `cross_project_origin` before workflow start, avoid synchronous target workflow `getState` queries from the source process, and fail without leaving active disk-only target state when target workflow start fails. Active disk-only target records must be recoverable through the normal list/read reseed path; archived and closed records must not be recreated. External dependencies are advisory warnings only and must not block gates or archive by default.

**Tags:** `workflow`, `cross-project`, `target-path`, `advisory-dependencies`, `safety`

#### Scenarios

**Target path routes cross-project tools** (`rq-crossProjectCoordination01.1`)

**Given:**

- An ADV tool supports cross-project reads or contributions
- The caller provides target_path

**When:** The tool resolves the target project

**Then:**

- The tool validates target_path as a git-backed project root
- The tool derives the target project identity from that repository
- The tool never reads ADV state files directly

**Untrusted target mutation requires confirmation** (`rq-crossProjectCoordination01.2`)

**Given:**

- A mutating ADV tool is called with target_path
- The target is not configured as a trusted related repository

**When:** The mutation is evaluated

**Then:**

- The tool requires explicit target confirmation evidence before changing target state
- Without confirmation, the tool fails before any target state mutation

**Cross-project create starts target workflow state** (`rq-crossProjectCoordination01.5`)

**Given:**

- adv_change_create is called with target_path for another ADV project
- The target mutation is trusted or explicitly confirmed

**When:** The target change is created

**Then:**

- Creation is routed through the target project's Temporal-backed store or equivalent workflow-start path
- cross_project_origin is seeded before target workflow start
- The source process does not issue a target workflow getState query after creation
- If target workflow start fails, the tool returns an error and does not leave a new active disk-only target change

**Active disk-only target changes reconcile through list/read** (`rq-crossProjectCoordination01.6`)

**Given:**

- A target project has non-terminal change.json records whose workflows are missing
- The target project also has archived or closed disk records

**When:** A Temporal-backed change read or list loads target project changes

**Then:**

- Each non-terminal disk-only change is reseeded into workflow state through the normal read/list path
- Archived and closed disk records are returned only as terminal projections when requested and are not recreated as active workflows
- No startup scanner or one-off repair path is required

**Target mutation readiness accepts fresh server pollers** (`rq-targetMutationReadiness01`)

**Given:**

- A temporal-required target_path mutation is evaluated
- The current process has no registered worker for the target project queue
- Temporal task-queue inspection reports a fresh workflow poller for the target project queue

**When:** The target mutation readiness check runs

**Then:**

- The readiness check treats the target queue as serviceable using the shared queue serviceability model
- The mutation proceeds to the Temporal-backed target store path
- The mutation does not fail solely because the current process has no local worker object

**Unproven target mutation readiness fails closed** (`rq-targetMutationReadiness02`)

**Given:**

- A temporal-required target_path mutation is evaluated
- The current process has no registered worker for the target project queue
- Temporal task-queue inspection is stale, absent, unavailable, or otherwise not serviceable

**When:** The target mutation readiness check runs

**Then:**

- The tool fails before constructing or mutating target project state
- The failure reports the target queue name and typed serviceability blockers
- The failure includes an actionable recovery instruction for opening or restarting the target project ADV worker

**Status and mutation readiness share serviceability semantics** (`rq-targetMutationReadiness03`)

**Given:**

- ADV status or diagnostics report a target project queue as serviceable from fresh server poller evidence

**When:** A temporal-required target_path mutation checks the same queue with a fresh mutation-boundary probe

**Then:**

- Mutation readiness uses the same structural queue serviceability semantics as status and diagnostics
- Mutation readiness does not contradict status by failing solely because the current process is client-only
- Cached status or health evidence is not the sole authority for mutation readiness

**Dependencies remain advisory** (`rq-crossProjectCoordination01.3`)

**Given:**

- A change has external_dependencies that reference another project

**When:** Gate completion or archive readiness is evaluated

**Then:**

- Unmet external dependencies are reported as warnings or status metadata
- Unmet external dependencies do not block gates or archive by default

**Status defaults to summary with drilldown** (`rq-crossProjectCoordination01.4`)

**Given:**

- A change has cross_project_links or external_dependencies

**When:** Cross-project status is displayed

**Then:**

- Default output summarizes linked projects and dependency health concisely
- Detailed dependency graph and target diagnostics are available only through drilldown or coordinate output

---

### Task Mutations Route Through Target Project Store

**ID:** `rq-crossProjectTaskMutation01` | **Priority:** **[MUST]**

Task mutation tools that support task creation, cancellation, status updates, or TDD reclassification must accept explicit `target_path` routing when operating on another ADV-enabled project. The target store must own every task lookup, gate check, relational validation, Temporal signal, cache refresh, and context snapshot for that call. Real mutations of untrusted target projects require explicit confirmation evidence; dry-run previews may read target state without mutation confirmation because they must not write target state.

**Tags:** `workflow`, `cross-project`, `target-path`, `tasks`, `mutation-safety`

#### Scenarios

**Task add uses target store end to end** (`rq-crossProjectTaskMutation01.1`)

**Given:**

- adv_task_add is called with target_path for a target ADV project

**When:** The tool validates and creates the task

**Then:**

- Planning-gate checks use the target project state
- blockedBy validation uses target project task ids
- taskAddedSignal is sent to the target project change workflow
- The returned context snapshot describes the target project change

**Task cancel and TDD reclassify use target store end to end** (`rq-crossProjectTaskMutation01.2`)

**Given:**

- adv_task_cancel or adv_task_reclassify_tdd is called with target_path

**When:** The tool validates task ids and applies the mutation

**Then:**

- Task lookup and change lookup use the target project store
- The Temporal signal is sent to the target project change workflow
- Cache refresh invalidates the target project cache, not the source project cache

**Target dry-run task mutation is read-only** (`rq-crossProjectTaskMutation01.3`)

**Given:**

- A task mutation tool supports dryRun and is called with target_path

**When:** dryRun is true

**Then:**

- The tool may read target state to validate the preview
- The tool must not fire task mutation signals or write target state
- Untrusted-target mutation confirmation is not required for the read-only preview

---

### Target Path Operations Use Target Project Canonical Shard

**ID:** `rq-targetPathCanonicalShard01` | **Priority:** **[MUST]**

ADV tools that resolve another ADV-enabled project via `target_path` MUST derive that target project's external ADV state root from the target project id, not from the caller project's per-process OpenCode shard. When `XDG_DATA_HOME` structurally matches the per-project shard layout `.../opencode-projects/{40-hex-project-id}`, target state MUST resolve to the sibling shard `.../opencode-projects/{target-project-id}/opencode/plugins/advance/{target-project-id}`. When the shard layout cannot be derived, tools MUST preserve the legacy `$XDG_DATA_HOME/opencode/plugins/advance/{target-project-id}` behavior. Existing shadow records in caller shards MUST NOT be automatically migrated by this routing rule.

**Tags:** `workflow`, `cross-project`, `target-path`, `state-routing`, `opencode-sharding`

#### Scenarios

**Sharded target create writes target canonical shard** (`rq-targetPathCanonicalShard01.1`)

**Given:**

- The caller session has XDG_DATA_HOME set to .../opencode-projects/{sourceProjectId}
- An ADV tool creates or mutates state for a different project via target_path
- The target project id is targetProjectId

**When:** The target store external root is resolved

**Then:**

- The external root is .../opencode-projects/{targetProjectId}/opencode/plugins/advance/{targetProjectId}
- The target state is not written under the caller shard
- Subsequent target_path reads use the same target canonical root

**Non-sharded sessions preserve legacy target root** (`rq-targetPathCanonicalShard01.2`)

**Given:**

- XDG_DATA_HOME does not structurally match .../opencode-projects/{40-hex-project-id}
- An ADV tool resolves a target project via target_path

**When:** The target store external root is resolved

**Then:**

- The external root remains $XDG_DATA_HOME/opencode/plugins/advance/{targetProjectId}
- The operation does not fail solely because the canonical shard layout is absent

**Existing shadow records are not auto-migrated** (`rq-targetPathCanonicalShard01.3`)

**Given:**

- A prior target_path operation wrote target state under a caller project shard
- The canonical target shard can now be derived

**When:** A future target_path operation resolves target state

**Then:**

- The future operation uses the canonical target shard
- The tool does not automatically copy, move, or delete the old caller-shard shadow record
- Any recovery of old shadow state remains an explicit operator action

---

### Mutation Dry-Run Preview Is Same-Shape and Side-Effect Free

**ID:** `rq-dryRunMutation01` | **Priority:** **[MUST]**

ADV mutation tools that expose `dryRun` must execute schema and relational validation, return the normal success response shape with `dryRun: true`, and skip every side effect. Dry-run calls must not fire Temporal signals, save ADV state, delete worktrees, run worktree deletion hooks, write conformance audit entries, or write files. Validation failures must remain identical to real-run failures except for the absence of side effects.

**Tags:** `workflow`, `dry-run`, `mutation-safety`, `preview`

#### Scenarios

**Dry-run validates and returns same-shape preview** (`rq-dryRunMutation01.1`)

**Given:**

- A mutation tool supports dryRun
- The caller provides otherwise valid mutation arguments

**When:** dryRun is true

**Then:**

- The tool performs the same schema and relational validation as the real mutation
- The response includes the same success fields the real mutation would return
- The response includes dryRun: true

**Dry-run skips all mutation side effects** (`rq-dryRunMutation01.2`)

**Given:**

- A dry-run preview passes validation

**When:** The tool returns the preview

**Then:**

- No Temporal mutation signal is fired
- No ADV state or conformance audit file is saved
- No worktree is deleted and no preDelete hook runs
- No archive or cleanup filesystem write is performed

**Dry-run validation failures match real-run failures** (`rq-dryRunMutation01.3`)

**Given:**

- A dry-run call has invalid arguments or invalid relational state

**When:** The tool validates the call

**Then:**

- The tool fails before side effects
- The error message identifies the same validation problem the real mutation would report

---

### Non-LLM ADV Tool Execution Requires Stable Structural Runtime Path

**ID:** `rq-nonLlmToolExec01` | **Priority:** **[MUST]**

ADV must not ship a direct non-LLM cross-project tool-execution CLI unless it can use a stable OpenCode tool execution API or an equivalent structural runtime path that preserves plugin initialization, Temporal service-layer access, target project resolution, validation, and audit semantics. When no stable path exists, the implementation outcome must be documented as blocked/deferred with evidence instead of duplicating the ADV runtime or bypassing trust gates.

**Tags:** `workflow`, `cli`, `cross-project`, `tool-execution`, `runtime-safety`

#### Scenarios

**Stable runtime path is required before CLI execution ships** (`rq-nonLlmToolExec01.1`)

**Given:**

- A change proposes a non-LLM CLI that executes ADV tools across projects

**When:** The design evaluates implementation feasibility

**Then:**

- The design identifies a stable OpenCode or equivalent structural tool execution path
- The path preserves ADV plugin initialization, Temporal access, validation, and audit semantics
- If no such path exists, the CLI execution behavior is not shipped

**Blocked non-LLM execution is documented, not bypassed** (`rq-nonLlmToolExec01.2`)

**Given:**

- No stable non-LLM ADV tool execution path is available

**When:** The change resolves the requirement

**Then:**

- The blocker and evidence are documented in the investigation notes or linked issue
- ADV does not duplicate STSL, Temporal workflow access, or store lifecycle in an ad-hoc CLI
- Existing LLM-mediated or session-mediated execution paths remain the supported fallback

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

Tools that surface change data must display fast-follow lineage: adv_change_show includes _fastFollowOrigin, adv_change_list annotates entries with parent_change_id, and adv_status prefixes child labels and references parents in recommendations.

**Tags:** `lineage`, `surfacing`, `ui`

#### Scenarios

**adv_change_show surfaces _fastFollowOrigin** (`rq-scopeFollowupSurfacing01.1`)

**Given:**

- A change with fast_follow_of set

**When:** adv_change_show is called

**Then:**

- Output includes _fastFollowOrigin parallel to _crossProjectOrigin
- _fastFollowOrigin contains note, parent_change_id, and linked_at

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
- /adv-atc {change-id} is invoked

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

**When:** gateCompletedSignal, archiveRequestedSignal, or changeCancelledSignal handlers execute

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

Changes to Temporal workflow code under plugin/src/temporal/** or other workflow-bundled command-producing helpers MUST be replay-verified against committed sanitized histories before archive. A workflow-code change that adds, removes, or reorders command-producing operations (Activities, timers, search-attribute upserts, patch markers, child workflows, continue-as-new, or similar Temporal commands) MUST include wf.patched, Worker Versioning, or an explicit reset/recovery plan. Patch markers MUST document the old branch, new branch, and a deprecation plan or non-deprecation rationale. Restarting a worker alone is not a repair for nondeterministic history mismatch.

**Tags:** `temporal`, `replay`, `versioning`, `determinism`

#### Scenarios

**Committed histories replay in CI** (`rq-workflowVersioning01.1`)

**Given:**

- A sanitized changeWorkflow history fixture is committed under plugin/src/temporal/__tests__/replay/histories

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

### Single ADV-controlled system entry per turn

**ID:** `rq-singleSystemBlock01` | **Priority:** **[MUST]**

The ADV plugin must emit at most one plugin-controlled entry into output.system per experimental.chat.system.transform invocation. All sections (degraded banner, session-health banner, provider-switch hint, worktree marker, active-change line, wisdom-recording prompt) must be assembled into a single string and appended to output.system[0]. Multi-block emission via output.system.push is prohibited because it triggers assistant-prefilling rejection on OpenAI-compatible providers. The factory-failure hook follows the same single-append rule.

**Tags:** `workflow`, `providers`, `system-emission`, `openai-compat`

#### Scenarios

**Healthy turn produces at most one system entry** (`rq-singleSystemBlock01.1`)

**Given:**

- An active change is set
- The plugin store initialized successfully

**When:** experimental.chat.system.transform runs

**Then:**

- output.system.length is at most 1 after the hook returns
- All ADV markers (active change, worktree, wisdom prompt) appear in output.system[0]

**Degraded mode also obeys single-entry contract** (`rq-singleSystemBlock01.2`)

**Given:**

- The plugin store initialization failed

**When:** experimental.chat.system.transform runs

**Then:**

- The [ADV:DEGRADED] banner is appended to output.system[0]
- output.system.length is at most 1

**Internal-call short-circuit** (`rq-singleSystemBlock01.3`)

**Given:**

- output.system[0] matches an OpenCode internal-call pattern (title generation or summarizer)

**When:** experimental.chat.system.transform runs

**Then:**

- The assembler returns null and ADV content is NOT appended
- output.system remains unchanged

---

### Compaction context fidelity parity with live snapshot

**ID:** `rq-compactionFidelity01` | **Priority:** **[MUST]**

experimental.session.compacting must use buildChangeContextSnapshot to produce its change-context block, ensuring the compacted context contains the same gate row, ledger phase, task counts, and current task as the live emission. A specs summary block is retained alongside the snapshot. A resume-hint block is composed from store.tasks.getRun for the in-progress task. Total output is bounded by an explicit byte budget.

**Tags:** `workflow`, `compaction`, `fidelity`

#### Scenarios

**Compaction uses buildChangeContextSnapshot** (`rq-compactionFidelity01.1`)

**Given:**

- An active change with at least one task

**When:** experimental.session.compacting runs

**Then:**

- output.context contains the rendered change-context snapshot
- The snapshot uses the same formatter as the live system-block emission

**Specs summary is retained** (`rq-compactionFidelity01.2`)

**Given:**

- The project has at least one spec

**When:** experimental.session.compacting runs

**Then:**

- output.context includes an ADV SPECS CONTEXT block listing the specs

---

### 7-gate lifecycle is orthogonal to backlog coordination

**ID:** `rq-aw-backlog01` | **Priority:** **[MUST]**

Backlog coordination state (claims, search attributes, snapshot freshness) is updated as a side effect of normal change workflow signals. The 7-gate lifecycle (proposal/discovery/design/planning/execution/acceptance/release) and its semantics are unaffected by backlog-coordination changes (rq-backlogCoord01..07). Gate transitions emit search attribute upserts via buildChangeSearchAttributes; AdvBacklogIssueNumber participates in those upserts when state.origin.issue_number is set, but no gate logic depends on it.

**Tags:** `backlog-coordination`, `gates`

#### Scenarios

**Gate transitions emit search attribute upserts including AdvBacklogIssueNumber when origin set** (`rq-aw-backlog01.1`)

**Given:**

- A change workflow with state.origin = { kind: roadmap, issue_number: 42 } progressing through gates

**When:** Any gate completes (proposal, discovery, design, planning, execution, acceptance, release)

**Then:**

- The workflow upserts search attributes via buildChangeSearchAttributes
- AdvBacklogIssueNumber remains populated with [42]
- AdvCurrentGate reflects the newly completed gate semantics
- Gate completion semantics are unchanged from baseline (rq-gatemodel01)

**Changes without origin.issue_number do not emit AdvBacklogIssueNumber** (`rq-aw-backlog01.2`)

**Given:**

- A change workflow with state.origin undefined OR state.origin.issue_number undefined

**When:** Any gate completes

**Then:**

- AdvBacklogIssueNumber is NOT present in the search-attribute upsert payload
- Other gate-related search attributes (AdvCurrentGate, AdvChangeStatus, etc.) populate normally

---

### Project-wide ambiguity scanning in /adv-audit

**ID:** `rq-ambiguityScan01` | **Priority:** **[MUST]**

/adv-audit MUST detect ambiguity in committed spec laws using the B/F/S/Q/E taxonomy. Detection runs inline during Phase 3 Synthesis via runSpecAmbiguityChecks(markdown, capability) — not a sub-agent stage. Categories: B (Boundaries), F (Functional), S (Completion Signals), Q (Quality Attributes), E (Error Handling).

#### Scenarios

**Ambiguity detection runs for each spec audited** (`rq-ambiguityScan01.1`)

**Given:**

- An /adv-audit execution targeting one or more specs

**When:** Phase 3 Synthesis executes

**Then:**

- runSpecAmbiguityChecks is called for each spec's markdown content
- Findings use B/F/S/Q/E taxonomy categories
- Each finding includes category, severity, spec ref, verbatim specText, issue, and fix

**Ambiguity detection is pure-function and inline** (`rq-ambiguityScan01.2`)

**Given:**

- The audit command is executing Phase 3

**When:** Ambiguity checks are invoked

**Then:**

- No sub-agent is spawned for ambiguity detection
- The scan completes synchronously as a pure function call
- Results are aggregated with other synthesis data

---

### Ambiguity findings in audit reports

**ID:** `rq-ambiguityScan02` | **Priority:** **[MUST]**

Ambiguity findings MUST appear as a distinct section in audit reports. Each finding MUST include: category (B|F|S|Q|E), severity (CRITICAL|HIGH|MEDIUM|LOW), spec reference, verbatim evidence (specText), issue description, and fix suggestion.

#### Scenarios

**Text report includes ambiguity section** (`rq-ambiguityScan02.1`)

**Given:**

- An audit produces ambiguity findings

**When:** The text report is rendered

**Then:**

- A distinct ambiguity section appears in the report
- Each finding shows category, severity, spec ref, verbatim text, issue, and fix

**JSON report includes ambiguity array** (`rq-ambiguityScan02.2`)

**Given:**

- An audit produces ambiguity findings and --json is requested

**When:** The JSON report is emitted

**Then:**

- The root object contains an ambiguity array
- Each element has id, category, severity, spec, specText, issue, and fix fields

---

### Ambiguity-aware quality gates

**ID:** `rq-ambiguityScan03` | **Priority:** **[MUST]**

Quality gates MUST promote health status based on ambiguity severity. CRITICAL ambiguity ≥ 1 promotes to MAJOR_DRIFT. HIGH ambiguity > 3 (standard mode) or any HIGH (strict mode) promotes to DRIFT_DETECTED.

#### Scenarios

**CRITICAL ambiguity promotes to MAJOR_DRIFT** (`rq-ambiguityScan03.1`)

**Given:**

- An audit detects at least one CRITICAL ambiguity finding

**When:** Quality gates are applied

**Then:**

- Health status is MAJOR_DRIFT regardless of other gate results

**HIGH ambiguity threshold promotes to DRIFT_DETECTED** (`rq-ambiguityScan03.2`)

**Given:**

- Standard mode audit detects > 3 HIGH ambiguity findings

**When:** Quality gates are applied

**Then:**

- Health status is DRIFT_DETECTED

**Strict mode enforces zero HIGH ambiguity** (`rq-ambiguityScan03.3`)

**Given:**

- Strict mode audit detects any HIGH ambiguity finding

**When:** Quality gates are applied

**Then:**

- Health status is DRIFT_DETECTED or MAJOR_DRIFT

---

### clarify_enforcement disables ambiguity detection

**ID:** `rq-ambiguityScan04` | **Priority:** **[MUST]**

When clarify_enforcement is 'off', ambiguity detection MUST be skipped entirely. When 'advisory', findings appear in reports but do not affect health status. When 'strict', ambiguity gates are enforced.

#### Scenarios

**off mode skips ambiguity detection** (`rq-ambiguityScan04.1`)

**Given:**

- clarify_enforcement is set to 'off'

**When:** /adv-audit Phase 3 Synthesis runs

**Then:**

- runSpecAmbiguityChecks is NOT called
- No ambiguity findings appear in the report

**advisory mode includes findings without gate enforcement** (`rq-ambiguityScan04.2`)

**Given:**

- clarify_enforcement is set to 'advisory'

**When:** Quality gates are applied

**Then:**

- Ambiguity findings appear in the report
- Ambiguity findings do NOT affect health status promotion

---

### Informational remediation handoff for ambiguity

**ID:** `rq-ambiguityScan05` | **Priority:** **[MUST]**

Remediation handoff for ambiguity findings MUST be informational only. The audit report MAY suggest /adv-clarify as a resolution path, but MUST NOT mutate ADV change state or spawn clarification sub-agents directly.

#### Scenarios

**Audit report suggests clarify handoff without state mutation** (`rq-ambiguityScan05.1`)

**Given:**

- An audit produces ambiguity findings

**When:** The remediation section is rendered

**Then:**

- The report contains informational text suggesting /adv-clarify
- No ADV state is mutated (no task updates, no gate changes, no change creation)

---

### TodoWrite Projection From ADV Tasks

**ID:** `rq-todoProjection01` | **Priority:** **[MUST]**

ADV task-readiness surfaces MUST expose a TodoWrite-safe projection derived from ADV task state. The projection is a bounded UI window over the authoritative task graph, not a second task source of truth.

**Tags:** `todowrite`, `tasks`, `projection`, `guardrails`

#### Scenarios

**adv_task_ready emits projection rows** (`rq-todoProjection01.1`)

**Given:**

- A change has pending or in-progress ADV tasks

**When:** adv_task_ready is called

**Then:**

- The response includes _todoProjection rows derived from ADV task state
- Each row content is formatted as `tk-id — title`
- Completed ADV tasks are omitted from the projection

**change show ready-task include emits same projection** (`rq-todoProjection01.2`)

**Given:**

- A change has ready tasks
- adv_change_show is called with include.readyTasks true

**When:** The response is built

**Then:**

- The response includes _todoProjection with the same row shape as adv_task_ready
- The default projection window includes the current in-progress task when present plus the next three ready tasks
- Legacy ready-task fields remain present for existing callers

---

### Scoped TodoWrite Drift Guardrails

**ID:** `rq-todoGuard01` | **Priority:** **[MUST]**

During top-level ADV execution after a planned task graph exists, TodoWrite calls MUST be checked against ADV task state. Hard blocks must be structural for task identity, ownership, and completion drift; warning-only paths must preserve non-ADV, early-gate, degraded-state, and subagent scratchpad usage.

**Tags:** `todowrite`, `tasks`, `runtime-guard`, `projection`

#### Scenarios

**Unknown task IDs are blocked in active execution** (`rq-todoGuard01.1`)

**Given:**

- A top-level ADV session has an active change with a planned task graph

**When:** TodoWrite contains a `tk-*` ID that is not known to the active change

**Then:**

- The TodoWrite call is rejected with a deterministic error

**Other-change task IDs are blocked** (`rq-todoGuard01.2`)

**Given:**

- A top-level ADV session has an active change with a planned task graph

**When:** TodoWrite contains a task ID structurally owned by another change

**Then:**

- The TodoWrite call is rejected with a deterministic error

**TodoWrite completion cannot outrun ADV completion** (`rq-todoGuard01.3`)

**Given:**

- A TodoWrite entry references an ADV task whose ADV status is not done

**When:** The TodoWrite entry status is completed during active top-level ADV execution

**Then:**

- The TodoWrite call is rejected with a deterministic error

**Scratchpad and degraded scopes are preserved** (`rq-todoGuard01.4`)

**Given:**

- TodoWrite is used outside active top-level ADV execution or ADV state cannot be resolved safely

**When:** TodoWrite contains no task IDs or local scratchpad entries

**Then:**

- The call is allowed or warning-only
- Non-ADV work, early gates without tasks, degraded ADV state, and subagent scratchpads are not hard-blocked

---

### ADV Tool Argument Preflight

**ID:** `rq-toolArgPreflight01` | **Priority:** **[MUST]**

ADV tools MUST reject missing required arguments and high-risk empty mutation payloads at the plugin boundary before execution timeout safety nets. Validation errors must be deterministic, actionable, and redact sensitive received arguments.

**Tags:** `tools`, `validation`, `guardrails`

#### Scenarios

**Missing required args fail fast** (`rq-toolArgPreflight01.1`)

**Given:**

- An ADV tool invocation omits required fields

**When:** The tool registry receives the invocation

**Then:**

- The invocation returns `INVALID_TOOL_ARGS` before tool execution
- The response lists missing fields
- The response does not surface `ToolExecutionTimeout`

**Cross-field constraints fail fast** (`rq-toolArgPreflight01.2`)

**Given:**

- An ADV tool has a cross-field mutation constraint such as artifact update requiring at least one non-empty artifact field

**When:** The invocation omits all constrained fields or provides only empty strings

**Then:**

- The invocation returns `INVALID_TOOL_ARGS` before tool execution
- The response explains the cross-field constraint

**Received args are redacted** (`rq-toolArgPreflight01.3`)

**Given:**

- A rejected tool invocation includes secret-like argument keys

**When:** The preflight error response is formatted

**Then:**

- Sensitive values in `received_args` are redacted

---

### Placeholder-Safe ADV Tool Arguments

**ID:** `rq-toolPlaceholderPolicy01` | **Priority:** **[MUST]**

ADV tool invocation preflight MUST centrally classify placeholder-sensitive arguments before tool execution through explicit `FIELD_POLICIES` metadata. Blank or whitespace-only strings, omission sentinels such as 'none'/'n/a'/'null'/'transcript', and empty arrays/objects MUST be rejected or normalized only by an explicit field policy. Required content, durable audit, path, lineage, origin, approval-evidence, command, and worktree branch/base fields MUST reject blank placeholders when provided. Omission-equivalent normalization is allowed only for fields whose schema and semantics make omission equivalent, such as scope_repos: [] on adv_change_create. Preflight MUST return deterministic `INVALID_TOOL_ARGS` field-level diagnostics and execute tools with normalized arguments so tool execution, workflow state, persistence, and spec compliance are not governed by heuristic caller interpretation. Drift guards MUST fail when audited placeholder-sensitive fields lack policy coverage or when registry-known policies reference dead tool fields.

**Tags:** `tools`, `validation`, `placeholders`, `preflight`, `structural-correctness`

#### Scenarios

**Required content placeholders fail before execution** (`rq-toolPlaceholderPolicy01.1`)

**Given:**

- An ADV tool receives a blank required content field such as task content, wisdom content, run-test command, agenda title, or worktree branch

**When:** Tool argument preflight runs

**Then:**

- The invocation returns INVALID_TOOL_ARGS before tool execution
- The response names the offending field
- No workflow signal, shell command, artifact write, git worktree operation, or durable state mutation occurs

**Audit and linkage placeholders are rejected** (`rq-toolPlaceholderPolicy01.2`)

**Given:**

- An ADV mutation tool receives a blank or sentinel audit, approval-evidence, target path, origin, parent, source, supersession, recovery-evidence, or cancellation-reason value

**When:** Tool argument preflight runs

**Then:**

- The invocation fails before mutation
- The diagnostic names each invalid field or record entry
- Placeholder strings are not persisted as workflow or audit facts

**Omission-equivalent placeholders require explicit normalization policy** (`rq-toolPlaceholderPolicy01.3`)

**Given:**

- An ADV tool receives an empty array or other placeholder that might mean omitted

**When:** The field has no explicit omit policy

**Then:**

- The placeholder is rejected or left to schema validation rather than silently normalized
- Only explicitly whitelisted fields such as adv_change_create scope_repos: [] may be removed from normalizedArgs

**Normalized arguments are the execute payload** (`rq-toolPlaceholderPolicy01.4`)

**Given:**

- Preflight applies a field policy that omits or otherwise normalizes a placeholder

**When:** The tool registry calls the tool implementation

**Then:**

- The tool receives normalizedArgs rather than the raw caller payload
- Execute paths contain only defensive safety checks needed for bypass resilience
- Preflight and execute behavior do not diverge for placeholder-sensitive fields

**Strict-mode optional fields normalize blanks to omitted** (`rq-toolPlaceholderPolicy01.5`)

**Given:**

- A strict-mode provider sends adv_change_create with optional fields filled with blank strings or zero

**When:** Tool argument preflight runs

**Then:**

- Blank optional fields are normalized to omitted
- The invocation succeeds with normalizedArgs
- Required-when-present fields still reject blank values

**Field policy drift guards cover audited tool args** (`rq-toolPlaceholderPolicy01.6`)

**Given:**

- A high-risk agent-callable ADV tool adds or renames a placeholder-sensitive argument

**When:** The preflight policy and registry tests run

**Then:**

- Audited required content, audit, evidence, recovery, target path, command, and worktree fields have explicit `FIELD_POLICIES` coverage
- Dead policy entries for removed or renamed tool fields fail tests
- Representative malformed invocations return `INVALID_TOOL_ARGS` before handler execution or mutation

---

### Blank Artifact and Linkage Mutation Arguments

**ID:** `rq-toolArgBlankArtifactLinkage01` | **Priority:** **[MUST]**

ADV mutation tools MUST normalize provided blank or whitespace-only strings to omitted for fields that write durable narrative artifacts or origin linkage metadata. Required-when-present audit, evidence, and identity fields MUST still reject blank values. For adv_change_update this applies to proposal, problemStatement, agreement, design, and executiveSummary, including mixed payloads where another artifact field is non-blank. For adv_change_create this applies to provided narrative artifact fields and origin_source_artifact. Omitted fields preserve existing omission/default semantics. Normalization MUST occur before writes or workflow signals. Storage artifact write boundaries MUST also reject blank artifact content so bypassing preflight cannot erase an artifact.

**Tags:** `tools`, `validation`, `artifacts`, `origin`

#### Scenarios

**Mixed update payload normalizes blank field to omitted; only writes provided non-blank artifacts** (`rq-toolArgBlankArtifactLinkage01.1`)

**Given:**

- adv_change_update receives a payload with proposal: 'real content' and design: ''

**When:** The tool invocation is validated

**Then:**

- design is normalized to omitted
- The invocation succeeds
- Only proposal is written

**Omitted artifact fields keep omission semantics** (`rq-toolArgBlankArtifactLinkage01.2`)

**Given:**

- adv_change_update receives proposal: 'new content' and omits design

**When:** The update succeeds

**Then:**

- The proposal artifact may change
- The omitted design artifact remains unchanged

**Create normalizes blank provided narrative artifacts to omitted** (`rq-toolArgBlankArtifactLinkage01.3`)

**Given:**

- adv_change_create receives agreement: '   '

**When:** The create invocation is validated

**Then:**

- agreement is normalized to omitted
- The invocation succeeds
- Omitted narrative artifact fields still use create defaults or skip behavior

**Storage boundary rejects blank artifact writes** (`rq-toolArgBlankArtifactLinkage01.4`)

**Given:**

- A caller bypasses tool preflight and attempts to persist a blank artifact value

**When:** The storage artifact write boundary validates the content

**Then:**

- The write is rejected before any artifact file is overwritten
- The error identifies the blank artifact field

**Blank origin source artifact is normalized to omitted** (`rq-toolArgBlankArtifactLinkage01.5`)

**Given:**

- adv_change_create receives origin_source_artifact: '   '

**When:** The create invocation is validated

**Then:**

- origin_source_artifact is normalized to omitted
- The invocation succeeds

**Required-when-present audit fields still reject blank** (`rq-toolArgBlankArtifactLinkage01.6`)

**Given:**

- adv_change_update receives confirmationEvidence: ''

**When:** The update invocation is validated

**Then:**

- The invocation fails before writes or workflow signals
- The response names confirmationEvidence as an offending field

---

### Workflow-Level Gate Artifact Enforcement

**ID:** `rq-gateArtifactEnforcement01` | **Priority:** **[MUST]**

The Temporal change workflow MUST enforce required artifact preconditions before marking artifact-backed gates done. Proposal, discovery, design, and acceptance gate completion MUST be blocked when the required evidence is missing, unreadable, blank, stale, not workflow-visible, or below deterministic minimum-content rules, unless an explicit compatibility rationale is recorded for replay or migration safety. Required gate evidence MUST be durable before gate completion and MUST NOT be satisfied by caller-provided metadata or post-approval late writes. Artifact checks MUST use activities or tool/storage boundaries, never direct filesystem I/O in workflow code.

**Tags:** `workflow`, `gates`, `artifacts`, `temporal`

#### Scenarios

**Missing artifact blocks artifact-backed gate** (`rq-gateArtifactEnforcement01.1`)

**Given:**

- An artifact-backed gate completion signal is handled by the change workflow

**When:** The gate's required artifact is missing or unreadable

**Then:**

- The workflow does not mark the gate done
- The gate remains pending or records a structured blocker
- The blocker identifies the gate and missing artifact kind

**Blank or undersized artifact blocks completion** (`rq-gateArtifactEnforcement01.2`)

**Given:**

- A required gate artifact exists

**When:** The artifact is blank, whitespace-only, or below deterministic minimum-content rules

**Then:**

- The workflow refuses gate completion
- The refusal is deterministic and does not depend on LLM quality scoring

**Valid required artifact permits completion** (`rq-gateArtifactEnforcement01.3`)

**Given:**

- All prior gates are done
- The required artifact exists and passes deterministic checks

**When:** gateCompletedSignal is handled for the artifact-backed gate

**Then:**

- The workflow may mark the gate done
- Artifact evidence is available for audit when configured

**Compatibility requires explicit rationale** (`rq-gateArtifactEnforcement01.4`)

**Given:**

- A replay or migration fixture cannot provide the required artifact evidence

**When:** Compatibility completion is allowed

**Then:**

- The completion records an explicit compatibility rationale
- Silent legacy bypasses are not accepted for new gate completions

**Post-approval late artifact write does not satisfy gate proof** (`rq-gateArtifactEnforcement01.5`)

**Given:**

- A user has approved an artifact-backed gate checkpoint
- A required proof artifact was not durably persisted and workflow-visible before the approval prompt

**When:** Gate completion is evaluated

**Then:**

- The workflow refuses completion or records a deterministic stuck blocker
- The approval text alone is not treated as artifact proof
- The blocker names the missing or stale artifact evidence

---

### Deterministic Gate Readiness Blockers

**ID:** `rq-gateReadiness01` | **Priority:** **[MUST]**

Gate readiness MUST be derived from workflow-owned state and expose deterministic blockers for incomplete prior gates and missing required artifacts. Tool-layer preflight may improve user experience, but workflow readiness remains authoritative and must not rely on heuristic agent judgment.

**Tags:** `workflow`, `gates`, `readiness`, `blockers`

#### Scenarios

**Prior gate blocker is reported** (`rq-gateReadiness01.1`)

**Given:**

- A gate completion is requested while an earlier gate is not done

**When:** Readiness is evaluated

**Then:**

- Readiness fails
- The blocker identifies the prior incomplete gate
- The workflow does not complete the requested gate

**Artifact blocker is reported** (`rq-gateReadiness01.2`)

**Given:**

- Prior gates are complete
- The requested gate requires an artifact

**When:** The required artifact is missing or invalid

**Then:**

- Readiness fails with a stable blocker code
- The blocker includes gateId, artifactKind, and remediation text

**Tool surfaces workflow readiness blockers** (`rq-gateReadiness01.3`)

**Given:**

- Workflow readiness rejects a gate completion

**When:** adv_gate_complete or adv_gate_status reports the result

**Then:**

- The tool response includes the workflow-derived blockers
- Tool success is not reported unless workflow state actually advanced

---

### Gate Completion Artifact Audit Evidence

**ID:** `rq-gateArtifactAudit01` | **Priority:** **[SHOULD]**

When a gate requires artifact evidence, successful gate completion SHOULD record artifact audit metadata such as artifact kind, path or projection identity, content hash when available, checked timestamp, and compatibility rationale when used. For acceptance proof, executive-summary metadata MUST include workflow-visible content hash evidence for new contract-era changes. Audit metadata must not be caller-forgeable proof; workflow validation remains authoritative.

**Tags:** `workflow`, `gates`, `audit`, `artifacts`

#### Scenarios

**Artifact evidence recorded on completion** (`rq-gateArtifactAudit01.1`)

**Given:**

- A gate requiring artifact evidence completes successfully

**When:** The gate completion record is persisted

**Then:**

- The record includes the artifact kind and checked timestamp
- The record includes artifact path or projection identity when available

**Caller-provided audit data is not authoritative** (`rq-gateArtifactAudit01.2`)

**Given:**

- A caller sends gate completion payload data that claims artifact evidence

**When:** The workflow handles the completion signal

**Then:**

- The workflow validates the artifact independently or rejects completion
- Caller-provided metadata alone cannot mark the gate done

**Executive summary proof uses workflow-visible hash metadata** (`rq-gateArtifactAudit01.3`)

**Given:**

- A new contract-era change reaches acceptance
- executive-summary.md is required acceptance proof

**When:** The workflow validates acceptance readiness

**Then:**

- The workflow requires executive-summary artifact metadata with a content hash
- The current artifact hash must match workflow-visible metadata
- Missing or stale metadata blocks acceptance

---

### Acceptance Projection from Typed Contract Review State

**ID:** `rq-acceptanceProjection01` | **Priority:** **[MUST]**

Acceptance gate completion MUST use typed contract, review matrix state, generated acceptance.md, and workflow-visible executive-summary.md evidence as the source of truth for acceptance proof. For new contract-era changes, the workflow MUST generate a durable acceptance.md projection from ChangeContract items and the contract review matrix before marking acceptance done. Manually edited markdown must not be treated as the authoritative acceptance proof.

**Tags:** `workflow`, `acceptance`, `contract`, `artifacts`

#### Scenarios

**Missing contract blocks acceptance** (`rq-acceptanceProjection01.1`)

**Given:**

- A new contract-era change reaches acceptance gate completion

**When:** ChangeContract state is missing and no explicit compatibility rationale applies

**Then:**

- The workflow refuses acceptance completion
- The blocker identifies the missing contract proof

**Incomplete or failing review matrix blocks acceptance** (`rq-acceptanceProjection01.2`)

**Given:**

- A ChangeContract exists

**When:** A verification-required contract item lacks a review row or has a failing/violated status

**Then:**

- The workflow refuses acceptance completion
- The blocker identifies the unmet contract item

**Passing matrix generates durable acceptance projection** (`rq-acceptanceProjection01.3`)

**Given:**

- All verification-required contract items have acceptable review rows

**When:** The acceptance gate is completed

**Then:**

- The workflow writes acceptance.md through an activity or storage boundary
- The workflow records acceptance artifact evidence
- The acceptance gate may be marked done

**Executive summary evidence blocks acceptance when absent or stale** (`rq-acceptanceProjection01.4`)

**Given:**

- A new contract-era change reaches acceptance gate completion
- The contract and review matrix pass

**When:** executive-summary.md is missing, unreadable, undersized, lacks workflow-visible metadata, or its content hash is stale

**Then:**

- The workflow refuses acceptance completion
- The blocker identifies executive-summary evidence as missing or stale
- Chat approval alone does not mark acceptance done

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

### Design Owns Design-Derived Technical Criteria Only

**ID:** `rq-stageDesignCriteriaBoundary01` | **Priority:** **[MUST]**

/adv-design MUST produce validated architecture decisions, implementation strategy, and any design-derived technical criteria such as performance, security, scale, migration, or operational budgets. /adv-design MUST NOT invent new user-facing acceptance criteria. If design invalidates or requires changing approved user-facing criteria, the workflow MUST treat discovery re-entry as the routine path for criteria revision before prep resumes.

**Tags:** `workflow`, `design`, `criteria`, `re-entry`, `stage-boundary`

#### Scenarios

**Design records technical criteria without new user AC** (`rq-stageDesignCriteriaBoundary01.1`)

**Given:**

- A change reaches /adv-design with approved discovery criteria

**When:** /adv-design writes design.md

**Then:**

- design.md may include a Design-Derived Criteria section for technical budgets and constraints
- design.md does not add new user-facing acceptance criteria as if they were approved agreement items
- The design explains how approved discovery criteria will be delivered

**Design-invalidated AC uses discovery re-entry** (`rq-stageDesignCriteriaBoundary01.2`)

**Given:**

- A design decision proves an approved acceptance criterion invalid, incomplete, or mechanism-derived

**When:** /adv-design handles the conflict

**Then:**

- The conflict is surfaced before planning
- adv_change_reenter is used from discovery when criteria must change
- The design gate does not silently rewrite approved user-facing criteria

---

### Criteria Enforcement Anchors After Discovery

**ID:** `rq-stageCriteriaEnforcementRetarget01` | **Priority:** **[MUST]**

Workflow enforcement MUST NOT require proposal.md to contain testable success criteria. Proposal `## User Outcomes` are alignment inputs. Criteria-presence enforcement for full changes MUST anchor to discovery's agreement artifact and the minted ChangeContract. Planning, execution, acceptance, and release MUST continue to use the approved ChangeContract review matrix and evidence policies without reading proposal-level success criteria as contract law.

**Tags:** `workflow`, `criteria`, `proposal`, `discovery`, `contract`

#### Scenarios

**Proposal without success criteria reaches planning** (`rq-stageCriteriaEnforcementRetarget01.1`)

**Given:**

- proposal.md contains `## User Outcomes` and no proposal-level `## Success Criteria` section

**When:** The change reaches planning-gate readiness checks

**Then:**

- No clarify-readiness finding fires solely because proposal success criteria are absent
- The planning gate is not blocked on that basis
- Criteria checks use agreement.md and the ChangeContract instead

**Acceptance contract behavior unchanged** (`rq-stageCriteriaEnforcementRetarget01.2`)

**Given:**

- The ChangeContract contains approved `AC*` items from discovery

**When:** /adv-review builds the acceptance review matrix

**Then:**

- Each `AC*` item is reviewed with its evidence policy as before
- No proposal `## User Outcomes` item is reviewed as an `AC*` unless it was approved through discovery agreement
- The absence of proposal success criteria does not weaken acceptance review of approved contract items

---

### Mandatory Design Leverage Scout

**ID:** `rq-designOpportunityScout01` | **Priority:** **[MUST]**

/adv-design MUST execute a bounded Design Leverage Scout pass (Phase 2.5) for every full proposal workflow after draft design (Phase 2) and before independent validation (Phase 3.5). The scout uses a split-load contract: orchestrator owns ScoutCandidate schema, routing, fallback/degradation, adoption, and mutations; adv-researcher may load the adv-opportunity-scout skill in design mode for worker methodology. It returns ≤5 structured candidates. The scout identifies leverage points: shortcuts, reusable components, parallelism, simplification paths. The scout phase MUST include an INCONCLUSIVE degradation path. Trivially scoped changes MAY skip with rationale. Auto-adopted candidates are incorporated into the design before the validator runs.

**Tags:** `design`, `scout`, `leverage`, `mandatory`

#### Scenarios

**Scout phase executes for full proposals** (`rq-designOpportunityScout01.1`)

**Given:**

- A /adv-design invocation for a full proposal workflow
- Design Phase 2 (draft design) has completed

**When:** Phase 2.5 executes

**Then:**

- The orchestrator prepares schema, routing, fallback/degradation, and adoption rules
- adv-researcher is spawned with design-mode prompt and may load adv-opportunity-scout in worker context
- ≤5 candidates are returned with 8-field ScoutCandidate schema
- Candidates are sorted by payoff/risk ratio
- Auto-adopted candidates are integrated into design before validator

**Design validator remains distinct** (`rq-designOpportunityScout01.2`)

**Given:**

- Phase 2.5 (scout) has completed
- Phase 3.5 (validator) runs after

**When:** The design validation flow executes

**Then:**

- The existing design validator runs unchanged
- The validator validates the design including any scout-adopted improvements
- The scout and validator serve different purposes (opportunity vs correctness)

---

### Required Obligation Release Block

**ID:** `rq-requiredObligation01` | **Priority:** **[MUST]**

The review/harden flow MUST block release when required in-scope obligations remain unresolved. A required-critical contract item that is in-scope, has no notRequiredReason, and lacks verified completion evidence MUST prevent the release gate from completing. This is a structural safety invariant: unresolved required obligations represent unshipped work that cannot be silently released.

**Tags:** `workflow`, `release`, `required-obligation`, `safety`, `contract`

#### Scenarios

**Unresolved required-critical item blocks release** (`rq-requiredObligation01.1`)

**Given:**

- A change has a required-critical contract item in-scope
- The item has no notRequiredReason
- The contract review matrix shows the item as unverified or failed

**When:** The release gate is evaluated

**Then:**

- The release gate is NOT marked done
- A REQUIRED_OBLIGATION_UNRESOLVED blocker is surfaced
- The response identifies the specific contract item and required evidence

**Verified required-critical item allows release** (`rq-requiredObligation01.2`)

**Given:**

- A change has a required-critical contract item in-scope
- The contract review matrix shows the item as pass with evidence

**When:** The release gate is evaluated

**Then:**

- The release gate may proceed if all other conditions are met

**Not-required reason exempts item from release block** (`rq-requiredObligation01.3`)

**Given:**

- A change has a required-critical contract item
- The item has an explicit notRequiredReason set

**When:** The release gate is evaluated

**Then:**

- The item does not block release

---

### Required Obligation Explicit Routing

**ID:** `rq-requiredObligation02` | **Priority:** **[MUST]**

Out-of-scope required obligations MUST NOT be silently dropped or auto-resolved. When a required-critical contract item is classified as out-of-scope during execution or review, the workflow MUST require explicit routing: either re-enter the item into scope via adv_change_reenter with a rationale, or split the obligation into a new change with a tracking reference. Silent deferral or implicit postponement of required obligations is prohibited.

**Tags:** `workflow`, `required-obligation`, `routing`, `scope`, `split`

#### Scenarios

**Out-of-scope required item requires explicit routing** (`rq-requiredObligation02.1`)

**Given:**

- A required-critical contract item is marked out-of-scope during execution or review

**When:** The workflow evaluates release readiness

**Then:**

- The release gate is NOT marked done
- A REQUIRED_OBLIGATION_ROUTING_MISSING blocker is surfaced
- The response demands explicit re-enter or split action with rationale

**Re-enter with rationale resolves routing blocker** (`rq-requiredObligation02.2`)

**Given:**

- An out-of-scope required-critical item is re-entered via adv_change_reenter
- The re-enter rationale explains why the item is now in-scope

**When:** The release gate is re-evaluated

**Then:**

- The REQUIRED_OBLIGATION_ROUTING_MISSING blocker is cleared
- The item is treated as in-scope for release checks

**Split into new change resolves routing blocker** (`rq-requiredObligation02.3`)

**Given:**

- An out-of-scope required-critical item is split into a new tracked change
- The original change records the split reference (new change ID and rationale)

**When:** The release gate is re-evaluated

**Then:**

- The REQUIRED_OBLIGATION_ROUTING_MISSING blocker is cleared
- The original change may proceed to release
- The new change carries the required obligation forward

---

### Truthful Artifact Path Read Surfaces

**ID:** `rq-artifactPathTruth01` | **Priority:** **[MUST]**

ADV read surfaces MUST NOT expose nonexistent active artifact filesystem paths as readable source-of-truth. When artifact content lives in Temporal state.documents, tools MUST expose content via ADV read/include fields and either omit filesystem paths or mark them machine-readably non-readable/source-tagged. Legacy disk and archive-bundle fallback reads MUST remain supported.

**Tags:** `workflow`, `artifacts`, `temporal`, `read-surface`

#### Scenarios

**Temporal-only artifact content does not expose fake readable path** (`rq-artifactPathTruth01.1`)

**Given:**

- An active change has state.documents.design populated
- No active design.md file exists on disk for the change

**When:** adv_change_show is called with include.design true

**Then:**

- The response includes the design content in _design
- The response does not present artifacts.design.path as a readable existing file
- Artifact metadata is machine-readable enough to distinguish Temporal content from a materialized file

**Legacy and archive artifact fallbacks remain readable** (`rq-artifactPathTruth01.2`)

**Given:**

- Artifact content exists only as a legacy active disk artifact or a materialized archive bundle artifact

**When:** Artifact readback runs for that change

**Then:**

- The fallback content is returned
- A filesystem path is exposed only when the file is actually materialized and readable

**Recovery and archive evidence keeps verified real paths** (`rq-artifactPathTruth01.3`)

**Given:**

- A recovery or archive path intentionally writes or verifies an artifact file

**When:** Gate or archive evidence is emitted

**Then:**

- The real verified filesystem path may be included in evidence
- The behavior does not reintroduce active artifact-content disk writes as the primary source of truth

---

### Post-merge local branch cleanup for archived ADV changes

**ID:** `rq-archiveBranchCleanup01` | **Priority:** **[MUST]**

PR-mode ADV archives that survive through PR creation must be cleanable post-merge via an operator-explicit tool. Local deletion uses safe `git branch -d` semantics (refuses unmerged). The cleanup tool reuses the existing `adv_archive_repair` MCP tool surface with a new `cleanup_merged` action; it is operator-explicit (no background sweeps, no daemons, no session-start auto-cleanup per P37). Detection is squash-merge-safe via tree-SHA match (primary) with `git cherry` diff-equivalence fallback.

**Tags:** `workflow`, `archive`, `branch-cleanup`, `release-finalization`

#### Scenarios

**Squash-merge-safe detection** (`rq-archiveBranchCleanup01.1`)

**Given:**

- An archived ADV change whose `change/{id}` branch was squash-merged into the default branch

**When:** operator runs `adv_archive_repair action=cleanup_merged`

**Then:**

- The branch is detected as `tree-identical` (tree-SHA match) OR `patch-equivalent` (git cherry)
- The branch is included in cleanup candidates

**Worktree-checked-out refusal** (`rq-archiveBranchCleanup01.2`)

**Given:**

- An archived ADV change whose `change/{id}` branch is currently checked out in any active worktree

**When:** operator runs `adv_archive_repair action=cleanup_merged`

**Then:**

- The branch is excluded from deletion candidates
- The exclusion rationale cites the worktree path

**Dry-run preview** (`rq-archiveBranchCleanup01.3`)

**Given:**

- Operator wants to preview before deleting

**When:** operator runs `adv_archive_repair action=cleanup_merged dryRun=true`

**Then:**

- The tool returns the candidate list with per-branch merge proof
- Zero deletions are performed

**Status observability** (`rq-archiveBranchCleanup01.4`)

**Given:**

- At least 1 archived-change local branch is safely deletable

**When:** operator runs `adv_status view:"summary"`

**Then:**

- A recommendation line appears in `recommendations[]`
- When operator runs `adv_status view:"hygiene"`, a full `archived_branch_hygiene` section appears with per-branch detail

**Non-regression of direct-archive path** (`rq-archiveBranchCleanup01.5`)

**Given:**

- A change archived via direct-archive mode

**When:** archive finalization completes

**Then:**

- The existing branch cleanup gate at `change.ts:4436-4441` continues to delete the branch at archive time
- Direct-archive cleanup behavior is unchanged by the addition of cleanup_merged action

---

### Linked Ops Follow-Up Provenance

**ID:** `rq-opsFollowTrace01` | **Priority:** **[MUST]**

Linked ops/enabler follow-up work MUST persist structural source provenance in authoritative workflow state. A follow-up change MUST record its source change, relationship kind, originating artifact/report/agenda source, and creation timestamp. The source/parent change MUST record an outbound ops_followup_link with matching relationship, target change, and linkage timestamp. Authoritative provenance MUST live in typed workflow state and query readbacks, not in free-text agenda descriptions.

**Tags:** `workflow`, `ops-follow-up`, `provenance`, `traceability`, `state`

#### Scenarios

**Promoted required follow-up records provenance on both sides** (`rq-opsFollowTrace01.1`)

**Given:**

- A sub-agent report contains a required_critical follow-up tied to contract item C8
- The parent change has no existing ops_followup_links

**When:** adv_followup_promote creates the ops follow-up change

**Then:**

- The child change ops_followup.source records the parent change ID, source artifact ID, relationship, and created_at
- The parent change ops_followup_links[] records the child ID and the same relationship
- The provenance is structurally queryable from both sides

**Manual ops follow-up records source rationale** (`rq-opsFollowTrace01.2`)

**Given:**

- An agent creates an ops follow-up from a manual source with a parent change
- No report or agenda artifact exists

**When:** adv_followup_promote uses source kind manual

**Then:**

- The child source provenance records the parent change ID and manual rationale
- The parent link records the relationship and linked_at
- The manual rationale is preserved as typed provenance, not agenda text

**Cross-project ops link records target path** (`rq-opsFollowTrace01.3`)

**Given:**

- Parent project A creates an ops follow up in project B

**When:** Promotion writes both sides of the link

**Then:**

- The child source records the origin project and path
- The parent link records target_project_id and target_path
- Product-scoped queries resolve the cross-project target

---

### Ops Follow-Up Evidence Trail

**ID:** `rq-opsFollowEvidence01` | **Priority:** **[MUST]**

An ops follow-up change MUST support append-only light evidence entries capturing environment, action/batch, status, timestamp, summary, and next step or completion signal. The profile status MUST update with each evidence entry and support outcomes: not_started, running, partial, failed, rerun_needed, rollback_needed, cleanup_needed, and complete.

**Tags:** `workflow`, `ops-follow-up`, `evidence`, `status`, `traceability`

#### Scenarios

**Evidence append updates status** (`rq-opsFollowEvidence01.1`)

**Given:**

- An ops follow-up has status running

**When:** adv_ops_evidence_add appends a batch result with status partial and 50% progress summary

**Then:**

- The evidence[] array contains the entry with env, action, status, timestamp, and summary
- The profile status becomes partial

**Completion signal records final state** (`rq-opsFollowEvidence01.2`)

**Given:**

- An ops follow-up cleanup runs after release

**When:** The final evidence entry signals complete

**Then:**

- The profile status becomes complete
- The completion_signal field records the final signal
- The next step is omitted or marked done

**Failed/rerun evidence is captured** (`rq-opsFollowEvidence01.3`)

**Given:**

- A backfill fails due to bad input data

**When:** An evidence entry with status failed and rerun_needed rationale is appended

**Then:**

- The profile status becomes failed or rerun_needed
- The entry preserves the error summary and next step
- The evidence trail supports resumption without re-deriving state from chat

---

### Release-First Handoff and Blocking Linked Obligations

**ID:** `rq-opsFollowRelease01` | **Priority:** **[MUST]**

Parent release/archive reporting MUST surface open linked ops obligations and record explicit handoff for non-blocking release-first work. Blocking relationships (e.g. blocks, required-critical in-scope ops) MUST prevent release until complete. Non-blocking release-first relationships (e.g. follows_release, monitors, cleanup_after) MUST NOT block release once an explicit surviving-obligation handoff is recorded. Archive terminal output MUST list open ops follow-ups and their handoff status.

**Tags:** `workflow`, `ops-follow-up`, `release`, `archive`, `handoff`, `blocking`

#### Scenarios

**Blocking ops obligation prevents release** (`rq-opsFollowRelease01.1`)

**Given:**

- A parent change has an ops_followup_link with relationship blocks and status not complete

**When:** The release gate is evaluated

**Then:**

- The release gate is NOT marked done
- An OPS_FOLLOWUP_BLOCKING_UNRESOLVED blocker is surfaced with the link ID

**Non-blocking release-first allows release with handoff** (`rq-opsFollowRelease01.2`)

**Given:**

- A parent change has a follows_release link that is not complete
- An explicit surviving-obligation handoff is recorded

**When:** The release gate is evaluated

**Then:**

- Release may proceed if all other conditions are met
- The archive report lists the surviving obligation and handoff

**Archive reports open ops obligations** (`rq-opsFollowRelease01.3`)

**Given:**

- A parent change is archived with an open follows_release link

**When:** /adv-archive terminal output is emitted

**Then:**

- The output includes the open ops follow-up list
- Each entry shows relationship, status, and handoff note
- The open obligation is not silently dropped

---
