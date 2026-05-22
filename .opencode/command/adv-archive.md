---
name: adv-archive
description: Archive completed change: apply spec deltas and finalize git
phaseGoal: "Promote change from contract to law: apply spec deltas, capture wisdom, clean up."
---

<!-- manifest: adv-archive · gate: release · requiresChangeId: true · prereqs: [adv-harden] · scope: reads[specs, proposal, tasks, codebase] · modifies[specs] -->

# ADV Archive — Finalize Completed Change

Archive change → apply deltas to specs → canonical ship/finalize path via mandatory Phase 9 Git Finalization (commit, merge+push, local deploy when available, verify, cleanup). Archive is not complete after `adv_change_archive`; it is complete only after Phase 9 verifies the change branch is reachable from the default branch and the default branch push/deploy status is reported.

## Exits

| Exit        | Condition                                      |
| ----------- | ---------------------------------------------- |
| ✅ Complete | All gates passed, specs updated, release committed, merged to default branch, pushed or explicitly reported local-only, local deploy run when available, verified |
| 🎤 Blocked  | Incomplete gates/tasks or merge conflicts      |
| 🔁 Dry Run  | Preview only, no changes                       |

<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
Parse `$ARGUMENTS`: `change-id` (required), `--dry-run` (optional), `--no-close-issue` (optional, see Phase 9 Step 8.5), `--close-issue` (optional backward-compatible explicit affirmative; default already closes linked roadmap/triage issues).
If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain.

---

## Phase 1: Pre-Archive Checks

1. `adv_change_show changeId: {id} include: { executiveSummary: true }` → verify status "active", load executive summary for sign-off report
2. `adv_task_list` → all tasks must be "done". If incomplete → ARCHIVE BLOCKED banner → stop
3. `adv_change_validate strict: true` → if fails → show errors/warnings → stop and review the validation output before retrying
4. `adv_status` → check for `[doctor]` entries: JSON/SQLite inconsistency or broken refs → block; pending WAL → warn only (advisory — benign when transient, escalate only if it persists after rerunning `/adv-status` or restarting OpenCode)
5. `adv_investment_report changeId: {id}` → include investment summary in archive report (informational)
6. If `change.contract` exists → run the Contract Proof Gate below before user signoff.

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

## Phase 5: User Signoff (Inline — Tier B)

Present change report inline (per `.opencode/agents/adv.md` § Sign-Off Boundary), followed by the **Inline Approval prompt (Tier B)** per `docs/command-voice-standard.md` § Inline Approval Voice. Archive is irreversible — Tier B uses whitelist-only with no LLM fallback. On whitelist match, the agent executes archive workflow inline in same response (no separate confirmation-echo turn).

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

| Reply (exact match, case-insensitive, trimmed) | Action |
|---|---|
| `sign off` / `signoff` / `approve` / `confirm` / `yes` / `proceed` / `ship it` | Emit one-line acknowledgment (`Archiving {change-id}.`), then execute Phase 6 onward in same response — no second user turn |
| `dry run` / `dryrun` | Run `adv_change_archive dryRun: true`, present results, re-prompt with same options |
| `cancel` / `stop` / `abort` | Halt |
| Anything else | Re-prompt with same options. **× Do NOT** invoke LLM fallback. **× Do NOT** advance |

**Anchor phrase:** `Reply `sign off``

**On whitelist match → proceed immediately.** Emit `Archiving {change-id}.` as the opening line of the response, then run Phase 6 (`adv_change_archive`) in same turn. `adv_change_archive phase9: "run"` owns Phase 9 git finalization and records the release gate after structural merge/push evidence exists. Do not call the release gate separately on the normal archive path. Tier B safety comes from the strict whitelist (no LLM fallback) plus the six prior gate approvals already cemented; no separate confirmation-echo turn is required.

**× Do NOT** use the `question` tool for archive sign-off. The inline pattern is canonical per `rq-inlineApproval01.3` (Tier B whitelist-only).

