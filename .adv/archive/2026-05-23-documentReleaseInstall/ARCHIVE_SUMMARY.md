# Archive: Document release install

**Change ID:** documentReleaseInstall
**Archived:** 2026-05-23T16:48:37.710Z
**Created:** 2026-05-23T04:59:40.632Z

## Tasks Completed

- ✅ Add release artifact contract tests and packaging workflow
  > Added plugin/src/release-install-assets.test.ts to assert the GitHub Release archive is a full install payload, not plugin-only, and publishes SHA256SUMS.txt. Updated .github/workflows/auto-release.yml to archive README/SETUP/root metadata, install.sh, scripts, .opencode command/agent/overlay assets, skills, plugin dist/src/package files, verify required entries via tar listing, and upload SHA256SUMS.txt.
- ✅ Add latest-release installer script
  > Added executable root install.sh. It resolves ADV_VERSION from the environment or the GitHub /releases/latest redirect using curl url_effective, validates version shape, downloads advance-${ADV_VERSION}.tar.gz plus SHA256SUMS.txt, checks the target asset is covered by checksums, runs sha256sum --check --ignore-missing, validates/extracts the tarball, verifies scripts/deploy-local.sh exists, and delegates installation via bash scripts/deploy-local.sh --fix. Extended release-install asset tests to cover installer existence, latest resolution, no hardcoded version, checksum/tar validation, temp cleanup, and deploy-local delegation.
- ✅ Update user and developer installation docs
  > Updated README quick start to one primary user install path via https://github.com/Sharper-Flow/Advance/releases/latest/download/install.sh | bash and explained that it downloads/verifies the latest GitHub Release artifact. Reworked SETUP Installation into User install, Manual release artifact install, and Maintainer/developer setup sections. Added release installer troubleshooting for jq, rsync, pnpm, executable-bit, incomplete artifact, and checksum failures. Updated release workflow to upload dist/install.sh and include it in SHA256SUMS.txt. Extended release-install asset tests to lock README/SETUP docs and installer asset upload behavior.
- ✅ Run release install verification and readiness checks
  > Ran final verification for all acceptance criteria and remediated review findings. Confirmed release-install tests pass, project check passes after Prettier remediation, build passes, and local release archive smoke creates advance-v0.0.0-smoke.tar.gz with required paths plus SHA256SUMS coverage for archive/install.sh. Post-review fixes: corrected install.sh checksum parsing (removed null IFS), added checksum shape validation and friendly checksum failure, added tar path traversal validation, verified critical files after extraction, checked mktemp output, added sha256sum troubleshooting, added auto-release concurrency plus pre-release/empty-commit guards, and strengthened static tests.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Release artifact shape can be kept structurally correct with asset tests that inspect workflow packaging commands and require an explicit tar contents verification loop plus conventional SHA256SUMS.txt upload.
- **[gotcha]** Latest-release installer should not trust ADV_VERSION or checksum filenames heuristically: normalize/validate tag shape before building URLs and confirm SHA256SUMS.txt contains the exact target asset before running sha256sum --check --ignore-missing.
- **[pattern]** For user-facing release installs, upload the installer itself as a latest-release asset and include it in SHA256SUMS.txt; docs can then use releases/latest/download/install.sh while the installer downloads the full tarball.
- **[success]** Final release-readiness evidence is strongest when it combines static asset/doc tests, pnpm run check, pnpm run build, and a local tarball smoke that checks required paths plus SHA256SUMS coverage for both archive and installer asset.
- **[gotcha]** Bash `while IFS= read -r a b` disables field splitting, so `b` stays empty. For checksum manifests that need hash+filename fields, use default IFS (`while read -r checksum filename`) or an explicit parser; static substring tests can miss this runtime bug.
