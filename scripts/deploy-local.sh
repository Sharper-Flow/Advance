#!/usr/bin/env bash
# deploy-local.sh
#
# Deploys this repo's ADV assets to the local machine:
#   - Runtime plugin -> ~/.local/share/Advance/plugin
#   - Slash commands, agents, skills -> ~/.config/opencode/
#   - Stale ADV instruction registrations are removed from opencode.json
#   - Archived ACP companion binaries are intentionally not deployed
#
# Single source of truth for "what's installed on this machine from this repo".
# Run via pre-push hook so deployed copy never drifts from dev repo HEAD.
# Replaced the legacy config-sync script (2026-05-19). It now deploys supported
# Advance plugin/config assets only; archived experiments such as acp-mux are not
# installed.
#
# Usage:
#   ./scripts/deploy-local.sh           # Deploy assets + check config (report only)
#   ./scripts/deploy-local.sh --check   # Check config only, no file changes
#   ./scripts/deploy-local.sh --fix     # Deploy assets + auto-patch opencode.json
#   ./scripts/deploy-local.sh --dry-run # Preview changes without writing
#   ./scripts/deploy-local.sh --diff    # Show overlay diffs when managed blocks change
#
# What it does:
#   0. Ensures plugin/dist is fresh, then syncs plugin/ -> ~/.local/share/Advance/plugin
#   1. Copies .opencode/command/*.md  -> ~/.config/opencode/command/
#   2. Removes stale commands from global that no longer exist in repo
#   3. Removes legacy non-ADV commands
#   4. Copies repo-owned agents and applies managed overlays for shared agents
#   5. Copies skills/adv-*/SKILL.md  -> ~/.config/opencode/skills/adv-*/
#   6. Validates opencode.json has ADV plugin entries and no stale ADV instruction entry
#   7. (--fix only) Patches opencode.json to add missing ADV plugin entries and remove stale ADV instruction entries
#   8. Skips archived acp-mux local binary deployment
#
# Deploy semantics: only supported Advance assets are mirrored locally. Re-run
# deploy-local.sh whenever you change a deployed asset.
#
# It does NOT touch non-ADV commands, agents, skills, or config entries,
# except removing legacy assets/config previously installed by this repo
# (`openprompt.md`, stale `scout`/`refine` agent files, and stale
# `agent.scout`/`agent.refine` config keys).

set -euo pipefail

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
MODE="sync" # default: sync assets + check config
DRY_RUN=false
SHOW_DIFF=false
for arg in "$@"; do
	case "$arg" in
	--check) MODE="check" ;;
	--fix) MODE="fix" ;;
	--dry-run) DRY_RUN=true ;;
	--diff) SHOW_DIFF=true ;;
	--help | -h)
		echo "Usage: $0 [--check | --fix] [--dry-run] [--diff]"
		echo ""
		echo "  (no flags)  Deploy assets + check config (report issues)"
		echo "  --check     Check config only, no file changes at all"
		echo "  --fix       Deploy assets + binaries + auto-patch opencode.json if needed"
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INVOKE_CWD="$(pwd)"

resolve_canonical_repo_root() {
	local candidate="$1"

	# If we're not in a git repo, fall back to the script's repo root.
	if ! git -C "$candidate" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		printf '%s\n' "$candidate"
		return 0
	fi

	# When invoked from a git worktree copy of this repo, prefer the primary
	# worktree path so opencode.json stores stable canonical plugin/instruction
	# paths instead of ephemeral worktree-specific ones.
	local first_worktree
	first_worktree="$(git -C "$candidate" worktree list --porcelain 2>/dev/null | awk '
    /^worktree / && !found {
      print substr($0, 10)
      found = 1
    }
  ')"
	if [ -n "$first_worktree" ]; then
		printf '%s\n' "$first_worktree"
		return 0
	fi

	printf '%s\n' "$candidate"
}

