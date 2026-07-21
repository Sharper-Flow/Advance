#!/usr/bin/env bash
# scripts/check-release-gate.sh
#
# Static-check gate: refuse release of a dependent change until its prerequisite
# sibling change has shipped (no longer in the ADV active-changes list).
#
# Usage:
#   scripts/check-release-gate.sh <prerequisite-change-id> <dependent-change-id>
#
# Examples:
#   scripts/check-release-gate.sh slimMutationToolSurface addAdvMcpReadSurface
#
# Exit codes:
#   0 — prerequisite is no longer active; safe to release dependent
#   1 — prerequisite is still active; refuse dependent release
#   2 — unable to determine prerequisite status (tooling missing / parse failure)
#
# Environment:
#   ADV_BIN — override adv CLI path (default: `adv` on PATH, or ~/dev/advance/bin/adv)
#
# Used by:
#   - Release-evidence collection for changes with constraint C1 (release-after
#     sibling). Example: addAdvMcpReadSurface AC11 / C1 depends on
#     slimMutationToolSurface shipping first.

set -euo pipefail

PREREQ="${1:-}"
DEPENDENT="${2:-}"

if [ -z "$PREREQ" ] || [ -z "$DEPENDENT" ]; then
  echo "Usage: $0 <prerequisite-change-id> <dependent-change-id>" >&2
  echo "Example: $0 slimMutationToolSurface addAdvMcpReadSurface" >&2
  exit 2
fi

# Resolve adv CLI
ADV_BIN="${ADV_BIN:-}"
if [ -z "$ADV_BIN" ]; then
  if command -v adv >/dev/null 2>&1; then
    ADV_BIN="adv"
  elif [ -x "$HOME/dev/advance/bin/adv" ]; then
    ADV_BIN="$HOME/dev/advance/bin/adv"
  fi
fi

if [ -z "$ADV_BIN" ]; then
  echo "RELEASE GATE ERROR: adv CLI not found on PATH or at ~/dev/advance/bin/adv" >&2
  echo "  Set ADV_BIN to override." >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "RELEASE GATE ERROR: jq not found on PATH (required for JSON parsing)" >&2
  exit 2
fi

# Active changes include draft + in-flight. If prerequisite appears here, gate fails.
# Fail-closed: if `adv status` itself fails (Temporal down, ADV_BIN broken, parse error),
# the shell substitution returns non-zero and `set -e` aborts before we reach the
# IS_ACTIVE check. Never fall back to empty-changes (that would incorrectly pass the gate).
ADV_STATUS_OUTPUT="$("$ADV_BIN" status --json 2>&1 1>/dev/null)" || true
STATUS_JSON="$("$ADV_BIN" status --json 2>/dev/null)" || STATUS_JSON=""
if [ -z "$STATUS_JSON" ]; then
  echo "RELEASE GATE UNKNOWN: adv status --json failed or produced no output" >&2
  echo "  ADV_BIN: $ADV_BIN" >&2
  echo "  stderr: $ADV_STATUS_OUTPUT" >&2
  echo "  Cannot determine status of prerequisite $PREREQ." >&2
  echo "  Dependent: $DEPENDENT -- refuse release until prerequisite status is verifiable." >&2
  exit 2
fi

# Sanity: parsed JSON must have a `changes` array; otherwise the schema changed and we
# cannot safely interpret absence as "not active". Fail-closed on schema drift.
if ! printf '%s' "$STATUS_JSON" | jq -e '.changes | type == "array"' >/dev/null 2>&1; then
  echo "RELEASE GATE UNKNOWN: adv status --json output schema drift (no .changes array)" >&2
  echo "  Cannot safely determine status of $PREREQ." >&2
  echo "  Dependent: $DEPENDENT -- refuse release until ADV status schema is reconciled." >&2
  exit 2
fi

IS_ACTIVE="$(printf '%s' "$STATUS_JSON" | jq -r --arg id "$PREREQ" \
  '.changes | map(.id) | index($id) | if . then "yes" else "no" end')"

case "$IS_ACTIVE" in
  yes)
    echo "RELEASE GATE FAILED: $PREREQ is still active (not shipped)" >&2
    echo "  Required by: $DEPENDENT (constraint C1 — release-after-sibling)" >&2
    echo "  Resolution: complete + archive $PREREQ before releasing $DEPENDENT." >&2
    exit 1
    ;;
  no)
    echo "RELEASE GATE OK: $PREREQ is no longer in the active changes list"
    echo "  Dependent ($DEPENDENT) is clear to release."
    exit 0
    ;;
  *)
    echo "RELEASE GATE UNKNOWN: could not parse adv status output for $PREREQ" >&2
    echo "  Raw adv status output (first 200 chars): $(printf '%s' "$STATUS_JSON" | head -c 200)" >&2
    exit 2
    ;;
esac
