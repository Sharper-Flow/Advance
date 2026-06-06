## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |
| Source change | fixLiveAdvRows |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Proposal: Fix adv CLI deploy

## Cross-Project Origin

Originating project: toolbox
Originating change: fixLiveAdvRows
Reason: toolbox launcher selected-project ADV rows require the installed `adv` CLI on PATH to provide the reformed live Temporal-backed `adv status --json` behavior. Discovery found `/home/jon/.local/bin/adv` is an old disk-reading file, differs from `/home/jon/dev/advance/bin/adv`, and is not a symlink.

## Why

The Advance source CLI (`/home/jon/dev/advance/bin/adv`) now provides live Temporal-backed `adv status --json`, but the installed `/home/jon/.local/bin/adv` remains an older disk-projection reader that accepts `--top` and emits `schema_version: 1` stale-compatible rows. External consumers such as `warp-project-launcher` cannot rely on live status until the local deploy/check/install path makes the installed `adv` current or loudly reports drift.

## Problem Statement

The installed `adv` CLI on PATH can drift from the Advance source `bin/adv`, leaving users and launcher integrations on stale disk-backed status behavior even after `/adv-status` was reformed to be live Temporal-backed. Advance needs a source-owned deployment/check contract so `command -v adv` resolves to a live-compatible CLI or reports remediation instead of silently serving old disk state.

## What Changes

- Define the owner and mechanism for installing/updating `~/.local/bin/adv` from `~/dev/advance/bin/adv`.
- Ensure deploy/check detects stale installed CLI drift.
- Preserve source-first deployment; avoid ad-hoc symlink hacks unless explicitly chosen as the supported install mechanism.
- Add tests/docs for `adv status --json` live contract and local install drift remediation.

## Scope

### In Scope

- `scripts/deploy-local.sh` or installer docs/checks for `bin/adv` deployment.
- `bin/adv` status JSON contract tests if deploy behavior needs contract assertions.
- `SETUP.md` / relevant docs for supported CLI install path.
- Local drift check between source `bin/adv` and installed `adv`.

### Out of Scope

- Toolbox launcher implementation.
- Adding mutation authority to CLI.
- Changing `/adv-status` back to MCP fanout.

### Must Not

- Must not silently leave installed `adv` as an old disk-reader when deploy/check reports success.
- Must not make stale disk projections appear as current active rows.
- Must not hand-edit `/home/jon/.local/bin/adv` as the durable fix without source/deploy ownership.

## Success Criteria

1. A documented deploy/check path makes installed `adv` current with source `bin/adv` or reports exact drift remediation.
2. `adv status --json` from PATH uses live Temporal-backed status behavior after deploy.
3. Tests or static checks fail when source `bin/adv` and installed/deploy target drift in an unsupported way.
4. No CLI mutation subcommands are introduced.

## Discovery Agenda

1. Decide supported install mechanism: symlink, atomic copy, wrapper, or deploy-local managed binary.
2. Check interaction with active `addCliCommandBridges` changes before implementation.
3. Confirm release/install docs and local development hooks cover `bin/adv` changes.
