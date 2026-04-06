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
#   ./scripts/sync-global.sh --dry-run # Preview overlay/config changes without writing
#   ./scripts/sync-global.sh --diff    # Show overlay diffs when managed blocks change
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
# It does NOT touch non-ADV commands, agents, skills, or config entries,
# except removing legacy `openprompt.md` copies previously installed by this repo.

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
MODE="sync"  # default: sync assets + check config
DRY_RUN=false
SHOW_DIFF=false
for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --fix)   MODE="fix" ;;
    --dry-run) DRY_RUN=true ;;
    --diff) SHOW_DIFF=true ;;
    --help|-h)
      echo "Usage: $0 [--check | --fix] [--dry-run] [--diff]"
      echo ""
      echo "  (no flags)  Sync assets + check config (report issues)"
      echo "  --check     Check config only, no file changes at all"
      echo "  --fix       Sync assets + auto-patch opencode.json if needed"
      echo "  --dry-run   Preview managed overlay/config changes without writing"
      echo "  --diff      Show managed overlay diffs when blocks change"
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
REPO_OVERLAYS="$REPO_ROOT/.opencode/overlays"
REPO_SKILLS="$REPO_ROOT/skills"
GLOBAL_COMMANDS="$HOME/.config/opencode/command"
GLOBAL_AGENTS="$HOME/.config/opencode/agents"
GLOBAL_SKILLS="$HOME/.config/opencode/skills"
GLOBAL_CONFIG="$HOME/.config/opencode"

# ---------------------------------------------------------------------------
# Resolve config file: opencode.jsonc takes priority over opencode.json
# (matches OpenCode's own resolution order)
# ---------------------------------------------------------------------------
GLOBAL_JSON_IS_JSONC=false
if [ -f "$GLOBAL_CONFIG/opencode.jsonc" ]; then
  GLOBAL_JSON="$GLOBAL_CONFIG/opencode.jsonc"
  GLOBAL_JSON_IS_JSONC=true
elif [ -f "$GLOBAL_CONFIG/opencode.json" ]; then
  GLOBAL_JSON="$GLOBAL_CONFIG/opencode.json"
else
  # Neither exists yet — will be created as .json by --fix
  GLOBAL_JSON="$GLOBAL_CONFIG/opencode.json"
fi

# ADV entries that must exist in opencode.json(c)
ADV_PLUGIN_PATH="$REPO_ROOT/plugin"
ADV_INSTRUCTION_PATH="$REPO_ROOT/ADV_INSTRUCTIONS.md"

echo "==> ADV sync-global ($MODE): $REPO_ROOT -> $GLOBAL_CONFIG"
if [ "$DRY_RUN" = true ]; then
  echo "    preview mode: --dry-run enabled"
fi
if [ "$SHOW_DIFF" = true ]; then
  echo "    preview mode: --diff enabled"
fi

# ---------------------------------------------------------------------------
# Pre-flight: plugin build check
#
# OpenCode loads the plugin from $ADV_PLUGIN_PATH, which expects built output
# at plugin/dist/index.js. plugin/dist/ is gitignored, so a fresh clone will
# not have it until the user runs `pnpm install && pnpm build` in plugin/.
# Warn loudly but do not abort — sync can still copy assets even if the
# plugin itself isn't built yet.
# ---------------------------------------------------------------------------
ADV_PLUGIN_DIST="$ADV_PLUGIN_PATH/dist/index.js"
if [ ! -f "$ADV_PLUGIN_DIST" ]; then
  echo ""
  echo "    ⚠  Plugin not built: $ADV_PLUGIN_DIST is missing"
  echo "       OpenCode will fail to load the ADV plugin without it."
  echo "       Run:  (cd \"$ADV_PLUGIN_PATH\" && pnpm install && pnpm build)"
  echo ""
fi

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

