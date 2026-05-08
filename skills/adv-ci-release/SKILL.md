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

A battle-tested CI/CD pattern for ADV-managed public repositories. Every push to trunk/main that passes CI automatically gets a semver release with categorized CHANGELOG, platform binaries, and checksums. Zero human gating for patch/minor bumps.

## Architecture

```
Push to trunk
    │
    ▼
┌─────────────────────────┐
│  CI (ci.yaml)           │
│  ┌─────┐ ┌──────┐      │
│  │Lint │ │Test  │      │
│  └──┬──┘ └──┬───┘      │
│     │  Build Matrix     │
│     │  (4 platforms)    │
│     ▼       ▼          │
│     └───┬────┘          │
│         ▼               │
│    CI Success ✅        │
└─────────┬───────────────┘
          │ (workflow_run trigger)
          ▼
┌─────────────────────────┐
│  Auto Release           │
│  (auto-release.yaml)    │
│                         │
│  1. Get last tag        │
│  2. Parse conv. commits │
│  3. Bump semver         │
│  4. Generate CHANGELOG  │
│  5. Commit + tag + push │
│  6. Build binaries      │
│  7. Create GH release   │
└─────────────────────────┘
```

## Workflow Files

### 1. `ci.yaml` — Gate (must pass before release)

```yaml
name: CI

on:
  push:
    branches: [trunk, main]
  pull_request:
    branches: [trunk, main]

permissions:
  contents: read

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up {language}
        uses: {setup-action}
      - name: Lint
        uses: {linter-action}  # PIN VERSION — never use "latest"

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up {language}
        uses: {setup-action}
      - name: Run tests
        run: {test-command}
      - name: Upload coverage
        uses: codecov/codecov-action@v5

  build:
    name: Build (${{ matrix.goos }}-${{ matrix.goarch }})
    runs-on: ubuntu-latest
    needs: [lint, test]
    strategy:
      matrix:
        include:
          - goos: linux
            goarch: amd64
          - goos: linux
            goarch: arm64
          - goos: darwin
            goarch: amd64
          - goos: darwin
            goarch: arm64
    steps:
      - uses: actions/checkout@v4
      - name: Set up {language}
        uses: {setup-action}
      - name: Build
        run: {build-command}
      - name: Upload artifact
        uses: actions/upload-artifact@v4
```

### 2. `auto-release.yaml` — Release pipeline

