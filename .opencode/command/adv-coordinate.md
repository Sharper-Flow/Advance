---
name: adv-coordinate
description: Audit project changes, Epic alignment, sequencing, and membership health; includes Epic-unlinked in-flight changes
---

# ADV Coordinate — Project Changes and Epic Coordination Audit

Run a read-first coordination pass across each participating project's in-flight changes, active Epics, and current repository evidence. Produce a repository freshness, project-change inventory, overlap, alignment, sequencing, dependency, and membership-health report for change-scoped and Epic-scoped findings; apply durable Epic actions only after explicit approval through typed Epic tools.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Command Boundary

**Produces:** Project-change and Epic coordination report, repository freshness summary, current repository overlap findings, ownership-boundary findings, narrative accuracy findings, cross-Epic dependency notes, advisory sequencing recommendations, membership-health findings, and approved action results.

**× MUST NOT:** create tasks, complete gates, add CLI mutation verbs, make Epic membership mandatory, auto-enroll changes into Epics, treat Epic order as blocking, add Jira-like assignments/estimates/sprints/boards/ownership workflow, mutate without explicit approval, access ADV external state through filesystem paths, merge, rebase, checkout, reset, clean, stash, or mutate product code.

**Gate:** None.

## Boundary vs Nearby Commands

| Command | Relationship |
|---|---|
| `/adv-epic` | Creates or updates one Epic after goal-first confirmation. |
| `/adv-coordinate` | Audits each participating project's in-flight changes, including Epic-unlinked changes, plus active Epics as a set and proposes coordination actions. |
| `/adv-cleanup` | Retains change closure and triages active changes; does not mutate Epic roadmap structure. |
| `bin/adv epic list --json` | Read-only CLI list; no CLI mutation verbs. |

Epic membership remains optional; order stays advisory — may guide display/next-work but must not block gates, tasks, promotion, or change progress.

## Parse Arguments

- Default: all in-flight changes and all active Epics in the current project.
- Optional future filters may narrow by Epic ID or repo scope, but v1 must not require filters to run safely.
- Reject unknown flags with a short example; do not infer hidden mutation intent from arguments.

---

## Phase 1: Project and Epic Inventory (Read-First)

Inventory every participating project's in-flight changes using typed `adv_change_list` with complete pagination before Epic-dependent alignment. Follow each page's `hasMore` and `resumeHint` until the in-flight population is exhausted; a single `adv_change_list` call is not complete inventory. Describe typed `scope: "product"` and explicit `target_path`; do not infer target paths. When expected product context is unavailable, cross-project conclusions must be `freshness_limited` or `judgment_call`, never `adv-backed-fact`.

Use typed tools only:

| Purpose | Tool |
|---|---|
| List in-flight changes across participating projects | `adv_change_list` with complete pagination |
| List active Epics | `adv_change_list filter: {kind: "epic"}` |
| Inspect each Epic fully | `adv_change_show include: {entries: true}` |
| Inspect linked changes when needed | `adv_change_show` |
| Check relevant spec law | `adv_spec` |

Report project-change inventory first. If no active Epics exist, report `No active Epics. No Epic-dependent coordination actions.` for Epic-dependent findings only, then continue change-scoped overlap, sequencing, and refactor-coverage analysis; this condition must not stop the run or suppress change-scoped analysis. <!-- rq-epicCoordinateChangeCoverage01 -->

Record:

- Projects scanned
- Changes by project
- Epics scanned
- Entries scanned
- For each Epic: Epic ID, title, narrative, version, derived scope label.
- Entries, order, kind (`shell` or `change`), title, success hint, member status.
- Terminal summaries or compact history when available.
- Health signals including `target_unreachable`, `projection_pending`, `projection_stale`, or missing child state.

---

## Phase 2: Repository Freshness Audit

Establish current repository evidence before making alignment, sequencing, overlap, cancellation, supersession, narrative, reorder, retarget, or no-action conclusions that depend on current code.