---

## Phase 5.5: Conformance Verdict Gate

<!-- rq-extConfGate01 -->

Run only if the spec being archived has `conformance_required: true` in the conformance state. Skip entirely for specs with `conformance_required: false` or no conformance state.

### Steps

1. **Check conformance state.** `adv_conformance action: "status"` → inspect `specs[{capability}].conformance_required`. If false or absent → skip to Phase 6.

2. **Run conformance check.** `adv_conformance action: "run"` with `artifact_path` pointing to the CI-produced verdict artifact. Default artifact convention: `conformance-verdict.json` unless project's conformance checklist says otherwise. If the artifact does not exist, report CI outage and halt.

3. **Evaluate verdict.**

   | Verdict | Action |
   |---------|--------|
   | `PASS` | Continue to Phase 6. |
   | `DRIFT` | **HALT.** Do NOT proceed to Phase 6. Present drift report and user options. |
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
   2. Record override: `adv_conformance action: "override"` (requires user, reason, re_verify_deadline)
   3. Unlock spec for amendment: `adv_conformance action: "unlock"` (requires user, reason, re_verify_deadline)

   Archive halted. Respond with your choice or `stop` to abort.
   ```

   **× Do NOT** auto-fix, auto-resume, or orchestrate the fix. Halt and wait for user response.

---

## Phase 6: Execute Archive

`adv_change_archive changeId: <target> worktreePath: <worktree-root> phase9: "run"` — applies deltas, writes the archive bundle into the change worktree, commits the bundle/spec artifacts on `change/{id}`, finalizes git release evidence, records the release gate, then retires the change. When a contract exists, archive output includes `CONTRACT_TRACEABILITY.md` only after the Contract Proof Gate passes. For product-linked `scope_repos`, inspect `multiRepo` output and `multi-repo-archive.json`; it must include before/after refs, ff-only preflight results, and verification evidence for every scoped repo.

When archiving from a worktree, pass `worktreePath: <worktree-root>` so the in-repo bundle lands in the worktree's `.adv/archive/` directory and Phase 9 Step 1 can stage it on change branch without `cp -r` workarounds. Omit `worktreePath` only for dry runs, `phase9: "skip"`, or existing-bundle recovery where the change worktree has already been cleaned up and main-checkout evidence can prove release completion.

---

## Phase 7: Verify

For each affected capability: `adv_spec action: "show"` → verify new requirements present. Verify archive directory exists with change.json and ARCHIVE_SUMMARY.md.

---

## Phase 8: Archive Report

Use archive terminal variant of the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Archive terminal variant`). The terminal verb branches by push state:

- **Shipped.** — push succeeded AND `deploy_action` ∈ {`ran`, `not available`, `not needed`} AND `sync_action` ∈ {`auto via hook`, `manual fix`, `not needed`}
- **Merged locally.** — no remote configured OR push skipped OR push failed (with explicit reason)

```
## {Shipped. | Merged locally.}

## Problem
{One-line restatement of the problem this change addressed.}

## Chosen direction
What shipped (or merged locally), what spec deltas applied.

## Delivered
- Spec deltas applied: {added/modified/removed counts per capability}
- Docs generated
- Archive location: {path}
- Git merge: {default-branch} ({merge-mode: ff-only | reconcile | pr})
- Push: {SHA range pushed | skipped: <reason>}
- Local deploy: {ran | not available | not needed | failed: <reason>}
- Pre-push hooks: {hooksPath | githooks | husky | lefthook | standard | none}
- Asset sync: {auto via hook | manual fix | not needed | n/a}
- Cleanup: worktree + temp artifacts
- Continue from: {mainCheckout} ({default-branch})
- Investment: N tasks / M retries / T min / tier: {auto|escalate|hardstop}

---

> **{change-id}** · release ✓ · {Shipped. | Merged locally.}
```

After archive summary is displayed, invoke reflection (non-blocking):