# Strip JSONC comments (// and /* */) so jq can parse the content.
# Handles both .json (no-op passthrough) and .jsonc files.
# Usage: jsonc_to_json < file.jsonc | jq ...
#    or: jsonc_to_json file.jsonc | jq ...
jsonc_to_json() {
  local input
  if [ $# -gt 0 ] && [ -f "$1" ]; then
    input="$(cat "$1")"
  else
    input="$(cat)"
  fi
  if [ "$GLOBAL_JSON_IS_JSONC" = true ]; then
    # Strip JSONC comments:
    #   1. Block comments: /* ... */
    #   2. Full-line comments: lines starting with optional whitespace then //
    #   3. Trailing comments: // at end of line (only when no " follows,
    #      which preserves URLs like "https://..." inside strings)
    # Uses '#' as sed delimiter to avoid conflicts with / in patterns.
    echo "$input" | sed -E \
      -e 's#/\*([^*]|\*[^/])*\*/##g' \
      -e 's#^([[:space:]]*)//.*$#\1#' \
      -e 's#[ \t]*//[^"]*$##'
  else
    printf '%s' "$input"
  fi
}

# Check if a value exists in a JSON array at a given path.
# Handles both exact match and tilde-expanded match.
# Works with both .json and .jsonc config files.
json_array_contains() {
  local file="$1" jq_path="$2" value="$3"
  local tilde_value="${value/#$HOME/\~}"
  jsonc_to_json "$file" | jq --arg exact "$value" --arg tilde "$tilde_value" \
    -e "($jq_path | if type == \"array\" then . else [.] end) | any(. == \$exact or . == \$tilde)" \
    &>/dev/null
}

print_diff() {
  local before_file="$1" after_file="$2"
  if [ "$SHOW_DIFF" = true ]; then
    diff -u "$before_file" "$after_file" || true
  fi
}

write_or_preview() {
  local target="$1" source_tmp="$2"
  if [ "$DRY_RUN" = true ]; then
    print_diff "$target" "$source_tmp"
    return 0
  fi

  mv "$source_tmp" "$target"
}

apply_overlay_block() {
  local overlay_name="$1"
  local target_file="$2"
  local overlay_file="$REPO_OVERLAYS/$overlay_name.overlay.md"
  local start_marker="<!-- ADV_SYNC:START $overlay_name -->"
  local end_marker="<!-- ADV_SYNC:END $overlay_name -->"

  if [ ! -f "$target_file" ]; then
    echo "    skipped missing shared agent: $(basename "$target_file")"
    return 0
  fi

  if [ ! -f "$overlay_file" ]; then
    echo "    missing overlay source: $(basename "$overlay_file")"
    return 1
  fi

  local marker_count
  marker_count="$(python - <<'PY' "$target_file" "$start_marker"
from pathlib import Path
import sys
text = Path(sys.argv[1]).read_text()
print(text.count(sys.argv[2]))
PY
)"
  if [ "$marker_count" -gt 1 ]; then
    echo "    duplicate overlay marker: $(basename "$target_file")"
    return 1
  fi

  local current_tmp new_tmp
  current_tmp="$(mktemp)"
  new_tmp="$(mktemp)"
  cp "$target_file" "$current_tmp"

  python - <<'PY' "$target_file" "$overlay_file" "$start_marker" "$end_marker" "$new_tmp"
from pathlib import Path
import sys

target_path, overlay_path, start_marker, end_marker, output_path = sys.argv[1:6]
target = Path(target_path).read_text()
overlay = Path(overlay_path).read_text().rstrip() + "\n"

start = target.find(start_marker)
end = target.find(end_marker)
if start != -1 and end != -1:
    end += len(end_marker)
    while end < len(target) and target[end] == "\n":
        end += 1
    result = target[:start] + overlay + target[end:]
else:
    insert_at = 0
    if target.startswith("---\n"):
        second = target.find("\n---\n", 4)
        if second != -1:
            insert_at = second + len("\n---\n")
            if insert_at < len(target) and target[insert_at] != "\n":
                overlay = "\n" + overlay
    result = target[:insert_at] + overlay + ("\n" if insert_at and not overlay.endswith("\n\n") else "") + target[insert_at:]

Path(output_path).write_text(result)
PY

  if cmp -s "$current_tmp" "$new_tmp"; then
    echo "    overlay already current: $overlay_name"
    rm -f "$current_tmp" "$new_tmp"
    return 0
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "    overlay preview: $overlay_name"
    print_diff "$current_tmp" "$new_tmp"
    rm -f "$current_tmp" "$new_tmp"
    return 0
  fi

  mv "$new_tmp" "$target_file"
  echo "    overlay synced: $overlay_name"
  rm -f "$current_tmp"
}

