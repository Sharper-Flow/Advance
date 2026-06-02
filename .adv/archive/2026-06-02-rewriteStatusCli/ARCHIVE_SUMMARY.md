# Archive: Rewrite status CLI

**Change ID:** rewriteStatusCli
**Archived:** 2026-06-02T18:41:02.938Z
**Created:** 2026-06-02T16:13:36.762Z

## Tasks Completed

- ✅ Add RED asset coverage for `/adv-status` CLI bridge
  > Task checkpoint completed
- ✅ Rewrite `/adv-status` as CLI shell-output bridge and sync command descriptions
  > Task checkpoint completed
- ✅ Add `rq-statusCliBridge01` spec law for status CLI bridge
  > Updated `.adv/specs/advance-meta/spec.json` to version 1.13.0 with `rq-statusCliBridge01`. Requirement makes `/adv-status` default command template a thin `adv status --no-color` shell-output bridge, forbids default ADV MCP fanout/heavy synthesis, and preserves explicit opt-in diagnostics. Verification passed with a Node JSON/requirement check and `pnpm run schemas:check`.
- ✅ Run targeted verification for status CLI bridge
  > Ran final verification for AC1-AC7/SC1-SC4. Targeted asset/drift tests passed through repo-local `bin/oc-test`, CLI smoke produced table plus counts, schema check passed, and static no-`bin/adv`-diff check confirmed no `--health`/`--json` flag changes were introduced.

## Specs Modified