- `adv_reflect changeId: {change-id}` → produce the reflection report
- Runs after archive directory creation (Phase 6) and after archive summary (above)
- If reflection fails → log a warning and continue — do NOT block archive
- Reflection report is informational only

---

## Phase 9: Git Finalization (Mandatory)
<!-- rq-releaseFinalization01 -->
<!-- rq-releaseFinalization01.5 -->
<!-- rq-releaseFinalization01.6 -->

Runtime enforcement lives in `plugin/src/tools/archive-helpers/git-finalize.ts`
and the archive-owned release-gate recording path. This markdown remains the
human-facing orchestration recipe; the helper module is the shared runtime
contract used by direct tool paths. When this slash-command path calls
`adv_change_archive`, it passes `phase9: "run"` with `worktreePath` so the
shared helper owns the structural git finalization. The markdown below remains
the human-facing explanation of that runtime contract.

> **Invariant: main checkout stays on the default branch.** ADV NEVER runs `git checkout` or `git switch` on any worktree (or on the main checkout) during archive. Trunk is updated in place via `git -C "$MAIN" merge --ff-only`. The agent MUST resolve `$MAIN` once at the start of Phase 9 (Step 3) and use it for all default-branch operations (fetch, merge, push, verify, hook detection) through Step 7. If main is not on the default branch or not clean, the invariant check (Step 4.4) hard-blocks and asks user — ADV does not "fix" main's state on user's behalf.

> **Completion bar:** Do not say "archived", "shipped", or "done" after only the archive bundle commit or a partial `adv_change_archive` result. The archive workflow owns finalization through default-branch merge, local deploy (when `scripts/deploy-local.sh` exists), release-gate recording, push or explicit local-only report, reachability verification, reflection, and clean working tree status. If any finalization step is skipped, failed, or unverified, the terminal report MUST say `Merged locally.` or `Blocked`, not `Shipped.`

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
- If no remote is configured or local-only archive is intended → continue with local `{default-branch}`

#### Step 4.4: Main Checkout Invariant Check (HARD GATE)

Before any merge attempt, verify the main checkout is in a state ADV can safely fast-forward into:

1. `git -C "$MAIN" branch --show-current` → MUST equal `{default-branch}`. If not → **STOP**. Report the actual branch. Tell user: "Main checkout at `$MAIN` is on branch `<actual>`, expected `{default-branch}`. ADV will not switch branches. Restore main to `{default-branch}` (commit or stash any work in `$MAIN`, then `git -C "$MAIN" switch {default-branch}`) and retry."
2. `git -C "$MAIN" status --porcelain` → MUST be empty. If not → **STOP**. List the dirty files. Tell user: "Main checkout at `$MAIN` has uncommitted changes. ADV will not merge over a dirty tree. Commit or stash them in `$MAIN` and retry."
3. Both pass → proceed to Step 4.5.

× ADV MUST NOT attempt to switch main's branch, stash main's working tree, or otherwise mutate main's state on user's behalf. This is a stop-and-ask gate.

#### Step 4.5: Choose Integration Path

Runtime helper outcomes:

- **LOCAL_FINISH / fast path** — branch is already on current default-branch basis → `git -C "$MAIN" merge --ff-only change/{change-id}`
- **Blocked / reconcile externally** — if `--ff-only` cannot merge, runtime blocks and asks the operator to rebase the change branch before retrying; Step 4 handles conflicts via the classification + resolution flow below.
- **PR workflow path / handoff** — explicit `archive_mode: "pr"` pushes `change/{change-id}` for PR workflow handoff; PR creation itself remains project/user policy unless a future helper implements it.

### Step 4 — Conflict-recovery flow (post-J3 expansion)

> × Helpers ship in T28+T28b+T28c+T28d+T28f; runtime wiring into the Phase 9 orchestrator is a follow-up.

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
5. **Continue rebase** — `git rebase --continue` after each successful resolve; `git rebase --skip` for skips; `git rebase --abort` for the abort path.
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

