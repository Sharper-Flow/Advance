# Persist Executive Summary

## Intent
Make the executive summary a durable narrative artifact written at acceptance and restated at archive sign-off, instead of an ephemeral chat-output recomposed each time.

## LBP Targets
- 5th artifact slot in the well-trodden 4-artifact pattern (proposal/problem-statement/agreement/design)
- Reuse existing `updateChangeArtifacts` plumbing — no new tool, just a 5th field
- Reuse existing archive-bundle copy-all-md behavior — no archive code changes needed
- Reuse existing `_xxx` include-flag projection on `adv_change_show`

## Scope
**Tool surface**
- `adv_change_update`: add `executiveSummary` optional field
- `adv_change_create`: add `executiveSummary` optional field (symmetry)
- `adv_change_show`: add `include.executiveSummary` flag → `_executiveSummary` in response

**Storage layer**
- `updateChangeArtifacts()` in `json.ts`: accept 5th content param
- `StoreBackend.changes.updateArtifacts` in `store-types.ts`: 5th param
- `store-disk.ts` and `store-temporal/changes.ts`: forward 5th param
- New file: `executive-summary.md` in change directory

**Command guidance**
- `.opencode/command/adv-review.md` Phase 7: instruct orchestrator to compose + persist via `adv_change_update executiveSummary: ...` between user `accept` and `adv_gate_complete acceptance`
- `.opencode/agents/adv.md` § Sign-Off Boundary: add `### Executive Summary` section to Change Report template, source from `_executiveSummary`
- `.opencode/command/adv-archive.md` Phase 5: ensure sign-off block reads `_executiveSummary` via `adv_change_show`

**Tests**
- Extend `json.test.ts` `updateChangeArtifacts` suite for 5th param
- Extend `change.test.ts` (or equivalent) for `adv_change_update` + `adv_change_show` round-trip
- Asset test for Sign-Off Boundary template containing `### Executive Summary`
- Asset test for `adv-review.md` Phase 7 instructing persistence

## Success Criteria
1. `executive-summary.md` is a recognized 5th narrative artifact, persisted on disk and copied to archive bundle.
2. `/adv-review` Phase 7 composes and persists the executive summary before `adv_gate_complete acceptance`.
3. Pre-archive sign-off Change Report includes `### Executive Summary` sourced from the persisted artifact (no recomposition).
4. Existing 4-artifact callers (create, update, show, archive) remain unaffected.
5. Adjacent tests cover the new artifact end-to-end.

## Composition rules (hybrid programmatic + agent)
The orchestrator composing the executive summary draws on:
- **Programmatic** (from `adv_investment_report` + `change.tasks` + `change.contract.reviewMatrix`): task counts, retry density, per-gate timing, contract matrix pass/fail counts, per-task implementation summaries
- **Agent narrative** (judgment): 1–2 sentence outcome statement, remaining concerns synthesis, verdict tone interpretation

The persisted markdown follows this shape:
```
# Executive Summary

## Outcome
{Agent narrative: 1–2 sentences capturing verdict tone and overall result.}

## Verdict
{APPROVED | CHANGES_REQUESTED | BLOCKED}

## What Was Built
1. {ordered list from change.tasks, drawing on implementation_summary}

## What Was Verified
- Verdict: {verdict} with {N} findings ({severity breakdown})
- Tests: {pass/fail summary if captured in task notes}
- Investment: {N tasks / M retries / T min / tier}
- Contract matrix: {required rows passed/respected counts, if contract exists}

## Remaining Concerns
{Agent narrative: open items, deferred suggestions, or "None".}
```
