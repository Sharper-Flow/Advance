---
name: adv-archive
description: Archive completed change: apply spec deltas and finalize git
phaseGoal: "Promote the change from contract to law: apply spec deltas, capture wisdom, clean up."
---

<!-- manifest: adv-archive · gate: release · requiresChangeId: true · prereqs: [adv-harden] · scope: reads[specs, proposal, tasks, codebase] · modifies[specs] -->

# ADV Archive — Finalize Completed Change

Archive change → apply deltas to specs → mandatory Phase 9 Git Finalization (commit, merge, verify, cleanup).

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
Parse `$ARGUMENTS`: `change-id` (required), `--dry-run` (optional).
If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain.

---

## Phase 1: Pre-Archive Checks

1. `adv_change_show` → verify status "active"
2. `adv_task_list` → all tasks must be "done". If incomplete → ARCHIVE BLOCKED banner → stop
3. `adv_change_validate strict: true` → if fails → show errors/warnings → stop and review the validation output before retrying
4. `adv_status` → check for `[doctor]` entries: JSON/SQLite inconsistency or broken refs → block; pending WAL → warn only (advisory — benign when transient, escalate only if it persists after rerunning `/adv-status` or restarting OpenCode)
5. `adv_investment_report changeId: {id}` → include investment summary in archive report (informational)

---

## Phase 2: Archive Preview

Display: change ID/title, task count, delta count per capability, affected spec files, docs to generate, archive location.

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

`adv_change_archive changeId: <target>` — applies deltas, updates SQLite, generates docs, moves to archive.

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

### Step 1: Stage and Commit

Stage `.adv/specs/`, `docs/specs/`, `.adv/archive/`, `.opencode/`, `plugin/src/`, `ADV_INSTRUCTIONS.md`, `README.md`, and any touched docs in `docs/`. Do NOT stage generated build artifacts. Commit: `chore: archive {change-id}`. If commit fails → stop.

### Step 2: Detect Default Branch

`git rev-parse --verify main` || `trunk` || `git symbolic-ref refs/remotes/origin/HEAD` || `git config --get init.defaultBranch`. If UNKNOWN or remote HEAD looks stale → ask user.

### Step 3: Check Context

`git branch --show-current` → if on `change/{change-id}` → merge required. If on default branch → skip merge.

### Step 3.5: Overlap + Policy Scan

- Reuse overlap signals already surfaced by `/adv-apply` when available
- If other active changes touch same files or same local subsystem → mark `overlap-risk`
- If branch policy, review requirement, or publish safety makes local merge-back the wrong fit → mark `pr-risk`

### Step 4: Refresh Merge Basis

- `git fetch origin {default-branch}` when `origin` exists
- If fetch succeeds → use `origin/{default-branch}` as freshness reference
- If fetch fails and a PR/publish path is required → stop and ask the user before proceeding
- If no remote is configured or local-only archive is intended → continue with local `{default-branch}`

### Step 4.5: Choose Integration Path

Allowed outcomes:

- **LOCAL_FINISH / fast path** — branch is already on current default-branch basis → `git checkout {default-branch}` → `git merge --ff-only change/{change-id}`
- **LOCAL_FINISH / reconcile path** — no `overlap-risk`, no `pr-risk`, but trunk moved → run compatibility preflight, then rebase, then fast-forward merge
- **PR workflow path** — `overlap-risk`, `pr-risk`, failed lightweight verification, or non-fast-forward publish risk → push + `gh pr create` (or queue entry when project policy uses one)

### Step 4.6: Compatibility Preflight (for reconcile path)

- From the change branch: `git merge --no-commit --no-ff {freshness-ref}`
- If clean → `git merge --abort` → continue
- If conflicts → capture `git diff --name-only --diff-filter=U` → `git merge --abort` → stop with conflicting files. × Do NOT delete worktree

### Step 4.7: Reconcile (for reconcile path)

- `git rebase {freshness-ref}`
- If rebase conflicts → capture `git diff --name-only --diff-filter=U` → `git rebase --abort` → stop with conflicting files. × Do NOT delete worktree
- Run lightweight verification for touched scope (targeted checks first, repo smoke check if no narrower command exists)
- If verification fails → route to PR workflow path or stop when project policy forbids it
- After clean verification: `git checkout {default-branch}` → `git merge --ff-only change/{change-id}`

