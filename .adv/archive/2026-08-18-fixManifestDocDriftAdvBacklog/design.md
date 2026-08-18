# Design — manifest-doc-drift fix (advance)

## Root Cause
plugin/src/manifest-doc-drift.test.ts fails: adv-backlog.md frontmatter description != command manifest entry (1 mismatch, 19 pass). Direction of drift determined at implementation via git log on both surfaces; align the lagging side to the leading one (manifest is authoritative for machine dispatch; frontmatter must mirror).

## Spec-law: No spec law update required
Test/doc alignment restores existing invariant (manifest↔frontmatter sync enforced by manifest-doc-drift.test.ts); no behavior or law change.

## Verification
- RED: vitest run src/manifest-doc-drift.test.ts fails (known).
- GREEN: same test passes; full targeted file suite green.