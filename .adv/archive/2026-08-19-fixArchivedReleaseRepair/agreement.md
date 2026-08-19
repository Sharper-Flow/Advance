# Agreement — Repair archived release projection

## Objectives

**O1 — Complete release at the surviving lifecycle location.** Persist verified release and Phase 9 completion to active state when present and to the archive bundle when active state is absent.

**O2 — Keep terminal bundle artifacts consistent.** Regenerate projection-derived archive files through the existing single writer under archive locking.

**O3 — Preserve structural authority.** Use canonical Git release proof, `commitChangeProjection` revision/audit/readback, and idempotent operation identity; never edit state ad hoc or recreate active state.

**O4 — Align spec law.** Clarify terminal reconciliation without changing release proof or approval boundaries.

## Acceptance Criteria

**AC1 — Active-absent retry succeeds.** Given a validated existing archive bundle with release pending, no active projection, and canonical `finalization.status=shipped`, archive retry returns success and archived readback reports all seven gates done.

**AC2 — Phase 9 and release complete together.** The recovery transaction records `gates.release.status=done` with shipped evidence and `phase9_status.status=done`; no second active-only mutation is attempted.

**AC3 — No active resurrection.** Recovery does not create `changes/<changeId>`, a temporary active projection, a compatibility shim, or a retired repair tool.

**AC4 — Mutation is audited and idempotent.** Archive projection revision increments once with recovery authority/evidence and stable operation identity; exact replay returns the prior success without another increment.

**AC5 — Derived bundle files agree.** `change.json`, `summary.v1.json` change hash, `ARCHIVE_SUMMARY.md`, and `BRIEFING_DIGEST.md` are regenerated from the committed release-done projection while preserving the original archive timestamp. Existing spec projection, narrative artifacts, wisdom, and multi-repo metadata are not lost.

**AC6 — Normal finalization does not strand pending state.** Before active projection removal, the generated archive bundle is synchronized with release-done state. A fresh normal archive therefore reads release done without requiring recovery.

**AC7 — Failures fail closed.** Invalid bundle identity/schema, missing shipped evidence, lock/commit failure, or derived-file regeneration failure returns a typed blocked/unverified result and never reports release success.

**AC8 — Quality remains green.** Focused archive/Phase 9 tests, regression integration tests, `pnpm run check`, relevant smoke/full tests, and build pass on Node/Vitest and Bun-compatible output.

## Constraints

- Preserve `rq-releaseFinalization01` Git/PR proof standards and Tier B approval boundaries.
- Preserve active-path behavior when active projection exists.
- Use archive projection lock followed by per-change projection lock in the established order.
- No direct external-state file edits outside the validated archive writer/transaction APIs.
- No public tool/schema addition unless implementation proves unavoidable.

## Avoidances

- Do not broaden into `/adv-sweep`, startup reconciliation, shell reaping, or portfolio cleanup.
- Do not revive `adv_archive_repair` or any retired recovery tool.
- Do not paper over failure with shipped-only synthetic success.
- Do not rewrite the archive through a second independent writer.
- Do not change product/project archives unrelated to the targeted test fixtures.