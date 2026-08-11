#!/usr/bin/env bash
# Test harness for scripts/release-body.sh :: render_body().
#
# Sources release-body.sh, calls render_body with synthetic input, asserts on
# output. Run from anywhere; uses no git state, no network.
#
# Usage: ./scripts/test-release-body.sh
# Exit: 0 if all assertions pass, 1 on first failure.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=release-body.sh
source "$HERE/release-body.sh"

fail() {
  echo "FAIL: $*" >&2
  echo "--- expected ---"
  echo "$1"
  echo "--- actual ---"
  echo "$2"
  exit 1
}

assert_contains() {
  local haystack="$1" needle="$2" msg="$3"
  if ! echo "$haystack" | grep -qF -- "$needle"; then
    echo "FAIL: $msg" >&2
    echo "missing needle: $needle" >&2
    echo "--- haystack ---" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

assert_absent() {
  local haystack="$1" needle="$2" msg="$3"
  if echo "$haystack" | grep -qF -- "$needle"; then
    echo "FAIL: $msg" >&2
    echo "unexpected needle: $needle" >&2
    echo "--- haystack ---" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

assert_regex_absent() {
  local haystack="$1" regex="$2" msg="$3"
  if echo "$haystack" | grep -qE -- "$regex"; then
    echo "FAIL: $msg" >&2
    echo "unexpected regex match: $regex" >&2
    echo "--- haystack ---" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Case 1: populated window — feat + fix + chore(adv) (filtered) + chore(deps)
#         + two archived ADV changes with release-notes.json sidecars.
# ---------------------------------------------------------------------------

COMMITS_1="feat(api): add foo
fix(core): resolve bar
chore(adv): checkpoint tk-abc
chore(adv): record finding-routing backlog (#999)
chore(deps): bump qux"

# JSON array of release-notes envelopes.
RN_JSON_1='[
  {
    "schema_version": "1.0",
    "change_id": "changeA",
    "title": "Change A",
    "release_notes": {
      "audience": "internal",
      "category": "added",
      "headline_internal": "Foo feature now works end-to-end",
      "highlights": ["x", "y"]
    }
  },
  {
    "schema_version": "1.0",
    "change_id": "changeB",
    "title": "Change B",
    "release_notes": {
      "audience": "internal",
      "category": "fixed",
      "headline_internal": "Bar bug squashed"
    }
  }
]'

BODY_1=$(render_body "$COMMITS_1" "$RN_JSON_1")

# Curated entry leads each section.
assert_contains "$BODY_1" "**Change A**: Foo feature now works end-to-end" \
  "Added section must contain change-A curated entry"
assert_contains "$BODY_1" "**Change B**: Bar bug squashed" \
  "Fixed section must contain change-B curated entry"

# Highlights render as nested bullets.
assert_contains "$BODY_1" "  - x" \
  "change-A highlight 'x' must render as nested bullet"
assert_contains "$BODY_1" "  - y" \
  "change-A highlight 'y' must render as nested bullet"

# Commit-subject entries follow curated entries.
assert_contains "$BODY_1" "- add foo" \
  "feat commit subject must appear under Added"
assert_contains "$BODY_1" "- resolve bar" \
  "fix commit subject must appear under Fixed"
assert_contains "$BODY_1" "bump qux" \
  "chore(deps) commit subject must appear under Changed"

# chore(adv) commits filtered entirely.
assert_regex_absent "$BODY_1" '^chore\(adv\)' \
  "no chore(adv) commit subjects may appear"
assert_absent "$BODY_1" "checkpoint tk-abc" \
  "chore(adv) checkpoint subject must not leak"
assert_absent "$BODY_1" "finding-routing backlog" \
  "chore(adv) finding-routing subject must not leak"

# Section ordering matches Keep-a-Changelog convention
# (Added, Changed, Deprecated, Removed, Fixed, Security).
ADDED_IDX=$(echo "$BODY_1" | grep -n '^### Added$' | head -1 | cut -d: -f1)
FIXED_IDX=$(echo "$BODY_1" | grep -n '^### Fixed$' | head -1 | cut -d: -f1)
CHANGED_IDX=$(echo "$BODY_1" | grep -n '^### Changed$' | head -1 | cut -d: -f1)
if [ -z "$ADDED_IDX" ] || [ -z "$FIXED_IDX" ] || [ -z "$CHANGED_IDX" ]; then
  echo "FAIL: missing required section header" >&2
  echo "$BODY_1" >&2
  exit 1
fi
[ "$ADDED_IDX" -lt "$CHANGED_IDX" ] || fail "Added must precede Changed" "$BODY_1"
[ "$CHANGED_IDX" -lt "$FIXED_IDX" ] || fail "Changed must precede Fixed" "$BODY_1"

# ---------------------------------------------------------------------------
# Case 2: empty window — only chore(adv) commits, no archived changes.
#         Fallback line must appear.
# ---------------------------------------------------------------------------

COMMITS_2="chore(adv): checkpoint tk-xyz
chore(adv): backlog bl-123"

RN_JSON_2='[]'

BODY_2=$(render_body "$COMMITS_2" "$RN_JSON_2")

assert_contains "$BODY_2" "Internal maintenance; no user-facing changes." \
  "empty window must produce fallback line"
assert_regex_absent "$BODY_2" '^chore\(adv\)' \
  "no chore(adv) commit subjects may appear even in empty window"

# ---------------------------------------------------------------------------
# Case 3: envelope schema_version guard — non-1.0 envelope must be skipped.
# ---------------------------------------------------------------------------

COMMITS_3="feat: real feature"

RN_JSON_3='[
  {
    "schema_version": "2.0",
    "change_id": "futureChange",
    "title": "Future Change",
    "release_notes": {
      "audience": "internal",
      "category": "added",
      "headline_internal": "Should not appear"
    }
  }
]'

BODY_3=$(render_body "$COMMITS_3" "$RN_JSON_3")

assert_absent "$BODY_3" "Future Change" \
  "non-1.0 schema_version envelope must be skipped"
assert_absent "$BODY_3" "Should not appear" \
  "non-1.0 envelope headline must not leak"
assert_contains "$BODY_3" "- real feature" \
  "feat commit subject must still render when envelopes are filtered"

# ---------------------------------------------------------------------------
# Case 4: envelope missing headline_internal + headline_external must be skipped.
# ---------------------------------------------------------------------------

COMMITS_4="feat: standalone"

RN_JSON_4='[
  {
    "schema_version": "1.0",
    "change_id": "noHeadline",
    "title": "No Headline",
    "release_notes": {
      "audience": "internal",
      "category": "added"
    }
  }
]'

BODY_4=$(render_body "$COMMITS_4" "$RN_JSON_4")

assert_absent "$BODY_4" "No Headline" \
  "envelope without headline fields must be skipped"

echo "PASS: all release-body assertions ($BODY_1 $BODY_2 $BODY_3 $BODY_4 had expected content)"