check_config() {
  echo ""
  echo "--- Config Validation ---"

  if ! check_jq; then
    ((config_issues++)) || true
    return
  fi

  if [ ! -f "$GLOBAL_JSON" ]; then
    echo "    ✗  No config file found (checked opencode.jsonc and opencode.json)"
    echo "       Run with --fix to create it, or see SETUP.md for manual setup"
    ((config_issues++)) || true
    return
  fi

  if [ "$GLOBAL_JSON_IS_JSONC" = true ]; then
    echo "    ℹ  Config format: JSONC ($GLOBAL_JSON)"
  fi

  # Validate JSON(C) syntax
  if ! jsonc_to_json "$GLOBAL_JSON" | jq empty 2>/dev/null; then
    echo "    ✗  $GLOBAL_JSON is not valid JSON/JSONC"
    echo "       Fix the syntax manually before running --fix"
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

  # Warn about stale global copy (wastes ~7K tokens per prompt)
  local stale_instr="~/.config/opencode/instructions/ADV_INSTRUCTIONS.md"
  local stale_instr_expanded="$HOME/.config/opencode/instructions/ADV_INSTRUCTIONS.md"
  if jsonc_to_json "$GLOBAL_JSON" | jq -e --arg s1 "$stale_instr" --arg s2 "$stale_instr_expanded" \
    '((.instructions // []) | if type == "array" then . else [.] end) | any(. == $s1 or . == $s2)' \
    &>/dev/null; then
    echo "    ⚠  instructions: stale duplicate found at $stale_instr"
    echo "       This wastes ~7K tokens per prompt. Run with --fix to remove."
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

  # If no config file, create a minimal one (always .json for new files)
  if [ ! -f "$GLOBAL_JSON" ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "    dry-run: would create $GLOBAL_CONFIG/opencode.json with ADV entries"
      return 0
    fi
    GLOBAL_JSON="$GLOBAL_CONFIG/opencode.json"
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

  # Validate JSON(C) before patching
  if ! jsonc_to_json "$GLOBAL_JSON" | jq empty 2>/dev/null; then
    echo "    ✗  $GLOBAL_JSON is not valid JSON/JSONC — fix syntax first"
    return 1
  fi

  # Warn about JSONC comment stripping
  if [ "$GLOBAL_JSON_IS_JSONC" = true ]; then
    echo "    ⚠  Config is JSONC — patching will strip comments from the file"
    echo "       A backup will be created before any changes"
  fi

  # Back up before patching
  local backup="$GLOBAL_JSON.bak.$(date +%Y%m%d%H%M%S)"
  if [ "$DRY_RUN" = true ]; then
    echo "    dry-run: would back up $GLOBAL_JSON to $backup"
  else
    cp "$GLOBAL_JSON" "$backup"
    echo "    Backup: $backup"
  fi

  local patched=0
  local tmp_json
  tmp_json="$(mktemp)"

  # Convert to plain JSON for jq manipulation
  jsonc_to_json "$GLOBAL_JSON" > "$tmp_json"

  # Patch plugin array if needed
  if ! json_array_contains "$tmp_json" ".plugin // []" "$ADV_PLUGIN_PATH"; then
    jq --arg plugin "$ADV_PLUGIN_PATH" \
      '.plugin = (((.plugin // []) | if type == "array" then . else [.] end) + [$plugin] | unique)' \
      "$tmp_json" > "$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
    echo "    ✓  Added plugin: $ADV_PLUGIN_PATH"
    ((patched++)) || true
  fi

  # Patch instructions array if needed
  if ! json_array_contains "$tmp_json" ".instructions // []" "$ADV_INSTRUCTION_PATH"; then
    jq --arg instr "$ADV_INSTRUCTION_PATH" \
      '.instructions = (((.instructions // []) | if type == "array" then . else [.] end) + [$instr] | unique)' \
      "$tmp_json" > "$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
    echo "    ✓  Added instruction: $ADV_INSTRUCTION_PATH"
    ((patched++)) || true
  fi

  # Remove stale global ADV_INSTRUCTIONS.md from instructions array if present
  # (the canonical path is $ADV_INSTRUCTION_PATH, not the global instructions dir copy)
  local stale_instr="$HOME/.config/opencode/instructions/ADV_INSTRUCTIONS.md"
  local stale_tilde="~/.config/opencode/instructions/ADV_INSTRUCTIONS.md"
  if jq --arg stale "$stale_instr" --arg stale_t "$stale_tilde" \
    -e '((.instructions // []) | if type == "array" then . else [.] end) | any(. == $stale or . == $stale_t)' \
    "$tmp_json" &>/dev/null; then
    jq --arg stale "$stale_instr" --arg stale_t "$stale_tilde" \
      '.instructions = (((.instructions // []) | if type == "array" then . else [.] end) | map(select(. != $stale and . != $stale_t)))' \
      "$tmp_json" > "$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
    echo "    ✓  Removed stale instruction: $stale_tilde"
    ((patched++)) || true
  fi

  if [ "$patched" -gt 0 ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "    dry-run: would patch $patched entry/entries in $GLOBAL_JSON"
      print_diff "$GLOBAL_JSON" "$tmp_json"
      rm -f "$tmp_json"
    else
      # Atomic write — note: if source was JSONC, output is now plain JSON
      mv "$tmp_json" "$GLOBAL_JSON"
      echo "    Patched $patched entry/entries in $GLOBAL_JSON"
      if [ "$GLOBAL_JSON_IS_JSONC" = true ]; then
        echo "    ⚠  Comments were stripped during patching. Restore from backup if needed."
      fi
    fi
  else
    rm -f "$tmp_json"
    echo "    No patches needed — config already correct"
    # Clean up unnecessary backup
    [ "$DRY_RUN" = true ] || rm -f "$backup"
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
  if [ "$DRY_RUN" = true ]; then
    echo "    dry-run copy: $(basename "$src")"
  else
    cp "$src" "$dest"
    echo "    copied: $(basename "$src")"
  fi
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
    if [ "$DRY_RUN" = true ]; then
      echo "    dry-run remove stale: $name"
    else
      rm "$global_cmd"
      echo "    removed stale: $name"
    fi
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
      if [ "$DRY_RUN" = true ]; then
        echo "    dry-run remove legacy: $target"
      else
        rm "$target"
        echo "    removed legacy: $target"
      fi
    fi
  done
done

# ---------------------------------------------------------------------------
# 4b. Remove stale global ADV_INSTRUCTIONS.md copy if it exists.
#     The canonical copy lives at $REPO_ROOT/ADV_INSTRUCTIONS.md and is
#     registered in opencode.json by sync-global --fix. A duplicate in
#     ~/.config/opencode/instructions/ wastes ~7K tokens per prompt.
# ---------------------------------------------------------------------------
STALE_GLOBAL_INSTR="$HOME/.config/opencode/instructions/ADV_INSTRUCTIONS.md"
if [ -f "$STALE_GLOBAL_INSTR" ]; then
  if [ "$DRY_RUN" = true ]; then
    echo "    dry-run remove stale: $STALE_GLOBAL_INSTR (canonical is $ADV_INSTRUCTION_PATH)"
  else
    rm "$STALE_GLOBAL_INSTR"
    echo "    removed stale: $STALE_GLOBAL_INSTR (canonical is $ADV_INSTRUCTION_PATH)"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Sync ADV agents from .opencode/agents/ to global
#
# Agents listed in REPO_LOCAL_ONLY are repo-scoped — they should NOT be
# copied to global.  They are loaded by OpenCode only when working inside
# repos that contain them in .opencode/agents/.
# ---------------------------------------------------------------------------
mkdir -p "$GLOBAL_AGENTS"
agents_copied=0
# Agents that must stay repo-local (not synced to global)
REPO_LOCAL_ONLY="adv-researcher.md tron.md"
if [ -d "$REPO_AGENTS" ]; then
  for src in "$REPO_AGENTS"/*.md; do
    [ -f "$src" ] || continue
    name="$(basename "$src")"
    # Skip repo-local-only agents
    if echo " $REPO_LOCAL_ONLY " | grep -q " $name "; then
      echo "    skipped (repo-local): $name"
      continue
    fi
    dest="$GLOBAL_AGENTS/$name"
    if [ "$DRY_RUN" = true ]; then
      echo "    dry-run copy agent: $name"
    else
      cp "$src" "$dest"
      echo "    copied agent: $name"
    fi
    ((agents_copied++)) || true
  done
fi
echo "    $agents_copied agent(s) synced"

# Apply repo-owned overlays to shared global agents without replacing the file
if [ -d "$REPO_OVERLAYS" ]; then
  echo "    syncing shared-agent overlays"
  apply_overlay_block "orca" "$GLOBAL_AGENTS/orca.md"
  apply_overlay_block "general" "$GLOBAL_AGENTS/general.md"
  apply_overlay_block "plan" "$GLOBAL_AGENTS/plan.md"
  apply_overlay_block "scout" "$GLOBAL_AGENTS/scout.md"
  apply_overlay_block "refine" "$GLOBAL_AGENTS/refine.md"
fi

# Remove stale ADV agents from global that no longer exist in repo
# Also remove repo-local-only agents if they leaked into global
agents_removed=0
for global_agent in "$GLOBAL_AGENTS"/adv-*.md "$GLOBAL_AGENTS"/tron.md; do
  [ -f "$global_agent" ] || continue
  name="$(basename "$global_agent")"
  # Remove if no longer in repo OR if it's repo-local-only
  if [ ! -f "$REPO_AGENTS/$name" ] || echo " $REPO_LOCAL_ONLY " | grep -q " $name "; then
    if [ "$DRY_RUN" = true ]; then
      echo "    dry-run remove stale agent: $name"
    else
      rm "$global_agent"
      echo "    removed stale agent: $name"
    fi
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
    if [ "$DRY_RUN" = true ]; then
      echo "    dry-run copy skill: $skill_name/SKILL.md"
    else
      mkdir -p "$dest_dir"
      cp "$skill_file" "$dest_dir/SKILL.md"
      echo "    copied skill: $skill_name/SKILL.md"
    fi
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
    if [ "$DRY_RUN" = true ]; then
      echo "    dry-run remove stale skill: $skill_name"
    else
      rm -rf "$global_skill"
      echo "    removed stale skill: $skill_name"
    fi
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
