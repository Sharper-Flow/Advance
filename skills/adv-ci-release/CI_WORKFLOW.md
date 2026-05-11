# CI Workflow Template

## `.github/workflows/ci.yaml`

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
        uses: {linter-action} # PIN VERSION — never use latest

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

## Stack adaptation

| Component | Go | TypeScript/Bun | Rust | Python |
|---|---|---|---|---|
| Linter | `golangci-lint v2` pinned | `biome check` / repo check | `cargo clippy` | `ruff check` |
| Test | `go test -race -p 2 -timeout 5m` | `bun test` / `pnpm test` | `cargo test` | `pytest` |
| Build | `go build` matrix | `bun build` per target | `cargo build --release` | `pyinstaller` / Docker |
| Coverage | `codecov-action@v5` | `codecov-action@v5` | `codecov-action@v5` | `codecov-action@v5` |

## `scripts/pre-push`

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "==> Running pre-push checks..."
echo "  lint..."
{linter-command} || { echo "ERROR: Lint failed."; exit 1; }
echo "  test..."
{test-command} || { echo "ERROR: Tests failed."; exit 1; }
echo "==> All checks passed."
```

Install with `cp scripts/pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push`.
