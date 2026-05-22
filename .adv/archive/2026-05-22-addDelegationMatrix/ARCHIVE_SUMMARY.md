# Archive: Add delegation matrix

**Change ID:** addDelegationMatrix
**Archived:** 2026-05-22T07:35:46.262Z
**Created:** 2026-05-21T00:28:05.067Z

## Tasks Completed

- ✅ Update delegation spec/test for review+harden remediation subagents
  > Strengthened `plugin/src/delegation-matrix.test.ts` to require command-routed sub-agents to be represented in each delegable matrix row and added explicit review/harden remediation-substep assertions. Updated `.adv/specs/delegation-defaults/spec.json` so review allows `adv-reviewer`, `adv-engineer`, `adv-researcher`, `explore`; harden allows `adv-reviewer`, `adv-engineer`, `explore`; and remediation/research delegated substeps are structurally represented. TDD evidence: red failed on missing review `adv-engineer`/`adv-researcher`; green passed `pnpm exec vitest run src/delegation-matrix.test.ts` with 20 tests.
- ✅ Align review/harden command remediation routing to the matrix
  > Updated `.opencode/command/adv-review.md` to describe review remediation as conditional routing through `adv-reviewer`, `adv-engineer`, and `adv-researcher` rather than an independent ad-hoc choice. Updated `.opencode/command/adv-harden.md` to distinguish scanner lanes (`adv-reviewer`/`explore`) from remediation lanes (`adv-reviewer`/`adv-engineer`) and to avoid ad-hoc remediation workers. Verification passed `pnpm exec vitest run src/delegation-matrix.test.ts src/phantom-subagent-roster.test.ts` with 98 tests.
- ✅ Align ADV instruction surfaces without downstream spec lookup
  > Updated `ADV_INSTRUCTIONS.md` to distinguish the Advance source-plane delegation matrix from downstream runtime guidance and to say field agents must not be required to inspect the repo-local spec. Updated `.opencode/agents/adv.md`, `SETUP.md`, and `.opencode/agents/adv-reviewer.md` to remove stale optional prep pre-flight routing and keep prep inline-only. Updated `.opencode/agents/adv.md` primary-agent roster to include `adv` and `adv-atc`. Added an `adv-reviewer` asset regression test preventing prep pre-flight routing from reappearing. Verification passed `pnpm exec vitest run src/phantom-subagent-roster.test.ts src/delegation-matrix.test.ts src/adv-instructions-assets.test.ts src/adv-reviewer-asset.test.ts` with 193 tests.
- ✅ Run focused delegation verification and selected broader checks
  > Ran final focused delegation verification and selected broader quality checks from `plugin/`. Focused suites passed: `src/delegation-matrix.test.ts`, `src/phantom-subagent-roster.test.ts`, `src/adv-instructions-assets.test.ts`, `src/adv-reviewer-asset.test.ts` (193 tests). Broader selected quality passed: `pnpm run check` (typecheck, test isolation, lockfile policy, lint, format:check). Worktree remained clean.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When running package tooling in this repo, use `plugin/` as cwd; repo root has no package.json. For repo-root files like `.adv/specs/...`, pass relative paths from `plugin/` (for example `../.adv/specs/...`).
- **[pattern]** For delegation matrix drift checks, validate command files by extracting explicit Task/spawn/delegate worker targets and comparing them to each step's `allowed_subagents`; this catches hidden conditional paths such as review research/remediation workers.
- **[gotcha]** Delegation defaults can drift through agent asset examples and setup docs, not just command files. When an inline-only phase changes, scan `.opencode/agents/*.md`, `ADV_INSTRUCTIONS.md`, and `SETUP.md` for stale phase-specific routing such as prep pre-flight.
- **[gotcha]** Phantom-subagent routing can appear as plus-separated worker prose (`explore + librarian`) in overlays and field-agent intent tables; roster tests should scan overlay surfaces and plus-routing idioms, not only spawn/delegate phrases.
