#!/usr/bin/env bash
# Install ADV git hooks by pointing core.hooksPath at the tracked .githooks
# directory. Run once per clone.
#
# Why not just symlink .git/hooks/* → .githooks/*? Because .git/hooks is not
# tracked by git and symlinks can break on fresh clones. Using
# core.hooksPath is the idiomatic way to ship hooks with a repo.
#
# Usage:
#   ./scripts/install-git-hooks.sh            # install
#   ./scripts/install-git-hooks.sh --check    # verify already configured
#   ./scripts/install-git-hooks.sh --uninstall # revert to default hooks dir
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.githooks"

mode="install"
case "${1:-}" in
  --check) mode="check" ;;
  --uninstall) mode="uninstall" ;;
  "" | install) mode="install" ;;
  *)
    echo "Usage: $0 [--check|--uninstall|install]" >&2
    exit 2
    ;;
esac

current="$(git config --get core.hooksPath || true)"

case "$mode" in
  check)
    if [[ "$current" == ".githooks" ]]; then
      echo "[adv-hooks] core.hooksPath = .githooks ✓"
      exit 0
    fi
    echo "[adv-hooks] core.hooksPath = '$current' (expected: .githooks)"
    echo "[adv-hooks] run: ./scripts/install-git-hooks.sh"
    exit 1
    ;;
  uninstall)
    if [[ -n "$current" ]]; then
      git config --unset core.hooksPath
      echo "[adv-hooks] core.hooksPath unset (reverted to default)"
    else
      echo "[adv-hooks] nothing to uninstall"
    fi
    exit 0
    ;;
  install)
    if [[ ! -d "$HOOKS_DIR" ]]; then
      echo "[adv-hooks] $HOOKS_DIR not found — is this the ADV repo?" >&2
      exit 1
    fi
    # Ensure all hook files are executable (git clones strip +x on some OSes)
    chmod +x "$HOOKS_DIR"/* 2>/dev/null || true
    git config core.hooksPath .githooks
    echo "[adv-hooks] core.hooksPath = .githooks ✓"
    echo "[adv-hooks] hooks installed:"
    ls -1 "$HOOKS_DIR" | sed 's/^/  - /'
    ;;
esac