### Step 4.8: Publish Safety (when pushing a default branch)

If archive finalization needs a remote push from the default branch:

- `git fetch origin` (if fetch fails or auth is unclear → stop and ask the user before proceeding)
- `git log --oneline origin/{default-branch}..HEAD` → inspect the commits that will publish
- If `origin/{default-branch}..HEAD` is a clean fast-forward → `git push origin {default-branch} 2>&1` (capture output verbatim — do NOT redirect to `/dev/null`; agent must observe pre-push hook output)
- × Do NOT force-push by default
- Before any `--force-with-lease` prompt, show both `origin/{default-branch}..HEAD` and `HEAD..origin/{default-branch}` so the user sees local-only and remote-only commits
- Use `--force-with-lease` only after explicit user approval via the `question` tool confirms a non-fast-forward publish is intended
- If remote divergence is detected and intent is unclear → stop and ask the user

If push hook output indicates failure (non-zero hook exit) but push itself succeeded: report it in Phase 8 but do NOT block — pre-push hook is best-effort sync; failure does not invalidate the push.

If no remote is configured OR push is skipped OR push fails: record the reason — Phase 8 footer becomes "Merged locally." instead of "Shipped."

### Step 4.85: Pre-Push Hook Detection

Before pushing (Step 4.8), detect what the project automates on pre-push so the agent doesn't redundantly run sync, and so Phase 8 can report what fired.

Detection (in order; stop at first match):

1. `git config --get core.hooksPath` — if set AND `<path>/pre-push` exists AND is executable → `hook_strategy: hooksPath`
2. `.githooks/pre-push` exists AND executable → `hook_strategy: githooks`
3. `.git/hooks/pre-push` exists AND executable AND not the `.sample` file → `hook_strategy: standard`
4. `.husky/pre-push` exists → `hook_strategy: husky`
5. `lefthook.yml` (or `lefthook.yaml`) exists with `pre-push:` section → `hook_strategy: lefthook`
6. None of the above → `hook_strategy: none`

Asset-sync gap check:

- `hook_strategy == "none"` AND change touched any path in synced asset list (`.opencode/`, `ADV_INSTRUCTIONS.md`, `skills/`) AND `scripts/sync-global.sh` exists AND is executable → run `scripts/sync-global.sh --fix` explicitly before push, capture output → `sync_action: manual fix`
- `hook_strategy != "none"` → `sync_action: auto via hook` (rely on hook; capture push output verbatim in Step 4.8 to observe what fired)
- No asset paths touched AND no hook → `sync_action: not needed`

Record `(hook_strategy, sync_action)` for the Phase 8 archive report (footer lines `Pre-push hooks:` and `Asset sync:`).

> **Known v1 limitation:** Husky v3 (package.json `husky.hooks.pre-push`) is not detected by the presence-only `.husky/pre-push` check. The `manual fix` fallback covers the gap when assets are touched.

### Step 5: Verify

`git log --oneline {default-branch}..change/{change-id}` → MUST return empty. If non-empty → stop, × do NOT delete worktree.

If push was performed (Step 4.8 succeeded): `git fetch origin {default-branch} && git rev-parse origin/{default-branch}` → MUST equal local `HEAD`. If mismatch → stop, do NOT delete worktree, report drift in Phase 8.

### Step 6: Cleanup Worktree

Only if in worktree AND merge verified: `worktree_delete branch: "change/{change-id}" reason: "Change {change-id} merged"`. If unavailable → emit info.

### Step 7: Temp Artifacts

Remove `*.bak`, `*.tmp`, `*.orig` (excluding node_modules).

### Completion

Emit GIT FINALIZATION COMPLETE: commit SHA, merge target, verification status, worktree cleanup status, artifacts removed.

---

## Error Handling

Delta application error → ARCHIVE FAILED banner with delta ID, target, error. Change NOT archived → fix and retry.

---

## Key Tool

| Purpose | Tool                                |
| ------- | ----------------------------------- |
| Archive | `adv_change_archive changeId: <id>` |
