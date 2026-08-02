## Outcome

Fixed quarantine recovery routing so Git identity comes from the repository root while quarantine and audit data remain in external ADV state.

## Value

Corrupt peer projections can now use the approved, auditable quarantine path instead of globally blocking unrelated archive conflict checks.

## Verification

- Durable RED `tr_msawe06m_733943e6` reproduced the pre-fix identity error.
- Durable targeted verification `tr_msawlk53_3d7a40d1` passed 15/15 after rebase.
- Independent acceptance review: READY; quarantine and registration/role/CLI tests passed.

## Release Readiness Summary

- Migration/data/frontend impact: none.
- Operational effect: enables supported quarantine recovery; does not bypass archive safety.
- Risk: deployment required before the currently installed ADV plugin receives this fix.