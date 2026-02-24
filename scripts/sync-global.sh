#!/usr/bin/env bash
# sync-global.sh
#
# Syncs the ADV plugin's slash commands and instructions to the global
# OpenCode config at ~/.config/opencode/
#
# Run manually:   ./scripts/sync-global.sh
# Runs automatically via: .git/hooks/post-push
#
# What it does:
#   1. Copies .opencode/command/*.md  -> ~/.config/opencode/command/
#   2. Removes stale commands from global that no longer exist in repo
#   3. Copies ADV_INSTRUCTIONS.md    -> ~/.config/opencode/ADV_INSTRUCTIONS.md
#      (global opencode.json already references this path)
#
# It does NOT touch non-ADV commands (openprompt.md, etc.)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_COMMANDS="$REPO_ROOT/.opencode/command"
GLOBAL_COMMANDS="$HOME/.config/opencode/command"
GLOBAL_CONFIG="$HOME/.config/opencode"

echo "==> ADV sync-global: $REPO_ROOT -> $GLOBAL_CONFIG"

# ---------------------------------------------------------------------------
# 1. Ensure global command dir exists
# ---------------------------------------------------------------------------
mkdir -p "$GLOBAL_COMMANDS"

# ---------------------------------------------------------------------------
# 2. Copy all adv-*.md commands from repo to global
# ---------------------------------------------------------------------------
copied=0
for src in "$REPO_COMMANDS"/adv-*.md; do
  [ -f "$src" ] || continue
  dest="$GLOBAL_COMMANDS/$(basename "$src")"
  cp "$src" "$dest"
  echo "    copied: $(basename "$src")"
  ((copied++)) || true
done
echo "    $copied command(s) synced"

# ---------------------------------------------------------------------------
# 3. Remove stale adv-*.md from global that no longer exist in repo
# ---------------------------------------------------------------------------
removed=0
for global_cmd in "$GLOBAL_COMMANDS"/adv-*.md; do
  [ -f "$global_cmd" ] || continue
  name="$(basename "$global_cmd")"
  if [ ! -f "$REPO_COMMANDS/$name" ]; then
    rm "$global_cmd"
    echo "    removed stale: $name"
    ((removed++)) || true
  fi
done
[ "$removed" -gt 0 ] && echo "    $removed stale command(s) removed" || true

# ---------------------------------------------------------------------------
# 4. Sync ADV_INSTRUCTIONS.md to global config dir
#    (opencode.json points at ~/dev/oc-plugins/advance/ADV_INSTRUCTIONS.md
#    which is already the repo file - no copy needed, already symlinked via path)
# ---------------------------------------------------------------------------
# No copy needed — the global opencode.json already references the repo path
# directly: "~/dev/oc-plugins/advance/ADV_INSTRUCTIONS.md"

echo "==> Done."
echo ""
echo "    Commands in global: $(ls "$GLOBAL_COMMANDS"/adv-*.md | wc -l | tr -d ' ')"
echo "    Restart OpenCode sessions to pick up changes."
