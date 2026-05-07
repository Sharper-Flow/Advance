# Cull Process Retrospective — Candidate ADV Convention

| Field | Value |
|---|---|
| Created | 2026-05-06 |
| Trigger | `cullDeadCodeFixArchive` + post-cull remediation cycle |
| Trunk baseline at retrospective | `a99bdb6` |
| Status | DRAFT — for user review; not yet promoted to convention |
| Purpose | Capture the development cycle used during a "broken-system rebuild" so it can be reviewed, refined, and codified as ADV convention if approved |

---

## Why this retrospective exists

The cycle that produced `cullDeadCodeFixArchive` (PSW retirement) followed by `post-cull-audit` (update-vs-signal collapse) was unusual:

- The system being changed (ADV) was the same system the agent was supposed to drive the change through.
- Standard ADV ceremony (`/adv-proposal` → `/adv-discover` → `/adv-design` → `/adv-prep` → `/adv-apply` → `/adv-archive`) hit the broken paths it was supposed to fix.
- The cycle pivoted mid-flight: dropped ceremony, used plain git + delegate-to-engineer + audit-doc-in-git as the audit trail.

It worked. 1768 tests green, 15 commits on trunk, root-cause bug (`WorkflowUpdateFailedError`) fixed. Worth examining before promoting.

---

## Phases — what happened, in order

### Phase 0 — Trigger

User session opened. Existing `cullDeadCodeFixArchive` change was at `discovery ✓ → design ○`. ADV tools were partially broken (`adv_change_update` returning `WorkflowUpdateFailedError`; `adv_task_show` returning `Task not found` while `adv_task_list` saw the same task).

### Phase 1 — Initial ADV ceremony

Drove design phase via the standard `/adv-design` workflow:

- Loaded design contract + agreement context.
- Spawned `adv-researcher` validator → returned `CONFLICT` (spec-law inventory missing).
- Resolved CONFLICT inline by adding spec-conflict inventory to design.
- Persisted via `adv_change_update` — this is where the broken path *bit*. The tool returned `WorkflowUpdateFailedError` repeatedly while still persisting the artifact (verified via subsequent `adv_change_show`). Confusing — caller cannot tell success from failure from the response.
- Completed design gate via `adv_gate_complete` (this worked).

**Cost:** ~8-10 turns. Many spent reasoning about what to put in the design vs trying to persist it.

### Phase 2 — Decision shift

User intervention: *"would it be better long term to create a new advance project directory with a full rebuild instead of our current process?"*

This was the key turning point. Pre-intervention, the agent was inside ADV ceremony assuming the next step was prep. Post-intervention, the question was architectural: keep going inside the broken system or rebuild it.

Decision: **aggressive in-place rebuild, no middle steps**, preserve only core data (specs/wisdom/agenda/archives/current-change artifacts). Tasks/gates explicitly **not** migration product data.

### Phase 3 — Surface matrix

User: *"make full and exhausting matrix"*.

Built four-column table (Surface | Original Verdict | Actual State | Audit) covering:
- 50+ tool surfaces
- 10+ workflow handler classes
- All storage adapters
- All migration / repair surfaces
- Tests, specs, docs

User then narrowed it to user-decisions per category (deletion scope / data survival / history cleanup) via the `question` tool.

**Cost:** ~3-4 turns. **Value: very high.** The matrix became the spec for everything that followed. Without it, every subsequent decision would have been ad-hoc.

### Phase 4 — Drop ceremony, declare escape plan

User: *"we do not need to follow adv ceremony in current state. we need to quickly get off the broken path"*.

Agent proposed escape order: bulk-delete inline → rebuild consumers → fix ADV tools → spec deltas + denylist + verify → commit + merge via plain git, skip `/adv-archive` until rebuilt ADV proves itself.

User accepted (`go`). Then user restarted OpenCode session for clean state.

### Phase 5 — Stage 1 inline (pure deletes)

Worked in the change worktree. Used `git rm` for unambiguous leaf deletions:
- spike/ harness
- project-state.ts + .test.ts
- project-workflow-helper.ts
- mature-project eviction tests

Single commit. ~3567 lines deleted. Build expected to break next stage.

### Phase 6 — Delegate Stages 2-6 to `adv-engineer`

Wrote a long structured prompt:
- Working Directory Lock
- Drop ADV ceremony notice
- Surface matrix (REMOVE / REBUILD / KEEP / DECIDE)
- Stage breakdown with verification commands
- Open DECIDE items resolved conservatively in advance
- Expected ENGINEER_REPORT shape

Engineer completed Stages 2-4 (gut + consumer rebuild + tests green). Reported "done" but Stage 5+6 (specs + docs) still pending. Sent follow-up delegate task. Engineer reported "all done" but **had not committed final cleanup edits** and **one test was still failing** (assertion expecting retired tool name).

Caught both via post-engineer verification.

### Phase 7 — Merge to trunk via plain git

