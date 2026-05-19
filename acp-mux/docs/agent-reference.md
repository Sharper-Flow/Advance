# Agent reference: Zed + OpenCode ACP

Use this as a checklist. Do not treat it as permanent truth; verify dynamically
against current docs, logs, and installed versions.

## Current evidence to re-check

- Zed supports external agents via Agent Client Protocol (ACP).
- OpenCode supports ACP via `opencode acp`.
- Current OpenCode docs say the ACP subprocess communicates with the editor over
  JSON-RPC via stdio.
- Zed docs point to `dev: open acp logs` for inspecting ACP payloads.
- Zed's ACP Registry is becoming the preferred external-agent distribution path;
  older Agent Server extensions may be deprecated later.
- OpenCode-in-Zed issues seen publicly include session history/list behavior and
  interactive tool/question rendering.

## Local invariants

- Launch through `acp-mux acp`, not direct `opencode acp`, when Zed needs
  isolated DB behavior.
- Launch-time DB selection cannot be done by an OpenCode server plugin.
- Expected ACP env from launcher:
  - `OPENCODE_CLIENT=acp`
  - `OPENCODE_DB=opencode.db`
  - `OPENCODE_DISABLE_CHANNEL_DB=1`
  - `XDG_DATA_HOME=$ACP_MUX_INSTANCES_ROOT/<instance-id>`
- Shared canonical resources are symlinked into each isolated instance:
  - `auth.json`, `plugins/`, `repos/`, `worktree/`, `snapshot/`, `db-backups/`
- New isolated instance DBs are seeded from canonical `opencode.db` when present
  to avoid historical `Session not found` failures.

## Before changing ACP behavior

1. Check installed OpenCode version and whether it is a release or local build.
2. Check active Zed remote server version.
3. Capture ACP logs from Zed with `dev: open acp logs`.
4. Confirm whether the defect is in:
   - Zed client behavior,
   - OpenCode ACP server behavior,
   - launcher/environment setup,
   - SQLite/session-store isolation,
   - or unsupported ACP capability.

## Useful commands

```bash
acp-mux doctor
acp-mux zed-config
acp-mux instances --all
acp-mux sync-db --dry-run --all
acp-mux thread-close --help              # see usage
acp-mux thread-close                     # close newest live instance
acp-mux thread-close --instance ID       # close specific instance
/home/jon/.opencode/bin/opencode --version
sqlite3 "$XDG_DATA_HOME/opencode/opencode.db" 'pragma integrity_check;'
```

## Thread-close (single-instance graceful shutdown)

`acp-mux thread-close [--instance ID] [--no-sync] [--no-archive] [--timeout SEC]`

One-shot orchestrator for closing an isolated instance cleanly. Designed
to be invoked from a Zed task bound to a keyboard shortcut (e.g.
`ctrl-shift-w`) so the user can archive the active thread without leaving
Zed.

Flow:

1. Resolve target instance from `--instance`, `$ACP_MUX_INSTANCE_ID`, or
   the newest live instance under `INSTANCES_ROOT`.
2. Run a one-shot sync from the instance DB to canonical so no sessions
   are stranded (skip with `--no-sync`).
3. Send `SIGTERM` to the instance PID. The acp-mux plugin's shutdown
   hook runs `PRAGMA wal_checkpoint(TRUNCATE)` here.
4. Wait up to `--timeout` seconds (default 5). If still alive, escalate
   to `SIGKILL`.
5. Move the instance dir to `$ACP_MUX_ARCHIVED_ROOT` (default
   `~/.local/share/acp-mux/archived/`) with a timestamp suffix, unless
   `--no-archive` is set.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | clean close (SIGTERM honored within timeout) |
| 1 | hard kill (SIGKILL needed) |
| 2 | unresolved instance (no `--instance`, no env, no live instance) |

Zed-side integration (personal config) lives separately — see
`~/toolbox/zed/` for the keymap and tasks.json that bind this command
to `ctrl-shift-w` plus the Zed `agent::ArchiveSelectedThread` action.

## DB sync behavior

`acp-mux sync-db` is additive and conservative:

- backs up canonical and target DBs before writes,
- copies canonical sessions into isolated DBs,
- copies isolated-only sessions back into canonical,
- copies canonical again so all synced DBs converge,
- does not delete rows.

Use `--dry-run` first when investigating unknown session-store state.

## Future work

- Rename `OPENCODE_ZED=1` (set by `plugin.js` `shell.env` hook) to
  `OPENCODE_ACP_CLIENT=zed`. This makes the architecture extensible for other
  ACP clients (Cursor, Neovim, VS Code Agent Mode) without renaming env vars
  later. A Cursor launcher would then set `OPENCODE_ACP_CLIENT=cursor`.
  Hold until a second ACP client actually exists.

## Zed-specific known issues

- **Memory leak per bash tool call** (zed-industries/zed#57099): Zed's
  `AcpThread` never removes `Terminal` objects from `self.terminals`. Each bash
  call leaks ~7 MB of alacritty scrollback. Long sessions with hundreds of bash
  calls will see Zed RSS grow significantly. Workaround: restart Zed periodically
  during heavy use. This is purely a Zed bug — nothing to fix on our side.

- **WSL agent discovery** (zed-industries/zed#56176): Zed reads the Windows-side
  `settings.json` for agent server config even when connected to a WSL project.
  This is why both settings files must specify `acp-mux` explicitly.

- **Dual `settings.json` maintenance**: Zed doesn't sync between WSL
  (`~/.config/zed/settings.json`) and Windows (`/mnt/c/Users/.../Zed/settings.json`).
  Any `agent_servers` change must be applied in both places manually. Change
  frequency is low (months), so automation is not worth the complexity.
