#!/usr/bin/env bash
# Release-body construction for auto-release.yml.
#
# Sourced by both the GitHub Actions workflow and the test harness. Exposes
# render_body() which takes synthetic input (commits string + release-notes
# JSON array) and echoes the assembled markdown body. Pure function: no git,
# no network, no side effects.
#
# The workflow thin-wraps this: gather commits via `git log` and release-notes
# envelopes via `git diff` + `git show`, assemble them into a JSON array, then
# call render_body.
#
# Why a script (not inline YAML bash)?
#   1. Makes the body-construction logic unit-testable (see test-release-body.sh).
#   2. Keeps the workflow YAML readable (thin wrapper around a named function).
#   3. Lets consumers diff/test the logic without spinning up GH Actions.
#
# Filter scope: ^chore\(adv\): commits are excluded from the Changed section
# entirely. Per ADV convention (ADV_INSTRUCTIONS.md, .adv/specs/advance-delivery),
# the `chore(adv):` scope is reserved for internal bookkeeping (checkpoints,
# backlog records, finding-routing). User-facing impact lives in archived
# release-notes.json sidecars, which are read in Pass 1 below.

# Append entry to accumulator with newline separator. Empty accumulator → just entry.
append_entry() {
  local acc="$1" entry="$2"
  if [ -z "$acc" ]; then
    printf '%s' "$entry"
  else
    printf '%s\n%s' "$acc" "$entry"
  fi
}

# Append a section to body if any of its entries are non-empty.
# Args: body, title, entry1, entry2, ... — entries concatenated in order.
append_section() {
  local body="$1" title="$2"
  shift 2
  local entries="" e
  for e in "$@"; do
    if [ -n "$e" ]; then
      if [ -z "$entries" ]; then
        entries="$e"
      else
        entries=$(printf '%s\n%s' "$entries" "$e")
      fi
    fi
  done
  if [ -n "$entries" ]; then
    if [ -z "$body" ]; then
      printf '### %s\n%s' "$title" "$entries"
    else
      printf '%s\n\n### %s\n%s' "$body" "$title" "$entries"
    fi
  else
    printf '%s' "$body"
  fi
}

