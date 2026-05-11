---
name: adv-archive
description: Archive completed change: apply spec deltas and finalize git
phaseGoal: "Promote the change from contract to law: apply spec deltas, capture wisdom, clean up."
---

<!-- manifest: adv-archive · gate: release · requiresChangeId: true · prereqs: [adv-harden] · scope: reads[specs, proposal, tasks, codebase] · modifies[specs] -->

# ADV Archive — Finalize Completed Change

Archive change → apply deltas to specs → canonical ship/finalize path via mandatory Phase 9 Git Finalization (commit, merge+push, verify, cleanup).

## Exits

| Exit        | Condition                                      |
| ----------- | ---------------------------------------------- |
| ✅ Complete | All gates passed, specs updated, git finalized |
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

1. `adv_change_show` → verify status "active"
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

On pass, plan generation of `CONTRACT_TRACEABILITY.md` in the archive bundle with contract item IDs, task refs, matrix status, evidence summary, and amendment audit. On failure, stop before Phase 2 and direct the user to `/adv-review {change-id}` or contract re-entry/amendment.

---

## Phase 2: Archive Preview

Display: change ID/title, task count, delta count per capability, affected spec files, docs to generate, archive location, and `CONTRACT_TRACEABILITY.md` when a contract exists.

Product-linked archive: if the change has `scope_repos`, display repo order, required flags, target paths, and planned `multi-repo-archive.json` evidence. All required repos must pass ff-only preflight before any archive bundle write or merge side effect. Failure stops archive with no bundle.

---

## Phase 3: Dry Run

If `--dry-run` → emit DRY RUN COMPLETE → stop.

---

## Phase 4: Gate Status

`adv_gate_status` → display all 7 gates. If any incomplete before `release` → stop with guidance.

---

## Phase 5: User Signoff (Inline — Tier B)

Present the change report inline (per `.opencode/agents/adv.md` § Sign-Off Boundary), followed by the **Inline Approval prompt (Tier B)** per `docs/command-voice-standard.md` § Inline Approval Voice. Archive is irreversible — Tier B uses whitelist-only with no LLM fallback. On whitelist match, the agent executes the archive workflow inline in the same response (no separate confirmation-echo turn).

After the change report:

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
| `sign off` / `signoff` / `approve` / `confirm` / `yes` / `proceed` / `ship it` | Emit one-line acknowledgment (`Archiving {change-id}.`), then execute Phase 6 onward in the same response — no second user turn |
| `dry run` / `dryrun` | Run `adv_change_archive dryRun: true`, present results, re-prompt with same options |
| `cancel` / `stop` / `abort` | Halt |
| Anything else | Re-prompt with the same options. **× Do NOT** invoke LLM fallback. **× Do NOT** advance |

**Anchor phrase:** `Reply `sign off``

**On whitelist match → proceed immediately.** Emit `Archiving {change-id}.` as the opening line of the response, then call `adv_gate_complete gateId: 'release'` and proceed through Phase 6 in the same turn. Tier B safety comes from the strict whitelist (no LLM fallback) plus the six prior gate approvals already cemented; no separate confirmation-echo turn is required.

**× Do NOT** use the `question` tool for archive sign-off. The inline pattern is canonical per `rq-inlineApproval01.3` (Tier B whitelist-only).

---

## Phase 5.5: Conformance Verdict Gate

<!-- rq-extConfGate01 -->

Run only if the spec being archived has `conformance_required: true` in the conformance state. Skip entirely for specs with `conformance_required: false` or no conformance state.

### Steps

1. **Check conformance state.** `adv_conformance action: "status"` → inspect `specs[{capability}].conformance_required`. If false or absent → skip to Phase 6.

2. **Run conformance check.** `adv_conformance action: "run"` with `artifact_path` pointing to the CI-produced verdict artifact. Default artifact convention: `conformance-verdict.json` unless the project's conformance checklist says otherwise. If the artifact does not exist, report CI outage and halt.

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

`adv_change_archive changeId: <target>` — applies deltas, updates SQLite, generates docs, moves to archive. When a contract exists, archive output includes `CONTRACT_TRACEABILITY.md` only after the Contract Proof Gate passes. For product-linked `scope_repos`, inspect `multiRepo` output and `multi-repo-archive.json`; it must include before/after refs, ff-only preflight results, and verification evidence for every scoped repo.

When archiving from a worktree, pass `worktreePath: <worktree-root>` so the in-repo bundle lands in the worktree's `.adv/archive/` directory and Phase 9 Step 1 can stage it on the change branch without `cp -r` workarounds. Omit the arg when running from the main checkout (default behavior writes to `store.paths.root`).

