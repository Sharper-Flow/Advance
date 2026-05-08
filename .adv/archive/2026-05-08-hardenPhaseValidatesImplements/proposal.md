## Problem

`/adv-review` emits `suggestion:` and `question:` findings in `REVIEW_FINDINGS`. When verdict is APPROVED (only suggestions/nits), review skips remediation — these findings are emitted but never validated or acted upon. `/adv-harden` checks unresolved findings but doesn't systematically validate or implement them.

## Proposed Solution

Add a review-findings ingestion step to `/adv-harden` Phase 0, before the 6 scanners run:

1. **Load** all `suggestion:` and `question:` findings from `REVIEW_FINDINGS`
2. **Validate** each against specs, codebase state, tests
3. **Classify**: `valid` → queue for implementation · `invalid` → `rejected_with_evidence` · `already_fixed` → `fixed`
4. **Implement** valid suggestions via drift-detection rule → fix → re-verify
5. **Emit** updated `REVIEW_FINDINGS` with terminal statuses

Command-contract changes only — no plugin code modifications.

## Success Criteria

- Harden validates all non-nit review findings before running 6 scanners
- Valid suggestions are implemented; invalid ones rejected with documented evidence
- Every review finding reaches terminal status (`fixed` or `rejected_with_evidence`) before archive
- Existing harden scanner pipeline untouched

## Out of Scope

- Plugin code changes
- Changes to review remediation behavior
- New ADV tools or state mutations