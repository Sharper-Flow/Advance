---
name: adv-ci-release
description: "Conventional commits auto-release CI/CD pattern for public repositories. Auto-semver bump, CHANGELOG generation, binary builds, and GitHub releases on every trunk merge."
keywords: ["ci", "cd", "release", "auto-release", "conventional-commits", "semver", "changelog", "github-actions", "pre-push", "binary-build"]
metadata:
  priority: medium
  replaces: none
---

# CI/CD Auto-Release Pattern for Public Repositories

## Purpose

Battle-tested CI/CD pattern for public repos: every trunk/main push that passes CI automatically gets semver release, categorized CHANGELOG, platform artifacts, checksums, and GitHub release. Patch/minor bumps need no human release gate.

## Architecture

```text
Push to trunk/main
  → CI workflow: lint → test → build matrix
  → workflow_run success
  → auto-release workflow:
      last tag → parse conventional commits → bump semver
      → generate CHANGELOG → commit + tag
      → build release artifacts → create GitHub Release
```

## Supporting Docs

| Doc | Use |
|---|---|
| `CI_WORKFLOW.md` | `ci.yaml` template, stack adaptation, pre-push safety net |
| `AUTO_RELEASE_WORKFLOW.md` | `auto-release.yaml` template and release job sequence |
| `COMMIT_CONVENTIONS.md` | Conventional Commit bump rules and setup checklist |
| `TROUBLESHOOTING.md` | GitHub Actions gotchas and failure fixes |

## When to Use

| Repo type | Fit |
|---|---|
| Public library/tool | Yes — zero-friction releases, users get binaries immediately |
| Private internal service | Maybe — often deploy directly instead |
| Infra/config repo | Usually no — manual release control preferred |
| Monorepo | Adapt — likely per-package versioning |
| Repo without binaries | Adapt — skip binary build, release tag + CHANGELOG |

## Core Rules

- CI is release gate. Release workflow only runs on successful CI `workflow_run`.
- Build artifacts and create GitHub release in same workflow that pushes tag; do not rely on tag-triggered workflow from `GITHUB_TOKEN`.
- Pin all actions/tool versions. Never use floating `latest` for linters/toolchains.
- Use non-interactive shell. No pagers, prompts, or editor-dependent steps.
- Conventional commits define semver bump; non-conventional commits do not release.
- Generated artifacts (`dist/`, coverage) stay ignored except release uploads.

## Required Files

- `.github/workflows/ci.yaml` — lint + test + build matrix.
- `.github/workflows/auto-release.yaml` — commits → semver → CHANGELOG → tag → build → release.
- `scripts/pre-push` — local lint + test hook.
- `CHANGELOG.md` — seeded or empty; auto-maintained.
- `.gitignore` — excludes generated artifacts.
- README/CONTRIBUTING — documents conventional commit convention.

## Verification

- Push PR branch: CI runs and release does not.
- Merge/push to trunk with `fix:` commit: patch release.
- Merge/push with `feat:` commit: minor release.
- Breaking commit (`feat!:` or `BREAKING CHANGE`) creates major release.
- Release has CHANGELOG entry, tag, artifacts, checksums, and summary.

## Sources

- Proven on `Sharper-Flow/Vision-MCP-Manager`.
- Conventional Commits: https://www.conventionalcommits.org/
- GitHub `GITHUB_TOKEN` behavior: https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication
- `softprops/action-gh-release`: https://github.com/softprops/action-gh-release
