# Executive Summary

## Outcome
Advance release downloads are now user-installable: the release workflow builds a full installer archive, publishes a latest-release `install.sh`, and documents one primary user path plus maintainer/developer alternatives.

## Verdict
APPROVED

## What Was Built
1. Release workflow now packages a full `advance-v*.tar.gz` payload, verifies required tar contents, uploads `install.sh`, and publishes `SHA256SUMS.txt`.
2. Root `install.sh` resolves latest or pinned releases, validates `ADV_VERSION`, verifies checksums, guards unsafe archive paths, checks required files, and delegates to `bash scripts/deploy-local.sh --fix`.
3. README now shows one primary user install path; SETUP separates user install, manual release artifact install, and maintainer/developer setup with troubleshooting.
4. Release install asset tests lock packaging, installer, docs, and remediation edge cases.

## What Was Verified
- Verdict: APPROVED with 0 blockers/issues after remediation; 1 caveat documented.
- Tests: `pnpm test -- src/release-install-assets.test.ts` passed; `pnpm run check` passed; `pnpm run build` passed; local release archive smoke passed.
- Investment: 4 tasks / 6 recovery events / ~151 min / tier: auto (all recoveries resolved).
- Contract matrix: 16 required rows passed/respected; 0 failed/violated/unknown.

## Remaining Concerns
- GitHub Release tarball and `SHA256SUMS.txt` share the same GitHub Release origin. Detached signing/cosign verification is not included in this change.
