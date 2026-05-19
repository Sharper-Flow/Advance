# acp-mux

Local OpenCode/Zed ACP companion: per-instance launcher, agent-callable tools,
runtime plugin hooks, and bidirectional session-store sync.

## Why a launcher AND a plugin?

OpenCode picks its SQLite DB path before any server plugin loads, so DB
isolation has to happen at launch in the process environment. The plugin can't
fix that on its own.

| Layer | What it does |
|---|---|
| `bin/acp-mux` | The launcher binary. Sets `XDG_DATA_HOME` per instance, seeds the new DB from canonical, symlinks shared state, then `exec`s `opencode acp`. Also provides `doctor`, `instances`, `sync-db`, `cleanup`, `install`, `zed-config`, `env` subcommands. |
| `plugin.js` | Runtime plugin loaded by OpenCode. Surfaces multi-instance state to agents via tools (`acp_mux_instance_info`, `acp_mux_concurrent_sessions`, `acp_mux_sync_db`, `acp_mux_doctor`, `acp_mux_instances`), forwards `OPENCODE_CLIENT=acp` into child shells, and runs `PRAGMA wal_checkpoint(TRUNCATE)` on session end / SIGTERM / SIGINT / beforeExit. |

## Install

```bash
/home/jon/toolbox/plugins/acp-mux/bin/acp-mux install
```

This symlinks the launcher into `~/.local/bin/acp-mux`. Then register the
plugin in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": [
    "/home/jon/toolbox/plugins/acp-mux/plugin.js"
  ]
}
```

Then restart Zed/OpenCode ACP.

## Zed configuration

```jsonc
{
  "agent_servers": {
    "OpenCode": {
      "type": "custom",
      "command": "acp-mux",
      "args": ["acp"],
      "env": {
        "PATH": "/home/jon/.local/bin:/home/jon/.opencode/bin:/home/jon/.bun/bin:/home/jon/.cargo/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin",
        "SHELL": "/usr/bin/zsh",
        "COLORTERM": "truecolor"
      }
    }
  }
}
```

Use `acp-mux zed-config` to print this snippet.

## Storage layout

```
~/.local/share/opencode/                         <- canonical / master
├── opencode.db                                  <- master sessions
├── auth.json                                    <- shared (symlinked)
├── plugins/                                     <- shared (symlinked; ADV state)
├── repos/                                       <- shared (symlinked)
├── worktree/                                    <- shared (symlinked)
├── snapshot/                                    <- shared (symlinked)
└── db-backups/                                  <- shared (symlinked)

~/.local/share/acp-mux/instances/<id>/opencode/
├── opencode.db                                  <- isolated (seeded from canonical)
├── log/                                         <- isolated
├── tool-output/                                 <- isolated
├── storage/                                     <- isolated
├── .instance.json                               <- stamp (id, pid, cwd, started_at)
└── auth.json/plugins/repos/worktree/...         <- symlinks to canonical
```

Legacy instance root `~/.local/share/opencode-instances/` (from pre-rename
sessions) is still scanned by `instances`, `sync-db`, and `cleanup`.

## Useful commands

```bash
acp-mux doctor
acp-mux instances --all
acp-mux sync-db --dry-run --all
acp-mux sync-db --live           # bidirectional, live instances only
acp-mux cleanup --dry-run
acp-mux env
```

`sync-db` is conservative:

- backs up canonical and target DBs before any write,
- runs `INSERT OR IGNORE` in three passes (canon → target → canon → target),
- never deletes rows.

## Tools surfaced to agents

| Tool | Purpose |
|---|---|
| `acp_mux_instance_info` | Current instance, DB paths, ACP runtime flag, launcher state |
| `acp_mux_concurrent_sessions` | List other live instances, optionally filtered to current project, scans both roots |
| `acp_mux_sync_db` | Wraps `acp-mux sync-db`; dry-run by default |
| `acp_mux_doctor` | Wraps `acp-mux doctor` |
| `acp_mux_instances` | Wraps `acp-mux instances` |

## Environment knobs

| Var | Effect |
|---|---|
| `ACP_MUX_INSTANCE_ID` | Set by launcher; reused if pre-set to enable resume |
| `ACP_MUX_INSTANCES_ROOT` | Override instances root |
| `OPENCODE_LEGACY_INSTANCES_ROOT` | Override legacy instances root |
| `ACP_MUX_SEED_DB` | `0` to skip DB seed from canonical (default `1`) |
| `ACP_MUX_SYNC_LEGACY` | `0` to skip legacy root in sync (default `1`) |
| `OPENCODE_CLIENT=acp` | Set by launcher; forwarded into child shells |
| `ACP_MUX_QUIET=1` | Silence boot + warn logs |
| `ACP_MUX_DEBUG=1` | Verbose internal events |
| `ACP_MUX_BIN` | Override launcher path (default `~/.local/bin/acp-mux`) |
| `OPENCODE_MASTER_DATA` | Override canonical data dir |
| `OPENCODE_BIN` | Override real opencode binary path |

## Tests

```bash
cd /home/jon/toolbox/plugins/acp-mux
npm test                # smoke.sh + unit tests
npm run test:unit       # node --test test/*.test.js
npm run test:smoke      # bash test/smoke.sh
npm run lint            # node --check on JS files
```

## Provenance

This is the Zed-era replacement for the unbuilt portions of
`Sharper-Flow/Opencode-Advance`:

- `docs/proposals/2026-05-03-session-and-resource-architecture.md` §10.2
  flagged "session DB single-writer contention" — closed here via per-instance
  isolation + WAL checkpoint hygiene.
- `docs/proposals/2026-05-03-pattern-b-session-topology.md` (issue `#23`)
  proposed a tmux session-per-project layout — superseded by Zed window
  management.
- `docs/proposals/2026-05-03-graceful-hibernation.md` proposed
  `opencode --session <id>` cold resume — covered by `sync-db` plus
  bypass-via-canonical (`opencode --session <id>` against master).

Tmux-specific OCA pieces (status decode, resurrect, dashboard) are
intentionally not ported — Zed owns window/session management now.

## Upstream context (`anomalyco/opencode`)

| Issue | Why it matters |
|---|---|
| `#21215` | `busy_timeout=0` silently hangs concurrent sessions — root cause |
| `#20935` | Per-session-tree DB sharding (proper upstream fix; not merged) |
| `#22429` | Bun SQLite mmap maps entire DB into address space |
| `#14970` | NFS DB corruption; validates the `XDG_DATA_HOME` shard pattern |
| `#28123` | Zed editor-context polling freezes TUI (not relevant on WSL-Remote) |
| `#24785` | Per-project DB feature request (aligned with our direction) |
