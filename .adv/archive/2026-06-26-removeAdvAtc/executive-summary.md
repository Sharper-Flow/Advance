# Executive Summary

## Outcome

`adv-atc` has been fully removed as a supported Advance entry point. The interactive `adv` lifecycle, remaining primary-agent safety checks, ADV sub-agents, deploy-local sync, and non-secret dotfile backup path remain intact.

## Verdict

APPROVED

## What Was Built

1. Removed ATC runtime surfaces: deleted `.opencode/agents/adv-atc.md`, `.opencode/command/adv-atc.md`, removed `COMMAND_MANIFEST['adv-atc']`, deleted ATC-only asset tests, and updated manifest/delegation tests to assert ATC absence while preserving primary-agent spawn bans for `adv`, `plan`, and `build`.
2. Removed current-support ATC docs/specs: cleaned ADV instructions, README, AGENTS quick reference, CLI surface matrix, advance-workflow, advance-meta, and delegation-defaults specs/docs while preserving only historical changelog references and absence assertions.
3. Updated deploy-local stale cleanup: removed ATC-specific drift/legacy cleanup code and test coverage now proves generic stale `adv-*.md` command/agent cleanup removes retired ATC assets.
4. Completed final verification and review remediation: reviewer found and fixed one remaining current-support spec mention in `.adv/specs/delegation-defaults/spec.json`; final checkpoint `70ad2ee2d8c09873b07410330749e4ffc82aa4c3` is clean.

## What Was Verified

- Verdict: APPROVED / READY with no unresolved blockers or issues.
- Tests: targeted runtime/docs/deploy/delegation/spec suites passed; post-review targeted suite passed (158 tests); `pnpm run check` passed; `bin/oc-test full` passed; `pnpm run build` passed.
- Deployment: `./scripts/deploy-local.sh --fix` passed; `./scripts/deploy-local.sh --check` passed; global and backup `adv-atc.md` absence checks passed.
- Preview URL: not_applicable — no front-end, browser-visible, or visual-output work; this is source/runtime/docs/deploy cleanup only.
- Contract matrix: 19/19 required rows passed/respected; 0 failed, violated, unknown, or missing.

## Remaining Concerns

None for acceptance. OpenCode sessions must be restarted before relying on refreshed runtime assets loaded from the deployed plugin copy.