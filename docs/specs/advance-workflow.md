# Advance Workflow

> **Version:** 1.47.3
> **Updated:** 2026-08-27

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

### Approved Same-Change PRs Arm Squash Auto-Merge Immediately

**ID:** `rq-approvedPrAutoMerge01` | **Priority:** **[MUST]**

When a user explicitly grants merge authority for the current ADV change and requested end-state, ADV MUST retain that authority within the active orchestration session for matching same-change remediation PRs and MUST immediately arm GitHub squash auto-merge after each matching PR is pushed or created. Authority is bound to changeId, repository, change/<changeId> head branch, resolved default base branch, requested end-state, and active session; push-only permission, generic gate approval, and unrelated PRs do not authorize merge. ADV MUST run `gh pr merge <number> --repo <owner/repo> --squash --auto`, re-read the OPEN PR, and require `autoMergeRequest.enabledAt` before reporting auto-merge armed. After remediation it MUST push, re-read PR identity/state, re-arm, verify, and resume adv-ci-waiter. CI green is nonterminal until PR state is MERGED or canonical default-branch reachability is proven. Authority ends on revocation, stop/cancel, identity drift, unrelated scope, terminal completion, requested-end-state completion, or session restart/compaction/context loss that removes authoritative approval evidence; a new explicit merge grant is then required. Tier-B archive sign-off remains unchanged. The auto-merge command MUST NOT include `--delete-branch` or `-d`; cleanup remains post-merge. This immediate-auto-merge obligation has one exception: when the target project's `archive.pr_title_policy.format` is `conventional`, `armPullRequestAutoMerge` MUST first verify the live PR title conforms to `allowed_types` and that a semantic type is resolvable; on a non-conforming title, an unresolvable type, or a live-title lookup failure it MUST return a typed blocker (`PR_TITLE_POLICY_VIOLATION`, `PR_TITLE_TYPE_UNRESOLVED`, or `PR_TITLE_LOOKUP_FAILED`) instead of arming. All other authority, identity, `--delete-branch` prohibition, and Tier-B sign-off invariants are unchanged.

**Tags:** `workflow`, `approval`, `git`, `auto-merge`

#### Scenarios

**Explicit merge authority arms matching PR immediately** (`rq-approvedPrAutoMerge01.1`)

**Given:**
- The user explicitly authorizes merge for the current change and requested end-state
- An OPEN PR has the current repository, change/<changeId> head, and resolved default base
- The explicit approval evidence remains available in the active orchestration session

**When:** The change branch is pushed or the matching PR is created

**Then:**
- ADV immediately runs `gh pr merge <number> --repo <owner/repo> --squash --auto` without waiting for CI green or asking again
- ADV verifies the PR remains OPEN and `autoMergeRequest.enabledAt` is present
- ADV starts adv-ci-waiter and requires MERGED proof before completion

**Remediation re-arms same-change PR** (`rq-approvedPrAutoMerge01.2`)

**Given:**
- Durable merge authority remains valid
- CI failure or merge conflict requires an in-scope remediation push

**When:** The remediation branch update is pushed

**Then:**
- ADV re-reads PR number, repository, head, base, and state before mutation
- ADV arms or re-arms squash auto-merge and verifies `autoMergeRequest.enabledAt`
- ADV resumes adv-ci-waiter instead of requesting merge approval again

**Authority invalidation fails closed** (`rq-approvedPrAutoMerge01.3`)

**Given:**
- Merge authority was previously granted for a change

**When:** The user revokes authority, stops or cancels, identity drifts, scope becomes unrelated, the requested end-state completes, or session restart/compaction/context loss removes authoritative approval evidence

**Then:**
- ADV does not arm or merge the PR under stale authority
- Push-only or generic gate approval is not treated as merge authority
- A new session requires a new explicit merge grant
- Tier-B archive sign-off remains whitelist-only
- No auto-merge command uses `--delete-branch` or `-d`

**Title-policy exception blocks arming at CC targets** (`rq-approvedPrAutoMerge01.4`)

**Given:**
- The target project's archive.pr_title_policy.format is conventional
- armPullRequestAutoMerge is about to arm a same-change PR

**When:** The live PR title does not conform to allowed_types, the semantic type is unresolvable, or the live-title lookup fails

**Then:**
- armPullRequestAutoMerge returns the matching typed blocker (PR_TITLE_POLICY_VIOLATION for a non-conforming title, PR_TITLE_TYPE_UNRESOLVED for an unresolvable type, PR_TITLE_LOOKUP_FAILED for a live-title lookup failure) and does NOT arm auto-merge
- The caller maps the blocker to a blocked outcome with no shipped claim
- Authority, identity, --delete-branch prohibition, and Tier-B sign-off invariants remain unchanged

---

### Archive Finalization Requires Origin or PR Merge Proof

**ID:** `rq-releaseFinalization01` | **Priority:** **[MUST]**

Phase 9 Git Finalization must refresh the current default-branch basis before deciding local direct merge versus PR workflow. If no `origin` remote exists, `no_remote` blocks with `NO_REMOTE_RELEASE_AUTHORITY` and does not update the shared default-branch ref. If `origin` exists, release completion and archive retirement MUST require post-fetch `origin/{default-branch}` reachability or merged PR state. A local bare origin is a valid remote route and is treated as `direct`. Remote-backed push failure, skipped push, protected-branch rejection, unarmed PR, or pending auto-merge MUST NOT record `release ✓`, archive status, issue closure, branch deletion, or worktree cleanup. Protected or risky cases route to PR workflow: `Pending auto-merge.` only when GitHub auto-merge is armed and the change remains active; `Blocked.` when PR/auto-merge cannot be established. `phase9:"skip"` and release recovery must revalidate the same origin/default or merged PR proof before recording release. The operator-only `bin/adv doctor` command must detect archived-but-unmerged remote `change/*` branches and re-drive them through idempotent PR auto-merge without force-push (or surface an approval-required proposal when the safe path is blocked). For the direct (non-PR) path, Phase 9 dispatch MUST be awaited to a durable terminal state — `Shipped.` after post-fetch `origin/{default-branch}` reachability (or verified push to a local bare origin), else a recorded failed outcome with actionable recovery evidence — before archive completion is reported; direct finalization MUST NOT detach merge work behind a fire-and-forget promise, MUST NOT swallow failures, and MUST NOT add automatic retry, and interruption after dispatch MUST resume to the same durable shipped-or-failed state rather than losing merge work. Manual merge/push recovery for an affected direct archive revalidates the same origin/default or merged PR proof before recording release. Release reachability MUST distinguish an unresolvable change ref from unmerged commits: when the change ref cannot be resolved to a commit, the archive MUST block with a reason distinct from the unmerged-commit reason, and git ref-resolution failure output MUST NOT be recorded as unmerged-commit evidence. PR-mode finalization and wedged-workflow recovery are unchanged by this requirement.

**Tags:** `workflow`, `archive`, `worktree`, `git`

#### Scenarios

**No-remote archive blocks with NO_REMOTE_RELEASE_AUTHORITY** (`rq-releaseFinalization01.1`)

**Given:**
- A change branch is already on the current default-branch basis
- No `origin` remote is configured and no local bare origin exists
- No overlap-risk or PR-only policy applies

**When:** Phase 9 Git Finalization chooses an integration path

**Then:**
- The archive blocks with `NO_REMOTE_RELEASE_AUTHORITY`
- No shared default-branch ref mutation is attempted
- The shared main checkout remains untouched
- The change stays active so the user can configure a canonical origin and retry

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
- The change lacks post-fetch `origin/{default-branch}` reachability, and merged PR state

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
- Required remote push failure: archive routes to `Pending auto-merge.` or `Blocked.` without release completion; no-remote archives never succeed locally and must report `NO_REMOTE_RELEASE_AUTHORITY`
- Unverifiable release evidence: archive blocks per rq-releaseProjectionDurability01

**Phase 9 skip cannot bypass release proof** (`rq-releaseFinalization01.9`)

**Given:**
- A caller requests `adv_change_archive` with `phase9:"skip"`
- The change is remote-backed or otherwise requires origin/default or merged PR proof

**When:** Archive attempts to transition the change to archived

**Then:**
- The archive revalidates the same release proof required by normal Phase 9
- Without post-fetch `origin/{default-branch}` reachability, merged PR state, or explicit audited override evidence, the archive refuses to mark release done or archived
- The response reports `Blocked.` with the missing proof reason

**Release recovery revalidates release proof** (`rq-releaseFinalization01.10`)

**Given:**
- Release gate recovery or unavailable-projection repair is requested
- Prior projection state cannot be trusted as proof by itself

**When:** The recovery path considers recording `gateId: "release"` as done

**Then:**
- Recovery revalidates post-fetch `origin/{default-branch}` reachability, or merged PR state before recording release
- Pending auto-merge, unmerged PRs, local-only remote-backed branches, and unverifiable evidence are refused
- The recovery audit cites the proof source used

**Archived-but-unmerged detector re-drives PR auto-merge** (`rq-releaseFinalization01.11`)

**Given:**
- A remote `change/*` branch exists
- The branch is not reachable from post-fetch `origin/{default-branch}`
- The branch appears archived or otherwise stranded

**When:** The operator-only `bin/adv doctor` command scans or re-drives the branch

**Then:**
- Scan reports the archived-but-unmerged branch with release-proof diagnostics
- Re-drive opens or reuses exactly one PR for the branch and arms GitHub auto-merge when possible
- Re-drive never force-pushes and does not mark release complete until origin/default reachability or merged PR state is proven

**Direct finalization reaches durable terminal evidence** (`rq-releaseFinalization01.12`)

**Given:**
- A direct (non-PR) archive dispatches Phase 9 Git Finalization
- The change requires post-fetch `origin/{default-branch}` reachability or merged PR state before release

**When:** Phase 9 finalization runs to completion, throws, or is interrupted after dispatch and then resumes

**Then:**
- Finalization is awaited to a durable terminal state before archive completion is reported: `Shipped.` only after post-fetch `origin/{default-branch}` reachability (or verified push to a local bare origin), else a recorded failed outcome with actionable recovery evidence
- Direct merge work is not detached behind a fire-and-forget promise and finalization failures are not swallowed
- Interruption after dispatch resumes to the same durable shipped-or-failed state rather than losing merge work, with no automatic retry
- Manual merge/push recovery for an affected direct archive revalidates the same origin/default or merged PR proof before recording release
- PR-mode finalization and wedged-workflow recovery remain unchanged

---

### Auto-Drive Pending-PR Archive Completion

**ID:** `rq-releaseFinalization02` | **Priority:** **[MUST]**

When Phase 9 Git Finalization returns route “pr_auto_merge” or “merge_queue” with auto-merge armed (i.e. the archive tool would otherwise return “phase9: ‘pending_merge’”), ADV orchestrates the remaining completion rather than handing back to the human. The orchestration spawns “adv-ci-waiter”, the bounded-poll exception to P37, and waits for it to report a terminal result. `oc-ci-wait` (called by `adv-ci-waiter`) owns GitHub API polling and rate-limit backoff; the sub-agent samples `oc-ci-wait result --watch-id <id> --json` every 20–30 seconds. CI terminal statuses are `completed`, `timeout`, `cancelled`, `error`; `conclusion` is CI success/failure, NOT PR merge state. CI success alone is not sufficient for release completion. Release completion requires either (a) explicit PR merge-state evidence (`gh pr view <number> --json state,mergedAt,mergeCommit` returning `state == MERGED`) or (b) unchanged `origin/{default-branch}` reachability proof. On terminal `MERGED` (verified separately) it syncs the local default branch in place and re-runs “verifyReleaseEvidenceFromMain” (which already proves reachability through “pr_merged” proof and is branch-ref-independent via the persisted tip SHA delivered by parent change “fixPhase9SquashMergeRedetect”). The auto-drive applies only to “pr_auto_merge” and “merge_queue” routes; direct-push, no-remote, and “ff-only” paths remain unchanged. Auto-drive orchestration lives in “adv-archive.md”; the trunk-sync helper lives in “plugin/src/tools/archive-helpers/git-finalize.ts”.

**Tags:** `workflow`, `archive`, `git`

#### Scenarios

**Auto-drive triggers on pending_merge** (`rq-releaseFinalization02.1`)

**Given:**
- ADV calls “adv_change_archive phase9:“run””
- The archive tool returns “phase9: ‘pending_merge’” with the route coerced from “pr_auto_merge” or “merge_queue”

**When:** The orchestrator inspects the archive tool return

**Then:**
- ADV spawns “adv-ci-waiter” against the PR via the Task tool
- The main agent does not poll CI status itself
- ADV reads “finalization.prNumber”, “finalization.prUrl”, “finalization.mainCheckout”, “finalization.defaultBranch” from the structured return (fields are nested inside “finalization”, not top-level)

**Auto-drive completes end-to-end on merge** (`rq-releaseFinalization02.2`)

**Given:**
- The spawned waiter reports terminal “MERGED”

**When:** ADV continues the auto-drive flow

**Then:**
- ADV merges and pushes the archive from an ephemeral detached worktree; the shared main checkout is not inspected or mutated
- ADV re-calls “adv_change_archive phase9:“run”” and lets “verifyReleaseEvidenceFromMain” return “Shipped.” via the “pr_merged” proof branch-ref-independent
- No second human turn is required; the change reaches the “Shipped.” state end-to-end

**Non-pending-PR paths are untouched** (`rq-releaseFinalization02.3`)

**Given:**
- A change is archived via direct push, local bare origin push, or “ff-only” reconcile

**When:** Phase 9 Git Finalization runs

**Then:**
- The auto-drive does NOT trigger (no “pending_merge” is returned)
- The route return and ordering match the pre-existing direct/local-bare-origin/ff-only behavior
- The change continues to reach its existing terminal state synchronously

---

### No Shared Main Checkout Mutation

**ID:** `rq-releaseFinalization03` | **Priority:** **[MUST]**

ADV archive finalization MUST NOT inspect, reset, merge, or commit into the shared main checkout. All merge and push operations happen in ephemeral detached worktrees forked from the canonical remote default branch (or the local default branch when a local bare origin is used as the remote). The shared main checkout's working tree, index, and checked-out branch remain untouched. In the no-remote case, finalization blocks with `NO_REMOTE_RELEASE_AUTHORITY` and does not update any shared ref. Release completion remains gated solely by 'verifyReleaseEvidenceFromMain' and the persisted tip + origin/PR proof chain.

**Tags:** `workflow`, `archive`, `git`

#### Scenarios

**Remote direct merge leaves main checkout untouched** (`rq-releaseFinalization03.1`)

**Given:**
- A remote-backed archive finalization is running
- The change worktree is on change/{id} and shares git state with the project

**When:** ADV merges and pushes the archive

**Then:**
- The merge and push run inside an ephemeral detached worktree
- The shared main checkout is not reset, merged, or switched
- Default branch is updated only via a native push to origin

**Dirty or wrong-branch main checkout is ignored** (`rq-releaseFinalization03.2`)

**Given:**
- The shared main checkout has uncommitted changes or is on a non-default branch

**When:** ADV runs archive finalization

**Then:**
- Finalization does not inspect or checkpoint the main checkout state
- Finalization proceeds using the ephemeral worktree and remote/local proof
- The main checkout remains as the user left it

**No-remote archive blocks with NO_REMOTE_RELEASE_AUTHORITY** (`rq-releaseFinalization03.3`)

**Given:**
- No origin remote is configured and no local bare origin exists

**When:** ADV finalizes the archive

**Then:**
- Finalization returns `Blocked.` with `NO_REMOTE_RELEASE_AUTHORITY`
- The shared default branch ref is never updated
- The shared main checkout remains untouched
- The user receives a remediation to configure a canonical origin (bare repository or remote-backed origin) and retry

**Failure surfaces without mutating main checkout** (`rq-releaseFinalization03.4`)

**Given:**
- Any archive finalization step fails (merge, push, verification)

**When:** ADV handles the failure

**Then:**
- No write is made to the shared main checkout working tree or index
- The ephemeral worktree is removed on completion or failure
- The user receives a blocked status with actionable remediation

---

### Auto-Drive Non-Terminal Reporting

**ID:** `rq-releaseFinalization04` | **Priority:** **[MUST]**

When the spawned “adv-ci-waiter” returns a non-terminal outcome (timeout, blocked, red CI it cannot fix, missing credentials, ambiguous/partial report, or CI success while PR state is not yet `MERGED`), ADV MUST NOT escalate to release completion. The change MUST stay active; the terminal report MUST be “Pending auto-merge.” or “Blocked.” with the PR URL and the exact retry command. CI success alone is necessary but not sufficient; a “Shipped.” verdict requires `gh pr view <number> --json state` returning `MERGED` or unchanged `origin/{default-branch}` reachability. A false “Shipped.” contradicts the shipped-invariant bar carried by “rq-releaseFinalization01”. The retry command rendered in the report MUST match a copy-pasteable invocation that the user can run to resume the archive after fixing the upstream cause.

**Tags:** `workflow`, `archive`, `git`

#### Scenarios

**Timeout leaves change active** (`rq-releaseFinalization04.1`)

**Given:**
- Auto-drive is running
- The waiter exceeds its bounded watch budget without reaching “MERGED”

**When:** ADV must conclude the auto-drive

**Then:**
- The change stays active (status remains “draft”/“pending_merge”, archive not retired)
- The report renders “Pending auto-merge.” with the PR URL
- The render includes the exact retry command: “adv_change_archive changeId:{id} worktreePath:{worktree} phase9:“run””

**Blocked (no PR / no auth / red CI) preserves active state** (`rq-releaseFinalization04.2`)

**Given:**
- The waiter reports blocked: no PR exists, GitHub auth is missing, or red CI is reported by the waiter and remediation is the parent orchestrator's responsibility (the waiter has `edit: deny` and no bounded attempt budget)

**When:** ADV concludes the auto-drive

**Then:**
- The change stays active
- The report renders “Blocked.” with reason and remediation
- “Shipped.” is NEVER emitted as the terminal verb for this scenario

---

### Archive Success Requires Durable Release Projection

**ID:** `rq-releaseProjectionDurability01` | **Priority:** **[MUST]**

When `/adv-archive` Phase 9 finalization succeeds, archive success MUST be gated by durable release-gate projection proof. Before `adv_change_archive phase9:"run"` reports success or performs archive retirement side effects, the surviving authoritative projection used by `adv_gate_status` MUST report `gates.release.status === "done"` with Phase 9 evidence in the release completion record. If this proof cannot be established, archive MUST return a blocked/recoverable result and MUST NOT claim shipped success, close linked issues, or run terminal cleanup as a successful retirement. When the active projection is absent and a validated existing bundle survives, retry MUST re-verify structural Phase 9 evidence, commit release-gate and Phase 9 completion together against that bundle under the archive projection lock, regenerate projection-derived bundle files through the canonical archive writer while preserving the original archive timestamp, and make exact replay a no-op.

**Tags:** `workflow`, `archive`, `release`, `projection`, `durability`

#### Scenarios

**Archive success proves gate-status-equivalent release done** (`rq-releaseProjectionDurability01.1`)

**Given:**
- Phase 9 finalization returns direct shipped origin proof, local bare origin proof, or merged PR proof
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

**Terminal retry repairs the surviving archive projection** (`rq-releaseProjectionDurability01.3`)

**Given:**
- An archive bundle already exists or the change workflow has completed
- The active projection is absent and release or Phase 9 metadata is stale in the validated surviving bundle

**When:** Archive retry attempts release projection repair

**Then:**
- Direct and PR archive modes re-verify shipped default-branch or merged-PR reachability before repair
- Release-gate and Phase 9 completion are committed together against the bundle through commitChangeProjection under the archive projection lock
- Projection-derived bundle files are regenerated through the canonical archive writer without changing the original archived_at value
- An exact replay adds no projection revision and repeats no finalization or cleanup side effect
- If finalization evidence is missing or invalid, repair is rejected and release remains not done

**Shipped finalization is git-authoritative when both release-gate projections lag** (`rq-releaseProjectionDurability01.4`)

**Given:**
- A change whose Phase 9 finalization is `shipped` (git-verified default-branch reachability/merge — `finalization.status === "shipped"`, derived only from confirmed reachability, un-forgeable)
- Both the store-backed release-gate read and the disk release-gate projection lag `pending` (propagation lag)

**When:** adv_change_archive runs the durable release-gate proof

**Then:**
- The proof ACCEPTS via `shipped` (authoritative reachability)
- The archive succeeds
- The release gate is reconciled to `done`

**Non-shipped finalization keeps the strict guard when release-gate projections lag** (`rq-releaseProjectionDurability01.5`)

**Given:**
- A change whose finalization is NOT `shipped` (`pending_merge`/`blocked`/etc.)
- The release-gate projection is `pending`

**When:** adv_change_archive evaluates the durable release-gate proof

**Then:**
- The durable proof REJECTS with the existing strict guard
- Evidence-match + recovery-audit requirements remain unchanged

**Committed-but-unverified release projection fails closed** (`rq-releaseProjectionDurability01.6`)

**Given:**
- The release-gate projection commit was written
- The post-commit readback cannot verify the durable projection

**When:** Archive evaluates the commit outcome

**Then:**
- Archive returns success false with typed code RELEASE_GATE_PROJECTION_COMMITTED_UNVERIFIED citing this requirement
- The commit evidence and operator remediation are included
- The release gate is not materialized as done on the local change

---

### Archive Terminal Transition Is Requested, Proven, and Repairable

**ID:** `rq-archiveTerminalDurability01` | **Priority:** **[MUST]**

Archive MUST prove the terminal transition through the authoritative disk projection before reporting success. A verified merged replay MUST select merged proof before any tracked archive or spec writer runs. Post-merge terminal updates MUST write only the canonical external bundle, and the tracked in-repository projection MUST remain frozen after release integration. The archive bundle, release-gate completion, and projection lifecycle state MUST agree; commitChangeProjection’s in-lock readback and revision/operation-identity proof MUST be used for recovery. Missing or contradictory proof MUST fail closed with a typed blocker, and reconciliation MUST surface typed skip reasons without writing status directly.

**Tags:** `change projection`, `archive`, `terminal-state`, `durability`, `recovery`, `read-model`

#### Scenarios

**Every shipped route refreshes only the canonical bundle after release proof** (`rq-archiveTerminalDurability01.1`)

**Given:**
- A direct, no_remote, PR manual, PR auto-merge, merge-queue, merged-replay, existing-bundle retry, or archive-delta repair route has structural release proof
- The route must record terminal release, Phase 9, or archived-lifecycle facts

**When:** The route performs terminal refresh after release proof

**Then:**
- The terminal refresh accepts only the canonical external bundle path
- The tracked in-repository bundle remains byte-identical after its release commit
- No post-finalization helper accepts or reconstructs a tracked terminal-refresh target
- Canonical release-gate and archived-lifecycle refreshes remain separate, ordered writes
- Pre-release archive preparation continues to write the tracked bundle before the release commit
- Projection-derived files are regenerated through the canonical archive writer while preserving archived_at and existing spec, narrative, wisdom, and multi-repository sidecars
- A failed or unverified canonical refresh blocks retirement side effects

