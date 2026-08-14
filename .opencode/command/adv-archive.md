---
name: adv-archive
description: "Archive completed change: apply spec deltas and finalize git"
phaseGoal: "Promote change from contract to law: apply spec deltas, capture wisdom, clean up."
---

# ADV Archive — Finalize Completed Change

Archive change → apply deltas to specs → canonical ship/finalize path via mandatory Phase 9 Git Finalization (commit, merge+push or PR auto-merge handoff, local deploy when available, verify, cleanup). Archive is not complete after `adv_change_archive`; it is complete only after Phase 9 proves post-fetch `origin/{default-branch}` reachability, merged PR state, or a local bare origin push that is verified on the remote. Pending auto-merge and blocked remote-backed outcomes leave the change active. A non-bare local repository with no `origin` remote blocks with `NO_REMOTE_RELEASE_AUTHORITY`.

## Exits

| Exit        | Condition                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Complete | All gates passed, specs updated, release committed, remote origin/merged-PR proof verified (local bare origin counts as a valid remote), local deploy run when available |
| ⏳ Pending  | PR opened/reused and GitHub auto-merge armed; release gate and archive status remain incomplete                                                                    |
| 🎤 Blocked  | Incomplete gates/tasks, merge conflicts, missing origin/PR proof, unavailable `gh`, or PR not armable                                                             |
| 🔁 Dry Run  | Preview only, no changes                                                                                                                                          |

<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
Parse `$ARGUMENTS`: `change-id` (required), `--dry-run` (optional), `--no-close-issue` (optional, see Phase 9 Step 8.5), `--close-issue` (optional backward-compatible explicit affirmative; default already closes linked issue-origin issues).
If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain.

---

## Phase 1: Pre-Archive Checks

1. `adv_change_show changeId: {id} include: { executiveSummary: true, subagentReports: true }` → verify status "active", load executive summary, Release Readiness Summary, and harden evidence for sign-off report
   - If the returned change has `epic_membership`, load compact parent context with `adv_change_show` (Epics include entries) before archive execution. Record Epic ID, entry ID/title/order, and member status when available.
   - Epic order remains advisory: earlier incomplete Epic entries MAY be warned about but MUST NOT block archive solely by order.
2. `adv_task_list` → all tasks must be "done". If incomplete → ARCHIVE BLOCKED banner → stop
3. `adv_change_show validate: true strict: true` → if fails → show errors/warnings → stop and review the validation output before retrying
4. `adv_status` → check for `[doctor]` entries: JSON/SQLite inconsistency or broken refs → block; pending WAL → warn only (advisory — benign when transient, escalate only if it persists after rerunning `/adv-status` or restarting OpenCode)
5. If `change.contract` exists → run the Contract Proof Gate below before user signoff.

### Contract Proof Gate

Archive verifies proof completeness, not product semantics from scratch. If `change.contract` exists, inspect `contract.reviewMatrix` and block archive when:

- Required contract item has no review matrix row.
- Required row status is `fail`, `violated`, or `unknown`.
- `not_applicable` row lacks rationale or contradicts the item's evidence policy.
- Task refs contain unknown contract IDs.
- Contract amendment/waiver/supersession lacks audit evidence.
- Review matrix predates a substantive contract amendment.

On pass, plan generation of `CONTRACT_TRACEABILITY.md` in archive bundle with contract item IDs, task refs, matrix status, evidence summary, and amendment audit. On failure, stop before Phase 2 and direct user to `/adv-review {change-id}` or contract re-entry/amendment.

---

## Phase 2: Archive Preview

Display: change ID/title, task count, delta count per capability, affected spec files, docs to generate, archive location, and `CONTRACT_TRACEABILITY.md` when a contract exists.

Product-linked archive: if change has `scope_repos`, display repo order, required flags, target paths, and planned `multi-repo-archive.json` evidence. All required repos must pass ff-only preflight before any archive bundle write or merge side effect. Failure stops archive with no bundle.

---

## Phase 3: Dry Run

If `--dry-run` → emit DRY RUN COMPLETE → stop.

---

## Phase 4: Gate Status

`adv_gate_status` → display all 7 gates. If any incomplete before `release` → stop with guidance.

---

## Sign-Off Report Template

Render this report after acceptance and before the Tier B approval prompt:

```
## Change Report: {id}
### Gates
[✓/○ proposal] [✓/○ discovery] [✓/○ design] [✓/○ planning]
[✓/○ execution] [✓/○ acceptance] [○ release]
### Executive Summary
{Read via adv_change_show include: { executiveSummary: true, subagentReports: true }; source from _executiveSummary, including Release Readiness Summary when /adv-harden appended it. Preserve outcome, value/why it matters, verification, risks/follow-ups, and supporting evidence for the non-technical release-approval reader. Technical terms may appear as parenthetical supporting detail. The artifact is persisted by /adv-review Phase 7 at acceptance time and enriched by /adv-harden before archive. If missing at sign-off, stop and surface the gap — do not recompose.}
### Approval Consequence Context
{Render before Tier B sign-off from executive summary, harden Release Readiness Summary, sub-agent reports, archive preflight, and follow-up blockers. Include delivered value, enabling-only/follow-up dependency, ops readiness, migration/data impact, frontend/preview impact, collision/release risk, open follow-ups, and next action. Reuse checkOpsFollowupReleaseBlockers / getOpenOpsFollowupObligations semantics: blockers block release; non-blocking follow-ups are listed as coming next. Missing harden evidence renders warning/blocked with `harden evidence unavailable`, never N/A.}
### What Was Built
{proposal + implementation summary}
### What Was Verified
- Tests: {pass/fail summary}
- Review: {verdict, finding count}
### Remaining Concerns
{open items or "None"}
---
> **{change-id}**
> acceptance ✓ → release
```

