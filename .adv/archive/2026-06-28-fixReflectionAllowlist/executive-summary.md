# Executive Summary

## Outcome

Fixed local deploy drift by adding `adv_reflection_list` to the ADV runtime agent allowlist, rebuilt, redeployed locally, pushed to `origin/trunk`, and verified sync.

## What Was Built

- Added `adv_reflection_list: true` under the Reflection tool allowlist in `.opencode/agents/adv.md`.

## What Was Verified

- `pnpm run build` passed.
- `./scripts/deploy-local.sh --fix` completed.
- `./scripts/deploy-local.sh --check` passed with tool drift clean: 71 tools.
- `adv status --json` reported `live=true`, `stale=false`.
- `git fetch origin trunk` + `origin/trunk...HEAD` reported `0 0`.
- Pushed commit: `829e94c2855f54250cacfb0ed7aabec854c69c27`.

## Remaining Concerns

None for this change. Restart OpenCode sessions to load deployed runtime changes.