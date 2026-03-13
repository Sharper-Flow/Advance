#!/usr/bin/env bash
# sync-global.sh
#
# Syncs the ADV plugin's slash commands, agents, skills, and instructions
# to the global OpenCode config at ~/.config/opencode/
#
# Usage:
#   ./scripts/sync-global.sh           # Sync assets + check config (report only)
#   ./scripts/sync-global.sh --check   # Check config only, no file changes
#   ./scripts/sync-global.sh --fix     # Sync assets + auto-patch opencode.json
#
# What it does:
#   1. Copies .opencode/command/*.md  -> ~/.config/opencode/command/
#   2. Removes stale commands from global that no longer exist in repo
#   3. Removes legacy non-ADV commands
#   4. Copies .opencode/agents/*.md  -> ~/.config/opencode/agents/
#   5. Copies skills/adv-*/SKILL.md  -> ~/.config/opencode/skills/adv-*/
#   6. Validates opencode.json has ADV plugin + instruction entries
#   7. (--fix only) Patches opencode.json to add missing ADV entries
#
# It does NOT touch non-ADV commands, agents, skills, or config entries.

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
MODE="sync"  # default: sync assets + check config
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --fix)   MODE="fix" ;;
    --help|-h)
      echo "Usage: $0 [--check | --fix]"
      echo ""
      echo "  (no flags)  Sync assets + check config (report issues)"
      echo "  --check     Check config only, no file changes at all"
      echo "  --fix       Sync assets + auto-patch opencode.json if needed"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg (use --help for usage)"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_COMMANDS="$REPO_ROOT/.opencode/command"
REPO_AGENTS="$REPO_ROOT/.opencode/agents"
REPO_SKILLS="$REPO_ROOT/skills"
GLOBAL_COMMANDS="$HOME/.config/opencode/command"
GLOBAL_AGENTS="$HOME/.config/opencode/agents"
GLOBAL_SKILLS="$HOME/.config/opencode/skills"
GLOBAL_CONFIG="$HOME/.config/opencode"
GLOBAL_JSON="$GLOBAL_CONFIG/opencode.json"

# ADV entries that must exist in opencode.json
ADV_PLUGIN_PATH="$REPO_ROOT/plugin"
ADV_INSTRUCTION_PATH="$REPO_ROOT/ADV_INSTRUCTIONS.md"

echo "==> ADV sync-global ($MODE): $REPO_ROOT -> $GLOBAL_CONFIG"

# ---------------------------------------------------------------------------
# Config check/fix functions
# ---------------------------------------------------------------------------
config_issues=0

check_jq() {
  if ! command -v jq &>/dev/null; then
    echo "    ⚠  jq not found — config validation requires jq"
    echo "    Install: sudo apt-get install -y jq  (or brew install jq)"
    return 1
  fi
  return 0
}

# Check if a value exists in a JSON array at a given path.
# Handles both exact match and tilde-expanded match.
json_array_contains() {
  local file="$1" jq_path="$2" value="$3"
  # Exact match
  if jq -e "$jq_path | index(\"$value\")" "$file" &>/dev/null; then
    return 0
  fi
  # Try with ~ expanded to $HOME
  local tilde_value="${value/#$HOME/\~}"
  if jq -e "$jq_path | index(\"$tilde_value\")" "$file" &>/dev/null; then
    return 0
  fi
  return 1
}

check_config() {
  echo ""
  echo "--- Config Validation ---"

  if ! check_jq; then
    ((config_issues++)) || true
    return
  fi

  if [ ! -f "$GLOBAL_JSON" ]; then
    echo "    ✗  $GLOBAL_JSON does not exist"
    echo "       Run with --fix to create it, or see SETUP.md for manual setup"
    ((config_issues++)) || true
    return
  fi

  # Validate JSON syntax
  if ! jq empty "$GLOBAL_JSON" 2>/dev/null; then
    echo "    ✗  $GLOBAL_JSON is not valid JSON"
    echo "       Fix the JSON syntax manually before running --fix"
    ((config_issues++)) || true
    return
  fi

  # Check plugin entry
  if json_array_contains "$GLOBAL_JSON" ".plugin // []" "$ADV_PLUGIN_PATH"; then
    echo "    ✓  plugin: ADV plugin registered"
  else
    echo "    ✗  plugin: ADV plugin path missing from .plugin array"
    echo "       Expected: \"$ADV_PLUGIN_PATH\""
    ((config_issues++)) || true
  fi

  # Check instruction entry
  if json_array_contains "$GLOBAL_JSON" ".instructions // []" "$ADV_INSTRUCTION_PATH"; then
    echo "    ✓  instructions: ADV_INSTRUCTIONS.md registered"
  else
    echo "    ✗  instructions: ADV_INSTRUCTIONS.md missing from .instructions array"
    echo "       Expected: \"$ADV_INSTRUCTION_PATH\""
    ((config_issues++)) || true
  fi

  echo ""
  if [ "$config_issues" -eq 0 ]; then
    echo "    Config: all ADV entries present ✓"
  else
    echo "    Config: $config_issues issue(s) found"
    if [ "$MODE" != "fix" ]; then
      echo "    Run with --fix to auto-patch, or edit $GLOBAL_JSON manually"
    fi
  fi
}