**Post-save proof fails closed when the change projection cannot be verified** (`rq-archiveTerminalDurability01.2`)

**Given:**
- The archive transition request has been accepted by the store
- A bounded describe of the change change projection fails, reports an unrecognized state, or the change projection is not found

**When:** The archive flow evaluates whether the transition is durably recorded

**Then:**
- Archive returns success false with typed code ARCHIVE_WORKFLOW_PROOF_FAILED or ARCHIVE_WORKFLOW_PROOF_AMBIGUOUS citing this requirement
- The not-found case is classified ambiguous because completed and retention-expired are indistinguishable
- projection lookup enumeration is never consulted as proof
- The written bundle is preserved and no rollback or deletion is attempted

**Terminal projection is durable before change projection completion** (`rq-archiveTerminalDurability01.3`)

**Given:**
- A change change projection has received mutations that produce an archived or closed terminal outcome

**When:** The change projection reaches its terminal block

**Then:**
- The terminal projection Activity is awaited and completes before the change projection completes
- Both archived and closed outcomes are covered
- In-flight executions recorded before this behavior readback through the patch-guarded legacy branch without nondeterminism errors

**No-change projection archived population repairs under full proof** (`rq-archiveTerminalDurability01.4`)

**Given:**
- An archive bundle for the change is reachable from the default branch
- The disk projection reports status archived
- The change change projection is absent, confirmed by an exact change projection-not-found describe failure

**When:** The repair path converges the change

**Then:**
- The convergence write is routed through the single mutation authority
- The terminal projection is written and subsequent list, summary, and show reads agree on terminal status
- The result carries the bundle hash and proof receipt

**Repair refuses when default-branch bundle proof is missing** (`rq-archiveTerminalDurability01.5`)

**Given:**
- A change whose archive bundle exists only in a worktree or in-repo location and is not reachable from the default branch

**When:** The repair path evaluates convergence

**Then:**
- The repair refuses with a typed refusal code and evidence
- No projection write is performed

**Reconciliation evaluates bundle evidence before the stale-disk veto** (`rq-archiveTerminalDurability01.6`)

**Given:**
- A reconciliation candidate with a merged archive bundle and a stale non-terminal disk projection

**When:** Terminal reconciliation evaluates the candidate

**Then:**
- The archive-bundle evidence is evaluated first and the stale-disk veto does not skip the candidate
- A candidate with no archive evidence is skipped with a typed reason
- Skip reasons are observable through the existing doctor and startup diagnostic surfaces
- Reconciliation converges through the existing terminal authority and never writes status directly

**Merged replay selects canonical terminal authority before tracked writers** (`rq-archiveTerminalDurability01.7`)

**Given:**
- A pending archive PR is structurally proven merged, the tracked in-repository bundle is reachable from the released commit, and the canonical bundle lacks final release facts

**When:** The same archive command replays

**Then:**
- Replay detects merged proof before archiveChange or reconcileInRepoArchive can write
- Replay records release, Phase 9, and archived lifecycle facts only in the canonical external bundle
- Replay preserves the tracked bundle and all spec files byte-for-byte

**Shared shipped completion refreshes only canonical state and makes replay write-free** (`rq-archiveTerminalDurability01.8`)

**Given:**
- Normal finalization ships or merged replay completes structural release proof and canonical terminal refresh

**When:** The shared shipped-completion seam runs

**Then:**
- Shared shipped completion refreshes only the canonical external bundle after finalization
- Shared shipped completion never writes or reconstructs a tracked terminal-refresh target
- Worktree cleanup runs once through advWorktreeDelete
- A safe refusal returns a typed retained-cleanup disposition without undoing archived status
- Exact replay is write-free and does not repeat finalization, issue closure, cleanup, or terminal refresh

---

### Archive Recovery Requires Structural Proof and Readback Consistency

**ID:** `rq-archiveRecoveryConsistency01` | **Priority:** **[MUST]**

Archive finalization recovery and status repair MUST be structural, idempotent, and read-after-write verified. A stale `phase9_status: pending_merge` MAY be finalized only when merged PR evidence or post-fetch `origin/{default-branch}` reachability proves release completion; successful recovery MUST record `phase9_status: done` before archived status is reported. A `phase9_status: failed` state without structural release proof MUST return a typed blocker classification and MUST NOT mark the change archived. Status-repair success MUST be gated by the same durable read model used by `adv_change_show` and `adv_change_list`: immediate show reads archived, in-flight lists omit the change, and archived lists include it exactly once. Target-project repair MUST mutate the target directly only when target confirmation and fresh queue/serviceability proof are present; otherwise it MUST emit an exact same-project recovery packet and fail closed without target mutation. No archive recovery path may read or write ADV external state files directly. Recovery is consolidated through the operator-only `bin/adv doctor` command, which diagnoses the release-stuck projection and applies the safe repair path; batch terminal-projection repair over all release-stuck candidates and single-change targeted status flip are internalized behind `bin/adv doctor` and gated on structural branch-merge evidence or precise change projection evidence.

**Tags:** `change projection`, `archive`, `repair`, `status`, `target-path`

#### Scenarios

**PR-merged pending_merge finalizes idempotently** (`rq-archiveRecoveryConsistency01.1`)

**Given:**
- A change has acceptance done, an archive bundle, and `phase9_status: pending_merge` with a PR number
- The PR is structurally proven merged or equivalent release proof exists

**When:** Archive finalization recovery runs

**Then:**
- Recovery uses PR merge evidence or post-fetch `origin/{default-branch}` reachability rather than title matching or branch ancestry alone
- The release gate is recorded done with Phase 9 evidence before archived status is saved
- `phase9_status` is recorded as `done` before success is reported
- Re-running the recovery remains safe and idempotent

**Failed phase9 without proof fails closed** (`rq-archiveRecoveryConsistency01.2`)

**Given:**
- A change has `phase9_status: failed`
- Merged PR and post-fetch origin/default release proof are absent or unverifiable

**When:** Archive finalization recovery runs

**Then:**
- The tool returns a typed phase9 failure classification with blocker, remediation, and details when available
- The release gate remains incomplete
- The change status is not marked archived
- Issue closure, branch deletion, and worktree cleanup do not run as successful retirement effects

**Status repair success proves read-after-write visibility** (`rq-archiveRecoveryConsistency01.3`)

**Given:**
- All seven gates are done
- The archive bundle exists
- A status repair attempts to flip a non-archived status to archived

**When:** The repair is about to report success

**Then:**
- The same durable source used by `adv_change_show` reads status `archived`
- The in-flight change list omits the repaired change
- The archived change list includes the repaired change exactly once
- If any readback check fails, the repair reports failure with source/evidence mismatch instead of success

**Target repair mutates directly or emits packet** (`rq-archiveRecoveryConsistency01.4`)

**Given:**
- Archive/status repair is requested for a target_path project

**When:** The target mutation boundary is evaluated

**Then:**
- If target confirmation and fresh target queue/serviceability proof are present, the repair uses the target project's store/read model directly
- If target serviceability is absent, stale, or failed, the source project does not mutate target state
- The response emits an exact same-project recovery packet for the operator to run from the target project
- No recovery path reads or writes ADV external state files directly

---

### Release Repair Recovery Requires Typed Audited Projection

**ID:** `rq-releaseRepairRecovery01` | **Priority:** **[MUST]**

Release-repair recovery for completed or unavailable change projections MUST be explicit, typed, audited, and invariant-preserving. Recovery MAY write only missing typed release state through commitChangeProjection when structural release evidence and a non-empty recovery reason are present. Blank, imprecise, or unverifiable evidence MUST fail closed without mutation.

**Tags:** `change projection`, `release`, `repair`, `recovery`, `audit`

#### Scenarios

**Completed or unreadable change projection recovery records typed audited state** (`rq-releaseRepairRecovery01.1`)

**Given:**
- A release-repair tool must record missing typed state for a change projection
- Normal change projection mutation fails because the change projection is completed or unreadable
- The caller provides precise completed-change projection or unavailable-projection evidence and a non-empty recovery reason

**When:** The recovery-capable release-repair tool runs in explicit recovery mode

**Then:**
- The tool writes only the missing typed release-repair state through an audited recovery writer
- The write records recovery reason, evidence, and recovery timestamp with the repaired state
- The response includes explicit recovery metadata or a reconciliation warning
- Normal active-change projection mutation and readiness behavior remains unchanged

**Generic or imprecise recovery evidence fails closed** (`rq-releaseRepairRecovery01.2`)

**Given:**
- A release-repair tool receives a generic mutation failure, blank recovery reason, blank recovery evidence, or imprecise recovery evidence
- Completed-change projection or unavailable-projection evidence has not been structurally established

**When:** The tool evaluates whether to run disk-projection recovery

**Then:**
- No disk projection mutation occurs
- The tool returns an error or propagates the original mutation failure
- The response does not report successful recovery

**Release repair recovery preserves structural blockers** (`rq-releaseRepairRecovery01.3`)

**Given:**
- A release-repair recovery path is requested
- A design-quality blocker, release-finalization proof, archive status proof, target-project trust check, or typed disposition vocabulary would be bypassed by the requested mutation

**When:** The recovery path evaluates invariants

**Then:**
- The blocker or invariant remains enforced
- The tool does not introduce accepted-debt disposition semantics
- The tool does not treat untrusted target-project mutation as approved
- Recovery records missing state only after the same structural invariant is satisfied

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
- Local deploy status is shown as ran, ran; OpenCode activation pending restart, not available, not needed, or failed with reason; every state is nonblocking
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

### Executive Summaries Serve Release-Approval Decisions

**ID:** `rq-executiveSummaryAudience01` | **Priority:** **[MUST]**

ADV executive summaries MUST be written for non-technical release-approval readers while preserving audit evidence and technical traceability. Each summary MUST include the decision essentials: outcome, delivered value or why it matters, verification, risks/follow-ups, and supporting evidence. Summary guidance MUST use evidence-only impact wording: do not fabricate user or business benefit beyond proposal, agreement, task, review, harden, archive, or follow-up evidence. Unavoidable technical terms MAY appear only as parenthetical supporting detail after the plain-English meaning. Caveman-full voice MUST NOT compress away executive-summary or release-readiness artifact substance.

**Tags:** `workflow`, `executive-summary`, `release`, `approval`, `voice`

#### Scenarios

**Summary includes release-approval decision essentials** (`rq-executiveSummaryAudience01.1`)

**Given:**
- An ADV review persists an executive summary before acceptance

**When:** The summary is composed

**Then:**
- The summary leads with non-technical release-approval context
- The summary covers outcome, value, verification, risks/follow-ups, and supporting evidence
- Technical traceability remains available as supporting evidence

**Impact wording stays evidence-only** (`rq-executiveSummaryAudience01.2`)

**Given:**
- A change has proposal, agreement, task, review, harden, archive, or follow-up evidence

**When:** The executive summary describes why the change matters

**Then:**
- User or business impact appears only when source evidence supports it
- Internal or technical impact is stated plainly when that is the supported impact
- The summary does not replace audit evidence with vague marketing prose

**Technical terms support the plain-English explanation** (`rq-executiveSummaryAudience01.3`)

**Given:**
- A summary needs a technical term for traceability

**When:** The term is included

**Then:**
- The summary first states the plain-English release meaning
- Technical terms appear as parenthetical supporting detail
- Dense implementation jargon does not lead the summary

**Caveman-full preserves summary substance** (`rq-executiveSummaryAudience01.4`)

**Given:**
- Caveman-full voice compression applies to runtime prose
- The content is executive-summary or release-readiness artifact substance

**When:** The artifact is written or displayed

**Then:**
- Caveman-full may make wording scannable
- Caveman-full must not compress away outcome, value, verification, risks/follow-ups, or supporting evidence
- Required approval consequence context remains visible

---

### Product-Linked ADV State

**ID:** `rq-productLinking01` | **Priority:** **[MUST]**

ADV MAY link separate repositories into one product state plane. Linked products MUST keep two identity planes: repo_project_id for repo-local git/spec/worktree mechanics, and product_project_id for canonical product state (changes, wisdom, reflections, status aggregation). Product topology MUST be declared in project.json via product metadata plus related_repos entries; single-repo projects without product config MUST keep existing behavior unchanged. Missing or invalid primary repo resolution MUST fail structurally unless the explicit missing_primary_policy allows read_only or isolated degradation.

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
- Product changes, wisdom, reflections, and status queries use the product state plane

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

### Terminal Aggregate Reads Degrade Structurally Instead of Timing Out

**ID:** `rq-terminalAggregateRead01` | **Priority:** **[MUST]**

ADV aggregate read surfaces that include archived or closed changes MUST use bounded per-candidate resolution and MUST return either complete terminal rows or structured degraded metadata that names failed or omitted source classes. A single slow, unreachable, missing, or corrupt terminal candidate source MUST NOT surface as an unclassified whole-tool `ToolExecutionTimeout` for the aggregate read. Degraded results MUST remain explicit and machine-readable; partial terminal reads MUST NOT masquerade as complete success.

**Tags:** `workflow`, `terminal-state`, `read-model`, `performance`, `degraded`

#### Scenarios

**Terminal list source failure returns degraded metadata** (`rq-terminalAggregateRead01.1`)

**Given:**
- A caller requests an aggregate change list that includes archived or closed changes
- One terminal candidate source is slow, unreachable, missing, or corrupt

**When:** The aggregate read resolves terminal candidates

**Then:**
- The response returns all successfully resolved rows
- The response includes structured degraded metadata naming the failed source class
- The response identifies the omitted count or bounded omission reason
- The aggregate read does not fail only as an unclassified whole-tool ToolExecutionTimeout

**Degraded terminal output is not complete success** (`rq-terminalAggregateRead01.2`)

**Given:**
- A terminal aggregate read omitted one or more candidates because a source failed

**When:** The tool response is formatted

**Then:**
- The degraded condition is visible in machine-readable output
- The response does not claim that omitted terminal data was successfully loaded
- Existing changes and pagination fields remain present for callers that ignore optional metadata

---

### Durable Terminal Projection Dominates Stale Non-Terminal Shadows

**ID:** `rq-terminalProjectionTruth01` | **Priority:** **[MUST]**

When a durable terminal projection exists for a change, terminal-aware reads MUST prefer that terminal truth over stale non-terminal change projection, memo, disk, or visibility projections. Archive bundle state MUST dominate draft, pending, or active shadows for the same canonical change ID. Terminal-aware reads MUST dedupe archive directories by the canonical `change.json.id` rather than by archive directory name.

**Tags:** `change projection`, `archive`, `terminal-state`, `read-model`, `recovery`

#### Scenarios

**Archive bundle dominates stale active projection** (`rq-terminalProjectionTruth01.1`)

**Given:**
- An archive bundle exists for a change
- Another projection source reports the same change as draft, pending, or active

**When:** A terminal-aware read resolves the change

**Then:**
- The returned change status is archived
- Default active change lists do not include the stale non-terminal shadow
- The archive bundle is treated as the durable terminal record

**Archive directories dedupe by canonical ID** (`rq-terminalProjectionTruth01.2`)

**Given:**
- An archived change bundle is stored in a directory whose name is not exactly the change ID
- The bundle's change.json has the canonical change ID

**When:** A terminal aggregate read loads archive directories

**Then:**
- Rows are deduplicated by change.json.id
- The archived change appears at most once
- The canonical change ID is preserved in the returned row

**List, summary, and show agree on terminal status** (`rq-terminalProjectionTruth01.3`)

**Given:**
- A change with an archive bundle on the default branch
- A stale draft or active disk projection for the same change

**When:** adv_change_list, its summary path, and adv_change_show each resolve the change

**Then:**
- All three surfaces report the same terminal status
- The summary path applies the same archive-bundle dominance as the list and snapshot paths
- Hydration statistics report real counts or omit measurements that do not exist; a hardcoded zero is never emitted as a measurement

---

### Active Lists Preserve Summary Fast Path

**ID:** `rq-activeListFastPath01` | **Priority:** **[MUST]**

Default active or in-flight change listing MUST preserve the summary/memo/cache fast path when row data is sufficient. Fixes for archived or closed terminal reads MUST NOT force active-only callers through full terminal reconciliation, archive bundle scans, or per-change workflow query fan-out except when a stale terminal shadow must be invalidated for correctness.

**Tags:** `workflow`, `read-model`, `performance`, `active-list`

#### Scenarios

**Default active list avoids terminal reconciliation** (`rq-activeListFastPath01.1`)

**Given:**
- A caller requests the default active or in-flight change list
- Memo or summary projection contains sufficient row data

**When:** The list is resolved

**Then:**
- The response uses summary, memo, or cache row data
- The read does not perform full terminal reconciliation for every candidate
- Archived and closed terminal rows are excluded from the active list

**Terminal fixes do not broaden status TTL scope** (`rq-activeListFastPath01.2`)

**Given:**
- A change fixes terminal aggregate read behavior

**When:** The active-list path is inspected or tested

**Then:**
- The active-list fast path remains distinct from terminal-list reconciliation
- Broader status health TTL or worktree cleanup behavior is not introduced unless it shares the terminal-list primitive

---

### Authoritative Change Reads Bound to an 8-Second Aggregate Deadline

**ID:** `rq-boundedAuthoritativeRead01` | **Priority:** **[MUST]**

Authoritative change-read surfaces (`adv_change_list`, `adv_status`) MUST resolve state inside a single request-scoped 8,000 ms aggregate deadline (`disk_READ_DEADLINE_BUDGET_MS`). The deadline context is created per request (`creatediskReadDeadline`) and threaded through source enumeration, archive pre-scan, candidate hydration, fallback classification, and disk retry/query admission; it is never shared across projects or calls. A result is complete only when every required source and candidate resolves before expiry; otherwise it is explicitly degraded and names the incomplete candidates or sources through typed metadata (`SOURCE_DEADLINE_EXCEEDED`, `hydrationStats.deadlineExceeded`, `omittedIds`), and MUST never claim completeness or let a caller infer completeness from row count or cache warmth. `safeExecute` remains outer containment (defense in depth), not the normal timeout-control mechanism; the existing `diskQueryTimeoutError`/retry machinery is extended with remaining-budget admission rather than replaced by a second timer abstraction. This requirement generalizes the terminal degradation semantics of `rq-terminalAggregateRead01` to the authoritative read path while preserving existing terminal warning codes (`TERMINAL_SOURCE_DEGRADED`, `TERMINAL_CANDIDATE_OMITTED`) and the active fast path (`rq-activeListFastPath01`) unchanged. No worker restart, unreadable-change projection mutation, or timeout-ceiling increase may be used as a read-path workaround. Deadline behavior MUST be proven with deterministic tests that use controlled timers/promises, not elapsed wall-clock timing.

**Tags:** `change projection`, `read-model`, `performance`, `degraded`, `deadline`

#### Scenarios

**Slow candidate or source degrades explicitly within the aggregate deadline** (`rq-boundedAuthoritativeRead01.1`)

**Given:**
- adv_change_list or adv_status is resolving authoritative change state
- One or more candidate change projections or sources exceed the internal read budget

**When:** The aggregate 8-second internal deadline is reached

**Then:**
- The read returns within the 8-second aggregate deadline
- The response carries typed degraded metadata (SOURCE_DEADLINE_EXCEEDED, hydrationStats.deadlineExceeded) naming the incomplete candidates or sources via omittedIds
- The result never claims completeness
- The read does not fail only as an unclassified whole-tool ToolExecutionTimeout

**Fully-resolved reads stay complete and preserve the fast path** (`rq-boundedAuthoritativeRead01.2`)

**Given:**
- All required sources and candidates resolve within the aggregate deadline

**When:** adv_change_list or adv_status runs

**Then:**
- The read returns a complete result preserving existing authoritative state
- The active summary/memo fast path (rq-activeListFastPath01) is preserved
- No deadline degradation metadata is emitted

**safeExecute is containment and deadline tests are deterministic** (`rq-boundedAuthoritativeRead01.3`)

**Given:**
- The bounded read path and its tests are implemented

**When:** Timeout behavior is exercised

**Then:**
- safeExecute remains outer containment, not the normal timeout-control path
- No worker restart, unreadable-change projection mutation, or timeout-ceiling increase is used as a read-path workaround
- Deadline tests use controlled timers/promises and assert typed results rather than elapsed wall-clock timing

---

### Archive and projection lookup Read Sources Are Bounded and Attributed

**ID:** `rq-readSourceAttribution01` | **Priority:** **[MUST]**

Archive and projection lookup candidate sources MUST be included in the aggregate deadline and source-classification design (`rq-boundedAuthoritativeRead01`). projection lookup enumeration, active-disk enumeration, archive enumeration, archive-bundle pre-scan, candidate hydration, and fallback reads MUST check the shared deadline before admission and after completion. When a source is slow, fails, or reaches the deadline, the result MUST identify that source in typed degraded evidence and MUST stop further unbounded source work. The archive-inventory x candidate scan MUST be bounded with per-iteration admission checks; no unbounded archive-inventory x candidate scan is allowed. Terminal-resolution source degradation MUST be emitted as typed provenance regardless of query kind: an active or in-flight enumeration whose terminal-resolution inspection degrades MUST still return its rows AND surface the degradation, rather than suppressing the warning because terminal statuses were not requested. Terminal-only candidate-omission warnings and terminal hydration statistics remain terminal-only.

**Tags:** `change projection`, `read-model`, `archive`, `visibility`, `degraded`, `provenance`

#### Scenarios

**Slow or failed projection lookup/Archive source is named in degraded evidence** (`rq-readSourceAttribution01.1`)

**Given:**
- Archive inventory or projection lookup pagination contributes candidates to an authoritative read

**When:** That source is slow, fails, or reaches the aggregate deadline

**Then:**
- The result identifies the source in typed degraded evidence (SOURCE_DEADLINE_EXCEEDED with omittedIds)
- Further unbounded source work stops
- Successfully resolved rows are still returned

**Archive inventory x candidate scan is bounded** (`rq-readSourceAttribution01.2`)

**Given:**
- An authoritative read must reconcile archive inventory against candidates

**When:** The archive-bundle pre-scan and archive-inventory x candidate scan run

**Then:**
- Each iteration performs a deadline admission check
- The scan is bounded and records omissionReason 'deadline' on expiry
- No unbounded archive-inventory x candidate scan is performed

**Terminal-resolution degradation is surfaced on non-terminal queries** (`rq-readSourceAttribution01.3`)

**Given:**
- A caller requests active or in-flight changes only
- Terminal-resolution inspection degrades for one or more requested IDs

**When:** The enumeration result is produced

**Then:**
- The projected rows are still returned
- Typed terminal-resolution degradation provenance is emitted even though terminal statuses were not requested
- The degradation is not converted into an error or an empty result

---

### Summary Status Bounds Deep Hydration and Reuses Request-Local Documents

**ID:** `rq-summaryReadBound01` | **Priority:** **[MUST]**

