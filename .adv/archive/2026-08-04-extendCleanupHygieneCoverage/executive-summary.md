# Executive Summary

## Outcome

`/adv-cleanup` now shows you every kind of cleanup debt in one run and can act on all of it, instead of showing half and making you finish the job by hand. You are approving a change to an internal maintenance command that gains the ability to delete git worktrees and merged branches — behind a deliberately harder confirmation than the command's existing actions.

## Why It Matters

Before this change the command surfaced stale work items and mentioned drifted worktrees, but could not act on the worktrees and never looked at merged leftover branches or orphaned internal records at all. Anyone cleaning up had to run three more tools by hand, and would not have known the last two categories existed. This project currently carries 52 open work items, so the gap is not theoretical.

The change also closes a safety gap that predated it. The command's worktree categories (safe, blocked, dirty, needs-investigation) were labels the underlying tool never actually produces — it reports eight different technical states. That mismatch was harmless while the categories only fed a report. This change would have made those invented labels the gate deciding what gets deleted. Review caught it and added an explicit, source-derived mapping, so deletion eligibility is now decided by categories the tool genuinely emits, with anything unrecognized refused by default.

## Verdict

APPROVED

## What Was Built

1. One command run now covers four kinds of cleanup debt: stale work items, drifted worktrees, merged leftover branches, and orphaned internal records. Previously only the first was actionable and the second was mention-only.
2. Worktree and branch cleanup can now be carried out from inside the command, removing the need to hand-run separate tools.
3. Destructive actions are held to a higher bar than reversible ones. Reversible cleanup keeps its existing one-word approval. Deleting worktrees or branches requires typing a confirmation containing the exact number of items listed, so it cannot be approved from memory without reading the report — the same safeguard `terraform destroy` uses.
4. Every item proposed for deletion is listed by its full name or path, never as a bare count, and each is labelled with whether it can be undone and how.
5. Deletion is always carried out by the existing safety-checked tools, which independently re-verify before removing anything; their refusals are shown as-is rather than worked around.
6. The rules were written into durable project law (`rq-cleanupHygieneScope01`), which previously had no governing requirement at all.

## What Was Verified

- Verdict: APPROVED with 9 findings (2 blockers, 3 issues, 4 suggestions); all blockers and issues fixed and re-verified, 0 unresolved
- Tests: full unit suite green — 8,346 passed, 0 failures across 541 files; `pnpm run check` clean including type, lint and formatting
- The command's own guard tests grew from 6 to 66, and were proven to genuinely detect the old behaviour rather than passing by coincidence
- Preview URL: not_applicable — no user-facing visual surface. This change modifies agent-facing command instructions, project law, and tests; there is nothing to render in a browser. Recorded in the contract matrix under AC1/AC2.
- Contract matrix: 22 of 22 required rows pass or respected; 0 failed, violated, or unknown

## Remaining Concerns

- **Non-blocking.** The new project law was written straight into the branch's law file rather than registered as a tracked law change. The rule itself is correct, verified, and will reach the main branch on merge, but the change history for it is thinner than usual. Worth deciding on before archive.
- **Non-blocking, pre-existing.** Four code-style warnings in unrelated internal files, and one configuration drift notice, neither touched by this change.
- **Process note.** The first verification pass checked a hand-picked list of tests and missed a real regression this change introduced. Running the full suite caught it. The narrowed list was the mistake, not the tooling.

## Supporting Evidence

Tasks tk-4a8638067257, tk-56a80b1f58f7, tk-487b323fcadf, tk-484dece9d8dc, tk-4e7528cf60ba. Test runs tr_mse0z1mf_6590a14d (full unit suite) and tr_mse119qe_919cdfe9 (full check). Design validated by an independent researcher against clig.dev, clispec.dev, and the documented behaviour of docker, git, kubectl, npm, cargo, nix and terraform. Safety findings verified directly against tool source at `plugin/src/tools/worktree/triage.ts:54-62` and `index.ts:3175`. Contract review matrix holds per-item evidence.

## Consequence Context

| Category | Status | Evidence |
|---|---|---|
| Delivered value | delivered | Four-surface triage with executable worktree/branch cleanup; contract matrix 22/22 pass or respected |
| Enabling-only / follow-up dependency | none | Self-contained; no downstream change required for this to be useful |
| Ops readiness | pending | Harden owns release/deploy/production/docs/cleanup readiness |
| Migration / data impact | n/a | No schema, storage, or data migration; instruction and test changes only, per the diff across 6 files |
| Frontend / preview impact | not_applicable | No visual surface; AC1/AC2 matrix rows record the rationale |
| Collision / release risk | low | Touches `.opencode/command/adv-cleanup.md`, `skills/adv-cleanup/SKILL.md`, `.adv/specs/advance-workflow/spec.json`, one test, one manifest line, two doc table rows. `advance-workflow/spec.json` and the doc tables are shared, high-traffic files across 52 active changes — rebase conflict is plausible, though the edits are additive and narrow |
| Open follow-ups | 1 non-blocking | Spec-delta audit trail absent (NO_DELTAS); decide before archive |
| Next action | acceptance approval proceeds inline to `/adv-harden extendCleanupHygieneCoverage` | Release gate pending |