---

## Phase 7: Verify

For each affected capability: `adv_spec action: "show"` → verify new requirements present. Verify archive directory exists with change.json and ARCHIVE_SUMMARY.md.

---

## Phase 8: Archive Report

Use the archive terminal variant of the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Archive terminal variant`). The terminal verb branches by push state:

- **Shipped.** — push succeeded AND `sync_action` ∈ {`auto via hook`, `manual fix`, `not needed`}
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
- Pre-push hooks: {hooksPath | githooks | husky | lefthook | standard | none}
- Asset sync: {auto via hook | manual fix | not needed | n/a}
- Cleanup: worktree + temp artifacts
- Investment: N tasks / M retries / T min / tier: {auto|escalate|hardstop}

---

> **{change-id}** · release ✓ · {Shipped. | Merged locally.}
```

After the archive summary is displayed, invoke reflection (non-blocking):

- `adv_reflect changeId: {change-id}` → produce the reflection report
- Runs after archive directory creation (Phase 6) and after archive summary (above)
- If reflection fails → log a warning and continue — do NOT block the archive
- Reflection report is informational only

---

## Phase 9: Git Finalization (Mandatory)
<!-- rq-releaseFinalization01 -->

> **Invariant: main checkout stays on the default branch.** ADV NEVER runs `git checkout` or `git switch` on any worktree (or on the main checkout) during archive. Trunk is updated in place via `git -C "$MAIN" merge --ff-only`. The agent MUST resolve `$MAIN` once at the start of Phase 9 (Step 3) and use it for all default-branch operations (fetch, merge, push, verify, hook detection) through Step 7. If main is not on the default branch or not clean, the invariant check (Step 4.4) hard-blocks and asks the user — ADV does not "fix" main's state on the user's behalf.

### Step 1: Stage and Commit (in the worktree, on the change branch)

Stage `.adv/specs/`, `docs/specs/`, `.adv/archive/`, `.opencode/`, `plugin/src/`, `ADV_INSTRUCTIONS.md`, `README.md`, and any touched docs in `docs/`. Do NOT stage generated build artifacts. Commit on the **change branch in the worktree**: `chore: archive {change-id}`. If commit fails → stop.

### Step 2: Detect Default Branch

`git rev-parse --verify main` || `trunk` || `git symbolic-ref refs/remotes/origin/HEAD` || `git config --get init.defaultBranch`. If UNKNOWN or remote HEAD looks stale → ask user.

### Step 3: Resolve Main Checkout Path (`$MAIN`)

```
MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
```

This resolves to the absolute path of the main checkout root from any workdir (worktree or main). Used for every subsequent default-branch operation through Step 7. If running from the main checkout itself, `$MAIN` equals the current working directory and `git -C "$MAIN" ...` is a no-op prefix — the same commands work in both modes.

### Step 3.5: Overlap + Merge-Order Scan

1. **Active change overlap** — `adv_change_list` → if other active changes touch same files or same local subsystem → mark `overlap-risk`
2. **Merge-order queue** — call `computeMergeOrder($MAIN)` from `plugin/src/validator/merge-order.ts` to get topologically sorted queue of archived-but-unmerged changes.
   - If queue is empty or unavailable → proceed
   - If current change appears in queue with `dependsOn` entries that are still unmerged → mark `queue-blocked` (route to PR workflow)
   - If earlier-archived changes with overlapping files are still unmerged → mark `overlap-risk` (even if no active changes overlap)
3. **Policy check** — If branch policy, review requirement, or publish safety makes local merge-back the wrong fit → mark `pr-risk`

### Step 4: Refresh Merge Basis

- `git -C "$MAIN" fetch origin {default-branch}` when `origin` exists
- If fetch succeeds → use `origin/{default-branch}` as freshness reference
- If fetch fails and a PR/publish path is required → stop and ask the user before proceeding
- If no remote is configured or local-only archive is intended → continue with local `{default-branch}`

#### Step 4.4: Main Checkout Invariant Check (HARD GATE)

Before any merge attempt, verify the main checkout is in a state ADV can safely fast-forward into:

1. `git -C "$MAIN" branch --show-current` → MUST equal `{default-branch}`. If not → **STOP**. Report the actual branch. Tell user: "Main checkout at `$MAIN` is on branch `<actual>`, expected `{default-branch}`. ADV will not switch branches. Restore main to `{default-branch}` (commit or stash any work in `$MAIN`, then `git -C "$MAIN" switch {default-branch}`) and retry."
2. `git -C "$MAIN" status --porcelain` → MUST be empty. If not → **STOP**. List the dirty files. Tell user: "Main checkout at `$MAIN` has uncommitted changes. ADV will not merge over a dirty tree. Commit or stash them in `$MAIN` and retry."
3. Both pass → proceed to Step 4.5.

