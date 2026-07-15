---
name: adv-coordinate
description: Audit project changes, Epic alignment, sequencing, and membership health
---

# ADV Coordinate — Project Change and Epic Alignment Audit

Run a read-first coordination pass across each participating project's in-flight changes, active Epics, and current repository evidence. Produce a repository freshness, project-change inventory, overlap, alignment, sequencing, dependency, and membership-health report; apply durable Epic actions only after explicit approval through typed Epic tools.

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
| `/adv-coordinate` | Audits each participating project's in-flight changes plus active Epics as a set and proposes coordination actions. |
| `/adv-cleanup` | Triages active changes; does not mutate Epic roadmap structure. |
| `bin/adv epic list --json` | Read-only CLI list; no CLI mutation verbs. |

Epic membership remains optional; order stays advisory — may guide display/next-work but must not block gates, tasks, promotion, or change progress.

## Parse Arguments

- Default: all active Epics in the current project.
- Optional future filters may narrow by Epic ID or repo scope, but v1 must not require filters to run safely.
- Reject unknown flags with a short example; do not infer hidden mutation intent from arguments.

---

## Phase 1: Project and Epic Inventory (Read-First)

Inventory every participating project's in-flight changes using typed `adv_change_list` with complete pagination before Epic-dependent alignment. Describe typed `scope: "product"` and explicit `target_path`; do not infer target paths. When expected product context is unavailable, cross-project conclusions must be `freshness_limited` or `judgment_call`, never `adv-backed-fact`.

Use typed tools only:

| Purpose | Tool |
|---|---|
| List in-flight changes across participating projects | `adv_change_list` with complete pagination |
| List active Epics | `adv_epic_list` |
| Inspect each Epic fully | `adv_epic_show view: "full"` |
| Inspect linked changes when needed | `adv_change_show` |
| Check relevant spec law | `adv_spec` |

If no active Epics exist, report project inventory first, then `No active Epics. No coordination actions.` and stop.

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

Compare active Epic entries and linked change artifacts against current repository evidence before proposing durable actions.

| Planned work | Current repository comparison |
|---|---|
| Shell entries | Compare title and success hint to recent commits, changed files, and nearby code evidence. |
| Linked changes | Compare proposal/agreement/design/task summaries to current code, recent commits, and diff evidence. |
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
| Operational-work grounding | Required operational work is represented by typed `ops_followup_links[]` from the relevant delivery change (via `adv_followup_promote`), not by shell entries, agenda text, or prose; the `blocks` vs release-first (`follows_release`/`monitors`/`cleanup_after`) relationship matches the work's release-safety need. |
| Evidence grounding | Claims cite typed ADV/spec/current repository evidence when checkable. |

Heuristics may rank/group likely findings; typed reads + cited current repository evidence own correctness; separate evidence-backed facts from judgment calls.

Prefer narrative cross-links over duplicating the same work in multiple Epics.

For operational-work findings, cite the delivery change's `ops_followup_links[]` (child/source-of-truth state or fresh reconciliation, not stale parent link status) as `adv-backed-fact`. Treat free-text-only operational tracking — shell entries, agenda items, or prose without a typed linked ops follow-up — as a `judgment_call` to repair through `adv_followup_promote` from the relevant delivery change, never as authoritative proof. Use `blocks` when release safety requires completion before release and release-first relationships (`follows_release`/`monitors`/`cleanup_after`) for post-release follow-through; do not recommend executing deployments from coordination, and do not let Epic order block release.

---

## Phase 5: Sequencing Audit

Build an advisory dependency view from:

- entry success hints;
- existing change titles/proposals when available;
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
| `target_unreachable` | Surface target path/project context; recommend audited `adv_epic_repair_membership dryRun: true` where appropriate. |
| `projection_pending` | Recommend sync-child projection repair after user approval. |
| `projection_stale` | Recommend stale projection repair with evidence. |
| Missing child workflow | Recommend parent-only stale-entry repair or audited retarget only with explicit evidence. |

Do not silently mutate. Repairs require `evidence`; target-routed repairs follow target-path trust rules.

---

## Phase 7: Present Coordination Report

Emit grouped report:

- Inventory summary: Projects scanned, Changes by project, Epics scanned, entries scanned, health counts.
- Repository freshness summary: current branch, HEAD SHA, default/upstream relation, remote freshness, ahead/behind state, and dirty work risk where available.
- Current repository overlap findings: `repo_backed_fact`, `adv-backed-fact`, `judgment_call`, and `freshness_limited` counts and evidence.
- Alignment findings: clear-cut vs judgment calls.
- Sequencing findings: inversions, capstone placement, proposed `entry_ids` order.
- Health findings: status, evidence, suggested repair mode.
- Proposed durable actions: narrative updates, reorders, membership repairs.
- No-action findings: already aligned, intentionally advisory, current repository evidence shows plan still valid, or out of scope.

For each durable action include:

- affected Epic ID and current version;
- exact rationale and evidence;
- evidence label (`repo_backed_fact`, `adv-backed-fact`, `judgment_call`, or `freshness_limited`);
- tool that would apply it (`adv_epic_update`, `adv_epic_reorder`, `adv_epic_repair_membership`);
- required inputs such as `expected_version`, `entry_ids`, `mode`, and `evidence`.

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
| Narrative/title update | `adv_epic_update` with current `expected_version` |
| Advisory reorder | `adv_epic_reorder` with full `entry_ids` and current `expected_version` |
| Membership repair | `adv_epic_repair_membership` with `mode`, target entry/change, `evidence`, and `dryRun` first when risk exists |

Before mutation, confirm the Epic version still matches the report's `expected_version`. If stale, re-read with `adv_epic_show`, re-present the changed action, and require fresh approval.

Apply action groups atomically where the tool supports it. If one approved action fails, report exact failure and continue only when later actions are independent.

---

## Final Report

Emit:

- Projects scanned.
- Changes by project.
- Epics scanned.
- Entries scanned.
- Findings by category.
- Actions approved/applied/skipped/failed.
- Remaining judgment calls.
- Safe retry command or repair recommendation.

## Key Tools

| Purpose | Tool |
|---|---|
| List Epics | `adv_epic_list` |
| Show Epic | `adv_epic_show` |
| Update narrative/title | `adv_epic_update` |
| Reorder entries | `adv_epic_reorder` |
| Repair membership | `adv_epic_repair_membership` |
| Inspect linked change | `adv_change_show` |
| Check spec law | `adv_spec` |
