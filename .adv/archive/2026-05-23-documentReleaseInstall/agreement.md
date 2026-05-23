# Agreement

## Objectives

1. Replace the current plugin-only GitHub Release tarball with a full user-installable release artifact.
2. Add a latest-release installer script that does not require per-version edits.
3. Present one primary user install path in README.
4. Distinguish user installation from maintainer/developer setup in SETUP.
5. Preserve the existing source clone + `scripts/deploy-local.sh --fix` maintainer/developer flow.

## Acceptance Criteria

1. GitHub Release asset `advance-v*.tar.gz` contains all assets required for user installation: plugin runtime, `scripts/deploy-local.sh`, `.opencode/command`, `.opencode/agents`, `.opencode/overlays`, `skills`, README/SETUP, and required root metadata.
2. Current plugin-only tarball shape is removed or renamed so users are not offered a misleading install artifact.
3. Latest-release installer exists and resolves the latest GitHub Release without per-version edits.
4. README presents one primary user install path using the release artifact/installer.
5. SETUP distinguishes user install from maintainer/developer setup.
6. Verification checks prove documented install commands match release artifact contents.
7. Failure/troubleshooting docs cover missing `jq`, `rsync`, `pnpm`, executable-bit issues, and incomplete artifact fallback.

## Constraints

1. Documentation must match actual release artifact contents.
2. Existing source clone install guidance must remain available and accurate for maintainers/developers.
3. Do not change ADV runtime behavior, gate semantics, Temporal state, or tool behavior.
4. Do not publish to npm, Homebrew, or another package registry in this change.
5. Keep Claude Code distribution work out of scope.

## Avoidances

1. Do not document commands that cannot work from the downloaded artifact.
2. Do not imply the custom release tarball contains repo-level assets unless packaging is changed to include them.
3. Do not leave a plugin-only `advance-v*.tar.gz` artifact that appears to be the primary user install download.
4. Do not make maintainers manually copy release-only files outside the release workflow.

## Decisions

### User Decisions

1. Artifact shape: replace the current plugin-only tarball with a full installer artifact.
2. Installer: include a latest-release installer script, provided it resolves the latest GitHub Release and avoids per-version updates.
3. Documentation shape: README should show one primary user install path; alternatives belong in SETUP notes/troubleshooting.

### Agent Decisions (LBP)

1. Keep `deploy-local.sh --fix` as the local sync mechanism because it already installs plugin runtime, commands, agents, overlays, skills, and config.
2. Add deterministic release-asset verification so docs and packaging cannot drift silently.
3. Treat `curl | sh` installer as security-sensitive: implementation should be small, inspectable, pinned to GitHub Release resolution, and documented with a manual alternative.

## Deferred Questions

None.

## Sign-Off

User approved acceptance criteria and agreement with reply: `approve`.
