# Executive Summary

## Outcome

Delivered a hidden ADV `adv-temporal-repair` specialist plus tool, prompt, documentation, and test support to classify Temporal/session-pointer/artifact phantom complaints safely through ADV tools. Acceptance review verdict is APPROVED/READY with no blocking or nonblocking findings after one small review remediation clarifying conformance guidance.

## Verdict

APPROVED

## What Was Built

1. Added `.opencode/agents/adv-temporal-repair.md` as a hidden classifier-first subagent with no nested delegation, no direct ADV state-path reads, and primary-ADV ownership for repair authority.
2. Wired primary ADV routing and packet anchors for Temporal/session-pointer/artifact phantom triage in `.opencode/agents/adv.md`, `ADV_INSTRUCTIONS.md`, and deployment prompt tests.
3. Narrowed `adv_temporal_diagnose` description to actual classifier output and exposed `serverServiceable` with tests.
4. Documented phantom-pointer/artifact recovery decision tree and OpenCode restart vs worker-restart boundary in `docs/temporal-recovery.md`.
5. Added bounded `adv_change_show include.artifactOnly` support for artifact-only readback without exposing unreadable phantom paths.
6. Added/updated asset and tool tests covering the specialist, state-access policy, docs anchors, diagnose envelope, routing markers, and artifact-only behavior.
7. Applied review remediation commit `f73c3584`: clarified that `adv-temporal-repair` asks primary ADV to run `adv_conformance action: "status"` if needed, instead of implying direct conformance-tool ownership.

## What Was Verified

- Verdict: APPROVED/READY with 0 blockers, 0 issues, 0 suggestions, 0 nits.
- Tests: targeted changed-surface suite passed (6 files, 161 tests); `pnpm run schemas:check` passed; `./bin/oc-test smoke` passed after formatting remediation; reviewer reran targeted suite (5 files, 156 tests) after review remediation.
- Preview URL: not_applicable — agreement declares `visual_surface:false`; implementation touches ADV agents, tool code, docs, and tests, not browser-visible output.
- Contract matrix: 25 required rows passed/respected; 0 failed, violated, unknown, or missing rows.

## Remaining Concerns

Live OpenCode sessions need `pnpm run build`, `./scripts/deploy-local.sh --fix`, and OpenCode restart before the new specialist/tool/prompt behavior is visible in deployed runtime sessions.