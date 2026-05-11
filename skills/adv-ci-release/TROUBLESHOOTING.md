# CI Auto-Release Troubleshooting

## `GITHUB_TOKEN` cannot trigger downstream workflows

Problem: if `auto-release.yaml` pushes a tag using `GITHUB_TOKEN`, a tag-triggered `release.yaml` workflow will not fire. GitHub blocks this to prevent loops.

Fix: build binaries and create GitHub release in same workflow as tag push. Do not chain `auto-release → tag push → release workflow` unless using a deliberately scoped PAT and explicit security review.

## Process substitution fails in Actions

Problem: `done < <(git log ...)` can produce shell syntax issues in GitHub Actions.

Fix: collect output in variable, then use heredoc-style input: `done <<< "$COMMITS"`.

## Race detection + parallel packages timeout

Problem: `go test -race ./...` runs packages in parallel. On 2-core GitHub runners, subprocess-heavy tests can starve and timeout.

Fix: `go test -race -p 2 -timeout 5m ./...`.

## Floating linter versions break CI

Problem: actions using `latest` can pull breaking major versions without warning.

Fix: pin exact versions in workflow and docs. Example: `golangci-lint-action` with `version: v2.12.2`.

## Async callbacks race tests

Problem: SDK callbacks can fire after connect returns, causing immediate assertions to fail.

Fix: poll with bounded deadline (for example 2s, 10ms interval) instead of asserting synchronously.

## Missing CHANGELOG commit

Problem: generated CHANGELOG has no diff, so commit step skips.

Fix: confirm commit range excludes prior tag correctly and commits follow conventional format. Skip is correct when no release-worthy commits exist.

## Release job runs on PRs

Problem: release job triggers unexpectedly.

Fix: use `workflow_run` for CI success on trunk/main branches only. Do not use `pull_request` in release workflow.

## Artifact mismatch

Problem: release created but missing checksums or platform archives.

Fix: ensure build step writes into `dist/`, checksum runs inside `dist`, and release action glob matches `dist/*.tar.gz` plus `dist/checksums.txt`.
