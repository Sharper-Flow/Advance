# Archive: Reduce agent session context floor

**Change ID:** reduceAgentSessionContextFloor
**Archived:** 2026-08-11T18:50:04.229Z
**Created:** 2026-08-11T08:21:52.005Z

## Tasks Completed

- ✅ Add per-agent permission.skill deny globs to 7 ADV agent manifests to remove 11 structurally irrelevant Cloudflare/Workers skills from the rendered catalog.
- ✅ Delete proven-safe duplicated sections from agent manifests: ## Local Code Exploration Priority (5 files: adv, adv-engineer, adv-designer, adv-reviewer, adv-researcher) and ## Editing Tool Priority (4 files: adv, adv-engineer, adv-designer, adv-reviewer).
- ✅ Create plugin/scripts/check-prompt-budget.ts — a structural gate measuring the eager per-session instruction floor, failing on regression.
- ✅ Move the sign-off Change Report skeleton and Output Contract handoff template from .opencode/agents/adv.md to .opencode/command/adv-archive.md.
- ✅ Write the canonical ADV State Access Policy as a new always-on instruction file and register it in instructions[].
- ✅ Delete the dead .opencode/token-budgets.json file.
- ✅ Truncate rules.yaml to first-sentence enforcement core; move scope: and remaining rationale prose to a new adv-rule-rationale skill body.
- ✅ Convert 4 runbook instruction files to routing stubs + lazy skill bodies (conservative depth).
- ✅ Extend plugin/src/manifest-doc-drift.test.ts with pointer-integrity and load-class assertions.
- ✅ Delete the ## ADV State Access Policy section from 6 agent manifests after the canonical adv-state-access.md is registered.
- ✅ Sync all config-home instruction changes to the git-tracked toolbox backup mirror.

## Specs Modified

- **advance-meta**: 1 delta(s)