#### Step 5.0: Local Deploy Gate

If `$MAIN/scripts/deploy-local.sh` exists and is executable:

1. Run `git -C "$MAIN" status --porcelain` and require it to be empty before deploy.
2. Run `"$MAIN/scripts/deploy-local.sh" --fix` from `$MAIN`; capture output verbatim.
3. If deploy fails → STOP. Do not push. Report `Local deploy: failed: <reason>` and leave the worktree intact.
4. If deploy succeeds → record `deploy_action: ran` for Phase 8.

If the script is absent → record `deploy_action: not available`. If the project explicitly documents that no local deploy is needed → record `deploy_action: not needed` with the source of that evidence.

After local merge succeeds, archive finalization attempts a safe remote push of the default branch from `$MAIN` when `origin` exists:

- `git -C "$MAIN" fetch origin` (if fetch fails or auth is unclear → stop and ask user before proceeding)
- `git -C "$MAIN" log --oneline origin/{default-branch}..{default-branch}` → inspect the commits that will publish
- If `origin/{default-branch}..{default-branch}` is a clean fast-forward → `git -C "$MAIN" push origin {default-branch} 2>&1` (capture output verbatim — do NOT redirect to `/dev/null`; agent must observe pre-push hook output)
- × Do NOT force-push by default
- Before any `--force-with-lease` prompt, show both `git -C "$MAIN" log --oneline origin/{default-branch}..{default-branch}` and `git -C "$MAIN" log --oneline {default-branch}..origin/{default-branch}` so user sees local-only and remote-only commits
- Use `--force-with-lease` only after explicit user approval via the `question` tool confirms a non-fast-forward publish is intended
- If remote divergence is detected and intent is unclear → stop and ask user

If push hook output indicates failure (non-zero hook exit) but push itself succeeded: report it in Phase 8 but do NOT block — pre-push hook is best-effort sync; failure does not invalidate the push.

If no remote is configured OR push is skipped OR push fails: record the push failure/skipped reason — Phase 8 footer becomes "Merged locally." instead of "Shipped."

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

`git -C "$MAIN" log --oneline {default-branch}..change/{change-id}` → MUST return empty (every commit on change branch is reachable from default-branch). If non-empty → stop, × do NOT delete worktree.

If push was performed (Step 5 succeeded): `git -C "$MAIN" fetch origin {default-branch}` then compare `git -C "$MAIN" rev-parse origin/{default-branch}` with `git -C "$MAIN" rev-parse {default-branch}` → MUST be equal. If mismatch → stop, do NOT delete worktree, report drift in Phase 8.

### Step 7: Cleanup Worktree(s)

Auto-managed changes (`change.worktree_auto_managed: true`) may own multiple worktrees — current-repo + `target_worktree_path` + `scope_worktrees[*]`. The cleanup helper `collectWorktreeCleanupTargets(change)` (plugin/src/tools/worktree/cleanup-targets.ts) returns the deterministic iteration order:

1. Current-repo worktree (branch `change/{change-id}`).
2. `target_worktree_path` if set (cross-project mutations).
3. `scope_worktrees[*]` in `Object.keys` insertion order (product-linked changes).

For each target, only proceed if merge was verified in Step 6:
- `adv_worktree_delete branch: "change/{change-id}" reason: "Change {change-id} merged"`
- For target / scope entries, scope the deletion to the target's repo root via `workdir` if the deletion tool supports it; otherwise emit the manual fallback: `git -C "<target-repo-root>" worktree remove <path>` followed by `git -C "<target-repo-root>" branch -D change/{change-id}`.

Idempotency: re-running cleanup on an already-cleaned change is a no-op — entries already deleted by a prior archive attempt are skipped by `adv_worktree_delete`'s record check.

Partial-failure tolerance: a per-target deletion that fails MUST NOT abort iteration of subsequent targets. Record per-entry outcomes and surface failures in Phase 8's archive report under `worktree_cleanup_failures`.

