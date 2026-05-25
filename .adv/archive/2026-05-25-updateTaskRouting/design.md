## Design
- Update `.opencode/command/adv-task.md` with a required Spec-Law Impact Assessment phase before task generation.
- Update `.opencode/agents/adv.md` start-change routing to choose `/adv-task` for small, well-understood durable changes that still need tracking.
- Update `ADV_INSTRUCTIONS.md` command summary/boundary to mirror routing.
- Add capability law to `.adv/specs/advance-workflow/spec.json` plus docs mirror.
- Extend asset tests near `adv-problem-assets.test.ts` (or new co-located asset test) to assert command, agent, and spec coverage.