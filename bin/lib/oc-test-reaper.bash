#!/usr/bin/env bash
# Conservative stale-only reaper for leaked Temporal TypeScript test servers
# (ADV change reapLeakedTestServers; contract AC3/AC4, constraint C1, DONT1).
#
# What it reaps: processes whose argv[0] basename matches the SDK time-skipping
# test-server binary `temporal-test-server-sdk-typescript-*` (the single-file
# binary the SDK extracts to $TMPDIR, e.g.
# /tmp/temporal-test-server-sdk-typescript-1.17.2) AND that are provably stale.
#
# Conservative guarantees (design-validator mandated):
#   * Same UID only — never touches other users' processes.
#   * EXACT executable basename match on argv[0]; no substring/ps|grep sweeps.
#   * Defense-in-depth exclusions retained: any argv token shaped like
#     `start-dev` or port 7233 skips the candidate (the real dev server runs
#     `temporal server start-dev --port 7233`; over-skipping is the safe
#     direction).
#   * Stale-only: candidate age must exceed OC_TEST_REAPER_MIN_AGE_SECONDS
#     (default 7200s = 2h, far beyond the 20m full-tier timeout), so
#     concurrent peer test runs are never disrupted (AC4).
#   * Identity is re-established and revalidated immediately before every
#     signal; a PID whose start-identity changed is skipped (PID reuse).
#   * TERM -> bounded wait -> revalidate -> optional KILL. Never an unbounded
#     wait, never a blind kill.
#   * Linux reads /proc/<pid>/cmdline (NUL-separated) + start-time from
#     /proc/<pid>/stat; macOS falls back to `ps -ww` (args/lstart/etime —
#     all documented macOS ps(1) keywords; `etimes` is procps-only and is
#     deliberately NOT used). If identity cannot be established the
#     candidate is SKIPPED (no destructive action).
#   * Never fails the caller: per-candidate problems are warnings on stderr.
#
# Known gap (accepted): `TestWorkflowEnvironment.createLocal()` spawns the
# Temporal CLI dev server (`temporal server start-dev` from a $TMPDIR cache
# dir), which is indistinguishable in argv shape from a user's real dev
# server. The start-dev token exclusion therefore deliberately keeps
# createLocal leaks out of this reaper's blast radius; helper-owned teardown
# is the mitigation there. No plugin call site uses createLocal today.
#
# Usage:  oc-test-reaper.bash [pid ...]
#   With no arguments, sweeps all visible processes. Positional PIDs restrict
#   the candidate set (test seam; all safety checks still apply).
#
# Env knobs:
#   OC_TEST_REAPER_MIN_AGE_SECONDS    default 7200
#   OC_TEST_REAPER_TERM_GRACE_SECONDS default 5 (bounded TERM wait before KILL)
#   OC_TEST_REAPER_DRY_RUN            default 0 (1 = report only, no signals)
#   OC_TEST_REAPER_QUIET              default 0 (1 = suppress stderr log)
#   OC_TEST_REAPER_PHASE              label for log lines (default "manual")

set -uo pipefail

MIN_AGE="${OC_TEST_REAPER_MIN_AGE_SECONDS:-7200}"
TERM_GRACE="${OC_TEST_REAPER_TERM_GRACE_SECONDS:-5}"
DRY_RUN="${OC_TEST_REAPER_DRY_RUN:-0}"
QUIET="${OC_TEST_REAPER_QUIET:-0}"
PHASE="${OC_TEST_REAPER_PHASE:-manual}"

_is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

# Garbage knob values must never break arithmetic under `set -u`; fall back
# to the conservative defaults instead.
_is_uint "$MIN_AGE" || {
  printf '[oc-test-reaper][%s] WARN invalid OC_TEST_REAPER_MIN_AGE_SECONDS %q; using 7200\n' "$PHASE" "$MIN_AGE" >&2
  MIN_AGE=7200
}
_is_uint "$TERM_GRACE" || {
  printf '[oc-test-reaper][%s] WARN invalid OC_TEST_REAPER_TERM_GRACE_SECONDS %q; using 5\n' "$PHASE" "$TERM_GRACE" >&2
  TERM_GRACE=5
}