# render_body commits rn_json_array → echoes assembled markdown body.
#
# commits        : newline-separated conventional-commit subjects.
# rn_json_array  : JSON array of release-notes archive envelopes, each shaped:
#                  { "schema_version": "1.0", "title": "...", "release_notes": {
#                      "category": "added|fixed|changed|deprecated|removed|security",
#                      "headline_internal": "...", "headline_external": "...",
#                      "highlights": ["...", "..."] } }
#                  Envelopes missing schema_version="1.0" or both headline fields
#                  are silently skipped (defensive).
render_body() {
  local commits="$1"
  local rn_json="$2"

  local RN_ADDED="" RN_FIXED="" RN_CHANGED=""
  local RN_DEPRECATED="" RN_REMOVED="" RN_SECURITY=""
  local FEAT_ENTRIES="" FIX_ENTRIES="" OTHER_ENTRIES=""

  # -------------------------------------------------------------------
  # Pass 1: typed release-notes sidecars (curated content).
  # -------------------------------------------------------------------
  local n
  n=$(printf '%s' "$rn_json" | jq 'length' 2>/dev/null || echo 0)
  local i=0
  while [ "$i" -lt "$n" ]; do
    local envelope sv title category headline highlights entry
    envelope=$(printf '%s' "$rn_json" | jq -c ".[$i]" 2>/dev/null || echo "")

    # Forward-safety: skip envelopes that don't declare schema_version 1.0.
    sv=$(printf '%s' "$envelope" | jq -r '.schema_version // empty' 2>/dev/null || true)
    if [ "$sv" != "1.0" ]; then
      i=$((i + 1))
      continue
    fi

    title=$(printf '%s' "$envelope" | jq -r '.title // empty' 2>/dev/null || true)
    category=$(printf '%s' "$envelope" | jq -r '.release_notes.category // empty' 2>/dev/null || true)
    headline=$(printf '%s' "$envelope" | jq -r '.release_notes.headline_internal // .release_notes.headline_external // empty' 2>/dev/null || true)

    # Skip envelopes with no usable headline.
    if [ -z "$headline" ]; then
      i=$((i + 1))
      continue
    fi

    entry="- **${title}**: ${headline}"
    highlights=$(printf '%s' "$envelope" | jq -r '.release_notes.highlights[]?' 2>/dev/null || true)
    if [ -n "$highlights" ]; then
      local hl
      while IFS= read -r hl; do
        [ -n "$hl" ] && entry="${entry}
  - ${hl}"
      done <<< "$highlights"
    fi

    case "$category" in
      added)      RN_ADDED=$(append_entry "$RN_ADDED" "$entry") ;;
      fixed)      RN_FIXED=$(append_entry "$RN_FIXED" "$entry") ;;
      changed)    RN_CHANGED=$(append_entry "$RN_CHANGED" "$entry") ;;
      deprecated) RN_DEPRECATED=$(append_entry "$RN_DEPRECATED" "$entry") ;;
      removed)    RN_REMOVED=$(append_entry "$RN_REMOVED" "$entry") ;;
      security)   RN_SECURITY=$(append_entry "$RN_SECURITY" "$entry") ;;
    esac

    i=$((i + 1))
  done

  # -------------------------------------------------------------------
  # Pass 2: commit subjects (with chore(adv) filter).
  # -------------------------------------------------------------------
  local line msg prefix scope
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # ADV internal bookkeeping (checkpoints, backlog records, finding-routing).
    # Not user-facing; user impact lives in archived release-notes.json.
    if echo "$line" | grep -qE '^chore\(adv\):'; then
      continue
    fi

    msg=$(echo "$line" | sed -E 's/^[a-z]+(\(.+\))?:\s*//')
    if echo "$line" | grep -qE '^feat(\(.+\))?:'; then
      FEAT_ENTRIES=$(append_entry "$FEAT_ENTRIES" "- ${msg}")
    elif echo "$line" | grep -qE '^fix(\(.+\))?:'; then
      FIX_ENTRIES=$(append_entry "$FIX_ENTRIES" "- ${msg}")
    elif echo "$line" | grep -qE '^(chore|ci|docs|refactor|test|perf|style|build)(\(.+\))?:'; then
      scope=$(echo "$line" | sed -E 's/^([a-z]+)(\((.+)\))?:.*/\3/' | head -1)
      prefix=$(echo "$line" | sed -E 's/^([a-z]+)(\(.+\))?:.*/\1/')
      if [ -n "$scope" ] && [ "$scope" != "$prefix" ]; then
        OTHER_ENTRIES=$(append_entry "$OTHER_ENTRIES" "- ${msg} (${prefix}: ${scope})")
      else
        OTHER_ENTRIES=$(append_entry "$OTHER_ENTRIES" "- ${msg} (${prefix})")
      fi
    fi
  done <<< "$commits"

  # -------------------------------------------------------------------
  # Pass 3: assemble sections (curated first, commit-subject follows).
  # Keep-a-Changelog order: Added, Changed, Deprecated, Removed, Fixed, Security.
  # -------------------------------------------------------------------
  local body=""
  body=$(append_section "$body" "Added"      "$RN_ADDED"      "$FEAT_ENTRIES")
  body=$(append_section "$body" "Changed"    "$RN_CHANGED"    "$OTHER_ENTRIES")
  body=$(append_section "$body" "Deprecated" "$RN_DEPRECATED")
  body=$(append_section "$body" "Removed"    "$RN_REMOVED")
  body=$(append_section "$body" "Fixed"      "$RN_FIXED"      "$FIX_ENTRIES")
  body=$(append_section "$body" "Security"   "$RN_SECURITY")

  # Empty-window fallback: at least one entry, honest about absence of user-facing change.
  if [ -z "$body" ]; then
    body="### Changed
- Internal maintenance; no user-facing changes."
  fi

  printf '%s\n' "$body"
}

# If invoked directly (not sourced), call render_body with positional args.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  render_body "$1" "$2"
fi