```yaml
name: Auto Release

on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [trunk, main]

permissions:
  contents: write

jobs:
  release:
    name: Auto Release
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Get last tag
        id: last_tag
        run: |
          LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
          echo "tag=$LAST_TAG" >> "$GITHUB_OUTPUT"

      - name: Determine version bump
        id: bump
        run: |
          LAST_TAG="${{ steps.last_tag.outputs.tag }}"
          COMMITS=$(git log "${LAST_TAG}..HEAD" --pretty=format:"%s" 2>/dev/null || git log --pretty=format:"%s")

          # If no new commits, skip
          COUNT=$(echo "$COMMITS" | wc -l | tr -d ' ')
          if [ "$COUNT" -eq 0 ]; then
            echo "skip=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "skip=false" >> "$GITHUB_OUTPUT"

          # Parse conventional commits
          HAS_BREAKING=false
          HAS_FEAT=false
          HAS_FIX=false
          HAS_OTHER=false

          while IFS= read -r line; do
            if echo "$line" | grep -qE '^[a-z]+(\(.+\))?!:'; then
              HAS_BREAKING=true
            fi
            if echo "$line" | grep -qE '^feat(\(.+\))?:'; then
              HAS_FEAT=true
            fi
            if echo "$line" | grep -qE '^fix(\(.+\))?:'; then
              HAS_FIX=true
            fi
            if echo "$line" | grep -qE '^[a-z]+(\(.+\))?:'; then
              HAS_OTHER=true
            fi
          done <<< "$COMMITS"

          # Bump level
          CURRENT="${LAST_TAG#v}"
          IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

          if [ "$HAS_BREAKING" = true ]; then
            MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0; BUMP="major"
          elif [ "$HAS_FEAT" = true ]; then
            MINOR=$((MINOR + 1)); PATCH=0; BUMP="minor"
          elif [ "$HAS_FIX" = true ] || [ "$HAS_OTHER" = true ]; then
            PATCH=$((PATCH + 1)); BUMP="patch"
          else
            echo "skip=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          NEW_TAG="v${MAJOR}.${MINOR}.${PATCH}"
          echo "new_tag=$NEW_TAG" >> "$GITHUB_OUTPUT"
          echo "bump=$BUMP" >> "$GITHUB_OUTPUT"

      - name: Generate CHANGELOG
        if: steps.bump.outputs.skip != 'true'
        run: |
          LAST_TAG="${{ steps.last_tag.outputs.tag }}"
          NEW_TAG="${{ steps.bump.outputs.new_tag }}"
          TODAY=$(date +%Y-%m-%d)

          FEAT_ENTRIES=""
          FIX_ENTRIES=""
          OTHER_ENTRIES=""

          COMMITS=$(git log "${LAST_TAG}..HEAD" --pretty=format:"%s")

          while IFS= read -r line; do
            MSG=$(echo "$line" | sed -E 's/^[a-z]+(\(.+\))?:\s*//')
            if echo "$line" | grep -qE '^feat(\(.+\))?:'; then
              FEAT_ENTRIES="${FEAT_ENTRIES}\n- ${MSG}"
            elif echo "$line" | grep -qE '^fix(\(.+\))?:'; then
              FIX_ENTRIES="${FIX_ENTRIES}\n- ${MSG}"
            elif echo "$line" | grep -qE '^(chore|ci|docs|refactor|test|perf|style|build)(\(.+\))?:'; then
              OTHER_ENTRIES="${OTHER_ENTRIES}\n- ${MSG}"
            fi
          done <<< "$COMMITS"

          ENTRY="## ${TODAY} (${NEW_TAG})"
          [ -n "$FEAT_ENTRIES" ] && ENTRY="${ENTRY}\n\n### Added${FEAT_ENTRIES}"
          [ -n "$FIX_ENTRIES" ] && ENTRY="${ENTRY}\n\n### Fixed${FIX_ENTRIES}"
          [ -n "$OTHER_ENTRIES" ] && ENTRY="${ENTRY}\n\n### Changed${OTHER_ENTRIES}"

          if [ -f CHANGELOG.md ]; then
            EXISTING=$(cat CHANGELOG.md)
            printf '%s\n\n%s\n' "$ENTRY" "$EXISTING" > CHANGELOG.md
          else
            printf '%s\n' "$ENTRY" > CHANGELOG.md
          fi

      - name: Commit CHANGELOG and push tag
        if: steps.bump.outputs.skip != 'true'
        run: |
          NEW_TAG="${{ steps.bump.outputs.new_tag }}"
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add CHANGELOG.md
          git diff --cached --quiet || git commit -m "docs: update changelog for ${NEW_TAG}"
          git tag -a "$NEW_TAG" -m "Release ${NEW_TAG}"
          git push origin HEAD:"${{ github.event.workflow_run.head_branch }}"
          git push origin "$NEW_TAG"

      - name: Build release binaries
        if: steps.bump.outputs.skip != 'true'
        run: |
          VERSION="${{ steps.bump.outputs.new_tag }}"
          mkdir -p dist
          # Adapt build commands per stack
          for GOOS in linux darwin; do
            for GOARCH in amd64 arm64; do
              GOOS=$GOOS GOARCH=$GOARCH go build \
                -ldflags "-X main.version=${VERSION}" \
                -o "vision" ./cmd/vision
              tar -czf "dist/vision_${GOOS}_${GOARCH}.tar.gz" vision
              rm vision
            done
          done
          cd dist && sha256sum *.tar.gz > checksums.txt

      - name: Create Release
        if: steps.bump.outputs.skip != 'true'
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.bump.outputs.new_tag }}
          files: |
            dist/*.tar.gz
            dist/checksums.txt
          generate_release_notes: true

      - name: Summary
        if: steps.bump.outputs.skip != 'true'
        run: |
          echo "## Auto Release 🚀" >> "$GITHUB_STEP_SUMMARY"
          echo "**${{ steps.bump.outputs.new_tag }}** (${{ steps.bump.outputs.bump }} from ${{ steps.last_tag.outputs.tag }})" >> "$GITHUB_STEP_SUMMARY"

      - name: Skip summary
        if: steps.bump.outputs.skip == 'true'
        run: echo "## No Release Needed" >> "$GITHUB_STEP_SUMMARY"
```

### 3. `scripts/pre-push` — Local safety net

```bash
#!/usr/bin/env bash
# Pre-push hook — runs lint + test before allowing push
# Install: cp scripts/pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push

set -euo pipefail
echo "==> Running pre-push checks..."
echo "  lint..."
{linter-command} || { echo "ERROR: Lint failed."; exit 1; }
echo "  test..."
{test-command} || { echo "ERROR: Tests failed."; exit 1; }
echo "==> All checks passed."
```

## Stack Adaptation Guide

The pattern is stack-agnostic. Adapt these per language:

| Component | Go (reference) | TypeScript/Bun | Rust | Python |
|---|---|---|---|
| Linter | `golangci-lint v2` (pinned) | `biome check` | `cargo clippy` | `ruff check` |
| Test | `go test -race -p 2 -timeout 5m` | `bun test` | `cargo test` | `pytest` |
| Build | `go build` with GOOS/GOARCH matrix | `bun build` per target | `cargo build --release` per target | `pyinstaller` or `docker build` |
| Coverage | `codecov-action@v5` | `codecov-action@v5` | `codecov-action@v5` | `codecov-action@v5` |
| Binary ext | `.tar.gz` | `.tar.gz` | `.tar.gz` | `.tar.gz` or Docker image |

## Version Bump Rules

| Commit prefix | Bump | Example |
|---|---|---|
| `feat!:` or `BREAKING CHANGE` | **Major** (x.0.0) | `feat!: redesign API` |
| `feat:` | **Minor** (0.x.0) | `feat: add slot groups` |
| `fix:` | **Patch** (0.0.x) | `fix: resolve data race` |
| `chore:`, `ci:`, `docs:` etc. | **Patch** (0.0.x) | `ci: pin golangci-lint` |
| No conventional prefix | **Skip** — no release | `wip stuff` |

## Gotchas & Hard-Won Lessons

### 1. GITHUB_TOKEN Cannot Trigger Other Workflows

**Problem:** If `auto-release.yaml` pushes a tag using `GITHUB_TOKEN`, the tag-triggered `release.yaml` workflow will NOT fire. GitHub security feature — prevents infinite loops.

**Fix:** Build binaries and create the GitHub release in the SAME workflow as the tag push. Do NOT chain `auto-release → tag push → release workflow`.

### 2. Process Substitution Fails in GitHub Actions

**Problem:** `done < <(git log ...)` (process substitution) causes syntax errors in GitHub Actions bash.

**Fix:** Use heredoc: `done <<< "$COMMITS"`. Collect git output into a variable first, then iterate.

### 3. Race Detection + Parallel Packages = CI Flakes

**Problem:** `go test -race ./...` runs all packages in parallel. On 2-core GitHub runners, subprocess-heavy tests (MCP SSE connections, Node.js child processes) get starved and timeout.

**Fix:** `-p 2` limits package parallelism. `-timeout 5m` prevents the default 10min hang from blocking CI.

### 4. Pin All Tool Versions

**Problem:** `golangci-lint-action@v7` with no version pin uses `latest`. New major releases break CI without warning.

**Fix:** Pin exact versions in CI AND locally. Example: `version: v2.12.2`. Document the pinned version in the repo.

### 5. Async Callbacks Need Polling in Tests

**Problem:** MCP SDK's `InitializedHandler` fires asynchronously when the client sends `notifications/initialized`. Tests that check handler side effects immediately after `Connect` race with the async notification.

**Fix:** Poll with a deadline (2s, 10ms interval) instead of asserting synchronously.

### 6. Pre-Push Hook Saves Round-Trips

**Problem:** Without a pre-push hook, lint/test failures only surface after the 2-3 minute CI run.

**Fix:** `scripts/pre-push` installed to `.git/hooks/pre-push`. Catches failures locally in seconds.

## When to Use

| Repo type | Use this pattern? |
|---|---|
| Public library/tool | **Yes** — zero-friction releases, users get binaries immediately |
| Private internal service | **Maybe** — auto-release is overkill if you deploy directly |
| Infra/config repo | **No** — manual release control preferred |
| Monorepo with multiple packages | **Adapt** — may need per-package versioning |
| Repo without binaries | **Adapt** — skip binary build, release just the tag + CHANGELOG |

## Checklist for New Repo Setup

- [ ] `.github/workflows/ci.yaml` — lint + test + build matrix
- [ ] `.github/workflows/auto-release.yaml` — conv. commits → semver → CHANGELOG → tag → build → release
- [ ] `.github/workflows/release.yaml` (optional) — for manual tag-push releases
- [ ] `scripts/pre-push` — local lint + test hook, installed to `.git/hooks/`
- [ ] `CHANGELOG.md` — seeded with initial version or empty (auto-maintained)
- [ ] `.gitignore` — blocks generated artifacts (dist/, coverage.out, etc.)
- [ ] All tool versions pinned in CI (linter, language runtime, actions)
- [ ] Conventional commit convention documented in CONTRIBUTING.md or README
- [ ] Test timeout configured for CI (prevent 10min dead hangs)

## Sources

- Proven on `Sharper-Flow/Vision-MCP-Manager` (Go, MCP SDK, subprocess-heavy tests)
- Conventional Commits spec: https://www.conventionalcommits.org/
- GitHub Actions `GITHUB_TOKEN` limitation: https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication
- `softprops/action-gh-release`: https://github.com/softprops/action-gh-release
