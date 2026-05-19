#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$root/bin/acp-mux"

bash -n "$bin"
"$bin" env >/dev/null
"$bin" doctor >/dev/null
"$bin" zed-config | grep -q '"command": "acp-mux"'
"$bin" install --dry-run | grep -q 'acp-mux'
"$bin" instances --all >/dev/null
"$bin" cleanup --dry-run >/dev/null

# thread-close with no live instance and an empty instances root should exit 2
tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT
out="$(ACP_MUX_INSTANCES_ROOT="$tmp_root" "$bin" thread-close 2>&1)" && rc=0 || rc=$?
if [[ "$rc" -ne 2 ]]; then
	echo "thread-close empty-root expected exit 2, got $rc" >&2
	echo "$out" >&2
	exit 1
fi
if ! grep -q "no live instance" <<<"$out"; then
	echo "thread-close empty-root: expected 'no live instance' in output" >&2
	echo "$out" >&2
	exit 1
fi

# thread-close --instance with unknown id should also exit 2 (instance dir not found)
out="$(ACP_MUX_INSTANCES_ROOT="$tmp_root" "$bin" thread-close --instance does-not-exist 2>&1)" && rc=0 || rc=$?
if [[ "$rc" -ne 2 ]]; then
	echo "thread-close missing-instance expected exit 2, got $rc" >&2
	echo "$out" >&2
	exit 1
fi

echo "ok"