## Gate Handoff Voice Template

Use this rendering spine for user-facing gate-transition messages:

```
## Problem
{One-line restatement.}

## Chosen direction
{Per-stage anchor from voice standard doc.}

## Delivered
{Concrete artifacts, not process. Bullet list.}

---
> **{change-id}**
> {gate} ✓ → {next-gate}
>
> → `/adv-{next-command} {change-id}`
```

## Phase 5: User Signoff (Inline — Tier B)

Present the **Sign-Off Report Template** above, followed by the **Inline Approval prompt (Tier B)** per `docs/command-voice-standard.md` § Inline Approval Voice. Archive is irreversible — Tier B uses whitelist-only with no LLM fallback. On whitelist match, the agent executes archive workflow inline in same response (no separate confirmation-echo turn).

Before the Tier B prompt, render archive-time `Approval Consequence Context` from the current executive summary, harden `Release Readiness Summary`, `adv_change_show include:{subagentReports:true}`, archive preflight results, and follow-up blockers. Preserve the improved summary context at approval time: outcome, value/why it matters, verification, risks/follow-ups, and supporting evidence remain visible before sign-off. Reuse the shared renderer/model contract (`buildApprovalConsequenceContext`) for all 8 categories. Use `checkOpsFollowupReleaseBlockers` and `getOpenOpsFollowupObligations` semantics for follow-up rows: blocking obligations block release; non-blocking obligations are shown as coming next / needs done after closure.

Archive-time row rules:

- Delivered value, enabling-only/follow-up dependency, ops readiness, migration/data impact, frontend/preview impact, collision/release risk, open follow-ups, and next action must all appear before the `Reply sign off` Tier B instructions.
- Technical terms may appear as parenthetical supporting detail, but dense implementation jargon must not lead the sign-off explanation.
- Impact wording must stay evidence-only; do not fabricate business/user benefit at archive sign-off.
- Read harden `Release Readiness Summary`; if needed harden evidence is missing or unreadable, render `warning` or `blocked` with evidence `harden evidence unavailable`, never `n/a`.
- For ops runbooks and linked ops obligations, render `getOpenOpsFollowupObligations` output with authority fields: `status_source`, `completion_proof`, `verified_at`, and any `resolution_error`. An unreachable child is a warning/blocker per relationship and handoff requirement; never render unreachable child state as N/A.
- Stale parent `ops_followup_links.status` is display/cache only. Archive sign-off context must cite child/source-of-truth state or fresh verified reconciliation before treating blocking/required-handoff ops work as complete.
- Ops completion proof must include completion signal, health verification, and rollback/cleanup disposition. Missing proof blocks archive sign-off for blocking/required-handoff obligations.
- Use `n/a` only for genuinely not-applicable categories with a brief source-backed rationale.
- Do not include raw logs, diffs, task spam, or full scanner reports.
- If a row is `blocked`, stop before Tier B sign-off and surface remediation.

After change report:

```
---

> **{change-id}**
> acceptance ✓ → release

Reply `sign off` (or `signoff`, `approve`, `confirm`, `yes`, `proceed`, `ship it`) to archive,
or `dry run` to preview the archive without applying spec deltas,
or `cancel` / `stop` / `abort` to halt.
```

**Reply parsing (Tier B — strict, no LLM fallback):**

| Reply (exact match, case-insensitive, trimmed)                                 | Action                                                                                                                      |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `sign off` / `signoff` / `approve` / `confirm` / `yes` / `proceed` / `ship it` | Emit one-line acknowledgment (`Archiving {change-id}.`), then execute Phase 6 onward in same response — no second user turn |
| `dry run` / `dryrun`                                                           | Run `adv_change_archive dryRun: true`, present results, re-prompt with same options                                         |
| `cancel` / `stop` / `abort`                                                    | Halt                                                                                                                        |
| Anything else                                                                  | Re-prompt with same options. **× Do NOT** invoke LLM fallback. **× Do NOT** advance                                         |

**Anchor phrase:** `Reply `sign off``

**On whitelist match → proceed immediately.** Emit `Archiving {change-id}.` as the opening line of the response, then run Phase 6 (`adv_change_archive`) in same turn. `adv_change_archive phase9: "run"` owns Phase 9 git finalization and records the release gate after structural merge/push evidence exists. Do not call the release gate separately on the normal archive path. Tier B safety comes from the strict whitelist (no LLM fallback) plus the six prior gate approvals already cemented; no separate confirmation-echo turn is required.

**× Do NOT** use the `question` tool for archive sign-off. The inline pattern is canonical per `rq-inlineApproval01.3` (Tier B whitelist-only).

---

## Phase 5.5: Conformance Verdict Gate

Run only if the spec being archived has `conformance_required: true` in the conformance state. Skip entirely for specs with `conformance_required: false` or no conformance state.

### Steps

1. **Check conformance state.** Use the internal conformance status flow → inspect `specs[{capability}].conformance_required`. If false or absent → skip to Phase 6.

2. **Run conformance check.** Use the internal conformance run flow with `artifact_path` pointing to the CI-produced verdict artifact. Default artifact convention: `conformance-verdict.json` unless project's conformance checklist says otherwise. If the artifact does not exist, report CI outage and halt.

