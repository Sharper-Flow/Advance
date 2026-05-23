# Warp live validation — fixWorktreeSessionRoot

Date: 2026-05-20

## Build under test

- OpenCode: `1.15.5`
- Plugin worktree: `/home/dev/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/fixWorktreeSessionRoot/plugin`
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
opencode run --attach http://127.0.0.1:49233 --dir /home/dev/dev/repos/advance \
  --format json --agent adv --model openai/gpt-5.5 \
  "Call the adv_worktree_create tool exactly once with branch feature/smoke-warp-live-1779286285, base trunk, force false."
```

Relevant output:

```json
{
  "session": {
    "id": "ses_1ba45d8d1ffeg7HW6xSVgiTtzT",
    "workspaceID": "wrk_e45ba3bcf001rBRnCen82BXHoP",
    "directory": "/home/dev/dev/repos/advance"
  },
  "workspace": {
    "id": "wrk_e45ba3bcf001rBRnCen82BXHoP",
    "type": "adv-worktree",
    "branch": "feature/smoke-warp-live-1779286285",
    "directory": "/home/dev/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/feature/smoke-warp-live-1779286285",
    "extra": {
      "directory": "/home/dev/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/feature/smoke-warp-live-1779286285",
      "branch": "feature/smoke-warp-live-1779286285"
    }
  },
  "tool": {
    "name": "adv_worktree_create",
    "output": {
      "ok": true,
      "mode": "warp",
      "workspaceID": "wrk_e45ba3bcf001rBRnCen82BXHoP",
      "path": "/home/dev/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/feature/smoke-warp-live-1779286285",
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
opencode run --attach http://127.0.0.1:49234 --dir /home/dev/dev/repos/advance \
  --format json --agent adv --model openai/gpt-5.5 \
  "Call the adv_worktree_create tool exactly once with branch feature/smoke-downgrade-live-1779286326, base trunk, force false."
```

Relevant output:

```json
{
  "session": {
    "id": "ses_1ba453a19ffeOvSagHqC00hPCJ",
    "workspaceID": null,
    "directory": "/home/dev/dev/repos/advance"
  },
  "workspaceList": [],
  "warningCountContaining_OPENCODE_EXPERIMENTAL_WORKSPACES": 1,
  "tool": {
    "name": "adv_worktree_create",
    "output": {
      "ok": true,
      "mode": "terminal",
      "workdir": "/home/dev/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/feature/smoke-downgrade-live-1779286326",
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
| XDG storage preserved | Both scenarios used `/home/dev/.local/share/opencode/worktree/{project-id}/...`. |
| Graceful fallback | Scenario 2 produced `mode:"terminal"`, `workdir`, no `workspaceID`, empty workspace list, and one warning. |
| Regression coverage | Added unit coverage for `adv_worktree_create` warp and flag-disabled downgrade; live smoke confirms registry tool wiring. |

## Deviations

- Smoke branches used `feature/*` instead of `change/*` to avoid creating throwaway ADV change workflows.
- File create/edit display and LSP/formatter behavior were not directly mutated in the smoke run; validation relied on the OpenCode workspace routing invariant plus existing adapter tests.

## Revised methodology — fresh standalone session (no `--attach --dir`)

The original 2026-05-20 methodology used `opencode run --attach --dir <repo>` for both happy-path and downgrade scenarios. The `--dir` flag pins a consistent directory header into the request context, which masks the bug fixed by change `fixWarpSessionLookup`: raw fetch to `GET /session/:id` without `x-opencode-directory` causes OpenCode's `Instance.project.id` resolution to drift away from the session's storage namespace, returning 404 and silently downgrading to `mode:terminal`.

### Required additional scenario

1. Start OpenCode WITHOUT `--attach --dir`:

   ```bash
   OPENCODE_EXPERIMENTAL_WORKSPACES=true opencode
   ```

2. From the fresh session, invoke:

   ```
   adv_worktree_create branch: "test/warp-fresh-session"
   ```

3. **Expected outcome (post-fix):** tool output contains `"mode":"warp"` and a `workspaceID`. No `downgrade_reason` field. No `warning` mentioning lookup failure.

4. **If output shows `"mode":"terminal"` with `"downgrade_reason":{"kind":"lookup_failed"}`:** the fix has regressed. Inspect OpenCode server logs for the actual 404 path, then check:
   - `input.client` is threaded correctly through `tool-registry.ts` to the `adv_worktree_create` runtime (rq-warpModeContract06).
   - `getSessionWorkspaceID` in `plugin/src/utils/workspace-warp.ts` is calling `client.session.get`, not raw `fetch(...)` (rq-warpModeContract04).
   - The v1 SDK client was constructed with the correct `directory` (so its default `x-opencode-directory` header is attached automatically).

5. **Additional check:** confirm the existing `--attach --dir` scenario continues to work (no regression):

   ```bash
   OPENCODE_EXPERIMENTAL_WORKSPACES=true opencode run --attach --dir <repo>
   ```

   Expected: same `"mode":"warp"` with `workspaceID`. The `--dir` scenario should also continue to pass — the fix makes lookup robust across both forms.

### Why this scenario matters

OpenCode resolves `Instance.project.id` from `x-opencode-directory` (or `?directory=` query param). When the header is absent (or present but encoded for a different directory than the session's storage namespace), `GET /session/:id` resolves against the wrong project namespace and returns 404. The `--attach --dir` flag inadvertently pinned a consistent directory header into the OpenCode CLI's outgoing requests, masking the missing-header bug in the raw-fetch path used by the warp pre-check.

### Reference

- ADV change `fixWarpSessionLookup` (archive: TBD — back-filled at archive time)
- Spec law `worktree-warp-mode` requirements `rq-warpModeContract04` (SDK-routed session lookup) and `rq-warpModeContract05` (`x-opencode-directory` header on workspace endpoints)
- Upstream OpenCode issues describing the same failure shape: opencode#8538, opencode#7149, opencode#14595, opencode#3551
