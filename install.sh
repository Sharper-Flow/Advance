#!/usr/bin/env bash
# Install the latest Advance GitHub Release by downloading the full release
# artifact, verifying its checksum, and delegating local sync to deploy-local.sh.

set -euo pipefail

REPO="Sharper-Flow/Advance"
BASE_URL="https://github.com/${REPO}"
TMP_DIR=""

log() {
	printf '==> %s\n' "$*"
}

die() {
	printf 'ERROR: %s\n' "$*" >&2
	exit 1
}

need_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		case "$1" in
		sha256sum) die "sha256sum not found. Install GNU coreutils, then rerun this installer." ;;
		*) die "$1 not found. Install it, then rerun this installer." ;;
		esac
	fi
}

validate_version() {
	if [[ ! "$1" =~ ^v[0-9]+[.][0-9]+[.][0-9]+([.-][A-Za-z0-9._-]+)?$ ]]; then
		die "Invalid release version: $1"
	fi
}

cleanup() {
	if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
		rm -rf "${TMP_DIR}"
	fi
}
trap cleanup EXIT

resolve_version() {
	if [ -n "${ADV_VERSION:-}" ]; then
		local requested
		case "${ADV_VERSION}" in
		v*) requested="${ADV_VERSION}" ;;
		*) requested="v${ADV_VERSION}" ;;
		esac
		validate_version "${requested}"
		printf '%s\n' "${requested}"
		return 0
	fi

	local latest_url effective_url tag
	latest_url="${BASE_URL}/releases/latest"
	effective_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "${latest_url}")" || {
		die "Could not resolve latest release from ${latest_url}"
	}
	tag="${effective_url##*/}"
	validate_version "${tag}"
	printf '%s\n' "${tag}"
}

validate_archive_paths() {
	local contents_file entry
	contents_file="${TMP_DIR}/archive.contents"
	tar -tzf "${ASSET}" >"${contents_file}" || die "Archive validation failed for ${ASSET}"
	while IFS= read -r entry; do
		case "${entry}" in
		"" | /* | .. | ../* | */../* | */..)
			die "Archive contains unsafe path: ${entry}"
			;;
		esac
	done <"${contents_file}"
}

for cmd in curl tar sha256sum mktemp bash; do
	need_cmd "${cmd}"
done

ADV_VERSION="$(resolve_version)"
ASSET="advance-${ADV_VERSION}.tar.gz"
DOWNLOAD_BASE="${BASE_URL}/releases/download/${ADV_VERSION}"

TMP_DIR="$(mktemp -d)"
[ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ] || die "mktemp failed"
cd "${TMP_DIR}"

log "Downloading Advance ${ADV_VERSION}"
curl -fsSLO "${DOWNLOAD_BASE}/${ASSET}" || die "Could not download ${ASSET}"
curl -fsSLO "${DOWNLOAD_BASE}/SHA256SUMS.txt" || die "Could not download SHA256SUMS.txt"

checksum_entry_found=false
while read -r checksum filename; do
	if [ -n "${checksum}" ] && { [ "${filename:-}" = "${ASSET}" ] || [ "${filename:-}" = "*${ASSET}" ]; }; then
		if [[ ! "${checksum}" =~ ^[0-9a-fA-F]{64}$ ]]; then
			die "Malformed checksum for ${ASSET}"
		fi
		checksum_entry_found=true
		break
	fi
done <SHA256SUMS.txt

if [ "${checksum_entry_found}" != true ]; then
	die "SHA256SUMS.txt does not contain ${ASSET}"
fi

log "Verifying checksum"
sha256sum --check --ignore-missing SHA256SUMS.txt || die "Checksum verification failed for ${ASSET}"

log "Validating archive"
validate_archive_paths

log "Extracting ${ASSET}"
tar -xzf "${ASSET}"

RELEASE_ROOT="${TMP_DIR}/advance-${ADV_VERSION}"
for required_path in \
	scripts/deploy-local.sh \
	plugin/dist/index.js \
	plugin/package.json \
	SETUP.md; do
	if [ ! -e "${RELEASE_ROOT}/${required_path}" ]; then
		die "Release artifact is incomplete: ${required_path} missing"
	fi
done

log "Installing Advance"
cd "${RELEASE_ROOT}"
bash scripts/deploy-local.sh --fix

log "Advance ${ADV_VERSION} installed"
