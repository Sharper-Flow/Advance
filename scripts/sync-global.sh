#!/usr/bin/env bash
# sync-global.sh
#
# Syncs the ADV plugin's slash commands, agents, skills, and instructions
# to the global OpenCode config at ~/.config/opencode/
#
# Run manually:   ./scripts/sync-global.sh
# Runs automatically via: .git/hooks/post-push
#
# What it does:
#   1. Copies .opencode/command/*.md  -> ~/.config/opencode/command/
#   2. Removes stale commands from global that no longer exist in repo
#   3. Copies ADV_INSTRUCTIONS.md    -> ~/.config/opencode/ADV_INSTRUCTIONS.md
#      (global opencode.json already references this path)
#   4. Removes legacy non-ADV commands
#   5. Copies .opencode/agents/*.md  -> ~/.config/opencode/agents/
#   6. Copies skills/adv-*/SKILL.md  -> ~/.config/opencode/skills/adv-*/
#
# It does NOT touch non-ADV commands, agents, or skills.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_COMMANDS="$REPO_ROOT/.opencode/command"
REPO_AGENTS="$REPO_ROOT/.opencode/agents"
REPO_SKILLS="$REPO_ROOT/skills"
GLOBAL_COMMANDS="$HOME/.config/opencode/command"
GLOBAL_AGENTS="$HOME/.config/opencode/agents"
GLOBAL_SKILLS="$HOME/.config/opencode/skills"
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
# 4. Remove non-ADV commands that were previously synced but no longer live
#    in this repo (e.g. openprompt.md which moved out of the plugin).
# ---------------------------------------------------------------------------
for stale in openprompt.md; do
  for dir in "$HOME/.config/opencode/command" "$HOME/.config/opencode/commands"; do
    target="$dir/$stale"
    if [ -f "$target" ]; then
      rm "$target"
      echo "    removed legacy: $target"
    fi
  done
done

# ---------------------------------------------------------------------------
# 5. Sync ADV_INSTRUCTIONS.md to global config dir
#    (opencode.json points at ~/dev/oc-plugins/advance/ADV_INSTRUCTIONS.md
#    which is already the repo file - no copy needed, already symlinked via path)
# ---------------------------------------------------------------------------
# No copy needed — the global opencode.json already references the repo path
# directly: "~/dev/oc-plugins/advance/ADV_INSTRUCTIONS.md"

# ---------------------------------------------------------------------------
# 6. Sync ADV agents from .opencode/agents/ to global
# ---------------------------------------------------------------------------
mkdir -p "$GLOBAL_AGENTS"
agents_copied=0
if [ -d "$REPO_AGENTS" ]; then
  for src in "$REPO_AGENTS"/*.md; do
    [ -f "$src" ] || continue
    dest="$GLOBAL_AGENTS/$(basename "$src")"
    cp "$src" "$dest"
    echo "    copied agent: $(basename "$src")"
    ((agents_copied++)) || true
  done
fi
echo "    $agents_copied agent(s) synced"

# Remove stale ADV agents from global that no longer exist in repo
agents_removed=0
for global_agent in "$GLOBAL_AGENTS"/adv-*.md "$GLOBAL_AGENTS"/tron.md; do
  [ -f "$global_agent" ] || continue
  name="$(basename "$global_agent")"
  if [ ! -f "$REPO_AGENTS/$name" ]; then
    rm "$global_agent"
    echo "    removed stale agent: $name"
    ((agents_removed++)) || true
  fi
done
[ "$agents_removed" -gt 0 ] && echo "    $agents_removed stale agent(s) removed" || true

# ---------------------------------------------------------------------------
# 7. Sync ADV skills from skills/ to global
# ---------------------------------------------------------------------------
skills_copied=0
if [ -d "$REPO_SKILLS" ]; then
  for skill_dir in "$REPO_SKILLS"/adv-*/; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    skill_file="$skill_dir/SKILL.md"
    [ -f "$skill_file" ] || continue
    dest_dir="$GLOBAL_SKILLS/$skill_name"
    mkdir -p "$dest_dir"
    cp "$skill_file" "$dest_dir/SKILL.md"
    echo "    copied skill: $skill_name/SKILL.md"
    ((skills_copied++)) || true
  done
fi
echo "    $skills_copied skill(s) synced"

# Remove stale ADV skills from global that no longer exist in repo
skills_removed=0
for global_skill in "$GLOBAL_SKILLS"/adv-*/; do
  [ -d "$global_skill" ] || continue
  skill_name="$(basename "$global_skill")"
  if [ ! -d "$REPO_SKILLS/$skill_name" ]; then
    rm -rf "$global_skill"
    echo "    removed stale skill: $skill_name"
    ((skills_removed++)) || true
  fi
done
[ "$skills_removed" -gt 0 ] && echo "    $skills_removed stale skill(s) removed" || true

echo "==> Done."
echo ""
echo "    Commands in global: $(ls "$GLOBAL_COMMANDS"/adv-*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "    Agents in global:  $(ls "$GLOBAL_AGENTS"/*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "    Skills in global:  $(ls -d "$GLOBAL_SKILLS"/adv-*/ 2>/dev/null | wc -l | tr -d ' ')"
echo "    Restart OpenCode sessions to pick up changes."