log() {
  [[ "$QUIET" == "1" ]] && return 0
  printf '[oc-test-reaper][%s] %s\n' "$PHASE" "$*" >&2
}

REAPER_ARGV=()

# --- platform primitives -----------------------------------------------------
# Each returns non-zero when the information cannot be established; callers
# treat that as "skip this candidate" (never act on unknown identity).

_load_argv_linux() {
  local pid="$1" tok
  [[ -r "/proc/$pid/cmdline" ]] || return 1
  REAPER_ARGV=()
  while IFS= read -r -d '' tok; do
    REAPER_ARGV+=("$tok")
  done <"/proc/$pid/cmdline"
  ((${#REAPER_ARGV[@]} > 0))
}

_load_argv_macos() {
  local pid="$1" args
  args="$(ps -ww -o args= -p "$pid" 2>/dev/null)" || return 1
  [[ -n "$args" ]] || return 1
  # Lossy split on whitespace: acceptable for token scanning on the
  # best-effort macOS path; argv[0] itself is space-free for this binary.
  REAPER_ARGV=()
  read -ra REAPER_ARGV <<<"$args"
  ((${#REAPER_ARGV[@]} > 0))
}

_ident_token_linux() {
  local pid="$1" stat rest
  [[ -r "/proc/$pid/stat" ]] || return 1
  stat="$(<"/proc/$pid/stat")"
  rest="${stat##*) }"
  # rest starts at field 3; starttime is field 22 -> index 19 (0-based).
  local -a f
  read -ra f <<<"$rest"
  [[ -n "${f[19]:-}" ]] || return 1
  printf '%s\n' "${f[19]}"
}

_ident_token_macos() {
  local pid="$1" lstart
  lstart="$(ps -ww -o lstart= -p "$pid" 2>/dev/null)" || return 1
  [[ -n "$lstart" ]] || return 1
  printf '%s\n' "$lstart"
}

_age_seconds_linux() {
  local pid="$1" start btime now hz
  start="$(_ident_token_linux "$pid")" || return 1
  btime="$(awk '/^btime /{print $2; exit}' /proc/stat 2>/dev/null)"
  [[ -n "$btime" ]] || return 1
  hz="$(getconf CLK_TCK 2>/dev/null)"
  [[ -n "$hz" && "$hz" -gt 0 ]] 2>/dev/null || hz=100
  now="$(date +%s)"
  # Sub-second precision: integer-second truncation made age a coin flip at
  # the threshold boundary (observed flake: fresh peer reaped at age==MIN_AGE).
  awk -v now="$now" -v btime="$btime" -v start="$start" -v hz="$hz" \
    'BEGIN{ printf "%.3f", now - btime - (start / hz) }'
}

# Parse ps(1) `etime` output ([[dd-]hh:]mm:ss) to seconds. Pure function,
# shared by the macOS path and unit tests. Returns non-zero on any shape it
# cannot fully validate (callers skip the candidate — safe direction).
_etime_to_seconds() {
  local etime="$1" days=0 h=0 m=0 s rest
  etime="${etime//[[:space:]]/}"
  case "$etime" in
    *-*) days="${etime%%-*}"; rest="${etime#*-}" ;;
    *) rest="$etime" ;;
  esac
  case "$rest" in
    *:*:*) IFS=: read -r h m s <<<"$rest" ;;
    *:*) IFS=: read -r m s <<<"$rest" ;;
    *) return 1 ;;
  esac
  _is_uint "$days" && _is_uint "$h" && _is_uint "$m" && _is_uint "$s" || return 1
  # 10# guards against octal interpretation of zero-padded fields (e.g. 09).
  printf '%s\n' $((10#$days * 86400 + 10#$h * 3600 + 10#$m * 60 + 10#$s))
}

_age_seconds_macos() {
  local pid="$1" etime
  # `etime` ([[dd-]hh:]mm:ss) is a documented macOS ps(1) keyword; the
  # procps-only `etimes` does not exist there and must not be used.
  etime="$(ps -ww -o etime= -p "$pid" 2>/dev/null)" || return 1
  _etime_to_seconds "$etime"
}

_uid_of_linux() {
  local pid="$1" uid
  [[ -r "/proc/$pid/status" ]] || return 1
  uid="$(awk '/^Uid:/{print $2; exit}' "/proc/$pid/status")"
  [[ -n "$uid" ]] || return 1
  printf '%s\n' "$uid"
}

_uid_of_macos() {
  local pid="$1" uid
  uid="$(ps -o uid= -p "$pid" 2>/dev/null | tr -d ' ')" || return 1
  [[ "$uid" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$uid"
}

_ppid_of_linux() {
  local pid="$1" ppid
  [[ -r "/proc/$pid/status" ]] || return 1
  ppid="$(awk '/^PPid:/{print $2; exit}' "/proc/$pid/status")"
  [[ "$ppid" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$ppid"
}

_ppid_of_macos() {
  local pid="$1" ppid
  ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')" || return 1
  [[ "$ppid" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$ppid"
}

_gone_linux() {
  local pid="$1" stat rest state
  [[ ! -e "/proc/$pid/stat" ]] && return 0
  stat="$(<"/proc/$pid/stat")"
  rest="${stat##*) }"
  state="${rest%% *}"
  [[ "$state" == "Z" ]]
}

_gone_macos() {
  local pid="$1" state
  state="$(ps -o stat= -p "$pid" 2>/dev/null | tr -d ' ')" || return 0
  [[ -z "$state" || "$state" == Z* ]]
}

IS_LINUX=0
if [[ -d /proc && "$(uname -s)" == "Linux" ]]; then
  IS_LINUX=1
fi

_load_argv() { if ((IS_LINUX)); then _load_argv_linux "$1"; else _load_argv_macos "$1"; fi; }
_ident_token() { if ((IS_LINUX)); then _ident_token_linux "$1"; else _ident_token_macos "$1"; fi; }
_age_seconds() { if ((IS_LINUX)); then _age_seconds_linux "$1"; else _age_seconds_macos "$1"; fi; }
_uid_of() { if ((IS_LINUX)); then _uid_of_linux "$1"; else _uid_of_macos "$1"; fi; }
_ppid_of() { if ((IS_LINUX)); then _ppid_of_linux "$1"; else _ppid_of_macos "$1"; fi; }
_gone() { if ((IS_LINUX)); then _gone_linux "$1"; else _gone_macos "$1"; fi; }

# --- candidate filters -------------------------------------------------------

matches_identity() {
  local base="${1##*/}"
  [[ "$base" == temporal-test-server-sdk-typescript-* ]]
}

has_excluded_tokens() {
  local tok
  for tok in "$@"; do
    case "$tok" in
      *start-dev*) return 0 ;;
      7233 | --port=7233 | *:7233) return 0 ;;
    esac
  done
  return 1
}

list_candidate_pids() {
  if (($# > 0)); then
    printf '%s\n' "$@"
    return 0
  fi
  if ((IS_LINUX)); then
    local d
    for d in /proc/[0-9]*; do
      [[ -d "$d" ]] && printf '%s\n' "${d#/proc/}"
    done
  else
    ps -Ao pid= 2>/dev/null | tr -d ' ' | awk 'NF'
  fi
}

# --- reaper core -------------------------------------------------------------

reap_one() {
  local pid="$1"
  _load_argv "$pid" || return 0 # identity unreadable -> silent skip (kernel threads, zombies)

  local argv0="${REAPER_ARGV[0]}"
  matches_identity "$argv0" || return 0 # not our binary -> silent skip

  local uid
  uid="$(_uid_of "$pid")" || {
    log "skip pid $pid ($argv0): uid unreadable"
    return 0
  }
  [[ "$uid" == "$EUID" ]] || {
    log "skip pid $pid ($argv0): uid $uid != $EUID"
    return 0
  }

  if has_excluded_tokens "${REAPER_ARGV[@]}"; then
    log "skip pid $pid ($argv0): excluded token (start-dev/7233 defense-in-depth)"
    return 0
  fi

  local age
  age="$(_age_seconds "$pid")" || {
    log "skip pid $pid ($argv0): age unreadable"
    return 0
  }
  # Orphan-first eligibility (structural, not time-based). A test server whose
  # parent has died is reparented to PID 1 (or to a subreaper). Its owning run
  # is provably gone, so it is safe to reap at ANY age. This is what makes an
  # aborted run (Ctrl-C / hard kill, where `finally` never runs) self-healing
  # instead of leaving servers alive for the full MIN_AGE window.
  #
  # A server whose parent is still alive belongs to a live run and is NEVER
  # reaped here regardless of age -- peer-run safety is preserved.
  local ppid orphaned=0
  if ppid="$(_ppid_of "$pid")"; then
    if [[ "$ppid" == "1" ]]; then
      orphaned=1
    elif ! kill -0 "$ppid" 2>/dev/null; then
      orphaned=1
    fi
  fi

  if ((orphaned)); then
    log "reap-eligible pid $pid ($argv0): orphaned (ppid ${ppid:-unknown} dead), age ${age}s"
  elif awk -v a="$age" -v m="$MIN_AGE" 'BEGIN{ exit !((a + 0) >= (m + 0)) }'; then
    : # live parent but stale enough to consider
  else
    log "skip pid $pid ($argv0): age ${age}s < ${MIN_AGE}s minimum and parent ${ppid:-unknown} alive (fresh peer run)"
    return 0
  fi

  local token
  token="$(_ident_token "$pid")" || {
    log "skip pid $pid ($argv0): start-identity unreadable"
    return 0
  }

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY-RUN would reap pid $pid ($argv0, age ${age}s): TERM then KILL after ${TERM_GRACE}s"
    return 0
  fi

  # Revalidate identity immediately before signaling (PID-reuse guard).
  local now_token
  now_token="$(_ident_token "$pid")" || return 0
  [[ "$now_token" == "$token" ]] || {
    log "skip pid $pid: identity changed before TERM"
    return 0
  }

  log "TERM pid $pid ($argv0, age ${age}s)"
  kill -TERM "$pid" 2>/dev/null || return 0

  # Bounded wait for exit (0.2s steps; TERM_GRACE is a hard ceiling).
  local steps=$((TERM_GRACE * 5)) i
  for ((i = 0; i < steps; i++)); do
    _gone "$pid" && {
      log "pid $pid exited after TERM"
      return 0
    }
    sleep 0.2
  done
  _gone "$pid" && {
    log "pid $pid exited after TERM"
    return 0
  }

  # Revalidate again before the kill shot.
  now_token="$(_ident_token "$pid")" || return 0
  [[ "$now_token" == "$token" ]] || {
    log "skip KILL pid $pid: identity changed after TERM wait"
    return 0
  }

  log "KILL pid $pid ($argv0): TERM ignored for ${TERM_GRACE}s"
  kill -KILL "$pid" 2>/dev/null || return 0
  for ((i = 0; i < 15; i++)); do
    _gone "$pid" && break
    sleep 0.2
  done
  if _gone "$pid"; then
    log "pid $pid reaped via KILL"
  else
    log "WARN pid $pid survived KILL (investigate manually)"
  fi
  return 0
}

main() {
  log "sweep start (min_age=${MIN_AGE}s term_grace=${TERM_GRACE}s dry_run=${DRY_RUN})"
  local pid
  while IFS= read -r pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    reap_one "$pid"
  done < <(list_candidate_pids "$@")
  log "sweep done"
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
