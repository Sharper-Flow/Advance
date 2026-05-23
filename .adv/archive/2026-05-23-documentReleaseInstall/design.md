# Design

## Architecture Overview

Make the GitHub Release artifact itself the installable product. The release workflow builds `plugin/dist`, creates a full `advance-v*.tar.gz` payload containing the runtime plugin plus repo-owned sync assets, verifies the archive contents before publishing, uploads a latest-release `install.sh`, and publishes `SHA256SUMS.txt`. The installer remains thin and delegates the actual local OpenCode sync to `scripts/deploy-local.sh --fix`.

## Current State Findings

- README previously presented source checkout as the primary install path.
- SETUP mixed user installation with maintainer/developer setup.
- The prior release archive command packaged only plugin files, so users downloading `advance-v*.tar.gz` did not receive `scripts/deploy-local.sh`, `.opencode` assets, or skills.
- `deploy-local.sh --fix` is the existing source of truth for local installation and should be reused rather than duplicated.

## Chosen Direction

1. **Release packaging**
   - Replace the plugin-only tar command with a root-prefixed `advance-${VERSION}/` archive.
   - Include README, SETUP, ADV_INSTRUCTIONS, AGENTS, project metadata, `install.sh`, `scripts`, `.opencode/command`, `.opencode/agents`, `.opencode/overlays`, `skills`, `plugin/dist`, `plugin/src`, and plugin package/build metadata.
   - Generate a tar contents listing and fail the workflow if any required path is missing.
   - Upload `advance-${VERSION}.tar.gz`, `install.sh`, and `SHA256SUMS.txt`.
   - Add adjacent release workflow guards for concurrent release runs, empty commit lists, and pre-release suffix parsing.

2. **Installer**
   - Add root `install.sh` as an executable Bash script.
   - Resolve version from `ADV_VERSION` when provided; otherwise follow the GitHub `/releases/latest` redirect and parse the final tag using `curl` `url_effective`.
   - Normalize and validate release tags with a semver-like `vX.Y.Z` pattern.
   - Download `advance-${ADV_VERSION}.tar.gz` and `SHA256SUMS.txt` from the GitHub Release.
   - Confirm the checksum file contains the exact target asset, validate checksum shape, run `sha256sum --check --ignore-missing`, validate archive member paths before extraction, verify critical extracted files, then run `bash scripts/deploy-local.sh --fix`.
   - Keep same-origin checksum provenance as an explicit caveat; detached signing/cosign is out of scope for this change.

3. **Documentation**
   - README shows one primary user path: `curl -fsSL https://github.com/Sharper-Flow/Advance/releases/latest/download/install.sh | bash`.
   - SETUP provides detailed user install, manual release artifact install, and maintainer/developer source checkout paths.
   - Troubleshooting covers `jq`, `rsync`, `pnpm`, `sha256sum`, executable-bit, checksum failure, and incomplete artifact cases.

4. **Verification**
   - Add `plugin/src/release-install-assets.test.ts` to lock release workflow payload, checksum naming, installer snippets, README/SETUP docs, and remediation edge cases.
   - Run targeted tests, `bash -n install.sh`, `pnpm run check`, `pnpm run build`, and a local archive smoke test.
   - Review/remediation must clear blockers/issues before acceptance and persist a contract review matrix.

## Risks and Mitigations

- **Installer integrity:** `SHA256SUMS.txt` verifies transport/download integrity for the archive, but it is published from the same GitHub Release origin. Detached signature verification is deferred.
- **Archive safety:** installer validates tar member paths for absolute or parent-directory traversal before extraction.
- **Artifact drift:** workflow tar listing verification and co-located asset tests prevent silent omission of required install assets.
- **Docs drift:** README/SETUP assertions keep documented commands aligned with release assets.

## Non-Goals

- No package registry publishing.
- No ADV runtime behavior changes.
- No Claude Code distribution work.
- No release-signing infrastructure in this change.
