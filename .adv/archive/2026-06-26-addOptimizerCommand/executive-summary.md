# Executive Summary: Add optimizer command

Added `/adv-optimizer` as a read-only ADV utility command for evidence-backed code simplification proposals.

## What Changed
- New command contract: `.opencode/command/adv-optimizer.md`.
- Manifest registration: `adv-optimizer` as a utility command with no gate and no change-id requirement.
- Documentation rows in README and `ADV_INSTRUCTIONS.md`.
- CLI surface matrix row marking the command as agent-workflow-only.
- New structural asset tests for optimizer command safety and output boundaries.
- Manifest/doc drift tests updated via command count/list alignment.

## Verified Outcomes
- Command exists and is registered.
- Command is read-only: no code edits, ADV mutations, agenda/task creation, automatic deletion, CLI runner, or dedicated optimizer agent.
- Command enforces first-level scanner delegation only.
- Command requires source-backed findings and separates actionable, user-review, and low-confidence recommendations.
- Command emits an `OPTIMIZER PROPOSAL` shape with current state, ranked opportunities, long-term direction, risks, non-goals, and next ADV command.

## Verification
- RED: optimizer asset test failed before command existed.
- GREEN/final: targeted Vitest suite passed: 66 tests across optimizer assets, manifest, manifest-doc drift, and CLI surface matrix.
- Static boundary check passed: no optimizer agent, no `bin/adv optimizer`, no ADV mutation tool names in optimizer command.
- Post-review cleanup passed: 24 targeted tests after removing duplicate state-mutation line.
- Independent reviewer final verdict: READY.