Used the merge-before-delete protocol:
1. Resolve `$MAIN`.
2. Verify main checkout invariant (on `trunk`, clean).
3. `git -C "$MAIN" merge --ff-only change/cullDeadCodeFixArchive`.
4. Verify merge (no commits ahead).
5. `adv_worktree_delete` refused with `INTEGRATION_REQUIRED change_not_archived` because change.json never reached `archived` status (we dropped ceremony). Fell back to plain `git worktree remove + branch -D`.
6. Pushed trunk to origin.

### Phase 8 — Audit (re-scan)

User: *"re-make the matrix from scratch, do a comparison audit, ensure everything is completed from the master audit"*.

Built fresh matrix scanning **current trunk state**. Compared to original verdicts. Found:
- ❌ Update-vs-signal alias mismatch in `messages.ts` causes `WorkflowUpdateFailedError` at runtime — **the bug that triggered the entire cull was never actually fixed**. PSW retirement was orthogonal.
- ❌ Spec leak in `rq-bulkCloseDiskSweep01.2`.
- ❌ Generated-doc leak in `docs/specs/advance-workflow.md`.
- 🟡 Validator stale spec citations.
- 🟡 7 spec deltas claimed but unverified.
- 🟡 Residual scripts/docs.

### Phase 9 — TODO doc as audit trail

User: *"make full todo list, record it to be audited later, and complete/fix all -- including full test suite coverage. Do TDD order"*.

Wrote `docs/audits/post-cull-audit.md`:
- 8 sections (R1-R8) in TDD order.
- Each section: RED tests first → GREEN implementation → VERIFY.
- Completion table with checkboxes + commit SHAs (initially `_pending_`).

Committed to trunk **before** any remediation work. Captures intent in git history.

### Phase 10 — Delegate audit remediation to engineer

Sent engineer a structured prompt pointing at the audit doc as the spec. Required:
- TDD order strict (RED commits before GREEN commits).
- Update audit doc completion table after each section.
- Per-section commit messages.
- Engineer-report at end.

Engineer completed all 8 sections. 1732 → 1768 tests. Build green. Audit doc fully populated.

---

## What was extra valuable

| Stage / artifact | Why valuable |
|---|---|
| **User-driven decision shift in Phase 2** | The agent was inside ADV ceremony and would have spent more turns there. The user's "should we rebuild?" question forced architectural framing. Without it, the cycle would have been longer and possibly never reached the actual root cause. |
| **Surface matrix (Phase 3)** | Singular spec for all subsequent code work. Eliminated re-litigation of every file's verdict. Both the original cull engineer and the audit engineer used the matrix as input — same shape, same rules, no drift. |
| **"Drop ADV ceremony" declaration (Phase 4)** | Made explicit what would otherwise have been a slow erosion. Frees agent from trying to drive `adv_change_update` etc. while they're broken. Also documents the deviation for later review. |
| **Escape plan as numbered list (Phase 4)** | 6 numbered steps fit in one screen. Both user and engineer could refer back to it. No ambiguity about ordering. |
| **OpenCode session restart between phases (Phase 4 → 5)** | Clean cognitive state. No `[ADV:SESSION_HEALTH]` warnings. Lost no context because everything important was in commits + audit doc. Confirms: **commit-as-state is more durable than session-as-state.** |
| **Stage 1 inline (Phase 5)** | Doing the unambiguous deletes inline before delegating gave a clean rollback point. Engineer started from a known-good state. |
| **ENGINEER_REPORT shape requirement (Phase 6)** | Forced the engineer to produce structured output. Made it possible to detect "claimed done but not actually done" cases in the report (e.g. missing files_touched, follow_ups still open). |
| **Post-engineer verification (Phase 6 close)** | Caught two real defects (1 failing test, 4 unstaged files) before merging. **Engineer reports MUST be verified, not trusted.** |
| **Audit doc committed before remediation (Phase 9)** | Captures intent in git. If anything goes wrong during remediation, the original TODO is recoverable. Later reviewers can see what was *supposed* to happen vs what *did* happen. |
| **TDD ordering enforced in audit doc (Phase 9)** | Made every section auditable: RED commit must show failing tests, GREEN commit must make them pass. The git history alone proves the work was done in the right order. |
| **Re-audit after the cull (Phase 8)** | The cull engineer reported success. Tests green. Build green. Denylist active. **And there was still a critical bug.** Re-auditing on the merged trunk surfaced what tests didn't. Confirms: **green tests ≠ correct system; need a separate audit pass.** |

## What was friction