Gather and report bounded signals where available:

| Signal | Evidence to record |
|---|---|
| Current branch | Branch name and current HEAD SHA. |
| Default/upstream relation | Default branch, upstream branch, and remote tracking relation. |
| Remote freshness | Bounded remote-ref refresh such as `git fetch --prune`; if it fails, mark `freshness_limited`. |
| Ahead/behind state | Ahead/behind counts versus upstream/default branch when available. |
| Dirty work risk | Uncommitted work, staged changes, untracked files, or other dirty worktree signals. |
| Recent repository changes | Recent commits or diff evidence relevant to Epic entries or linked changes when inferable. |

Repository freshness discovery may refresh remote refs, but must not merge, rebase, checkout, reset, clean, stash, or mutate product code.

If repository freshness cannot be established, report `freshness_limited`, cite the missing signal, and avoid evidence-backed conclusions that depend on missing repo state.

---

## Phase 3: Current Repository Overlap Audit

Compare active Epic entries and all in-flight change artifacts, including Epic-unlinked nonterminal changes, against current repository evidence before proposing durable actions.

| Planned work | Current repository comparison |
|---|---|
| Shell entries | Compare title and success hint to recent commits, changed files, and nearby code evidence. |
| Linked changes | Compare proposal/agreement/design/task summaries to current code, recent commits, and diff evidence. |
| Epic-unlinked nonterminal changes | Compare proposal/agreement/design/task summaries to current code, recent commits, and diff evidence on the same terms as linked changes. |
| Terminal entries/history | Use terminal summaries and current code evidence to decide whether remaining work is still valid. |

Classify every finding with one of these stable labels:

| Label | Meaning |
|---|---|
| `repo_backed_fact` | Current repository code, commit, or diff evidence supports the conclusion. |
| `adv-backed-fact` | Typed ADV state supports the conclusion. |
| `judgment_call` | Plausible overlap or sequencing issue needs user/domain review. |
| `freshness_limited` | Repository evidence is missing or stale; the conclusion cannot be evidence-backed. |

Heuristics may rank likely overlap but must not authorize mutation.

Possible recommendations include cancel/supersede review, narrative update, advisory reorder, retarget/repair, no-action, or freshness-limited no-conclusion. All durable actions still require explicit approval and typed tools.

---

## Phase 4: Alignment Audit

Analyze each Epic and the set of Epics:

| Dimension | Check |
|---|---|
| Ownership boundaries | Entry belongs in the current Epic vs another Epic. |
| Narrative accuracy | Narrative still matches current entries and known terminal work. |
| Cross-Epic dependencies | Prerequisites are explicit in both directions where useful. |
| Operational-work grounding | Required operational work is represented by typed `ops_followup_links[]` and change/task dependencies from the relevant delivery change, not by shell entries, agenda text, or prose; the `blocks` vs release-first (`follows_release`/`monitors`/`cleanup_after`) relationship matches the work's release-safety need. |
| Evidence grounding | Claims cite typed ADV/spec/current repository evidence when checkable. |

Heuristics may rank/group likely findings; typed reads + cited current repository evidence own correctness; separate evidence-backed facts from judgment calls.

Prefer narrative cross-links over duplicating the same work in multiple Epics.

For operational-work findings, cite the delivery change's `ops_followup_links[]` (child/source-of-truth state or fresh reconciliation, not stale parent link status) as `adv-backed-fact`. Treat free-text-only operational tracking — shell entries, agenda items, or prose without a typed linked ops follow-up — as a `judgment_call` to repair through typed change/task dependency updates from the relevant delivery change, never as authoritative proof. Use `blocks` when release safety requires completion before release and release-first relationships (`follows_release`/`monitors`/`cleanup_after`) for post-release follow-through; do not recommend executing deployments from coordination, and do not let Epic order block release.

---

## Phase 5: Sequencing Audit