`adv_status` with `view: "summary"` MUST apply the existing `STATUS_SUMMARY_RECENT_LIMIT` bound before non-required deep hydration, artifact reads, or recent-change enrichment, truncating the tail with typed bounded degradation (`SOURCE_BOUND_EXCEEDED`, `hydrationStats.boundedOmitted`, `omittedIds`) rather than paying full hydration cost. The bound is applied in the shared resolver (`listResolvedChanges` candidateLimit) with memo-recency ordering so the bounded recent set stays meaningful; complete summary counts/recency semantics are preserved when data resolves within the bound, and otherwise the result publishes explicit degradation instead of inaccurate totals. Changes already hydrated during the request MUST be reused for recent-change, proposal-derived, product-scope, and fast-follow context via a request-local resolved-document map that is transport-only and stripped before serialization; the request MUST NOT issue a duplicate per-change disk read or `readArtifact` call for an already-resolved row. This requirement governs change-resolution ordering and complements the provider-group planning of `rq-statusSummaryLazy01` (advance-meta); full views retain their explicit behavior but share the aggregate deadline.

**Tags:** `status`, `read-model`, `performance`, `degraded`

#### Scenarios

**Summary applies the recent-limit bound before deep hydration** (`rq-summaryReadBound01.1`)

**Given:**
- adv_status is called with view: "summary"

**When:** Status resolution starts

**Then:**
- The STATUS_SUMMARY_RECENT_LIMIT bound is applied before non-required deep hydration, artifact reads, or recent-change enrichment
- The truncated tail is reported as typed bounded degradation (SOURCE_BOUND_EXCEEDED, hydrationStats.boundedOmitted, omittedIds)
- A bound-truncated result never looks complete

**Already-hydrated changes are not re-read** (`rq-summaryReadBound01.2`)

**Given:**
- A change was hydrated for the status request

**When:** Recent-change, proposal-derived, product-scope, or fast-follow context renders

**Then:**
- The request reuses the hydrated document/projection from the request-local resolved map
- No duplicate per-change disk read or readArtifact call is issued for the already-resolved row
- A regression test verifies the call count

**Complete summary semantics preserved within the bound** (`rq-summaryReadBound01.3`)

**Given:**
- Summary-relevant data resolves within the applied bound

**When:** The summary projection is built

**Then:**
- Counts and recency remain complete and accurate
- The request-local resolved map is transport-only and stripped before serialization
- When a bounded source cannot establish complete semantics, explicit degradation is published instead of inaccurate totals

---

### List and Status Read Cache Is Advisory, Never the Authoritative Truth Source

**ID:** `rq-readCacheAdvisory01` | **Priority:** **[MUST]**

Change/task/gate state MUST remain authoritative for `adv_change_list` and `adv_status`; TTL cache data MUST NOT become the primary list/status truth source for lifecycle, gate, or task state. The memo/summary fast path (`rq-activeListFastPath01`) serves only rows that were resolved authoritatively for the request or remain valid projections; warm memo/summary rows MAY still be served after deadline expiry, but the result MUST then be marked degraded and never complete. Completeness MUST never be inferred from cache warmth or row count. This requirement scopes the change-read cache and is distinct from the bounded health-probe cache of `rq-statusProbeCache01` (advance-meta), which governs diagnostic probes only.

**Tags:** `workflow`, `read-model`, `cache`, `authoritative`

#### Scenarios

**TTL cache is not the primary list/status truth source** (`rq-readCacheAdvisory01.1`)

**Given:**
- adv_change_list or adv_status resolves lifecycle, gate, or task state

**When:** A TTL or memo cache holds candidate row data

**Then:**
- The cache does not become the primary list/status truth source for lifecycle, gate, or task state
- Authoritative change/task/gate state remains the source of truth
- Completeness is not inferred from cache warmth

**Warm fast-path rows served after expiry stay degraded** (`rq-readCacheAdvisory01.2`)

**Given:**
- The aggregate deadline expired while warm memo/summary fast-path rows are available

**When:** The read returns

**Then:**
- Warm memo/summary rows may still be served
- The result is marked degraded, never complete
- Completeness is not inferred from row count or cache warmth

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

### Capability-Warrant Validation and Reproduction-Finding Classification

**ID:** `rq-acWarrant01` | **Priority:** **[MUST]**

Acceptance and success criteria that presume a capability surface exists (a tool, a tool argument, or a spec requirement) MUST declare a typed warrant tag `[warrant: <ref>]` in the approved agreement, where ref is `tool:<name>`, `tool:<name>#<arg>`, or `spec:<rq-id>`. At contract mint, every declared warrant is verified against the live tool surface and known spec ids; an unresolved warrant fails the mint with CONTRACT_UNRESOLVED_WARRANT. Verification authority is structural — declared warrants are checked against the assembled tool registry and specs, never inferred heuristically from prose. During discovery, every reproduction-sourced finding MUST be classified as broken_capability, unwarranted_operation, or unverified; findings classified unwarranted_operation or unverified MUST NOT seed a criterion asserting the capability must work. Behavioral criteria that presume no capability surface require no warrant (proportionality). This moves the catch for unwarranted criteria from the late design validator to an early structural gate.

**Tags:** `workflow`, `contract`, `discovery`, `warrant`, `correctness`

#### Scenarios

**Mint fails on a warrant naming a nonexistent surface** (`rq-acWarrant01.1`)