fix_config() {
  echo ""
  echo "--- Config Patching ---"

  if ! check_jq; then
    echo "    ✗  Cannot patch without jq"
    return 1
  fi

  # Create config dir if needed
  mkdir -p "$GLOBAL_CONFIG"

  # If no config file, create a minimal one
  if [ ! -f "$GLOBAL_JSON" ]; then
    echo '{}' | jq \
      --arg plugin "$ADV_PLUGIN_PATH" \
      --arg instr "$ADV_INSTRUCTION_PATH" \
      '. + {
        "plugin": [$plugin],
        "instructions": [$instr]
      }' > "$GLOBAL_JSON"
    echo "    ✓  Created $GLOBAL_JSON with ADV entries"
    echo "       You will need to add other settings (mcp, provider, etc.) manually"
    echo "       See SETUP.md for the full config reference"
    return 0
  fi

  # Validate JSON before patching
  if ! jq empty "$GLOBAL_JSON" 2>/dev/null; then
    echo "    ✗  $GLOBAL_JSON is not valid JSON — fix syntax first"
    return 1
  fi

  # Back up before patching
  local backup="$GLOBAL_JSON.bak.$(date +%Y%m%d%H%M%S)"
  cp "$GLOBAL_JSON" "$backup"
  echo "    Backup: $backup"

  local patched=0
  local tmp_json
  tmp_json="$(mktemp)"

  # Start with current config
  cp "$GLOBAL_JSON" "$tmp_json"

  # Patch plugin array if needed
  if ! json_array_contains "$tmp_json" ".plugin // []" "$ADV_PLUGIN_PATH"; then
    jq --arg plugin "$ADV_PLUGIN_PATH" \
      '.plugin = ((.plugin // []) + [$plugin] | unique)' \
      "$tmp_json" > "$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
    echo "    ✓  Added plugin: $ADV_PLUGIN_PATH"
    ((patched++)) || true
  fi

  # Patch instructions array if needed
  if ! json_array_contains "$tmp_json" ".instructions // []" "$ADV_INSTRUCTION_PATH"; then
    jq --arg instr "$ADV_INSTRUCTION_PATH" \
      '.instructions = ((.instructions // []) + [$instr] | unique)' \
      "$tmp_json" > "$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
    echo "    ✓  Added instruction: $ADV_INSTRUCTION_PATH"
    ((patched++)) || true
  fi

  if [ "$patched" -gt 0 ]; then
    # Atomic write
    mv "$tmp_json" "$GLOBAL_JSON"
    echo "    Patched $patched entry/entries in $GLOBAL_JSON"
  else
    rm -f "$tmp_json"
    echo "    No patches needed — config already correct"
    # Clean up unnecessary backup
    rm -f "$backup"
  fi
}

# ===========================================================================
# Check-only mode: just validate config and exit
# ===========================================================================
if [ "$MODE" = "check" ]; then
  check_config
  if [ "$config_issues" -gt 0 ]; then
    exit 1
  fi
  exit 0
fi

# ===========================================================================
# Asset sync (runs for both "sync" and "fix" modes)
# ===========================================================================

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
# 5. Sync ADV agents from .opencode/agents/ to global
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
# 6. Sync ADV skills from skills/ to global
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

# ===========================================================================
# Config validation / patching
# ===========================================================================
if [ "$MODE" = "fix" ]; then
  fix_config
else
  check_config
fi

# ===========================================================================
# Summary
# ===========================================================================
echo ""
echo "==> Done."
echo ""
echo "    Commands in global: $(ls "$GLOBAL_COMMANDS"/adv-*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "    Agents in global:  $(ls "$GLOBAL_AGENTS"/*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "    Skills in global:  $(ls -d "$GLOBAL_SKILLS"/adv-*/ 2>/dev/null | wc -l | tr -d ' ')"

if [ "$MODE" = "fix" ]; then
  echo "    Config: patched (if needed)"
else
  if [ "$config_issues" -gt 0 ]; then
    echo "    Config: $config_issues issue(s) — run with --fix to auto-patch"
  else
    echo "    Config: OK"
  fi
fi

echo "    Restart OpenCode sessions to pick up changes."
