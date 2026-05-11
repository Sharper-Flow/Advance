# Problem Statement

## Why

Post-Temporal-cutover follow-up has been substantial: recent roadmap refresh removed a large set of closed bugs, housekeeping cleared stale agenda items tied to closed issues, and project wisdom shows repeated fixes around Temporal workflows, cache refresh, worker health, gate staleness, and validation. As the only current user/maintainer, the valuable next step is not an external stability scoreboard; it is a wide, evidence-backed audit of what still needs cleanup and optimization across the ADV system.

## Desired Outcome

Produce a broad system audit across code quality, architecture, performance, and DX/agent UX. Apply safe local cleanup directly. Convert larger findings into actionable follow-up issues or agenda items with priorities/WSJF suggestions, while avoiding duplicate backlog entries and avoiding broad behavior changes inside the audit change itself.

## Success Criteria

1. Audit covers full repo surface: implementation, command contracts, agents/skills, specs, docs, scripts, CI, and tests.
2. Findings are evidence-backed with concrete references: file paths, issue numbers, command outputs, spec IDs, wisdom/reflection entries, or source URLs.
3. Findings are categorized across code quality, architecture, performance, and DX/agent UX.
4. Safe local cleanup is applied directly when low-risk and verified.
5. Larger or behavior-changing findings are filed as follow-up work with clear scope and priority/WSJF suggestions.
6. Existing backlog items are reconciled so the audit does not create duplicates for already-tracked work.
7. Repo-defined verification passes for touched files before acceptance.

## Non-Goals

- Replace Temporal.
- Build an external stability dashboard or weekly stabilization scoreboard.
- Cut a release.
- Make broad behavior changes inside the audit change without separate approval.