**Given:**
- An approved agreement declares a criterion with [warrant: tool:adv_change_archive#target_path]
- adv_change_archive has no target_path argument in the live tool surface

**When:** adv_contract_mint mints the contract

**Then:**
- The mint fails fast with CONTRACT_UNRESOLVED_WARRANT naming the unresolved ref
- No contract is persisted

**Mint succeeds and records a warrant that resolves** (`rq-acWarrant01.2`)

**Given:**
- An approved agreement declares a criterion with [warrant: cli:bin/adv-doctor#target_path]
- `bin/adv doctor` exposes an equivalent target-project routing flag

**When:** adv_contract_mint mints the contract

**Then:**
- The mint succeeds
- The contract item records the declared warrant ref
- The persisted item text has the [warrant: ...] tag stripped

**Behavioral criteria need no warrant** (`rq-acWarrant01.3`)

**Given:**
- An approved agreement contains only behavioral criteria with no [warrant: ...] tags

**When:** adv_contract_mint mints the contract

**Then:**
- The mint succeeds unchanged
- No warrant ceremony is imposed on the behavioral criteria

**Discovery classifies reproduction findings and blocks unwarranted seeding** (`rq-acWarrant01.4`)

**Given:**
- Discovery surfaces a reproduction-sourced finding that the user attempted an operation which is not architecturally warranted

**When:** The finding is processed during discovery

**Then:**
- The finding is classified as unwarranted_operation or unverified
- It MUST NOT seed an acceptance criterion asserting the capability must work
- It is downgraded to an out-of-scope note or recorded rationale instead

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

Every /adv-* command that emits a user-facing gate-transition message MUST use the Gate Handoff Voice spine: Problem / Chosen direction / Delivered, followed by a blockquote wayfinder block. The blockquote MUST contain three rows: bolded `**{change-id}**`, the gate transition `{gate} ✓ → {next-gate}`, and an arrow-prefixed runnable command `→ `/adv-{next-command} {change-id}``. The command shown MUST be the single manifest-registered command needed to continue the next gate transition, taken from the current actionable phase-plan / directive. It MUST NOT be inferred, guessed, or substituted from prose. If no actionable command is available (blocked, recovery, approval, terminal, or missing command), the arrow-prefixed row MUST be omitted and the blockquote MUST show a blocked/recovery/approval status line. If a user reaches ADV with the retired `/adv-accept` wording, returned guidance MUST correct `/adv-accept` to `/adv-review` and MUST NOT register `/adv-accept` as a command or alias. Canonical source: docs/command-voice-standard.md § Gate Handoff Voice.

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
- The archive terminal variant uses a single-line blockquote `> **{change-id}** · release ✓ ·` followed by a terminal verb for final states (Shipped. when `origin/{default-branch}` reachability, merged PR proof, or verified local bare origin push exists); non-final remote-backed states use `release pending` / `release blocked` with `Pending auto-merge.` or `Blocked.` and leave the change active
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
- The archive terminal variant ends with a single-line blockquote using `release ✓` only for final states (`Shipped.`); Pending auto-merge. and Blocked. use `release pending` or `release blocked` and no separate labeled block
- Optional reply instructions for human checkpoints (Inline Approval Voice) appear as plain prose below the blockquote, not inside it

**Blockquote wayfinder shows only the needed command** (`rq-handoffVoice01.5`)

**Given:**
- An /adv-* command completes a gate and emits a user-facing gate-transition message

**When:** The blockquote wayfinder block is inspected

**Then:**
- Exactly one runnable command is shown in the wayfinder block (in the arrow-prefixed row)
- No redundant alternative command lines appear
- The command shown is the single next action needed to continue

**Shared wayfinder command is registered for the transition** (`rq-handoffVoice01.6`)

**Given:**
- An /adv-* command emits a user-facing gate-transition message through the shared wayfinder

**When:** The arrow-prefixed command row is inspected

**Then:**
- The command equals the current actionable phase-plan / directive command for the next gate
- The command is the manifest-registered primary command for that gate transition
- If no actionable command is available, the arrow-prefixed row is omitted and the blockquote shows a blocked/recovery/approval status line

**Retired /adv-accept wording is corrected to /adv-review without alias** (`rq-handoffVoice01.7`)

**Given:**
- A user reaches ADV with the retired /adv-accept wording

**When:** Guidance is returned

**Then:**
- The returned guidance names /adv-review as the canonical acceptance route
- No /adv-accept command, alias, or runnable route is emitted or registered

---

### Major Decision Rationale Placement

**ID:** `rq-decisionRationale01` | **Priority:** **[MUST]**

When an ADV command emits a major user-facing decision, it MUST include exactly one bounded Decision rationale block inside `## Chosen direction`. The block MUST contain chosen direction, why it fits, alternatives rejected/deferred, and re-evaluation trigger fields. The block is not a fourth spine heading, MUST NOT appear after `## Delivered`, and MUST NOT appear inside the blockquote wayfinder. Routine handoff spine structure from rq-handoffVoice01 remains unchanged.

**Tags:** `voice`, `decision-rationale`, `handoff`

#### Scenarios

**Major decision rationale nests in Chosen direction** (`rq-decisionRationale01.1`)

**Given:**
- An ADV command emits a major user-facing decision

**When:** The handoff is rendered

**Then:**
- Exactly one Decision rationale block appears inside `## Chosen direction`
- The block includes chosen direction, why it fits, alternatives rejected/deferred, and re-evaluation trigger fields
- No `## Decision rationale` top-level heading is emitted
- The blockquote wayfinder remains the only content after `## Delivered`

---

### Routine Decisions Omit Rationale

**ID:** `rq-decisionRationale02` | **Priority:** **[MUST]**

Routine decisions MUST NOT emit a Decision rationale block or rationale boilerplate. Decision classification MUST default to `routine`; therefore existing routine gate handoffs remain terse and byte-identical-or-shorter unless another approved change explicitly modifies them.

**Tags:** `voice`, `decision-rationale`, `routine-output`

#### Scenarios

**Routine output has no rationale block** (`rq-decisionRationale02.1`)

**Given:**
- A routine ADV decision or gate handoff is rendered

**When:** The output is inspected

**Then:**
- No Decision rationale block appears
- No rationale boilerplate is emitted
- The output remains terse under the existing Gate Handoff Voice contract

---

### Structural Major Decision Classification

**ID:** `rq-decisionRationale03` | **Priority:** **[MUST]**

Decision classification MUST default to `routine`. A decision may be classified as `major` only when an explicit major-decision allowlist entry applies, or when all ADR-sparingly rubric criteria are true: hard to reverse, surprising without context, and result of a real tradeoff. The allowlist MUST live in docs/command-voice-standard.md and be mirrored by this spec so command authors do not rely on free-form heuristic authority.

**Tags:** `voice`, `decision-rationale`, `classification`

#### Scenarios

**Unknown decision kind remains routine** (`rq-decisionRationale03.1`)

**Given:**
- A decision kind is not explicitly allowlisted

**When:** The ADR-sparingly rubric does not have all three criteria true

**Then:**
- The decision is classified as `routine`
- No rationale block is emitted

**Allowlist or rubric may classify major** (`rq-decisionRationale03.2`)

**Given:**
- A decision kind is allowlisted or all three ADR-sparingly rubric criteria are true

**When:** The decision is emitted to the user

**Then:**
- The decision may be classified as `major`
- The rationale block rules apply

---

### Decision Rationale Source Markers and Trigger Kinds

**ID:** `rq-decisionRationale04` | **Priority:** **[MUST]**

Each Decision rationale field MUST include a compact source marker such as `[source: spec:rq-handoffVoice01]`, `[source: agreement:AC1]`, `[source: contract:AC1]`, `[source: docs/command-voice-standard.md#gate-handoff-voice]`, or `[source: adr:0003]`. The re-evaluation trigger field MUST include `trigger_kind: date`, `trigger_kind: metric`, `trigger_kind: event`, or `trigger_kind: state` with a concrete condition. Source markers are citation metadata and MUST NOT be interpreted as capability warrant tags.

**Tags:** `voice`, `decision-rationale`, `source-marker`

#### Scenarios

**Source markers and trigger kinds are required** (`rq-decisionRationale04.1`)

**Given:**
- A Decision rationale block is rendered

**When:** The block is validated

**Then:**
- Every field has a `[source: ...]` marker
- The re-evaluation trigger names one trigger kind: date, metric, event, or state
- A missing source marker or trigger kind fails deterministic validation

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

ADV tools that support cross-project coordination must use explicit `target_path` routing, persist structured cross_project_links and advisory external_dependencies on changes, require explicit confirmation before mutating untrusted target projects, and present dependency status as summary by default with drilldown available on request. `adv_change_create` with `target_path` is a target mutation: it must route creation through the target project's disk-backed store, seed `cross_project_origin` before change projection start, avoid synchronous target change projection `getState` queries from the source process, and fail without leaving active disk-only target state when target change projection start fails. Active disk-only target records must be recoverable through the normal list/read reseed path; archived and closed records must not be recreated. External dependencies are advisory warnings only and must not block gates or archive by default.

**Tags:** `change projection`, `cross-project`, `target-path`, `advisory-dependencies`, `safety`

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

**Cross-project create starts target change projection state** (`rq-crossProjectCoordination01.5`)

**Given:**
- adv_change_create is called with target_path for another ADV project
- The target mutation is trusted or explicitly confirmed

**When:** The target change is created

**Then:**
- Creation is routed through the target project's disk-backed store or equivalent change projection-start path
- cross_project_origin is seeded before target change projection start
- The source process does not issue a target change projection getState query after creation
- If target change projection start fails, the tool returns an error and does not leave a new active disk-only target change

**Active disk-only target changes reconcile through list/read** (`rq-crossProjectCoordination01.6`)

**Given:**
- A target project has non-terminal change.json records whose change projections are missing
- The target project also has archived or closed disk records

**When:** A disk-backed change read or list loads target project changes

**Then:**
- Each non-terminal disk-only change is reseeded into change projection state through the normal read/list path
- Archived and closed disk records are returned only as terminal projections when requested and are not recreated as active change projections
- No startup scanner or one-off repair path is required

**Target mutation readiness accepts fresh server pollers** (`rq-targetMutationReadiness01`)

**Given:**
- A authoritative target_path mutation is evaluated
- The current process has no registered worker for the target project queue
- disk mutation-path inspection reports a fresh change projection poller for the target project queue

**When:** The target mutation readiness check runs

**Then:**
- The readiness check treats the target queue as serviceable using the shared queue serviceability model
- The mutation proceeds to the disk-backed target store path
- The mutation does not fail solely because the current process has no local worker object

**Unproven target mutation readiness fails closed** (`rq-targetMutationReadiness02`)

**Given:**
- A authoritative target_path mutation is evaluated
- The current process has no registered worker for the target project queue
- disk mutation-path inspection is stale, absent, unavailable, or otherwise not serviceable

**When:** The target mutation readiness check runs

**Then:**
- The tool fails before constructing or mutating target project state
- The failure reports the target queue name, serviceability status, confidence, and typed serviceability blockers
- The failure includes an actionable recovery instruction for opening or restarting the target project ADV worker

**Registered-but-failed local queue does not short-circuit readiness** (`rq-targetMutationReadiness04`)

**Given:**
- A authoritative target_path mutation is evaluated
- Per-queue local worker diagnostics show the target queue registered but failed (not alive)

**When:** The target mutation readiness check runs

**Then:**
- Raw registration lists and aggregate worker aliveness do not admit the mutation; only per-queue diagnostics are local admission evidence
- The failed local queue falls through to the bounded fresh server-poller probe before any fail-closed decision
- A fresh server poller may admit the mutation as conservative server-confidence evidence without being reported as local worker liveness

**Status and mutation readiness share serviceability semantics** (`rq-targetMutationReadiness03`)

**Given:**
- ADV status or diagnostics report a target project queue as serviceable from fresh server poller evidence

**When:** A authoritative target_path mutation checks the same queue with a fresh mutation-boundary probe

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

### Target Disk-Snapshot Reads Are Non-Authoritative

**ID:** `rq-targetReadAuthority01` | **Priority:** **[MUST]**

ADV tools that read another project via target_path in snapshot-ok mode MUST treat returned disk-snapshot data as non-authoritative and degraded. Snapshot-ok reads MUST NOT mutate target state. Any downstream mutation requiring authoritative target state MUST route through the target project’s authoritative disk-projection mutation path; authoritative and snapshot modes MUST remain distinct.

**Tags:** `change projection`, `cross-project`, `target-path`, `state-authority`, `snapshot-ok`

#### Scenarios

**Snapshot-ok reads mark target context as non-authoritative** (`rq-targetReadAuthority01.1`)

**Given:**
- A snapshot-ok tool such as adv_change_show, adv_change_list, adv_status, adv_task_show, adv_task_list, or adv_task_ready is called with target_path

**When:** The tool returns data from the target project

**Then:**
- The response marks the target context as non-authoritative/degraded
- The caller does not treat the snapshot as authoritative change projection state

**Snapshot-ok reads do not mutate target runtime state** (`rq-targetReadAuthority01.2`)

**Given:**
- A snapshot-ok target_path read is executed

**When:** The tool runs

**Then:**
- The tool does not start, restart, register, or reclaim a target project worker
- The tool does not mutate target project change projections
- The tool does not write target project ADV state

**Authoritative target mutation requires authoritative path** (`rq-targetReadAuthority01.3`)

**Given:**
- A caller has read a target project via a snapshot-ok tool and now wants to mutate target change projection state

**When:** The mutation is evaluated

**Then:**
- The mutation must use an authoritative target_path tool
- The mutation runs through the target project's disk-backed store
- The snapshot-ok read result is not used as the authoritative state for the mutation

---

### Task Mutations Route Through Target Project Store

**ID:** `rq-crossProjectTaskMutation01` | **Priority:** **[MUST]**

Task mutation tools that support task creation, cancellation, status updates, or TDD reclassification must accept explicit `target_path` routing when operating on another ADV-enabled project. The target store must own every task lookup, gate check, relational validation, disk mutation, cache refresh, and context snapshot for that call. Real mutations of untrusted target projects require explicit confirmation evidence; dry-run previews may read target state without mutation confirmation because they must not write target state.

**Tags:** `change projection`, `cross-project`, `target-path`, `tasks`, `mutation-safety`

#### Scenarios

**Task add uses target store end to end** (`rq-crossProjectTaskMutation01.1`)

**Given:**
- adv_task_add is called with target_path for a target ADV project

**When:** The tool validates and creates the task

**Then:**
- Planning-gate checks use the target project state
- blockedBy validation uses target project task ids
- taskAddedMutation is sent to the target project change change projection
- The returned context snapshot describes the target project change

**Task cancel and TDD reclassify use target store end to end** (`rq-crossProjectTaskMutation01.2`)

**Given:**
- adv_task_cancel or adv_task_reclassify_tdd is called with target_path

**When:** The tool validates task ids and applies the mutation

**Then:**
- Task lookup and change lookup use the target project store
- The disk mutation is sent to the target project change change projection
- Cache refresh invalidates the target project cache, not the source project cache

**Target dry-run task mutation is read-only** (`rq-crossProjectTaskMutation01.3`)

**Given:**
- A task mutation tool supports dryRun and is called with target_path

**When:** dryRun is true

**Then:**
- The tool may read target state to validate the preview
- The tool must not fire task mutation mutations or write target state
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

ADV mutation tools that expose `dryRun` must execute schema and relational validation, return the normal success response shape with `dryRun: true`, and skip every side effect. Dry-run calls must not fire disk mutations, save ADV state, delete worktrees, run worktree deletion hooks, write conformance audit entries, or write files. Validation failures must remain identical to real-run failures except for the absence of side effects.

**Tags:** `change projection`, `dry-run`, `mutation-safety`, `preview`

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
- No disk mutation mutation is fired
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

ADV must not ship a direct non-LLM cross-project tool-execution CLI unless it can use a stable OpenCode tool execution API or an equivalent structural runtime path that preserves plugin initialization, disk service-layer access, target project resolution, validation, and audit semantics. When no stable path exists, the implementation outcome must be documented as blocked/deferred with evidence instead of duplicating the ADV runtime or bypassing trust gates.

**Tags:** `change projection`, `cli`, `cross-project`, `tool-execution`, `runtime-safety`

#### Scenarios

**Stable runtime path is required before CLI execution ships** (`rq-nonLlmToolExec01.1`)

**Given:**
- A change proposes a non-LLM CLI that executes ADV tools across projects

**When:** The design evaluates implementation feasibility

**Then:**
- The design identifies a stable OpenCode or equivalent structural tool execution path
- The path preserves ADV plugin initialization, disk access, validation, and audit semantics
- If no such path exists, the CLI execution behavior is not shipped

**Blocked non-LLM execution is documented, not bypassed** (`rq-nonLlmToolExec01.2`)

**Given:**
- No stable non-LLM ADV tool execution path is available

**When:** The change resolves the requirement

**Then:**
- The blocker and evidence are documented in the investigation notes or linked issue
- ADV does not duplicate STSL, disk change projection access, or store lifecycle in an ad-hoc CLI
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

### Archive State Transition Must Be Resilient to Failed Disk Bundle Write

**ID:** `rq-archiveOrdering01` | **Priority:** **[MUST]**

adv_change_archive MUST be idempotent when retrying after a previous failure where the disk bundle was written but the disk status transition failed. On retry, if the archive bundle already exists on disk and the change status is not 'archived', the disk write MUST be skipped and the flow proceeds directly to the status transition. This prevents double-writing the bundle and allows recovery from transient disk failures.

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
- store.changes.save(change) throws a disk Change projectionUpdateFailedError with a nested cause

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

### Change lifecycle state is separate from gates and compatibility status

**ID:** `rq-changeLifecycleState01` | **Priority:** **[MUST]**

Change change projection state MUST persist lifecycleState as the canonical terminal/open lifecycle value: open, archived, or closed. The stored ChangeStatus enum's lifecycle-reachable set is draft, archived, and closed; pending and active are NOT lifecycle-reachable for change change projections and are removed from the stored enum, surviving only as legacy disk values that MUST normalize to lifecycleState open on read/projection. Archived and closed normalize to their matching lifecycle states. AdvChangeStatus is compatibility/read-model metadata and MUST NOT be the open-claim authority; the sole open-claim authority is AdvLifecycleState = "open" AND ExecutionStatus = "Running". Change.status MUST NOT mirror the current gate and MUST NOT be the authority for open-change, claim, worktree-owner, or terminal filtering. Gate progress remains represented by the seven gate records and current-gate projection fields.

**Tags:** `change projection`, `lifecycle`, `visibility`

#### Scenarios

**Legacy and stored open statuses normalize to open lifecycle** (`rq-changeLifecycleState01.1`)

**Given:**
- A change change projection or local projection has the stored open status draft or a legacy status pending or active (removed from the stored enum)

**When:** The change is read or projected into projection fields

**Then:**
- lifecycleState is open
- The current gate remains represented by gates and AdvCurrentGate
- Open-change authority does not depend on AdvChangeStatus

**Terminal lifecycle excludes open reads** (`rq-changeLifecycleState01.2`)

**Given:**
- A change change projection has lifecycleState archived or closed

**When:** Default open-change, claim, status, or worktree-owner reads run

**Then:**
- The change is excluded from open results
- A stale AdvChangeStatus value cannot make the change appear open
- ExecutionStatus = "Running" or an equivalent terminal guard protects projection lookup reads from stale completed change projection attributes

**Stored ChangeStatus reachable set excludes pending and active** (`rq-changeLifecycleState01.3`)

**Given:**
- The ChangeStatusSchema stored enum for change change projections

**When:** A change change projection status is assigned, read, or validated

**Then:**
- The only lifecycle-reachable stored statuses are draft, archived, and closed
- pending and active are not assignable stored statuses; they exist only as legacy disk values that normalize to draft/open on load
- The open-claim authority is AdvLifecycleState = "open" AND ExecutionStatus = "Running", never AdvChangeStatus

---

### 7-gate lifecycle is orthogonal to backlog coordination

**ID:** `rq-aw-backlog01` | **Priority:** **[MUST]**

Backlog coordination state (claims, projection fields, snapshot freshness) is updated as a side effect of normal change change projection mutations. The 7-gate lifecycle (proposal/discovery/design/planning/execution/acceptance/release) and its semantics are unaffected by backlog-coordination changes (rq-backlogCoord01..07). Gate transitions emit projection field upserts via buildChangeProjectionFields; AdvBacklogIssueNumber participates in those upserts when state.origin.issue_number is set, but no gate logic depends on it.

**Tags:** `backlog-coordination`, `gates`

#### Scenarios

**Gate transitions emit projection field upserts including AdvBacklogIssueNumber when origin set** (`rq-aw-backlog01.1`)

**Given:**
- A change change projection with state.origin = { kind: roadmap, issue_number: 42 } progressing through gates

**When:** Any gate completes (proposal, discovery, design, planning, execution, acceptance, release)

**Then:**
- The change projection upserts projection fields via buildChangeProjectionFields
- AdvBacklogIssueNumber remains populated with [42]
- AdvCurrentGate reflects the newly completed gate semantics
- Gate completion semantics are unchanged from baseline (rq-gatemodel01)

**Changes without origin.issue_number do not emit AdvBacklogIssueNumber** (`rq-aw-backlog01.2`)

**Given:**
- A change change projection with state.origin undefined OR state.origin.issue_number undefined

**When:** Any gate completes

**Then:**
- AdvBacklogIssueNumber is NOT present in the projection fields upsert payload
- Other gate-related projection fields (AdvCurrentGate, AdvChangeStatus, etc.) populate normally

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
- An ADV tool receives a blank required content field such as task content, wisdom content, run-test command, or worktree branch

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

### Change projection-Level Gate Artifact Enforcement

**ID:** `rq-gateArtifactEnforcement01` | **Priority:** **[MUST]**

The disk change change projection MUST enforce required artifact preconditions before marking artifact-backed gates done. Proposal, discovery, design, and acceptance gate completion MUST be blocked when the required evidence is missing, unreadable, blank, stale, not change projection-visible, or below deterministic minimum-content rules, unless an explicit compatibility rationale is recorded for readback or migration safety. Required gate evidence MUST be durable before gate completion and MUST NOT be satisfied by caller-provided metadata or post-approval late writes. Artifact checks MUST use activities or tool/storage boundaries, never direct filesystem I/O in change projection code.

**Tags:** `change projection`, `gates`, `artifacts`, `disk`

#### Scenarios

**Missing artifact blocks artifact-backed gate** (`rq-gateArtifactEnforcement01.1`)

**Given:**
- An artifact-backed gate completion mutation is handled by the change change projection

**When:** The gate's required artifact is missing or unreadable

**Then:**
- The change projection does not mark the gate done
- The gate remains pending or records a structured blocker
- The blocker identifies the gate and missing artifact kind

**Blank or undersized artifact blocks completion** (`rq-gateArtifactEnforcement01.2`)

**Given:**
- A required gate artifact exists

**When:** The artifact is blank, whitespace-only, or below deterministic minimum-content rules

**Then:**
- The change projection refuses gate completion
- The refusal is deterministic and does not depend on LLM quality scoring

**Valid required artifact permits completion** (`rq-gateArtifactEnforcement01.3`)

**Given:**
- All prior gates are done
- The required artifact exists and passes deterministic checks

**When:** gateCompletedMutation is handled for the artifact-backed gate

**Then:**
- The change projection may mark the gate done
- Artifact evidence is available for audit when configured

**Compatibility requires explicit rationale** (`rq-gateArtifactEnforcement01.4`)

**Given:**
- A readback or migration fixture cannot provide the required artifact evidence

**When:** Compatibility completion is allowed

**Then:**
- The completion records an explicit compatibility rationale
- Silent legacy bypasses are not accepted for new gate completions

**Post-approval late artifact write does not satisfy gate proof** (`rq-gateArtifactEnforcement01.5`)

**Given:**
- A user has approved an artifact-backed gate checkpoint
- A required proof artifact was not durably persisted and change projection-visible before the approval prompt

**When:** Gate completion is evaluated

**Then:**
- The change projection refuses completion or records a deterministic stuck blocker
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
- change.documents.executiveSummary is required acceptance proof

**When:** The workflow validates acceptance readiness

**Then:**
- The workflow requires executive-summary artifact metadata with a content hash
- The current artifact hash must match workflow-visible metadata
- Missing or stale metadata blocks acceptance

---

### Acceptance Projection from Typed Contract Review State

**ID:** `rq-acceptanceProjection01` | **Priority:** **[MUST]**

Acceptance gate completion MUST use typed contract, review matrix state, change.documents.acceptance, and workflow-visible change.documents.executiveSummary evidence as the source of truth for acceptance proof. For new contract-era changes, the workflow MUST persist a durable change.documents.acceptance projection from ChangeContract items and the contract review matrix before marking acceptance done. Manually edited markdown must not be treated as the authoritative acceptance proof.

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
- The workflow persists change.documents.acceptance through an activity or storage boundary
- The workflow records acceptance artifact evidence
- The acceptance gate may be marked done

**Executive summary evidence blocks acceptance when absent or stale** (`rq-acceptanceProjection01.4`)

**Given:**
- A new contract-era change reaches acceptance gate completion
- The contract and review matrix pass

**When:** change.documents.executiveSummary is missing, unreadable, undersized, lacks workflow-visible metadata, or its content hash is stale

**Then:**
- The workflow refuses acceptance completion
- The blocker identifies executive-summary evidence as missing or stale
- Chat approval alone does not mark acceptance done

---

### Acceptance Proof Exists Before Approval Prompt

**ID:** `rq-acceptanceEvidenceTiming01` | **Priority:** **[MUST]**

/adv-review MUST persist and verify all required acceptance proof before presenting the acceptance approval prompt. Required proof includes contract.reviewMatrix, generated or generatable change.documents.acceptance from typed contract state, and workflow-visible change.documents.executiveSummary evidence. If any required proof cannot be persisted, verified, or made workflow-visible, /adv-review MUST stop before asking for acceptance and the acceptance gate MUST remain pending or stuck with deterministic blockers. This is the no-late-homework rule: evidence required to justify acceptance cannot be submitted only after user approval.

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

Completed-change projection or unavailable-projection acceptance recovery MUST be machine-classified and audited internally. Recovery MAY repair disk projection for contract.reviewMatrix, executive-summary metadata, and acceptance gate completion only when structured completed/unreadable evidence is obtained by ADV, prior user acceptance approval evidence exists, and deterministic readiness validation passes against typed contract state and required artifacts. Callers MUST NOT transcribe machine errors through recoveryMode, recoveryEvidence, or recoveryReason. Silent recovery, chat-history reconstruction, inferred human approval, caller-forged metadata, and manual ADV state-file edits are unsupported.

**Tags:** `change projection`, `acceptance`, `recovery`, `audit`

#### Scenarios

**Machine-classified recovery repairs terminal acceptance evidence** (`rq-acceptanceRecovery01.1`)

**Given:**
- A change change projection is completed or unreadable
- Acceptance proof was produced but could not be fully persisted through disk
- Prior user acceptance approval evidence is durable

**When:** ADV obtains structured completed or unreadable evidence and deterministic readiness passes

**Then:**
- The disk projection may be converged with internal audit metadata
- The caller does not supply recoveryMode, recoveryEvidence, or recoveryReason
- The response records that change projection history was not rewritten

**Missing approval or machine evidence blocks recovery** (`rq-acceptanceRecovery01.2`)

**Given:**
- An acceptance recovery mutation is considered

**When:** Structured completed/unreadable evidence, prior user approval evidence, or deterministic readiness proof is missing

**Then:**
- No disk projection repair occurs
- A typed blocker identifies the missing authority
- Machine evidence never fabricates human approval

**Reachable disagreement is not overwritten** (`rq-acceptanceRecovery01.3`)

**Given:**
- The change projection is reachable and its acceptance state disagrees with disk

**When:** Automatic recovery evaluates the state

**Then:**
- Disk does not replace reachable change projection authority
- A typed operator-required conflict is returned

---

### Front-End Acceptance Preview URL

**ID:** `rq-acceptancePreviewUrl01` | **Priority:** **[MUST]**

/adv-discover MUST capture preview applicability for each change as visual_surface: true, false, or unknown with rationale and preview_expectation fields for exact route, data-state expectation, viewport expectation, and rationale. /adv-review MUST surface a Preview URL line before the acceptance Inline Approval prompt. For changes with visual_surface true or implementation evidence of front-end, browser-visible, or visual-output work, the Preview URL line MUST include a user-facing dev-environment URL and preview proof for the exact route/path and affected state/data source the user will open. Preview proof MUST include verification method, result/status, hydration/readiness signal or fallback rationale, reviewed timestamp/context, and viewport context; runnable visual surfaces MUST include a 375px width viewport check or documented project equivalent unless unavailable with rationale. Preview URLs MUST target visual output only, MUST be sanitized before durable recording, and MUST NOT point at internal services, dashboards, databases, admin panels, CI systems, Temporal UI, or other non-visual infrastructure. A bare unverified URL MUST NOT satisfy acceptance proof. URL-source evidence such as agent-observed dev-server output, CI/deploy URL assignment, or user-confirmed URL may establish where a URL came from, but is insufficient by itself for visual preview proof; browser-open evidence or equivalent reviewed visual-surface evidence is required for the intended visual surface when runnable. Fixture/mock URLs or seeded sample states MUST be explicitly labeled as fixture/mock evidence and MUST NOT be presented as user-facing live preview proof unless the approved agreement allows that state. Stale/cache/error-page evidence MUST NOT pass acceptance; /adv-review MUST require fresh-session, cache-busted, or equivalent freshness context when stale, cached, or error-page state is suspected. Agents MUST NOT perform arbitrary HTTP probing of untrusted URLs to satisfy this requirement. Missing URL, missing exact route proof, missing hydration/readiness evidence, missing required viewport evidence, unknown applicability, visual-surface drift, fixture/mock evidence presented as live, stale/cache/error-page proof, or missing matrix evidence MUST block acceptance before user sign-off. Non-visual changes MAY use Preview URL: not_applicable with rationale. Durable preview proof MUST be represented through contract review evidence and included in acceptance or executive-summary evidence; generated acceptance.md remains projection-only and MUST NOT be hand-edited as authoritative proof. Archived preview URLs are point-in-time evidence and MUST include verification context rather than being treated as maintained current URLs.

**Tags:** `workflow`, `acceptance`, `preview-url`, `front-end`

#### Scenarios

**Discovery records preview applicability** (`rq-acceptancePreviewUrl01.1`)

**Given:**
- A change is being finalized through /adv-discover

**When:** The agreement is drafted and persisted

**Then:**
- The agreement records visual_surface as true, false, or unknown
- The agreement records rationale for the preview applicability value
- The agreement records preview_expectation fields for exact_route_required, data_state_expectation, viewport_expectation, and rationale
- visual_surface unknown is carried forward as an acceptance blocker until clarified

**Applicable visual work shows exact-route preview before acceptance** (`rq-acceptancePreviewUrl01.2`)

**Given:**
- A change has visual_surface true or implementation evidence of front-end, browser-visible, or visual-output work

**When:** /adv-review presents the acceptance summary before the Inline Approval prompt

**Then:**
- The summary includes Preview URL: {url}
- The summary includes exact route/path and affected state/data source for the preview the user will open
- The summary includes verification method, result, hydration/readiness evidence or fallback rationale, reviewed timestamp or equivalent context, and viewport context including 375px width or documented project equivalent when runnable
- Fixture/mock preview evidence is explicitly labeled and is not presented as user-facing live proof unless allowed by the agreement
- The contract review evidence records the preview proof

**Missing applicable preview blocks acceptance** (`rq-acceptancePreviewUrl01.3`)

**Given:**
- A change requires preview proof because visual_surface is true or visual-output work is detected

**When:** No dev-environment URL, exact route proof, hydration/readiness evidence, required viewport evidence, or freshness evidence is available

**Then:**
- /adv-review reports Preview URL: blocked with a concrete reason and remediation hint
- The acceptance checkpoint is not presented
- The acceptance gate remains pending

**URL-source-only and stale evidence do not satisfy visual proof** (`rq-acceptancePreviewUrl01.6`)

**Given:**
- A change requires preview proof because visual_surface is true or visual-output work is detected

**When:** Only URL-source evidence, fixture/mock evidence presented as live, or stale/cache/error-page evidence is available

**Then:**
- /adv-review reports Preview URL: blocked with a concrete reason
- The acceptance checkpoint is not presented
- The contract review evidence does not mark visual preview proof as passing

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

**When:** /adv-design writes change.documents.design

**Then:**
- change.documents.design may include a Design-Derived Criteria section for technical budgets and constraints
- change.documents.design does not add new user-facing acceptance criteria as if they were approved agreement items
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

Workflow enforcement MUST NOT require change.documents.proposal to contain testable success criteria. Proposal `## User Outcomes` are alignment inputs. Criteria-presence enforcement for full changes MUST anchor to discovery's change.documents.agreement artifact and the minted ChangeContract. Planning, execution, acceptance, and release MUST continue to use the approved ChangeContract review matrix and evidence policies without reading proposal-level success criteria as contract law.

**Tags:** `workflow`, `criteria`, `proposal`, `discovery`, `contract`

#### Scenarios

**Proposal without success criteria reaches planning** (`rq-stageCriteriaEnforcementRetarget01.1`)

**Given:**
- change.documents.proposal contains `## User Outcomes` and no proposal-level `## Success Criteria` section

**When:** The change reaches planning-gate readiness checks

**Then:**
- No clarify-readiness finding fires solely because proposal success criteria are absent
- The planning gate is not blocked on that basis
- Criteria checks use change.documents.agreement and the ChangeContract instead

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

ADV read surfaces MUST NOT expose nonexistent active artifact filesystem paths as readable source-of-truth. When artifact content lives in disk state.documents, tools MUST expose content via ADV read/include fields and either omit filesystem paths or mark them machine-readably non-readable/source-tagged. Artifact readback MUST consult the durable disk projection's `documents` map before concluding content is absent, using the precedence disk change projection Query, then projection `documents`, then legacy disk artifact, then archive bundle; the projection tier MUST NOT be consulted before the change projection Query. Every resolved artifact read MUST carry a machine-readable source tag identifying which tier served it, so a caller cannot infer change projection queryability from the presence of content. A local projection read MUST remain reachable even when the request-scoped disk aggregate read deadline is already exhausted. Legacy disk and archive-bundle fallback reads MUST remain supported.

**Tags:** `change projection`, `artifacts`, `disk`, `read-surface`

#### Scenarios

**disk-only artifact content does not expose fake readable path** (`rq-artifactPathTruth01.1`)

**Given:**
- An active change has change.documents.design populated
- The design is not materialized as an active-directory .md file for the change

**When:** adv_change_show is called with include.design true

**Then:**
- The response includes the design content in _design
- The response does not present artifacts.design.path as a readable existing file
- Artifact metadata is machine-readable enough to distinguish disk content from a materialized file

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

**Projection documents serve artifact reads when the change projection is unreachable** (`rq-artifactPathTruth01.4`)

**Given:**
- An active change has its artifact content persisted to the disk projection documents map
- The change change projection is RUNNING on a mutation path with no live poller because its originating session ended
- The request-scoped disk aggregate read deadline is already exhausted

**When:** Artifact readback runs for that change

**Then:**
- The artifact content is returned from the projection documents map
- The response does not report the artifact as unreadable or absent
- No filesystem path is exposed for the projection-sourced content
- The exhausted disk deadline does not prevent the local projection tier from running

**Artifact reads declare provenance** (`rq-artifactPathTruth01.5`)

**Given:**
- Artifact content is returned from any read tier

**When:** The read surface emits the result

**Then:**
- The result carries a machine-readable source tag distinguishing authoritative live change projection reads from projection, legacy-disk, and archive-bundle fallbacks
- A caller cannot infer change projection queryability from the presence of content alone

---

### Post-merge local branch cleanup for archived ADV changes

**ID:** `rq-archiveBranchCleanup01` | **Priority:** **[MUST]**

PR-mode ADV archives that survive through PR creation must be cleanable post-merge via an operator-explicit tool. Local deletion uses safe `git branch -d` semantics (refuses unmerged). The cleanup tool is the `archived_branches` mode of the `adv_worktree_cleanup` MCP tool; merged-branch cleanup is git-branch hygiene, not ADV recovery state, so it does not live on archive recovery tools. It is operator-explicit (no background sweeps, no daemons, no session-start auto-cleanup per P37). Detection is squash-merge-safe via tree-SHA match (primary) with `git cherry` diff-equivalence fallback.

**Tags:** `workflow`, `archive`, `branch-cleanup`, `release-finalization`

#### Scenarios

**Squash-merge-safe detection** (`rq-archiveBranchCleanup01.1`)

**Given:**
- An archived ADV change whose `change/{id}` branch was squash-merged into the default branch

**When:** operator runs `adv_worktree_cleanup mode=archived_branches`

**Then:**
- The branch is detected as `tree-identical` (tree-SHA match) OR `patch-equivalent` (git cherry)
- The branch is included in cleanup candidates

**Worktree-checked-out refusal** (`rq-archiveBranchCleanup01.2`)

**Given:**
- An archived ADV change whose `change/{id}` branch is currently checked out in any active worktree

**When:** operator runs `adv_worktree_cleanup mode=archived_branches`

**Then:**
- The branch is excluded from deletion candidates
- The exclusion rationale cites the worktree path

**Dry-run preview** (`rq-archiveBranchCleanup01.3`)

**Given:**
- Operator wants to preview before deleting

**When:** operator runs `adv_worktree_cleanup mode=archived_branches dryRun=true`

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
- The existing direct-mode branch cleanup gate (`archiveMode === "direct"`) continues to delete the branch at archive time
- Direct-archive cleanup behavior is unchanged by moving merged-branch cleanup to `adv_worktree_cleanup mode=archived_branches`

---

### Linked Ops Follow-Up Provenance

**ID:** `rq-opsFollowTrace01` | **Priority:** **[MUST]**

Linked ops/enabler follow-up work MUST persist structural source provenance in authoritative workflow state. A follow-up change MUST record its source change, relationship kind, originating artifact/report source, and creation timestamp. The source/parent change MUST record an outbound ops_followup_link with matching relationship, target change, and linkage timestamp. Authoritative provenance MUST live in typed workflow state and query readbacks, not in free-text descriptions. Legacy agenda-sourced records remain parseable but no new agenda provenance is accepted.

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
- No report artifact exists

**When:** adv_followup_promote uses source kind manual

**Then:**
- The child source provenance records the parent change ID and manual rationale
- The parent link records the relationship and linked_at
- The manual rationale is preserved as typed provenance, not free text

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

### Runbook-Shaped Production Ops State

**ID:** `rq-opsRunbook01` | **Priority:** **[MUST]**

Production-impacting ops work represented in ADV MUST have durable runbook-shaped state under the owning ops_followup profile before execution authority is granted. The runbook state MUST include environment, action, explicit bounds, approval policy, evidence policy, rollback or cleanup plan, and current run status. Agents MUST be able to resume from typed workflow state rather than chat history, while legacy ops_followup profiles and evidence remain readable.

**Tags:** `workflow`, `ops-follow-up`, `ops-runbook`, `state`, `production`

#### Scenarios

**Runbook presents execution-critical fields** (`rq-opsRunbook01.1`)

**Given:**
- A production-impacting ops run is planned for an ops_followup change

**When:** The run is presented for execution

**Then:**
- ADV shows the target environment, action, explicit bounds, approval policy, evidence policy, and rollback or cleanup plan
- The run state is stored in typed workflow state under the ops_followup profile
- Execution authority does not depend on chat transcript memory

**Runbook state supports resume** (`rq-opsRunbook01.2`)

**Given:**
- An ops run has been planned and partially executed
- The agent session is interrupted

**When:** A later session reads the ADV change state

**Then:**
- The run status, next required action, evidence policy, approval policy, and rollback or cleanup plan are queryable from ADV state
- The agent does not need the original chat transcript to resume safely

**Legacy profiles remain readable** (`rq-opsRunbook01.3`)

**Given:**
- An existing ops_followup profile has only legacy evidence fields

**When:** ADV reads or renders the profile after ops runbook support is added

**Then:**
- The profile remains readable with no data loss
- Missing runbook fields are rendered as absent or legacy-only state, not as malformed data

---

### Production Ops Approval Authority

**ID:** `rq-opsRunApproval01` | **Priority:** **[MUST]**

Production-impacting execute steps MUST be structurally classified before completion authority is granted. Unclassified production-impacting execution defaults to approval-required. A bounded low-risk autonomous classification is valid only when it cites an allowlist or rationale and explicit bounds. Approval-required steps MUST carry matching approval evidence before execution completion can be recorded.

**Tags:** `workflow`, `ops-follow-up`, `ops-runbook`, `approval`, `production-safety`

#### Scenarios

**Unclassified prod execution requires approval** (`rq-opsRunApproval01.1`)

**Given:**
- An ops run contains a production-impacting execute step
- The step has no bounded low-risk autonomous classification

**When:** An agent attempts to record the step as complete without matching approval evidence

**Then:**
- ADV rejects or blocks completion authority for that execute step
- The run remains in a non-complete state
- The blocker states that production-impacting execution requires explicit approval

**Low-risk autonomous classification is bounded** (`rq-opsRunApproval01.2`)

**Given:**
- An ops run marks a production-impacting step as bounded low-risk autonomous

**When:** The classification is inspected or persisted

**Then:**
- It includes an allowlist or rationale
- It includes explicit bounds such as environment, scope, command/action, batch limit, or rollback-safe limit
- The classification is typed state, not free-text-only permission

**Approval evidence authorizes required step** (`rq-opsRunApproval01.3`)

**Given:**
- An ops run execute step is approval-required

**When:** Matching approval evidence is recorded before execution completion

**Then:**
- ADV can record the step outcome if other evidence requirements pass
- The approval evidence is queryable from run state
- The approval does not authorize unrelated steps outside the recorded bounds

---

### Secret-Safe Ops Run Evidence Ledger

**ID:** `rq-opsRunEvidence01` | **Priority:** **[MUST]**

Ops run evidence MUST be append-only, bounded, and secret-safe. Evidence entries for run status changes MUST record step kind, environment, run or batch identifier, status, bounded summary, secret-safe artifact pointer or explicit no-artifact rationale, timestamp, and next state. Completion evidence MUST include completion signal, health verification, and rollback or cleanup disposition. Evidence that contains credentials or raw sensitive production logs MUST be rejected, redacted, or represented only by safe pointers and summaries.

**Tags:** `workflow`, `ops-follow-up`, `ops-runbook`, `evidence`, `secret-safety`

#### Scenarios

**Status-changing evidence records required fields** (`rq-opsRunEvidence01.1`)

**Given:**
- An ops run step changes run status

**When:** Evidence is appended

**Then:**
- The evidence records step kind, environment, run or batch identifier, status, timestamp, and next state
- The evidence records a bounded summary
- The evidence records a secret-safe artifact pointer or explicit no-artifact rationale

**Sensitive values are not persisted** (`rq-opsRunEvidence01.2`)

**Given:**
- Evidence input contains credentials or raw sensitive production logs

**When:** The evidence append is validated

**Then:**
- ADV rejects the input, redacts the sensitive value, or stores only a bounded safe pointer
- Persisted ops evidence contains no secret values or raw sensitive logs
- The rejection or redaction outcome is visible to the caller

**Completion requires operational proof** (`rq-opsRunEvidence01.3`)

**Given:**
- An ops run is being marked complete

**When:** Readiness or completion authority is evaluated

**Then:**
- Evidence includes a completion signal
- Evidence includes health verification
- Evidence includes rollback or cleanup disposition

---

### Verified Ops Child State Release Authority

**ID:** `rq-opsRunReleaseReadiness01` | **Priority:** **[MUST]**

Acceptance, release, archive, and approval consequence context MUST derive linked ops obligation status from child/source-of-truth state or a fresh verified reconciliation proof. A stale parent ops_followup_link status alone MUST NOT authorize release or archive. Unreachable child state MUST be rendered as warning or blocker according to relationship and required-handoff semantics, never as N/A.

**Tags:** `workflow`, `ops-follow-up`, `ops-runbook`, `release`, `archive`, `readiness`

#### Scenarios

**Stale parent status is not release authority** (`rq-opsRunReleaseReadiness01.1`)

**Given:**
- A parent change has an ops_followup_link with status complete
- The linked child ops_followup source-of-truth state is incomplete or lacks required completion evidence

**When:** Release readiness is evaluated

**Then:**
- The stale parent status alone does not authorize release
- The readiness result follows child state or fresh verified reconciliation
- A blocking or required-handoff obligation remains unresolved when child proof is incomplete

**Unreachable blocking child blocks release** (`rq-opsRunReleaseReadiness01.2`)

**Given:**
- A parent change has a blocking or required-handoff ops link
- The linked child state cannot be read or verified

**When:** Release or archive readiness is evaluated

**Then:**
- ADV emits an unverified ops follow-up blocker
- The gate is not completed from stale parent data
- The user-facing report identifies the unreachable child as warning or blocker, not N/A

**Readbacks render verified obligations** (`rq-opsRunReleaseReadiness01.3`)

**Given:**
- A parent change has linked ops obligations

**When:** Acceptance, archive, WIP, status, or compact readback context renders linked ops state

**Then:**
- The rendered status comes from child/source-of-truth state or a fresh reconciliation proof
- Open non-blocking obligations are listed with handoff context
- Missing or unreadable harden/ops evidence is explicit and is not rendered as N/A

---

### Approval Consequence Context at Final HITL Checkpoints

**ID:** `rq-approvalConsequenceContext01` | **Priority:** **[MUST]**

Acceptance and archive/complete HITL approval surfaces MUST render a bounded, source-backed Approval Consequence Context before asking for user approval. The context MUST use one shared category vocabulary in stable order: delivered value, enabling-only/follow-up dependency, ops readiness, migration/data impact, frontend/preview impact, collision/release risk, open follow-ups, and next action. Each category MUST show a status with a source/evidence pointer, or a brief N/A rationale when genuinely not applicable. Missing or unreadable evidence MUST NOT be rendered as N/A. The surface MUST NOT add new checkpoints, second confirmations, raw logs, diffs, task spam, or full scanner reports.

**Tags:** `workflow`, `approval`, `acceptance`, `archive`, `harden`, `context`, `hitl`

#### Scenarios

**Acceptance prompt shows consequence context** (`rq-approvalConsequenceContext01.1`)

**Given:**
- A change has completed execution and /adv-review is preparing the acceptance checkpoint

**When:** The acceptance approval prompt is emitted

**Then:**
- The prompt includes Approval Consequence Context before the user is asked to accept
- All eight approved categories are present in stable order
- Each category shows source-backed status or a brief N/A rationale
- Release-readiness categories that harden owns may be marked pending harden rather than guessed

**Archive sign-off shows harden and release consequences** (`rq-approvalConsequenceContext01.2`)

**Given:**
- A change has completed acceptance and /adv-archive is preparing Tier B archive sign-off

**When:** The archive sign-off report is emitted

**Then:**
- The report includes Approval Consequence Context before the Tier B sign-off instructions
- Harden-owned readiness answers are shown from durable harden/release evidence when available
- Collision/release-risk and next-action categories reflect archive preflight and release finalization state
- Tier B whitelist-only parsing and no-LLM fallback remain unchanged

**Missing evidence is explicit, not N/A** (`rq-approvalConsequenceContext01.3`)

**Given:**
- Archive-time consequence rendering cannot read required harden readiness evidence

**When:** The ops, migration/data, frontend/preview, or collision/release-risk category is rendered

**Then:**
- The category is not rendered as N/A
- The category is rendered as unavailable, warning, or blocked with a remediation hint
- The user is not asked to infer missing readiness from absent rows

**Context is bounded and non-verbose** (`rq-approvalConsequenceContext01.4`)

**Given:**
- Task, scanner, review, harden, or archive evidence contains long logs, diffs, or report bodies

**When:** Approval Consequence Context is rendered

**Then:**
- The context contains bounded summary rows and evidence pointers only
- Raw logs, diffs, task spam, and full scanner reports are omitted
- The approval prompt remains concise and scannable

---

### Harden Readiness Evidence Carries Forward to Archive Sign-Off

**ID:** `rq-hardenReadinessCarryForward01` | **Priority:** **[MUST]**

/adv-harden MUST synthesize release/deploy/production/docs/cleanup readiness into durable or workflow-visible evidence that /adv-archive can read after resume. The carried-forward evidence MUST be sufficient to populate Approval Consequence Context categories for ops readiness, migration/data impact, frontend/preview impact when relevant, collision/release risk, open follow-ups, and next action without relying on prior chat history. If the evidence cannot be read at archive time, /adv-archive MUST surface explicit unavailable/blocked/warning status instead of N/A for categories that require harden evidence.

**Tags:** `workflow`, `harden`, `archive`, `release-readiness`, `evidence`

#### Scenarios

**Harden emits compact release-readiness summary** (`rq-hardenReadinessCarryForward01.1`)

**Given:**
- /adv-harden checks deployment, production, documentation, cleanup, and release readiness dimensions

**When:** Harden emits its final summary or persisted report evidence

**Then:**
- A compact readiness summary is available for archive-time readback
- The summary contains evidence pointers rather than raw scanner dumps
- The summary identifies blockers, warnings, and N/A categories distinctly

**Archive reads harden evidence after resume** (`rq-hardenReadinessCarryForward01.2`)

**Given:**
- A session resumes after harden completed and before archive sign-off

**When:** /adv-archive builds Approval Consequence Context

**Then:**
- Archive uses durable or workflow-visible harden evidence instead of chat history
- Archive can render release-readiness categories without rerunning harden when evidence is present
- Missing harden evidence is surfaced explicitly with remediation

---

### Single Renderer Owns Approval Consequence Vocabulary

**ID:** `rq-approvalConsequenceRenderer01` | **Priority:** **[MUST]**

Approval Consequence Context category vocabulary, category order, status values, N/A handling, missing-evidence handling, and output bounds MUST be owned by a single programmatic renderer/model rather than duplicated independently across acceptance, harden, archive, and executive-summary prose. Tests MUST fail if the required categories, bounded rendering, source-backed evidence rule, missing-evidence rule, or Tier A/Tier B approval invariants are removed or contradicted.

**Tags:** `workflow`, `approval`, `renderer`, `structural`, `tests`

#### Scenarios

**Renderer owns stable category vocabulary** (`rq-approvalConsequenceRenderer01.1`)

**Given:**
- Approval Consequence Context is rendered for acceptance, archive sign-off, or executive summary

**When:** The rendering code is invoked

**Then:**
- The same eight category identifiers and order are used
- Statuses come from a typed finite vocabulary
- Empty categories render a brief N/A rationale
- Missing required evidence does not render as N/A

**Tests anchor approval context behavior** (`rq-approvalConsequenceRenderer01.2`)

**Given:**
- A future change removes a required category, weakens source-backed evidence, adds verbose raw dumps, or changes approval parsing semantics

**When:** The relevant unit or asset tests run

**Then:**
- At least one test fails
- The failure points to the approval consequence context or checkpoint invariant
- The behavior is not governed by prose-only instructions

---

### Large Non-Code Deliverables Use Tracked ADV Workflow

**ID:** `rq-nonCodeWorkflow01` | **Priority:** **[MUST]**

Large non-code deliverables such as market research, design improvement, competitive research, writing, analysis, and planning MUST route to a tracked ADV change after any optional pre-change research clarifies direction, unless the user explicitly scopes the work as one-off/read-only. /adv-improve remains a read-only pre-proposal research-pack command: it may create docs/*-prep.md evidence packs consumed by proposal/discovery, but it MUST NOT replace the tracked workflow for consequential deliverables or mutate ADV change/task/gate state.

**Tags:** `workflow`, `non-code`, `routing`, `adv-improve`, `deliverables`

#### Scenarios

**Large non-code deliverable becomes tracked change** (`rq-nonCodeWorkflow01.1`)

**Given:**
- A user asks ADV for a consequential market research, design improvement, competitive research, writing, analysis, or planning deliverable

**When:** The agent classifies the requested work after any needed clarification

**Then:**
- The work is routed to a tracked ADV change with proposal, discovery, design, prep, execution, acceptance, and release gates
- The agent does not deliver the consequential work solely as ad hoc chat or a utility report
- The change agreement defines acceptance criteria and evidence expectations for the non-code deliverable

**Explicit one-off read-only work may stay untracked** (`rq-nonCodeWorkflow01.2`)

**Given:**
- A user explicitly asks for a one-off or read-only summary, scan, or analysis

**When:** The requested output is not a consequential durable deliverable

**Then:**
- The agent may complete the read-only work without creating ADV change/task/gate state
- If durable implementation or acceptance criteria emerge, the agent routes the follow-up through a tracked ADV change

**adv-improve remains a pre-proposal research pack** (`rq-nonCodeWorkflow01.3`)

**Given:**
- /adv-improve produces a docs/*-prep.md research pack

**When:** The pack identifies a significant improvement or direction

**Then:**
- The pack is cited by /adv-proposal or /adv-discover as prior research
- /adv-improve does not create changes, tasks, gates, spec deltas, or agenda items
- The pack does not replace tracked acceptance evidence for the resulting deliverable

---

### Structural Design-Quality Enforcement at Acceptance and Release

**ID:** `rq-designQualityEvidence01` | **Priority:** **[MUST]**

Design-quality concerns raised by adv-designer reports MUST be enforced structurally, not by reviewer prose. A sandbox-safe gate-readiness evaluator MUST read persisted adv-designer reports from change state and block the acceptance and release gates while the latest designer report for any task carries an undispositioned design_dimensions concern or neighboring_recommendation. A concern clears only when (a) a later all-pass designer report supersedes it, or (b) a typed disposition (fixed, rejected_with_evidence, split, or fast_follow) is recorded via the designConcernDispositioned signal path (adv_design_concern_disposition). On report submission, each concern and neighboring recommendation MUST also surface an advisory design_concern_promoted consumer warning with an attempt-stable dedupe key; this consumer warning is ADVISORY routing only and MUST NOT be the gate authority. No accepted_debt terminal state exists anywhere in specs, contract, commands, or agents. Review and harden ownership remains with adv-reviewer, and adv-designer remains apply-phase only.

**Tags:** `workflow`, `review`, `acceptance`, `release`, `frontend`, `design-proof`, `adv-designer`, `structural`

#### Scenarios

**Unresolved designer concern structurally blocks acceptance and release** (`rq-designQualityEvidence01.1`)

**Given:**
- A task's latest adv-designer report contains a design_dimensions concern
- No typed disposition exists for that concern

**When:** Gate readiness is evaluated for acceptance or release

**Then:**
- The gate-readiness evaluator emits a DESIGN_CONCERN_UNRESOLVED blocker
- The gate is blocked by code, not by reviewer judgment
- The evaluator reads only change state (sandbox-safe; no storage access)

**Concerns and neighboring recommendations are advisably promoted, never silently dropped** (`rq-designQualityEvidence01.2`)

**Given:**
- An adv-designer report includes a design_dimensions concern or a neighboring_recommendation

**When:** The report is submitted

**Then:**
- Each concern/recommendation surfaces an advisory design_concern_promoted consumer warning with an attempt-stable dedupe key
- Re-submission at a higher attempt does not duplicate the warning
- The consumer warning is advisory and is not the gate authority

**Typed disposition clears the block; no accepted_debt state** (`rq-designQualityEvidence01.3`)

**Given:**
- An unresolved design concern blocks acceptance

**When:** A disposition is recorded via adv_design_concern_disposition (fixed, rejected_with_evidence, split, or fast_follow), or a later all-pass designer report supersedes the concern

**Then:**
- The DESIGN_CONCERN_UNRESOLVED blocker is cleared
- No accepted_debt terminal state is used
- The disposition carries non-blank typed evidence

**Runnable visual surface evidence is bounded** (`rq-designQualityEvidence01.4`)

**Given:**
- A frontend change has a runnable visual surface or preview

**When:** /adv-review evaluates design-quality proof

**Then:**
- Browser/design evidence includes viewport context
- A missing runnable surface records an explicit fallback rationale
- Advance does not add Storybook as a plugin dependency to satisfy proof

---

### Structural Verification-Evidence Enforcement at Acceptance and Release

**ID:** `rq-verificationEvidence01` | **Priority:** **[MUST]**

Verification-evidence warnings surfaced on typed worker reports MUST be enforced structurally at acceptance and release, not by reviewer prose and not by submit-time rejection. Reports remain submit-time advisory (warnings only; no hard block at adv_subagent_report_submit). A sandbox-safe gate-readiness evaluator MUST read the latest task-scoped report per agent for each completed task and the task's typed evidence_policy. For proof-bearing policies (test, static_check, review, artifact_reference), an unresolved verification_missing or verification_mismatch consumer warning on the latest task-scoped report MUST produce a typed VERIFICATION_EVIDENCE_MISSING blocker at both the acceptance and release gates. Non-proof policies (source_citation, source_audit, rubric_review, stakeholder_acceptance, design_proof, not_applicable) MUST remain warn-first so valid non-code and source-based workflows do not regress. A blocker clears only when (a) a newer warning-free report for that agent supersedes the warning-bearing report (latest-wins durable evidence), or (b) a typed disposition (fixed, rejected_with_evidence, split, or fast_follow) is recorded via adv_verification_evidence_disposition for the task's verification concernKey. The check MUST NOT be bypassed by compatibilityReason (no silent grandfathering of legacy changes). No accepted_debt terminal state exists. The mechanism adds no counters, dashboards, status metrics, adoption analytics, or other telemetry surfaces; enforcement state is the typed blocker plus the disposition record.

**Tags:** `workflow`, `acceptance`, `release`, `verification`, `evidence`, `structural`

#### Scenarios

**Unresolved verification evidence on a proof-bearing task blocks acceptance and release** (`rq-verificationEvidence01.1`)

**Given:**
- A completed task has evidence_policy test, static_check, review, or artifact_reference
- The latest task-scoped report for any agent carries an unresolved verification_missing or verification_mismatch consumer warning
- No typed disposition exists for that task's verification concernKey

**When:** Gate readiness is evaluated for acceptance or release

**Then:**
- The gate-readiness evaluator emits a VERIFICATION_EVIDENCE_MISSING blocker
- The gate is blocked by code, not by reviewer judgment
- The blocker identifies the task id, evidence policy, and warning kinds
- The evaluator reads only change state (sandbox-safe; no agenda or storage access)

**Non-proof evidence policies remain warn-first** (`rq-verificationEvidence01.2`)

**Given:**
- A completed task has evidence_policy source_citation, source_audit, rubric_review, stakeholder_acceptance, design_proof, or not_applicable
- The latest task-scoped report carries verification_missing or verification_mismatch consumer warnings

**When:** Gate readiness is evaluated for acceptance or release

**Then:**
- No VERIFICATION_EVIDENCE_MISSING blocker is emitted for that task
- Valid non-code and source-based workflows do not regress
- Other existing readiness rules continue to apply independently

**Warning-free superseding report or typed disposition clears the block** (`rq-verificationEvidence01.3`)

**Given:**
- An unresolved verification warning blocks acceptance or release for a completed task

**When:** A newer warning-free task-scoped report for the same agent supersedes the warning-bearing report (latest-wins), or a typed disposition is recorded via adv_verification_evidence_disposition (fixed, rejected_with_evidence, split, or fast_follow)

**Then:**
- The VERIFICATION_EVIDENCE_MISSING blocker is cleared
- No accepted_debt terminal state is used
- The disposition carries non-blank typed evidence

**No silent grandfathering; no submit-time hard block; no telemetry** (`rq-verificationEvidence01.4`)

**Given:**
- A legacy in-flight change has a compatibilityReason
- An adv-engineer or adv-reviewer report would emit verification_missing or verification_mismatch warnings

**When:** The report is submitted and gate readiness is later evaluated

**Then:**
- Submit-time behavior remains advisory; adv_subagent_report_submit does not hard-block on verification warnings
- compatibilityReason does not bypass the VERIFICATION_EVIDENCE_MISSING readiness check
- No counters, dashboards, status metrics, adoption analytics, or other telemetry surfaces are added as part of enforcement

---

### Reviewer Evidence Authority Partitioned by Evidence Policy

**ID:** `rq-reviewerEvidenceAuthority01` | **Priority:** **[MUST]**

The stage-v2 evidence authority MUST partition verification requirements by evidence policy. For a completed task with evidence_policy "review", a persisted same-task adv-reviewer report IS the authoritative completion evidence; its aggregate tests_run command list neither creates nor substitutes for durable adv_run_test execution evidence, and the consumer_warning emitter MUST NOT emit verification_missing for it. For evidence_policy "test" or "static_check", reviewer aggregate command evidence MUST NOT satisfy the verification requirement; durable adv_run_test execution evidence remains required.

**Tags:** `workflow`, `verification`, `evidence`, `structural`, `review`

#### Scenarios

**Review-policy task with linked reviewer report — no verification block** (`rq-reviewerEvidenceAuthority01.1`)

**Given:**
- A completed stage-v2 task has evidence_policy "review"
- A persisted same-task adv-reviewer report is linked as review_evidence_ref

**When:** Acceptance or release readiness evaluates verification evidence

**Then:**
- No VERIFICATION_EVIDENCE_MISSING blocker is emitted for the reviewer's tests_run

**Test/static_check-policy task with only reviewer evidence — block remains** (`rq-reviewerEvidenceAuthority01.2`)

**Given:**
- A completed task has evidence_policy "test" or "static_check"
- A persisted same-task adv-reviewer report carries aggregate tests_run
- No durable adv_run_test run exists

**When:** Acceptance or release readiness evaluates verification evidence

**Then:**
- A VERIFICATION_EVIDENCE_MISSING blocker is emitted

**Emitter policy-gates verification_missing for adv-reviewer reports** (`rq-reviewerEvidenceAuthority01.3`)

**Given:**
- A task has evidence_policy "review"

**When:** An adv-reviewer report is submitted with aggregate tests_run

**Then:**
- The consumer_warning emitter produces no verification_missing warnings

**Same-task ownership preserved — change-scoped reviewer report cannot satisfy task review_evidence_ref** (`rq-reviewerEvidenceAuthority01.4`)

**Given:**
- A change-scoped adv-reviewer report has no task_id anchor

**When:** Task completion validation runs

**Then:**
- The report cannot satisfy the task's review_evidence_ref

---

### Reviewer-Owned Safe Local Cleanup of Evidence-Backed Bad Tests

**ID:** `rq-reviewBadTestCleanup01` | **Priority:** **[MUST]**

/adv-review and /adv-harden MUST remediate clearly bad tests (flaky, tautological, permanently skipped, or implementation-coupled) in the directly touched subsystem when the remediation is safe and local. The finding must be evidence-backed and the scope bounded to the change's touched subsystem; broader consumer-repository cleanup remains out of scope. Review and harden MUST NOT use a bad-test finding to bypass a valid non-test evidence route or create a repo-wide cleanup obligation.

**Tags:** `workflow`, `review`, `harden`, `cleanup`, `evidence`, `touched-scope`

#### Scenarios

**Evidence-backed bad test in touched subsystem is remediated locally** (`rq-reviewBadTestCleanup01.1`)

**Given:**
- Review or harden identifies a flaky, tautological, permanently skipped, or implementation-coupled test
- The test is in the directly touched subsystem of the change

**When:** The finding is evaluated for remediation

**Then:**
- The test is remediated when the fix is safe and local
- Remediation is verified with the relevant evidence path
- Broader cleanup beyond the touched subsystem is not required

**Broader cleanup remains out of scope** (`rq-reviewBadTestCleanup01.2`)

**Given:**
- A bad test is identified outside the directly touched subsystem

**When:** Review or harden evaluates the finding

**Then:**
- The finding is recorded as a follow-up or rejected with evidence
- No repo-wide cleanup obligation is created for the current change

---

### Active Duplicate Change Creation Rejection

**ID:** `rq-dupActiveCreate01` | **Priority:** **[MUST]**

adv_change_create MUST reject creation of a new active change whose generated change ID or exact summary title matches an existing active (in-flight) change. The rejection MUST return existing-change evidence including the existing change ID and title, MUST NOT create a suffixed active duplicate such as `fixOpenBugs2`, and MUST allow the operator to resume the existing change or archive it first.

**Tags:** `workflow`, `change-create`, `duplicate`, `idempotency`

#### Scenarios

**Plain same-summary duplicate is rejected** (`rq-dupActiveCreate01.1`)

**Given:**
- An active change exists with summary "Fix open bugs"

**When:** adv_change_create is called with summary "Fix open bugs"

**Then:**
- The call is rejected with code DUPLICATE_ACTIVE_CHANGE
- The response includes existing_change_id and existing_change_title
- No new change is created

**No suffixed active duplicate is minted** (`rq-dupActiveCreate01.2`)

**Given:**
- An active change already exists for summary "Fix open bugs"

**When:** The disk store suffix fallback would create fixOpenBugs2

**Then:**
- The fallback is blocked while the original is active
- The response points to the existing change

**Archived same-summary change allows a new create** (`rq-dupActiveCreate01.3`)

**Given:**
- A change with summary "Fix open bugs" is archived

**When:** adv_change_create is called with summary "Fix open bugs"

**Then:**
- Creation proceeds normally subject to other validation

---

### Target-Project Terminal Lifecycle Routing

**ID:** `rq-archiveTargetPathRouting01` | **Priority:** **[MUST]**

adv_change_archive and adv_task_checkpoint MUST support target_path routing to the target project’s disk store. Untrusted target mutation requires explicit confirmation evidence; same-project safety semantics, worktree validation, branch/HEAD guards, and task-to-change resolution remain required. An unreachable or mismatched target MUST fail closed without target mutation.

**Tags:** `change projection`, `archive`, `checkpoint`, `target-path`, `cross-project`

#### Scenarios

**Archive routes through target store when approved** (`rq-archiveTargetPathRouting01.1`)

**Given:**
- An untrusted target_path is explicitly approved with confirmationEvidence

**When:** adv_change_archive is called with target_path

**Then:**
- The change is loaded from the target project's store
- Gate, bundle, and finalization checks use target-project state
- The mutation is routed through the target project's disk queue

**Checkpoint routes through target store when approved** (`rq-archiveTargetPathRouting01.2`)

**Given:**
- An untrusted target_path is explicitly approved with confirmationEvidence

**When:** adv_task_checkpoint is called with target_path

**Then:**
- The task is resolved from the target project's store
- Git operations run in the explicit workdir when one is provided and verified as part of the target repository, otherwise in the target project's root
- The response carries target-project context

**Unconfirmed target mutation is rejected** (`rq-archiveTargetPathRouting01.3`)

**Given:**
- A target_path is provided without target_confirmed or confirmationEvidence

**When:** adv_change_archive or adv_task_checkpoint evaluates the call

**Then:**
- The call is rejected before filesystem or state mutation
- Same-project behavior remains unchanged

**Checkpoint target_path selects store, explicit workdir selects git cwd** (`rq-archiveTargetPathRouting01.4`)

**Given:**
- adv_task_checkpoint is called with both target_path and an explicit workdir
- The explicit workdir is a linked worktree of the target repository (matching git common directory)

**When:** The checkpoint resolves its execution context

**Then:**
- Target task state, mutation, and store access use the target project selected by target_path
- Git operations run in the explicit workdir
- target_path never overrides the explicit workdir as the git cwd

**Explicit blank workdir is rejected before any git or state operation** (`rq-archiveTargetPathRouting01.5`)

**Given:**
- adv_task_checkpoint is called with a workdir argument that is empty or whitespace-only

**When:** The checkpoint evaluates the call

**Then:**
- The call fails with a caller-error rejection naming the blank workdir
- No git command runs, no task state is resolved, and no mutation is fired

**Checkpoint refuses an explicit workdir outside the target repository** (`rq-archiveTargetPathRouting01.6`)

**Given:**
- adv_task_checkpoint is called with both target_path and an explicit workdir
- The workdir's git common directory differs from the target repository's, or cannot be probed

**When:** The checkpoint compares git common directories

**Then:**
- The call fails closed as an unrelated-repository reject
- The failure names the workdir and the target repository
- No staging, committing, task-state resolution, or mutation occurs

---

### Archived Archive Retry Is Idempotent No-Op

**ID:** `rq-archiveRetryIdempotence01` | **Priority:** **[MUST]**

adv_change_archive MUST detect when a change is already archived and the archive bundle's spec projection is committed in-repo at the released commit. Only a committed in-repo projection is durable authority; a bundle present in the external store (on-disk project store) without a committed in-repo projection is advisory metadata and MUST route to reconcile rather than no-op. When the in-repo projection is committed and matches the expected projection, adv_change_archive MUST return bounded success with `noOp: true`, MUST report the existing archive path, MUST NOT repeat Phase 9 finalization, branch deletion, linked issue closure, or terminal cleanup, and MUST still surface any open ops follow-up obligations. When the bundle exists in the external store but the status is not yet archived or the in-repo projection is absent, the tool MUST recover by applying the deltas and committing the projection without rewriting the bundle.

**Tags:** `workflow`, `archive`, `idempotency`

#### Scenarios

**Already archived with committed in-repo projection returns no-op success** (`rq-archiveRetryIdempotence01.1`)

**Given:**
- A change has status archived
- The archive bundle's spec-projection.json is committed in-repo at the released commit and matches the expected projection

**When:** adv_change_archive retries on this change

**Then:**
- The tool returns bounded success with noOp: true
- It reports the existing archive path
- It does not repeat Phase 9 finalization, branch deletion, linked issue closure, or terminal cleanup
- It still surfaces any open ops follow-up obligations

**External-store bundle without committed in-repo projection routes to reconcile** (`rq-archiveRetryIdempotence01.2`)

**Given:**
- A change has status archived or is pending archive
- An archive bundle exists in the external store
- The in-repo spec-projection.json is absent at the released commit

**When:** adv_change_archive retries on this change

**Then:**
- The tool does NOT return noOp
- It applies the deltas and commits the projection without rewriting the external-store bundle
- It recovers the status transition if not yet archived

---

### Briefing Packets Are Read Projections Without a Standalone Tool

**ID:** `rq-briefingPacketReadProjection01` | **Priority:** **[MUST]**

ADV MUST generate briefing packets as read-only projections from existing structured workflow state when requested through existing change/handoff read surfaces. A standalone adv_briefing_packet tool MUST NOT be introduced. Packet generation MUST NOT mutate workflow state, complete gates, override release proof, or independently persist live packet bodies. Session and tool-read metadata MUST remain audit-only and MUST NOT become live briefing packet state.

**Tags:** `workflow`, `briefing_packets`, `read_projection`, `no_tool`

#### Scenarios

**Existing read surfaces expose briefing packets** (`rq-briefingPacketReadProjection01.1`)

**Given:**
- A caller requests a briefing packet through an existing ADV read surface

**When:** The surface renders the response

**Then:**
- The packet is included as a generated projection
- No new adv_briefing_packet tool is invoked

**Packet generation does not mutate state** (`rq-briefingPacketReadProjection01.2`)

**Given:**
- A briefing packet is rendered for an active change

**When:** The packet is requested repeatedly

**Then:**
- Gates remain unchanged
- Tasks remain unchanged
- No live packet state is persisted

---

### Archive Briefing Digest Is Compact and Idempotent

**ID:** `rq-briefingPacketArchiveDigest01` | **Priority:** **[MUST]**

At archive, ADV MUST generate a compact archive-lane briefing digest from final structured state and write it into the archive bundle as a deterministic generated artifact. The digest MUST contain change identity, terminal gate summary, durable fact outcomes, Epic terminal note inputs when present, unresolved actions or an explicit none, and unavailable-state warnings if evidence was incomplete. Transient prompt-only slices MUST stop being exposed. Repeated archive or finalization retries MUST overwrite the deterministic digest path instead of appending duplicate records or duplicating durable promotions.

**Tags:** `workflow`, `briefing_packets`, `archive`, `digest`, `idempotency`

#### Scenarios

**Archive digest is compact and terminal-state focused** (`rq-briefingPacketArchiveDigest01.1`)

**Given:**
- A change reaches archive

**When:** The archive-lane digest is rendered

**Then:**
- The digest includes CHANGE, STATUS, and TERMINAL_GATE_SUMMARY anchors
- Raw report bodies are not included
- Transient prompt context is not included

**Repeated archive does not duplicate digest or promotions** (`rq-briefingPacketArchiveDigest01.2`)

**Given:**
- An archive digest already exists in the bundle

**When:** Archive is retried

**Then:**
- The existing digest path is overwritten deterministically
- No duplicate digest records are created
- Durable promotions are not duplicated

---

### Archive Conflict Validation Uses Active Authority Only

**ID:** `rq-archiveInventoryActive01` | **Priority:** **[MUST]**

Archive conflict validation MUST use a dedicated active-authority projection under the fixed 8-second aggregate deadline. Terminal rows MUST NOT participate in conflict authority or consume its read budget. Every required active source, candidate, and capability projection MUST resolve before the result can conclude clean; omissions, deadline expiry, source failure, or missing active capability data MUST produce typed fail-closed incompleteness. Discovery MAY continue to request archived rows separately as related context under rq-disc04, but that contextual history MUST NOT establish conflict authority.

**Tags:** `archive`, `validation`, `authority`, `deadline`

#### Scenarios

**Terminal volume cannot block clean active authority** (`rq-archiveInventoryActive01.1`)

**Given:**
- Archive validation has complete active source and capability data
- The project also has many terminal archive bundles

**When:** Conflict inventory loads

**Then:**
- Only active authority is used for the clean conclusion
- Terminal archive directories are not enumerated by the authority projection
- Validation completes within the fixed 8-second aggregate deadline

**Incomplete active authority fails closed** (`rq-archiveInventoryActive01.2`)

**Given:**
- A required active source, candidate, or capability projection is missing, failed, or deadline-truncated

**When:** Conflict inventory evaluates completeness

**Then:**
- The result carries typed incomplete evidence
- canConcludeClean is false
- Cache or terminal context cannot repair the incomplete authority

**Archived discovery context remains separate** (`rq-archiveInventoryActive01.3`)

**Given:**
- Discovery runs its required includeArchived related-work scan

**When:** It also invokes validation

**Then:**
- Archived rows may be shown as related context
- Validation conflict authority remains active-only
- Archived context does not establish a clean conflict result

---

### Terminal History Uses Versioned Lightweight Summaries

**ID:** `rq-terminalSummary01` | **Priority:** **[MUST]**

New archive bundles MUST contain a versioned, schema-validated lightweight terminal summary sufficient to construct the terminal ChangeListResponse row without hydrating tasks, reports, artifacts, or narrative documents. External and in-repo bundles MUST write equivalent summaries from the same validated archived Change. Missing, corrupt, unknown-version, or incoherent summaries MUST fall back once to the durable legacy change.json bundle; dual failure MUST produce typed terminal omission. Canonical change ID deduplication and terminal dominance over stale active shadows MUST apply identically to summary and legacy inputs.

**Tags:** `archive`, `history`, `summary`, `compatibility`

#### Scenarios

**Valid summary renders terminal row** (`rq-terminalSummary01.1`)

**Given:**
- An archive bundle contains a valid supported terminal summary

**When:** Terminal history is listed

**Then:**
- The row is built from the summary without full change hydration
- All required ChangeListResponse fields are present
- The canonical summary ID owns deduplication

**Invalid summary falls back to legacy bundle** (`rq-terminalSummary01.2`)

**Given:**
- A terminal summary is missing, corrupt, unknown-version, stale against bundle identity, or otherwise invalid

**When:** Terminal history loads that bundle

**Then:**
- The loader attempts change.json exactly once
- A valid legacy Change produces the compatible row
- If legacy loading also fails, typed omission is returned

**Archive destinations receive coherent summaries** (`rq-terminalSummary01.3`)

**Given:**
- Archive writes external and in-repo bundle destinations

**When:** Bundle generation succeeds

**Then:**
- Both destinations contain equivalent schema-valid terminal summaries
- The summary is derived from the same archived Change as change.json
- Copied sibling files cannot overwrite generated summary or change files

---

### Explicit Terminal History Has a Separate Bounded Budget

**ID:** `rq-terminalHistoryBudget01` | **Priority:** **[MUST]**

The existing 8-second authoritative list/status deadline remains mandatory for active conflict authority and default authoritative reads. An explicit non-authoritative archived/closed history request MAY use one separately named fixed 20-second aggregate deadline as a narrow exception to rq-boundedAuthoritativeRead01. That history result MUST return every row resolved before expiry plus typed source-specific partial-result warnings and bounded omitted IDs; it MUST NOT claim completeness after expiry, start new work after expiry, or feed archive conflict authority.

**Tags:** `history`, `deadline`, `degradation`, `exception`

#### Scenarios

**History deadline does not alter authority deadline** (`rq-terminalHistoryBudget01.1`)

**Given:**
- Archive validation and an explicit terminal-history view exist

**When:** Each creates its request deadline

**Then:**
- Archive validation uses the fixed 8-second aggregate deadline
- Explicit terminal history uses the separately named fixed 20-second aggregate deadline
- The history deadline is never passed into conflict authority

**Expired history returns visible partial result** (`rq-terminalHistoryBudget01.2`)

**Given:**
- An explicit terminal-history read cannot resolve every source or candidate within 20 seconds

**When:** The history deadline expires

**Then:**
- Already resolved rows are returned
- Typed source-specific deadline warning and bounded omitted IDs are returned
- No new source or candidate work begins
- The result is not represented as complete

**Default list/status stays within existing law** (`rq-terminalHistoryBudget01.3`)

**Given:**
- A caller requests the default active list or project status without explicit terminal history

**When:** The read runs

**Then:**
- The request uses the existing 8-second aggregate deadline
- The 20-second history exception is not selected
- Existing typed degradation semantics remain

---

### Health Status Uses One Aggregate Execution Budget

**ID:** `rq-statusHealthAggregateBudget01` | **Priority:** **[MUST]**

`adv_status view:health` MUST execute authoritative loading, candidate orientation, advisory probes, and deterministic composition under one request-scoped absolute deadline no greater than 8,000 ms. Provider admission MUST stop early enough to reserve bounded composition time. Candidate hydration and read-only provider concurrency MUST be fixed and explicit. Deadline expiry MUST return typed partial output; no new work may start after admission closes, and late provider completion MUST NOT mutate the returned result or authoritative state.

**Tags:** `status`, `health`, `deadline`, `concurrency`

#### Scenarios

**Cold health pressure stays below host timeout** (`rq-statusHealthAggregateBudget01.1`)

**Given:**
- Health force-refresh has cold probe caches
- The project exposes 57 change candidates

**When:** The health view executes

**Then:**
- At most 10 recent candidates are admitted
- Provider admission stops by 7,500 ms
- Deterministic composition completes by 8,000 ms
- Omitted candidates are explicit

**Independent providers do not serialize latency** (`rq-statusHealthAggregateBudget01.2`)

**Given:**
- Multiple independent read-only health providers are admitted

**When:** They execute under the request plan

**Then:**
- Concurrency never exceeds 4
- Latency follows admitted critical-path duration rather than sequential sum
- Dependent providers are admitted only after their prerequisites

**Expired request cannot admit or mutate late** (`rq-statusHealthAggregateBudget01.3`)

**Given:**
- The request admission cutoff or deadline has elapsed
- Some provider work is unresolved

**When:** The work later settles

**Then:**
- No new provider starts
- Returned output remains unchanged
- Authoritative state remains unchanged

---

### Health Candidate Orientation Is Source-Ranked Before Hydration

**ID:** `rq-statusHealthCandidateOrientation01` | **Priority:** **[MUST]**

Health status candidate orientation MUST establish deterministic source-backed global recency before selecting or hydrating candidates. Running change projection timestamps MUST come from registered projection lookup activity/creation attributes; durable disk-only active candidates MAY use durable projection activity/creation metadata. Memo or cache warmth MUST NOT independently rank or introduce candidates. Health MUST hydrate only the first ten ranked canonical IDs and report exact omission count plus a bounded deterministic omitted-ID sample. All ranking, selection, and hydration MUST finish or degrade by the shared 7,500 ms non-composition cutoff.

**Tags:** `status`, `health`, `recency`, `hydration`, `deadline`

#### Scenarios

**Shuffled enumeration still selects globally newest ten** (`rq-statusHealthCandidateOrientation01.1`)

**Given:**
- Fifty-seven candidates arrive in shuffled enumeration order
- projection lookup and durable projection timestamps identify global recency

**When:** Health selects candidates

**Then:**
- Candidates are sorted by source-backed timestamp descending with canonical-ID tie-break
- The globally newest ten are selected
- Only selected IDs are hydrated
- Omission metadata reports count 47 plus bounded stable ID sample

**Memo warmth cannot bias recency** (`rq-statusHealthCandidateOrientation01.2`)

**Given:**
- An older candidate is memo-warm
- A newer candidate is not memo-warm

**When:** Health ranks candidates

**Then:**
- Memo warmth does not outrank source-backed activity
- The newer candidate retains precedence
- Cache data does not establish completeness

**Incomplete ranking degrades visibly** (`rq-statusHealthCandidateOrientation01.3`)

**Given:**
- A candidate lacks valid source-backed ranking metadata or ranking exceeds the cutoff

**When:** Health composes orientation

**Then:**
- The candidate is represented through typed omission/degradation
- Enumeration order is not treated as recency
- Health does not claim globally complete orientation

---

### Readiness Writes Confirm Projection Application

**ID:** `rq-readinessMutationReceipt01` | **Priority:** **[MUST]**

A readiness-affecting write MUST NOT report success from mutation submission or cache refresh alone. The disk projection records a unique bounded mutation receipt only after successful state application, and the tool confirms that exact receipt before returning success. Unconfirmed application returns a typed non-success result.

**Tags:** `disk`, `mutations`, `readiness`, `receipts`

#### Scenarios

**Exact receipt proves application** (`rq-readinessMutationReceipt01.1`)

**Given:**
- A readiness-affecting mutation carries a unique receipt ID

**When:** Its workflow handler applies the mutation successfully

**Then:**
- The workflow records the receipt after state application
- The tool confirms that exact receipt before success
- Immediate gate readiness observes applied state

**Other mutations and cache changes do not prove application** (`rq-readinessMutationReceipt01.2`)

**Given:**
- The target receipt is not recorded
- Another mutation or cache refresh completes

**When:** The caller waits for confirmation

**Then:**
- The target mutation remains unconfirmed
- No delay, retry, or cache state substitutes for the exact receipt

**Unconfirmed application fails typed** (`rq-readinessMutationReceipt01.3`)

**Given:**
- Receipt query times out, fails, or the workflow completes before confirmation

**When:** The bounded wait ends

**Then:**
- The tool returns MUTATION_APPLICATION_UNCONFIRMED or equivalent typed non-success
- Stale blocker state is not presented as successful mutation evidence

---

### Task Writes Surface Remaining Contract Coverage

**ID:** `rq-contractCoverageProjection01` | **Priority:** **[MUST]**

Contract coverage MUST be projected by one cancellation-aware authority. Only implements and verifies task references cover success and acceptance criteria; respects references do not. Prep and task-write responses MUST reuse the same projection and identify remaining uncovered contract IDs actionably.

**Tags:** `contracts`, `tasks`, `coverage`, `diagnostics`

#### Scenarios

**Coverage verbs remain exact** (`rq-contractCoverageProjection01.1`)

**Given:**
- A contract acceptance criterion is referenced only through respects or a cancelled task

**When:** Coverage is projected

**Then:**
- The criterion remains uncovered
- Only active implements or verifies references cover it

**Task writes return remaining gaps** (`rq-contractCoverageProjection01.2`)

**Given:**
- A task add or pre-planning update changes contract references

**When:** The write succeeds

**Then:**
- The response returns remaining uncovered success/acceptance IDs
- Prep uses the same projection
- No semantic drift exists between write guidance and planning readiness

---

### Issue and portfolio coordination stays orthogonal to seven gates

**ID:** `rq-AwB1gN3w01` | **Priority:** **[MUST]**

This requirement supersedes legacy rq-aw-backlog01. Issue claim projection fields and portfolio-balance reads remain side effects/read models around normal change change projection mutations. The seven gate semantics are unaffected. Gate transitions upsert AdvBacklogIssueNumber whenever state.origin.issue_number is set; no gate logic depends on issue linkage, portfolio ranking, retired roadmap snapshots, or removed roadmap surfaces.

**Tags:** `backlog-coordination`, `gates`, `portfolio-balance`

#### Scenarios

**Gate transitions preserve issue claim attributes** (`rq-AwB1gN3w01.1`)

**Given:**
- A triage-origin change has state.origin.issue_number = 42

**When:** Any gate completes

**Then:**
- buildChangeProjectionFields upserts AdvBacklogIssueNumber = ['42']
- AdvCurrentGate reflects gate progress
- Gate semantics remain unchanged

**Changes without issue linkage omit claim attribute** (`rq-AwB1gN3w01.2`)

**Given:**
- state.origin.issue_number is absent

**When:** Any gate completes

**Then:**
- AdvBacklogIssueNumber is absent
- Other gate attributes populate normally

**Retired roadmap projections do not affect gates** (`rq-AwB1gN3w01.3`)

**Given:**
- ROADMAP.md, .adv/roadmap-snapshot.json, and adv_roadmap are absent

**When:** A change advances through gates

**Then:**
- All seven gates operate normally
- No snapshot or roadmap reader is consulted

---

### Resume Freshness Advisory at ADV Step 2 Load State

**ID:** `rq-resumeFreshness01` | **Priority:** **[MUST]**

When an agent resumes a change whose `lastActivityAgeMinutes` exceeds the resume-freshness band (default 60 minutes), the agent MUST emit a bounded Resume Freshness advisory before the Gate Machine proceeds. The advisory MUST surface one or more stable finding codes (`resume:sibling_overlap`, `resume:archived_duplicate`, `resume:codebase_drift`, `resume:freshness_limited`) using the `/adv-coordinate` taxonomy (`repo_backed_fact | adv_backed_fact | judgment_call | freshness_limited`). The advisory MUST NOT block any gate transition. The advisory MUST NOT mutate ADV state. The advisory MUST stay within a bounded tool-call cost ceiling (~5 calls per stale resume) and MUST invoke the resolver at most once per `adv_status` call (primary candidate only). Fresh changes (`lastActivityAgeMinutes <= 60`) MUST skip the advisory entirely. Missing or stale evidence MUST degrade to `freshness_limited`, not block. User dismissal of findings is NOT persisted — the advisory re-raises on every resume. The advisory scope is current-project only.

**Tags:** `workflow`, `resume`, `freshness`, `advisory`

#### Scenarios

**Stale change triggers advisory** (`rq-resumeFreshness01.1`)

**Given:**
- An agent loads state for change C at Step 2 with C.lastActivityAgeMinutes = 120

**When:** Step 2 Load State runs

**Then:**
- A bounded Resume Freshness advisory is emitted before Step 3 Gate Machine proceeds
- At least one finding code from the stable set is present (or freshness_limited)
- The advisory carries a label from the inherited /adv-coordinate taxonomy

**Fresh change skips advisory** (`rq-resumeFreshness01.2`)

**Given:**
- An agent loads state for change C at Step 2 with C.lastActivityAgeMinutes = 30

**When:** Step 2 Load State runs

**Then:**
- No Resume Freshness advisory is emitted
- No resolver sub-routine is invoked (zero cost)

**Trigger boundary at 60/61 minutes** (`rq-resumeFreshness01.3`)

**Given:**
- An agent loads state for change C at Step 2

**When:** C.lastActivityAgeMinutes = 60 then = 61

**Then:**
- At 60 minutes the advisory is skipped (60 <= band)
- At 61 minutes the advisory fires (61 > band)

**Stable finding codes only** (`rq-resumeFreshness01.4`)

**Given:**
- A Resume Freshness advisory is emitted

**When:** Findings are rendered

**Then:**
- Each finding code is one of: resume:sibling_overlap, resume:archived_duplicate, resume:codebase_drift, resume:freshness_limited
- No LLM-classified labels are used

**Advisory does not block gate transitions** (`rq-resumeFreshness01.5`)

**Given:**
- A Resume Freshness advisory has been emitted

**When:** The user proceeds (or the agent proceed-defaults)

**Then:**
- Step 3 Gate Machine advances normally
- No gate is held pending advisory resolution

**Advisory does not mutate ADV state** (`rq-resumeFreshness01.6`)

**Given:**
- A Resume Freshness resolver is running

**When:** The resolver executes its sub-resolvers

**Then:**
- No close/supersede/task/gate mutations are performed by the advisory itself
- The resolver is read-only against the store

**freshness_limited fallback on budget or evidence failure** (`rq-resumeFreshness01.7`)

**Given:**
- A Resume Freshness resolver exceeds its 8s wall-clock budget
- OR evidence is unavailable (disk projection timeout, git ENOENT)

**When:** The advisory is emitted

**Then:**
- A finding with code resume:freshness_limited appears
- The resolver never throws or silently fails

**Stateless — no dismissal memory** (`rq-resumeFreshness01.8`)

**Given:**
- A user dismissed a resume:sibling_overlap finding for pair (A, B) in a prior resume

**When:** Change A is resumed again later

**Then:**
- The same sibling_overlap finding re-raises
- No persisted dismissal memory is consulted

**Primary-only invocation bounds cost** (`rq-resumeFreshness01.9`)

**Given:**
- An adv_status call processes N recent changes

**When:** Status enrichments are computed

**Then:**
- The resolver is invoked at most once — for the primary candidate only
- Non-primary candidates use the ticker path which never invokes the resolver

**Archived-duplicate one-command suggestion** (`rq-resumeFreshness01.10`)

**Given:**
- A Resume Freshness advisory finds exactly one HIGH-confidence (repo_backed_fact) resume:archived_duplicate

**When:** The recommendation is emitted

**Then:**
- A copy-pasteable adv_change_close ... supersededBy snippet is surfaced
- The snippet requires the user to run it explicitly with their own approval evidence
- The advisory itself does NOT auto-execute close
- The wording uses 'one-command accept (copy-paste and run)' — never 'one-click' or any phrasing implying button-click auto-execution

---

### Advisory Wisdom Auto-Surfacing and Draft Lifecycle

**ID:** `rq-wisdomAutoSurfacing01` | **Priority:** **[MUST]**

ADV auto-surfaces relevant wisdom and creates typed WisdomDraft entries on SEMANTIC error_recovery attempts to lower the friction of capturing cross-task learnings. All enrichment is advisory-only: it MUST NOT be used to complete gates, override specs/contracts, or replace task evidence. WisdomDrafts follow a strict one-way lifecycle: suggested → promoted (via adv_wisdom_add from_draft_id) | dismissed (auto at adv_task_checkpoint with reason auto_checkpoint OR explicit user dismiss with reason user_dismissed). Drafts are task-scoped: cancelled tasks' drafts do not appear in change-level wisdom queries. The generic [ADV:RECORD_WISDOM] system-block nudge is retired; it is replaced by a draft-aware [ADV:WISDOM_DRAFTS] nudge that fires only when drafts are pending review. The plugin emits a capabilities-gated episode recall hint only — it never executes MCP calls directly (preserves plugin↔MCP isolation). Existing callers of affected tools MUST observe byte-identical behavior when new optional fields/features are absent (backward-compat invariant).

**Tags:** `workflow`, `wisdom`, `advisory`, `task-show`, `task-update`, `task-checkpoint`, `wisdom-add`, `system-block`

#### Scenarios

**_relevantWisdom is top 5 by recency when contract_refs.implements is non-empty** (`rq-wisdomAutoSurfacing01.1`)

**Given:**
- adv_task_show is invoked on a task whose contract_refs.implements is non-empty

**When:** The tool computes _relevantWisdom

**Then:**
- FTS-filter candidate wisdom entries via the project's wisdom.search path using the joined implements[] IDs as the query
- Sort filtered entries deterministically by recorded_at DESC
- Return at most the top 5 entries
- Return [] when FTS fails (advisory-only — never throw)
- Return [] when contract_refs.implements is empty or undefined

**_episodeRecallHint is emitted capabilities-gated; plugin never calls MCP** (`rq-wisdomAutoSurfacing01.2`)

**Given:**
- adv_task_show is invoked on a task whose contract_refs.implements is non-empty

**When:** The tool emits the hint

**Then:**
- The hint object carries { namespace, query, top_k: 3 }
- namespace is the project id (or paths.root fallback)
- query is the joined implements[] IDs
- The plugin does NOT execute any MCP call to populate the hint
- The hint is omitted entirely when contract_refs.implements is empty

**SEMANTIC error_recovery with attempts auto-creates exactly one WisdomDraft** (`rq-wisdomAutoSurfacing01.3`)

**Given:**
- adv_task_update is invoked with error_recovery.error_class === 'SEMANTIC'
- error_recovery.attempts[] is non-empty
- The task does not already carry a draft in the 'suggested' state

**When:** The update is applied

**Then:**
- Exactly one WisdomDraft is appended to task.wisdom_drafts[]
- The draft's id matches dr-<8hex>
- suggested_type is 'failure'
- suggested_content is the attempts concatenated as '{diagnosis} → {fix_tried}' joined by '; '
- status is 'suggested'
- source_attempts references the triggering attempt_numbers

**Non-SEMANTIC or empty-attempts recovery does NOT create a draft** (`rq-wisdomAutoSurfacing01.4`)

**Given:**
- adv_task_update is invoked with error_recovery.error_class in {TRANSIENT, ENVIRONMENTAL, FATAL}
- Or error_recovery.attempts[] is empty

**When:** The update is applied

**Then:**
- No WisdomDraft is created
- task.wisdom_drafts is not modified

**Dedup: at most one suggested draft per task** (`rq-wisdomAutoSurfacing01.5`)

**Given:**
- A task already has a WisdomDraft in the 'suggested' state

**When:** Another SEMANTIC error_recovery update is applied

**Then:**
- No additional WisdomDraft is created
- The existing suggested draft remains unchanged

**Lifecycle: suggested → promoted | dismissed is one-way** (`rq-wisdomAutoSurfacing01.6`)

**Given:**
- A WisdomDraft exists in any state

**When:** A transition is attempted

**Then:**
- suggested → promoted is the only path to promoted (via adv_wisdom_add from_draft_id)
- suggested → dismissed is the only path to dismissed (with reason auto_checkpoint OR user_dismissed)
- promoted and dismissed are terminal — no revival path
- No 'rejected' state exists in the lifecycle vocabulary

**adv_wisdom_add from_draft_id atomically promotes** (`rq-wisdomAutoSurfacing01.7`)

**Given:**
- adv_wisdom_add is invoked with from_draft_id and sourceTask
- The referenced draft exists on the sourceTask in the 'suggested' state

**When:** The wisdom entry is added successfully

**Then:**
- taskUpdatedSignal fires with the draft's status set to 'promoted'
- The draft's promoted_wisdom_id is set to the new wisdom entry id
- If the draft is missing: DRAFT_NOT_FOUND
- If the draft is already promoted: DRAFT_ALREADY_PROMOTED
- If the draft is dismissed: DRAFT_DISMISSED
- If from_draft_id is supplied without sourceTask: FROM_DRAFT_ID_REQUIRES_SOURCE_TASK

**adv_task_checkpoint auto-dismisses suggested drafts with counts** (`rq-wisdomAutoSurfacing01.8`)

**Given:**
- adv_task_checkpoint is invoked in 'complete' mode
- The task carries one or more drafts in the 'suggested' state

**When:** The checkpoint completion signal fires and readback succeeds

**Then:**
- taskUpdatedSignal fires with each suggested draft transitioned to 'dismissed'
- Each dismissed draft carries dismiss_reason 'auto_checkpoint' and a dismissed_at timestamp
- Terminal drafts (promoted/dismissed) are NOT re-dismissed (idempotent)
- The checkpoint output includes drafts_pending_review (count before dismissal) and drafts_auto_dismissed (count transitioned)
- Draft dismissal is best-effort: signal failure does not roll back completion or block the checkpoint

**Task-scoped: cancelled tasks' drafts do not surface in change-level queries** (`rq-wisdomAutoSurfacing01.9`)

**Given:**
- A task is cancelled carrying wisdom_drafts
- A change-level wisdom query runs

**When:** The change-level query aggregates wisdom

**Then:**
- Drafts from cancelled tasks are not promoted to change-level wisdom entries
- Drafts only become real Wisdom entries via explicit adv_wisdom_add from_draft_id

**System-block nudge is draft-aware; [ADV:RECORD_WISDOM] retired** (`rq-wisdomAutoSurfacing01.10`)

**Given:**
- The system block is assembled
- One or more tasks carry drafts in the 'suggested' state

**When:** The block is emitted

**Then:**
- An [ADV:WISDOM_DRAFTS] prompt fires listing each task with its pending draft count
- The prompt references adv_wisdom_add from_draft_id and notes auto-dismiss-at-checkpoint
- The retired [ADV:RECORD_WISDOM] prompt does NOT fire even when lastCompletedTask is set
- When no drafts are pending, neither prompt fires

**Advisory-only enrichment never gates or overrides** (`rq-wisdomAutoSurfacing01.11`)

**Given:**
- adv_task_show returns _relevantWisdom and/or _episodeRecallHint
- Or adv_task_update auto-creates a WisdomDraft
- Or adv_task_checkpoint reports drafts_pending_review/drafts_auto_dismissed counts

**When:** Any downstream gate, contract validation, or evidence evaluation runs

**Then:**
- Enrichment data is ignored for gate completion decisions
- Enrichment data cannot override specs or contracts
- Enrichment data cannot replace task evidence
- A task with zero drafts or zero relevant wisdom still completes normally

**Backward-compat: existing callers unaffected when new optional fields are absent** (`rq-wisdomAutoSurfacing01.12`)

**Given:**
- An existing caller invokes adv_task_show, adv_task_update, adv_wisdom_add, or adv_task_checkpoint
- The caller does not pass any new optional field (from_draft_id, pendingWisdomDraftTasks, etc.)

**When:** The tool executes

**Then:**
- Output shape is byte-identical to pre-change behavior except for added top-level advisory fields
- No new error paths are triggered
- No new required arguments exist
- Existing tests for these tools continue to pass without modification of their core assertions

---

### Proven Ambiguous Mutations Resolve Without Duplicate Application

**ID:** `rq-provenMutationOutcome01` | **Priority:** **[MUST]**

Mutation paths with a reproduced or structurally proven unknown-commit risk MUST use stable existing entity identity and a separate canonical request hash to resolve retry outcomes. The same identity and request hash MUST be idempotent; the same identity with a different request hash MUST fail before domain mutation. No global operation-ID argument, generic ledger, tombstone, or parallel persistence layer is required for unrelated mutations.

**Tags:** `mutations`, `idempotency`, `timeouts`, `simplicity`

#### Scenarios

**Post-commit timeout resolves existing result** (`rq-provenMutationOutcome01.1`)

**Given:**
- A mutation commits to its authoritative entity
- The caller times out before observing the response

**When:** The same logical request is retried or read back

**Then:**
- The existing committed outcome is returned
- The domain mutation is not applied twice
- The response does not require manual duplicate-avoidance investigation

**Different payload under same identity conflicts** (`rq-provenMutationOutcome01.2`)

**Given:**
- An authoritative entity records a canonical request hash
- A later request uses the same business identity with a different canonical hash

**When:** The request is evaluated

**Then:**
- A typed payload conflict is returned before domain mutation
- Existing state remains unchanged

**Retry protection remains proof-scoped** (`rq-provenMutationOutcome01.3`)

**Given:**
- A mutation path has no reproduced or structurally proven ambiguous-commit or duplicate-effect risk

**When:** The change evaluates whether to add retry identity machinery

**Then:**
- No new mandatory operation identifier or generic ledger is added solely for uniformity
- Existing behavior remains unless independent evidence justifies change

---

### Machine-Resolvable Recovery Runs Directly

**ID:** `rq-directMonotonicRecovery01` | **Priority:** **[MUST]**

When ADV already holds structured machine evidence for an unambiguous monotonic convergence action, the normal operation MUST apply and verify that convergence without requiring callers to select a repair tool or transcribe machine errors into recovery arguments. Reachable authority disagreement, malformed durable state, non-monotonic mutation, destructive action, or missing human approval MUST fail closed with a typed operator-required result.

**Tags:** `recovery`, `self-healing`, `disk`, `audit`, `operator-boundary`

#### Scenarios

**Machine evidence authorizes safe direct convergence** (`rq-directMonotonicRecovery01.1`)

**Given:**
- A normal operation detects completed, missing, unreadable, or stale derived state through structured system evidence
- A mutation-specific validator proves one monotonic convergence result

**When:** The operation handles the failure

**Then:**
- The convergence runs internally
- Post-state is verified before success
- The caller does not provide recoveryMode, recoveryEvidence, or recoveryReason

**Authority conflict remains explicit** (`rq-directMonotonicRecovery01.2`)

**Given:**
- External evidence disagrees with the durable disk projection or two durable authorities conflict

**When:** Automatic recovery classifies the incident

**Then:**
- No authority is overwritten automatically
- A typed operator-required or conflict result is returned
- The response identifies the conflicting states without prescribing a repair-tool decision tree

**Human approval is not inferred from machine evidence** (`rq-directMonotonicRecovery01.3`)

**Given:**
- A recovery action also requires acceptance, destructive, or other human approval

**When:** Machine failure evidence is present but human approval is absent

**Then:**
- The operation remains blocked
- Machine evidence does not fabricate or replace approval evidence

**No recovery infrastructure cruft** (`rq-directMonotonicRecovery01.4`)

**Given:**
- Direct convergence can be completed in the operation that observes the inconsistency

**When:** The implementation is designed

**Then:**
- No tombstone, compatibility record, generic ledger, periodic reconciliation daemon, or new persistence layer is introduced
- Existing authoritative entities carry only required state

---

### Staged spec-delta records support amend, retract, and full operation vocabulary

**ID:** `rq-stagedDeltaCrud01` | **Priority:** **[SHOULD]**

The archive lifecycle MUST support staged spec deltas with operations: add, modify, amend (id-preserving full replacement), retract (delete staged delta), remove (stage a requirement deletion), and rename (stage a requirement rename). Deltas are applied at archive via the internal reducer. Amend is full-replace (deterministic — the caller supplies the complete corrected delta; no heuristic merge). Every write returns explicit failure rather than false success when the post-commit readback cannot confirm the intended change (mutation-safety readback proof). Archive remains the sole global-spec writer; staged operations mutate only the change-owned record. New disk mutation reducers are additive and readback-safe.

**Tags:** `spec-delta`, `tooling`, `workflow`

#### Scenarios

**Amend replaces a staged delta preserving its id** (`rq-stagedDeltaCrud01.1`)

**Given:**
- A modify-delta dl-x is staged under a capability with a set of scenarios

**When:** An amend operation is requested with the complete corrected delta for dl-x

**Then:**
- The staged entry dl-x is atomically replaced with the corrected postimage
- The delta id dl-x is preserved
- adv_change_show exposes the amended postimage before success is returned
- A second amend of dl-x succeeds (no first-modify-only limit)

**Amend of an invalid payload is atomically rejected** (`rq-stagedDeltaCrud01.2`)

**Given:**
- A modify-delta dl-x is staged

**When:** An amend operation is requested with an invalid corrected delta (unknown modify target, bad scenario-id parenting, or malformed)

**Then:**
- The operation is atomically rejected
- The previously-staged delta dl-x is unchanged

**Retract removes a staged delta** (`rq-stagedDeltaCrud01.3`)

**Given:**
- A delta dl-x is staged under a capability

**When:** A retract operation is requested for dl-x

**Then:**
- dl-x is removed from the change-owned delta record
- adv_change_show no longer lists dl-x
- Readback confirms absence before success is returned

**Remove and rename operation deltas can be staged** (`rq-stagedDeltaCrud01.4`)

**Given:**
- A capability whose global spec contains a target requirement

**When:** A valid remove (target_id + reason) or rename operation delta is requested

**Then:**
- The operation:remove or operation:rename delta is staged under change.deltas[capability]
- Readback confirms the staged delta before success
- Archive applies it through the existing apply path

**Amend or retract of an unknown delta id is rejected without mutation** (`rq-stagedDeltaCrud01.5`)

**Given:**
- A capability with some staged deltas

**When:** An amend or retract operation is requested with a deltaId that is not staged

**Then:**
- A typed not-found error is returned
- No mutation occurs

---

### Launcher read-projection provenance truthfulness

**ID:** `rq-launcherProjectionTruth01` | **Priority:** **[MUST]**

ADV maintains a durable, launcher-consumable active-state disk projection (`active-launcher-state.json` under the per-project external-state dir) that aggregates active changes from the existing per-change `{changeId}.json` projections. The projection MUST: (a) list only draft/non-terminal changes; (b) exclude archived/terminal changes per `rq-terminalProjectionTruth01`, matched by canonical `change.json.id` (NOT archive directory name); (c) carry truthful provenance at all times — `source:"disk_projection"`, `schema_version`, `generated_at`, a last-mutation `freshness` timestamp, an advisory `degraded` flag, and `epics_available:false` (active epics remain disk-only and are NEVER fabricated as live). The aggregate is regenerated eagerly after every change mutation as host-side filesystem I/O (disk is NOT in the aggregate-write path); a producer-owned rebuild trigger regenerates it from the on-disk per-change set for drift recovery. The aggregate is written by extending the body of the existing `writeChangeProjection` activity (host-side) — NOT by adding a new activity invocation to the change projection — so in-flight change projection histories readback identically (no `wf.patch`/versioning required). The aggregate write is best-effort: a failure must not fail the per-change projection write or the mutation.

**Tags:** `change projection`, `read-model`, `projection`, `launcher`, `recovery`, `durable`, `truthful-provenance`

#### Scenarios

**Active-only projection with terminal-truth dominance** (`rq-launcherProjectionTruth01.1`)

**Given:**
- a project with active (draft) and terminal (archived) changes
- an on-disk per-change projection for each
- an archive bundle for the terminal change whose canonical change.json.id matches its changeId

**When:** a change mutation regenerates the aggregate

**Then:**
- the projection file exists at the per-project external-state dir
- it contains exactly the draft/non-terminal changes
- the archived change is excluded even though a stale draft projection file may exist

**disk-independent read** (`rq-launcherProjectionTruth01.2`)

**Given:**
- disk (disk-dev) is stopped
- the per-change projections and aggregate already exist on disk

**When:** the launcher reads active-launcher-state.json

**Then:**
- the aggregate file is readable and reflects the active set
- no disk round-trip is required to read it

**readback-safe eager regeneration** (`rq-launcherProjectionTruth01.3`)

**Given:**
- a change mutation fires a mutation handled by the change projection
- the change projection calls writeChangeProjection with unchanged args

**When:** the activity body executes host-side

**Then:**
- both changes/{changeId}.json and active-launcher-state.json are written
- the change projection's activity-invocation sequence is unchanged (the aggregate write occurs inside the activity body)
- in-flight change projection histories readback identically with no wf.patch

**Best-effort aggregate never fails the per-change write** (`rq-launcherProjectionTruth01.4`)

**Given:**
- the aggregate write target is unwritable or fails
- the per-change projection write already succeeded

**When:** the aggregate write throws

**Then:**
- the activity still returns success for the per-change projection
- the mutation is not failed
- a structured warning is logged

**Truthful provenance and epics_available** (`rq-launcherProjectionTruth01.5`)

**Given:**
- active epic data is disk-only and not present on disk

**When:** the aggregate is generated

**Then:**
- epics_available is false (never fabricated as live)
- source is always disk_projection (never disk/live:true)
- freshness is the max lastMutationAt across active summaries and degraded reflects the documented threshold

---

### Recovery Projection Mutations Are Conditional and Verified

**ID:** `rq-recoveryProjectionTransaction01` | **Priority:** **[MUST]**

ADV recovery mutations against a completed, missing, unreadable, or otherwise non-mutationable change change projection MUST commit through one storage-owned conditional projection transaction. The transaction MUST serialize per change, read the latest projection inside the critical section, compare the expected projection revision, apply the field-level mutation to that latest state, increment revision, persist atomically, read back, and verify the mutation-specific postcondition before reporting success. All mutable active change-projection writers MUST route through this boundary or a mechanically validated terminal/bootstrap exception. Plain success is forbidden when readback cannot prove convergence.

**Tags:** `change projection`, `recovery`, `projection`, `concurrency`, `cas`, `verification`

#### Scenarios

**Concurrent disjoint recovery mutations both survive** (`rq-recoveryProjectionTransaction01.1`)

**Given:**
- A completed or unreadable change change projection requires disk-projection recovery
- Two disjoint recovery mutations start from the same projection revision

**When:** The mutations execute concurrently

**Then:**
- Both mutations are present in the persisted projection
- Projection revision advances once per committed mutation
- Neither mutation silently overwrites the other

**Conflicting recovery mutation fails explicitly** (`rq-recoveryProjectionTransaction01.2`)

**Given:**
- Two recovery mutations target the same logical field
- Both carry the same expected projection revision

**When:** They race to commit

**Then:**
- Exactly one mutation succeeds
- The other returns typed stale-revision or lost-update evidence
- No last-writer-wins success is reported

**Recovery success requires downstream-visible readback** (`rq-recoveryProjectionTransaction01.3`)

**Given:**
- A recovery mutation has written a change projection

**When:** The coordinator evaluates completion

**Then:**
- It reads the persisted projection from the same authority downstream readiness will consume
- It verifies the mutation-specific postcondition
- Unverifiable convergence returns a blocking recovered-unverified outcome instead of success

---

### Projection-Proven Command Success

**ID:** `rq-projectionCommandProof01` | **Priority:** **[MUST]**

ADV state-changing commands MUST carry stable operation identity, be validated and applied by the authoritative disk-projection reducer, and return success only after an accepted monotonic revision is committed and read back with the mutation-specific postcondition. Routine read state MUST NOT authorize a mutation.

**Tags:** `disk`, `projection`, `command-receipt`, `idempotency`, `cqrs`

#### Scenarios

**Accepted command proves durable projection** (`rq-projectionCommandProof01.1`)

**Given:**
- A state-changing command has a stable operation id and payload hash
- The change projection reducer accepts the command and records a new state revision

**When:** The command adapter reports success

**Then:**
- The durable full projection contains at least the accepted state revision
- The matching operation id and payload identity are verified by readback
- The durable summary shard points to the same state revision

**Projection failure prevents false success** (`rq-projectionCommandProof01.2`)

**Given:**
- The change projection reducer accepted a command
- The projection commit or verification fails

**When:** The command adapter returns

**Then:**
- The result is typed as accepted-but-not-durably-projected or outcome-unknown
- The result does not claim success
- The operation id and accepted revision support deterministic repair without blind retry

**Reducer owns lifecycle authorization** (`rq-projectionCommandProof01.3`)

**Given:**
- Host preflight state is stale or advisory
- A close or batch-close command targets an ineligible lifecycle state

**When:** The change projection reducer handles the command

**Then:**
- The command is rejected with a typed ledger outcome
- Lifecycle state and state revision remain unchanged
- No lifecycle disk projection is written before reducer acceptance

**Stable operation readback is idempotent** (`rq-projectionCommandProof01.4`)

**Given:**
- An operation id and payload hash were previously accepted or rejected

**When:** The same operation is retried

**Then:**
- The prior outcome and revision are returned
- The reducer is not applied again
- The state revision and projection revision do not increment again

---

### Structured Criterion Variant Representation and Compatibility

**ID:** `rq-structuredAcceptance01` | **Priority:** **[MUST]**

The ChangeContract item model MUST support an optional typed variant annotation for the four supported criterion kinds (behavioral, evidence, spec_law, constraint) while keeping canonical text, stable ID, kind, and evidence policy as the contract authority. The variant MUST be parsed and validated once at the adv_contract_mint boundary. Legacy flat-text items without a variant MUST remain valid and render unchanged. Malformed or unsupported structured input MUST fail minting with a clear validation result and MUST leave the previously valid contract unchanged.

**Tags:** `workflow`, `contract`, `acceptance-criteria`, `variant`, `compatibility`

#### Scenarios

**Mint preserves typed variant and canonical text** (`rq-structuredAcceptance01.1`)

**Given:**
- An approved agreement contains a supported structured criterion with a stable ACn/SCn/Cn/DONTn label

**When:** adv_contract_mint parses the agreement

**Then:**
- The contract item records the optional variant annotation
- The canonical text remains the flattened obligation string
- The stable ID, kind, and evidence policy are unchanged

**Legacy flat-text items remain valid** (`rq-structuredAcceptance01.2`)

**Given:**
- An existing contract item has no variant annotation

**When:** The contract is read, rendered, or reviewed

**Then:**
- The item remains schema-valid
- Legacy projections derive from canonical text only
- Review-matrix and task coverage checks remain variant-agnostic

**Malformed structured input fails safely** (`rq-structuredAcceptance01.3`)

**Given:**
- An approved agreement contains an incomplete behavioral scenario or malformed evidence/spec-law variant

**When:** adv_contract_mint attempts to parse the contract

**Then:**
- Mint returns a clear CONTRACT_MALFORMED_VARIANT result
- The prior valid contract is not replaced
- No contract item is partially written

**Warrants are validated and stripped in structured variants** (`rq-structuredAcceptance01.4`)

**Given:**
- An approved structured criterion declares a bracketed [warrant: ...] tag

**When:** adv_contract_mint parses the item

**Then:**
- The warrant is verified against the live tool surface or spec ids
- An unresolved warrant fails the mint with CONTRACT_UNRESOLVED_WARRANT
- A resolved warrant is recorded and stripped from canonical text

---

### Acceptance Re-resolves Typed Durable Verification Evidence

**ID:** `rq-verificationEvidenceFreshness01` | **Priority:** **[MUST]**

For a proof-bearing task, acceptance and release readiness MUST evaluate typed verification entries against current task-local durable test-run records, not solely submission-time consumer warnings. The workflow state is the change boundary; within it, a typed entry is valid only when its task ID, cited run ID, and reported exit code match a current record. The latest applicable report attempt may supersede an earlier invalid report only through its own valid cited record. Missing, mismatched, cross-task, or evicted IDs MUST remain explicit blockers. An unrelated successful run MUST NOT substitute for a cited ID.

**Tags:** `verification`, `acceptance`, `durable-evidence`, `auditability`

#### Scenarios

**Later valid typed report supersedes earlier invalid report** (`rq-verificationEvidenceFreshness01.1`)

**Given:**
- A proof-bearing task has an earlier report with missing or invalid typed test evidence
- A later applicable report cites a durable run record for the same task with a matching exit code

**When:** Acceptance readiness evaluates the task

**Then:**
- The earlier report warning does not block the task
- The later report is accepted only by its cited run ID and exit code

**Unrelated or unavailable runs fail closed** (`rq-verificationEvidenceFreshness01.2`)

**Given:**
- A typed verification entry cites a missing, evicted, mismatched, or different-task run ID
- Another successful durable run may exist for the change

**When:** Acceptance readiness evaluates the task

**Then:**
- Acceptance remains blocked with an explicit verification-evidence reason
- The other successful run is not substituted

---

### Unified hygiene triage scope for /adv-cleanup

**ID:** `rq-cleanupHygieneScope01` | **Priority:** **[MUST]**

/adv-cleanup MUST triage all four ADV hygiene surfaces in a single run: active-change debt, worktree drift, merged archived change/* branch debt, and archived/closed state leaks. Discovery MUST route through adv_change_list, adv_worktree_triage, adv_worktree_cleanup mode archived_branches dryRun true, and adv_status view hygiene respectively. Dry-run remains the default mode and no surface may be silently omitted when empty. Candidate buckets MUST be classified by reversibility, and irreversible buckets (worktree deletion, branch deletion) MUST require a stronger confirmation than reversible buckets: a count-matched typed reply that rejects the reversible-bucket approve-all token, with no LLM fallback. Deletion MUST delegate to adv_worktree_delete or adv_worktree_cleanup per rq-terminalCleanupSafety01; adv_worktree_triage classification is advisory discovery and selection data and is never sufficient deletion authority. Invocation remains operator-explicit with no background sweeps, daemons, or session-start auto-cleanup.

**Tags:** `cleanup`, `hygiene`, `approval`, `safety`

#### Scenarios

**Four-surface discovery in one run** (`rq-cleanupHygieneScope01.1`)

**Given:**
- A project has stale active changes, drifted worktrees, merged archived change/* branches, and archived or closed state leaks

**When:** The user runs /adv-cleanup in default dry-run mode

**Then:**
- The report contains a distinct section for each of the four hygiene surfaces
- Each section is labelled with its reversibility class
- A surface with no candidates renders an explicit empty state rather than being omitted
- No change is closed and no worktree or branch is deleted

**Reversibility labelling with recovery detail** (`rq-cleanupHygieneScope01.2`)

**Given:**
- A cleanup report contains both reversible and irreversible candidate buckets

**When:** The report is rendered

**Then:**
- Every candidate bucket carries an explicit reversible or irreversible marker
- Each irreversible bucket states its recovery path
- The branch-deletion bucket states the reflog recovery time bound

**Typed confirmation for irreversible buckets** (`rq-cleanupHygieneScope01.3`)

**Given:**
- An irreversible bucket such as worktree deletion or branch deletion is presented for approval

**When:** The user replies approve all

**Then:**
- The reply is rejected and the bucket is re-prompted
- Approval requires a count-matched typed reply whose count equals the exact listed candidate count
- A count mismatch re-prompts
- No LLM fallback is used on any reply

**Delegated deletion authority** (`rq-cleanupHygieneScope01.4`)

**Given:**
- An irreversible bucket has been approved with a valid typed confirmation

**When:** The command applies the approved bucket

**Then:**
- Deletion is performed by adv_worktree_delete or adv_worktree_cleanup
- The deletion tool's own safety refusals are honoured and surfaced verbatim in the result lines
- adv_worktree_triage classification alone never authorises removal
- Each bucket remains atomic and a bucket failure does not halt remaining buckets

**Dry-run default preserved** (`rq-cleanupHygieneScope01.5`)

**Given:**
- The user runs /adv-cleanup without an execute flag

**When:** The command completes its scan and renders the report

**Then:**
- No change is closed
- No worktree is deleted
- No local branch is deleted
- The footer states how to re-run with execution enabled

---

### Mid-lifecycle findings route to backlog, not reflexive change creation

**ID:** `rq-findingRouting01` | **Priority:** **[MUST]**

Command contracts that encounter mid-lifecycle findings — prep MoSCoW Won't path, design risk-table framing, apply/review/harden routing — MUST name adv_backlog_add as the durable middle-tier option. Findings that do not warrant immediate change creation MUST be routable to the backlog without friction (no mandatory prose justification gate). The command contracts MUST carry a fidelity anchor (asset-test claim) that fails if the routing direction is removed, so the vocabulary does not silently regress.

**Tags:** `workflow`, `backlog`, `findings`, `vocabulary`, `routing`

#### Scenarios

**Prep MoSCoW Won't directs to backlog** (`rq-findingRouting01.1`)

**Given:**
- A finding is classified Won't during prep

**When:** The agent follows the MoSCoW Won't path

**Then:**
- The contract names adv_backlog_add as the durable middle-tier option
- No mandatory prose justification blocks the routing

**Design risk-table requires durable-record framing** (`rq-findingRouting01.2`)

**Given:**
- A design risk-table entry exists for a finding that might be lost

**When:** The mitigation is framed

**Then:**
- The adv-design contract requires durable-record framing
- No-change-owns-it is not an acceptable mitigation

**Apply/review/harden routing claims are drift-guarded** (`rq-findingRouting01.3`)

**Given:**
- The Finding Routing claims exist in the command files

**When:** Asset tests run

**Then:**
- Each claim has a fidelity anchor that fails on removal
- The routing vocabulary does not silently regress

---

### Respects claims on avoidance/out_of_scope items require non-claiming review authority

**ID:** `rq-respectsEvaluation01` | **Priority:** **[MUST]**

A task's contract_refs.respects claim targeting an avoidance (DONT) or out_of_scope (OOS) contract item is a positive compliance assertion that the claiming agent cannot self-certify. At acceptance and release gate readiness, every done task with such a respects claim MUST carry task-scoped review authority from a non-claiming agent (adv-reviewer). A change-scoped review report does not qualify — the reviewer must have examined THIS task. Self-asserted compliance alone MUST fail with a typed RESPECTS_EVIDENCE_AUTHORITY_MISSING blocker. The check applies to ALL done tasks (no grandfathering); existing recorded review evidence is accepted, not re-litigated. A task whose evidence_policy is 'test' is not exempt: respects on avoidance/OOS items requires review authority regardless of the task's own evidence route.

**Tags:** `workflow`, `contract`, `acceptance`, `release`, `evidence`, `authority`, `respects`

#### Scenarios

**Self-asserted respects on avoidance/OOS fails without review authority** (`rq-respectsEvaluation01.1`)

**Given:**
- A done task has contract_refs.respects referencing a DONT or OOS item
- No task-scoped adv-reviewer report exists for the task

**When:** Acceptance or release readiness evaluates the task

**Then:**
- Gate readiness emits a RESPECTS_EVIDENCE_AUTHORITY_MISSING blocker
- The blocker names the unverified respects item(s)

**Task-scoped review authority satisfies the respects claim** (`rq-respectsEvaluation01.2`)

**Given:**
- A done task has contract_refs.respects referencing a DONT or OOS item
- A task-scoped adv-reviewer report exists

**When:** Acceptance or release readiness evaluates the task

**Then:**
- No respects-authority blocker is emitted
- The existing review evidence is accepted without re-examination

**Non-avoidance respects do not require review authority** (`rq-respectsEvaluation01.3`)

**Given:**
- A done task has contract_refs.respects referencing only constraints or acceptance criteria (non-avoidance)
- No review report exists

**When:** Acceptance or release readiness evaluates the task

**Then:**
- No respects-authority blocker is emitted

**Change-scoped review does not satisfy task-scoped authority** (`rq-respectsEvaluation01.4`)

**Given:**
- A reviewer report exists but is scoped to the change, not the task

**When:** Acceptance or release readiness evaluates a task with avoidance respects

**Then:**
- The respects-authority blocker is still emitted
- The report does not count as task-scoped authority

---

### adv_change_create surfaces bounded portfolio state with graceful degradation

**ID:** `rq-createPortfolioLine01` | **Priority:** **[SHOULD]**

adv_change_create MUST surface bounded portfolio state at creation time: non-terminal change count, never-terminal share, and a soft nudge above threshold. Change creation is where reflexive change creation happens; surfacing the portfolio at that moment gives the creating agent the state it needs to consider the durable middle tier (adv_backlog_add). The portfolio read is deadline-capped (well under the store budget) and MUST degrade to an explicit { available: false } marker on any failure or timeout — creation is never blocked by the portfolio read. The nudge fires only above BOTH thresholds (minimum open count AND never-terminal share) so small portfolios stay quiet. An empty portfolio reports zero share with no nudge.

**Tags:** `workflow`, `change-create`, `portfolio`, `backlog`, `degradation`

#### Scenarios

**Create surfaces bounded portfolio stats** (`rq-createPortfolioLine01.1`)

**Given:**
- A portfolio with non-terminal and terminal changes

**When:** adv_change_create completes successfully

**Then:**
- The result carries portfolioState with available: true
- open_count and never_terminal_share are computed correctly

**Create degrades gracefully on portfolio read failure** (`rq-createPortfolioLine01.2`)

**Given:**
- The portfolio read exceeds its deadline or throws

**When:** adv_change_create runs under a failing or slow portfolio read

**Then:**
- Creation still succeeds
- The result carries portfolioState with available: false
- The marker is explicit and distinguishable from a zero portfolio

**Nudge fires only above both thresholds** (`rq-createPortfolioLine01.3`)

**Given:**
- A portfolio above both nudge thresholds (open count AND never-terminal share)

**When:** adv_change_create evaluates the portfolio

**Then:**
- The nudge message is present and names adv_backlog_add

**Small portfolios stay quiet** (`rq-createPortfolioLine01.4`)

**Given:**
- A portfolio below either threshold

**When:** adv_change_create evaluates the portfolio

**Then:**
- No nudge is emitted

---

### Retry reducer distinguishes progress from retries and makes the budget clamp visible

**ID:** `rq-retryProgressAccounting01` | **Priority:** **[MUST]**

The retry reducer MUST distinguish productive review/implementation rounds from failed retries. A BLOCKED sub-agent verdict whose blocking findings share no id or stable fingerprint with the previous blocked round is progress on new ground, not a failed retry: it MUST be recorded in task.progress_rounds and MUST NOT inflate error_recovery. A round whose findings overlap by id or file+what is a retry. When the true attempt count (total_attempts) reaches or exceeds max_retries, the retention clamp MUST emit an explicit budget_warning marker on error_recovery rather than silently dropping history. Report submission is never refused at/over budget: the report applies and the marker makes the clamp visible. The doom-loop UX MUST surface the budget_warning so the operator can see that history was elided.

**Tags:** `workflow`, `retry`, `doom-loop`, `honesty`, `evidence`, `subagent-reports`

#### Scenarios

**Disjoint findings are progress, not retry** (`rq-retryProgressAccounting01.1`)

**Given:**
- Two successive BLOCKED verdicts
- The second verdict's blocking findings share no id or stable fingerprint with the first

**When:** The reducer applies the second BLOCKED verdict

**Then:**
- The second verdict is recorded in task.progress_rounds
- error_recovery.retry_count is not incremented
- error_recovery.attempts is not inflated

**Overlapping findings are a retry** (`rq-retryProgressAccounting01.2`)

**Given:**
- Two successive BLOCKED verdicts
- The findings overlap by id or file+what

**When:** The reducer applies the second BLOCKED verdict

**Then:**
- The second verdict increments the retry count
- progress_rounds is not appended

**Budget clamp emits visible warning, never refuses** (`rq-retryProgressAccounting01.3`)

**Given:**
- A task at or over retry budget
- total_attempts >= max_retries

**When:** A sub-agent report is submitted at/over budget

**Then:**
- Submission succeeds — no refusal
- error_recovery carries a non-empty budget_warning string
- The doom-loop UX surfaces budgetWarning

**No warning while budget holds** (`rq-retryProgressAccounting01.4`)

**Given:**
- A task under retry budget
- total_attempts < max_retries

**When:** A sub-agent report is submitted

**Then:**
- No budget_warning is emitted

---

### Enumeration Terminal Dominance Is Per-ID and Scan-Free

**ID:** `rq-enumerationTerminalDominance01` | **Priority:** **[MUST]**

Change enumeration MUST resolve terminal dominance per requested ID, including rows served directly from durable summary shards. A row already present in the summary-shard set MUST NOT bypass archive-bundle dominance merely because it never entered candidate hydration. Enumeration dominance MUST be a bounded per-ID archive-bundle check over the requested row set, mirroring the per-ID resolution used by the snapshot read path. Active or in-flight enumeration MUST NOT perform O(all archive bundles) inventory I/O; full archive-inventory discovery remains permitted only when terminal statuses are explicitly requested. Rows already terminal as closed MUST be preserved unchanged.

**Tags:** `workflow`, `archive`, `terminal-state`, `read-model`, `enumeration`

#### Scenarios

**Summary-shard row with an archive bundle resolves as archived** (`rq-enumerationTerminalDominance01.1`)

**Given:**
- A change has an archive bundle
- Its durable summary shard still records a non-terminal status such as draft

**When:** adv_change_list and its summary enumeration path each resolve the change

**Then:**
- Both surfaces return status archived
- The stale non-terminal shard value is not returned by either surface
- Dominance is applied to the summary-shard row without requiring candidate hydration

**Active enumeration does not scan the whole archive inventory** (`rq-enumerationTerminalDominance01.2`)

**Given:**
- A caller requests active or in-flight changes
- Many archive bundles exist on disk

**When:** Enumeration resolves terminal dominance for the requested rows

**Then:**
- Terminal resolution performs a bounded per-ID archive-bundle check over the requested row set only
- No O(all archive bundles) inventory scan is performed for that query
- Full archive-inventory discovery remains available only when terminal statuses are explicitly requested

**Closed rows are preserved when an archive bundle exists** (`rq-enumerationTerminalDominance01.3`)

**Given:**
- A change is recorded as closed
- An archive bundle exists for the same canonical change ID

**When:** Enumeration applies terminal dominance

**Then:**
- The closed status is preserved
- Closed is not rewritten to archived by dominance
- Existing closed-status handling is unchanged

---

### Archive Terminal Success Requires Full Delta Projection Proof

**ID:** `rq-archiveDeltaReconciliation01` | **Priority:** **[MUST]**

Every archive path that would report terminal success, return an archived no-op, or project archived status MUST prove each accepted delta against the released specification projection. Reconciliation MUST classify typed normalized content as missing, identical, conflicting, or unverified; apply only proven-safe missing work through the archive-owned worktree path; preserve identical work without rebumping versions; fail closed on conflicting or unverified state; and verify capability version plus generated documentation before terminal success. Bundle presence in the external store does NOT establish in-repo projection durability and MUST NOT be treated as authority that reconciliation already ran; external-store presence is advisory metadata. Historical repair MUST remain current-repository scoped, approval-gated for mutation, and must not rewrite archived evidence.

**Tags:** `workflow`, `archive`, `spec-deltas`, `reconciliation`, `terminal-proof`

#### Scenarios

**Terminal success proves complete released projection** (`rq-archiveDeltaReconciliation01.1`)

**Given:**
- A change or archived bundle contains accepted spec deltas
- An archive, retry, no-op, or status-repair path would report terminal success or project archived state

**When:** The shared archive reconciliation gate evaluates the released projection

**Then:**
- Every accepted delta is classified from typed normalized content
- Requirement content and capability version match the expected projection
- Generated documentation matches the projected spec
- Terminal success is refused unless all proof checks pass

**Missing and identical state converges exactly once** (`rq-archiveDeltaReconciliation01.2`)

**Given:**
- An interrupted archive left some accepted deltas missing and others already identical

**When:** Archive-owned reconciliation runs in a trusted change worktree

**Then:**
- Only proven-safe missing projection is written
- Identical requirements are not duplicated
- Identical capability state is not version-bumped again
- Retry converges to the same spec and documentation bytes

**Conflict or missing authority fails closed** (`rq-archiveDeltaReconciliation01.3`)

**Given:**
- A same-ID requirement differs from the expected normalized postimage or a historical mutation lacks authoritative baseline/postimage proof

**When:** Reconciliation classifies the archive plan

**Then:**
- The result is conflicting or unverified
- No spec, version, documentation, bundle, or terminal-state mutation occurs for that semantic plan
- The response provides bounded actionable evidence

**Approved historical repair preserves archive evidence** (`rq-archiveDeltaReconciliation01.4`)

**Given:**
- An operator approves current-repository historical delta reconciliation
- Discoverable archives include complete, repairable, conflicting, or unreadable projection states

**When:** The batch repair simulates archives deterministically and applies proven-safe results in a trusted repair worktree

**Then:**
- Each archive receives a complete, repaired, conflict, or unreadable disposition
- Only proven-safe cumulative target specs and docs are written
- Conflicting or unreadable law is not overwritten
- Archived bundles, release evidence, gates, and terminal status remain unchanged

**External-store bundle presence is not in-repo projection authority** (`rq-archiveDeltaReconciliation01.5`)

**Given:**
- A change has status archived
- An archive bundle exists in the external store (on-disk project store)
- The in-repo spec-projection.json is absent at the released commit because the bundle was never committed in-repo

**When:** adv_change_archive retries on this change

**Then:**
- The retry MUST NOT treat external-store bundle presence as proof the in-repo projection is durable
- The retry MUST route to reconcile: stage the bundle in-repo, apply deltas, regenerate docs, and commit
- The retry MUST NOT return a hard refusal treating absence as corruption
- Once the in-repo projection is committed and matches, subsequent retries converge to the idempotent no-op

---