git_common_dir() {
	local repo="$1" common_dir
	common_dir="$(git -C "$repo" rev-parse --git-common-dir 2>/dev/null)" || return 1
	case "$common_dir" in
	/*) ;;
	*) common_dir="$repo/$common_dir" ;;
	esac
	(cd "$common_dir" && pwd -P)
}

same_git_common_dir() {
	local left="$1" right="$2" left_common right_common
	left_common="$(git_common_dir "$left")" || return 1
	right_common="$(git_common_dir "$right")" || return 1
	[ "$left_common" = "$right_common" ]
}

REPO_ROOT="$(resolve_canonical_repo_root "$SCRIPT_REPO_ROOT")"
# Asset sources must come from the script's actual checkout/worktree, not the
# canonical primary worktree. Otherwise worktree-local edits (or restored files)
# are invisible during sync/test runs.
ASSET_ROOT="$SCRIPT_REPO_ROOT"
if [ -f "$INVOKE_CWD/.opencode/agents/adv.md" ]; then
	if same_git_common_dir "$SCRIPT_REPO_ROOT" "$INVOKE_CWD"; then
		ASSET_ROOT="$INVOKE_CWD"
	else
		echo "    ⚠  Ignoring asset root from unrelated cwd: $INVOKE_CWD"
	fi
fi
REPO_COMMANDS="$ASSET_ROOT/.opencode/command"
REPO_AGENTS="$ASSET_ROOT/.opencode/agents"
REPO_OVERLAYS="$ASSET_ROOT/.opencode/overlays"
REPO_SKILLS="$ASSET_ROOT/skills"
GLOBAL_COMMANDS="$HOME/.config/opencode/command"
GLOBAL_AGENTS="$HOME/.config/opencode/agents"
GLOBAL_SKILLS="$HOME/.config/opencode/skills"
GLOBAL_CONFIG="$HOME/.config/opencode"
GLOBAL_AGENT_PARTS="$GLOBAL_CONFIG/agent-parts"
PROVIDER_PROMPT_PARTS_DIR="$GLOBAL_AGENT_PARTS/advance"

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

# ADV entries that must exist in opencode.json(c). OpenCode must load the
# stable deployed plugin copy, not the mutable dev checkout. The pre-push hook
# runs this script so the deployed copy is refreshed before publication.
LOCAL_DEPLOY_ROOT="${ADV_LOCAL_DEPLOY_ROOT:-$HOME/.local/share/Advance}"
ADV_SOURCE_PLUGIN_PATH="$ASSET_ROOT/plugin"
ADV_RUNTIME_PLUGIN_PATH="$LOCAL_DEPLOY_ROOT/plugin"
ADV_PLUGIN_PATH="$ADV_RUNTIME_PLUGIN_PATH"
ADV_PLUGIN_DIST="$ADV_SOURCE_PLUGIN_PATH/dist/index.js"
ADV_INSTRUCTION_PATH="$REPO_ROOT/ADV_INSTRUCTIONS.md"

echo "==> ADV deploy-local ($MODE): $REPO_ROOT -> $GLOBAL_CONFIG"
echo "    runtime plugin: $ADV_SOURCE_PLUGIN_PATH -> $ADV_RUNTIME_PLUGIN_PATH"
if [ "$DRY_RUN" = true ]; then
	echo "    preview mode: --dry-run enabled"
fi
if [ "$SHOW_DIFF" = true ]; then
	echo "    preview mode: --diff enabled"
fi

# ---------------------------------------------------------------------------
# Config check/fix functions
# ---------------------------------------------------------------------------
config_issues=0

plugin_build_input_newer_than() {
	local output="$1"

	if [ -n "$(find "$ADV_SOURCE_PLUGIN_PATH/src" -type f -newer "$output" -print -quit)" ]; then
		return 0
	fi

	local input
	for input in package.json pnpm-lock.yaml tsconfig.json tsup.config.ts; do
		if [ -f "$ADV_SOURCE_PLUGIN_PATH/$input" ] && [ "$ADV_SOURCE_PLUGIN_PATH/$input" -nt "$output" ]; then
			return 0
		fi
	done

	if [ -d "$ADV_SOURCE_PLUGIN_PATH/scripts" ] && [ -n "$(find "$ADV_SOURCE_PLUGIN_PATH/scripts" -type f -newer "$output" -print -quit)" ]; then
		return 0
	fi

	return 1
}

plugin_dist_stale_reason() {
	if [ ! -d "$ADV_SOURCE_PLUGIN_PATH/src" ]; then
		printf '%s\n' "plugin source directory is missing"
		return 0
	fi

	local output_rel output
	for output_rel in dist/index.js dist/temporal/worker.js dist/temporal/workflows.js; do
		output="$ADV_SOURCE_PLUGIN_PATH/$output_rel"
		if [ ! -f "$output" ]; then
			printf '%s\n' "plugin dist output is missing: $output_rel"
			return 0
		fi
		if plugin_build_input_newer_than "$output"; then
			printf '%s\n' "plugin build input is newer than $output_rel"
			return 0
		fi
	done

	return 1
}

ensure_plugin_dist_fresh() {
	local rebuild_reason=""

	if ! rebuild_reason="$(plugin_dist_stale_reason)"; then
		echo "    plugin dist is fresh"
		return 0
	fi

	if [ "$DRY_RUN" = true ]; then
		echo "    would rebuild plugin dist: $rebuild_reason"
		echo "    dry-run build: (cd \"$ADV_SOURCE_PLUGIN_PATH\" && pnpm run build)"
		return 0
	fi

	echo "    rebuilding plugin dist: $rebuild_reason"
	if ! (cd "$ADV_SOURCE_PLUGIN_PATH" && pnpm run build); then
		echo "    ✗ refusing to deploy stale dist: pnpm run build failed"
		echo "      Run manually: (cd \"$ADV_SOURCE_PLUGIN_PATH\" && pnpm install && pnpm run build)"
		exit 1
	fi

	if rebuild_reason="$(plugin_dist_stale_reason)"; then
		echo "    ✗ refusing to deploy stale dist after build: $rebuild_reason"
		echo "      Run manually: (cd \"$ADV_SOURCE_PLUGIN_PATH\" && pnpm install && pnpm run build)"
		exit 1
	fi
}

check_jq() {
	if ! command -v jq &>/dev/null; then
		echo "    ⚠  jq not found — config validation requires jq"
		echo "    Install: sudo apt-get install -y jq  (or brew install jq)"
		return 1
	fi
	return 0
}

check_rsync() {
	if ! command -v rsync &>/dev/null; then
		echo "    ✗  rsync not found — runtime plugin deployment requires rsync"
		echo "    Install: sudo apt-get install -y rsync  (or brew install rsync)"
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

apply_overlay_block() {
	local overlay_name="$1"
	local target_file="$2"
	local bootstrap_source="${3:-}"
	local overlay_file="$REPO_OVERLAYS/$overlay_name.overlay.md"
	local start_marker="<!-- ADV_SYNC:START $overlay_name -->"
	local end_marker="<!-- ADV_SYNC:END $overlay_name -->"
	local source_file="$target_file"

	if [ ! -f "$target_file" ]; then
		if [ -n "$bootstrap_source" ] && [ -f "$bootstrap_source" ]; then
			if [ "$DRY_RUN" = true ]; then
				echo "    dry-run bootstrap shared agent: $(basename "$target_file")"
				source_file="$bootstrap_source"
			else
				cp "$bootstrap_source" "$target_file"
				echo "    bootstrapped shared agent: $(basename "$target_file")"
			fi
		else
			echo "    skipped missing shared agent: $(basename "$target_file")"
			return 0
		fi
	fi

	if [ ! -f "$overlay_file" ]; then
		echo "    missing overlay source: $(basename "$overlay_file")"
		return 1
	fi

	local start_count end_count
	read -r start_count end_count <<<"$(
		python3 - "$source_file" "$start_marker" "$end_marker" <<'PY'
from pathlib import Path
import sys
text = Path(sys.argv[1]).read_text()
print(text.count(sys.argv[2]), text.count(sys.argv[3]))
PY
	)"
	if [ "$start_count" -gt 1 ] || [ "$end_count" -gt 1 ]; then
		echo "    duplicate overlay marker: $(basename "$target_file")"
		return 1
	fi
	if [ "$start_count" -ne "$end_count" ]; then
		echo "    orphaned overlay marker: $(basename "$target_file")"
		return 1
	fi

	local current_tmp new_tmp
	current_tmp="$(mktemp)"
	new_tmp="$(mktemp)"
	cp "$source_file" "$current_tmp"

	python3 - "$source_file" "$overlay_file" "$start_marker" "$end_marker" "$new_tmp" <<'PY'
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

# ---------------------------------------------------------------------------
# Provider ADV hint assets
#
# Provider-specific runtime agent generation was retired. ADV now syncs one
# complete global adv.md runtime agent and injects provider hints at runtime via
# plugin/src/utils/system-block.ts. Provider hint markdown remains repo data for
# docs/evaluation only; sync no longer generates adv-{provider}.md agents or
# provider prompt refs.
# ---------------------------------------------------------------------------
PROVIDER_HINT_DIR="$ASSET_ROOT/.opencode/agent-parts/providers"
PROVIDERS=(claude gpt glm kimi)

sync_adv_runtime_agent() {
	local runtime_agent="$REPO_AGENTS/adv.md"
	local dest="$GLOBAL_AGENTS/adv.md"
	if [ ! -f "$runtime_agent" ]; then
		echo "    ✗  ADV runtime agent: canonical adv.md missing at $runtime_agent"
		return 1
	fi

	if [ "$DRY_RUN" = true ]; then
		echo "    dry-run assemble ADV runtime agent: adv.md"
		return 0
	fi

	mkdir -p "$GLOBAL_AGENTS"
	python3 - "$runtime_agent" "$dest" <<'PY'
from pathlib import Path
import sys

runtime_agent, dest = map(Path, sys.argv[1:3])
runtime_text = runtime_agent.read_text().rstrip()
tmp = dest.with_name(dest.name + ".tmp")
tmp.write_text(runtime_text + "\n")
tmp.replace(dest)
PY
	echo "    assembled ADV runtime agent: adv.md"
}

remove_retired_provider_prompt_parts() {
	for provider in "${PROVIDERS[@]}"; do
		local retired="$PROVIDER_PROMPT_PARTS_DIR/adv-${provider}.md"
		if [ -f "$retired" ]; then
			if [ "$DRY_RUN" = true ]; then
				echo "    dry-run remove retired provider prompt: adv-${provider}.md"
			else
				rm -f "$retired"
				echo "    removed retired provider prompt: adv-${provider}.md"
			fi
		fi
	done
}

# Agent Frontmatter Structural Check
#
# OpenCode uses gray-matter/js-yaml for agent frontmatter. Duplicate YAML keys
# make gray-matter reject the frontmatter, after which the agent degrades to an
# `all`-mode shell with the raw frontmatter embedded in the prompt. Detect the
# simple mapping shape used by agent files before sync/deploy says everything is
# healthy.
# ---------------------------------------------------------------------------
check_agent_frontmatter() {
	local agent_file="$1"

	if [ ! -f "$agent_file" ]; then
		echo "    ✗  frontmatter: missing agent file $agent_file"
		((config_issues++)) || true
		return
	fi

	python3 - "$agent_file" <<'PY' || ((config_issues++)) || true
import re
import sys
from pathlib import Path

agent_path = Path(sys.argv[1])
text = agent_path.read_text()
agent_name = agent_path.name

if not text.startswith("---\n"):
    print(f"    ✗  frontmatter: {agent_name} missing YAML frontmatter")
    sys.exit(1)

end = text.find("\n---\n", 4)
if end == -1:
    print(f"    ✗  frontmatter: {agent_name} frontmatter not terminated")
    sys.exit(1)

seen: set[tuple[tuple[str, ...], str]] = set()
parents: list[tuple[int, str]] = []
duplicates: list[tuple[int, str, str]] = []

for line_no, line in enumerate(text[4:end].splitlines(), start=2):
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or stripped.startswith("-"):
        continue
    if ":" not in line:
        continue

    indent = len(line) - len(line.lstrip(" "))
    key_match = re.match(r"^\s*([A-Za-z0-9_*.-]+)\s*:", line)
    if not key_match:
        continue

    while parents and parents[-1][0] >= indent:
        parents.pop()

    key = key_match.group(1)
    parent_path = tuple(parent for _, parent in parents)
    marker = (parent_path, key)
    if marker in seen:
        scope = ".".join((*parent_path, key)) if parent_path else key
        duplicates.append((line_no, scope, line.strip()))
    else:
        seen.add(marker)

    remainder = line.split(":", 1)[1].strip()
    if remainder == "" or remainder in {"|", ">", "|-", ">-"}:
        parents.append((indent, key))

if duplicates:
    print(f"    ✗  frontmatter: {agent_name} has duplicate YAML key(s)")
    for line_no, scope, raw in duplicates:
        print(f"       line {line_no}: {scope} — {raw}")
    sys.exit(1)

print(f"    ✓  frontmatter: {agent_name} has unique mapping keys")
PY
}

# Agent Tool Allowlist Drift Check
#
# Cross-references an agent's `tools:` allowlist against the plugin's
# canonical ADV_TOOL_NAMES in plugin/src/tool-registry.ts. Reports tools
# registered but not allowed (= will be invisible to the agent) and tools
# allowed but not registered (= stale allowlist entries). Both are
# build-time-detectable drift causes. Primary agents are not required to expose
# leaf-subagent-only tools.
# ---------------------------------------------------------------------------
check_tool_drift() {
	local agent_file="${1:-$REPO_AGENTS/adv.md}"
	# Use ASSET_ROOT (current checkout/worktree) for registry so worktree-local
	# tool additions are visible to drift detection — matches the reasoning at
	# the ASSET_ROOT assignment (line ~95). Using REPO_ROOT here would point at
	# the canonical primary worktree and miss in-flight tool changes.
	local registry_file="$ASSET_ROOT/plugin/src/tool-registry.ts"

	if [ ! -f "$agent_file" ] || [ ! -f "$registry_file" ]; then
		echo "    ⚠  tool drift: skipped (missing $agent_file or $registry_file)"
		return
	fi

	python3 - "$agent_file" "$registry_file" <<'PY' || ((config_issues++)) || true
import re
import sys
from pathlib import Path

agent_path, registry_path = sys.argv[1], sys.argv[2]

# Extract agent mode and adv_* keys from YAML frontmatter `tools:` block
agent_text = Path(agent_path).read_text()
if not agent_text.startswith("---\n"):
    print("    ✗  tool drift: agent file missing YAML frontmatter")
    sys.exit(1)
end = agent_text.find("\n---\n", 4)
if end == -1:
    print("    ✗  tool drift: agent file frontmatter not terminated")
    sys.exit(1)
fm = agent_text[4:end]
agent_mode = ""
for line in fm.splitlines():
    m = re.match(r"^mode\s*:\s*([A-Za-z0-9_-]+)\s*$", line)
    if m:
        agent_mode = m.group(1)
        break

allowed = set()
in_tools = False
for line in fm.splitlines():
    stripped = line.lstrip()
    if stripped.startswith("tools:"):
        in_tools = True
        continue
    if in_tools:
        # end of tools block: next top-level key (no leading spaces)
        if line and not line.startswith(" ") and not line.startswith("\t"):
            break
        m = re.match(r"^\s+(adv_[a-z_]+)\s*:", line)
        if m:
            allowed.add(m.group(1))

# Extract ADV_TOOL_NAMES from registry
reg_text = Path(registry_path).read_text()
m = re.search(r"ADV_TOOL_NAMES[^=]*=\s*\[(.*?)\]\s*as const", reg_text, re.S)
if not m:
    print("    ✗  tool drift: could not locate ADV_TOOL_NAMES in registry")
    sys.exit(1)
registered = set(re.findall(r'"(adv_[a-z_]+)"', m.group(1)))

# Leaf subagents submit reports through this tool; primary orchestrators consume
# those reports via change state instead of submitting reports themselves.
LEAF_ONLY_TOOLS = {"adv_subagent_report_submit"}
primary_exemptions = LEAF_ONLY_TOOLS if agent_mode == "primary" else set()

missing = sorted(registered - primary_exemptions - allowed)   # registered but not allowed
extras = sorted(allowed - registered)    # allowed but not registered

issues = 0
agent_name = Path(agent_path).name
if missing:
    issues += 1
    print(f"    ✗  tool drift: {len(missing)} tool(s) registered but NOT in {agent_name} allowlist")
    print(f"       (the agent cannot call these — they will be invisible in sessions)")
    for t in missing:
        print(f"         - {t}")
if extras:
    issues += 1
    print(f"    ✗  tool drift: {len(extras)} tool(s) allowed but NOT registered in {agent_name}")
    print(f"       (allowlist references renamed/removed tools — will be silently dropped)")
    for t in extras:
        print(f"         - {t}")

if issues == 0:
    required_count = len(registered - primary_exemptions)
    print(f"    ✓  tool drift: {agent_name} allowlist matches plugin registry ({required_count} tools)")

sys.exit(1 if issues > 0 else 0)
PY
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

	# Validate plugin path exists
	if json_array_contains "$GLOBAL_JSON" ".plugin // []" "$ADV_PLUGIN_PATH"; then
		echo "    ✓  plugin: ADV plugin registered"
	else
		echo "    ✗  plugin: ADV plugin path missing from .plugin array"
		echo "       Expected: \"$ADV_PLUGIN_PATH\""
		((config_issues++)) || true
	fi

	# ADV_INSTRUCTIONS.md is scoped to the ADV runtime agent. It should
	# NOT be globally registered because global instructions load into every
	# session, including non-ADV agents.
	if json_array_contains "$GLOBAL_JSON" ".instructions // []" "$ADV_INSTRUCTION_PATH"; then
		echo "    ✗  instructions: ADV_INSTRUCTIONS.md should not be globally registered"
		echo "       Remove: \"$ADV_INSTRUCTION_PATH\" (run --fix)"
		((config_issues++)) || true
	else
		echo "    ✓  instructions: ADV_INSTRUCTIONS.md scoped to ADV runtime agent"
	fi

	# Warn about stale legacy consolidated-agent config keys
	for legacy_key in scout refine; do
		if jsonc_to_json "$GLOBAL_JSON" | jq -e --arg k "$legacy_key" '(.agent // {}) | if type == "object" then has($k) else false end' \
			&>/dev/null; then
			local replacement="plan"
			if [ "$legacy_key" = "refine" ]; then
				replacement="build"
			fi
			echo "    ⚠  agent: stale legacy '$legacy_key' config key present in .agent"
			echo "       '$legacy_key' was consolidated into '$replacement'. Run with --fix to remove it."
			((config_issues++)) || true
		fi
	done

	# Cross-check agent tool allowlist against plugin registry
	check_agent_frontmatter "$REPO_AGENTS/adv.md"
	check_tool_drift
	if [ -f "$REPO_AGENTS/adv-atc.md" ]; then
		check_agent_frontmatter "$REPO_AGENTS/adv-atc.md"
		check_tool_drift "$REPO_AGENTS/adv-atc.md"
	fi

	# Warn about stale global copy (wastes ~7K tokens per prompt)
	local stale_instr="~/.config/opencode/instructions/ADV_INSTRUCTIONS.md"
	local stale_instr_expanded="$HOME/.config/opencode/instructions/ADV_INSTRUCTIONS.md"
	if jsonc_to_json "$GLOBAL_JSON" | jq -e --arg s1 "$stale_instr" --arg s2 "$stale_instr_expanded" \
		'((.instructions // []) | if type == "array" then . else [.] end) | any(. == $s1 or . == $s2)' \
		&>/dev/null; then
		echo "    ⚠  instructions: stale duplicate found at $stale_instr"
		echo "       This wastes ~17K tokens per prompt. Run with --fix to remove."
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

	# Create config dir if needed.
	if [ ! -d "$GLOBAL_CONFIG" ]; then
		if [ "$DRY_RUN" = true ]; then
			echo "    dry-run: would create config directory $GLOBAL_CONFIG"
		else
			mkdir -p "$GLOBAL_CONFIG"
		fi
	fi

	# If no config file, create a minimal one (always .json for new files)
	if [ ! -f "$GLOBAL_JSON" ]; then
		if [ "$DRY_RUN" = true ]; then
			echo "    dry-run: would create $GLOBAL_CONFIG/opencode.json with ADV entries"
			return 0
		fi
		GLOBAL_JSON="$GLOBAL_CONFIG/opencode.json"
		echo '{}' | jq \
			--arg plugin "$ADV_PLUGIN_PATH" \
			'. + {
        "plugin": [$plugin]
      }' >"$GLOBAL_JSON"
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

	# Back up before patching
	local backup="$GLOBAL_JSON.bak.$(date +%Y%m%d%H%M%S)"
	if [ "$DRY_RUN" = true ]; then
		echo "    dry-run: would back up $GLOBAL_JSON to $backup"
	else
		cp "$GLOBAL_JSON" "$backup"
		echo "    Backup: $backup"
	fi

	# Refuse to patch JSONC files — jq cannot preserve comments, so --fix
	# would silently rewrite JSONC as plain JSON. Warn but continue so other
	# deploy stages (binaries, etc.) still run. Config drift surfaces in the
	# `check_config` summary at the end.
	if [ "$GLOBAL_JSON_IS_JSONC" = true ]; then
		if [ "$DRY_RUN" = true ]; then
			echo "    dry-run: would skip JSONC patch (comments would be stripped)"
		else
			echo "    ⚠  Config is JSONC — skipping auto-patch (comments would be stripped)"
			echo "       Backup preserved at: $backup"
			echo "       If config drift is reported, apply changes manually to $GLOBAL_JSON"
		fi
		# Run check_config so the user sees whether actual entries are missing
		# (the JSONC reader is comment-tolerant).
		check_config || true
		return 0
	fi

	local patched=0
	local tmp_json
	tmp_json="$(mktemp)"

	# Convert to plain JSON for jq manipulation
	jsonc_to_json "$GLOBAL_JSON" >"$tmp_json"

	# Patch plugin array if needed
	if ! json_array_contains "$tmp_json" ".plugin // []" "$ADV_PLUGIN_PATH"; then
		jq --arg plugin "$ADV_PLUGIN_PATH" \
			'.plugin = (((.plugin // []) | if type == "array" then . else [.] end) + [$plugin] | unique)' \
			"$tmp_json" >"$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
		echo "    ✓  Added plugin: $ADV_PLUGIN_PATH"
		((patched++)) || true
	fi

	# Remove canonical ADV_INSTRUCTIONS.md from global instructions if present.
	# Runtime ADV protocol is covered by the lean adv.md agent plus specs/tests,
	# not by registering this reference file globally.
	if json_array_contains "$tmp_json" ".instructions // []" "$ADV_INSTRUCTION_PATH"; then
		jq --arg instr "$ADV_INSTRUCTION_PATH" \
			'.instructions = (((.instructions // []) | if type == "array" then . else [.] end) | map(select(. != $instr)))' \
			"$tmp_json" >"$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
		echo "    ✓  Removed global instruction: ADV_INSTRUCTIONS.md"
		((patched++)) || true
	fi

	# Remove retired cost-governance instruction from instructions array if present
	local retired_instr="$HOME/.config/opencode/instructions/cost-governance.md"
	local retired_tilde="~/.config/opencode/instructions/cost-governance.md"
	local retired_repo="$REPO_ROOT/.opencode/instructions/cost-governance.md"
	if jq --arg r1 "$retired_instr" --arg r2 "$retired_tilde" --arg r3 "$retired_repo" \
		-e '((.instructions // []) | if type == "array" then . else [.] end) | any(. == $r1 or . == $r2 or . == $r3)' \
		"$tmp_json" &>/dev/null; then
		jq --arg r1 "$retired_instr" --arg r2 "$retired_tilde" --arg r3 "$retired_repo" \
			'.instructions = (((.instructions // []) | if type == "array" then . else [.] end) | map(select(. != $r1 and . != $r2 and . != $r3)))' \
			"$tmp_json" >"$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
		echo "    ✓  Removed retired instruction: cost-governance.md"
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
			"$tmp_json" >"$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
		echo "    ✓  Removed stale instruction: $stale_tilde"
		((patched++)) || true
	fi

	# Remove stale legacy consolidated-agent config keys if present.
	# These names were retired when scout -> plan and refine -> build.
	for legacy_key in scout refine; do
		if jq --arg k "$legacy_key" -e '(.agent // {}) | if type == "object" then has($k) else false end' \
			"$tmp_json" &>/dev/null; then
			jq --arg k "$legacy_key" '
        if ((.agent // {}) | type) == "object" then
          .agent = ((.agent // {}) | with_entries(select(.key != $k)))
        else
          .
        end
      ' "$tmp_json" >"$tmp_json.new" && mv "$tmp_json.new" "$tmp_json"
			echo "    ✓  Removed stale legacy agent config: agent.$legacy_key"
			((patched++)) || true
		fi
	done

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
# 0. Deploy runtime plugin to stable local-share path
# ---------------------------------------------------------------------------
echo ""
echo "==> Deploying ADV runtime plugin"
if [ ! -d "$ADV_SOURCE_PLUGIN_PATH" ]; then
	echo "    ✗  Source plugin missing: $ADV_SOURCE_PLUGIN_PATH"
	exit 1
fi
ensure_plugin_dist_fresh
if [ "$DRY_RUN" = true ]; then
	echo "    dry-run sync: $ADV_SOURCE_PLUGIN_PATH/ -> $ADV_RUNTIME_PLUGIN_PATH/"
else
	check_rsync || exit 1
	mkdir -p "$ADV_RUNTIME_PLUGIN_PATH"
	rsync -a --delete "$ADV_SOURCE_PLUGIN_PATH/" "$ADV_RUNTIME_PLUGIN_PATH/"
	echo "    synced runtime plugin: $ADV_RUNTIME_PLUGIN_PATH"
fi

# ---------------------------------------------------------------------------
# 1. Ensure global command dir exists
# ---------------------------------------------------------------------------
if [ "$DRY_RUN" = true ]; then
	echo "    dry-run: would ensure command directory $GLOBAL_COMMANDS"
else
	mkdir -p "$GLOBAL_COMMANDS"
fi

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
#     The canonical copy lives at $REPO_ROOT/ADV_INSTRUCTIONS.md as a repo/dev
#     reference. A duplicate in ~/.config/opencode/instructions/ wastes prompt
#     tokens for non-ADV agents.
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
# Remove stale adv-autopilot files replaced by adv-atc
# ---------------------------------------------------------------------------
for stale_autopilot in "$GLOBAL_AGENTS"/adv-autopilot*.md; do
	[ -f "$stale_autopilot" ] || continue
	if [ "$DRY_RUN" = true ]; then
		echo "    dry-run remove stale autopilot agent: $(basename "$stale_autopilot")"
	else
		rm -f "$stale_autopilot"
		echo "    removed stale autopilot agent: $(basename "$stale_autopilot")"
	fi
done
if [ -f "$GLOBAL_COMMANDS/adv-autopilot.md" ]; then
	if [ "$DRY_RUN" = true ]; then
		echo "    dry-run remove stale autopilot command: adv-autopilot.md"
	else
		rm -f "$GLOBAL_COMMANDS/adv-autopilot.md"
		echo "    removed stale autopilot command: adv-autopilot.md"
	fi
fi

# ---------------------------------------------------------------------------
# 5. Sync ADV agents from .opencode/agents/ to global
#
# Agents listed in REPO_LOCAL_ONLY are repo-scoped — they should NOT be
# copied to global. They are loaded by OpenCode only when working inside
# repos that contain them in .opencode/agents/.
#
# Agents listed in SHARED_OVERLAY_ONLY are shared global agents managed via
# repo-owned overlay blocks. They should NOT be fully copied from this repo,
# or user/global customization would be overwritten.
# ---------------------------------------------------------------------------
if [ "$DRY_RUN" = true ]; then
	echo "    dry-run: would ensure agent directory $GLOBAL_AGENTS"
else
	mkdir -p "$GLOBAL_AGENTS"
fi
agents_copied=0
# Agents that must stay repo-local (not synced to global)
REPO_LOCAL_ONLY="adv-tron.md"
# Shared agents managed via overlay blocks instead of full-file replacement.
#
# NOTE: `adv.md` is deliberately NOT in this list. The ADV orchestrator agent's
# `tools:` allowlist must stay in lockstep with the plugin's tool names; if it
# is overlay-only, user customization + plugin tool renames silently desync and
# ADV tools get filtered out of the agent's callable set. `adv.md` is therefore
# treated as repo-owned and fully replaced on each sync.
SHARED_OVERLAY_ONLY="build.md general.md plan.md"
# Legacy global agent filenames retained for upgrade cleanup. Current adv-*
# names are handled by the adv-*.md glob below; keep only pre-rename bare names
# here so the list stays single-source and low-churn.
LEGACY_STALE_AGENT_FILES=(
	orca.md
	tron.md
	scout.md
	refine.md
	engineer.md
)
if [ -d "$REPO_AGENTS" ]; then
	for src in "$REPO_AGENTS"/*.md; do
		[ -f "$src" ] || continue
		name="$(basename "$src")"
		# Skip repo-local-only agents
		if echo " $REPO_LOCAL_ONLY " | grep -q " $name "; then
			echo "    skipped (repo-local): $name"
			continue
		fi
		# Skip shared agents that are overlay-managed
		if echo " $SHARED_OVERLAY_ONLY " | grep -q " $name "; then
			echo "    skipped (overlay-managed): $name"
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

# If adv.md was not copied from the resolved asset directory, try to source it
# from the invoking checkout's git HEAD. This covers worktree/symlink cases
# where the script file resolves outside the active checkout but the current
# branch still tracks adv.md.
if [ ! -f "$GLOBAL_AGENTS/adv.md" ]; then
	if git -C "$INVOKE_CWD" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		if git -C "$INVOKE_CWD" show HEAD:.opencode/agents/adv.md >/tmp/adv_sync_advmd.$$ 2>/dev/null; then
			if [ "$DRY_RUN" = true ]; then
				echo "    dry-run bootstrap agent from git HEAD: adv.md"
				rm -f /tmp/adv_sync_advmd.$$
			else
				cp /tmp/adv_sync_advmd.$$ "$GLOBAL_AGENTS/adv.md"
				rm -f /tmp/adv_sync_advmd.$$
				echo "    bootstrapped agent from git HEAD: adv.md"
				((agents_copied++)) || true
			fi
		fi
	fi
fi
echo "    $agents_copied agent(s) synced"

# Assemble single ADV runtime agent and remove retired provider prompt files.
sync_adv_runtime_agent
remove_retired_provider_prompt_parts

# Apply repo-owned overlays to shared global agents without replacing the file.
# `adv` is intentionally NOT in this list — see SHARED_OVERLAY_ONLY note above.
if [ -d "$REPO_OVERLAYS" ]; then
	echo "    syncing shared-agent overlays"
	apply_overlay_block "general" "$GLOBAL_AGENTS/general.md"
	apply_overlay_block "build" "$GLOBAL_AGENTS/build.md" "$REPO_AGENTS/build.md"
	apply_overlay_block "plan" "$GLOBAL_AGENTS/plan.md" "$REPO_AGENTS/plan.md"
fi

# Remove stale ADV agents from global that no longer exist in repo
# Also remove repo-local-only agents if they leaked into global
agents_removed=0
remove_stale_agent_if_needed() {
	local global_agent="$1"
	[ -f "$global_agent" ] || return 0
	local name
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
}
for global_agent in "$GLOBAL_AGENTS"/adv-*.md; do
	remove_stale_agent_if_needed "$global_agent"
done
for legacy_name in "${LEGACY_STALE_AGENT_FILES[@]}"; do
	remove_stale_agent_if_needed "$GLOBAL_AGENTS/$legacy_name"
done
[ "$agents_removed" -gt 0 ] && echo "    $agents_removed stale agent(s) removed" || true

# ---------------------------------------------------------------------------
# Keep repo-local adv.md in-tree.
#
# Do not delete the repo-local file: asset tests, sync bootstrapping, and
# repo-local inspection expect it to exist.
# ---------------------------------------------------------------------------

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
		# ADR-002: whole-directory copy preserves SKILL.md + sibling reference docs
		# (CONTEXT-FORMAT.md, LOGIC.md, UI.md, REPORT_SCHEMA.md, etc.) + subdirectories
		# (e.g. scripts/). Required so progressive-disclosure skill content reaches
		# ~/.config/opencode/skills/ — agents loading skills globally need siblings.
		# Backward compatible: skills with only SKILL.md (existing behavior) sync identically.
		if [ "$DRY_RUN" = true ]; then
			while IFS= read -r f; do
				rel="${f#"$skill_dir"}"
				echo "    dry-run copy skill: $skill_name/$rel"
			done < <(find "$skill_dir" -type f | sort)
		else
			mkdir -p "$dest_dir"
			(cd "$skill_dir" && cp -R . "$dest_dir/")
			file_count="$(find "$skill_dir" -type f | wc -l | tr -d ' ')"
			if [ "$file_count" = "1" ]; then
				echo "    copied skill: $skill_name/SKILL.md"
			else
				echo "    copied skill: $skill_name/ ($file_count files)"
			fi
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
# Archived local binaries
# ===========================================================================
# acp-mux used to deploy into ~/.local/bin. It is parked until upstream OpenCode
# ACP fixes land, so deploy-local must not install or refresh it.
echo ""
echo "==> Skipping archived local binaries"
echo "    acp-mux: archived; not deployed"

# ===========================================================================
# Summary
# ===========================================================================
echo ""
echo "==> Done."
echo ""
echo "    Commands in global: $(ls "$GLOBAL_COMMANDS"/adv-*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "    Agents in global:  $(ls "$GLOBAL_AGENTS"/*.md 2>/dev/null | wc -l | tr -d ' ')"
echo "    Skills in global:  $(ls -d "$GLOBAL_SKILLS"/adv-*/ 2>/dev/null | wc -l | tr -d ' ')"
echo "    Local bins:        acp-mux archived/skipped"

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
