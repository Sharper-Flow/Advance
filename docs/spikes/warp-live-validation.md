# Warp live validation — fixWorktreeSessionRoot

Date: 2026-05-20

## Build under test

- OpenCode: `1.15.5`
- Plugin worktree: `/home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeSessionRoot/plugin`
- Source HEAD before validation fix commit: `f8ebc1cc15760ff1e30a51cc3e118532edea92a4`
- Build command: `pnpm run build` — passed after wiring `adv_worktree_create` through runtime session context.
- Validation config: `XDG_CONFIG_HOME=/tmp/opencode/adv-live-validation/config`, plugin path set to the worktree plugin.

## Scenario 1 — flag enabled / warp path

Command shape:

```text
XDG_CONFIG_HOME=/tmp/opencode/adv-live-validation/config \
OPENCODE_EXPERIMENTAL_WORKSPACES=true \
opencode serve --port 49233 --hostname 127.0.0.1 --print-logs --log-level INFO

XDG_CONFIG_HOME=/tmp/opencode/adv-live-validation/config \
OPENCODE_EXPERIMENTAL_WORKSPACES=true \
opencode run --attach http://127.0.0.1:49233 --dir /home/jon/dev/repos/advance \
  --format json --agent adv --model openai/gpt-5.5 \
  "Call the adv_worktree_create tool exactly once with branch feature/smoke-warp-live-1779286285, base trunk, force false."
```

Relevant output:

```json
{
  "session": {
    "id": "ses_1ba45d8d1ffeg7HW6xSVgiTtzT",
    "workspaceID": "wrk_e45ba3bcf001rBRnCen82BXHoP",
    "directory": "/home/jon/dev/repos/advance"
  },
  "workspace": {
    "id": "wrk_e45ba3bcf001rBRnCen82BXHoP",
    "type": "adv-worktree",
    "branch": "feature/smoke-warp-live-1779286285",
    "directory": "/home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/feature/smoke-warp-live-1779286285",
    "extra": {
      "directory": "/home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/feature/smoke-warp-live-1779286285",
      "branch": "feature/smoke-warp-live-1779286285"
    }
  },
  "tool": {
    "name": "adv_worktree_create",
    "output": {
      "ok": true,
      "mode": "warp",
      "workspaceID": "wrk_e45ba3bcf001rBRnCen82BXHoP",
      "path": "/home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/feature/smoke-warp-live-1779286285",
      "message": "Session warped to workspace. Subsequent tool calls operate with the worktree as the project root — no per-tool workdir override needed."
    }
  },
  "cleanup": {
    "tool": "adv_worktree_delete",
    "force": true,
    "ok": true
  }
}
```

Result: PASS.

## Scenario 2 — flag disabled / graceful downgrade

Command shape:

```text
XDG_CONFIG_HOME=/tmp/opencode/adv-live-validation/config \
opencode serve --port 49234 --hostname 127.0.0.1 --print-logs --log-level INFO

XDG_CONFIG_HOME=/tmp/opencode/adv-live-validation/config \
opencode run --attach http://127.0.0.1:49234 --dir /home/jon/dev/repos/advance \
  --format json --agent adv --model openai/gpt-5.5 \
  "Call the adv_worktree_create tool exactly once with branch feature/smoke-downgrade-live-1779286326, base trunk, force false."
```

Relevant output:

```json
{
  "session": {
    "id": "ses_1ba453a19ffeOvSagHqC00hPCJ",
    "workspaceID": null,
    "directory": "/home/jon/dev/repos/advance"
  },
  "workspaceList": [],
  "warningCountContaining_OPENCODE_EXPERIMENTAL_WORKSPACES": 1,
  "tool": {
    "name": "adv_worktree_create",
    "output": {
      "ok": true,
      "mode": "terminal",
      "workdir": "/home/jon/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/feature/smoke-downgrade-live-1779286326",
      "warning": "mode:warp unavailable because OpenCode workspace sync is not enabled. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true (or OPENCODE_EXPERIMENTAL=true) and restart OpenCode to enable workspace warp; falling back to mode:terminal."
    }
  },
  "cleanup": {
    "tool": "adv_worktree_delete",
    "force": true,
    "ok": true
  }
}
```

Result: PASS. The terminal-mode path did not call `/experimental/workspace`; the only workspace-related signal was the single downgrade warning.

## Acceptance-criteria mapping

| AC | Evidence |
|---|---|
| Worktree root via native OpenCode workspace | Scenario 1 session has `workspaceID`; workspace directory equals ADV worktree path. |
| Project-relative file-tool root | Inferred from OpenCode workspace routing after warp; not directly exercised with a write in this smoke test. |
| Permission/LSP/formatter root follows workspace | Inferred from same workspace routing invariant; unit coverage verifies adapter `target.directory`. |
| XDG storage preserved | Both scenarios used `/home/jon/.local/share/opencode/worktree/{project-id}/...`. |
| Graceful fallback | Scenario 2 produced `mode:"terminal"`, `workdir`, no `workspaceID`, empty workspace list, and one warning. |
| Regression coverage | Added unit coverage for `adv_worktree_create` warp and flag-disabled downgrade; live smoke confirms registry tool wiring. |

## Deviations

- Smoke branches used `feature/*` instead of `change/*` to avoid creating throwaway ADV change workflows.
- File create/edit display and LSP/formatter behavior were not directly mutated in the smoke run; validation relied on the OpenCode workspace routing invariant plus existing adapter tests.
