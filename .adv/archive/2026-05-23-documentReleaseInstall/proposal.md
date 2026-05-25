# Document Release Install

## Why

Advance had install docs for cloning source and running `scripts/deploy-local.sh --fix`, but no clear user path for downloading a GitHub Release. Existing release assets were shaped like plugin package/build files, while user installation needs repo-level sync assets such as `scripts/deploy-local.sh`, `.opencode/command`, agents, overlays, and skills.

## Scope

### In Scope

- Make GitHub Release downloads user-installable.
- Replace the plugin-only `advance-v*.tar.gz` artifact with a full installer payload.
- Add a latest-release installer that does not require per-version edits.
- Update `README.md` with one primary user install path.
- Update `SETUP.md` with user, manual release artifact, and maintainer/developer setup paths.
- Add deterministic verification that documented install commands match release artifact contents.
- Document troubleshooting for missing dependencies and incomplete artifacts.

### Out of Scope

- ADV runtime, gate, Temporal, or MCP tool behavior changes.
- npm, Homebrew, or other package-registry publishing.
- Claude Code distribution work.
- Detached release signing/cosign infrastructure.

## Success Criteria

1. GitHub Release asset `advance-v*.tar.gz` contains all assets required for user installation: plugin runtime, `scripts/deploy-local.sh`, `.opencode/command`, `.opencode/agents`, `.opencode/overlays`, `skills`, README/SETUP, and required root metadata.
2. Current plugin-only tarball shape is removed or renamed so users are not offered a misleading install artifact.
3. Latest-release installer exists and resolves the latest GitHub Release without per-version edits.
4. README presents one primary user install path using the release artifact/installer.
5. SETUP distinguishes user install from maintainer/developer setup.
6. Verification checks prove documented install commands match release artifact contents.
7. Failure/troubleshooting docs cover missing `jq`, `rsync`, `pnpm`, executable-bit issues, and incomplete artifact fallback.

## Constraints

- Documentation must match actual release artifact contents.
- Existing source clone setup must remain available for maintainers/developers.
- No runtime/gate/Temporal/tool behavior changes.
- No npm/Homebrew/registry publishing.
- Keep Claude Code distribution out of scope.
