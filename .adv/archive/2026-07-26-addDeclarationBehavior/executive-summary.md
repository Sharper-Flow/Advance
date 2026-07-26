# Executive Summary — addDeclarationBehavior

## Outcome

The Advance rule set now has internal-surface evidence coverage parity with its external-surface coverage. Two new priority rules close the gap that let three confidently-wrong conclusions propagate through a pokeedge production incident, and four previously-undocumented recent additions now have SETUP.md adoption sections matching the established pattern.

## Value / Why It Matters

Before this change, Advance's P34 (no-unverified-knowledge) demanded rigorous evidence for **external** surfaces — libraries, APIs, vendor behavior — but had no equivalent for **internal** surfaces. An agent could read a project's own config file, assert what it does, design a change around that assertion, and pass every existing evidence rule while being completely wrong. The pokeedge `fixPricechartingRefresh` incident proved this three times in one session: dead config keys confidently described as policy, a suppression designed against an inert weight, and a "3 passes per card" ratio derived from mismatched populations.

P38 (declaration-is-not-behavior, priority 9) closes that gap as the internal twin of P34. P39 (population-identity, priority 8) catches the statistics-evidence failure mode. The design-gate lever-citation obligation in `adv-design.md` operationalizes P38 at drafting time, so the gap is caught before validation rather than by a downstream validator.

As a side effect, four previously-undocumented recent rules (P32 worktree-isolation, P34 no-unverified-knowledge, P35 architecture-over-hacks, P37 no-polling-loops) now have SETUP.md sections matching the established P29/P30/P31 adoption pattern. This eliminates the silent precedent-break that began when P37 was added to the deployed rules.yaml without a SETUP.md backfill.

## What Was Built

- **`~/.config/opencode/instructions/rules.yaml`** (pre-execution, operator-applied): P38 and P39 added with folded-scalar style matching P37; backup synced to `~/toolbox/backups/dotfiles/opencode/instructions/rules.yaml`. 20 → 22 rules total.
- **`SETUP.md`**: 6 new sections in numeric order (P32, P34, P35 backfilled; P37, P38, P39 documented). Each follows the established P29/P30/P31 pattern: heading, intro, copy-paste YAML block matching deployed rules.yaml verbatim, priority-calibration rationale, why-this-rule-exists prose. +347 lines, 0 deletions.
- **`.opencode/command/adv-design.md`**: Phase 2 gained a "Lever citation (precondition)" subsection between the ADR rubric and the Keep-the-design-actionable closer, operationalizing P38 at design drafting.
- **`CHANGELOG.md`**: 7 new bullets under Unreleased > Added (6 rule sections + 1 design-gate obligation).

## Verification

- **YAML fidelity**: machine-verified by adv-verifier — all 6 new SETUP.md YAML blocks character-for-character match deployed rules.yaml entries after 2-space indent normalization (report ID `addDeclarationBehavior|change:verifier:add-declaration-behavior-docs-sync|adv-verification-triage-bundle|1`, status:pass, confidence:high).
- **Section ordering**: P29 → P30 → P31 → P32 → P33 → P34 → P35 → P36 → P37 → P38 → P39 contiguous.
- **No regressions**: `git diff numstat` confirms additions only (adv-design.md 6/0, CHANGELOG.md 7/0, SETUP.md 347/0). Existing P29/P30/P31/P33/P36 sections unchanged.
- **format:check**: `pnpm run format:check` exit 0 (runId `tr_ms2ajbs6`, 17245ms).
- **Contract**: 14 contract items reviewed — 4 constraints respected, 6 avoidances respected, 4 OOS not-applicable. 0 failing rows.

## Risks / Follow-ups

- **P32 latent YAML strict-parse defect** (pre-existing): the deployed `rules.yaml` fails strict YAML parsing at line 179 (`"the inverse: run them only"` colon-space). OpenCode loads instructions as plain text so runtime is unaffected, but any future tooling that machine-parses rules.yaml would choke. Out of scope (DONT5); warrants a separate small fix converting P32 to `>-` folded style.
- **Coverage gap remains**: 9 of 22 deployed rules (P04, P05, P07, P08, P16, P19, P23-P27) still have no SETUP.md section. They predate the documentation pattern. Backfilling them is out of scope (DONT4) and warrants a separate historical-docs change if pursued.
- **No canonicalization**: this change does not introduce `advance/rules.yaml`, sync script, or CI check enforcing SETUP.md ↔ rules.yaml consistency. That architectural question is explicitly deferred (OOS1). Drift between SETUP.md and deployed rules.yaml will continue to be possible unless canonicalization is addressed.
- **Optional P30 campsite fix deferred**: deployed rules.yaml has a `scope:` field on P30 that the SETUP.md YAML example lacks. Adding it would have modified an existing section, which AC6 prohibits. Deferred.

## Originating Incident Recap

This change originated as a cross-project follow-up from the pokeedge change `fixPricechartingRefresh`. Three concrete failures during discovery and design gates demonstrated the gap:

1. A "3 passes per card" ratio (12,280 work items / 4,225 cards with provider IDs) was actually 1.01 passes per distinct card — the work items covered 12,056 distinct cards, most without provider IDs. → P39.
2. A suppression designed against priority-scoring weights that were already empty tuples or preempted by a fixed band applied before the matrix score. → P38.
3. A claim that English cards were being deliberately deprioritized, when the `language_bonuses` config keys matched no runtime value (candidate languages came from a database column with different naming). → P38.

The full RCA with the three failures, the table of why each existing rule did not catch them, and the proposal-direction rationale lives in the proposal artifact.