× ADV MUST NOT attempt to switch main's branch, stash main's working tree, or otherwise mutate main's state on the user's behalf. This is a stop-and-ask gate.

#### Step 4.5: Choose Integration Path

Allowed outcomes:

- **LOCAL_FINISH / fast path** — branch is already on current default-branch basis → `git -C "$MAIN" merge --ff-only change/{change-id}`
- **LOCAL_FINISH / reconcile path** — no `overlap-risk`, no `pr-risk`, but trunk moved → rebase the change branch in the worktree (Step 4 handles conflicts if they arise), then `git -C "$MAIN" merge --ff-only change/{change-id}`
- **PR workflow path** — `overlap-risk`, `pr-risk`, `queue-blocked`, failed lightweight verification, or non-fast-forward publish risk → push the change branch from the worktree + `gh pr create` (or queue entry when project policy uses one)

### Step 4 — Conflict-recovery flow (post-J3 expansion)

> × Helpers ship in T28+T28b+T28c+T28d+T28f; runtime wiring into the Phase 9 orchestrator is a follow-up.

When `git rebase` surfaces conflicts during Phase 9, /adv-archive runs the full classification + resolution loop:

1. **Detect conflicts** — `git diff --name-only --diff-filter=U` lists conflicting files.
2. **Classify each conflict** — `classifyConflict(filePath, hunks, repoRoot)` from `plugin/src/tools/archive-helpers/conflict-classify.ts` (T28d) returns one of three classes:
   - `duplicate_content` — to-be-applied tree matches `origin/<default>` (T28's `detectSkipDuplicate`)
   - `auto_resolvable_trivial` — whitespace/line-ending only (no semantic delta)
   - `divergent_content` — semantic divergence requires user input
3. **Drive the resolution loop** — `navigateConflicts({ conflicts, repoRoot, deps })` from `plugin/src/tools/archive-helpers/conflict-loop.ts` (T28c) presents the batch summary and reads the user's mode choice:
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

After local merge succeeds, archive finalization attempts a safe remote push of the default branch from `$MAIN` when `origin` exists:

- `git -C "$MAIN" fetch origin` (if fetch fails or auth is unclear → stop and ask the user before proceeding)
- `git -C "$MAIN" log --oneline origin/{default-branch}..{default-branch}` → inspect the commits that will publish
- If `origin/{default-branch}..{default-branch}` is a clean fast-forward → `git -C "$MAIN" push origin {default-branch} 2>&1` (capture output verbatim — do NOT redirect to `/dev/null`; agent must observe pre-push hook output)
- × Do NOT force-push by default
- Before any `--force-with-lease` prompt, show both `git -C "$MAIN" log --oneline origin/{default-branch}..{default-branch}` and `git -C "$MAIN" log --oneline {default-branch}..origin/{default-branch}` so the user sees local-only and remote-only commits
- Use `--force-with-lease` only after explicit user approval via the `question` tool confirms a non-fast-forward publish is intended
- If remote divergence is detected and intent is unclear → stop and ask the user

If push hook output indicates failure (non-zero hook exit) but push itself succeeded: report it in Phase 8 but do NOT block — pre-push hook is best-effort sync; failure does not invalidate the push.

If no remote is configured OR push is skipped OR push fails: record the push failure/skipped reason — Phase 8 footer becomes "Merged locally." instead of "Shipped."

### Step 5.5: Pre-Push Hook Detection

Before pushing (Step 5), detect what the project automates on pre-push so the agent doesn't redundantly run sync, and so Phase 8 can report what fired. Inspect the **main checkout** (`$MAIN`), since that is where the push runs.

Detection (in order; stop at first match):

1. `git -C "$MAIN" config --get core.hooksPath` — if set AND `<path>/pre-push` exists AND is executable → `hook_strategy: hooksPath`
2. `$MAIN/.githooks/pre-push` exists AND executable → `hook_strategy: githooks`
3. `$MAIN/.git/hooks/pre-push` exists AND executable AND not the `.sample` file → `hook_strategy: standard`
4. `$MAIN/.husky/pre-push` exists → `hook_strategy: husky`
5. `$MAIN/lefthook.yml` (or `lefthook.yaml`) exists with `pre-push:` section → `hook_strategy: lefthook`
6. None of the above → `hook_strategy: none`

Asset-sync gap check:

- `hook_strategy == "none"` AND change touched any path in synced asset list (`.opencode/`, `ADV_INSTRUCTIONS.md`, `skills/`) AND `$MAIN/scripts/sync-global.sh` exists AND is executable → run `scripts/sync-global.sh --fix` explicitly from `$MAIN` before push, capture output → `sync_action: manual fix`
- `hook_strategy != "none"` → `sync_action: auto via hook` (rely on hook; capture push output verbatim in Step 5 to observe what fired)
- No asset paths touched AND no hook → `sync_action: not needed`

Record `(hook_strategy, sync_action)` for the Phase 8 archive report (footer lines `Pre-push hooks:` and `Asset sync:`).

> **Known v1 limitation:** Husky v3 (package.json `husky.hooks.pre-push`) is not detected by the presence-only `.husky/pre-push` check. The `manual fix` fallback covers the gap when assets are touched.

### Step 6: Verify

`git -C "$MAIN" log --oneline {default-branch}..change/{change-id}` → MUST return empty (every commit on the change branch is reachable from default-branch). If non-empty → stop, × do NOT delete worktree.

If push was performed (Step 5 succeeded): `git -C "$MAIN" fetch origin {default-branch}` then compare `git -C "$MAIN" rev-parse origin/{default-branch}` with `git -C "$MAIN" rev-parse {default-branch}` → MUST be equal. If mismatch → stop, do NOT delete worktree, report drift in Phase 8.

### Step 7: Cleanup Worktree

Only if running in a worktree AND merge verified in Step 6: `worktree_delete branch: "change/{change-id}" reason: "Change {change-id} merged"`. If `worktree_delete` is unavailable → emit an info banner naming the manual fallback: `git -C "$MAIN" worktree remove <worktree-path>` followed by `git -C "$MAIN" branch -D change/{change-id}`.

### Step 8: Temp Artifacts

Remove `*.bak`, `*.tmp`, `*.orig` from `$MAIN` (excluding `node_modules`).

<!-- rq-issueChangeLinkage02 -->
### Step 8.5: Linked GitHub Issue Close (rq-issueChangeLinkage02)

**Trigger:** All of the following must be true (otherwise SKIP this step):

- `--no-close-issue` was NOT passed in the original `$ARGUMENTS`.
- The change has `origin.kind ∈ {'roadmap', 'triage'}`.
- The change has `origin.issue_number` set (positive integer).
- Step 6 verification succeeded (push verified). If no remote push was performed, local merge verification is not enough to close remote issue state.

Default behavior: linked roadmap/triage archives default to closing the upstream issue after verified push. `--close-issue` remains accepted as a backward-compatible explicit affirmative / redundant no-op.

**Sequence (each step gates the next):**

1. `gh issue comment <N> -b "Shipped via {change-id} — archived $(date -u +%Y-%m-%dT%H:%M:%SZ)"` — post the shipping marker.
2. `gh issue close <N> --reason completed` — close. `gh` is natively idempotent: an already-closed issue returns exit 0 with an informational stderr; no failure, no API mutation.

**Failure handling (exit-code-only — no stderr string matching):**

- Exit 0 from either step → success; record `gh_issue_closed: <N>` in the Phase 8 report.
- Exit non-zero from either step → emit `[ADV:ATTN] Failed to close linked issue #<N>: <stderr>. Run `gh issue close <N> --reason completed` manually.` Archive state is canonical; do NOT roll back. Continue to Step 9.

**Anti-patterns:**

| × Bad | ✓ Good |
|---|---|
| Close issue when `origin.kind === 'discovery'` or `'adhoc'` | Only roadmap- and triage-origin changes have a meaningful upstream issue to close. |
| Close issue before Step 6 push verification | Close only after archive commits are verified reachable on pushed default branch. |
| Match stderr for "already closed" string | gh CLI returns exit 0 for already-closed; just check the exit code. |
| Roll back archive on close failure | Local archive state is canonical; close failure is non-fatal `[ADV:ATTN]`. |

### Completion

Emit GIT FINALIZATION COMPLETE: commit SHA, merge target (`$MAIN` default-branch HEAD), verification status, worktree cleanup status, artifacts removed.

### Step 9: Post-Deploy Nudge

After Phase 9 completes and the archive summary is displayed (Phase 8), if the project has a detectable deployment target, append a one-line nudge:

```
→ Deploy to production when ready
```

Deployment is outside ADV's gate lifecycle — ADV stops at push. Post-release deploy is a separate, user-initiated step.

---

## Error Handling

Delta application error → ARCHIVE FAILED banner with delta ID, target, error. Change NOT archived → fix and retry.

---

## Key Tool

| Purpose | Tool                                |
| ------- | ----------------------------------- |
| Archive | `adv_change_archive changeId: <id>` |