3. **Evaluate verdict.**

   | Verdict                      | Action                                                                                     |
   | ---------------------------- | ------------------------------------------------------------------------------------------ |
   | `PASS`                       | Continue to Phase 6.                                                                       |
   | `DRIFT`                      | **HALT.** Do NOT proceed to Phase 6. Present drift report and user options.                |
   | Artifact missing / malformed | **HALT.** Report CI outage. User must resolve externally (re-run CI, check workflow logs). |

4. **On DRIFT — present user options (inline, NOT question tool).**

   Print failing AC labels with full diagnostic:

   ```
   ## Conformance Drift Detected

   Failing acceptance criteria:
   - {rq_id}: {summary}
   - {rq_id}: {summary}

   Options:
   1. Fix code locally and rerun archive
   2. Record override through the internal conformance flow (requires user, reason, re_verify_deadline)
   3. Unlock spec for amendment through the internal conformance flow (requires user, reason, re_verify_deadline)

   Archive halted. Respond with your choice or `stop` to abort.
   ```

   **× Do NOT** auto-fix, auto-resume, or orchestrate the fix. Halt and wait for user response.

---

## Phase 6: Execute Archive

`adv_change_archive changeId: <target> worktreePath: <worktree-root> phase9: "run"` — applies deltas, writes the archive bundle into the change worktree, commits the bundle/spec artifacts on `change/{id}`, and finalizes git release evidence. It records the release gate and retires the change only after final proof exists (`origin/{default-branch}`, merged PR, or a local bare origin push verified on the remote). Pending auto-merge and blocked outcomes keep the change active. When a contract exists, archive output includes `CONTRACT_TRACEABILITY.md` only after the Contract Proof Gate passes. For product-linked `scope_repos`, inspect `multiRepo` output and `multi-repo-archive.json`; it must include before/after refs, ff-only preflight results, and verification evidence for every scoped repo.

When archiving from a worktree, pass `worktreePath: <worktree-root>` so the in-repo bundle lands in the worktree's `.adv/archive/` directory and Phase 9 Step 1 can stage it on change branch without `cp -r` workarounds. Omit `worktreePath` only for dry runs, `phase9: "skip"`, or existing-bundle recovery where the change worktree has already been cleaned up and main-checkout evidence can prove release completion.

---

## Phase 7: Verify

For each affected capability: `adv_spec action: "show"` → verify new requirements present. Verify archive directory exists with change.json and ARCHIVE_SUMMARY.md.

Epic child archive verification:

- If the change has no `epic_membership`, record `Epic: n/a` for the final report.
- If the change has `epic_membership`, reload the parent Epic with `adv_change_show` (Epics include entries) after `adv_change_archive phase9: "run"` returns shipped/merged release proof.
- Verify the linked entry by `entry_id` and/or `change_id` shows terminal child state through `terminal_summary`, compact history, or an equivalent typed Epic view field.
- If the Epic entry/member projection is `projection_stale`, `projection_pending`, `target_unreachable`, or otherwise stale, run `adv_change_show` to load the Epic including entries and trigger supported bounded convergence. For already-archived children whose entries still appear active, use `adv_change_show` to backfill `terminal_summary` from canonical child/archive evidence so Epic progress can recompute. Do not read or edit ADV state files directly.
- Epic verification/repair evidence is additive. It never substitutes for Phase 9 release proof and it never allows "Shipped." when release proof is missing.

---

## Phase 8: Archive Report

Before the final archive report, invoke reflection (non-blocking) and capture the result for the report:

- `adv_reflect changeId: {change-id}` → produce the reflection report
- Runs after archive directory creation (Phase 6) and before the final archive report
- If reflection succeeds → record `Reflection: completed: {reflection-id/path/one-line summary}`
- If reflection fails → record `Reflection: failed: <reason>; nonblocking`, emit `[ADV:WARN] Reflection generation failed: {reason}; does not block release. Rerun /adv-reflect {change-id} later.`
- Reflection report is informational only and never blocks release unless it exposes a structural release-safety failure already covered by Phase 9 proof, contract proof, conformance, or merge/push reachability checks.

Use archive terminal variant of the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Archive terminal variant`). The terminal verb branches by release-proof state; deploy/reflection failures stay visible in Delivered lines but do not choose the terminal verb unless they expose a structural release-safety failure:

- **Shipped.** — `origin/{default-branch}` reachability, merged PR proof, or verified local bare origin push exists
- **Pending auto-merge.** — PR opened/reused and GitHub auto-merge armed; release remains incomplete
- **Blocked.** — remote-backed release proof missing, PR/auto-merge unavailable, fetch/push/conflict failure, no `origin` remote configured on a non-bare local repository (`NO_REMOTE_RELEASE_AUTHORITY`), or validation failed

Include the final `Approval Consequence Context` summary status in the archive report, using the carried-forward `Release Readiness Summary`; if harden evidence was unavailable, surface `harden evidence unavailable` rather than changing the row to `n/a`.

```
## {Shipped. | Pending auto-merge. | Blocked.}

## Problem
{One-line restatement of the problem this change addressed.}

## Chosen direction
What shipped, waits on PR auto-merge, or blocked release completion; include spec deltas applied.

## Delivered
- Spec deltas applied: {added/modified/removed counts per capability}
- Docs generated
- Archive location: {path}
- Git merge: {default-branch} ({merge-mode: ff-only | reconcile | pr})
- Push: {SHA range pushed | n/a: no origin | branch pushed for PR | blocked: <reason>}
- Release proof: {origin/{default-branch} reachable | PR {number} state MERGED | verified local bare origin push | pending PR {number} | missing: <reason>}
- PR: {n/a | <url> auto-merge armed | <url> manual merge required | unavailable: <reason>}
- Local deploy: {ran | ran; OpenCode activation pending restart | not available | not needed | failed: <reason>; nonblocking}
- Epic: {n/a | {epic_id}/{entry_id} terminal state verified | terminal projection recorded | membership converged via adv_change_show | warning: <reason>}
- Reflection: {completed: <id/path/summary> | failed: <reason>; nonblocking}
- Pre-push hooks: {hooksPath | githooks | husky | lefthook | standard | none}
- Asset sync: {auto via hook | manual fix | not needed | n/a}
- Cleanup: {worktree + temp artifacts | not run; change remains active}
- Continue from: {mainCheckout} ({default-branch})

