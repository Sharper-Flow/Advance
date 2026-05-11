# Conventional Commit Release Rules

## Version bumps

| Commit prefix | Bump | Example |
|---|---|---|
| `feat!:` or `BREAKING CHANGE` | Major (`x.0.0`) | `feat!: redesign API` |
| `feat:` | Minor (`0.x.0`) | `feat: add slot groups` |
| `fix:` | Patch (`0.0.x`) | `fix: resolve data race` |
| `chore:`, `ci:`, `docs:`, `refactor:`, `test:`, `perf:`, `style:`, `build:` | Patch | `ci: pin golangci-lint` |
| No conventional prefix | Skip | `wip stuff` |

## CHANGELOG categories

| Prefix | Section |
|---|---|
| `feat:` | Added |
| `fix:` | Fixed |
| `chore:`, `ci:`, `docs:`, `refactor:`, `test:`, `perf:`, `style:`, `build:` | Changed |

## Setup checklist

- [ ] `.github/workflows/ci.yaml` — lint + test + build matrix.
- [ ] `.github/workflows/auto-release.yaml` — conventional commits → semver → CHANGELOG → tag → build → release.
- [ ] Optional `.github/workflows/release.yaml` for manual tag-push releases only if it does not depend on `GITHUB_TOKEN` tag-trigger behavior.
- [ ] `scripts/pre-push` — local lint + test hook, installed to `.git/hooks/`.
- [ ] `CHANGELOG.md` — seeded with initial version or empty.
- [ ] `.gitignore` — blocks generated artifacts (`dist/`, coverage outputs, etc.).
- [ ] Tool versions pinned in CI and locally.
- [ ] Conventional commit convention documented in README or CONTRIBUTING.
- [ ] CI test timeout configured.

## Release expectations

- Patch release for fixes and maintenance commits.
- Minor release for new backward-compatible features.
- Major release for breaking changes.
- No release for commits without conventional prefix.
- Release notes include generated GitHub notes plus committed CHANGELOG entry.