Build an advisory dependency view from:

- entry success hints;
- existing change titles/proposals when available;
- Epic-linked and Epic-unlinked nonterminal changes from the Phase 1 inventory;
- explicit cross-Epic prerequisite notes;
- terminal summaries.
- current repository overlap and freshness findings.

Flag:

- dependency inversions — dependent entry appears before prerequisite;
- capstone misplacement — acceptance/E2E/capstone entry appears before feeder work;
- stale order — order no longer matches current completed/in-progress/future state.

Order remains advisory. Never block gates, tasks, promotion, or change progress solely because of Epic order.

---

## Phase 6: Membership Health Audit

Report typed health findings and repair paths:

| Signal | Recommendation |
|---|---|
| `target_unreachable` | Surface target path/project context; recommend `adv_change_show` to load the Epic including entries and trigger supported bounded convergence where appropriate. |
| `projection_pending` | Recommend `adv_change_show` to load the Epic including entries and trigger supported convergence; only escalate to a typed mutation tool after user approval if convergence cannot reconcile. |
| `projection_stale` | Recommend `adv_change_show` to refresh the projection from canonical child/archive evidence. |
| Missing child workflow | Recommend parent-only stale-entry repair or audited retarget only with explicit evidence. |

Do not silently mutate. Repairs require `evidence`; target-routed repairs follow target-path trust rules.

---

## Phase 6.5: Refactor Coverage Audit

Classify follow-up coverage for out-of-date work using evidence already gathered in Phases 1, 3, and 6. Add no new tool call; this phase reads nothing the earlier phases did not already collect.

Reachability: this phase runs after the Phase 1 project inventory regardless of whether active Epics exist. When there are no active Epics, Epic-dependent findings may short-circuit, but this audit still executes for every qualifying in-flight change and may emit evidence-backed referrals.

**Candidate population.** Every nonterminal in-flight change from the Phase 1 project inventory, whether or not it is linked to an Epic. Exclude terminal (archived or closed) changes at selection time. List all qualifying candidates; do not cap the group.

**Evidence threshold.** Only a candidate whose drift is supported by `repo_backed_fact` or `adv-backed-fact` evidence may carry a command. Age, heuristic overlap ranking, and recency never qualify as authority.

Group findings as follows:

| Group | Membership | Output |
|---|---|---|
| Actionable change candidates | Nonterminal change, drift supported by `repo_backed_fact` or `adv-backed-fact` | Referral command plus candidate status at emit time |
| Epic coverage findings | Stale Epic narrative, order, or membership | Named stale field routed to the existing approval-gated Epic action |
| Review/deferred | `judgment_call`, `freshness_limited`, or unresolved evidence | Finding and reason only — no command |

**Referral form.** Emit exactly `/adv-refactor <change-id>`. That bare form is dry-run. Never emit `--execute`, `--interactive`, `--force`, or a batch invocation from coordination: `--execute` applies changes without a further approval prompt, and coordination has no authority to route a user into an ungated mutation.

**Epic findings never receive a `/adv-refactor` target.** `/adv-refactor` resolves a change ID only and has no Epic mode. Route stale Epic narrative, order, or membership to `adv_change_update` (including `reorder_entries`) or `adv_change_show` convergence exactly as Phase 9 already applies them, naming the exact stale field.

**Insufficient evidence never produces a referral.** When a candidate's evidence cannot be resolved — unreadable artifact, failed or timed-out read, or missing repository freshness — classify it `freshness_limited` and place it in the review/deferred group. Keep these separate from evidence-backed rows exactly as Phase 8 requires.

**Point-in-time discipline.** The report is a snapshot. Record each candidate's status as observed at emit time and state that status must be re-validated before running the referral, because `/adv-refactor` has no explicit terminal-state guard and a candidate may reach a terminal state after the report is produced.

---

## Phase 7: Present Coordination Report

Emit grouped report:

- Inventory summary: Projects scanned, all in-flight Changes by project (including Epic-linked and Epic-unlinked changes), Epics scanned, entries scanned, health counts.
- Repository freshness summary: current branch, HEAD SHA, default/upstream relation, remote freshness, ahead/behind state, and dirty work risk where available.
- Current repository overlap findings: Epic-linked and Epic-unlinked change findings, with `repo_backed_fact`, `adv-backed-fact`, `judgment_call`, and `freshness_limited` counts and evidence.
- Alignment findings: clear-cut vs judgment calls.
- Sequencing findings: inversions and capstone placement across Epic-linked and Epic-unlinked changes, plus proposed `entry_ids` order where applicable.
- Health findings: status, evidence, suggested repair mode.
- Refactor coverage findings: actionable change candidates with their dry-run `/adv-refactor <change-id>` referral and status at emit time, Epic coverage findings with their named stale field and typed action, and review/deferred candidates with no command.
- Proposed durable actions: narrative updates, reorders, membership repairs.
- No-action findings: already aligned, intentionally advisory, current repository evidence shows plan still valid, or out of scope.

For each durable action include:

- affected Epic ID and current version;
- exact rationale and evidence;
- evidence label (`repo_backed_fact`, `adv-backed-fact`, `judgment_call`, or `freshness_limited`);
- tool that would apply it (`adv_change_update`, including `reorder_entries`, or `adv_change_show` for automatic convergence);
- required inputs such as `expected_version`, `entry_ids`, and `evidence`.

---

## Phase 8: Approval

Durable Epic actions are approval-gated.

For each action group, ask for explicit approval inline. Keep `judgment_call` and `freshness_limited` findings separate from `repo_backed_fact` and `adv-backed-fact` repairs.

Allowed replies for action groups:

| Reply | Action |
|---|---|
| `approve all` | Apply all listed actions in this group. |
| `reject all` | Apply none in this group. |
| `approve 1,3` | Apply listed numbered actions only. |
| `revise` or free text | Rework report/action proposal; do not mutate. |
| `stop` / `cancel` | Stop; no remaining mutations. |

Anything else → re-prompt same action group. No LLM fallback for mutation approval.

---

## Phase 9: Apply Approved Actions

Use typed tools only:

| Action | Tool |
|---|---|
| Narrative/title update | `adv_change_update` with current revision |
| Advisory reorder | `adv_change_update reorder_entries` with full `entry_ids` and current revision |
| Membership convergence | `adv_change_show` to load the Epic including entries and trigger supported bounded convergence; escalate to `adv_change_update` only with user approval and evidence |

Before mutation, confirm the Epic version still matches the report's `expected_version`. If stale, re-read with `adv_change_show`, re-present the changed action, and require fresh approval.

Apply action groups atomically where the tool supports it. If one approved action fails, report exact failure and continue only when later actions are independent.

---

## Final Report

Emit:

- Projects scanned.
- Changes by project.
- Epics scanned.
- Entries scanned.
- Findings by category.
- Refactor coverage: actionable, Epic coverage, and review/deferred candidate counts.
- Actions approved/applied/skipped/failed.
- Remaining judgment calls.
- Safe retry command or repair recommendation.

## Key Tools

| Purpose | Tool |
|---|---|
| List Epics | `adv_change_list filter: {kind: "epic"}` |
| Show Epic | `adv_change_show include: {entries: true}` |
| Update narrative/title | `adv_change_update` |
| Reorder entries | `adv_change_update reorder_entries` |
| Converge membership | `adv_change_show` |
| Inspect linked change | `adv_change_show` |
| Check spec law | `adv_spec` |


## Resume Projection Consumption

The `adv_resume_projection` tool (pure-read, orchestrator class) provides a structural dependency-aware "what to work on next" view. Consume `ordered_next` and `actionable[]` for sequencing recommendations instead of heuristic inference. Cross-Epic blockers surface as `redirects[]`.