| Stage / artifact | Why friction |
|---|---|
| **ADV ceremony in Phase 1** | Burned ~8-10 turns inside `/adv-design` reaching a state where the artifact was persisted but the tool reported failure. The protocol-vs-reality mismatch was the highest-friction part. |
| **Mid-flight `adv_change_update` failures** | Each call returned `WorkflowUpdateFailedError`. Caller had to query state to verify whether write actually landed. Doubles the work; loses agent confidence in own tools. |
| **`adv_task_show` returning Task not found while `adv_task_list` saw it** | Inconsistent read views. Session-state vs disk-snapshot vs Temporal-query divergence undocumented at call site. |
| **`adv_worktree_delete` refusal on un-archived change** | Required falling back to plain `git worktree remove`. Fine, but the tool's enforcement contradicts user intent in a "drop ceremony" cycle. |
| **Engineer over-claiming completion** | Both delegations had the same defect: engineer reported "done" with one or more failing/unverified items. Always verify. |
| **Validator CONFLICT verdict** | The verdict was correct (spec-law inventory missing) and the resolution was straightforward, but it cost a round-trip to the spec scan + design rewrite + re-validate. Could be an earlier built-in step. |
| **Generated docs out of sync** | `docs/specs/advance-workflow.md` lagged behind `.adv/specs/advance-workflow/spec.json`. No regen mechanism enforced. |

---

## Candidate convention — "aggressive rebuild cycle"

Abstracted from the above. Apply when:
- **The system being changed is the same system the agent uses to drive the change**, AND
- **Standard ceremony hits broken paths in the system being changed**, AND
- **User explicitly accepts the deviation**.

### Phases

```
0. Diagnose — confirm the broken path. Don't try to drive ADV through itself.
1. Stop ceremony — explicit "drop ADV ceremony" declaration. Note in audit trail.
2. Matrix — comprehensive surface matrix as spec. User confirms key categories.
3. Escape plan — numbered, one-screen, sequenced.
4. Inline pure deletes — agent does unambiguous leaf removals.
5. Restart session — clean cognitive state. Continue from commits + audit doc.
6. Delegate bulk surgery — adv-engineer, matrix as spec, structured report.
7. Verify engineer report — never trust "done" claims.
8. Merge via plain git — skip /adv-archive if it depends on broken path.
9. Re-audit — fresh scan against merged trunk; matrix → actual-state diff.
10. TODO doc in git BEFORE remediation — TDD-ordered.
11. Delegate remediation per TODO — TDD enforced; engineer updates doc.
12. Verify, mark complete, push.
```

### Conventions implied

- **Commit > session.** State that matters lives in commits and committed docs, not in session memory.
- **Audit doc as durable spec.** TODO checklist with RED → GREEN ordering and commit SHAs is the unit of work.
- **Engineer reports require verification.** Re-run tests, scan for unstaged files, check for "I'll come back to this later" patterns in `follow_ups`.
- **Generated docs need a regen step.** Drift between source-of-truth (`.adv/specs/*/spec.json`) and mirror (`docs/specs/*.md`) is otherwise inevitable.
- **Re-audit after green.** Green tests do not prove correctness — they prove the tests pass. A separate audit pass against intended-state catches what tests miss.

### What this convention does NOT replace

- Standard `/adv-*` ceremony for *most* changes. The aggressive-rebuild cycle is a deliberate deviation, not a default.
- The need for HITL approval at agreement / acceptance / archive sign-off / cancellation. Those are still `rq-autonomy01` checkpoints.
- The original ADV value: spec-driven law, durable change history, archived bundles, wisdom capture.

The cycle skips ceremony only because ceremony's *tools* are the bug being fixed. After the cycle, ceremony resumes.

---

## Open questions for user review

1. **Should this become a formal convention?** If yes, where should it live? Candidates:
   - `docs/conventions/aggressive-rebuild-cycle.md`
   - New ADV command: `/adv-rebuild` that explicitly drops ceremony
   - `ADV_INSTRUCTIONS.md § Aggressive Rebuild` subsection
2. **Should the engineer-report verification be enforced by tooling?** A post-delegation gate that re-runs `pnpm test`, scans `git status`, and re-checks the report's claims could prevent the "claimed done but not actually done" pattern automatically.
3. **Should `adv_change_update` and similar mutators report failures more clearly?** Currently `WorkflowUpdateFailedError` returns alongside successful artifact persistence — a confusing state. Even after R1's fix, the API design could be more explicit about partial-success.
4. **Should generated docs have a CI regeneration step?** Or a drift test that fails the build when `docs/specs/*.md` and `.adv/specs/*/spec.json` diverge?
5. **Is there a higher-level "audit doc in git" pattern that should be standardized?** The `docs/audits/post-cull-audit.md` form (TODO + completion table + commit SHAs) was extremely valuable. Could become a generic ADV artifact alongside `proposal.md` / `agreement.md` / `design.md` for cycles that need it.
6. **When should an agent split a task into its own commit before delegation?** Stage 1 (Phase 5) was inline; Stages 2-6 was delegated. The pre-delegation inline commit gave the engineer a known-good starting point. Generalizable rule: "always commit a clean rollback point before delegating large surgery"?

---

## Audit trail

- 2026-05-06 — created post-engineer-r8-completion, before push
- (no further updates expected unless promoted to convention)