After successful cleanup of each target, the archive flow clears the corresponding field on the change record via `worktreeAttachedSignal({ role, path: null, ...})`:
- target → `target_worktree_path: null`
- scope → `scope_worktrees[repoId]` deleted (signal with `repoId` + `path: null`)

If `adv_worktree_delete` is unavailable globally → emit an info banner naming the manual fallback once.

**Legacy single-worktree changes** (`change.worktree_auto_managed !== true`) follow the pre-AC4 behavior: only the current-repo worktree is deleted if running in one AND merge verified.

After successful cleanup, include `Continue from: {mainCheckout} ({default-branch})` in the archive report. This is terminal-neutral wayfinding for the agent/operator; it does not claim ADV changed the caller's shell CWD. Warp or other terminal UX may switch attention as a convenience, but correctness must not depend on it.

### Step 8: Temp Artifacts

Remove `*.bak`, `*.tmp`, `*.orig` from `$MAIN` (excluding `node_modules`).

<!-- rq-issueChangeLinkage02 -->
### Step 8.5: Linked GitHub Issue Close (rq-issueChangeLinkage02)

**Tool-driven (structural enforcement):** `adv_change_archive` defaults to closing linked GH issues for roadmap/triage origins after successful archive state transition. The agent does NOT need to shell out `gh` commands manually — the tool handles it.

**Trigger (enforced by tool code):**

- `--no-close-issue` was NOT passed.
- `origin.kind ∈ {'roadmap', 'triage'}` and `origin.issue_number > 0`.
- Push verification succeeded (archive commits reachable on default branch) — the tool fires after archive status is durable and the release gate is recorded.
- `dryRun` is false.

**Tool behavior:**

1. Posts comment: `Shipped via {change-id} ({short-sha})` (skipped on re-archive when bundle already exists).
2. Runs `gh issue close <N> --reason completed` (idempotent — already-closed returns exit 0).
3. Cross-repo: resolves `--repo {owner}/{name}` via `github_project` config when needed.
4. `ghNotFound` → silent skip (`close_eligible: true, issue_closed: []`).
5. Non-zero exit → non-fatal error in `issue_closure_error` with manual remediation command.

**Agent responsibility:** Check `issue_closed` and `issue_closure_error` in archive output. If `issue_closure_error` present, surface `[ADV:ATTN]` with the manual command. No other action needed.

**Anti-patterns:**

| × Bad | ✓ Good |
|---|---|
| Agent manually runs `gh issue close` after archive | Tool handles closure automatically; agent only surfaces errors. |
| Close issue when `origin.kind === 'discovery'` or `'adhoc'` | Only roadmap- and triage-origin changes close automatically. |
| Roll back archive on close failure | Archive state is canonical; close failure is non-fatal advisory. |

### Completion

Emit GIT FINALIZATION COMPLETE only after Step 6 verification passes: commit SHA, merge target (`$MAIN` default-branch HEAD), push status, local deploy status, verification status, worktree cleanup status, artifacts removed, `Continue from: {mainCheckout} ({default-branch})`, and final `git -C "$MAIN" status --short --branch` output. If push or deploy did not succeed, use a non-shipped terminal verb and state the exact remaining command.

### Step 9: Post-Deploy Nudge

After Phase 9 completes and archive summary is displayed (Phase 8), if project has a detectable deployment target, append a one-line nudge:

```
→ Deploy to production when ready
```

Production deployment is outside ADV's gate lifecycle — ADV stops at verified default-branch push plus local developer-environment deploy when `scripts/deploy-local.sh` exists. Production deploy remains a separate, user-initiated step.

---

## Error Handling

Delta application error → ARCHIVE FAILED banner with delta ID, target, error. Change NOT archived → fix and retry.

---

## Key Tool

| Purpose | Tool                                |
| ------- | ----------------------------------- |
| Archive | `adv_change_archive changeId: <id> worktreePath: <worktree-root> phase9: "run"` |
