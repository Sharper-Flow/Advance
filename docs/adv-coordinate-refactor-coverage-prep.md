# Research Pack: ADV Coordinate Refactor Coverage

Target: `/adv-coordinate` command
Mode: scoped
Created: 2026-08-02
Updated: 2026-08-02

## Purpose & Scope

Assess whether `/adv-coordinate` should surface and route refactoring work when
repository evidence shows a linked change or Epic is out of date.

In scope: command contract, Epic coordination law, existing `/adv-refactor`
boundary, report shape, and enforcement anchors.

Out of scope: automatically modifying changes or Epics, creating a new
coordination tool, changing Epic optionality/order semantics, and applying a
refactor.

## Current State

### Reliability

- Severity: HIGH
  Category: Reliability
  Evidence: `.opencode/command/adv-coordinate.md` Phase 3 compares linked
  change artifacts and Epic entries with repository evidence, but its outcomes
  list only cancel/supersede review, narrative update, reorder,
  retarget/repair, no-action, and freshness-limited no-conclusion.
  Impact: the command can establish that a plan diverges from the repository
  yet has no explicit, safe handoff for refreshing an outdated change proposal.
  Recommendation: add a read-only **Refactor coverage** result after the
  overlap audit. For each supported, nonterminal linked change, report a
  candidate with evidence label and the exact dry-run handoff
  `/adv-refactor <change-id>`.

- Severity: MEDIUM
  Category: Reliability
  Evidence: `/adv-refactor` only reconciles active change proposals and tasks
  (`.opencode/command/adv-refactor.md`, Phases 1–4); its target resolution does
  not accept Epic IDs. `/adv-coordinate` already owns approval-gated Epic
  narrative/reorder actions (Phases 7–9).
  Impact: treating an Epic as a `/adv-refactor` target would promise a workflow
  that does not exist.
  Recommendation: report stale Epic narrative/order/membership as **Epic
  refactor coverage**, but route it through the existing approved typed Epic
  action group; do not add an Epic mode to `/adv-refactor` incidentally.

### Developer Experience

- Severity: MEDIUM
  Category: Developer Experience
  Evidence: `plugin/src/manifest.ts` declares `/adv-refactor` as the stale
  proposal refresh command and `/adv-coordinate` as the project/Epic audit,
  with no successor connection between them.
  Impact: users receive drift findings without a consistent next action for
  changes versus Epics.
  Recommendation: make the coordination report group: change-refactor
  candidates, Epic-refactor candidates, deferred candidates, and no-action
  findings. Include why each was classified and preserve the existing evidence
  labels.

### Code Quality / Structural Correctness

- Severity: HIGH
  Category: Code Quality
  Evidence: `rq-epicCoordinateCommand01` requires typed reads before
  intent-bearing mutation; `rq-epicCoordinateRepoFreshness01` requires current
  repository evidence and labels `repo_backed_fact`, `adv_backed_fact`,
  `judgment_call`, and `freshness_limited`.
  Impact: age, a heuristic match, or a stale membership projection cannot
  authorize a refactor.
  Recommendation: candidates require a cited repository/ADV contradiction.
  `judgment_call` and `freshness_limited` findings remain review-only. The
  command must not run `/adv-refactor --execute` or mutate change state.

### Security, Testing, Observability

No additional scoped findings. Existing read-first, explicit approval, and
typed-tool constraints are the applicable safety controls; acceptance tests
should make the new report/handoff contract structural.

## LBP / Reference Comparison

| Area | Current | Reference | Classification | Correction |
| --- | --- | --- | --- | --- |
| Change drift handoff | Coordinate detects repository-plan overlap but omits a refactor route. | `/adv-refactor` performs bidirectional proposal/task reconciliation and validation. | DRIFTED | Surface evidence-backed change candidates with dry-run `/adv-refactor <id>` handoffs. |
| Epic drift handling | Coordinate already proposes narrative/reorder/repair actions with approval. | `rq-epicCoordinateCommand01` requires typed, approval-gated intent actions and optional membership/advisory order. | SOUND | Re-label these report rows as Epic-refactor coverage when stale; retain current tools and approval. |
| Mutation boundary | Coordinate has no change-mutation path. | `plugin/src/consumer-integration.test.ts` locks the read-first/no-new-mutation boundary. | SOUND | Referrals only; execution stays in `/adv-refactor` or approved existing Epic actions. |

Greenfield note: a single typed, read-only refactor-candidate projection could
eventually remove prose-only joining. It is not needed for this focused command
change and would add a planning primitive contrary to the current law.

## Competitors & Alternatives

No external competitors researched. This is an internal ADV command-contract
change; the relevant alternatives are existing local command boundaries:
`/adv-refactor` for change artifacts and `/adv-coordinate`'s typed Epic action
groups for Epic artifacts.

## Emerging Patterns

- Evidence-gated workflow referrals: establish the contradiction before
  offering a follow-up command; do not promote age or heuristic ranking into
  authority.
- Read-model coordination: keep discovery/reporting read-first and transfer
  mutation authority to the owning workflow.

## Applicability to This Repo

Recommended direction:

1. Add a **Refactor Coverage Audit** after `/adv-coordinate` Phase 3/Phase 6.
2. A change candidate must be nonterminal, linked/participating, and supported
   by `repo_backed_fact` or `adv_backed_fact` drift evidence. Output only
   `/adv-refactor <change-id>` (dry-run default); never `--execute`.
3. An Epic candidate must name the exact stale field and retain the current
   approval-gated `adv_epic_update`, `adv_epic_reorder`, or convergence path.
4. Keep candidates with `judgment_call` or `freshness_limited` labels in a
   review/deferred group with no mutation command.
5. Extend the coordination report and asset tests; update the Epic command law
   only if the product contract should require this coverage rather than merely
   document it.

This preserves optional Epic membership, advisory order, current freshness
rules, and the no-new-mutation/CLI boundary.

## Open Questions for Research

1. Should refactor coverage be a MUST-level Epic command law with separate
   scenarios, or an implementation detail asserted only by command asset tests?
2. Should a candidate be limited to change entries in active Epics, or include
   unlinked in-flight changes found by the project inventory?
3. Should the report emit a bounded maximum number of candidates per command
   run to protect output size?

## Sources

- `.opencode/command/adv-coordinate.md` — Phase 3 overlap outcomes; Phases
  7–9 report and approval actions.
- `.opencode/command/adv-refactor.md` — stale-change reconciliation and
  dry-run/execute boundary.
- `adv_spec show advance-epics` — `rq-epicCoordinateCommand01`,
  `rq-epicCoordinateRepoFreshness01`, and
  `rq-epicCoordinateProjectInventory01`.
- `plugin/src/advance-epics-assets.test.ts` — coordinate command contract
  anchors.
- `plugin/src/consumer-integration.test.ts` — no-new-mutation boundary.
- `plugin/src/manifest.ts` — adjacent command ownership and manifest roles.