---

> **{change-id}** · {release ✓ | release pending | release blocked} · {Shipped. | Pending auto-merge. | Blocked.}
```

## Phase 9: Git Finalization (Mandatory)

Runtime enforcement lives in `plugin/src/tools/archive-helpers/git-finalize.ts`
and the archive-owned release-gate recording/projection-proof path. This
markdown remains the human-facing orchestration recipe; the helper module is
the shared runtime contract used by direct tool paths. When this slash-command path calls
`adv_change_archive`, it passes `phase9: "run"` with `worktreePath` so the
shared helper owns the structural git finalization.

> **Invariant: main checkout stays on the default branch.** ADV NEVER runs `git checkout` or `git switch` on any worktree (or on the main checkout) during archive. Trunk is updated in place via `git -C "$MAIN" merge --ff-only`. The agent MUST resolve `$MAIN` once at the start of Phase 9 (Step 3) and use it for all default-branch operations (fetch, merge, push, verify, hook detection) through Step 7. If main is not on the default branch, the readiness check (Step 4.4) hard-blocks and asks user. If main is on the default branch but dirty, ADV commits pre-existing changes as an auditable checkpoint and continues — ADV does not create new change-owned work on main.

> **Completion bar:** Do not say "archived", "shipped", or "done" after only the archive bundle commit or a partial `adv_change_archive` result. The archive workflow owns finalization through `origin/{default-branch}` reachability, merged PR proof, or a verified local bare origin push; local deploy (when `scripts/deploy-local.sh` exists); release-gate recording; reflection; and clean working tree status. If remote-backed finalization is pending or unverified, the terminal report MUST say `Pending auto-merge.` or `Blocked.`, not `Shipped.`. A repository with no `origin` remote and no local bare origin blocks with `NO_REMOTE_RELEASE_AUTHORITY` and reports `Blocked.`.

> **Ordering invariant (rq-releaseFinalization01 AC1):** Release gate completion MUST happen BEFORE archive status transition. The structural sequence is: Phase 9 evidence → release gate signal → durable proof verification → `change.status = "archived"` → source cleanup. If release gate confirmation or durable proof fails, the change stays active for retry. Archive retry with an existing bundle reconciles release metadata without re-running the full archive write.

### Step 1: Stage and Commit (in the worktree, on change branch)

The runtime helper stages `.adv/` archive/spec artifacts and commits them on the **change branch in the worktree** with `Archive {change-id}: apply spec deltas and bundle`. Human orchestration may stage additional docs before archive, but runtime finalization only owns the `.adv/` archive/spec bundle. If commit fails → stop.

### Step 2: Detect Default Branch

`git symbolic-ref refs/remotes/origin/HEAD` || `git config --get init.defaultBranch` || local `main` || local `trunk`. If UNKNOWN or remote HEAD looks stale → ask user.

### Step 3: Resolve Main Checkout Path (`$MAIN`)

```
MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
```

This resolves to the absolute path of the main checkout root from any workdir (worktree or main). Used for every subsequent default-branch operation through Step 7. If running from the main checkout itself, `$MAIN` equals current working directory and `git -C "$MAIN" ...` is a no-op prefix — same commands work in both modes.

### Step 3.5: Advisory Overlap + Merge-Order Scan

1. **Active change overlap** — `adv_change_list` → if other active changes touch same files or same local subsystem → mark `overlap-risk`
2. **Merge-order queue** — call `computeMergeOrder($MAIN)` from `plugin/src/validator/merge-order.ts` to get topologically sorted queue of archived-but-unmerged changes.
   - If queue is empty or unavailable → proceed
   - If current change appears in queue with `dependsOn` entries that are still unmerged → mark `queue-blocked` (route to PR workflow)
   - If earlier-archived changes with overlapping files are still unmerged → mark `overlap-risk` (even if no active changes overlap)
3. **Policy check** — If branch policy, review requirement, or publish safety makes local merge-back the wrong fit → mark `pr-risk`

### Step 4: Refresh Merge Basis

- `git -C "$MAIN" fetch origin {default-branch}` when `origin` exists
- If fetch succeeds → use `origin/{default-branch}` as freshness reference
- If fetch fails and a PR/publish path is required → stop and ask user before proceeding
- If no remote is configured and `origin` is not a local bare repository → stop with `NO_REMOTE_RELEASE_AUTHORITY`; do not fast-forward the local default branch

#### Step 4.4: Main Checkout Readiness Check

Before any merge attempt, verify the main checkout is in a state ADV can safely operate on:

1. `git -C "$MAIN" branch --show-current` → MUST equal `{default-branch}`. If not → **STOP**. Report the actual branch. Tell user: "Main checkout at `$MAIN` is on branch `<actual>`, expected `{default-branch}`. ADV will not switch branches. Restore main to `{default-branch}` (commit or stash any work in `$MAIN`, then `git -C "$MAIN" switch {default-branch}`) and retry."
2. Verify git identity: `git -C "$MAIN" var GIT_COMMITTER_IDENT` → MUST succeed. If not → **STOP** with `MISSING_GIT_IDENTITY`. Tell user: "Git committer identity is not configured. Set `user.name` and `user.email` in `$MAIN` and retry."
3. Detect in-progress git state: check for `MERGE_HEAD`, `REBASE_HEAD`/`.git/rebase-merge`, `CHERRY_PICK_HEAD`, `REVERT_HEAD` in `$MAIN`. If any detected → **STOP** with `MAIN_IN_PROGRESS_STATE`. Tell user: "Main checkout at `$MAIN` is in an active `<operation>` state. ADV will not commit over in-progress git operations. Resolve the `<operation>` state and retry."
4. If main is dirty (non-ignored changes present):
   - ADV commits all non-ignored tracked and untracked changes: `git -C "$MAIN" add -A && git -C "$MAIN" commit -m "chore(adv-archive): checkpoint main before archiving {change-id}"`.
   - Record the checkpoint commit SHA on the finalization outcome.
   - If the commit fails → **STOP** with `MAIN_CHECKPOINT_FAILED` and the underlying git error.
   - Report the checkpoint SHA in the terminal output.
   - Continue to Step 4.5 without user interruption.
5. If main is clean → proceed to Step 4.5.

> The checkpoint is an auditable record of pre-existing main state, not permission to bypass worktree isolation. Archive bundle and spec artifacts are authored in the change worktree and merged normally. ADV does not create new change-owned work on main.

× ADV MUST NOT attempt to switch main's branch, stash main's working tree, abort an in-progress operation, or otherwise rewrite main's state on user's behalf. Only the checkpoint commit (step 4) creates a new commit, and only when main is on the correct branch with clean git identity and no in-progress state.

#### Step 4.5: Choose Integration Path

Runtime helper outcomes:

- **direct / remote fast path** — `origin` exists (or is a local bare repository), direct push is allowed, merge succeeds, `git push origin {default-branch}` succeeds, and post-fetch `origin/{default-branch}` reachability is proven → release may complete as `Shipped.`. A non-bare local repo with no `origin` remote blocks with `NO_REMOTE_RELEASE_AUTHORITY`.
- **merge_queue / queue path** — branch rules require merge queue → push `change/{change-id}`, open/reuse one PR, queue via documented GitHub `merge_group` semantics, and report `Pending auto-merge.` while release remains incomplete until PR state is `MERGED` or origin/default reachability is proven. This path skips local reconciliation because the queue provides freshness via `merge_group`.
- **merge_queue / queue path** — branch rules require merge queue → push `change/{change-id}`, open/reuse one PR, queue via documented GitHub `merge_group` semantics, and report `Pending auto-merge.` while release remains incomplete until PR state is `MERGED` or origin/default reachability is proven. This path skips local reconciliation because the queue provides freshness via `merge_group`.
- **pr_auto_merge / pending path** — default branch is protected or publish risk requires PR workflow and merge queue is not required → push `change/{change-id}`, open/reuse one PR, arm GitHub auto-merge, and report `Pending auto-merge.` while release remains incomplete until PR state is `MERGED`.
- **pr_manual / blocked path** — PR creation, queuing, or auto-merge cannot be established (`gh` unavailable, auth failure, allow_auto_merge disabled, merge queue unavailable, checks missing, PR not armable) → report `Blocked.`; release remains incomplete.
- **blocked / reconcile externally** — if merge, fetch, or proof checks fail, runtime reports diagnostics and keeps cleanup blocked.

### Step 4 — Conflict-recovery flow (post-J3 expansion)

> Runtime wiring lives in `plugin/src/tools/archive-helpers/git-finalize.ts`; this section explains operator-facing behavior only.

When `git rebase` surfaces conflicts during Phase 9, /adv-archive runs the full classification + resolution loop:

1. **Detect conflicts** — `git diff --name-only --diff-filter=U` lists conflicting files.
2. **Classify each conflict** — `classifyConflict(filePath, hunks, repoRoot)` from `plugin/src/tools/archive-helpers/conflict-classify.ts` (T28d) returns one of three classes:
   - `duplicate_content` — to-be-applied tree matches `origin/<default>` (T28's `detectSkipDuplicate`)
   - `auto_resolvable_trivial` — whitespace/line-ending only (no semantic delta)
   - `divergent_content` — semantic divergence requires user input
3. **Drive the resolution loop** — `navigateConflicts({ conflicts, repoRoot, deps })` from `plugin/src/tools/archive-helpers/conflict-loop.ts` (T28c) presents the batch summary and reads user's mode choice:
   - `auto` — apply skip + auto_resolve in original order; prompt for each divergent
   - `step` — sequential walk; user confirms or overrides every conflict
   - `abort` — `git rebase --abort` and halt
4. **Apply per-conflict actions** — `applyResolveAction(action, filePath, repoRoot, deps)` from `plugin/src/tools/archive-helpers/conflict-resolve.ts` (T28b). Action kinds:
   - `skip` → `git rebase --skip`
   - `auto_resolve` → write resolved content (THEIRS side) → `git add` → `git rebase --continue`
   - `user_resolve_in_place` → same as auto_resolve, audit notes user's rationale
   - `abort_rebase` → `git rebase --abort` (halts archive)
   - `skip_with_decision` → `git rebase --skip` with audit reason
5. **Continue rebase** — `git rebase --continue` after each successful resolve; `git rebase --skip` for skips; `git rebase --abort` for the abort path. If the abort path is taken, do NOT delete worktree; leave it for the user to resolve the conflicting files and retry archive.
6. **Audit log** — every applied action produces an audit entry (class + reason + user decision when applicable). The aggregate is recorded in NavigationResult.applied[].

#### Example A — clean rebase (Step 4 not invoked)

```
$ git rebase origin/trunk
Successfully rebased and updated refs/heads/change/feature.
```

navigateConflicts is not invoked (no conflicts detected).

#### Example B — single duplicate-content (auto-skip)

```
$ git rebase origin/trunk
CONFLICT (content): Merge conflict in src/foo.ts
```

classifyConflict returns `duplicate_content` (tree at REBASE_HEAD matches origin/trunk for src/foo.ts).
navigateConflicts presents summary `auto-skippable: 1`. User picks `auto`. applyResolveAction runs `git rebase --skip` with audit "duplicate-content commit (T28: tree matches origin/trunk)".

#### Example C — multi-mixed (batch summary → `auto` mode → 1 user prompt for divergent)

```
$ git rebase origin/trunk
CONFLICT (content): Merge conflict in a.ts (whitespace only)
CONFLICT (content): Merge conflict in b.ts (already on trunk)
CONFLICT (content): Merge conflict in c.ts (semantic)
```

classifyConflict returns 1 trivial, 1 duplicate, 1 divergent.
navigateConflicts presents:
`auto-skippable: 1, auto-resolvable: 1, divergent: 1. Reply auto/step/abort.`
User picks `auto`. b.ts skipped, a.ts auto-resolved (THEIRS side written + add + continue), c.ts escalated → resolveDivergent stub returns user_resolve_in_place. All 3 audit entries captured.

### Step 5: Publish Safety (merge+push finalization for the default branch)

Before pushing, projects may run the Local Deploy Gate below when required by their release policy. The runtime helper currently enforces merge/push evidence; deploy execution remains human/agent orchestration unless project tooling adds a runtime hook.

#### Step 5.0: Local Deploy Gate — Deploy visibility

If `$MAIN/scripts/deploy-local.sh` exists and is executable:

1. Run `git -C "$MAIN" status --porcelain` and require it to be empty before deploy.
2. Run `"$MAIN/scripts/deploy-local.sh" --fix` from `$MAIN`; capture output verbatim.
3. If deploy fails → record `deploy_action: failed` with reason and keep it as a nonblocking advisory; continue finalization unless the failure also proves a structural release-safety failure (dirty main after deploy, missing release evidence, failed conformance/contract proof, merge reachability failure, or push safety failure). Report `Local deploy: failed: <reason>; nonblocking` prominently in Phase 8.
4. If deploy succeeds → record `deploy_action: ran` for Phase 8.

If the script is absent → record `deploy_action: not available`. If the project explicitly documents that no local deploy is needed → record `deploy_action: not needed` with the source of that evidence.

> **Local runtime activation callout.** `deploy_action: ran` means assets synced to the runtime path — it does NOT reload already-running OpenCode sessions, which keep the cached bundle in process memory. To activate local runtime changes after archive:
>
> 1. Run `./scripts/deploy-local.sh --fix` from the repo root as the primary deploy. It rebuilds a stale plugin distribution before syncing to the runtime path, so no separate manual build step is required.
> 2. Restart the relevant OpenCode session / plugin host so host-loaded tool code reloads, then re-invoke the affected tool. OpenCode does not auto-restart or live-reload the host from deploy; activation requires the restart.
>
> Deploy completion is not reload proof. Do not claim live behavior changed until a fresh session has loaded the rebuilt bundle, and re-invoke the affected tool only after restart. Record activation status through the existing Phase 8 `Local deploy` row: when `deploy_action: ran` is recorded but the rebuilt bundle is not yet loaded by a restarted host, set the existing `Local deploy` field to `ran; OpenCode activation pending restart`; do not append a separate activation line to the report.

After local merge succeeds, archive finalization attempts a safe remote push of the default branch from `$MAIN` when `origin` exists:

- `git -C "$MAIN" fetch origin` (if fetch fails or auth is unclear → stop and ask user before proceeding)
- `git -C "$MAIN" log --oneline origin/{default-branch}..{default-branch}` → inspect the commits that will publish
- If `origin/{default-branch}..{default-branch}` is a clean fast-forward → `git -C "$MAIN" push origin {default-branch} 2>&1` (capture output verbatim — do NOT redirect to `/dev/null`; agent must observe pre-push hook output)
- × Do NOT force-push the default branch. If remote divergence is detected, report `Blocked.` or route through PR workflow.
- If push succeeds → fetch `origin {default-branch}` and verify `origin/{default-branch}` contains the change before release recording.
- If push is rejected, fails, is skipped, or cannot be verified while `origin` exists → reconcile local default branch back to `origin/{default-branch}` when safe, push `change/{change-id}`, open/reuse PR, and arm GitHub auto-merge when possible. Terminal becomes `Pending auto-merge.` when auto-merge is armed; otherwise `Blocked.`. Release gate, archive status, issue closure, branch deletion, and worktree cleanup remain incomplete.

If push hook output indicates failure (non-zero hook exit) but push itself succeeded: report it in Phase 8 but do NOT block — pre-push hook is best-effort sync; failure does not invalidate the push.

If no remote is configured and the origin is not a local bare repository: block with `NO_REMOTE_RELEASE_AUTHORITY` — Phase 8 footer becomes `Blocked.` with reason. Remote-backed push failure never becomes a local-only success.

### Step 5.5: Pre-Push Hook Detection

Before pushing (Step 5), detect what project automates on pre-push so the agent can report what fired. Inspect the **main checkout** (`$MAIN`), since that is where the push runs. Do not rely on hooks as the only local deploy path when `scripts/deploy-local.sh` is present; Step 5.0 already ran it explicitly.

Detection (in order; stop at first match):

1. `git -C "$MAIN" config --get core.hooksPath` — if set AND `<path>/pre-push` exists AND is executable → `hook_strategy: hooksPath`
2. `$MAIN/.githooks/pre-push` exists AND executable → `hook_strategy: githooks`
3. `$MAIN/.git/hooks/pre-push` exists AND executable AND not the `.sample` file → `hook_strategy: standard`
4. `$MAIN/.husky/pre-push` exists → `hook_strategy: husky`
5. `$MAIN/lefthook.yml` (or `lefthook.yaml`) exists with `pre-push:` section → `hook_strategy: lefthook`
6. None of the above → `hook_strategy: none`

Asset deploy gap check:

- `hook_strategy == "none"` AND change touched any path in deployed asset list (`.opencode/`, `ADV_INSTRUCTIONS.md`, `skills/`, `plugin/src/`, `scripts/deploy-local.sh`) AND `$MAIN/scripts/deploy-local.sh` exists AND is executable → Step 5.0 MUST already have run; record `sync_action: manual fix`
- `hook_strategy != "none"` → `sync_action: auto via hook` (capture push output verbatim in Step 5 to observe what fired, but do not skip Step 5.0)
- No asset paths touched AND no hook → `sync_action: not needed`

Record `(hook_strategy, sync_action)` for the Phase 8 archive report (footer lines `Pre-push hooks:` and `Asset sync:`).

> **Known v1 limitation:** Husky v3 (package.json `husky.hooks.pre-push`) is not detected by the presence-only `.husky/pre-push` check. The `manual fix` fallback covers the gap when assets are touched.

### Step 6: Verify

Remote direct proof: `git -C "$MAIN" fetch origin {default-branch}` → verify `origin/{default-branch}` contains the change. Mismatch or missing reachability → report `Blocked.`, keep worktree, leave release incomplete. A local bare origin counts as a valid remote origin; verify its `origin/{default-branch}` ref after push.

PR proof: query `gh pr view <number> --json state,mergedAt,mergeCommit,autoMergeRequest`. `state == MERGED` → release may complete after origin reconciliation. `autoMergeRequest != null` and not merged → report `Pending auto-merge.`, keep release incomplete. Anything else → report `Blocked.` with reason.

### Step 7: Cleanup Worktree(s)

Auto-managed changes (`change.worktree_auto_managed: true`) may own: current repo, `target_worktree_path`, `scope_worktrees[*]`.

`collectWorktreeCleanupTargets(change)` (`plugin/src/tools/worktree/cleanup-targets.ts`) order:

1. Current-repo worktree (`change/{change-id}`).
2. `target_worktree_path` if set.
3. `scope_worktrees[*]` in `Object.keys` insertion order.

Per target, proceed only after Step 6 final release proof (`Shipped.` or verified local bare origin push):
- First call `adv_worktree_delete branch: "change/{change-id}" dryRun: true` and retain the typed `planToken` for that exact target.
- Apply with `adv_worktree_delete branch: "change/{change-id}" planToken: "{planToken}" approvalEvidence: "archive sign-off for change {change-id}"`.
- A branch-only destructive call is migration-invalid: it returns `PLAN_REQUIRED` and performs no shell or write.
- Target/scope repo: scope deletion to target repo root when tool supports it.
- No scoped tool support → stop with a typed blocker; do not issue a manual `git worktree remove` or branch delete outside the shared planner/executor.

Idempotency: already-cleaned entries skip via `adv_worktree_delete` record check.

Partial failure: one delete failure MUST NOT stop later targets. Record per-entry outcomes; surface failures in Phase 8 under `worktree_cleanup_failures`.

After each successful cleanup, archive flow clears its change field via `worktreeAttachedSignal({ role, path: null, ...})`:
- target → `target_worktree_path: null`
- scope → delete `scope_worktrees[repoId]` via signal with `repoId` + `path: null`

`adv_worktree_delete` unavailable globally → emit one info banner with manual fallback.

Legacy changes (`change.worktree_auto_managed !== true`): pre-AC4 rule. Delete only current-repo worktree, only when running inside one AND merge verified.

Successful cleanup report includes `Continue from: {mainCheckout} ({default-branch})`. Terminal-neutral wayfinding only; does not claim shell CWD changed. Terminal UX may switch attention; correctness cannot depend on it.

### Step 8: Temp Artifacts

Remove `*.bak`, `*.tmp`, `*.orig` from `$MAIN` (excluding `node_modules`).

### Step 8.5: Linked GitHub Issue Close (rq-issueChangeLinkage02)

`adv_change_archive` defaults to closing linked GH issues after durable archive transition. Agent does not run `gh issue close` manually.

**Trigger (tool-enforced):**

- `--no-close-issue` NOT passed.
- `origin.issue_number > 0` (any origin kind carrying an issue link; legacy `roadmap` origins remain close-eligible).
- Final release proof passed; archive status durable; release gate recorded.
- `dryRun` false.

**Tool behavior:**

1. Post comment: `Shipped via {change-id} ({short-sha})` (skip if re-archive bundle exists).
2. Run `gh issue close <N> --reason completed` (idempotent; already closed exits 0).
3. Cross-repo: resolve `--repo {owner}/{name}` from `github_project` config.
4. `ghNotFound` → silent skip (`close_eligible: true, issue_closed: []`).
5. Non-zero → non-fatal `issue_closure_error` + manual remediation command.

**Agent job:** inspect `issue_closed` + `issue_closure_error`. Error present → surface `[ADV:ATTN]` with manual command. Nothing else.

**Anti-patterns:**

| × Bad | ✓ Good |
|---|---|
| Agent manually runs `gh issue close` after archive | Tool handles closure; agent surfaces errors only. |
| Close issue for `origin.kind === 'discovery'` or `'adhoc'` (no `issue_number`) | Auto-close issue-linked origins only (`origin.issue_number > 0`). |
| Roll back archive on close failure | Archive state canonical; close failure advisory. |

### Completion

Emit `GIT FINALIZATION COMPLETE` only after Step 6 final proof. Include: commit SHA, release proof source (`origin/{default-branch}`, merged PR, or local bare origin push), merge target (`$MAIN` default-branch HEAD when applicable), push/PR status, local deploy status, verification status, reflection status, worktree cleanup status, artifacts removed, `Continue from: {mainCheckout} ({default-branch})`, final `git -C "$MAIN" status --short --branch`. If PR auto-merge is pending, emit `Pending auto-merge.` with the PR URL and exact retry command; do not emit final completion. If remote-backed proof is missing, emit `Blocked.` with reason. If deploy or reflection failed without structural release-safety failure, keep release complete and surface the advisory line.

### Phase 9.5: Auto-Drive Pending-PR Archive Completion

> **When archive finalization returns `phase9: "pending_merge"`, the archive tool has armed GitHub auto-merge but the PR has not yet reached `MERGED`. Instead of handing back `Pending auto-merge.` and stopping, this phase orchestrates the remaining completion in one continuous flow.**

1. **Detect.** The archive tool return shape on the `pr_auto_merge` / `merge_queue` routes is:
   ```
   { phase9: "pending_merge", finalization: { prNumber, prUrl, repoRoot, defaultBranch, route } }
   ```
   Read the nested fields from `finalization.*`, not top-level. `repoRoot` is the project git root used for remote-first isolated finalization; no shared main checkout is required.

2. **Spawn the waiter.** Use the Task tool to spawn `adv-ci-waiter` with `{ repo, prNumber, prUrl }`. Cite `~/.config/opencode/instructions/oc-ci-wait.md` for the polling contract — the **main agent never polls CI itself** (P37). `oc-ci-wait` (called by `adv-ci-waiter`) owns GitHub API polling and rate-limit backoff; the sub-agent samples `oc-ci-wait result --watch-id <id> --json` every 20–30 seconds. CI terminal statuses are `completed`, `timeout`, `cancelled`, `error`; `conclusion` is CI success/failure, NOT PR merge state. The waiter polls and reports only — it has `edit: deny` and cannot remediate. If CI fails, the waiter returns to the parent (you) with classification (failing check names, URLs, log excerpt); the parent classifies the cause, remediates in the PR worktree, pushes the fix, and re-spawns the waiter. Do not ask the waiter to remediate.

3. **Branch on the terminal result.**
   - **CI success, `PR state == MERGED`** (verified via `gh pr view <number> --json state,mergedAt,mergeCommit`):
     a. Re-call `adv_change_archive changeId: {change-id} worktreePath: {worktree} phase9: "run"`. The archive tool re-proves the merged PR through `verifyReleaseEvidenceFromMain` using canonical remote/PR evidence; it does not mutate the shared main checkout and does not ask the agent to call TypeScript directly. The archive tool is idempotent on re-call (existing-bundle/noOp path; no delta re-apply).
     b. Proceed to the existing `Shipped.` terminal rendering; release gate, archive retirement, and worktree cleanup run normally as part of `Shipped.`.
   - **CI success but PR state is not yet `MERGED`** (auto-merge still pending, queue still in flight, or merge-state check inconclusive): treat as non-terminal. Render `Pending auto-merge.` per the Non-terminal branch below. CI success alone is necessary but not sufficient; release completion requires `PR state == MERGED` or unchanged `origin/{default-branch}` reachability proof.
   - **Non-terminal** (timeout / blocked / red-CI-unresolved / missing creds / API error):
     a. Render `Pending auto-merge.` with `finalization.prUrl` and the exact retry command on its own line: `adv_change_archive changeId:{change-id} worktreePath:{worktree} phase9:"run"`.
     b. Do NOT call `verifyReleaseEvidenceFromMain` again this turn — never escalate a non-terminal waiter result into a `Shipped.`.
     c. The change stays active for later resume. Do not retire the archive; do not run worktree cleanup as part of this turn.

4. **Reference markers.** This phase exercises `rq-releaseFinalization01` (release proof requires origin/default or merged PR state), `rq-releaseFinalization02` (auto-drive trigger), `rq-releaseFinalization03` (no shared main checkout mutation), and `rq-releaseFinalization04` (non-terminal reporting).

5. **Completion fallthrough.** If the Task tool spawn is unavailable (no `adv-ci-waiter` runtime), render `Pending auto-merge.` + retry command — status quo behavior, non-regressive. The change stays active; the human re-invokes archive or runs `bin/adv doctor` to re-drive the archived-but-unmerged branch when ready.

### Step 9: Post-Deploy Nudge

After Phase 9 + Phase 8 summary, if deploy target detectable, append one line:

```
→ Deploy to production when ready
```

Production deploy is outside ADV gate lifecycle. ADV stops at verified default-branch push + local developer-environment deploy when `scripts/deploy-local.sh` exists. Production deploy remains user-initiated.

---

## Error Handling

Delta application error → ARCHIVE FAILED banner with delta ID, target, error. Change NOT archived → fix and retry.

---

## Key Tool

| Purpose | Tool                                                                            |
| ------- | ------------------------------------------------------------------------------- |
| Archive | `adv_change_archive changeId: <id> worktreePath: <worktree-root> phase9: "run"` |
