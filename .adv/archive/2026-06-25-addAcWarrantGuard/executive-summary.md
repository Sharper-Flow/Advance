# Executive Summary — addAcWarrantGuard

## Outcome

ADV discovery could harden a hedged or unverified observation into a firm acceptance criterion that presumed a capability which does not exist or is not architecturally warranted (the real defect: `fixStaleCloseVisibility` AC6 asserted `adv_change_archive` `target_path` routing — a surface that does not and should not exist). Previously this was caught only by the late design-phase validator, after the criterion was already minted into the contract. This change moves the catch to an early, structural gate.

## What Was Built

- **Mint-time structural warrant verification.** Capability-presuming criteria declare a typed `[warrant: tool:<name>#<arg> | spec:<rq-id>]` tag in the agreement. `contract-mint` parses, strips, records, and verifies each declared warrant against a live tool-surface + spec-id lookup; an unresolved warrant fails the mint with `CONTRACT_UNRESOLVED_WARRANT`. (`validator/warrant.ts`, `validator/contract-mint.ts`)
- **Live, cycle-free tool surface.** `tool-registry.getToolSurface()` exposes tool name → arg-key sets, injected into the pure validator via a runtime dynamic import in `adv_contract_mint` — no generated artifact, no import cycle, no drift. (DDC2 guarded by an import-boundary test.)
- **Discovery process layer.** `adv-discover` now requires every reproduction-sourced finding to be classified `broken_capability | unwarranted_operation | unverified`, forbids `unwarranted_operation`/`unverified` findings from seeding a must-work criterion, and requires a warrant declaration for capability-presuming criteria.
- **Spec law.** `rq-acWarrant01` added to `advance-workflow` (spec + docs mirror).
- **Backfill.** `fixStaleCloseVisibility` AC6 corrected (status-repair cross-project routing only; archive has no `target_path` by design) and re-minted.
- **Durable wisdom** capturing the rule, promoted to project level.

## Honest Boundary

Structure verifies *declared* warrants (the AC6-class failure: declared-but-wrong). It does not infer an *undeclared* capability-presuming criterion from prose — that would be the heuristic-authority anti-pattern this change removes (C5/DONT4). The discovery classification layer forces the declaration; the mint check makes it truthful. The design validator remains as a backstop.

## Verification

- Independent adv-reviewer acceptance review: **READY**, 0 findings.
- Contract review matrix: 19/19 rows pass/respected, 0 failing.
- `pnpm run check` green (schemas, typecheck, isolation, lockfile, lint, format).
- Affected suites green: warrant, contract-mint, warrant-boundary, tool-registry.surface, ac-warrant-guard-assets, spec-citation-invariant, discover-asset suites.
- Campsite-fixed two pre-existing trunk failures: cited `rq-changeLifecycleState01`; bumped `advance-workflow` 1.22.0 → 1.23.0 (this change's added requirement) and aligned a stale version pin.

## Deferred / Follow-up

- Live end-to-end validation of warrant verification through the deployed `adv_contract_mint` requires a plugin rebuild + OpenCode restart (source-vs-dist gotcha); validated in-session via unit/integration tests.