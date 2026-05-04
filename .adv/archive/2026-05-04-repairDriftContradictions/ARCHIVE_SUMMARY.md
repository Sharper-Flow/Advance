# Archive: Repair drift, contradictions, and redundancy in ADV agent instructions

**Change ID:** repairDriftContradictions
**Archived:** 2026-05-04T03:54:36.955Z
**Created:** 2026-05-04T02:42:11.426Z

## Tasks Completed

- ✅ T1 — Manifest phaseGoal alignment with inline TDD.

Scope: `plugin/src/manifest.ts`, `plugin/src/manifest.test.ts`.

Goal: Make M9 code-backed. Expand phaseGoal coverage to exactly four additional lifecycle workflow commands: `adv-discover`, `adv-design`, `adv-reflect`, `adv-autopilot`. Explicitly keep `adv-task` and `adv-validate` out of the phaseGoal set.

Inline TDD:
1. RED: Update manifest tests first so `WORKFLOW_COMMANDS` includes the four new commands and expected goal strings; old manifest fails.
2. GREEN: Add `phaseGoal` strings to the four manifest entries.
3. Verify targeted `pnpm test -- src/manifest.test.ts`.

Acceptance coverage: AC7, M9.
Metadata: tdd_intent=inline; delegation_hint=inline_required.
  > Added manifest phaseGoal strings for exactly the four approved lifecycle commands: adv-discover, adv-design, adv-reflect, and adv-autopilot. Updated manifest tests already covered the expanded workflow command set and expected goal strings, while keeping adv-task and adv-validate outside the phaseGoal set. Verification: `pnpm test -- src/manifest.test.ts` passed with 165 passed / 2 skipped test files and 3041 passed / 7 skipped tests. Focused `pnpm exec vitest run src/manifest.test.ts -t "Phase goal metadata"` passed 6 tests. Checkpoint commit: 8040a47bca82bdf3436047fa43b2bf6b436de92e.
- ✅ T2 — ADV_INSTRUCTIONS critical/high contract repairs with inline TDD.

Scope: `ADV_INSTRUCTIONS.md`, `plugin/src/adv-instructions-assets.test.ts` or a focused nearby asset test.

Goal: Close C1-C3 and H1-H8:
- C1 retired gate labels → canonical gate IDs
- C2 target_path matrix contradiction
- C3 worktree unavailable hard-block
- H1 stale `clarify_enforcement` line ref
- H2 canonical `adv_worktree_*` names
- H3 `[ADV:SKILL_CREATED]` single origin
- H4 `_contextSnapshot` default-vs-include wording
- H5 reflection trigger wording
- H6 augmented `adv_change_show include` pointer
- H7 complete forbidden state file list
- H8 sub-agent count total-in-batches wording

Inline TDD:
1. RED: Add structural asset tests for the high-risk invariants above.
2. GREEN: Edit `ADV_INSTRUCTIONS.md` to satisfy tests and agreement.
3. Verify targeted ADV instruction asset tests.

Acceptance coverage: AC1, AC4, AC8.
Metadata: tdd_intent=inline; delegation_hint=inline_required.
  > Added structural ADV_INSTRUCTIONS asset tests for critical/high drift invariants and repaired the document to satisfy them. Closed C1-C3 and H1-H8: command boundary gate labels now use canonical 7-gate IDs; target_path matrix no longer contradicts adv_status support or says planned-to-add; worktree protocol uses canonical adv_worktree_* names and hard-blocks unavailable tools; [ADV:SKILL_CREATED] is no longer listed as system-emitted; context snapshot docs describe the adv_change_show include.snapshot exception; reflection trigger wording is phase-number agnostic; forbidden ADV state file list includes problem-statement.md and conformance.json; sub-agent budget clarifies the six-agent cap is total across batches. Verification: focused T2 asset test passed 8 tests; full adv-instructions asset file passed 16 tests. Checkpoint commit: 0e2c6ff5ed23185a91caa42b71d816dd8777d66c.
- ✅ T3 — ADV_INSTRUCTIONS medium/low cleanup piece by piece.

Scope: remaining `ADV_INSTRUCTIONS.md` findings after T2.

Goal: Close M3-M11 and L1-L9 where not already absorbed by T2/T1, using medium-aggressive piecewise cleanup:
- reduce repeated checkpoint enumeration to one canonical list + pointers
- remove dated annotations and stale labels (P1.12 naming, status markers, trust-domain meta notes as appropriate)
- clarify `Skip for` prefix collision
- trim ambiguity/skill metadata examples only where safe
- record explicit no-change rationale for L5/L8 if safety nuance should remain

Inline TDD / verification:
1. RED: Add/extend structural asset assertions for duplicated checkpoint list, status-marker consistency, or any machine-checkable cleanup.
2. GREEN: Edit `ADV_INSTRUCTIONS.md` piece by piece.
3. Record closure rationale for each M/L finding in implementation summary.

Blocked by: T2, because critical/high repairs establish the live contract baseline.
Acceptance coverage: AC2, AC3, AC4.
Metadata: tdd_intent=inline; delegation_hint=inline_required.
  > Added medium-cleanup asset tests and cleaned ADV_INSTRUCTIONS.md piece-by-piece. Closed medium/low cleanup items that are safe to machine-guard: later checkpoint references now point back to the canonical Human Checkpoints list instead of repeating the list; stale `(P1.12)` heading suffix, dated target_path annotations, and `Trust-domain note` label were removed from live instructions; When to Use ADV now uses `Use lighter workflows for` instead of a second `Skip for` prefix. Kept ambiguity taxonomy and skill metadata examples unchanged for safety/readability (L5/L8 no-change rationale: examples are executable-format guidance and deleting them would reduce precision more than it reduces redundancy). Verification: focused T3 asset test passed 3 tests; full adv-instructions asset file passed 19 tests. Checkpoint commit: f55d2c1a763f4ac41be898cf423df8f4bc82633f.
