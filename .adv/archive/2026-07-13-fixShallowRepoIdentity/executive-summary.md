# Executive Summary

## Outcome
This change makes ADV refuse to create project state in shallow/grafted git repositories (where the identity is unstable and silently drifts), and ships an audited tool to consolidate already-orphaned state stores back under the correct project identity. You are approving release of the tested guard + tool; the live PokeEdge data recovery runs later in a linked follow-up after this merges to trunk.

## Why It Matters
Prevents the exact failure that hit PokeEdge — a shallow clone minted state under a moving pseudo-identity, so 258 changes, 122 archives, and 4 Epics appeared to vanish. The guard makes this class of data-orphaning structurally impossible going forward; the consolidation tool provides a safe, dry-run-first, non-destructive recovery path.

## Verdict
APPROVED

## What Was Built
1. Structural identity guard (project-id.ts): ADV now detects shallow clones and grafts via git plumbing and refuses to mint state, with an actionable `git fetch --unshallow` error — instead of silently creating an orphan store.
2. Audited consolidation tool `adv_store_consolidate` (scan / dry-run / execute): merges an orphaned state store into the true-root store — terminal history imported as read-only projections, live work recreated via new Temporal workflows (no history rewrite), duplicate-ID collisions halted, re-runs idempotent, source stores never deleted.
3. Specs, SETUP guidance, and docs for the new behavior; pre-existing repo doc-contract drift repaired to restore a green build.
4. Linked follow-up `runPokeedgeConsolidation` created to run the live PokeEdge recovery post-merge from a trunk deployment.

## What Was Verified
- Verdict: APPROVED with 0 blockers, 0 issues, 1 nit (advisory).
- Tests: full suite green — 4956/4956 tests, 333/333 files; `pnpm run check` clean (schemas, typecheck, isolation, lockfile, lint, format).
- Preview URL: not_applicable — CLI/plugin infrastructure change with no browser-visible output.
- Contract matrix: 20/20 required rows pass/respected; 0 failing.

## Remaining Concerns
- Non-blocking: live PokeEdge recovery is deferred to linked child `runPokeedgeConsolidation` (runs post-merge from trunk).
- Advisory nit: an unlikely `--is-shallow-repository` git failure after git-dir resolves is classified as not-git (falls back to legacy path); negligible impact, deferred to harden.
- Process caveat: an opt-in post-commit hook transiently deployed the branch during execution; runtime was restored from trunk and no branch-built tool ran any production op (wisdom ws-H2RU-g).

## Supporting Evidence
- Tasks: tk-419ca51e73a3 (guard), tk-b9ec0d0fdd3e (scan/dry_run), tk-9e02f3b6015f (execute), tk-2b3929ed4d2c (specs/docs), tk-ee8f47a8f4ce (verification).
- Reports: adv-researcher design-validation (PASS) + post-merge-sequencing (PASS); adv-verification-triage full-suite-final (pass, 4956/4956).
- Contract review matrix (20 rows) + persisted agreement/design artifacts.

## Consequence Context
1. Delivered value: pass — structural prevention of shallow-identity state orphaning + safe recovery tool (tests green, matrix 20/20).
2. Enabling-only/follow-up dependency: follow-up — live PokeEdge recovery owned by linked child runPokeedgeConsolidation (runs post-merge from trunk).
3. Ops readiness: pending — harden owns release/deploy/production/docs/cleanup readiness.
4. Migration/data impact: pass — recovery is dry-run-first, non-destructive (zero delete calls), collision-halting; no data migrated by this parent change.
5. Frontend/preview impact: n/a — non-visual CLI/plugin change; Preview URL not_applicable with matching matrix rationale.
6. Collision/release risk: pass — branch rebased conflict-free onto current trunk (0 behind); no file overlap with trunk's 12 intervening commits.
7. Open follow-ups: follow-up — runPokeedgeConsolidation (post-merge live recovery); 2 advisory agenda items for child acceptance criteria.
8. Next action: acceptance approval proceeds inline to /adv-harden fixShallowRepoIdentity.