# Smart truncation for noisy `adv_run_test` output

## Why

`adv_run_test` currently truncates raw command output by taking the first 2000 characters. Long/noisy outputs often preserve low-signal startup or passing-test spam and drop actionable failure summaries or tail diagnostics.

Full context-shed artifact storage was considered and rejected as over-engineered for current priorities. Agreed scope: minimal smart truncation inside existing `adv_run_test`.

## What Changes

Replace head-only truncation with smart output shaping inside the existing ~2000-character budget:

- failing output prioritizes failure/diagnostic-looking lines and tail context
- passing output prioritizes summary/stat lines and tail context
- `adv_run_test` args and return shape stay unchanged
- no new ADV tools, artifact storage, OpenCode core changes, or sub-agent execution

## Scope

### In Scope

- Modify `plugin/src/tools/test.ts` output shaping for `adv_run_test`
- Add pure helper(s) for selecting high-signal output within existing cap
- Add focused unit tests for failing/pass noisy outputs, bounds, and diagnostic prefix preservation
- Preserve timeout/maxBuffer diagnostic behavior

### Out of Scope

- Full context-shed artifact storage
- New `adv_verify_run` / `adv_verify_show` tools
- New ADV tool surface
- OpenCode core changes
- Sub-agent execution
- Durable log retrieval
- Per-tool parsers for vitest/eslint/tsc
- Increasing returned output beyond current budget

## Success Criteria

- [ ] Failing noisy `adv_run_test` output includes failure/diagnostic-looking lines and final tail context instead of only first 2000 raw characters
- [ ] Passing noisy `adv_run_test` output includes final summary/stat lines when present
- [ ] Returned output remains bounded at ~2000 characters
- [ ] `adv_run_test` public API and return shape remain unchanged
- [ ] TDD red/green evidence semantics remain unchanged
- [ ] Improvement applies automatically to apply and review/harden flows that call `adv_run_test`

## Affected Code

- `plugin/src/tools/test.ts`
- `plugin/src/tools/test.test.ts`

## Constraints

- No OpenCode core changes
- No new ADV tools
- No artifact storage/persistence
- Existing `adv_run_test` API contract preserved
- Existing timeout/maxBuffer classification preserved
- Existing TDD red/green evidence semantics preserved (`rq-TDD008path`)

## Discovery Findings

Full context-shed was rejected as likely over-engineered. Smart truncation wins because it solves the actual local issue, avoids evidence black-boxing, avoids new tools, improves every `adv_run_test` caller, and keeps future context-shed possible if token pressure later becomes Critical.

Current state: `adv_run_test` joins stdout/stderr, prepends timeout/maxBuffer diagnostics if needed, then applies head-only truncation.

Related patterns: `tools/test.ts` 2000-char truncation, `types/tdd-helpers.ts` 80-char snippet helper, plugin-level truncation marker in `index.ts`, worker-log truncation in `temporal/worker-multi.ts`.

AMBIGUITY ANALYSIS: no blocking ambiguity. Coverage: B:C F:C S:C M:C.
