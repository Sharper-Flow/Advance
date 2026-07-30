## Outcome

Storage write guards now inspect executable TypeScript `saveChange` call expressions rather than raw text, so their own literals and comments cannot create false positives.

## Verification

- Focused storage guard suites: 18 passing tests.
- Regression coverage proves literals/comments ignored and executable unallowlisted calls rejected.
- Independent review: READY; corrected whitespace candidate detection and method-context coverage.
- Plugin static checks pass.

## Release readiness

This change removes the original full-suite guard blocker. Full validation still has unrelated baseline/release-gate failures owned by `fixBaselineSuiteFailures` and `fixReleaseGateProjection`; no production write behavior changed.