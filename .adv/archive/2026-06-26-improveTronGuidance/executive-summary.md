# Executive Summary — Improve Tron Guidance

Implemented `/adv-tron` guidance improvements across the command, repo-local agent, and reusable skill. Tron now has explicit startup instructions to gather working-directory/project/ADV context and repo tree/outline before deep reads; bounded broad/scoped scan flows; degraded-tool handling; and a follow-up routing matrix for `/adv-optimizer`, `/adv-slop-scan`, `/adv-arch-scan`, `/adv-proposal`, `/adv-task`, deeper `/adv-tron`, and optional `/adv-audit` for explicit spec-vs-implementation drift.

Added deterministic asset tests that pin the new guidance across all three surfaces, assert combo routing examples, require unsupported signals to become gaps/open questions, preserve existing TRON_REPORT handoff anchors, and structurally assert the Tron agent remains read-only except for `adv_subagent_report_submit`.

Verification passed:
- `bin/oc-test targeted -- src/adv-tron-assets.test.ts src/optimized-handoff-assets.test.ts src/skill-loading-policy-assets.test.ts` — 3 files, 19 tests passed.
- `pnpm run format:check` — passed.
- `git diff --check trunk...HEAD` — clean.

Note: these are OpenCode command/agent/skill config-time assets; live use requires deploying/syncing assets and restarting OpenCode to pick up the changed prompts.