- ✅ T4 — Repair AGENTS.md and cost-governance.md drift.

Scope: `AGENTS.md`, `.opencode/instructions/cost-governance.md`; optional small asset/grep test if existing test surface covers these docs.

Goal:
- M1: update stale command count (24 → 25 or remove count)
- M2: replace `JSON + SQLite persistence` wording with Temporal/external-state wording
- L2: clarify/remove inactive `auto.*` tuning knob so docs do not imply changing `auto.*` affects tier classification

Inline TDD / verification:
1. RED where feasible: add simple asset assertion or run grep proof showing stale phrases present.
2. GREEN: edit docs.
3. Verify stale phrases absent and docs align with current Temporal-only/storage wording.

Acceptance coverage: AC5, AC6.
Metadata: tdd_intent=inline; delegation_hint=delegate_allowed.
  > Added repo instruction asset drift guards and repaired AGENTS.md plus cost-governance.md. AGENTS.md now avoids stale slash-command counts and describes storage as Temporal-only persistence adapters with external state. Cost governance docs now explicitly say not to tune `auto.*` for check-in tier behavior; tune `escalate.*` / `hardstop.*` instead. Verification: `pnpm exec vitest run src/repo-instructions-assets.test.ts` passed 2 tests. Checkpoint commit: 0926b2ead34ca1056e99dd0b5e11b33c5a585166.
- ✅ T5 — Findings closure matrix and final contradiction audit.

Scope: `ADV_INSTRUCTIONS.md`, `AGENTS.md`, `.opencode/instructions/cost-governance.md`, task implementation summaries.

Goal: Verify every finding C1-C3, H1-H8, M1-M11, L1-L9 is closed with either a before/after delta or explicit no-change rationale. Perform final top-to-bottom contradiction audit of `ADV_INSTRUCTIONS.md`.

Separate verification:
1. Build closure matrix in task notes / implementation summary.
2. Run literal searches for retired/stale patterns (`research | Validated`, `worktree_create`, `planned to add`, duplicate `[ADV:SKILL_CREATED]`, etc.).
3. Read affected sections and confirm no direct contradictions remain.

Blocked by: T1, T2, T3, T4.
Acceptance coverage: AC1-AC8.
Metadata: tdd_intent=separate_verification; delegation_hint=inline_required.
  > Closure matrix: C1 canonical gates closed by command boundary rows; C2 target_path contradiction closed by adv_status support row and no planned-to-add wording; C3 worktree fallback closed by adv_worktree_* hard-block wording; H1 stale P1.12 line label removed; H2 canonical adv_worktree_* names used in live worktree protocol; H3 [ADV:SKILL_CREATED] no longer duplicated as system-emitted; H4 context snapshot docs now state read tools omit by default except adv_change_show include.snapshot; H5 reflection trigger no longer cites Phase 8; H6 Context Freshness retains augmented adv_change_show include guidance; H7 forbidden state list includes problem-statement.md and conformance.json; H8 sub-agent cap says total across batches; M1/M2 AGENTS drift fixed; L2 auto.* tuning clarified; T3 medium/low cleanup verified with canonical checkpoint references, stale annotation removal, and Skip-for collision fix. L5/L8 no-change rationale: ambiguity taxonomy and skill metadata examples retained because they are format-critical guidance. Verification: instruction asset tests passed 21 tests; stale-pattern searches found no live contradictions in target docs; affected sections read top-to-bottom for direct contradictions. Checkpoint: clean at 0926b2ead34ca1056e99dd0b5e11b33c5a585166.
- ✅ T6 — Full verification, sync check, and planning-to-apply readiness.

Scope: whole touched surface.

Goal: Run final verification suite and prepare implementation evidence for acceptance:
- targeted asset tests (`manifest.test.ts`, ADV instruction asset tests)
- full `pnpm test` from `plugin/`
- `scripts/sync-global.sh --check`
- any formatting/typecheck commands required by repo policy

Separate verification:
1. Run target tests after implementation batches.
2. Run full test suite and sync check.
3. Capture exact pass/fail evidence; remediate in-scope failures or route blockers.

Blocked by: T5.
Acceptance coverage: AC9.
Metadata: tdd_intent=separate_verification; delegation_hint=inline_required.
  > Final verification passed. Targeted changed tests `pnpm exec vitest run src/manifest.test.ts src/adv-instructions-assets.test.ts src/repo-instructions-assets.test.ts`: 3 files passed, 58 tests passed. Full plugin suite `pnpm test`: 166 passed / 2 skipped test files, 3054 passed / 7 skipped tests after formatting remediation. `pnpm run check`: passed typecheck, test isolation, lint, and format:check after running `pnpm run format` to fix Prettier formatting in src/adv-instructions-assets.test.ts. `scripts/sync-global.sh --check`: passed config validation and tool drift checks for adv and provider variants. Checkpoint commit: 967b2e25777db59ce6d1cbac9623d43d0444b1f8.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Fallback `adv_task_evidence` can make task-level TDD compliant without advancing the durable task-run ledger. If `adv_run_test` times out before green ledger recording, later checkpoint events may be rejected from `red_recorded`; verify `adv_task_tdd status` and git checkpoint separately, and consider a future tool fix so fallback evidence writes ledger events.
